import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as HttpApi from "effect/unstable/httpapi/HttpApi"
import * as HttpApiClient from "effect/unstable/httpapi/HttpApiClient"
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint"
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup"
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse"
import * as UrlParams from "effect/unstable/http/UrlParams"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as Headers from "effect/unstable/http/Headers"

import { BridgeApi } from "./generated/BridgeApi.js"
import { BridgeConfigurationError, BridgeSchemaError, type BridgeClientError } from "./Errors.js"
import { resolveConfig, type BridgeConfig } from "./Config.js"
import {
	apiKeyClientLayer,
	defaultRedactedHeaderNames,
	sanitizeClientErrors,
	sanitizeHttpClient
} from "./internal/http.js"

type ApiGroups = typeof BridgeApi extends HttpApi.HttpApi<infer _Id, infer Groups> ? Groups : never

type ClientResponseMode = HttpApiEndpoint.ClientResponseMode

/** A response facade whose deferred body failures use the same safe SDK errors. */
export type BridgeHttpClientResponse = Omit<
	HttpClientResponse.HttpClientResponse,
	"json" | "text" | "urlParamsBody" | "arrayBuffer" | "formData" | "stream"
> & {
	readonly json: Effect.Effect<Schema.Json, BridgeClientError>
	readonly text: Effect.Effect<string, BridgeClientError>
	readonly urlParamsBody: Effect.Effect<UrlParams.UrlParams, BridgeClientError>
	readonly arrayBuffer: Effect.Effect<ArrayBuffer, BridgeClientError>
	readonly formData: Effect.Effect<FormData, BridgeClientError>
	readonly stream: Stream.Stream<Uint8Array, BridgeClientError>
}

type ResponseType<Success, Mode extends ClientResponseMode> = [Mode] extends ["decoded-and-response"]
	? [Success, BridgeHttpClientResponse]
	: [Mode] extends ["response-only"] ? BridgeHttpClientResponse
	: Success

type SuccessType<Success extends Schema.Constraint> = Success extends HttpApiSchema.WithHeaders<
	infer Inner,
	infer ResponseHeaders
> ? HttpApiSchema.withHeaders<SuccessType<Inner & Schema.Constraint>, ResponseHeaders["Type"]>
	: Success["Type"]

type SuccessDecodingServices<Success extends Schema.Constraint> = Success extends HttpApiSchema.WithHeaders<
	infer Inner,
	infer _ResponseHeaders
> ? SuccessDecodingServices<Inner & Schema.Constraint>
	: Success["DecodingServices"]

type EndpointServices<Endpoint extends HttpApiEndpoint.ConstraintRequest, Mode extends ClientResponseMode> =
	| Endpoint["~Params"]["EncodingServices"]
	| Endpoint["~Query"]["EncodingServices"]
	| Endpoint["~Payload"]["EncodingServices"]
	| Endpoint["~Headers"]["EncodingServices"]
	| ([Mode] extends ["response-only"] ? never
		: SuccessDecodingServices<Endpoint["~Success"]>)

type Method<Endpoint extends HttpApiEndpoint.ConstraintRequest> = <
	Mode extends ClientResponseMode = "decoded-only"
>(
	request: HttpApiEndpoint.ClientRequest<
		Endpoint["~Params"],
		Endpoint["~Query"],
		Endpoint["~Payload"],
		Endpoint["~Headers"],
		Mode
	>
) => Effect.Effect<
	ResponseType<SuccessType<Endpoint["~Success"]>, Mode>,
	BridgeClientError,
	EndpointServices<Endpoint, Mode>
>

type GroupClient<Group extends HttpApiGroup.Constraint> = {
	readonly [EndpointName in keyof Group["endpoints"]]: Group["endpoints"][EndpointName] extends HttpApiEndpoint.ConstraintRequest
		? Method<Group["endpoints"][EndpointName]>
		: never
}

/**
 * Typed groups and methods derived from the generated `BridgeApi`. Transport
 * and schema failures use safe Bridge error types. Non-2xx Bridge response
 * bodies are not decoded into public errors.
 */
export type BridgeClient = {
	readonly [Group in ApiGroups as HttpApiGroup.Identifier<Group>]: GroupClient<Group>
}

/**
 * The authenticated Bridge client. The consumer owns the Effect runtime and
 * supplies `HttpClient` through a Layer, or uses `layerFetch` for Fetch.
 */
export class Bridge extends Context.Service<Bridge, BridgeClient>()("@misofm/bridge/Bridge") {
	static make(config: BridgeConfig): Effect.Effect<BridgeClient, BridgeConfigurationError, HttpClient.HttpClient> {
		return makeBridgeClient(config)
	}

	static layer(config: BridgeConfig): Layer.Layer<Bridge, BridgeConfigurationError, HttpClient.HttpClient> {
		return bridgeLayer(config)
	}

	static layerFetch(config: BridgeConfig): Layer.Layer<Bridge, BridgeConfigurationError> {
		return bridgeFetchLayer(config)
	}
}

/**
 * Build a typed client from the `HttpClient` service in the Effect context.
 * This does not run a runtime and does not issue a request.
 */
export const makeBridgeClient = (
	config: BridgeConfig
): Effect.Effect<BridgeClient, BridgeConfigurationError, HttpClient.HttpClient> =>
	Effect.gen(function*() {
		const resolved = yield* Effect.fromResult(resolveConfig(config))
		const httpClient = yield* HttpClient.HttpClient
		const redactedHeaderNames = defaultRedactedHeaderNames(yield* Headers.CurrentRedactedNames)
		const apiClient = yield* HttpApiClient.makeWith(BridgeApi, {
			httpClient: sanitizeHttpClient(httpClient),
			baseUrl: resolved.baseUrl,
			transformResponse: (effect) =>
				Effect.mapError(effect, (error) => {
					if (Schema.isSchemaError(error)) {
						return new BridgeSchemaError({ phase: "response" })
					}
					return error
				})
		}).pipe(Effect.provide(apiKeyClientLayer(resolved.apiKey)))
		return sanitizeClientErrors(apiClient, {
			timeoutMs: resolved.timeoutMs,
			redactedHeaderNames
		}) as unknown as BridgeClient
	})

/** A layer that uses an injected `HttpClient.HttpClient` implementation. */
export const bridgeLayer = (
	config: BridgeConfig
): Layer.Layer<Bridge, BridgeConfigurationError, HttpClient.HttpClient> =>
	Layer.effect(Bridge, makeBridgeClient(config))

/**
 * Fetch implementation with redirects disabled. A redirect is returned to the
 * caller as a response, so the `Api-Key` header is never forwarded to a new URL.
 */
export const bridgeFetchLayer = (config: BridgeConfig): Layer.Layer<Bridge, BridgeConfigurationError> =>
	bridgeLayer(config).pipe(
		Layer.provideMerge(
			Layer.mergeAll(
				FetchHttpClient.layer,
				Layer.succeed(FetchHttpClient.RequestInit, { redirect: "manual" })
			)
		)
	)
