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
bun add @misofm/partyos @mysten/sui
```

`@mysten/sui` is a peer dependency pinned to one exact version.

## Use

```ts
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { partyos } from "@misofm/partyos";

const client = new SuiGrpcClient({ network: "testnet" }).$extend(partyos());

const party = await client.partyos.getPartyById("0x...");
const groups = await client.partyos.getMemberships(party.id);

const tx = new Transaction();
await client.partyos.tx.createIndividualParty({ name: "Ada", recipient: "0x..." })(tx);
```

Every builder under `tx` appends commands to a caller-owned `Transaction` and never
executes. `call` exposes the generated, package-bound Move calls (minus the
reference-returning views a PTB cannot use), and `bcs` the generated codecs.

## Deployment manifest

`PARTYOS_DEPLOYMENTS` bundles the verified testnet deployment: a single key, `partyos`.
Pass `partyos({ deployment })` for another network; a manifest with any other shape is
rejected before a Move target is constructed.

## Subpaths

`@misofm/partyos` (everything), `/client`, `/deployments`, `/queries`, `/transactions`,
`/types`, `/contracts` (curated bindings), `/contracts/*` (raw generated modules).
