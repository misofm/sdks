# @misofm/musicos

`@misofm/musicos` is the object model of works. Everything Miso offers on top
of it — work extensions, royalty primitives, Party extensions, and every
product-specific workflow — is platform, and lives in
[`@misofm/platform`](../platform/README.md); the Party object model itself is
[`@misofm/partyos`](../partyos/README.md). This package holds ONLY the
typed bindings, queries, event decoders, and PTB builders for the `musicos`
Move package: Composition, Recording, Release, and Track.

## Usage

Register the `miso()` client extension on any `@mysten/sui` Core-API client:

```ts
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { miso } from "@misofm/musicos/client";

const client = new SuiGrpcClient({ network: "testnet" }).$extend(miso());

const composition = await client.miso.getCompositionById("0x...");
```

`miso()` resolves the bundled, verified `MISO_DEPLOYMENTS` manifest for the
client's network by default. Pass an explicit `deployment` to override it —
either the minimal `{ packageId }` shape (core calls, types, and derived IDs
only) or a complete `MisoDeployment` (also unlocks `client.miso.packages`,
the full generated call/BCS bindings bound to that manifest).

## Exports

| Subpath                    | Purpose                                                 |
| --------------------------- | ------------------------------------------------------- |
| `@misofm/musicos`           | Root entrypoint                                          |
| `@misofm/musicos/client`    | Client construction (`miso()`, `MisoProtocolClient`)     |
| `@misofm/musicos/deployments` | Deployed package IDs by network                        |
| `@misofm/musicos/queries`   | Read queries over Composition, Recording, Release, Track |
| `@misofm/musicos/transactions` | PTB command builders                                  |
| `@misofm/musicos/execute`  | Transaction execution helpers                             |
| `@misofm/musicos/view`     | `simulateTransaction`-backed view helpers                 |
| `@misofm/musicos/types`    | Shared TypeScript types                                   |
| `@misofm/musicos/parsers`  | Event parsers                                              |
| `@misofm/musicos/events`   | Event decoders                                             |
| `@misofm/musicos/packages` | Module→package bindings                                    |
| `@misofm/musicos/contracts` and `@misofm/musicos/contracts/*` | Generated ABI-bound bindings (BCS structs + Move calls) |

## Deployment manifest

`MisoDeployment` has exactly one key, `musicos` — the published `musicos`
package address. `MISO_DEPLOYMENTS` bundles the verified immutable manifest
per network (currently `testnet`); `getMisoDeployment(network)` resolves it,
failing closed for networks without a bundled manifest. Pass an explicit
manifest to `miso({ deployment })` to override it, e.g. for a local or
freshly-published deployment.

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
bun add @misofm/musicos
```

Peer dependency: `@mysten/sui@2.29.0` (exact).

## License

Apache-2.0
