# `@misofm/bridge`

An Effect v4 client for the Bridge API. It derives its operation and model
types from the pinned Bridge OpenAPI snapshot, adds a portable authenticated
client, and includes cursor pagination and webhook signature helpers. The
package does not start a runtime for you.

## Install and make a request

Install the SDK and the exact Effect version it was built and checked with:

```sh
npm install @misofm/bridge effect@4.0.0-rc.112
```

Provide the key as an Effect `Redacted` value. `Bridge.layerFetch` supplies the
standard Fetch transport; callers with their own transport can provide
`HttpClient.HttpClient` to `Bridge.layer` instead.

```ts
import * as Effect from "effect/Effect"
import * as Redacted from "effect/Redacted"
import { Bridge, bridgeFetchLayer } from "@misofm/bridge"

const listCustomers = Effect.gen(function*() {
  const bridge = yield* Bridge
  return yield* bridge.customers.getCustomers({ query: { limit: 25 } })
})

const customers = await Effect.runPromise(
  listCustomers.pipe(Effect.provide(bridgeFetchLayer({
    apiKey: Redacted.make(process.env.BRIDGE_API_KEY ?? ""),
    environment: "sandbox"
  })))
)
```

The key is read by the application and wrapped before it reaches the client.
The SDK validates configuration without putting key or URL values in its
configuration errors. It defaults to production; select `sandbox` deliberately
for sandbox credentials. `baseUrl` can override either root for an approved
proxy or a controlled test. Fetch redirects are returned to the caller without
forwarding the `Api-Key` header.

The complete 134-operation generated client is under the root `Bridge` service,
grouped by lower-camel-case API tag. The root module exports the client,
configuration, and client errors. Other public entry points are:

| Import | Contents |
| --- | --- |
| `@misofm/bridge` | Client, configuration, safe client errors |
| `@misofm/bridge/bridge` | Client service and constructors |
| `@misofm/bridge/generated` | Generated `BridgeApi`, request/response schemas and model types |
| `@misofm/bridge/pagination` | Lazy cursor streams and pagination errors |
| `@misofm/bridge/webhooks` | Signature verification and event-envelope helpers |
| `@misofm/bridge/errors` | Safe client and configuration error classes |

Every entry point is emitted as ESM JavaScript plus TypeScript declarations.

## Miso Worker and other Fetch hosts

The copyable [Cloudflare Worker example](examples/cloudflare-worker/README.md)
reads `env.BRIDGE_API_KEY` in the request handler, creates the Bridge layer for
that invocation, and passes `request.signal` to `Effect.runPromise`. This keeps
credentials invocation-scoped even when Cloudflare reuses an isolate. The
example's Worker secret binding is named in `wrangler.jsonc`; bind its value
with Wrangler outside source control.

The handler maps client failures to a generic response and does not return
upstream bodies or log the key. For a different host, use the same pattern:
create the config from that invocation's secret, provide the layer, and run the
Effect only at the host boundary.

## Errors, cancellation, and writes

Each operation returns a lazy Effect. Its error channel contains that endpoint's
safe SDK errors:

- `BridgeConfigurationError` for invalid configuration;
- `BridgeHttpError` for every non-2xx HTTP response, with only status, method,
  and an optional request ID. The response body is drained for cleanup but is
  never decoded or retained in the error, including when a method requests
  `response-only` mode;
- `BridgeTransportError`, `BridgeSchemaError`, and `BridgeTimeoutError` for
  sanitized transport, request/response schema, or configured timeout failures;

Successful `response-only` calls return a response facade. Its deferred body
readers and stream sanitize later failures using the same public error types.
When the host runs the Effect, `Effect.runPromiseExit` preserves the full
`Exit`/interruption information. `Effect.runPromise` rejects on a failure. Do
not log raw causes or include upstream response bodies in public errors; the
SDK intentionally scrubs those values. A `timeoutMs` config applies a timeout
per request. Effect interruption is forwarded to Fetch using its `AbortSignal`;
interruption cannot undo work that Bridge has already accepted.

For URL privacy, Bridge HTTP client spans and automatic trace header propagation
are suppressed while a Bridge operation runs. In particular, KYC links and
query strings are not recorded as HTTP span attributes or forwarded in
`traceparent` / `tracestate`. A caller's own surrounding span remains available,
but the outgoing Bridge request is not represented by an HTTP client span.

The SDK does not retry writes. Supply an operation's `Idempotency-Key` header
only where that generated operation accepts it, and reuse the same key when the
upstream contract supports safe reconciliation. A timeout or transport failure
after a write can leave its remote outcome unknown; inspect or reconcile that
operation before retrying. Bridge explicitly disallows the header on API-key
creation. The pinned contract omits it for four other POST operations; see
[upstream contract notes](docs/UPSTREAM.md).

Keep the generated request types intact at call sites. A type-erased call that
passes `undefined` to an operation requiring path parameters can still send a
request with unresolved path placeholders (for example, card freeze). The SDK
rejects malformed supplied JSON bodies before I/O, but does not guarantee that
every invalid type-erased request argument is rejected before transport. Do not
use such calls for financial mutations; this remains a pre-publication hardening
item.

## Cursor pagination

`paginateBridge` and `paginateBridgeRewards` return lazy Effect Streams, so
consumers can stop early and avoid fetching later pages. The standard helper
uses `starting_after` or `ending_before`, caps page size at 100, and requires a
stable item ID extractor. Rewards history uses its separate `cursor` and
`pagination.next_cursor` contract and caps at 90. Invalid sizes and cursor
cycles are typed failures. Pending card authorizations are explicitly
unpaginated and should not use these helpers.

For example, a customer list can stream page by page:

```ts
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import * as Redacted from "effect/Redacted"
import { Bridge, bridgeFetchLayer } from "@misofm/bridge"
import { paginateBridge } from "@misofm/bridge/pagination"

const firstTenProgram = Effect.gen(function*() {
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
}).pipe(Effect.provide(bridgeFetchLayer({
  apiKey: Redacted.make(process.env.BRIDGE_API_KEY ?? ""),
  environment: "sandbox"
})))

const firstTen = await Effect.runPromise(firstTenProgram)
```

The page stream carries through the underlying request's errors, along with
`BridgePaginationLimitError` and `BridgePaginationCursorError`.

## Webhooks

Verify the exact raw request bytes before decoding the payload. The helpers
validate Bridge's `X-Webhook-Signature`, recommended ten-minute timestamp
window, RSA PKCS#1 v1.5 / SHA-256 signature, and can then run a caller-supplied
Effect Schema decoder. Web Crypto is required. The caller owns durable event-ID
deduplication and delivery/retry policy; signature verification alone does
not provide exactly-once processing.

Bridge's documentation describes qualified `event_type` values such as
`customer.created`, while the pinned generated `WebhookEvent` enum lists suffix
values such as `created`. For deployments receiving qualified values, choose a
decoder that preserves the observed string rather than assuming the generated
enum accepts every documented example. The webhook helper keeps decoding in the
consumer's control for this reason.

## Upstream scope and known gaps

The generated API and schemas are based on the official OpenAPI snapshot
retrieved 2026-09-23. Regenerate only after reviewing the upstream diff and the
stable operation manifest. The snapshot includes three deprecated operations
and four operations marked `x-hidden`; they remain in the generated contract
for completeness and are not recommendations for new integrations.

Some upstream examples conflict with that same snapshot: customer examples
include `type` although the component omits it, show `last_name: null` where the
schema says string, and omit `count` although the customer list response
requires it. A narrow output-only adjustment accepts `last_name: null`, the
documented structured associated-person value in `requirements.complete`, and
an omitted `count` on `GET /customers`. Create and update input schemas remain
strict, `data` remains required, `count` must be an integer when present, and
`Customer.type` is not added to the generated model. These adjustments cover
the pinned examples; live Bridge response behavior has not been sampled.

Transfer response `currency` remains required by the generated schema, while
all published transfer examples omit it. There has been no live response or
Bridge confirmation to resolve that difference, so whether production returns
`currency` remains unconfirmed. Other narrow generation normalizations and the
complete coverage evidence are listed in [upstream contract notes](docs/UPSTREAM.md).

## Development checks

From the monorepo root:

```sh
bun run --filter @misofm/bridge typecheck
bun run --filter @misofm/bridge test
bun run --filter @misofm/bridge build
bun run --filter @misofm/bridge generate:check
bun run --filter @misofm/bridge test:consumer
bun run --filter @misofm/bridge test:workerd
```

The packed-consumer check installs a real tarball into a temporary Node ESM
project, verifies every exported JavaScript/declaration path, typechecks all
subpaths, performs a mocked runtime API call, and compiles/runs the Worker
example with mocked Fetch. It needs no Bridge credentials or live Bridge calls.
The separate workerd check starts the example with pinned Wrangler under local
workerd, sends its request to a temporary mock Bridge server, and checks the
`GET /customers` path and synthetic API key. It also needs no live Bridge or
Cloudflare account and never deploys a Worker.
