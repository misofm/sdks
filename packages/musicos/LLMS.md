# `@misofm/musicos`

A [sui-effect](https://github.com/unconfirmedlabs/sui-effect) extension for
the `musicos` Move package: Composition, Recording, Release, Track. One
service (`Musicos`), its errors, its PTB fragments, its event decoders, and
the derived Promise registration (`musicos()`). Hand-authored (this package
has no `LLMS.md` generator of its own); keep it in step with the source by
hand when a public signature changes — the same discipline `README.md`
already gets.

## `@misofm/musicos`

### `Musicos` (class)

```ts
export declare class Musicos extends Context.Service<Musicos, MusicosService>()("@misofm/musicos/Musicos") {
  static readonly layer: (options?: MusicosOptions) => Layer.Layer<Musicos, MusicosDeploymentInvalid, Sui>
  static readonly layerConfig: Layer.Layer<Musicos, Config.ConfigError | MusicosDeploymentInvalid, Sui>
  static readonly layerTest: (state?: { readonly packageId?: string }) => Layer.Layer<Musicos, never, Sui>
}
```

The Miso object-model service. `layer(options)` uses `options.deployment`
when given; otherwise it reads `sui.network` and picks this release's
bundled manifest (`MISO_DEPLOYMENTS`), failing `MusicosDeploymentInvalid`
when there is none. `layerConfig` is the same layer with `MUSICOS_PACKAGE_ID`
(`Config.nested("MUSICOS")`, `Config.nonEmptyString("PACKAGE_ID")`)
overriding the bundled choice. `layerTest` is the real service over a fixed
(or given) test package id — compose it with `layerExtensionTest` from
`@unconfirmed/sui-effect/testing`.

### `MusicosOptions` (interface)

```ts
export interface MusicosOptions {
  readonly deployment?: MisoProtocolDeployment | MisoDeployment
}
```

Omit `deployment` to use the bundled manifest for `sui.network`.

### `ReadError` / `OwnedReadError` (types)

```ts
export type ReadError = ObjectNotFound | ObjectDeleted | ObjectUnavailable | DecodeError | TransportError
export type OwnedReadError = DecodeError | TransportError
```

### `MusicosService` (interface)

```ts
export interface MusicosService {
  readonly packageId: ObjectId
  readonly deployment: MisoProtocolDeployment

  readonly getCompositionById: (id: ObjectId) => Effect.Effect<Composition, ReadError>
  readonly getCompositionsByIds: (ids: ReadonlyArray<ObjectId>) => Effect.Effect<ReadonlyArray<Result.Result<Composition, BatchItemError>>, TransportError>
  readonly getCompositionShareType: (id: ObjectId) => Effect.Effect<string, ReadError>
  readonly getCompositionAdminCapById: (id: ObjectId) => Effect.Effect<CompositionAdminCap, ReadError>
  readonly getOwnedCompositionAdminCaps: (owner: SuiAddress) => Effect.Effect<ReadonlyArray<CompositionAdminCap>, OwnedReadError>

  readonly getRecordingById: (id: ObjectId) => Effect.Effect<Recording, ReadError>
  readonly getRecordingsByIds: (ids: ReadonlyArray<ObjectId>) => Effect.Effect<ReadonlyArray<Result.Result<Recording, BatchItemError>>, TransportError>
  readonly getRecordingShareType: (id: ObjectId) => Effect.Effect<string, ReadError>
  readonly getRecordingShareTypes: (id: ObjectId) => Effect.Effect<readonly [string, string], ReadError>
  readonly getRecordingAdminCapById: (id: ObjectId) => Effect.Effect<RecordingAdminCap, ReadError>
  readonly getOwnedRecordingAdminCaps: (owner: SuiAddress) => Effect.Effect<ReadonlyArray<RecordingAdminCap>, OwnedReadError>

  readonly getReleaseById: (id: ObjectId) => Effect.Effect<Release, ReadError>
  readonly getReleasesByIds: (ids: ReadonlyArray<ObjectId>) => Effect.Effect<ReadonlyArray<Result.Result<Release, BatchItemError>>, TransportError>
  readonly getReleaseRegistryById: (id: ObjectId) => Effect.Effect<ReleaseRegistry, ReadError>
  readonly getReleaseAdminCapById: (id: ObjectId) => Effect.Effect<ReleaseAdminCap, ReadError>
  readonly getOwnedReleaseAdminCaps: (owner: SuiAddress) => Effect.Effect<ReadonlyArray<ReleaseAdminCap>, OwnedReadError>

  readonly getShareCurrencyType: (currencyId: ObjectId) => Effect.Effect<string, ReadError>
  readonly getShareCurrencyTreasuryCap: (shareType: string, owner: SuiAddress) => Effect.Effect<ObjectId, MusicosTreasuryCapNotFound | DecodeError | TransportError>

  readonly view: {
    readonly deriveTargetReleaseId: (params: DeriveTargetReleaseIdParams) => Effect.Effect<ObjectId, SimulationFailed | BuildError | DecodeError | TransportError>
  }
}
```

Every member is `R = never`: the layer's `Sui` is provided internally.
Non-generic types (`Release`, `ReleaseRegistry`, `ReleaseAdminCap`) decode
through an exact type-tag check; `Composition`, `Recording` and their two
admin caps are generic, and read through a **bare** expected tag that
matches every instantiation (see `docs/extensions.md`'s "Generic Move
types" in `node_modules/@unconfirmed/sui-effect`). `get*ByIds` returns one `Result` per
id, in request order — nothing is silently dropped. `getOwned*AdminCaps`
streams every page of `owner`'s objects filtered by the bare cap type.

### `DeriveTargetReleaseIdParams` (interface)

```ts
export interface DeriveTargetReleaseIdParams {
  readonly sender: SuiAddress
  readonly recordingIds: ReadonlyArray<ObjectId>
  readonly splitBps: ReadonlyArray<UnsignedInput>
  readonly nonce: UnsignedInput
  readonly releaseRegistryId: ObjectId
}
```

`UnsignedInput = bigint | number | string` (`numeric.ts`). A
`recordingIds`/`splitBps` length mismatch throws inside the simulated
recipe and surfaces as `BuildError`.

### `musicos` (const)

```ts
declare const musicos: (options?: MusicosOptions) => SuiClientRegistration<ClientWithCoreApi, "musicos", PromiseFace<MusicosService> & ExtensionFace>
```

The Promise registration: `client.$extend(musicos(options))`. Not `warm` by
default — see `src/extension.ts`'s own doc comment for why (a `warm`
registration on `devnet`/`localnet` with no `chainId` throws at
registration). Before the runtime exists (`register(client)` does no work
until the first `await`), the two synchronous members are placeholders, not
their real values and not Promises: `packageId` throws `ExtensionNotReady`
when coerced to the string it is typed as; `deployment` is a plain object,
so the face maps it as a namespace, and reading a property off it cold just
returns another placeholder. `await client.musicos.$ready()` once makes
both real immediately.

## `@misofm/musicos/errors`

### `MusicosTreasuryCapNotFound` (class)

```ts
export declare class MusicosTreasuryCapNotFound extends Schema.TaggedError<MusicosTreasuryCapNotFound>()("musicos/TreasuryCapNotFound", {
  shareType: Schema.String,
  owner: SuiAddress
}) {
  readonly outcome: "not_applied"
}
```

No `TreasuryCap<shareType>` owned by `owner` was found.

### `MusicosWorkNotFound` (class)

```ts
export declare class MusicosWorkNotFound extends Schema.TaggedError<MusicosWorkNotFound>()("musicos/WorkNotFound", {
  kind: Schema.Literals(["composition", "recording"]),
  shareType: Schema.String
}) {
  readonly outcome: "not_applied"
}
```

`getCompositionByShareType` / `getRecordingByShareType`'s GraphQL discovery
found no work carrying `shareType`. There is no object id to name — that is
exactly what the search came up empty on — so this is its own tag rather
than `ObjectNotFound`, which always names one.

### `MusicosDeploymentInvalid` (class)

```ts
export declare class MusicosDeploymentInvalid extends Schema.TaggedError<MusicosDeploymentInvalid>()("musicos/DeploymentInvalid", {
  message: Schema.String
}) {
  readonly outcome: "not_applied"
}
```

`Musicos.layer`'s deployment option failed validation, or this release
bundles no manifest for the client's network. Replaces the predecessor
`@misofm/effect`-era `DeploymentError`.

Also re-exported from this subpath: `BuildError`, `DecodeError`,
`GraphQLUnavailable`, `ObjectDeleted`, `ObjectNotFound`, `ObjectUnavailable`,
`SimulationFailed`, `TransportError`, and the `BatchItemError` type — all
from `@unconfirmed/sui-effect`, so `@misofm/musicos/errors` is still the one place to
import the package's whole error vocabulary from.

## `@misofm/musicos/transactions`

Seven `Recipe` fragments (`sui-effect`'s `(tx: Transaction) => void`, or
`(tx) => A` for one returning by-value results to thread onward), unchanged
in signature from 0.3.x:

```ts
export declare function createComposition(tx: Transaction, params: CreateCompositionParams): CompositionParts
export declare function createRecording(tx: Transaction, params: CreateRecordingParams): RecordingParts
export declare function createTrack(tx: Transaction, params: CreateTrackParams): TransactionObjectArgument
export declare function createRelease(tx: Transaction, params: CreateReleaseParams): ReleaseParts
export declare function publishComposition(tx: Transaction, params: { composition, adminCap, shareType, misoPackageId }): void
export declare function publishRecording(tx: Transaction, params: { recording, adminCap, recordingShareType, compositionShareType, misoPackageId }): void
export declare function publishRelease(tx: Transaction, params: { release, adminCap, misoPackageId }): void
```

`create*` primitives append exactly one Move call and return every by-value
result, undispersed; `publish*` consumes and shares. `Musicos` has no submit
member — compose these (and fragments from other extensions) into one
`Transaction`, then `Tx.run(recipe, { signer })` from `@unconfirmed/sui-effect/tx`.

## `@misofm/musicos/parsers` and `@misofm/musicos/events`

### `EventDecoder<T>` (interface)

```ts
export interface EventDecoder<T> {
  (bytes: Uint8Array): Effect.Effect<T, DecodeError>
  (event: Event): Effect.Effect<T, DecodeError>
}
```

Every decoder in both subpaths has this shape: `parsers.ts`'s eight
`parse*Event` functions decode into the public camelCase event interfaces
(`types.ts`); `events.ts`'s `eventParsers.core.*` registry decodes into the
raw generated snake_case shape, for indexers that need the ABI surface
unmapped. Neither compares a full Move type tag — event codecs carry none,
since a generated codec's `.name` is an unresolved `@local-pkg/…` source
label, never a real address — but the `Event` overload does check the
`module::EventName` suffix of `event.eventType` (package address and any
generic type arguments aside) before decoding, failing `DecodeError`
immediately on a mismatch; the bytes-only overload has no `eventType` to
check and relies on the BCS re-serialize length check alone, still
`DecodeError` on a shape mismatch.

`@deprecated` in `events.ts`, kept for `packages/platform`'s own generated
event codecs (unrelated to musicos's own types): `BcsParser<T>` (`{ parse(bytes): T }`)
and `decodeEvent(codec, bytes)`.

## `@misofm/musicos/queries`

```ts
export declare const getCompositionByShareType: (shareType: string, packageId: string) => Effect.Effect<Composition, MusicosWorkNotFound | GraphQLUnavailable | ObjectNotFound | ObjectDeleted | ObjectUnavailable | DecodeError | TransportError, Sui | SuiGraphQL>
export declare const getRecordingByShareType: (shareType: string, packageId: string) => Effect.Effect<Recording, MusicosWorkNotFound | GraphQLUnavailable | ObjectNotFound | ObjectDeleted | ObjectUnavailable | DecodeError | TransportError, Sui | SuiGraphQL>
export declare const getWorkAddressesByShareTypes: (shareTypes: WorkShareTypes, packageId: string) => Effect.Effect<WorkAddressesByShareType, GraphQLUnavailable | TransportError, SuiGraphQL>
export declare function extractTypeParam(objectType: string): string
export declare function extractTypeParams2(objectType: string): [string, string]
```

The three reads the Core API cannot express (a type filter needs every type
parameter of a generic or none) stay on sui-effect's shared `SuiGraphQL` tag
as standalone functions — not `Musicos` members, so building the service
never requires a GraphQL endpoint. `GraphQLUnavailable` (from
`SuiGraphQL.layerUnavailable`) lets through rather than folding into
`TransportError`, so a caller can tell "no endpoint" apart from "the
endpoint answered badly". `musicos/WorkNotFound` is the two by-share-type
reads' own not-found — there is no object id to name `ObjectNotFound` with.
A malformed GraphQL `repr` (one type parameter where two are expected) is
skipped with a debug log, in both `getWorkAddressesByShareTypes` and
`getRecordingByShareType`'s address search, rather than thrown.
`extractTypeParam(s2)` are the pure helpers `Musicos` itself uses to read a
share type off an object's tag; kept public because `packages/platform`
imports them directly.

## `@misofm/musicos/deployments`

Unchanged from 0.3.x except `validateMisoDeployment`'s error, now
`MusicosDeploymentInvalid`:

```ts
export type MisoNetwork = "mainnet" | "testnet"
export type MisoDeployment = Readonly<Record<"musicos", string>>
export interface MisoProtocolDeployment { readonly packageId: string }
export declare const MISO_DEPLOYMENTS: Readonly<Record<string, MisoDeployment>>
export declare function getMisoDeployment(network: string): MisoDeployment
export declare function normalizeMisoProtocolDeployment(deployment: unknown): MisoProtocolDeployment
export declare function normalizeMisoDeployment(deployment: unknown): MisoDeployment
export declare function assertMisoDeployment(deployment: unknown): asserts deployment is MisoDeployment
export declare function protocolDeployment(deployment: MisoDeployment): MisoProtocolDeployment
export declare function validateMisoDeployment(deployment: unknown): Effect.Effect<MisoDeployment, MusicosDeploymentInvalid>
```

## `@misofm/musicos` (derive)

```ts
export declare function deriveCompositionAdminCapId(compositionId: string, misoPackageId: string): string
export declare function deriveRecordingAdminCapId(recordingId: string, misoPackageId: string): string
export declare function deriveReleaseAdminCapId(releaseId: string, misoPackageId: string): string
```

Pure, deterministic — no chain read — unchanged from 0.3.x.

## `@misofm/musicos/types`, `@misofm/musicos/packages`, `@misofm/musicos/contracts`

Unchanged from 0.3.x. `types.ts` is the domain `Schema.Class` model
(`Composition`, `Recording`, `Release`, `Track`, `ReleaseRegistry`, the
three admin caps, `BPS`) and the plain event interfaces `parsers.ts` decodes
into. `packages.ts` binds the generated calls and BCS codecs to one
deployment manifest (`bindModulePackage`, `MisoPackageBindings`,
`misoPackages`). `contracts.ts` is the generated-bindings barrel.

## `@misofm/musicos` (deprecated compatibility)

```ts
/** @deprecated Use `Recipe` from `@unconfirmed/sui-effect`. */
export type TxThunk = Recipe
```

Kept only because `packages/platform/src/transactions.ts` still imports the
name; every builder in `transactions.ts` was already a `Recipe`.
