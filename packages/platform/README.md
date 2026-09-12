# @misofm/platform

The complete client SDK for the **Miso platform layer** on Sui: composed catalog,
artist, wallet, and receipt reads; the Party extensions (profile, media, roles,
tags, genres, CTAs, platform links); the record production line and sale of
copies; fail-closed Vault custody, raw Actions, and safe crank plugins; and
every first-party extension and generic royalty primitive built on top of the
`@misofm/musicos` object model and the `@misofm/partyos` Party identity model.

`@misofm/platform` is a [sui-effect](https://github.com/unconfirmedlabs/sui-effect)
extension: one `Context.Service` (`Miso`), built on `sui-effect`'s `Sui`,
`SuiGraphQL`, and `Tx`, composed over the converted `Musicos`/`Partyos`
services, whose members are `Effect`s with closed error unions, whose writes
are PTB fragments (`Recipe`s) a consumer composes and submits once, and whose
Promise face is derived — never hand-written — by `SuiExtension.fromService`.
See `node_modules/@unconfirmed/sui-effect/docs/extensions.md` for the contract every
extension in this codebase follows, and ["Migrating from 0.27"](#migrating-from-027)
below if you're coming from the hand-written `MisoPlatformClient`.

## The boundary rule

> `@misofm/musicos` is the object model. Everything Miso offers on top of it is
> platform.

Miso ships three SDK packages, and the package name tells you which promise
you are holding:

| Package            | Layer        | Owns                                                                                                          |
| ------------------- | ------------ | -------------------------------------------------------------------------------------------------------------- |
| `@misofm/musicos`  | **Object model** | Composition, Recording, Release, Track — the open Move package anyone can build on, no permission required |
| `@misofm/partyos`  | **Party identity** | Party, PartyAdminCap, and consent-based group membership — the open Move package Party identity is built on |
| `@misofm/platform` | **Platform** | The Party extensions (profile, media, roles, tags, genres, CTAs, platform links); work extensions; generic royalty-pool/routed-stake primitives; Actions; Vault; Record/Record Shop; product-specific publishing workflows |

A release is object model. Pressing a record off that release and selling it
is platform. So is deciding _what to do_ with a freshly-minted work's share
supply — the object model only knows how to mint one. Likewise, a Party is
identity — who or what is being described — and lives in `@misofm/partyos`;
everything Miso attaches to that identity (a profile, media, roles, tags,
genres, CTAs, platform links) is an opinion about how to describe or route
value around it, not part of what the Party IS, so those extensions live in
platform alongside work extensions and every royalty primitive. Keeping the
boundary at the package line is what stops the open object models from
quietly growing a storefront (or an opinion about tokenomics).

Extensions add data to a work. Raw Actions accept an admin cap and remain
composable with either direct authority or a scoped Vault borrow. Three safe,
permissionless crank plugins borrow through their own witness: a shared
`Vault<AdminCap>` custodies the raw cap, while its owner holds a
`VaultAdminCap<AdminCap>`. A plugin borrows the cap and must return the exact
object in the same PTB. The SDK supports both vault authorities and legacy
address-owned admin caps explicitly; it never silently treats a legacy cap as a
vaulted one. New Vault IDs are derived from the shared `VaultRegistry`, the raw
cap ID, and its type; each VaultAdminCap ID is then derived from its Vault.

This package depends on `@misofm/musicos` and `@misofm/partyos` directly and
composes their converted `Musicos`/`Partyos` services internally, so
`Miso.layer`'s requirement channel stays `Sui | SuiGraphQL` — never
`Sui | SuiGraphQL | Musicos | Partyos` — for a consumer that only asked for
`Miso`. Writes still compose in one PTB (the transaction-fragment pattern from
the [Sui SDK building guide](https://sdk.mystenlabs.com/sui/sdk-building)),
just crossing a package boundary.

## Install

```sh
bun add @misofm/platform @unconfirmed/sui-effect effect @mysten/sui @mysten/bcs
```

Peer dependencies: `@unconfirmed/sui-effect@^0.1.0`, `effect@>=4.0.0-rc.112 <4.1`,
`@mysten/sui@^2.28`, `@mysten/bcs@^2.1.1`. `@misofm/musicos` and
`@misofm/partyos` resolve transitively through this package, so applications
get exactly one object-model SDK, one Party-identity SDK, and one compatible
deployment map without installing either themselves. A custom deployment is
recursively frozen at `Miso.layer` build, without freezing the caller's
original object, so later caller mutation cannot retarget an existing client.

### Engine sessions

A Recording's `recording_engine_session::ExtensionKey` dynamic field holds one
`EngineSession`: the unencrypted Walrus blob of the canonical Miso Engine
Session V1 JSON, plus one `Stem` per source pairing the 32-byte SHA-256 of its
canonical PCM (the document's `content` identity) with the unencrypted Walrus
blob of its FLAC. The document carries no locators, so this field is where a
client resolves each source to bytes. Nothing is encrypted; there is no
wrapper document and no off-chain map.

`getRecordingEngineSession` reads the field in one request and returns the
session blob id and the stems table. `setRecordingEngineSession` and
`unsetRecordingEngineSession` are the cap-authorized PTB builders; the builder
sorts stems by digest, as `recording_engine_session::new` requires. Walrus id
conversions live in `walrus-ids`.

## The model

A release may have one `Pressing` per positive `u16` edition. Each Pressing owns its
independent `u32` Record-number sequence, current supply, optional immutable `u32`
maximum supply, and authorized distributor witness types.

Selling in a currency is a `Listing<Currency>`, one per currency, permanent, edited in
place rather than replaced. The Listing's enabled/disabled state is the sale switch;
the Pressing has no schedule state.

**Everything is address math.** The pressing's UID derives off its release's, each
listing's off the pressing's. The protocol's canonical `ReleaseRegistry` creates the
release; there is no _pressing_ registry or mutable lookup pointer to follow, so
"where is it" is answered offline. A Pressing derives from `(release, edition)`, a
Record from `(pressing, number)`, and a `Listing<Currency>` from its Pressing under
the separate immutable Record Shop package. There are no Record Registry or Settings
singletons.

## Usage

### Effect

```ts
import { Effect } from "effect";
import { Sui, SuiCore, SuiGraphQL } from "@unconfirmed/sui-effect";
import { Miso } from "@misofm/platform";
import { getMisoPlatformDeployment } from "@misofm/platform/deployments";

const deployment = getMisoPlatformDeployment("testnet");

const program = Effect.gen(function* () {
  const miso = yield* Miso;

  // The permissionless object-model and Party surfaces are part of the same service.
  const release = yield* miso.protocol.getReleaseById(releaseId);
  const party = yield* miso.party.getPartyById(partyId);

  // Read: run + one currency's offer, one round trip, no registry lookup.
  const { pressing, listing } = yield* miso.getSale({ releaseId, edition, currencyType: USD_COIN_TYPE });

  return { release, party, pressing, listing };
});

const { release, party, pressing, listing } = await program.pipe(
  Effect.provide(Miso.layer(deployment)),
  Effect.provide(Sui.layerNoDeps),
  Effect.provide(SuiCore.layerGrpc({ network: "testnet", baseUrl: "https://..." })),
  Effect.provide(SuiGraphQL.layerConfig), // or SuiGraphQL.layerUnavailable with no endpoint
  Effect.runPromise,
);
```

Inside a `Script` or an existing `sui-effect`-based program, just `yield* Miso`
after providing `Miso.layer(deployment)` (or `layerConfig`) over the `Sui | SuiGraphQL`
your program already has.

A read that can fail closed (a missing release, an unavailable Record sales
deployment) fails with one of this SDK's tagged errors — see
[Errors](#errors) — so recover with `Effect.catchTag`/`Effect.catchTags`
instead of inspecting a thrown message:

```ts
const releaseOrNull = miso.protocol
  .getReleaseById(releaseId)
  .pipe(Effect.catchTag("ObjectNotFound", () => Effect.succeed(null)));
```

### Promise

```ts
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { miso } from "@misofm/platform/client";

const client = new SuiGrpcClient({ network: "testnet", baseUrl }).$extend(miso());

// The face keeps a member's argument types, and every namespace is nested:
// client.miso.protocol.*, client.miso.party.*, client.miso.read.*.
const release = await client.miso.protocol.getReleaseById(releaseId);
const party = await client.miso.party.getPartyById(partyId);
const { pressing, listing } = await client.miso.getSale({ releaseId, edition, currencyType: USD_COIN_TYPE });

// Write: a Recipe, so it composes with protocol/party calls in the same PTB.
// `tx` builders never touch the network — no Effect, no Promise involved.
const tx = new Transaction();
tx.add(
  client.miso.tx.purchaseRecord({
    releaseId,
    edition,
    currencyType: USD_COIN_TYPE,
    paymentAmount: listing!.pricing.amount,
    expectedPricing: listing!.pricing,
    recipient: buyer,
  }),
);

await client.miso.dispose();
```

`miso()` registers **warm** — `tx`/`ids`/`call`/`bcs`/`vault`/`deployment` are
synchronous members a consumer reads the moment it registers, and `Miso.layer`
touches no network at build for a client on `mainnet` or `testnet` (their
chain identifiers are in sui-effect's built-in table). On `devnet`,
`localnet`, or a custom network, `warm` needs a chain identifier from
somewhere: pass `chainId` explicitly, **or** pass a `deployment` whose own
`chainIdentifier` names it (`options.chainId ?? options.deployment?.chainIdentifier`)
— a custom deployment for your own network is enough on its own, nothing
else to repeat. Without either, `client.$extend(miso())` throws
synchronously, naming the network. **A network/deployment mismatch also
throws synchronously here** (warm builds the layer inside `register`,
so `Miso.layer`'s own `MisoNetworkMismatchError`/`MisoChainIdentifierMismatchError`
surface immediately rather than on first call) — register lazily
(`SuiExtension.fromService(Miso, { name: "miso", layer: Miso.layer(deployment) })`,
no `warm`) if you want that check deferred to the first call instead, and
`await client.miso.$ready()` once before reading a synchronous member.
`miso()` on a network with no bundled manifest and no explicit `deployment`
rejects typed (`MisoPlatformDeploymentInvalidError`), not with an unhandled
defect.

Verified package and singleton IDs are bundled in
`MISO_PLATFORM_DEPLOYMENTS.testnet`. `miso()`/`Miso.layer` select that
verified map from the client's network by default; pass an explicit
`deployment` for a custom or unbundled network. The bundled Testnet
deployment includes both verified immutable sales package IDs; custom
deployments can still mark sales unavailable explicitly, and every sales
builder/reader fails closed (typed `RecordSalesUnavailableError`) whenever
either package is unavailable.

Holding the ids yourself, outside the service? The bare APIs take
`recordPackageId`/`recordShopPackageId` explicitly and need only `Sui`:

```ts
import { purchaseRecord, getSale } from "@misofm/platform/pressing";
```

### Party and the generated contract tree

Party identity (the `Party` object, `PartyAdminCap`, group membership) is
owned by `@misofm/partyos`; this package only owns the extensions attached to
it. `miso.party` (`MisoPartyService`) delegates every core method
(`getPartyById`, `getMemberships`, …) straight to the converted `Partyos`
service, and merges in this package's own party EXTENSION reads and 25 `tx`
fragments (9 from `Partyos.tx`, 16 first-party). It is assembled from `Sui`
and `Partyos` — never constructed directly by a consumer; get it from
`Miso`/`client.miso`:

```ts
const profile = await client.miso.party.getProfile(partyId); // Option<Profile>
```

Every generated Move package on this side of the boundary — the Party
extensions, work extensions, royalty/routed-stake primitives, Record/Record
Shop, Vault, and every Action/plugin — is reachable through the curated
`contracts` barrel (`@misofm/platform` → `contracts.*`, or
`@misofm/platform/contracts` directly) or, for a module the barrel doesn't
curate, the raw generated file itself. The Party core's generated bindings
live in `@misofm/partyos/contracts` instead:

```ts
import { record } from "@misofm/platform/contracts";
import { Record } from "@misofm/platform/contracts/record/record";
```

### High-level platform reads

`@misofm/platform/read` turns protocol, pressing, Party, credits, cover, and wallet
objects into the JSON-safe views a client actually renders. It works in browsers,
Workers, and servers. Miso's HTTP API is a thin validated and cached transport over
this same surface, not a separate domain implementation.

Every read here takes the resolved `MisoConfig` (package ids, not a transport)
and declares `Sui`/`SuiGraphQL` in its Requirements — `createMisoClient`
(`read/client.ts`) still bundles the transport, config, and the `client.miso`
Promise face the way it always bundled a transport; provide its `layer`
(`Miso | Sui | SuiCore | SuiGraphQL`) once, at the boundary:

```ts
import { Effect } from "effect";
import {
  createMisoClient,
  getDiscoverShelf,
  getReleaseDetail,
  getOwnedRecords,
} from "@misofm/platform/read";

const miso = createMisoClient({ network: "testnet" });

const program = Effect.gen(function* () {
  const discover = yield* getDiscoverShelf(miso.config);
  const release = yield* getReleaseDetail(releaseId, miso.config);
  const library = yield* getOwnedRecords(walletAddress, miso.config);
  return { discover, release, library };
});

const { discover, release, library } = await Effect.runPromise(program.pipe(Effect.provide(miso.layer)));

// Or skip the standalone `read/*` functions and reach for the bound Miso
// service/Promise face directly — `miso.client.miso.read.*` is the same
// views, config already captured:
const sameDiscover = await miso.client.miso.read.getDiscoverShelf();
```

The package root also exposes the same functions under the `read` namespace:

```ts
import { read } from "@misofm/platform";

const miso = read.createMisoClient({ network: "testnet" });
const artist = await Effect.runPromise(read.getArtistProfile(partyId, miso.config).pipe(Effect.provide(miso.layer)));
```

### Authenticated platform mutations

`@misofm/platform/auth` implements Miso's Enoki + Sui personal-message authorization
protocol without owning session state or private credentials. It asks the API
for a short-lived, method/path-bound challenge, validates the response, signs
the exact bytes with the caller's Sui signer, and sends the authenticated
mutation.

```ts
import { authenticatedFetch } from "@misofm/platform/auth";

await authenticatedFetch(
  "https://api.testnet.miso.fm/platform/usernames/alice",
  {
    method: "PUT",
    body: JSON.stringify({}),
    headers: { "Content-Type": "application/json" },
    auth: {
      token: enokiOidcToken,
      address: suiAddress,
      signer: await enokiFlow.getKeypair({ network: "testnet" }),
      network: "testnet",
    },
  },
);
```

The SDK is only a client and shared wire contract. The API remains the security
boundary: it verifies Enoki membership, challenge freshness, the recovered Sui
address, and the exact authorized route on every protected request.

### Payment

`listing::purchase` takes a bare `Balance<Currency>`, and `purchaseRecord` sources it with
`tx.balance()` — which draws from the buyer's **address balance** first and falls back
to coin objects only if it must. When the address balance covers the price, that is a
single `balance::redeem_funds` and **no coin object is minted, touched, or destroyed**,
leaving the sale free of owned-object contention.

Never hand-pick coin objects for a payment. That road shows a buyer their $1,000 and
then refuses to spend a cent of it, because a coin listing cannot see money that lives
in the address balance.

Purchases always set `useGasCoin: false`: the gas coin may belong to a sponsor. Buyers
also pass the exact expected `Fixed` or `Floor` pricing variant and value, protecting
them from stale pricing-mode changes as well as amount changes.

### Vault fund settlement

`settleAndDistributeReleaseRevenue` invokes the fixed release plugin with the
framework `AccumulatorRoot` (`0xacc`); the plugin redeems the whole settled
snapshot and exposes no amount argument. `settleCompositionRoyaltyPool` and
`settleRecordingRoyaltyPool` read `balance::settled_funds_value` and pass that
command result directly to their exact-value plugin calls. The lower-level raw
Action `redeemAndDistributeReleaseRevenue` and the plugin helpers
`redeemAndDepositCompositionRoyaltyPool`, and
`redeemAndDepositRecordingRoyaltyPool` remain available when an earlier PTB
command already produced the exact value.

Party-wallet monetary builders are similarly composable:
`receivePartyWalletBalance`, `redeemPartyWalletBalance`, and
`settlePartyWalletBalance` return the PTB `Balance<Currency>` result. Pass that
result directly to another Move call, or convert it with `coin::from_balance`
only when an owned Coin is required. Every returned Balance must be consumed in
the same PTB.

## Publishing (`transactions.ts`, `share.ts`, `release-graph.ts`)

`@misofm/musicos`'s `createComposition`/`createRecording` mint a work and hand
back its by-value parts (the object, its admin cap, its freshly-minted share
`Balance`) without dispersing, sharing, or transferring anything. This package
supplies the opinionated finish on top:

```ts
import { miso } from "@misofm/platform/client";

const client = new SuiGrpcClient({ network: "testnet", baseUrl }).$extend(miso());

// Mints the composition's share supply, disperses it to shareRecipients as
// address balances, publishes (shares) the composition, and transfers the
// CompositionAdminCap to adminAddress — createComposition → finalizeComposition
// in one PTB. A Recipe, not a Promise: apply it to a Transaction, or tx.add() it.
const recipe = client.miso.tx.publishComposition({
  title: "Song Title",
  royaltyRateBps: 1000,
  shareType: "0x...::share::Share",
  shareCurrencyId: "0x...",
  shareTreasuryCapId: "0x...",
  shareRecipients: [{ address: ownerAddress, value: 10_000_000_000_000 }],
  adminAddress: ownerAddress,
});
```

`client.miso.tx.publishRecording` and `publishCompositionAndRecording`
follow the same shape (the latter atomically, borrow-before-share, in one PTB —
see `@misofm/musicos`'s README for why the ordering is load-bearing).
The protocol, immutable Record and Record Shop packages, minato, and core
`ReleaseRegistry` address all come from the deployment selected by the Sui
client's network. Record sales have no Record Registry or Settings singleton.

For custom PTBs, the bare primitives (`disperseShares`, `finalizeComposition`,
`finalizeRecording`) and the whole-graph orchestrator are exported standalone:

```ts
import { publishReleaseGraph } from "@misofm/platform";

// Every composition and recording, optional royalty pools, tracks, and
// the release — with the release id derived ON-CHAIN — in one atomic PTB.
const recipe = publishReleaseGraph({
  compositions: [
    {
      shareType,
      shareCurrencyId,
      shareTreasuryCapId,
      title: "Song",
      royaltyRateBps: 1000,
      shareRecipients,
      adminAddress,
    },
  ],
  recordings: [
    {
      shareType,
      shareCurrencyId,
      shareTreasuryCapId,
      compositionShareType,
      parentCompositionIndex: 0,
      shareRecipients,
      adminAddress,
    },
  ],
  release: {
    title: "Album",
    nonce: "42",
    adminAddress,
    releaseRegistryId: "0x...",
    tracks: [{ recordingIndex: 0, splitBps: 10000 }],
  },
  misoPackageId: "0x...",
  minatoPackageId: "0x...",
});
```

### Atomic catalog publication (`publication.ts`)

`publishAtomicCatalog` owns the semantic publication transaction. Given
pre-initialized share currencies, it creates every new Party, Composition,
Recording, Track, and Release; applies all declared data extensions; composes
raw-cap Actions through direct custody or a scoped Vault borrow; installs only
the permissionless royalty/revenue crank plugins; opens the Pressing and
Listings; shares the new objects; and delivers only the selected direct admin
cap or VaultAdminCap. The
entire catalog stage is one PTB, so none of it can land partially.

Share allocation is explicit at the SDK boundary. Omitting
`shareDistribution` preserves the existing `"balance"` behavior. Setting it to
`"stake"` converts the minted `Balance<Share>` into one address-owned
`Stake<Share>` per `shareRecipients` entry. When the work also declares a
`royaltyPool`, the builder creates the pool unshared, registers each fresh
stake, shares the pool, and then transfers the registered stakes. The lower
level `createShareStake`, `createShareStakes`, `registerShareStake`,
`newCompositionRoyaltyPool`, `newRecordingRoyaltyPool`, and
`shareRoyaltyPool` builders expose each step separately for custom PTBs.

For a fresh Recording whose parent Composition owns a protocol royalty cut,
`recordings[].routedStake` redeems that exact cut into a derived
`RoutedStake`, registers it with the Recording's royalty pool, and shares it
for permissionless sweeping. The Recording and parent Composition must both
declare royalty pools in the same currency, and the parent must use Vault
custody:

```ts
recordings: [{
  // ...fresh parent, share currency, custody, and royaltyPool...
  routedStake: true,
}]
```

The SDK derives the exact `composition_routed_stake::create_stake` value from
the protocol's fixed share supply and the fresh parent's `royaltyRateBps`; it
does not permit zero or partial routing. Both works must use `"stake"` share
distribution so the Recording pool has its complete supply registered and the
parent destination pool is operable from the first sweep. Atomic publication
supports rates from 1 to 9999 BPS because it always allocates a non-zero
Recording creator remainder; lower-level routed-stake builders remain
available for the Move layer's 100% composition-cut case.

```ts
import { assertAtomicPublicationBounds } from "@misofm/platform/publication";

const publication = {
  parties,
  compositions, // includes initialized share Currency + TreasuryCap ids
  recordings,
  release,
  pressing,
};

// Pure local assembly: fail before publishing any share package if the final
// PTB exceeds the SDK's command/input safety limits or has an invalid graph
// (deployment is added by publishCatalog itself, below).
assertAtomicPublicationBounds({ ...publication, deployment: client.miso.deployment });

// One Tx.run, submitted exactly once — no executor. `publishAtomicCatalog`
// (the fragment) and `parseAtomicPublicationResult` (now `Executed`-shaped)
// remain exported standalone from `@misofm/platform/publication` for a
// caller composing this PTB with other fragments before running it.
const result = await client.miso.publishCatalog(publication, { signer });
```

Fresh raw PartyAdminCap, CompositionAdminCap, RecordingAdminCap, and
ReleaseAdminCap values never leave the PTB when Vault custody is selected.
Only the Composition royalty-pool, Recording royalty-pool, and Release revenue
plugins are installable, while each new Vault is still owned. Party-wallet and
Composition routed-stake operations remain raw Actions. Atomic publication
consumes the returned routed stake by registering and sharing it; lower-level
callers retain explicit control over those lifecycle steps. Plugin witness
construction remains inside the SDK bindings.

Share packages necessarily precede this stage: publish at most five per PTB,
then initialize their currencies, then submit the atomic catalog PTB — see
"Share Currency Provisioning" below. `Tx.run` holds one sender lock per
address, so batches serialize under one signer rather than running
concurrently through an executor (the accepted 0.28 behaviour change).

### Share Currency Provisioning (`share.ts`)

Every composition and recording is backed by its own fixed-supply share
currency: an independently published `share` package (bytecode template
embedded as `SHARE_TEMPLATE`, initializer patched via `patchInitializer`).
Publish and initialize are necessarily two transactions:

```ts
import { Effect } from "effect";

// Sequential (one currency, two Tx.run's — a moveCall target needs the
// package's id, and a package published in the same PTB has none until it
// executes):
const currency = await client.miso.createShareCurrency({ name: "Song Shares", description: "…" }, { signer });
// → { packageId, currencyId, shareType, treasuryCapId, gasUsed: bigint }

// Batched (many currencies). Both hold one sender lock per Tx.run — what a
// ParallelTransactionExecutor ran concurrently now serializes per batch
// under that lock, the accepted 0.28 behaviour change.
const { packageIds } = await client.miso.publishShareCurrencies(10, { signer });
const { currencies } = await client.miso.initializeShareCurrencies(
  packageIds,
  (pkg) => ({ name: "…", description: "…" }),
  { signer, onBatch: (batch, gasUsed) => Effect.sync(() => console.log(`initialized ${batch.length} currencies, ${gasUsed} MIST`)) },
);
```

`Tx.run(recipe, { signer })` is what every submit-on-behalf member here
builds on — journal, sender lock, epoch expiration, and reconcile apply, so a
stuck submission is a typed `SubmissionUnknown` carrying the signed bytes, not
a silent hang. `onBatch` (an `Effect`, run inline before the next batch)
reports each succeeded batch as it lands, so a caller can persist progress
before the whole call settles — if a later batch fails, the ones already
reported through `onBatch` do not need re-initializing.

## Extensions

An extension attaches data to a protocol work through that work's cap-gated
`uid_mut` hook. The work stays a protocol object; the opinion hanging off it is
ours.

### Credits (`credits.ts`)

Contributor credits pair a party with a display name and one or more
domain-specific roles, attached to a work as a dynamic field and gated by the
work's admin cap. Three role vocabularies:

- **Composition** (writing, 1–5 roles, no level): `Adapter`, `Arranger`, `Composer`, `Lyricist`, `Songwriter`, `Translator`, or `{ type: "Custom", name }`.
- **Recording** (production/performance, 1–10 roles): 28 leveled roles (`Producer`, `Vocalist`, `Engineer`, …) each with an optional seniority `level` (`Lead`, `Featured`, `Executive`, …), plus `{ type: "Instrumentalist", instrument, level? }`, `{ type: "Custom", name, level? }`, and the unleveled `ArtistsAndRepertoire` / `Copyist`.
- **Release** (top-line billing, exactly one role): `"Primary"` or `"Featured"`.

Writers validate client-side, mirroring the Move aborts: display name
non-empty and ≤200 UTF-8 bytes; role counts within the caps above; no
duplicate roles.

```ts
import {
  attachCompositionCredit,
  attachRecordingCredit,
  addReleaseCredit,
  addRecordingPrimaryArtist,
  addRecordingFeaturedArtist,
  getCompositionCredits,
  getRecordingCredits,
  getReleaseCredits,
} from "@misofm/platform";

const thunk = attachRecordingCredit({
  recordingId: "0x...",
  recordingAdminCapId: "0x...",
  partyId: "0x...",
  displayName: "Jane Doe",
  roles: [
    { type: "Vocalist", level: "Lead" },
    { type: "Instrumentalist", instrument: "Guitar" },
  ],
  recordingShareType: "0x...::share::Share",
  compositionShareType: "0x...::share::Share",
  recordingCreditsPackageId: "0x...",
  misoCreditPackageId: "0x...",
});

// Designate an already-credited party (same params minus displayName/roles/misoCreditPackageId):
addRecordingPrimaryArtist({
  recordingId,
  recordingAdminCapId,
  partyId,
  recordingShareType,
  compositionShareType,
  recordingCreditsPackageId,
});

// Reads return null when no credits field is attached.
const credits = await getCompositionCredits(
  client,
  compositionId,
  compositionCreditsPackageId,
);
// CreditView[]: { partyId, displayName, roles: string[] } — e.g. "Producer (Lead)", "Instrumentalist: Guitar"
const rc = await getRecordingCredits(
  client,
  recordingId,
  recordingCreditsPackageId,
);
// { credits: CreditView[], primaryArtistIds: string[], featuredArtistIds: string[] }
```

`attachCompositionCredit` takes `compositionId`/`compositionAdminCapId`/`compositionShareType`/`compositionCreditsPackageId`;
`addReleaseCredit` takes `releaseId`/`releaseAdminCapId` and a single `role`.

A recording is `Recording<RecordingShare, CompositionShare>` — the recording's
OWN share type comes first, its parent composition's second. The recording
writers take both as separate named params for that reason; passing them in the
wrong order still typechecks (both are `string`) and resolves to the wrong
on-chain type.

### Cover art (`cover.ts`)

A release's cover is a Walrus blob referenced on-chain via `ori::WalrusData`,
attached under the `release_cover_art` extension:

```ts
import { setReleaseCover, getReleaseCover } from "@misofm/platform";

const thunk = setReleaseCover({
  releaseId: "0x...",
  releaseAdminCapId: "0x...",
  stillBlobId: "987654321", // Walrus blob id as u256 (decimal string or bigint)
  animatedBlobId: null, // optional animated cover
  coverArtPackageId: "0x...",
  releaseCoverArtPackageId: "0x...",
  oriPackageId: "0x...",
});

const cover = await getReleaseCover(
  client,
  releaseId,
  releaseCoverArtPackageId,
);
// ReleaseCoverView | null: { still, animated } as normalized Walrus refs
// ({ kind: "blob", blobId } | { kind: "quiltPatch", quiltId, version, startIndex, endIndex })
```

### Vault operations (`vault.ts`)

`vault.ts` contains composable PTB builders for custody and plugin flows:
`invokeWithAdminCap` safely sequences `borrow_as_admin → Move call → put_back`, and
`custodyNewAdminCap` shares the Vault while transferring only its owner-held
`VaultAdminCap` through the Vault module. `deriveVaultId` and
`deriveVaultAdminCapId` discover both canonical object IDs without an RPC lookup.
`withdrawVaultCapability` and `restoreVaultCapability` operate on the permanent
Vault shell; withdrawal requires every plugin to have been removed. Plugin
installers construct their witnesses inside their Move package; callers supply no
witness.

It also builds Composition/Recording royalty-pool initialization and cranks,
fixed Release settlement plus raw-admin amount composition, Party wallet
Actions, and the full Composition routed-stake Action lifecycle. Receive flows
take exact object references and construct the required
`vector<Receiving<Coin<Currency>>>` in the PTB.

The bundled Testnet deployment sets `operations.status` to `"available"` with
one canonical Vault package and registry, five distinct raw Action packages,
and three distinct suffixed plugin packages. Zero-config Testnet clients
expose that complete verified surface at `client.miso.vault` — always an
object; each member throws `OperationsUnavailableError` when a deployment's
`operations.status` is `"unavailable"`, instead of the namespace itself being
`undefined`. Custom deployments remain fail-closed unless they provide the
same atomic identity set. Structural validation checks canonical,
pairwise-distinct IDs; callers remain responsible for the provenance and
compatibility of arbitrary custom IDs. The bundled map is recursively frozen
from one verified immutable admin export.

### Migrating from 0.16

Version 0.17 is a breaking deployment-safety release. Replace flat Vault,
Action, and plugin package fields with the discriminated `operations` union.

The Release revenue plugin crank is now fixed: call
`redeemAllAndDistribute(vault, release, accumulatorRoot)` with no amount. The
explicit-amount `redeemAndDistribute` Action remains available only for raw
admin-cap composition.

### Migrating from 0.27

0.28 replaces the hand-written `MisoPlatformClient` class and its
`@misofm/effect` foundation with the sui-effect extension this README
describes throughout. See sui-effect's own
["Migrating from `@misofm/effect`"](https://github.com/unconfirmedlabs/sui-effect/blob/main/docs/extensions.md)
table for the mechanical Sui-primitive renames (`getObjectContent` →
`sui.getObject`, `SuiRpcError` → `TransportError`, …); this section is only
what changed in THIS package's own surface.

**Moved onto `Miso`** (`client.miso.*`, unchanged names): `getPressing`/
`getListing`/`getRecord`/`getSale`, `ids.*`, `tx.*`, `call`/`bcs`, `vault`,
`createShareCurrency`/`publishShareCurrencies`/`initializeShareCurrencies`,
`protocol`, `party`. All were methods/getters on the `MisoPlatformClient`
instance before; they are `Miso` service members now, still reachable the
same way through `client.miso` after `$extend(miso())`.

**Removed:**

| Before | After |
| --- | --- |
| `MisoPlatformClient`, `misoPlatform(config)`, `MisoPlatformConfig` | deleted; `Miso` + `miso()` (`SuiExtension.fromService`) |
| `PartyPlatformClient`, `new PartyosClient(client, ...)` | deleted; `client.miso.party` (`MisoPartyService`), assembled internally |
| `await client.miso.ready()` | kept, deprecated: does no work now (`Miso.layer`'s exact-chain check runs at layer build, not first use) — see `docs/CONVERSION.md` |
| `client.miso.validateChainIdentifier()` | deleted; `MisoChainIdentifierMismatchError` surfaces from `Miso.layer` build instead |
| `MisoClientNotReadyError` | deleted — no more platform-specific readiness gate; sui-effect's own `ExtensionNotReady` covers a synchronous member read before `warm`/`$ready()` |
| `client.miso.vault` returning `undefined` when unavailable | always an object; every member throws `OperationsUnavailableError` — test `deployment.operations.status`, not `if (client.miso.vault)` |
| `TxThunk` | `Recipe` (`export type TxThunk = Recipe` kept, one minor, deprecated) |
| `executeViaExecutor(executor, ...thunks)`, `@misofm/platform/execute` | deleted; `Tx.run(recipe, { signer })` — one submission under the sender lock, journal, epoch expiration, reconcile; no executor |
| `createShareCurrency(signer, params)` | `client.miso.createShareCurrency(params, { signer })` — `signer` is a sui-effect `Signer` (`Signer.fromKeypair`/`Signer.fromSdkSigner`); `gasUsed` is `bigint` |
| `publishShareCurrencies(executor, initializerAddress, count)`, `initializeShareCurrencies(executor, signerAddress, ids, metaOf)` | `client.miso.publishShareCurrencies(count, { signer })`, `client.miso.initializeShareCurrencies(ids, metaOf, { signer, onBatch? })` — batches serialize under one sender lock instead of running concurrently through an executor |
| `parseAtomicPublicationResult(p, result: PlatformExecResult)` | `(p, executed: Executed)` — `allCreatedByType`/`createdByExactType` are now `Executed.created(type)`/`createdWhere(pred)`; `gasUsed` is `bigint`; `digest` is a branded `Digest` |
| `getPressing`/`getListing`/`getRecord`/`getSale` failing `ObjectTypeMismatchError \| BcsDecodeError \| SuiRpcError` | `DecodeError \| ObjectUnavailable \| TransportError` (plus `RecordSalesUnavailableError` when this deployment has no Record sales) — one decode error, not-found stays `null` |
| `getSale`/batch reads on `getObjectsContent` (silently drops errored ids) | `sui.getObjects`, a `Result` per id — each read decides per item: `getSale` fails the whole read on a genuine `ObjectUnavailable`; a soft read like `resolveGenreNames` skips it |
| `getBalance` returning decimal strings | `Balance` with `bigint`; `read/*` JSON-safe views still return strings — only the low tier changed |
| `SuiGraphQL` from `@misofm/effect` | `SuiGraphQL` from `@unconfirmed/sui-effect` (`GraphQLUnavailableError` → `GraphQLUnavailable`; `SuiRpcError { operation }` → `TransportError { method }`) |
| a `chainIdentifier`-less registration on `devnet`/`localnet`/a custom network | `miso({ chainId })` required, or registration throws synchronously (warm) naming the network |

`@misofm/effect` is gone from `dependencies`; `@mysten/sui`, `effect`, and
`@unconfirmed/sui-effect` are peers instead.

### Extension types

```ts
import type {
  CreditView,
  RecordingCreditsView,
  CompositionRole,
  RecordingRole,
  RecordingRoleLevel,
  RecordingLeveledRoleType,
  ReleaseRole,
  ReleaseCoverView,
  CoverImageRef,
} from "@misofm/platform";
```

`RecordingLeveledRoleType` is the union of the 28 recording role base names that
carry an optional `RecordingRoleLevel` (`Producer`, `Vocalist`, `Engineer`,
`Conductor`, …) — the leveled arm of `RecordingRole`. The other arms
(`Instrumentalist`, `Custom`, and the unleveled `ArtistsAndRepertoire` /
`Copyist`) are spelled out separately in `RecordingRole`.

## Errors

Every typed failure is a `Schema.TaggedError` and declares `outcome: "applied"
| "not_applied" | "unknown"` (`SuiError.outcome`/`Script.exitCode` read it),
recoverable with `Effect.catchTag`/`Effect.catchTags` instead of message
sniffing. sui-effect's own taxonomy (`DecodeError`, `TransportError`,
`ObjectNotFound`/`ObjectDeleted`/`ObjectUnavailable`, `GraphQLUnavailable`,
`ExecutionFailed`, and the `Tx.run` union: `BuildError`, `SimulationFailed`,
`PolicyDenied`, `SigningError`, `NotApplied`, `SubmissionUnknown`,
`JournalError`, `UnexpectedEffects`) is re-exported from `@unconfirmed/sui-effect` so this
is the only import a consumer needs:

```ts
import {
  ObjectNotFound,
  ReleaseNotFoundError,
  RecordSalesUnavailableError,
  OperationsUnavailableError,
  MisoChainIdentifierMismatchError,
  MisoNetworkMismatchError,
} from "@misofm/platform/errors";
```

Platform-specific tags, all `outcome: "not_applied"` (nothing was submitted):

| Error | Fields | Raised by |
| --- | --- | --- |
| `RecordSalesUnavailableError` | `reason` | `requireRecordSalesDeployment`, `getPressing`/`getListing`/`getRecord`/`getSale`, `ids.*`/`tx.*` sales members on a legacy or unconfigured deployment |
| `OperationsUnavailableError` | `reason` | `requireOperationsDeployment`, every `client.miso.vault` member, `ids.vault`/`ids.vaultAdminCap` |
| `MisoPlatformDeploymentInvalidError` | `message` | `assertMisoPlatformDeployment` / `normalizeMisoPlatformDeployment` / `Miso.layerConfig` on an unbundled `MISO_NETWORK` |
| `MisoNetworkMismatchError` | `clientNetwork`, `deploymentNetwork` | `Miso.layer` build — synchronously at `$extend(miso())` under a `warm` registration (mainnet/testnet), or rejecting the first call for a lazy one |
| `MisoChainIdentifierMismatchError` | `actual`, `expected` | `Miso.layer` build, same timing as `MisoNetworkMismatchError` above — the exact-ledger check the predecessor's `ready()` used to perform at first use |
| `MalformedRecordSoldEventError` | `digest?`, `reason?` | `findRecordSales`/`getPurchaseReceipt(s)` on a malformed `RecordSoldEvent` |
| `MisoAuthError` | `code`, `reason`, `status?`, `cause?` | `@misofm/platform/auth` (`requestAuthorizationChallenge`, `authenticatedFetch`, …) |
| `ReleaseNotFoundError` | `releaseId` | `@misofm/platform/read` (`getReleaseResources`, `getReleaseDetail`, …) — the typed replacement for the api read service's old `isMissingRelease` message bridge |
| `ReceiptNotFoundError` | `digest` | `getPurchaseReceipt(s)` when neither the fullnode nor the indexer has the transaction |
| `RecordPurchaseNotFoundError` | `digest` | `getPurchaseReceipt(s)` when the transaction exists but carries no `RecordSoldEvent` |
| `ForeignPressingError` | `pressingId`, `actualType?` | reserved for read-layer Pressing type-mismatch bridging |

```ts
import { Effect } from "effect";

const release = miso.protocol
  .getReleaseById(releaseId)
  .pipe(
    Effect.catchTags({
      ObjectNotFound: () => Effect.succeed(null),
      TransportError: (e) => Effect.die(e), // transport failure: not recoverable here
    }),
  );
```

## Layout

```
src/
  Miso.ts                the Miso service: MisoService assembly (reads, ids/tx/call/bcs/vault, read.*, events), layer/layerConfig/layerTest
  client.ts              miso(): the SuiExtension.fromService registration (client.miso.*); MisoClient/MisoOptions
  deployments.ts         fail-closed deployment schema (MisoPlatformDeployment, PartyExtensionsDeployment) and address injection point
  packages.ts            MisoPlatformPackageBindings: extensions/primitives/party generated calls bound to one deployment
  events.ts              platformEventParsers: work/Party extensions, Actions, products, plugins, and primitive event decoders
  royalty.ts             generic royalty-pool / stake / routed-stake derive helpers and PTB builders
  pressing.ts            standalone: builders, readers, and the id derivations (Sui-based reads; Miso.tx/getPressing etc. bind these)
  queries.ts             shared read plumbing (isNotFound, re-exported from @misofm/musicos)
  transactions.ts        the Recipe (TxThunk) contract + the opinionated publish flow (disperse/finalize/publish*)
  release-graph.ts        whole release graph in one PTB (publishReleaseGraph)
  publication.ts         atomic catalog publication (publishAtomicCatalog, parseAtomicPublicationResult); Miso.publishCatalog wraps it in Tx.run
  share.ts               share-currency provisioning on Tx.run (createShareCurrency, batched variants); Miso.createShareCurrency etc. bind these to Sui
  share-template.ts      embedded `share` package bytecode
  credits.ts             EXTENSION: contributor credits + the three role vocabularies
  cover.ts               EXTENSION: release cover art (Walrus blob via ori)
  genre.ts               EXTENSION: release/recording genre vocabulary
  release-extensions.ts  EXTENSION: release kind, description, DSP links
  recording-extensions.ts EXTENSION: recording advisory, language, master reference, streaming transcode
  party/                 Party EXTENSIONS: profile, media, roles, tags, genres, CTAs, links (party/client.ts's makeMisoParty assembles MisoPartyService over the converted Partyos) — also `@misofm/platform/party`
  read/                  high-level catalog, artist, wallet, and receipt views (config.ts, client.ts's createMisoClient); Miso.read.* binds these to one deployment
  vault.ts               Vault authority, plugin, event, and receiving-coin builders; Miso.vault gates these with OperationsUnavailableError
  internal.ts            private helpers (the 0x1::option moveCall targets, immutableSnapshot) — NOT exported
  contracts.ts           barrel re-exporting the curated generated bindings as `contracts`
  contracts/             GENERATED — do not edit by hand; also reachable raw via `@misofm/platform/contracts/*`
```

## Codegen

Bindings are generated from the live Move source, so the typed layer cannot drift from
the on-chain ABI:

```sh
bun run codegen   # reads sui-codegen.config.ts → src/contracts/
```

This package's generated tree (`src/contracts/`) covers every Move package this
side of the boundary rule — the ten `party_*` extensions plus `party_wallet`,
work extensions, generic royalty/routed-stake primitives, Record and Record
Shop, Vault, generic `share`, `miso_pay`, and `platform_link` primitives, and every Action/plugin package. The Party core (`partyos`)
generates into `@misofm/partyos`, and the object-model core
(composition/recording/release/track) generates into `@misofm/musicos`;
this package depends on both for those bindings — adding either core here to
save an import is how the split these packages exist to enforce gets undone.

The root `sui-codegen.config.ts` (one level up from this package) is the
source of truth for exactly which Move packages generate into which package's
tree, and where their sibling checkouts resolve from; read it rather than
relying on an enumeration here going stale.

```sh
bun run codegen   # reads ../../sui-codegen.config.ts → src/contracts/
```

For an isolated checkout, copy the source trees it lists and set
`MISO_SDK_CODEGEN_SOURCE_ROOT` to their common parent. The codegen config reads
only from that copy, avoiding writes to a developer's live source tree.

## Dependency on `@misofm/musicos` and `@misofm/partyos`

`@misofm/musicos` and `@misofm/partyos` are regular runtime dependencies of
this package (workspace dependencies in this monorepo, resolved to published
version ranges on publish), not peers. `Miso.layer` composes their own
`Musicos.layer`/`Partyos.layer` internally (`Layer.provide`d inside `Miso`'s
own layer), so `client.miso.protocol` (the converted `Musicos` service) and
`client.miso.party` (`MisoPartyService`, `Partyos` core plus this package's
own party extensions) are always present — no readiness gate, no `!`
non-null assertion needed on either. `Miso`'s own requirement channel stays
`Sui | SuiGraphQL`, never `Sui | SuiGraphQL | Musicos | Partyos`.

`@mysten/sui` itself stays a peer dependency here, so an application resolves
exactly one Sui SDK across all three packages regardless of which
object-model or Party-identity version `@misofm/platform` pins.

```bash
bun add @misofm/platform
```

`@misofm/musicos` resolves automatically as a transitive dependency; there is
no separate install step and no peer version for consumers to reconcile.

## Testing

Tests run on `@unconfirmed/sui-effect/testing`'s in-memory fake — no network, no real
signer. `layerTest(script)` (from `@unconfirmed/sui-effect/testing`) provides `Sui`/
`SuiCore`/`SuiCoreFake` for `Effect`-level tests against `Miso.layer`/
`layerTest`; a `$extend`-level test builds `SuiCoreFake.layer(script)` and
calls `fake.client.$extend(miso({ deployment }))` directly, exactly the way a
consumer writes it:

```ts
import { Effect } from "effect";
import { SuiCoreFake } from "@unconfirmed/sui-effect/testing";
import { miso } from "@misofm/platform/client";

const fake = await Effect.runPromise(
  Effect.provide(SuiCoreFake, SuiCoreFake.layer({ network: "testnet", chainId, objects: [...] })),
);
const client = fake.client.$extend(miso({ deployment: testDeployment }));

const pressing = await client.miso.getPressing(pressingId);
await client.miso.dispose();
```

`FakeOutcome.succeed(...)`/`FakeOutcome.failWith(...)`/`FakeOutcome.transportError(...)`
script `Tx.run`'s `execute`; `TestClock` (from `effect/testing`) plus
`Journal.layerMemory` (from `@unconfirmed/sui-effect/tx`) drive a submission through a
resubmit/reconcile schedule without waiting on real time (see
`tests/share.test.ts`'s `initializeShareCurrencies` retry case). `Miso.layer`/
`layerTest` need `SuiGraphQL` too now that `read.*` joins the service — compose
`SuiGraphQL.layerUnavailable` (a test that never reaches a GraphQL-backed
member) or `SuiGraphQL.layer(stubbedClient)` alongside `layerTest`/
`SuiCoreFake.layer` the same way `@misofm/musicos`'s own GraphQL tests do.

`tests/deployments.test.ts` covers the pure `deployments.ts` validators
(`requireRecordSalesDeployment`/`requireOperationsDeployment`, the frozen
bundled manifest); `tests/client.test.ts` is only the derived facade
(registration, nested namespaces, a fragment composed with a sibling
fragment, a submit-on-behalf member, rejection identity, the
network-mismatch path); `tests/Miso.test.ts` is the service at the `Effect`
level (the exact-chain check, `layerConfig`, `layerTest`).
