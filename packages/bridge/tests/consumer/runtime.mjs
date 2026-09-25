import assert from "node:assert/strict"

import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse"

import { Bridge, bridgeLayer } from "@misofm/bridge"
import { Bridge as BridgeSubpath } from "@misofm/bridge/bridge"
import { BridgeApi } from "@misofm/bridge/generated"
import { BridgeTransportError } from "@misofm/bridge/errors"
import { BridgePaginationLimitError } from "@misofm/bridge/pagination"
import { WebhookError } from "@misofm/bridge/webhooks"

const calls = []
const http = HttpClient.make((request, url, signal) => {
	calls.push({ request, url, signal })
	return Effect.succeed(HttpClientResponse.fromWeb(
		request,
		new Response(JSON.stringify({ count: 0, data: [] }), {
			status: 200,
			headers: { "content-type": "application/json" }
		})
	))
})
const layer = bridgeLayer({
	apiKey: Redacted.make("node-consumer-test-key"),
	baseUrl: "https://bridge.test/v0"
}).pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, http)))
const result = await Effect.runPromise(Effect.gen(function*() {
	const bridge = yield* Bridge
	return yield* bridge.customers.getCustomers({ query: {} })
}).pipe(Effect.provide(layer)))

assert.equal(result.count, 0)
assert.equal(result.data.length, 0)
assert.equal(calls.length, 1)
assert.equal(calls[0].url.href, "https://bridge.test/v0/customers")
assert.equal(calls[0].request.headers["api-key"], "node-consumer-test-key")
assert.equal(typeof BridgeApi, "function")
assert.equal(BridgeSubpath, Bridge)
assert.equal(BridgeTransportError.name, "BridgeTransportError")
assert.equal(BridgePaginationLimitError.name, "BridgePaginationLimitError")
assert.equal(WebhookError.name, "WebhookError")

console.log("Bridge packed Node ESM consumer: OK")
