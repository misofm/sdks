# @misofm/platform

The complete client SDK for the **Miso platform layer** on Sui: composed catalog,
artist, wallet, and receipt reads; the Party extensions (profile, media, roles,
tags, genres, CTAs, platform links); the record production line and sale of
copies; fail-closed Vault custody, raw Actions, and safe crank plugins; and
every first-party extension and generic royalty primitive built on top of the
`@misofm/musicos` object model and the `@misofm/partyos` Party identity model.

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

This package depends on `@misofm/musicos` directly and imports its bare
`createComposition`/`createRecording` primitives, composing them with its own
minato-dispersal and share-currency logic in the same PTB — the
transaction-thunk composition pattern from the
[Sui SDK building guide](https://sdk.mystenlabs.com/sui/sdk-building), just
crossing a package boundary.

```sh
bun add @misofm/platform
```

`@misofm/musicos` resolves transitively through that dependency, so
applications get exactly one object-model SDK and one compatible deployment map
without installing it themselves. Registration takes a recursively frozen
snapshot of custom deployment/config records without freezing the caller's
original objects, so later caller mutation cannot retarget an existing client.

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

Register the client extension on any client implementing Sui's Core API
([SDK building guidelines](https://sdk.mystenlabs.com/sui/sdk-building)):

```ts
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { miso } from "@misofm/platform";

const client = new SuiGrpcClient({ network: "testnet", baseUrl }).$extend(
  miso({ deployment: verifiedDeployment }),
);

// One memoized Core API read proves this endpoint is the deployment's exact
// ledger before any synchronous client-bound builder can be used.
await client.miso.ready();

// The permissionless object-model SDK is part of the same facade.
const release = await client.miso.protocol.getReleaseById(releaseId);
// Party identity comes from @misofm/partyos; platform adds the extensions.
// client.miso.party is a PartyPlatformClient wrapping a PartyosClient (core
// reads/builders delegate straight through) bound to this deployment's
// `partyos` (core) and `party` (extensions) sections — also importable
// standalone from `@misofm/platform/party`.
const party = await client.miso.party.getPartyById(partyId);

// Read: run + one currency's offer, one round trip, no registry lookup.
const { pressing, listing } = await client.miso.getSale({
  releaseId,
  edition,
  currencyType: USD_COIN_TYPE,
});

// Write: a thunk, so it composes with protocol calls in the same PTB.
const tx = new Transaction();
tx.add(
  client.miso.tx.purchaseRecord({
    releaseId,
    edition,
    currencyType: USD_COIN_TYPE,
    paymentAmount: listing.pricing.amount,
    expectedPricing: listing.pricing,
    recipient: buyer,
  }),
);
```

The bundled Testnet deployment includes both verified immutable package IDs.
Custom deployments can still mark sales unavailable explicitly; sales builders
and readers fail closed whenever either package is unavailable.

Holding the ids yourself? The bare APIs take `recordPackageId` and/or
`recordShopPackageId` explicitly:

```ts
import { purchaseRecord, getSale } from "@misofm/platform/pressing";
```

Verified package and singleton IDs are bundled in
`MISO_PLATFORM_DEPLOYMENTS.testnet`. Calling `miso()` selects that verified map
from the Sui client's network. Unbundled and custom networks still fail closed
unless the caller passes one complete deployment through `miso({ deployment })`.

The deprecated `misoPlatform(config)` constructor remains for callers that
supply flat package ids instead of a complete deployment; it registers at
`client.misoPlatform` instead of `client.miso` and requires the same
`await client.misoPlatform.ready()` gate before use. Prefer zero-config
`miso()` for new integrations.

### Party and the generated contract tree

Party identity (the `Party` object, `PartyAdminCap`, group membership) is
owned by `@misofm/partyos`; this package only owns the extensions attached to
it. `PartyPlatformClient` wraps a `PartyosClient` — every core method
(`getPartyById`, `getMemberships`, …) delegates straight through, and `tx`/
`call`/`bcs` merge the core and extension surfaces — and is also importable
standalone (the same class `client.miso.party` returns):

```ts
import { PartyosClient } from "@misofm/partyos";
import { PartyPlatformClient } from "@misofm/platform/party";

const core = new PartyosClient(client, verifiedDeployment.partyos);
const party = new PartyPlatformClient(client, core, verifiedDeployment.party);
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

```ts
import {
  createMisoClient,
  getDiscoverShelf,
  getReleaseDetail,
  getOwnedRecords,
} from "@misofm/platform/read";

const miso = createMisoClient({ config: verifiedReadConfig });

const discover = await getDiscoverShelf(miso);
const release = await getReleaseDetail(miso, releaseId);
const library = await getOwnedRecords(miso, walletAddress);
```

The package root also exposes the same functions under the `read` namespace:

```ts
import { read } from "@misofm/platform";

const miso = read.createMisoClient({ config: verifiedReadConfig });
const artist = await read.getArtistProfile(miso, partyId);
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
import { miso } from "@misofm/platform";

const client = new SuiGrpcClient({ network: "testnet", baseUrl }).$extend(
  miso({ deployment: verifiedDeployment }),
);

// Mints the composition's share supply, disperses it to shareRecipients as
// address balances, publishes (shares) the composition, and transfers the
// CompositionAdminCap to adminAddress — createComposition → finalizeComposition
// in one PTB.
const thunk = client.miso.tx.publishComposition({
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
The deprecated `misoPlatform()` constructor still accepts those values manually
for compatibility with existing integrations. It must also receive the exact
`network` and `chainIdentifier`; call `await client.misoPlatform.ready()` before
accessing its client-bound protocol or platform surfaces.

For custom PTBs, the bare primitives (`disperseShares`, `finalizeComposition`,
`finalizeRecording`) and the whole-graph orchestrator are exported standalone:

```ts
import { publishReleaseGraph } from "@misofm/platform";

// Every composition and recording, optional royalty pools, tracks, and
// the release — with the release id derived ON-CHAIN — in one atomic PTB.
const thunk = publishReleaseGraph({
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
import {
  assertAtomicPublicationBounds,
  parseAtomicPublicationResult,
  publishAtomicCatalog,
} from "@misofm/platform/publication";

const publication = {
  deployment,
  parties,
  compositions, // includes initialized share Currency + TreasuryCap ids
  recordings,
  release,
  pressing,
};

// Pure local assembly: fail before publishing any share package if the final
// PTB exceeds the SDK's command/input safety limits or has an invalid graph.
assertAtomicPublicationBounds(publication);

const executed = await client.miso.executeViaExecutor(
  executor,
  publishAtomicCatalog(publication),
);
const result = parseAtomicPublicationResult(publication, executed);
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
then initialize their currencies, then submit the atomic catalog PTB. The two
share helpers below accept a parallel-compatible executor, allowing package
batches to queue concurrently while a hardware signer serializes approvals.

### Share Currency Provisioning (`share.ts`)

Every composition and recording is backed by its own fixed-supply share
currency: an independently published `share` package (bytecode template
embedded as `SHARE_TEMPLATE`, initializer patched via `patchInitializer`).
Publish and initialize are necessarily two transactions:

```ts
// Sequential (one currency, two txs):
const currency = await client.miso.createShareCurrency(signer, {
  name: "Song Shares",
  description: "…",
});
// → { packageId, currencyId, shareType, treasuryCapId, gasUsed }

// Batched (many currencies, via a ParallelTransactionExecutor):
import { publishShareCurrencies, initializeShareCurrencies } from "@misofm/platform";
const { packageIds } = await publishShareCurrencies(
  executor,
  initializerAddress,
  10,
);
const { currencies } = await initializeShareCurrencies(
  executor,
  signerAddress,
  packageIds,
  (pkg) => ({
    name: "…",
    description: "…",
  }),
);
```

`executeViaExecutor(executor, ...thunks)` (`execute.ts`) submits a
non-idempotent PTB through a `ParallelTransactionExecutor` exactly once (no
auto-retry) — it's what the batched provisioning above builds on, layered over
`@misofm/musicos`'s transport-agnostic `buildTx`/`toExecResult`.

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
and three distinct suffixed plugin packages. Zero-config Testnet clients expose
that complete verified surface after `await client.miso.ready()`. Custom
deployments remain fail-closed unless they provide the same atomic identity set.
Structural validation checks canonical, pairwise-distinct IDs; callers remain
responsible for the provenance and compatibility of arbitrary custom IDs. The
bundled map is recursively frozen from one verified immutable admin export.

### Migrating from 0.16

Version 0.17 is a breaking deployment-safety release. Replace flat Vault,
Action, and plugin package fields with the discriminated `operations` union.
After client
registration, call `await client.miso.ready()` before using synchronous
`client.miso.tx`, `ids`, `call`, `vault`, or `party` surfaces. Platform reads
and SDK execution helpers await the same memoized readiness check themselves.
Standalone builders remain pure for offline composition, so their caller is
responsible for completing this exact-chain validation lifecycle before
execution.

The Release revenue plugin crank is now fixed: call
`redeemAllAndDistribute(vault, release, accumulatorRoot)` with no amount. The
explicit-amount `redeemAndDistribute` Action remains available only for raw
admin-cap composition.

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

## Layout

```
src/
  deployments.ts         fail-closed deployment schema (MisoPlatformDeployment, PartyExtensionsDeployment) and address injection point
  client.ts              the full client.miso facade; object-model core lives at client.miso.protocol, Party at client.miso.party
  packages.ts            MisoPlatformPackageBindings: extensions/primitives/party generated calls bound to one deployment
  events.ts              platformEventParsers: extension + generic-primitive event decoders
  royalty.ts             generic royalty-pool / stake / routed-stake derive helpers and PTB builders
  pressing.ts            facade: builders, readers, and the id derivations
  queries.ts             shared read plumbing (isNotFound, re-exported from @misofm/musicos)
  transactions.ts        the TxThunk contract + the opinionated publish flow (disperse/finalize/publish*)
  release-graph.ts        whole release graph in one PTB (publishReleaseGraph)
  publication.ts         atomic catalog publication (publishAtomicCatalog)
  share.ts               share-currency provisioning (createShareCurrency, batched variants)
  share-template.ts      embedded `share` package bytecode
  credits.ts             EXTENSION: contributor credits + the three role vocabularies
  cover.ts               EXTENSION: release cover art (Walrus blob via ori)
  genre.ts               EXTENSION: release/recording genre vocabulary
  release-extensions.ts  EXTENSION: release kind, description, DSP links
  recording-extensions.ts EXTENSION: recording advisory, language, master reference, streaming transcode
  party/                 Party EXTENSIONS: profile, media, roles, tags, genres, CTAs, links (PartyPlatformClient, wraps @misofm/partyos's PartyosClient) — also `@misofm/platform/party`
  read/                  high-level catalog, artist, wallet, and receipt views
  vault.ts               Vault authority, plugin, event, and receiving-coin builders
  execute.ts              executeViaExecutor, layered on @misofm/musicos's buildTx/toExecResult
  internal.ts            private helpers (the 0x1::option moveCall targets) — NOT exported
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
Shop, Vault, and every Action/plugin package. The Party core (`partyos`)
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
version ranges on publish), not peers. This package imports their primitives
and deployment configuration directly, then exposes the object-model client
at `client.miso.protocol` only after `await client.miso.ready()` validates the
exact ledger. `client.miso.party` is a `PartyPlatformClient`
(`@misofm/platform/party`) wrapping a `PartyosClient` from `@misofm/partyos`
for the Party core, with the first-party extensions (profile, media, roles,
tags, genres, CTAs, platform links) layered on top. Direct object-model
reads, generated calls, package bindings, and Party APIs (core and
extensions alike) cannot be obtained before the readiness gate.

`@mysten/sui` itself stays a peer dependency here, so an application resolves
exactly one Sui SDK across all three packages regardless of which
object-model or Party-identity version `@misofm/platform` pins.

```bash
bun add @misofm/platform
```

`@misofm/musicos` resolves automatically as a transitive dependency; there is
no separate install step and no peer version for consumers to reconcile.
