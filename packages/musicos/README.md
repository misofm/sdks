# @misofm/musicos

`@misofm/musicos` is the object model of works. Everything Miso offers on top
of it — work extensions, royalty primitives, Party extensions, and every
product-specific workflow — is platform, and lives in
[`@misofm/platform`](../platform/README.md); the Party object model itself is
[`@misofm/partyos`](../partyos/README.md). This package holds ONLY the
typed bindings, reads, event decoders, and PTB builders for the `musicos`
Move package: Composition, Recording, Release, and Track.

`@misofm/musicos` is a [sui-effect](https://github.com/unconfirmedlabs/sui-effect)
extension: one `Context.Service` (`Musicos`), built on `sui-effect`'s `Sui`,
whose members are `Effect`s with closed error unions, whose writes are PTB
fragments a consumer composes and submits once, and whose Promise face is
derived — never hand-written — by `SuiExtension.fromService`. See
`node_modules/@unconfirmed/sui-effect/docs/extensions.md` for the contract every extension
in this codebase follows.

## Install

```sh
bun add @misofm/musicos @unconfirmed/sui-effect effect @mysten/sui @mysten/bcs
```

Peer dependencies: `@unconfirmed/sui-effect@^0.1.0`, `effect@>=4.0.0-rc.112 <4.1`,
`@mysten/sui@^2.28`, `@mysten/bcs@^2.1.1`.

## Usage

### Effect

```ts
import { Effect } from "effect"
import { ObjectId } from "@unconfirmed/sui-effect"
import { Sui, SuiCore } from "@unconfirmed/sui-effect"
import { Musicos } from "@misofm/musicos"

const program = Effect.gen(function* () {
  const musicos = yield* Musicos
  const release = yield* musicos.getReleaseById(ObjectId.make("0x..."))
  const composition = yield* musicos.getCompositionById(ObjectId.make("0x..."))
  return { release, composition }
})

const { release, composition } = await program.pipe(
  Effect.provide(Musicos.layer()),
  Effect.provide(Sui.layerNoDeps),
  Effect.provide(SuiCore.layerGrpc({ network: "testnet", baseUrl: "https://..." })),
  Effect.runPromise,
)
```

Inside a `Script` or an existing `sui-effect`-based program, just `yield*
Musicos` after providing `Musicos.layer()` (or `layerConfig`) over the `Sui`
your program already has.

### Promise

```ts
import { SuiGrpcClient } from "@mysten/sui/grpc"
import { ObjectId, SuiAddress } from "@unconfirmed/sui-effect"
import { musicos } from "@misofm/musicos"

const client = new SuiGrpcClient({ network: "testnet", baseUrl: "https://..." }).$extend(musicos())

// The face keeps a member's argument types, including branded ones: `ObjectId.make` / `SuiAddress.make` a plain string at the boundary.
const release = await client.musicos.getReleaseById(ObjectId.make("0x..."))
const derivedId = await client.musicos.view.deriveTargetReleaseId({
  sender: SuiAddress.make("0x..."),
  recordingIds: [ObjectId.make("0x...")],
  splitBps: [10_000],
  nonce: 1,
  releaseRegistryId: ObjectId.make("0x..."),
})

await client.musicos.dispose()
```

`register(client)` does no work until the first `await`, so before that,
`client.musicos.packageId` and `client.musicos.deployment` are **not** their
real values — and not Promises either. Until the runtime exists the face
does not know what a member *is*, so both come back as opaque placeholders
(`packageId` reads as a plain string; `deployment` is a plain object, so the
face maps it as a namespace). Using either as its real type is what throws:
coercing `packageId` to a string (`` `${client.musicos.packageId}` ``,
`String(...)`) throws `ExtensionNotReady`, naming itself, and reading a
property off `deployment` (e.g. `.packageId`) just returns another
placeholder rather than the real value. `await client.musicos.$ready()`
once after `$extend` makes both real from then on.

### Building a transaction

The seven builders in `transactions.ts` are `Recipe` fragments — a
caller-owned `Transaction` first, by-value results returned for threading —
composed with each other and with fragments from other extensions in one PTB,
then submitted once:

```ts
import { Transaction } from "@mysten/sui/transactions"
import { Tx } from "@unconfirmed/sui-effect/tx"
import { createComposition, publishComposition } from "@misofm/musicos/transactions"

const recipe = (tx: Transaction) => {
  const parts = createComposition(tx, {
    title: "A Song",
    royaltyRateBps: 1000,
    shareType,
    shareCurrencyId,
    shareTreasuryCapId,
    misoPackageId,
  })
  publishComposition(tx, { composition: parts.composition, adminCap: parts.adminCap, shareType, misoPackageId })
}

const executed = await Effect.runPromise(Tx.run(recipe, { signer }).pipe(/* provide Sui */))
```

`Musicos` itself never submits — there is no `Tx.run` member on the service —
because every write to the object model is a fragment a consumer composes.

### Events

Camel-case decoders (`parsers.ts`) preserve every event field; the raw
registry (`events.ts`, `eventParsers.core.*`) keeps the generated snake_case
layout for indexers that need the ABI surface. Both fail with `DecodeError`
instead of throwing, and both take either raw bytes or a sui-effect `Event`
(whose `.bcs` is the same bytes, straight from `Executed.events`):

```ts
import { parseCompositionCreatedEvent } from "@misofm/musicos"

const created = await Effect.runPromise(parseCompositionCreatedEvent(eventBytes))
// { compositionId, titleBytes, shareSupplyBefore, ... }

// or, for an event straight off `Executed.events`:
const same = await Effect.runPromise(parseCompositionCreatedEvent(executed.events[0]))
```

Addresses and IDs are strings. `u64` and `u256` values are decimal strings;
`u8`/`u16` values are numbers, byte vectors are `number[]`, and address and
`u64` vectors preserve their order. Title and digest bytes remain undecoded.
`CompositionSharesGrantedEvent` remains available for historical data and is
dormant in the current recording creation flow, which emits
`RecordingCreatedEvent`.

### GraphQL type discovery

Three reads — `getCompositionByShareType`, `getRecordingByShareType`,
`getWorkAddressesByShareTypes` — resolve a share type to the work object that
carries it, which the Core API cannot express (a type filter needs every
type parameter or none). These stay standalone `Effect` functions on
sui-effect's shared `SuiGraphQL` tag rather than `Musicos` service members,
so a consumer without a GraphQL endpoint is never forced to provide one just
to build the service. `SuiGraphQL.layerUnavailable`'s rejection,
`GraphQLUnavailable`, is not folded into `TransportError`: it lets through
as its own tag, so a caller can tell "no endpoint configured" apart from
"the endpoint answered badly". A share type no work carries is
`musicos/WorkNotFound` — there is no object id to name `ObjectNotFound`
with, since naming one is exactly what the search came up empty on:

```ts
import { Effect } from "effect"
import { SuiGraphQL } from "@unconfirmed/sui-effect"
import { getCompositionByShareType } from "@misofm/musicos"

const program = getCompositionByShareType(shareType, packageId).pipe(
  Effect.provide(SuiGraphQL.layer(graphqlClient)),
  /* provide Sui too */
)
```

## Errors

`@misofm/musicos/errors` re-exports the sui-effect taxonomy this package
reads and writes through, plus its own three tags:

| Error | Outcome | When |
| --- | --- | --- |
| `musicos/TreasuryCapNotFound` | `not_applied` | No `TreasuryCap<shareType>` is owned by the given address. |
| `musicos/WorkNotFound` | `not_applied` | `getCompositionByShareType` / `getRecordingByShareType`'s GraphQL discovery found no work carrying that share type. |
| `musicos/DeploymentInvalid` | `not_applied` | `Musicos.layer`'s `deployment` option failed validation, or this release bundles no manifest for the client's network. |
| `ObjectNotFound` / `ObjectDeleted` / `ObjectUnavailable` | `not_applied` | An id does not exist, has been deleted, or the node could not say. |
| `DecodeError` | `not_applied` | The object's on-chain type did not match what was expected, its BCS content did not decode, or a caller-supplied `shareType` did not form a valid Move type. |
| `GraphQLUnavailable` | `not_applied` | The three GraphQL reads' `SuiGraphQL` has no usable endpoint. |
| `TransportError` | `not_applied` | A Core API or GraphQL call did not reach a usable answer. |
| `SimulationFailed` / `BuildError` | `not_applied` | `view.deriveTargetReleaseId`'s simulation failed, or the recipe it built threw (a `recordingIds`/`splitBps` length mismatch). |

Recover from a specific error with `Effect.catchTag`:

```ts
import { Effect } from "effect"

const program = musicos.getCompositionById(id).pipe(
  Effect.catchTag("ObjectNotFound", (error) =>
    Effect.logWarning(`missing composition: ${error.objectId}`).pipe(Effect.as(null))),
)
```

## Exports

| Subpath | Purpose |
| --- | --- |
| `@misofm/musicos` | `Musicos` service, `musicos()` registration, domain types, PTB fragments, event decoders, deployment manifest, package bindings, the three GraphQL reads |
| `@misofm/musicos/deployments` | Deployed package IDs by network |
| `@misofm/musicos/queries` | The three GraphQL type-discovery reads and the pure type-parameter helpers, kept as their own subpath for existing importers |
| `@misofm/musicos/transactions` | PTB fragment builders (synchronous) |
| `@misofm/musicos/types` | Shared domain types (`Schema.Class`) |
| `@misofm/musicos/parsers` | Event decoders, camelCase (`Effect<T, DecodeError>`) |
| `@misofm/musicos/events` | Event decoders, raw registry (`Effect<T, DecodeError>`) |
| `@misofm/musicos/packages` | Module→package bindings |
| `@misofm/musicos/errors` | Tagged errors (own two, plus the sui-effect taxonomy) |
| `@misofm/musicos/contracts` and `@misofm/musicos/contracts/*` | Generated ABI-bound bindings (BCS structs + Move calls) |

`./execute` and `./client` (`MisoProtocolClient`, `miso()`) no longer exist:
platform builds its own client surface over `Musicos.layer` (misofm/sdks#35).
`./view`'s one function is now `Musicos`'s `view.deriveTargetReleaseId`.

## Deployment manifest

`MisoDeployment` has exactly one key, `musicos` — the published `musicos`
package address. `MISO_DEPLOYMENTS` bundles the verified immutable manifest
per network (currently `testnet`); `getMisoDeployment(network)` resolves it,
throwing for networks without a bundled manifest (the `Effect`-returning
layer path is `Musicos.layer()`, which fails typed `MusicosDeploymentInvalid`
instead). Pass an explicit manifest to `Musicos.layer({ deployment })` to
override it, e.g. for a local or freshly-published deployment.
`validateMisoDeployment(input)` is the `Effect`-returning form of
`assertMisoDeployment`/`normalizeMisoDeployment`, for callers already
composing `Effect` programs at a configuration boundary.

## Migrating from 0.3.x

| Before (`@misofm/effect`-era) | After |
| --- | --- |
| `client.miso.getX(...)`, `MisoProtocolClient` | `yield* Musicos` in Effect code; `client.$extend(musicos()).musicos.getX(...)` for Promise code |
| `queries.getX(...)` requiring `SuiClient` | `Effect.flatMap(Musicos, (m) => m.getX(...))` |
| `get*ByIds` returning `Record<string, T>`, errored ids dropped | `ReadonlyArray<Result<T, BatchItemError>>` in request order — nothing is silently dropped |
| `getShareCurrencyTreasuryCap` throwing | Fails typed `musicos/TreasuryCapNotFound` (or `DecodeError` for a malformed `shareType`) |
| `ObjectNotFoundError`, `BcsDecodeError`, `SuiRpcError`, `DeploymentError` | `ObjectNotFound` / `ObjectDeleted` / `ObjectUnavailable`, `DecodeError`, `TransportError`, `musicos/DeploymentInvalid` |
| `TxThunk`; `./execute` (`buildTx`, `signAndExecute`, `ExecResult`, ...) | `Recipe` (a deprecated `TxThunk` alias is kept); `Tx.run(recipe, { signer })` from `@unconfirmed/sui-effect/tx`, `Executed.created(type)` and friends |
| `parseXEvent(bytes): T` (throws) | `parseXEvent(bytes): Effect<T, DecodeError>` |
| `deriveTargetReleaseId(pkg, params)` | `musicos.view.deriveTargetReleaseId(params)` |
| `getReleaseAdminCapById` reading `release_id` from the `json` include | Reads it from BCS `content`; no visible change |

Unchanged: `types.ts`, `deployments.ts` (except the error class), `packages.ts`,
`numeric.ts`, `contracts.ts`, `derive*AdminCapId`, every `transactions.ts`
signature, `./contracts/*`.

## Everything else is platform

Work extensions (composition/recording/release credits, advisory ratings,
genres, DSP links, cover art, ...), royalty primitives (royalty pools,
stakes, routed stakes), the Party extensions, and every other first-party
Move package live in `@misofm/platform`; the `partyos` object model has its
own package, `@misofm/partyos`. See
[`sui-codegen.config.ts`](../../sui-codegen.config.ts) at the repo root for
the authoritative list of Move packages and which generated tree each one
lands in.

## License

Apache-2.0
