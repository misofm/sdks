import * as Effect from "effect/Effect"
import * as Redacted from "effect/Redacted"
import * as Stream from "effect/Stream"

import {
	Bridge,
	BridgeConfigurationError,
	BridgeHttpError,
	bridgeFetchLayer,
	type BridgeClient,
	type BridgeConfig
} from "@misofm/bridge"
import { Bridge as BridgeSubpath } from "@misofm/bridge/bridge"
import { BridgeApi, Customer } from "@misofm/bridge/generated"
import { BridgeConfigurationError as ConfigurationErrorSubpath } from "@misofm/bridge/errors"
import { paginateBridge } from "@misofm/bridge/pagination"
import { verifyWebhookSignature, type WebhookEventEnvelope } from "@misofm/bridge/webhooks"

const config: BridgeConfig = {
	apiKey: Redacted.make("example-only-key"),
	environment: "sandbox"
}
const layer = bridgeFetchLayer(config)
declare const api: BridgeClient
const customers = api.customers.getCustomers({ query: {} })
const model = Customer
const contract = BridgeApi
const clientConstructor = Bridge
const alternateClientConstructor = BridgeSubpath
const configFailure = new BridgeConfigurationError({ field: "apiKey" })
const configFailureFromSubpath = new ConfigurationErrorSubpath({ field: "apiKey" })
const httpFailure = new BridgeHttpError({ status: 503, method: "GET" })
const pages = paginateBridge<{ status: string }, { id: string }, never, never>(
	{ limit: 10, status: "active" },
	() => Effect.succeed({ data: [{ id: "cus_example" }], has_more: false }),
	{ getId: (customer) => customer.id }
)
const customerPageExample = Effect.gen(function*() {
	const bridge = yield* Bridge
	const allCustomers = paginateBridge(
		{ limit: 100 },
		(query) => bridge.customers.getCustomers({ query }),
		{
			getId: (customer) =>
				typeof customer === "object" && customer !== null && "id" in customer &&
					typeof customer.id === "string"
					? customer.id
					: undefined
		}
	)
	return yield* Stream.runCollect(Stream.take(allCustomers, 10))
}).pipe(Effect.provide(bridgeFetchLayer(config)))
const webhook: WebhookEventEnvelope = {
	api_version: "v0",
	event_id: "evt_example",
	event_category: "future.category",
	event_type: "future.event",
	event_object: {},
	event_created_at: "2026-09-24T00:00:00Z"
}
const verifier = verifyWebhookSignature

void [layer, customers, model, contract, clientConstructor, alternateClientConstructor, configFailure,
	configFailureFromSubpath, httpFailure, pages, customerPageExample, webhook, verifier]
