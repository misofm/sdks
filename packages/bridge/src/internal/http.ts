import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Inspectable from "effect/Inspectable"
import * as Pipeable from "effect/Pipeable"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as HttpApiMiddleware from "effect/unstable/httpapi/HttpApiMiddleware"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientError from "effect/unstable/http/HttpClientError"
import * as HttpIncomingMessage from "effect/unstable/http/HttpIncomingMessage"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse"
import * as HttpBody from "effect/unstable/http/HttpBody"
import * as Headers from "effect/unstable/http/Headers"

import {
	ApiKeySecurityMiddleware,
	BridgeApi,
	PostCustomersByCustomerIDCardAccountsByCardAccountIDEphemeralKeysRequestJson,
	PostCustomersByCustomerIDCardAccountsByCardAccountIDFreezeRequestJson,
	PostCustomersByCustomerIDCardAccountsByCardAccountIDUnfreezeRequestJson,
	PostCustomersByCustomerIDCardAccountsByCardAccountIDCreateMobileWalletProvisioningRequestRequestJson
} from "../generated/BridgeApi.js"
import {
	BridgeHttpError,
	BridgeSchemaError,
	BridgeTimeoutError,
	BridgeTransportError,
	type BridgeClientError
} from "../Errors.js"

const safeRequest = (request: HttpClientRequest.HttpClientRequest): HttpClientRequest.HttpClientRequest =>
	HttpClientRequest.make(request.method)("https://bridge.invalid/")

const responseRequestId = (response: HttpClientResponse.HttpClientResponse): string | undefined => {
	const id = response.headers["x-request-id"] ?? response.headers["request-id"]
	return id === undefined ? undefined : id.slice(0, 128)
}

const bridgeHttpErrorFromResponse = (response: HttpClientResponse.HttpClientResponse) => {
	const id = responseRequestId(response)
	return new BridgeHttpError({
		status: response.status,
		method: response.request.method,
		...(id === undefined ? {} : { requestId: id })
	})
}

const isBridgeClientError = (error: unknown): error is BridgeClientError =>
	error instanceof BridgeHttpError ||
	error instanceof BridgeTransportError ||
	error instanceof BridgeSchemaError ||
	error instanceof BridgeTimeoutError

const safeDeferredFailure = (error: unknown): BridgeClientError => {
	const sanitized = sanitizeFailure(error, "response")
	return isBridgeClientError(sanitized) ? sanitized : new BridgeTransportError({ kind: "Unknown" })
}

const inspectableResponse = (
	response: HttpClientResponse.HttpClientResponse,
	redactedHeaderNames: ReadonlyArray<string | RegExp>
): HttpClientResponse.HttpClientResponse => {
	const request = safeRequest(response.request)
	const safeJson = () => ({
		_id: "HttpClientResponse",
		request: request.toJSON(),
		status: response.status,
		headers: Headers.redact(response.headers, redactedHeaderNames)
	})
	const safeEffect = <A>(effect: Effect.Effect<A, HttpClientError.HttpClientError>) =>
		Effect.mapError(effect, safeDeferredFailure)

	// Use a facade instead of a Proxy over the transport response. In particular,
	// inspection and all deferred body readers must not retain its raw request,
	// URL, headers, or decoding cause.
	return {
		[HttpIncomingMessage.TypeId]: HttpIncomingMessage.TypeId,
		[HttpClientResponse.TypeId]: HttpClientResponse.TypeId,
		request,
		status: response.status,
		get headers() {
			return response.headers
		},
		get cookies() {
			return response.cookies
		},
		get remoteAddress() {
			return response.remoteAddress
		},
		get json() {
			return safeEffect(response.json)
		},
		get text() {
			return safeEffect(response.text)
		},
		get urlParamsBody() {
			return safeEffect(response.urlParamsBody)
		},
		get arrayBuffer() {
			return safeEffect(response.arrayBuffer)
		},
		get formData() {
			return safeEffect(response.formData)
		},
		get stream() {
			return Stream.mapError(response.stream, safeDeferredFailure)
		},
		pipe() {
			return Pipeable.pipeArguments(this, arguments)
		},
		toJSON: safeJson,
		[Inspectable.NodeInspectSymbol]: safeJson,
		toString: () => "[HttpClientResponse]"
	} as unknown as HttpClientResponse.HttpClientResponse
}

const optionalCardMutationPath = /(?:^|\/)customers\/[^/?#]+\/card_accounts\/[^/?#]+\/(?:ephemeral_keys|freeze|unfreeze|create_mobile_wallet_provisioning_request)$/

/** Concrete request schemas for endpoints whose generated payload union also accepts NoContent. */
const optionalCardPayloadSchemas: Readonly<Record<string, Schema.Constraint>> = {
	postCustomersByCustomerIDCardAccountsByCardAccountIDEphemeralKeys: PostCustomersByCustomerIDCardAccountsByCardAccountIDEphemeralKeysRequestJson,
	postCustomersByCustomerIDCardAccountsByCardAccountIDFreeze: PostCustomersByCustomerIDCardAccountsByCardAccountIDFreezeRequestJson,
	postCustomersByCustomerIDCardAccountsByCardAccountIDUnfreeze: PostCustomersByCustomerIDCardAccountsByCardAccountIDUnfreezeRequestJson,
	postCustomersByCustomerIDCardAccountsByCardAccountIDCreateMobileWalletProvisioningRequest: PostCustomersByCustomerIDCardAccountsByCardAccountIDCreateMobileWalletProvisioningRequestRequestJson
}
const optionalCardPayloadOperations = new Set(Object.keys(optionalCardPayloadSchemas))

/** JSON-only request bodies from the generated API; FormData is only valid for multipart endpoints. */
const jsonOnlyPayloadOperations = new Map<string, ReadonlySet<string>>(
	Object.entries(BridgeApi.groups).map(([groupName, group]) => [
		groupName,
		new Set(Object.entries(group.endpoints)
			.filter(([, endpoint]) => {
				const encodings = Array.from(endpoint.payload.values(), ({ encoding }) => encoding._tag)
				return encodings.includes("Json") && !encodings.includes("Multipart")
			})
			.map(([operationName]) => operationName))
	])
)

/** JSON payload schemas that can both validate and detach an execution-time snapshot. */
const jsonPayloadSchemas = new Map<string, ReadonlyMap<string, Schema.Constraint>>(
	Object.entries(BridgeApi.groups).map(([groupName, group]) => {
		const schemas = new Map<string, Schema.Constraint>()
		for (const [operationName, endpoint] of Object.entries(group.endpoints)) {
			const payloads = Array.from(endpoint.payload.values()) as ReadonlyArray<{
				readonly encoding: { readonly _tag: string }
				readonly schemas: ReadonlyArray<Schema.Constraint>
			}>
			const payloadSchemas = payloads
				.filter(({ encoding }) => encoding._tag === "Json")
				.flatMap(({ schemas }) => schemas)
			if (payloadSchemas.length !== 1) continue
			const [schema] = payloadSchemas
			if (schema !== undefined) schemas.set(operationName, schema)
		}
		return [groupName, schemas] as const
	})
)

const isFormData = (value: unknown): value is FormData =>
	typeof FormData !== "undefined" && value instanceof FormData

const snapshotRequestPart = (value: unknown): unknown => {
	if (typeof value !== "object" || value === null) return value
	return structuredClone(value)
}

/** Call-local marker for optional card payloads explicitly absent at the API. */
export const OptionalCardNoContent = Context.Reference<boolean>("@misofm/bridge/internal/OptionalCardNoContent", {
	defaultValue: () => false
})

/**
 * The generated client encodes the `NoContent` member of optional payload
 * unions as JSON `null`. Use the call-local marker instead of inspecting the
 * encoded body, so an explicit JSON `null` payload remains distinguishable.
 */
const normalizeOptionalCardMutationBody = (
	request: HttpClientRequest.HttpClientRequest
): Effect.Effect<HttpClientRequest.HttpClientRequest> =>
	Effect.map(
		Effect.contextWith((context) => Effect.succeed(Context.get(context, OptionalCardNoContent))),
		(noContent) => {
			if (!noContent || request.method !== "POST") return request
			const path = request.url.split(/[?#]/, 1)[0] ?? request.url
			if (!optionalCardMutationPath.test(path)) return request
			return HttpClientRequest.setBody(request, HttpBody.empty)
		}
	)

/** Replace the request attached to a raw response before it enters HttpApiClient. */
export const sanitizeHttpClient = (client: HttpClient.HttpClient): HttpClient.HttpClient =>
	client.pipe(
		HttpClient.mapRequestEffect(normalizeOptionalCardMutationBody),
		HttpClient.transformResponse((response) =>
			Effect.flatMap(response, (received) => {
				if (received.status < 200 || received.status >= 300) {
					// Release streamed response resources without decoding or retaining
					// the body, then report only its safe status metadata.
					return Effect.flatMap(
						Effect.ignore(
							Stream.runDrain(Stream.mapError(received.stream, safeDeferredFailure))
						),
						() => Effect.fail(bridgeHttpErrorFromResponse(received))
					)
				}
				return Effect.map(
					Effect.contextWith((context) =>
						Effect.succeed(Context.get(context, Headers.CurrentRedactedNames))
					),
					(redactedHeaderNames) => inspectableResponse(received, redactedHeaderNames)
				)
			})
		)
	) as unknown as HttpClient.HttpClient

export const apiKeyClientLayer = (apiKey: Redacted.Redacted<string>) =>
	HttpApiMiddleware.layerClient(ApiKeySecurityMiddleware, ({ request, next }) =>
		next(HttpClientRequest.setHeader(request, "Api-Key", Redacted.value(apiKey)))
	)

const requestId = (error: HttpClientError.HttpClientError): string | undefined => {
	const response = error.response
	if (response === undefined) return undefined
	return responseRequestId(response)
}

export const sanitizeFailure = (
	error: unknown,
	phase: "request" | "response" = "request",
	timeoutMs = 0
): BridgeClientError | unknown => {
	if (HttpClientError.isHttpClientError(error)) {
		const reason = error.reason
		if (reason._tag === "StatusCodeError") {
			return bridgeHttpError(error, reason.response.status, reason.request.method)
		}
		if (reason._tag === "DecodeError" || reason._tag === "EmptyBodyError") {
			const status = reason.response.status
			if (status < 200 || status >= 300) return bridgeHttpError(error, status, reason.request.method)
			const id = requestId(error)
			return new BridgeSchemaError({
				phase: "response",
				status,
				method: reason.request.method,
				...(id === undefined ? {} : { requestId: id })
			})
		}
		if (reason._tag === "TransportError" || reason._tag === "InvalidUrlError" || reason._tag === "EncodeError") {
			return new BridgeTransportError({ kind: reason._tag, method: reason.request.method })
		}
		return new BridgeTransportError({ kind: "Unknown" })
	}
	if (Schema.isSchemaError(error)) return new BridgeSchemaError({ phase })
	if (typeof error === "object" && error !== null && "_tag" in error && error._tag === "TimeoutError") {
		return new BridgeTimeoutError({ timeoutMs })
	}
	return error
}

const bridgeHttpError = (error: HttpClientError.HttpClientError, status: number, method: string) => {
	const id = requestId(error)
	return new BridgeHttpError({
		status,
		method,
		...(id === undefined ? {} : { requestId: id })
	})
}

/**
 * Apply the safe error boundary to every generated method without changing the
 * generated request/response signatures. `mapError` leaves interruption alone.
 */
export const sanitizeClientErrors = <A extends Record<string, unknown>>(
	client: A,
	options: { readonly timeoutMs?: number | undefined; readonly redactedHeaderNames: ReadonlyArray<string | RegExp> }
): A => {
	const wrapEffect = <T>(effect: Effect.Effect<T, unknown, unknown>) => {
		const withTimeout = options.timeoutMs === undefined ? effect : Effect.timeout(effect, options.timeoutMs)
		return Effect.provideService(
			Effect.provideService(
				Effect.mapError(withTimeout, (error) => sanitizeFailure(error, "request", options.timeoutMs)),
				// Effect's default HTTP client span records the full URL and query before
				// header filtering. Disable it only while a Bridge method is running.
				HttpClient.TracerDisabledWhen,
				() => true
			),
			Headers.CurrentRedactedNames,
			options.redactedHeaderNames
		)
	}

	const groups: Record<string, unknown> = {}
	for (const [groupName, group] of Object.entries(client)) {
		if (typeof group !== "object" || group === null) continue
		const operations: Record<string, unknown> = {}
		for (const [operationName, operation] of Object.entries(group)) {
			if (typeof operation !== "function") continue
			operations[operationName] = (...args: ReadonlyArray<unknown>) => {
				const effect = Effect.suspend(() => {
					const request = args[0]
					// A supplied request must be a data object. Callable objects can carry
					// getters too, but the generated client reads them lazily; rejecting
					// them here keeps those exceptions out of printable Effect defects.
					if (request !== undefined && (typeof request !== "object" || request === null)) {
						return Effect.fail(new BridgeSchemaError({ phase: "request" }))
					}
					const isOptionalCardPayloadOperation = groupName === "cards" && optionalCardPayloadOperations.has(operationName)
					const isJsonOnlyPayloadOperation = jsonOnlyPayloadOperations.get(groupName)?.has(operationName) ?? false
					let requestSnapshot: Record<string, unknown> | undefined
					let payload: unknown
					let detachedPayload: unknown
					let isJsonOnlyFormData = false
					try {
						requestSnapshot = typeof request === "object" && request !== null
							? { ...request } as Record<string, unknown>
							: undefined
						if (requestSnapshot !== undefined) {
							// Capture caller-owned request fields at execution time. Structured
							// cloning also detaches nested values and confines throwing accessors
							// or proxy traps to this request boundary.
							for (const key of ["params", "headers", "query"] as const) {
								requestSnapshot[key] = snapshotRequestPart(requestSnapshot[key])
							}
						}
						payload = requestSnapshot?.payload
						isJsonOnlyFormData = isJsonOnlyPayloadOperation && isFormData(payload)
						const schema = isOptionalCardPayloadOperation
							? optionalCardPayloadSchemas[operationName]
							: isJsonOnlyPayloadOperation
								? jsonPayloadSchemas.get(groupName)?.get(operationName)
								: undefined
						// Decode a detached JSON value so Schema never evaluates caller-owned
						// getters or proxy traps. Clone failures become a safe typed boundary
						// error; the underlying exception is intentionally discarded.
						detachedPayload = payload !== undefined && schema !== undefined && !isJsonOnlyFormData
							? structuredClone(payload)
							: payload
					} catch {
						return Effect.fail(new BridgeSchemaError({ phase: "request" }))
					}
					const hasNoPayload = requestSnapshot !== undefined && payload === undefined
					const invoke = (operationRequest: unknown = requestSnapshot ?? request) => {
						const operationArgs = requestSnapshot === undefined ? args : [operationRequest, ...args.slice(1)]
						return Reflect.apply(operation, group, operationArgs) as Effect.Effect<unknown, unknown, unknown>
					}
					const invokeWithPayload = (payloadSnapshot: unknown) =>
						invoke({ ...requestSnapshot, payload: payloadSnapshot })
					const decodeRequestPayload = (schema: Schema.Constraint) =>
						Effect.flatMap(
							Effect.catchDefect(
								Effect.suspend(() => Schema.decodeUnknownEffect(schema)(detachedPayload)),
								() => Effect.fail(new BridgeSchemaError({ phase: "request" }))
							),
							invokeWithPayload
						)
					let operationEffect: Effect.Effect<unknown, unknown, unknown>
					if (isOptionalCardPayloadOperation && payload === null) {
						operationEffect = Effect.fail(new BridgeSchemaError({ phase: "request" }))
					} else if (isJsonOnlyFormData) {
						operationEffect = Effect.fail(new BridgeSchemaError({ phase: "request" }))
					} else if (isOptionalCardPayloadOperation && requestSnapshot !== undefined && payload !== undefined) {
						const schema = optionalCardPayloadSchemas[operationName]
						operationEffect = schema === undefined
							? Effect.fail(new BridgeSchemaError({ phase: "request" }))
							: decodeRequestPayload(schema)
					} else if (isJsonOnlyPayloadOperation && requestSnapshot !== undefined && payload !== undefined) {
						const schema = jsonPayloadSchemas.get(groupName)?.get(operationName)
						operationEffect = schema === undefined
							? invoke()
							: decodeRequestPayload(schema)
					} else {
						operationEffect = invoke()
					}
					return isOptionalCardPayloadOperation && hasNoPayload
						? Effect.provideService(operationEffect, OptionalCardNoContent, true)
						: operationEffect
				})
				return wrapEffect(effect)
			}
		}
		groups[groupName] = operations
	}
	return groups as A
}

export const defaultRedactedHeaderNames = (current: ReadonlyArray<string | RegExp>) =>
	current.includes("api-key") ? current : [...current, "api-key"]
