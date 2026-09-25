import * as Effect from "effect/Effect"
import * as Redacted from "effect/Redacted"

import { Bridge, BridgeHttpError, BridgeTransportError, bridgeFetchLayer } from "@misofm/bridge"

interface Env {
	BRIDGE_API_KEY: string
	BRIDGE_API_BASE_URL?: string
	BRIDGE_ENVIRONMENT?: "production" | "sandbox"
}

const listCustomers = Effect.gen(function*() {
	const bridge = yield* Bridge
	return yield* bridge.customers.getCustomers({ query: {} })
})

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url)
		if (request.method !== "GET" || url.pathname !== "/customers") {
			return Response.json({ error: "Not found" }, { status: 404 })
		}

		// The binding is read for this invocation; do not capture a user or key in
		// module state shared by the Worker isolate.
		const layer = bridgeFetchLayer({
			apiKey: Redacted.make(env.BRIDGE_API_KEY),
			environment: env.BRIDGE_ENVIRONMENT ?? "production",
			...(env.BRIDGE_API_BASE_URL === undefined ? {} : { baseUrl: env.BRIDGE_API_BASE_URL })
		})
		try {
			const customers = await Effect.runPromise(
				listCustomers.pipe(Effect.provide(layer)),
				{ signal: request.signal }
			)
			return Response.json(customers)
		} catch (error) {
			if (request.signal.aborted) throw error
			const status = error instanceof BridgeHttpError ? 502 : error instanceof BridgeTransportError ? 503 : 502
			return Response.json({ error: "Bridge request failed" }, { status })
		}
	}
}
