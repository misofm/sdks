import { describe, expect, test } from "bun:test"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Inspectable from "effect/Inspectable"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientError from "effect/unstable/http/HttpClientError"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as Stream from "effect/Stream"
import * as Tracer from "effect/Tracer"

import { Bridge, bridgeFetchLayer, bridgeLayer, type BridgeClient } from "../src/Bridge.js"
import { BridgeConfigurationError, BridgeHttpError, BridgeSchemaError, BridgeTimeoutError, BridgeTransportError } from "../src/Errors.js"
import type { BridgeConfig } from "../src/Config.js"

interface RecordedCall {
	readonly request: HttpClientRequest.HttpClientRequest
	readonly url: URL
	readonly signal: AbortSignal
}

const apiKey = Redacted.make("sk-test-bridge-secret")

const config = (overrides: Partial<BridgeConfig> = {}): BridgeConfig => ({
	apiKey,
	baseUrl: "https://bridge.test/v0",
	...overrides
})

const mockHttpClient = (
	calls: Array<RecordedCall>,
	options: { readonly status?: number; readonly body?: string | Uint8Array | null; readonly headers?: Record<string, string> } = {}
): HttpClient.HttpClient =>
	HttpClient.make((request, url, signal) => {
		calls.push({ request, url, signal })
		return Effect.succeed(HttpClientResponse.fromWeb(
			request,
			new Response(options.body ?? null, {
				status: options.status ?? 200,
				...(options.headers === undefined ? {} : { headers: options.headers })
			})
		))
	})

const withBridge = <A, E>(
	effect: Effect.Effect<A, E, Bridge>,
	client: HttpClient.HttpClient,
	clientConfig: BridgeConfig = config()
): Effect.Effect<A, E | BridgeConfigurationError> =>
	Effect.provide(
		effect,
		bridgeLayer(clientConfig).pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, client)))
	)

const customerList = () =>
	Effect.gen(function*() {
		const bridge = yield* Bridge
		return yield* bridge.customers.getCustomers({ query: {} })
	})

describe("Bridge authenticated Effect client", () => {
	test("uses the configured base URL and Api-Key header with generated group methods", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls, { body: JSON.stringify({ count: 0, data: [] }) })
		const customers = await Effect.runPromise(withBridge(customerList(), client))

		expect(customers).toEqual({ count: 0, data: [] })
		expect(calls).toHaveLength(1)
		expect(calls[0]?.url.href).toBe("https://bridge.test/v0/customers")
		expect(calls[0]?.request.headers["api-key"]).toBe("sk-test-bridge-secret")
	})

	test("suppresses Bridge HTTP URL attributes and propagation within the caller span", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls, { body: JSON.stringify({ count: 0, data: [] }) })
		const spans: Array<Tracer.NativeSpan> = []
		const tracer = Tracer.make({
			span: (options) => {
				const span = new Tracer.NativeSpan(options)
				spans.push(span)
				return span
			}
		})
		const email = "private-query@example.invalid"
		const call = Effect.withSpan(Effect.gen(function*() {
			yield* withBridge(Effect.gen(function*() {
				const bridge = yield* Bridge
				return yield* bridge.customers.getCustomers({ query: { email } })
			}), client)
			const outsideClient = yield* HttpClient.HttpClient
			return yield* outsideClient.get("https://outside.test/ping")
		}), "caller.bridge-operation")

		await Effect.runPromise(Effect.provideService(
			Effect.provideService(call, Tracer.Tracer, tracer),
			HttpClient.HttpClient,
			client
		))

		const spanAttributes = JSON.stringify(spans.map((span) => Array.from(span.attributes.entries())))
		expect(spans.map((span) => span.name)).toContain("caller.bridge-operation")
		expect(spans.filter((span) => span.kind === "client")).toHaveLength(1)
		expect(spanAttributes).not.toContain(email)
		expect(spanAttributes.toLowerCase()).not.toContain("api-key")
		expect(calls).toHaveLength(2)
		expect(calls[0]?.request.headers["api-key"]).toBe("sk-test-bridge-secret")
		expect(calls[0]?.request.headers["traceparent"]).toBeUndefined()
		expect(calls[0]?.request.headers["tracestate"]).toBeUndefined()
		expect(calls[1]?.url.href).toBe("https://outside.test/ping")
		expect(calls[1]?.request.headers["traceparent"]).toBeDefined()
	})

	test("rejects invalid request data before HTTP and scrubs schema input", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls, { body: JSON.stringify({ count: 0, data: [] }) })
		const effect = Effect.gen(function*() {
			const bridge = yield* Bridge
			const postCustomer = bridge.customers.postCustomers as unknown as (
				request: unknown
			) => Effect.Effect<unknown, unknown>
			return yield* Effect.flip(postCustomer({
				headers: { "Idempotency-Key": "caller-key" },
				payload: { type: "individual", first_name: "Sensitive KYC name", last_name: 42 }
			}))
		})

		const failure = await Effect.runPromise(withBridge(effect, client))
		expect(failure).toBeInstanceOf(BridgeSchemaError)
		expect(JSON.stringify(failure)).not.toContain("Sensitive KYC name")
		expect(String(failure)).not.toContain("Sensitive KYC name")
		expect(calls).toHaveLength(0)
	})

	test("keeps caller idempotency stable and does not retry a mutation", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls, { status: 201, body: JSON.stringify({ chain: "base" }) })
		const result = await Effect.runPromise(withBridge(Effect.gen(function*() {
			const bridge = yield* Bridge
			return yield* bridge.bridgeWallets.postCustomersByCustomerIDWallets({
				params: { customerID: "cus_test_123" },
				headers: { "Idempotency-Key": "caller-stable-idempotency-key" },
				payload: { chain: "base" }
			})
		}), client))

		expect(result).toMatchObject({ chain: "base" })
		expect(calls).toHaveLength(1)
		expect(calls[0]?.request.headers["idempotency-key"]).toBe("caller-stable-idempotency-key")
	})

	test("does not add Idempotency-Key to POST /api_keys", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls, {
			status: 401,
			body: JSON.stringify({ code: "unauthorized", message: "not authorized" })
		})
		const error = await Effect.runPromise(withBridge(Effect.gen(function*() {
			const bridge = yield* Bridge
			return yield* Effect.flip(bridge.apiKeys.postApiKeys({ payload: { scopes: ["customer:read"] } }))
		}), client))

		expect(error).toBeInstanceOf(BridgeHttpError)
		expect(error).toMatchObject({ status: 401, method: "POST" })
		expect(calls).toHaveLength(1)
		expect(calls[0]?.request.headers["api-key"]).toBe("sk-test-bridge-secret")
		expect(calls[0]?.request.headers["idempotency-key"]).toBeUndefined()
	})

	test("distinguishes absent from supplied optional card POST payloads", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls)
		const exercise = Effect.flatMap(Bridge, (bridge) => {
			const params = { customerID: "cus_test", cardAccountID: "cca_test" }
			const headers = { "Idempotency-Key": "caller-stable-card-key" }
			return Effect.all([
				Effect.ignore(bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDFreeze({ params, headers, payload: undefined })),
				Effect.ignore(bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDUnfreeze({ params, headers, payload: undefined })),
				Effect.ignore(bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDCreateMobileWalletProvisioningRequest({ params, headers, payload: undefined })),
				Effect.ignore(bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDEphemeralKeys({ params, headers, payload: undefined })),
				Effect.ignore(bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDFreeze({
					params,
					headers,
					payload: { initiator: "developer", reason: "other" }
				})),
				Effect.ignore(bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDUnfreeze({
					params,
					headers,
					payload: { initiator: "developer" }
				})),
				Effect.ignore(bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDCreateMobileWalletProvisioningRequest({
					params,
					headers,
					payload: { initiator: "developer" }
				})),
				Effect.ignore(bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDEphemeralKeys({
					params,
					headers,
					payload: { client_nonce: "nonce-test" }
				}))
			], { concurrency: 1 })
		})
		await Effect.runPromise(withBridge(exercise, client))

		expect(calls).toHaveLength(8)
		const emptyBodyCalls = calls.filter((call) => call.request.body._tag === "Empty")
		expect(emptyBodyCalls).toHaveLength(4)
		expect(emptyBodyCalls.map((call) => call.url.pathname).sort()).toEqual([
			"/v0/customers/cus_test/card_accounts/cca_test/create_mobile_wallet_provisioning_request",
			"/v0/customers/cus_test/card_accounts/cca_test/ephemeral_keys",
			"/v0/customers/cus_test/card_accounts/cca_test/freeze",
			"/v0/customers/cus_test/card_accounts/cca_test/unfreeze"
		])
		for (const call of emptyBodyCalls) {
			expect(call.request.method).toBe("POST")
			expect(call.request.headers["content-type"]).toBeUndefined()
			expect(call.request.headers["content-length"]).toBeUndefined()
			expect(call.request.headers["api-key"]).toBe("sk-test-bridge-secret")
			expect(call.request.headers["idempotency-key"]).toBe("caller-stable-card-key")
		}
		const expectedPayloadByPath = new Map([
			["/v0/customers/cus_test/card_accounts/cca_test/freeze", '{"initiator":"developer","reason":"other"}'],
			["/v0/customers/cus_test/card_accounts/cca_test/unfreeze", '{"initiator":"developer"}'],
			["/v0/customers/cus_test/card_accounts/cca_test/create_mobile_wallet_provisioning_request", '{"initiator":"developer"}'],
			["/v0/customers/cus_test/card_accounts/cca_test/ephemeral_keys", '{"client_nonce":"nonce-test"}']
		])
		const jsonBodyCalls = calls.filter((call) => call.request.body._tag !== "Empty")
		expect(jsonBodyCalls).toHaveLength(4)
		for (const call of jsonBodyCalls) {
			expect(call.request.body._tag).toBe("Uint8Array")
			if (call.request.body._tag === "Uint8Array") {
				const expectedPayload = expectedPayloadByPath.get(call.url.pathname)
				expect(expectedPayload).toBeDefined()
				if (expectedPayload !== undefined) {
					expect(new TextDecoder().decode(call.request.body.body)).toBe(expectedPayload)
				}
			}
			expect(call.request.headers["content-type"]).toBe("application/json")
			expect(call.request.headers["idempotency-key"]).toBe("caller-stable-card-key")
		}
	})

	test("validates supplied optional card POST payloads before HTTP", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls)
		const failures = await Effect.runPromise(withBridge(Effect.flatMap(Bridge, (bridge) => {
			const params = { customerID: "cus_test", cardAccountID: "cca_test" }
			const headers = { "Idempotency-Key": "caller-stable-card-key" }
			const callWithPayload = (method: unknown, payload: unknown) => {
				const operation = method as (request: unknown) => Effect.Effect<unknown, unknown>
				return Effect.flip(operation({ params, headers, payload }))
			}
			const malformedValues = [1, true, "primitive", [], {}]
			const cases: ReadonlyArray<readonly [unknown, ReadonlyArray<unknown>]> = [
				[
					bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDFreeze,
					[...malformedValues, { initiator: "admin", reason: "other" }, { initiator: "developer", reason: "fraud" }]
				],
				[
					bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDUnfreeze,
					[...malformedValues, { initiator: "admin" }]
				],
				[
					bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDCreateMobileWalletProvisioningRequest,
					[
						...malformedValues,
						{ initiator: "developer", wallet_provider: "samsung_pay" },
						{
							initiator: "developer",
							wallet_provider: "google_pay",
							google_pay: { client_wallet_account_id: "wallet_test" }
						}
					]
				],
				[
					bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDEphemeralKeys,
					[...malformedValues, { client_nonce: 42 }]
				]
			]
			return Effect.all(
				cases.flatMap(([method, payloads]) => payloads.map((payload) => callWithPayload(method, payload))),
				{ concurrency: 1 }
			)
		}), client))

		expect(failures).toHaveLength(26)
		for (const failure of failures) {
			expect(failure).toBeInstanceOf(BridgeSchemaError)
			expect(failure).toMatchObject({ phase: "request" })
			expect(JSON.stringify(failure)).not.toContain("wallet_test")
		}
		expect(calls).toHaveLength(0)
	})

	test("rejects explicit null payloads on optional card POSTs before HTTP", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls)
		const errors = await Effect.runPromise(withBridge(Effect.flatMap(Bridge, (bridge) => {
			const request = {
				params: { customerID: "cus_test", cardAccountID: "cca_test" },
				headers: { "Idempotency-Key": "caller-stable-card-key" },
				payload: null
			}
			const callWithNull = (method: unknown) => {
				const operation = method as (request: unknown) => Effect.Effect<unknown, unknown>
				return Effect.flip(operation(request))
			}
			return Effect.all([
				callWithNull(bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDFreeze),
				callWithNull(bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDUnfreeze),
				callWithNull(bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDCreateMobileWalletProvisioningRequest),
				callWithNull(bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDEphemeralKeys)
			])
		}), client))

		expect(errors).toHaveLength(4)
		for (const error of errors) {
			expect(error).toBeInstanceOf(BridgeSchemaError)
			expect(error).toMatchObject({ phase: "request" })
		}
		expect(calls).toHaveLength(0)
	})

	test("rejects FormData for JSON-only request payloads before HTTP", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls)
		const error = await Effect.runPromise(withBridge(Effect.flatMap(Bridge, (bridge) => {
			const postTransfers = bridge.transfers.postTransfers as unknown as (
				request: unknown
			) => Effect.Effect<unknown, unknown>
			return Effect.flip(postTransfers({
				headers: { "Idempotency-Key": "caller-transfer-key" },
				payload: new FormData()
			}))
		}), client))

		expect(error).toBeInstanceOf(BridgeSchemaError)
		expect(error).toMatchObject({ phase: "request" })
		expect(calls).toHaveLength(0)
	})

	test("evaluates payload guards against an execution-time request snapshot", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls)
		const postFreeze = (bridge: BridgeClient) => bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDFreeze as unknown as (
			request: unknown
		) => Effect.Effect<unknown, unknown>
		const postTransfers = (bridge: BridgeClient) => bridge.transfers.postTransfers as unknown as (
			request: unknown
		) => Effect.Effect<unknown, unknown>

		const invalidCardPayload = await Effect.runPromise(withBridge(Effect.gen(function*() {
			const bridge = yield* Bridge
			const request: Record<string, unknown> = {
				params: { customerID: "cus_test", cardAccountID: "cca_test" },
				payload: { initiator: "developer", reason: "other" }
			}
			const pending = postFreeze(bridge)(request)
			request.payload = {}
			return yield* Effect.flip(pending)
		}), client))
		expect(invalidCardPayload).toBeInstanceOf(BridgeSchemaError)

		const cardFormData = await Effect.runPromise(withBridge(Effect.gen(function*() {
			const bridge = yield* Bridge
			const request: Record<string, unknown> = {
				params: { customerID: "cus_test", cardAccountID: "cca_test" },
				payload: { initiator: "developer", reason: "other" }
			}
			const pending = postFreeze(bridge)(request)
			request.payload = new FormData()
			return yield* Effect.flip(pending)
		}), client))
		expect(cardFormData).toBeInstanceOf(BridgeSchemaError)

		const transferFormData = await Effect.runPromise(withBridge(Effect.gen(function*() {
			const bridge = yield* Bridge
			const request: Record<string, unknown> = {
				payload: {
					on_behalf_of: "cus_test",
					source: { currency: "usd", payment_rail: "ach" },
					destination: { currency: "usd", payment_rail: "ach", external_account_id: "ea_test" }
				}
			}
			const pending = postTransfers(bridge)(request)
			request.payload = new FormData()
			return yield* Effect.flip(pending)
		}), client))
		expect(transferFormData).toBeInstanceOf(BridgeSchemaError)
		expect(calls).toHaveLength(0)

		await Effect.runPromise(withBridge(Effect.gen(function*() {
			const bridge = yield* Bridge
			const request: Record<string, unknown> = {
				params: { customerID: "cus_before" },
				headers: { "Idempotency-Key": "before-execution" },
				payload: undefined,
				responseMode: "response-only"
			}
			const pending = postFreeze(bridge)(request)
			request.params = { customerID: "cus_at_execution", cardAccountID: "cca_at_execution" }
			request.headers = { "Idempotency-Key": "at-execution" }
			request.payload = { initiator: "developer", reason: "other" }
			return yield* Effect.ignore(pending)
		}), client))

		expect(calls).toHaveLength(1)
		expect(calls[0]?.url.pathname).toBe("/v0/customers/cus_at_execution/card_accounts/cca_at_execution/freeze")
		expect(calls[0]?.request.headers["idempotency-key"]).toBe("at-execution")
		expect(calls[0]?.request.body._tag).toBe("Uint8Array")
		if (calls[0]?.request.body._tag === "Uint8Array") {
		expect(new TextDecoder().decode(calls[0].request.body.body)).toBe(JSON.stringify({ initiator: "developer", reason: "other" }))
		}
	})

	test("maps throwing request and payload getters or proxies to a redacted request error", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls)
		const validPayload = { initiator: "developer", reason: "other" }
		const throwingProperty = (target: object, key: string, marker: string) =>
			Object.defineProperty(target, key, {
				configurable: true,
				enumerable: true,
				get: () => {
					throw new Error(marker)
				}
			})
		const requestWithPayloadGetter = {}
		throwingProperty(requestWithPayloadGetter, "payload", "request-payload-getter-marker")
		const requestWithSpreadGetter: Record<string, unknown> = {
			params: { customerID: "cus_test", cardAccountID: "cca_test" },
			payload: validPayload
		}
		throwingProperty(requestWithSpreadGetter, "unused", "request-spread-getter-marker")
		const params = { cardAccountID: "cca_test" }
		throwingProperty(params, "customerID", "params-getter-marker")
		const headers = {}
		throwingProperty(headers, "Idempotency-Key", "headers-getter-marker")
		const query = {}
		throwingProperty(query, "email", "query-getter-marker")
		const payloadWithGetter = { initiator: "developer" }
		throwingProperty(payloadWithGetter, "reason", "payload-decode-getter-marker")
		const requestProxy = new Proxy({
			params: { customerID: "cus_test", cardAccountID: "cca_test" },
			payload: validPayload
		}, {
			ownKeys: () => {
				throw new Error("request-proxy-marker")
			}
		})
		const payloadProxy = new Proxy(validPayload, {
			ownKeys: () => {
				throw new Error("payload-proxy-marker")
			}
		})
		const callableRequest = Object.assign(() => undefined, { payload: validPayload })
		throwingProperty(callableRequest, "params", "callable-getter-marker")
		const callableProxy = new Proxy(Object.assign(() => undefined, { payload: validPayload }), {
			get: () => {
				throw new Error("callable-proxy-marker")
			}
		})
		const requests: ReadonlyArray<readonly [string, unknown, string]> = [
			["request payload getter", requestWithPayloadGetter, "request-payload-getter-marker"],
			["request spread getter", requestWithSpreadGetter, "request-spread-getter-marker"],
			["params getter", { params, payload: validPayload }, "params-getter-marker"],
			["headers getter", { headers, payload: validPayload }, "headers-getter-marker"],
			["query getter", { query, payload: validPayload }, "query-getter-marker"],
			["payload getter during decode", { payload: payloadWithGetter }, "payload-decode-getter-marker"],
			["request proxy", requestProxy, "request-proxy-marker"],
			["payload proxy", { payload: payloadProxy }, "payload-proxy-marker"],
			["callable request", callableRequest, "callable-getter-marker"],
			["callable proxy", callableProxy, "callable-proxy-marker"],
			["null request", null, "null-request-marker"],
			["primitive request", 42, "primitive-request-marker"]
		]
		const postFreeze = (bridge: BridgeClient) =>
			bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDFreeze as unknown as (
				request: unknown
			) => Effect.Effect<unknown, unknown>

		for (const [label, request, marker] of requests) {
			const exit = await Effect.runPromiseExit(withBridge(Effect.gen(function*() {
				const bridge = yield* Bridge
				return yield* postFreeze(bridge)(request)
			}), client))
			expect(Exit.isFailure(exit), label).toBe(true)
			if (Exit.isFailure(exit)) {
				const failure = Cause.findErrorOption(exit.cause)
				expect(Cause.hasDies(exit.cause), label).toBe(false)
				expect(Option.isSome(failure) && failure.value instanceof BridgeSchemaError, label).toBe(true)
				if (Option.isSome(failure)) {
					expect(failure.value, label).toMatchObject({ phase: "request" })
				}
				const printedCause = `${Cause.pretty(exit.cause)} ${JSON.stringify(exit.cause)}`
				expect(printedCause, label).not.toContain(marker)
			}
		}
		expect(calls).toHaveLength(0)
	})

	test("encodes the decoded payload snapshot if its source changes during validation", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls)
		let reason = "other"
		let reasonReads = 0
		const payload = { initiator: "developer" } as Record<string, unknown>
		Object.defineProperty(payload, "reason", {
			enumerable: true,
			get: () => {
				reasonReads += 1
				const currentReason = reason
				reason = "fraud"
				return currentReason
			}
		})

		await Effect.runPromise(withBridge(Effect.gen(function*() {
			const bridge = yield* Bridge
			const postFreeze = bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDFreeze as unknown as (
				request: unknown
			) => Effect.Effect<unknown, unknown>
			return yield* postFreeze({
				params: { customerID: "cus_test", cardAccountID: "cca_test" },
				headers: { "Idempotency-Key": "caller-stable-race-key" },
				payload,
				responseMode: "response-only"
			})
		}), client))

		expect(reasonReads).toBeGreaterThan(0)
		expect(reason).toBe("fraud")
		expect(calls).toHaveLength(1)
		const body = calls[0]?.request.body
		expect(body?._tag).toBe("Uint8Array")
		if (body?._tag === "Uint8Array") {
			expect(new TextDecoder().decode(body.body)).toBe(JSON.stringify({ initiator: "developer", reason: "other" }))
		}
	})

	test("keeps valid POST /transfers payloads on the JSON encoder", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls)
		const payload = {
			on_behalf_of: "cus_test",
			source: { currency: "usd", payment_rail: "ach" },
			destination: { currency: "usd", payment_rail: "ach", external_account_id: "ea_test" }
		} as const
		await Effect.runPromise(withBridge(Effect.flatMap(Bridge, (bridge) =>
			Effect.ignore(bridge.transfers.postTransfers({
				headers: { "Idempotency-Key": "caller-transfer-key" },
				payload
			}))
		), client))

		expect(calls).toHaveLength(1)
		const body = calls[0]?.request.body
		expect(body?._tag).toBe("Uint8Array")
		if (body?._tag === "Uint8Array") {
			expect(new TextDecoder().decode(body.body)).toBe(JSON.stringify(payload))
		}
	})

	test("sanitizes transport errors rather than exposing request, KYC data, or causes", async () => {
		const calls: Array<RecordedCall> = []
		const client = HttpClient.make((request, url, signal) => {
			calls.push({ request, url, signal })
			return Effect.fail(new HttpClientError.HttpClientError({
				reason: new HttpClientError.TransportError({
					request,
					cause: new Error("failed while sending KYC details: sensitive-account-number")
				})
			}))
		})
		const effect = Effect.gen(function*() {
			const bridge = yield* Bridge
			return yield* Effect.flip(bridge.bridgeWallets.postCustomersByCustomerIDWallets({
				params: { customerID: "cus_sensitive_identifier" },
				headers: { "Idempotency-Key": "caller-key" },
				payload: { chain: "base", account_number: "sensitive-account-number" }
			}))
		})
		const error = await Effect.runPromise(withBridge(effect, client))
		const printable = [JSON.stringify(error), String(error)].join(" ")

		expect(error).toBeInstanceOf(BridgeTransportError)
		for (const secret of ["sk-test-bridge-secret", "sensitive-account-number", "cus_sensitive_identifier", "KYC details"]) {
			expect(printable).not.toContain(secret)
		}
	})

	test("maps invalid response schemas without retaining response values", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls, {
			body: JSON.stringify({ count: "private-response-value", data: [] })
		})
		const error = await Effect.runPromise(withBridge(Effect.flip(customerList()), client))

		expect(error).toBeInstanceOf(BridgeSchemaError)
		expect(JSON.stringify(error)).not.toContain("private-response-value")
	})

	test("does not decode declared transfer 400 bodies into public errors", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls, {
			status: 400,
			body: JSON.stringify({
				code: "invalid_transfer",
				message: "Sensitive KYC response name was rejected",
				kyc_fields: {
					full_name: "Sensitive KYC response name",
					document_number: "private-response-document-number"
				}
			}),
			headers: { "content-type": "application/json", "x-request-id": "bridge-transfer-400" }
		})
		const error = await Effect.runPromise(withBridge(Effect.gen(function*() {
			const bridge = yield* Bridge
			return yield* Effect.flip(bridge.transfers.postTransfers({
				headers: { "Idempotency-Key": "caller-stable-transfer-key" },
				payload: {
					on_behalf_of: "cus_sensitive_identifier",
					source: { currency: "usd", payment_rail: "ach" },
					destination: { currency: "usd", payment_rail: "ach", external_account_id: "acct_sensitive_identifier" },
					travel_rule_data: {
						originator: {
							name: "Sensitive KYC request name",
						identifying_information: [{ type: "passport", issuing_country: "US", number: "private-request-document-number" }]
						}
					}
				}
			}))
		}), client))
		const printable = [JSON.stringify(error), String(error)].join(" ")

		expect(error).toBeInstanceOf(BridgeHttpError)
		expect(error).toMatchObject({ status: 400, method: "POST", requestId: "bridge-transfer-400" })
		for (const secret of [
			"sk-test-bridge-secret",
			"Sensitive KYC response name",
			"private-response-document-number",
			"Sensitive KYC request name",
			"private-request-document-number",
			"cus_sensitive_identifier",
			"acct_sensitive_identifier"
		]) {
			expect(printable).not.toContain(secret)
		}
		expect(calls).toHaveLength(1)
	})

	test("response-only calls fail non-2xx statuses with safe BridgeHttpError metadata", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls, {
			status: 401,
			body: JSON.stringify({ code: "unauthorized", message: "private response detail" }),
			headers: { "content-type": "application/json", "x-request-id": "bridge-response-only-401" }
		})
		const error = await Effect.runPromise(withBridge(Effect.gen(function*() {
			const bridge = yield* Bridge
			return yield* Effect.flip(bridge.customers.getCustomers({
				query: { email: "private-query@example.invalid" },
				responseMode: "response-only"
			}))
		}), client))
		const printable = [JSON.stringify(error), String(error)].join(" ")

		expect(error).toBeInstanceOf(BridgeHttpError)
		expect(error).toMatchObject({ status: 401, method: "GET", requestId: "bridge-response-only-401" })
		expect(printable).not.toContain("private response detail")
		expect(printable).not.toContain("private-query@example.invalid")
		expect(printable).not.toContain("sk-test-bridge-secret")
		expect(calls).toHaveLength(1)
	})

	test("drains non-2xx bodies without decoding them before reporting status", async () => {
		let fullyDrained = false
		let pulls = 0
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulls += 1
				if (pulls === 1) {
					controller.enqueue(new TextEncoder().encode("not a generated Bridge error"))
				} else {
					fullyDrained = true
					controller.close()
				}
			}
		})
		const client = HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(
			request,
			new Response(body, { status: 400, headers: { "content-type": "application/json" } })
		)))
		const error = await Effect.runPromise(withBridge(Effect.gen(function*() {
			const bridge = yield* Bridge
			return yield* Effect.flip(bridge.customers.getCustomers({ query: {} }))
		}), client))

		expect(error).toBeInstanceOf(BridgeHttpError)
		expect(error).toMatchObject({ status: 400, method: "GET" })
		expect(fullyDrained).toBe(true)
	})

	test("sanitizes every deferred response body accessor and facade inspection", async () => {
		const accessors = ["json", "text", "urlParamsBody", "arrayBuffer", "formData", "stream"] as const
		for (const accessor of accessors) {
			const calls: Array<RecordedCall> = []
			const client = HttpClient.make((request, url, signal) => {
				calls.push({ request, url, signal })
				const body = accessor === "json"
					? "malformed JSON containing private-response-body-marker"
					: new ReadableStream<Uint8Array>({
						start(controller) {
							controller.error(new Error("private deferred response cause marker"))
						}
					})
				return Effect.succeed(HttpClientResponse.fromWeb(
					request,
					new Response(body, {
						status: 200,
						headers: {
							"content-type": "application/json",
							"x-request-id": "bridge-deferred-200",
							"api-key": "private-response-header-key"
						}
					})
				))
			})
			const response = await Effect.runPromise(withBridge(Effect.gen(function*() {
				const bridge = yield* Bridge
				return yield* bridge.customers.getCustomers({
					query: { email: "private-query@example.invalid" },
					responseMode: "response-only"
				})
			}), client))
			const deferred = accessor === "stream"
				? Stream.runDrain(response.stream)
				: response[accessor]
			const error = await Effect.runPromise(Effect.flip(deferred))
			const printedResponse = [
				JSON.stringify(response),
				String(response),
				JSON.stringify(response[Inspectable.NodeInspectSymbol]()),
				JSON.stringify(response.request),
				JSON.stringify(Reflect.ownKeys(response))
			].join(" ")
			const printedError = [
				JSON.stringify(error),
				String(error),
				JSON.stringify(error[Inspectable.NodeInspectSymbol]())
			].join(" ")

			expect(error).toBeInstanceOf(BridgeSchemaError)
			expect(response.status).toBe(200)
			expect(response.headers["x-request-id"]).toBe("bridge-deferred-200")
			expect(response.headers["api-key"]).toBe("private-response-header-key")
			expect(response.request.headers["api-key"]).toBeUndefined()
			expect(response.request.url).not.toContain("/customers")
			for (const secret of [
				"sk-test-bridge-secret",
				"private-query@example.invalid",
				"private deferred response cause marker",
				"private-response-body-marker",
				"private-response-header-key",
				"/customers"
			]) {
				expect(printedResponse).not.toContain(secret)
				expect(printedError).not.toContain(secret)
			}
			expect(calls).toHaveLength(1)
		}
	})

	test("preserves cancellation through a deferred response body stream", async () => {
		let canceled = false
		let pulls = 0
		let markWaiting: (() => void) | undefined
		const waiting = new Promise<void>((resolve) => {
			markWaiting = resolve
		})
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulls += 1
				if (pulls === 1) {
					controller.enqueue(new Uint8Array([1]))
				} else {
					markWaiting?.()
				}
			},
			cancel() {
				canceled = true
			}
		})
		const client = HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(
			request,
			new Response(body, { status: 200, headers: { "content-type": "application/pdf" } })
		)))
		const response = await Effect.runPromise(withBridge(Effect.gen(function*() {
			const bridge = yield* Bridge
			return yield* bridge.customers.getCustomers({ query: {}, responseMode: "response-only" })
		}), client))

		await Effect.runPromise(Effect.gen(function*() {
			const fiber = yield* Effect.forkChild(Stream.runDrain(response.stream))
			yield* Effect.promise(() => waiting)
			yield* Fiber.interrupt(fiber)
		}))
		expect(canceled).toBe(true)
	})

	test("maps non-JSON unrecognized HTTP failures to safe status metadata", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls, {
			status: 503,
			body: "upstream private response text",
			headers: { "content-type": "text/plain", "x-request-id": "bridge-request-123" }
		})
		const error = await Effect.runPromise(withBridge(Effect.flip(customerList()), client))

		expect(error).toBeInstanceOf(BridgeHttpError)
		expect(error).toMatchObject({ status: 503, method: "GET", requestId: "bridge-request-123" })
		expect(JSON.stringify(error)).not.toContain("upstream private response text")
	})

	test("decodes binary PDFs and bodyless success responses", async () => {
		const pdfBytes = Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 55])
		const pdfCalls: Array<RecordedCall> = []
		const pdfClient = mockHttpClient(pdfCalls, { body: pdfBytes, headers: { "content-type": "application/pdf" } })
		const pdf = await Effect.runPromise(withBridge(Effect.gen(function*() {
			const bridge = yield* Bridge
			return yield* bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDStatementsPeriodPdf({
				params: { customerID: "cus_test", cardAccountID: "cca_test", period: "2026-09" }
			})
		}), pdfClient))
		expect(Array.from(pdf)).toEqual(Array.from(pdfBytes))

		const emptyCalls: Array<RecordedCall> = []
		const emptyClient = mockHttpClient(emptyCalls, { status: 200, body: null })
		const result = await Effect.runPromise(withBridge(Effect.gen(function*() {
			const bridge = yield* Bridge
			return yield* bridge.transfers.deleteTransfersByTransferID({ params: { transferID: "tr_test" } })
		}), emptyClient))
		expect(result).toBeUndefined()
	})

	test("returns response metadata with a request stripped of credentials and body", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls, {
			body: JSON.stringify({ count: 0, data: [] }),
			headers: { "content-type": "application/json", "x-request-id": "bridge-request-456" }
		})
		const [, response] = await Effect.runPromise(withBridge(Effect.gen(function*() {
			const bridge = yield* Bridge
			return yield* bridge.customers.getCustomers({ query: {}, responseMode: "decoded-and-response" })
		}), client))
		const printed = [
			JSON.stringify(response),
			String(response),
			JSON.stringify(response[Inspectable.NodeInspectSymbol]()),
			JSON.stringify(response.request)
		].join(" ")

		expect(response.status).toBe(200)
		expect(response.headers["x-request-id"]).toBe("bridge-request-456")
		expect(response.request.headers["api-key"]).toBeUndefined()
		expect(printed).not.toContain("sk-test-bridge-secret")
		expect(printed).not.toContain("/customers")
	})

	test("uses manual redirects in the Fetch layer", async () => {
		let callCount = 0
		let redirectMode: string | undefined
		const fetch = async (_input: unknown, init?: RequestInit): Promise<Response> => {
			callCount += 1
			redirectMode = init?.redirect
			return new Response(null, { status: 302, headers: { location: "https://attacker.invalid/collect" } })
		}
		const layer = bridgeFetchLayer(config()).pipe(
			Layer.provideMerge(Layer.succeed(FetchHttpClient.Fetch, fetch as unknown as typeof globalThis.fetch))
		)
		const error = await Effect.runPromise(Effect.gen(function*() {
			const bridge = yield* Bridge
			return yield* Effect.flip(bridge.customers.getCustomers({ query: {} }))
		}).pipe(Effect.provide(layer)))

		expect(error).toBeInstanceOf(BridgeHttpError)
		expect(redirectMode).toBe("manual")
		expect(callCount).toBe(1)
	})

	test("turns configured timeouts into typed failures and aborts the request", async () => {
		let aborted = false
		const client = HttpClient.make((_request, _url, signal) => {
			signal.addEventListener("abort", () => {
				aborted = true
			})
			return Effect.never
		})
		const exit = await Effect.runPromiseExit(withBridge(customerList(), client, config({ timeoutMs: 1 })))

		expect(Exit.isFailure(exit)).toBe(true)
		if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(BridgeTimeoutError)
		expect(aborted).toBe(true)
	})

	test("preserves interruption as cancellation and aborts the in-flight request", async () => {
		let aborted = false
		let markStarted: (() => void) | undefined
		const started = new Promise<void>((resolve) => {
			markStarted = resolve
		})
		const client = HttpClient.make((_request, _url, signal) => {
			signal.addEventListener("abort", () => {
				aborted = true
			})
			markStarted?.()
			return Effect.never
		})
		const call = withBridge(customerList(), client)
		const exit = await Effect.runPromise(Effect.gen(function*() {
			const fiber = yield* Effect.forkChild(call)
			yield* Effect.promise(() => started)
			yield* Fiber.interrupt(fiber)
			return yield* Fiber.await(fiber)
		}))

		expect(Exit.isFailure(exit)).toBe(true)
		if (Exit.isFailure(exit)) expect(Cause.hasInterrupts(exit.cause)).toBe(true)
		expect(aborted).toBe(true)
	})

	test("supports sandbox and custom URLs, and rejects userinfo without echoing it", async () => {
		const calls: Array<RecordedCall> = []
		const client = mockHttpClient(calls, { body: JSON.stringify({ count: 0, data: [] }) })
		await Effect.runPromise(withBridge(customerList(), client, { apiKey, environment: "sandbox" }))
		await Effect.runPromise(withBridge(customerList(), client, config({ baseUrl: "https://custom.bridge.test/v0/" })))
		expect(calls.map((call) => call.url.origin)).toEqual(["https://api.sandbox.bridge.xyz", "https://custom.bridge.test"])
		expect(calls[1]?.url.pathname).toBe("/v0/customers")

		const failure = await Effect.runPromise(Effect.flip(Effect.provideService(
			Bridge.make(config({ baseUrl: "https://user:secret@bridge.test/v0" })),
			HttpClient.HttpClient,
			client
		)))
		expect(JSON.stringify(failure)).not.toContain("secret")
	})
})
