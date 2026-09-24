import * as Effect from "effect/Effect"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse"

export interface HttpFixture {
	readonly method: string
	readonly path: string
	readonly status?: number
	readonly body: unknown
	readonly headers?: Readonly<Record<string, string>>
}

export interface RecordedRequest {
	readonly request: HttpClientRequest.HttpClientRequest
	readonly url: URL
	readonly signal: AbortSignal
}

const responseBody = (body: unknown) => {
	if (body === null || body === undefined) return null
	if (body instanceof Uint8Array) return body
	return JSON.stringify(body)
}

/** A strict local fake: any request without an explicit method/path fixture defects. */
export const controlledHttpClient = (fixtures: ReadonlyArray<HttpFixture>) => {
	const calls: Array<RecordedRequest> = []
	const client = HttpClient.make((request, url, signal) => {
		calls.push({ request, url, signal })
		const fixture = fixtures.find((candidate) => candidate.method === request.method && candidate.path === url.pathname)
		if (fixture === undefined) {
			return Effect.die(new Error(`Unexpected Bridge fixture request: ${request.method} ${url.pathname}`))
		}
		const headers = new Headers(fixture.headers)
		if (!headers.has("content-type") && !(fixture.body instanceof Uint8Array)) {
			headers.set("content-type", "application/json")
		}
		return Effect.succeed(HttpClientResponse.fromWeb(
			request,
			new Response(responseBody(fixture.body), {
				status: fixture.status ?? 200,
				headers
			})
		))
	})
	return { client, calls } as const
}

/** Decode JSON serialized by the generated endpoint client for request assertions. */
export const requestJson = (request: HttpClientRequest.HttpClientRequest): unknown => {
	const body = request.body
	if (body._tag === "Empty") return undefined
	if (body._tag === "Uint8Array") return JSON.parse(new TextDecoder().decode(body.body)) as unknown
	if (body._tag !== "Raw") throw new Error(`Expected JSON request body, received ${body._tag}`)
	const value = body.body
	if (typeof value === "string") return JSON.parse(value) as unknown
	if (value instanceof Uint8Array) return JSON.parse(new TextDecoder().decode(value)) as unknown
	throw new Error(`Expected a serialized JSON request body, received ${typeof value}`)
}
