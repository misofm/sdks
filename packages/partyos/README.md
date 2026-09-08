# @misofm/partyos

Typed bindings, queries, and PTB builders for the PartyOS object model on Sui: the
`Party` object, its `PartyAdminCap`, and consent-based group membership.

> `@misofm/partyos` is the object model. Everything Miso offers on top of it is platform.

A Party's profile, media, roles, tags, genres, CTAs, platform links, and wallet are
extensions someone chose to offer, so they ship from
[`@misofm/platform`](https://www.npmjs.com/package/@misofm/platform), which depends on
this package. Which Move package generates into which SDK is decided by
`sui-codegen.config.ts` in the [misofm/sdks](https://github.com/misofm/sdks) repo.

## Install

```sh
bun add @misofm/partyos @misofm/effect effect @mysten/sui
```

`@mysten/sui` and `effect` (exactly `4.0.0-rc.112`) are peer dependencies.

## Use

Every read returns an `Effect` that requires the `SuiClient` service instead of
taking a client parameter — see [`@misofm/effect`](https://www.npmjs.com/package/@misofm/effect)
for the shared `SuiClient` service and error vocabulary every `@misofm/*` package
builds on.

### Through the client extension

`client.partyos.*` provides `SuiClient` internally (bound to the client it was
built from), so each method already returns `Effect<A, E>` with `R = never` —
just `Effect.runPromise` it:

```ts
import { Effect } from "effect";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { partyos } from "@misofm/partyos";

const client = new SuiGrpcClient({ network: "testnet" }).$extend(partyos());

const program = Effect.gen(function* () {
  const party = yield* client.partyos.getPartyById("0x...");
  const groups = yield* client.partyos.getMemberships(party.id);
  return { party, groups };
}).pipe(
  Effect.catchTag("ObjectNotFoundError", (error) => Effect.succeed({ party: null, groups: [], missing: error })),
);

const { party, groups } = await Effect.runPromise(program);

const tx = new Transaction();
await client.partyos.tx.createIndividualParty({ name: "Ada", recipient: "0x..." })(tx);
```

Every builder under `tx` appends commands to a caller-owned `Transaction` and never
executes (`tx`/`call`/`bcs` stay synchronous). `call` exposes the generated,
package-bound Move calls (minus the reference-returning views a PTB cannot use),
and `bcs` the generated codecs.

### Free functions

The functions in `./queries` take no client parameter — they declare `SuiClient`
in their Effect's requirements, so provide it once at your program's boundary:

```ts
import { Effect } from "effect";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SuiClient } from "@misofm/effect";
import { getPartyById } from "@misofm/partyos/queries";

const client = new SuiGrpcClient({ network: "testnet" });

const program = getPartyById("0x...", "0xPARTYOS_PACKAGE");

const party = await Effect.runPromise(program.pipe(Effect.provide(SuiClient.layer(client))));
```

## Errors

Reads fail with the shared `@misofm/effect` vocabulary: `ObjectNotFoundError { objectId }`,
`ObjectTypeMismatchError { objectId, expected, actual }` (e.g. a `Party` object from a
different partyos deployment, or an id that is not a `Party` at all), `BcsDecodeError`,
and `SuiRpcError`. Recover from one with `Effect.catchTag("ObjectNotFoundError", ...)`
rather than an `isNotFound(error)` predicate. `./errors` re-exports the full
`@misofm/effect/errors` vocabulary plus `PartyNotFoundError { partyId }`, offered for
callers that want a party-scoped tag instead of pattern-matching the generic one.
`validatePartyDeployment` (in `./deployments`) fails with `DeploymentError { message }`.

## Deployment manifest

`PARTYOS_DEPLOYMENTS` bundles the verified testnet deployment: a single key, `partyos`.
Pass `partyos({ deployment })` for another network; a manifest with any other shape is
rejected before a Move target is constructed (`assertPartyDeployment`/`normalizePartyDeployment`
throw synchronously; `validatePartyDeployment` is the Effect-returning counterpart for
callers composing a config-loading pipeline out of Effects).

## Subpaths

`@misofm/partyos` (everything), `/client`, `/deployments`, `/errors`, `/queries`,
`/transactions`, `/types`, `/contracts` (curated bindings), `/contracts/*` (raw
generated modules).
