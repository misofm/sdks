# @misofm/partyos

A [sui-effect](https://github.com/unconfirmedlabs/sui-effect) extension for the
PartyOS object model on Sui: the `Party` object, its `PartyAdminCap`, and
consent-based group membership.

> `@misofm/partyos` is the object model. Everything Miso offers on top of it is
> platform.

A Party's profile, media, roles, tags, genres, CTAs, platform links, and wallet are
extensions someone chose to offer, so they ship from
[`@misofm/platform`](https://www.npmjs.com/package/@misofm/platform), which depends on
this package. Which Move package generates into which SDK is decided by
`sui-codegen.config.ts` in the [misofm/sdks](https://github.com/misofm/sdks) repo.

## Install

```sh
bun add @misofm/partyos sui-effect effect @mysten/sui
```

`sui-effect`, `@mysten/sui` and `effect` (exactly `4.0.0-rc.112`) are peer
dependencies.

## Use

### Promise consumers: `client.$extend`

`partyos()` registers `client.partyos`, built once from the client's own
transport (one connection, one chain-identifier check shared with everything
else on the client). Every rejection is the same tagged error instance an
Effect caller would have caught, so a Promise consumer can still switch on
`_tag`:

```ts
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { partyos, PartyNotFound } from "@misofm/partyos";
import { ObjectId } from "sui-effect";

const client = new SuiGrpcClient({ network: "testnet", baseUrl }).$extend(partyos());

try {
  const party = await client.partyos.getPartyById(ObjectId.make("0x..."));
  const groups = await client.partyos.getMemberships(party.id);
} catch (error) {
  if (error instanceof PartyNotFound) {
    // error.partyId
  }
  throw error;
}

// Recipe fragments are synchronous even on the Promise face (`warm` builds
// the runtime inside `register`, so `tx` is real immediately).
const tx = new Transaction();
client.partyos.tx.createIndividualParty({ name: "Ada", recipient: "0x..." })(tx);

await client.partyos.dispose();
```

### Effect consumers: the service directly

```ts
import { Effect, Layer } from "effect";
import { Sui, SuiCore } from "sui-effect";
import { Partyos } from "@misofm/partyos";

const program = Effect.gen(function* () {
  const partyos = yield* Partyos;
  const party = yield* partyos.getPartyById(partyId);
  const groups = yield* partyos.getMemberships(party.id);
  return { party, groups };
}).pipe(Effect.catchTag("PartyNotFound", (error) => Effect.succeed({ party: null, groups: [], missing: error })));

await Effect.runPromise(
  program.pipe(
    Effect.provide(Partyos.layer()), // or `.layerConfig` / `.layerTest()`
    Effect.provide(Sui.layerNoDeps),
    Effect.provide(SuiCore.layerFromClient(client)),
  ),
);
```

Every member's requirement channel is empty (`R = never` once you have a
`Partyos`): the layer captures `Sui` once and provides it to every member
internally.

### PTB fragments

`partyos.tx.*` (or the free functions in `./transactions`, each taking
`partyPackageId` explicitly) are `Recipe`s — `(tx: Transaction) => void` — so
a consumer composes PartyOS's commands with other extensions' fragments into
one transaction and submits once:

```ts
import { Transaction } from "@mysten/sui/transactions";

const tx = new Transaction();
client.partyos.tx.setName({ partyId, capId, name: "New name" })(tx);
someOtherExtension.claim(...)(tx);
```

### Free functions

`derivePartyAdminCapId` and `partyType` (in `./queries`) are pure and
synchronous — no `Sui` required — and stay exported for callers that only
need them:

```ts
import { derivePartyAdminCapId } from "@misofm/partyos/queries";

const capId = derivePartyAdminCapId(partyId, packageId);
```

### Event decoding

Use the pure decoders from `@misofm/partyos/events` after routing an event to
its known on-chain type:

```ts
import { partyEventParsers } from "@misofm/partyos/events";

const rawEventBcs: Uint8Array = getRawEventBytes();
const event = partyEventParsers.core.partyCreated(rawEventBcs);
// event.kind is 0 (individual) or 1 (group)
// event.created_at_ms and event.created_epoch are decimal strings
```

`partyEventParsers` targets the v1 PartyOS event ABI and preserves generated
snake_case fields. Its canonical events are `partyCreated`, `partyShared`,
`partyNameSet`, `partyGroupInviteCreated`, `partyGroupMembershipAccepted`,
`partyGroupInviteDeclined`, `partyGroupInviteRevoked`,
`partyGroupMembershipLeft`, and `partyGroupMembershipRemoved`. `u64` values
are decimal strings, and `removed_since_epoch` is `string | null`, preserving
the difference between an absent value and epoch `"0"`. The registry does not
discover an event type or verify its deployment; callers choose the matching
codec after routing. Generated codecs, including the event codecs, remain
available from `contracts.party`.

## Errors

| Member | Fails with |
|---|---|
| `getPartyById` | `PartyNotFound` (missing or deleted), `DecodeError` (not a `Party` of this deployment), `TransportError` |
| `getPartiesByIds` | `TransportError` (per-item failures — `PartyNotFound`, `DecodeError`, `ObjectUnavailable` — come back as a `Result` per distinct id) |
| `getMemberships` / `getPendingInvites` / `getPendingMemberships` | `DecodeError`, `TransportError` |
| `isMember` | `TransportError` |
| `Partyos.layer` / `layerConfig` | `PartyosDeploymentError` (an explicit manifest did not validate, or this release bundles no deployment for the client's network), `ConfigError` (`layerConfig` only) |

Every error is a `Schema.TaggedError` declaring `outcome: "applied" | "not_applied" | "unknown"`
(sui-effect's `SuiError.outcome` and `Script.exitCode` read it). Recover with
`Effect.catchTag("PartyNotFound", ...)` — never an `isNotFound(error)`
predicate. `./errors` also exports `PartyReadError` and `PartyBatchItemError`,
the two union aliases above.

## Deployment manifest

`PARTYOS_DEPLOYMENTS` bundles the verified testnet deployment: a single key, `partyos`.
Pass `partyos({ deployment })` for another network; a manifest with any other shape is
rejected before a Move target is constructed (`assertPartyDeployment`/`normalizePartyDeployment`
throw synchronously; `validatePartyDeployment` is the Effect-returning counterpart, now
failing with `PartyosDeploymentError`, for callers composing a config-loading pipeline
out of Effects). `Partyos.layerConfig` reads `PARTYOS_PACKAGE_ID` from the environment;
unset, it falls back to the bundled manifest for the client's network.

## Testing

`@misofm/partyos/testing` ships `PARTYOS_TEST_DEPLOYMENT`, `fakeParty(...)` (a
`Party` object with real BCS content), and `fakeMembershipField(...)` (a
`MembershipKey` / `PendingInviteKey` / `PendingMembershipKey` dynamic-field
entry) for building a `FakeScript` against `sui-effect/testing`'s harness —
`layerExtensionTest(Partyos.layerTest(), script)` — with no network. See
`tests/Partyos.test.ts` in this repo.

## Migrating from `PartyosClient`

`PartyosClient`, `PartyProtocolClient`, `bindModulePackage` and `TxThunk` are
deprecated (still exported from the package root, not `/client`) and superseded
by `Partyos` / `partyos()` / `Recipe`. `PartyosClient`'s methods now fail with
this package's own taxonomy (see the error table above) instead of
`@misofm/effect`'s `ObjectNotFoundError` / `ObjectTypeMismatchError` /
`BcsDecodeError` / `SuiRpcError`.

## Subpaths

`@misofm/partyos` (everything), `/client` (`Partyos`, `partyos`), `/deployments`,
`/errors`, `/events`, `/queries`, `/testing`, `/transactions`, `/types`,
`/contracts` (curated bindings), `/contracts/*` (raw generated modules).
