# @misofm/musicos

`@misofm/musicos` is the object model of works. Everything Miso offers on top
of it — work extensions, royalty primitives, Party extensions, and every
product-specific workflow — is platform, and lives in
[`@misofm/platform`](../platform/README.md); the Party object model itself is
[`@misofm/partyos`](../partyos/README.md). This package holds ONLY the
typed bindings, queries, event decoders, and PTB builders for the `musicos`
Move package: Composition, Recording, Release, and Track.

Every read is an [Effect](https://effect.website): nothing performs I/O or can
fail without saying so in its return type. Reads require the `SuiClient`
service from [`@misofm/effect`](../effect/README.md) instead of taking a
client parameter, and failures are typed (`ObjectNotFoundError`,
`BcsDecodeError`, ...) instead of thrown. PTB builders (`transactions.ts`)
stay plain, synchronous functions — they only append commands to a
caller-owned `Transaction`.

## Usage

Register the `miso()` client extension on any `@mysten/sui` Core-API client,
then run its methods as `Effect` programs:

```ts
import { Effect } from "effect";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { miso } from "@misofm/musicos/client";

const client = new SuiGrpcClient({ network: "testnet" }).$extend(miso());

const program = Effect.gen(function* () {
  const composition = yield* client.miso.getCompositionById("0x...");
  const release = yield* client.miso.getReleaseById("0x...");
  return { composition, release };
});

const { composition, release } = await Effect.runPromise(program);
```

### Events

The client exposes both camelCase event parsers and raw BCS decoders. CamelCase
parsers preserve every event field, while `client.miso.parse.events.core` keeps
the generated snake_case layout for indexers that need the ABI surface:

```ts
const created = client.miso.parse.compositionCreatedEvent(eventBytes);
// { compositionId, titleBytes, shareSupplyBefore, ... }
const raw = client.miso.parse.events.core.compositionCreated(eventBytes);
// { composition_id, title_bytes, share_supply_before, ... }
```

Addresses and IDs are strings. `u64` and `u256` values are decimal strings;
`u8`/`u16` values are numbers, byte vectors are `number[]`, and address and
`u64` vectors preserve their order. Title and digest bytes remain undecoded.
`CompositionSharesGrantedEvent` remains available for historical data and is
dormant in the current recording creation flow, which emits
`RecordingCreatedEvent`.

`client.miso.*` methods already have `R = never` — the client extension
provides `SuiClient` (and `SuiGraphQL`, when `graphqlClient` was passed to
`miso()`) internally from the `ClientWithCoreApi` it was registered on.

### Using the free functions directly

`queries.ts`, `view.ts`, and `execute.ts` export the same reads and writes as
free functions that declare `SuiClient` (and `SuiGraphQL`, for the two
type-discovery reads) in their `Effect` requirements. Provide the service
once at your program's boundary:

```ts
import { Effect } from "effect";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SuiClient } from "@misofm/effect";
import { getCompositionById, getReleaseById } from "@misofm/musicos/queries";

const client = new SuiGrpcClient({ network: "testnet" });

const program = Effect.gen(function* () {
  const composition = yield* getCompositionById("0x...");
  const release = yield* getReleaseById("0x...");
  return { composition, release };
}).pipe(Effect.provide(SuiClient.layer(client)));

const { composition, release } = await Effect.runPromise(program);
```

`miso()` resolves the bundled, verified `MISO_DEPLOYMENTS` manifest for the
client's network by default. Pass an explicit `deployment` to override it —
either the minimal `{ packageId }` shape (core calls, types, and derived IDs
only) or a complete `MisoDeployment` (also unlocks `client.miso.packages`,
the full generated call/BCS bindings bound to that manifest).

## Errors

`@misofm/musicos/errors` re-exports the shared `@misofm/effect` error
vocabulary — this package has no failure modes of its own beyond the Sui
read/write primitives every read is built from:

| Error | When |
| --- | --- |
| `ObjectNotFoundError` | An object id (Composition, Recording, Release, an admin cap, ...) does not exist on-chain. |
| `BcsDecodeError` | The generated codec's `.parse` threw, or the parsed value failed schema validation into the domain type. |
| `SuiRpcError` | A Core API or GraphQL call threw or rejected for a reason other than a missing object. |
| `GraphQLUnavailableError` | `getWorkAddressesByShareTypes`, `getCompositionByShareType`, or `getRecordingByShareType` was called without a `graphqlClient`. |
| `TransactionFailedError` | A submitted transaction executed but its effects reported failure. |
| `DeploymentError` | `validateMisoDeployment` was given a manifest that fails validation. |

Recover from a specific error with `Effect.catchTag` instead of an
`isNotFound(error)`-style predicate:

```ts
import { Effect } from "effect";

const program = client.miso.getCompositionById(id).pipe(
  Effect.catchTag("ObjectNotFoundError", (error) =>
    Effect.logWarning(`missing composition: ${error.objectId}`).pipe(Effect.as(null)),
  ),
);

const composition = await Effect.runPromise(program);
```

## Exports

| Subpath                    | Purpose                                                 |
| --------------------------- | --------------------------------------------------------- |
| `@misofm/musicos`           | Root entrypoint                                          |
| `@misofm/musicos/client`    | Client construction (`miso()`, `MisoProtocolClient`)     |
| `@misofm/musicos/deployments` | Deployed package IDs by network                        |
| `@misofm/musicos/queries`   | Read queries over Composition, Recording, Release, Track (`Effect`, requires `SuiClient`) |
| `@misofm/musicos/transactions` | PTB command builders (synchronous)                     |
| `@misofm/musicos/execute`  | Transaction execution helpers (re-exported from `@misofm/effect/execute`) |
| `@misofm/musicos/view`     | `simulateTransaction`-backed view helpers (`Effect`, requires `SuiClient`) |
| `@misofm/musicos/types`    | Shared domain types (`Schema.Class`)                       |
| `@misofm/musicos/parsers`  | Event parsers (pure)                                        |
| `@misofm/musicos/events`   | Event decoders (pure)                                        |
| `@misofm/musicos/packages` | Module→package bindings                                    |
| `@misofm/musicos/errors`   | Tagged errors (re-exported from `@misofm/effect/errors`)    |
| `@misofm/musicos/contracts` and `@misofm/musicos/contracts/*` | Generated ABI-bound bindings (BCS structs + Move calls) |

## Deployment manifest

`MisoDeployment` has exactly one key, `musicos` — the published `musicos`
package address. `MISO_DEPLOYMENTS` bundles the verified immutable manifest
per network (currently `testnet`); `getMisoDeployment(network)` resolves it,
failing closed for networks without a bundled manifest. Pass an explicit
manifest to `miso({ deployment })` to override it, e.g. for a local or
freshly-published deployment. `validateMisoDeployment(input)` is the
`Effect`-returning form of `assertMisoDeployment`/`normalizeMisoDeployment`,
for callers already composing `Effect` programs at a configuration boundary.

## Everything else is platform

Work extensions (composition/recording/release credits, advisory ratings,
genres, DSP links, cover art, ...), royalty primitives (royalty pools,
stakes, routed stakes), the Party extensions, and every other first-party
Move package live in `@misofm/platform`; the `partyos` object model has its
own package, `@misofm/partyos`. See
[`sui-codegen.config.ts`](../../sui-codegen.config.ts) at the repo root for
the authoritative list of Move packages and which generated tree each one
lands in.

## Install

```sh
bun add @misofm/musicos @misofm/effect effect
```

Peer dependencies: `@mysten/sui@2.29.0` and `effect@4.0.0-rc.112` (both exact).

## License

Apache-2.0
