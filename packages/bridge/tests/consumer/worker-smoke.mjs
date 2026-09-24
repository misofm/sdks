import assert from "node:assert/strict"

import worker from "./worker-build/worker.js"

const originalFetch = globalThis.fetch
let observed
globalThis.fetch = async (input, init) => {
	observed = { input: String(input), init }
	return new Response(JSON.stringify({ count: 1, data: [{ id: "cus_worker_test" }] }), {
		status: 200,
		headers: { "content-type": "application/json" }
	})
}

try {
	const request = new Request("https://worker.test/customers")
	const response = await worker.fetch(request, {
		BRIDGE_API_KEY: "worker-invocation-test-key",
		BRIDGE_ENVIRONMENT: "sandbox"
	})
	assert.equal(response.status, 200)
	assert.deepEqual(await response.json(), { count: 1, data: [{ id: "cus_worker_test" }] })
	assert.equal(observed.input, "https://api.sandbox.bridge.xyz/v0/customers")
	assert.equal(new Headers(observed.init?.headers).get("api-key"), "worker-invocation-test-key")
	assert.equal((await worker.fetch(new Request("https://worker.test/other"), {
		BRIDGE_API_KEY: "unused"
	})).status, 404)
	console.log("Bridge Cloudflare Worker mocked smoke: OK")
} finally {
	globalThis.fetch = originalFetch
}
