# misofm/sdks

Monorepo for the Miso platform-layer TypeScript SDKs.

| Package                                          | Description                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [`packages/effect`](packages/effect/README.md) | `@misofm/effect` — **deprecated**, superseded by [`sui-effect`](https://github.com/unconfirmedlabs/sui-effect); 0.2.0 is a code-identical final release whose README carries the migration table. |
| [`packages/musicos`](packages/musicos/README.md) | `@misofm/musicos` — typed bindings, queries, event decoders, and PTB builders for the works object model (Composition, Recording, Release, Track). |
| [`packages/partyos`](packages/partyos/README.md) | `@misofm/partyos` — typed bindings, queries, and PTB builders for the Party object model (Party, admin cap, group membership). |
| [`packages/platform`](packages/platform/README.md) | `@misofm/platform` — the complete client SDK for the Miso platform layer: work and Party extensions, catalog/artist/wallet reads, record production and sale, and Vault custody/Actions/plugins. |
| [`packages/streaming`](packages/streaming/README.md)           | `@misofm/streaming` — the `miso-hls/v1` streaming transcode contract (ladder, segment policy, Quilt item naming) plus a browser player entry point. |
| [`packages/transcoding`](packages/transcoding/README.md) | `@misofm/transcoding` — deterministic AAC-LC fMP4 HLS transcoder that produces and verifies the `miso-hls/v1` layout. Node only, FFmpeg required. |

This root `package.json` is private; each package under `packages/*` is
published independently. See each package's own README for install
instructions and API surface.

## The object-model / platform boundary

The three Sui packages split along one rule:

> `@misofm/musicos` and `@misofm/partyos` are the object models. Everything Miso
> offers on top of them is platform.

`@misofm/musicos` binds only the `musicos` Move package (Composition, Recording,
Release, Track) and `@misofm/partyos` only the `partyos` Move package (Party,
admin cap, group membership) — the permissionless object models anyone can
build on. Everything else Miso's own product adds on top — work and Party
extensions, royalty primitives, Vault, Actions, and every product-specific
workflow — ships from `@misofm/platform`. Generated bindings follow the same
split: `packages/musicos/src/contracts/` and `packages/partyos/src/contracts/`
hold only their object model, and `packages/platform/src/contracts/` holds
everything else. `sui-codegen.config.ts`
is the source of truth for exactly which Move package lands in which tree —
see its `packages` list rather than looking for an enumeration here.

## Effect

Every SDK exposes [Effect](https://effect.website) v4 in its public API: reads and
submissions return `Effect` values that require the `SuiClient` service from
`@misofm/effect` and fail with tagged errors (`Effect.catchTag`); the client
extensions (`miso()`, `partyos()`, `misoPlatform()`) provide that service
themselves so their methods have no requirements; PTB builders stay synchronous.
Each package's `./errors` subpath lists its failures. Pin `effect` to the exact
release candidate the packages peer on.

## Development

This is a Bun workspace.

```sh
bun install
bun run typecheck   # across all packages
bun run test        # across all packages
bun run build       # across all packages
```

## License

Apache-2.0 — see [LICENSE](LICENSE).
