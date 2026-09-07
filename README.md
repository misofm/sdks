# misofm/sdks

Monorepo for the Miso platform-layer TypeScript SDKs.

| Package                                          | Description                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [`packages/platform`](packages/platform/README.md) | `@misofm/platform` — the complete client SDK for the Miso platform layer: catalog/artist/wallet reads, record production and sale, and Vault custody/Actions/plugins. |
| [`packages/protocol`](packages/protocol/README.md) | `@misofm/protocol` — typed bindings, queries, event decoders, and PTB builders for the Miso protocol and Party package set.            |
| [`packages/streaming`](packages/streaming/README.md)           | `@misofm/streaming` — the `miso-hls/v1` streaming transcode contract (ladder, segment policy, Quilt item naming) plus a browser player entry point. |
| [`packages/transcoding`](packages/transcoding/README.md) | `@misofm/transcoding` — deterministic AAC-LC fMP4 HLS transcoder that produces and verifies the `miso-hls/v1` layout. Node only, FFmpeg required. |
| [`packages/utils`](packages/utils/README.md) | `@misofm/utils` — shared exact integers, canonical codecs, and typed Effect boundaries. |

This root `package.json` is private; each package under `packages/*` is
published independently. See each package's own README for install
instructions and API surface.

## Development

This is a Bun workspace.

```sh
bun install
bun run typecheck   # across all packages
bun run test        # across all packages
bun run build       # across all packages
bun run test:consumer # real tarballs, Node imports, TypeScript 5.9 declarations
```

## SDK conventions

Asynchronous workflows use Effect `4.0.0-rc.112`, pinned across packages.
Existing Promise entry points remain available; composable workflows add an
`Effect` suffix. See [the migration guide](docs/effect-migration.md) for
composition, error handling, cancellation, and compatibility details.

Use `get` for domain reads, `fetch` for raw HTTP, `parse` for decoding external
data, `derive` for deterministic IDs, `get...Url` for URLs, `build` for
construction, and `execute` for submission. Preserve existing domain verbs and
public aliases. Document whether absent data returns `null`, an empty
collection, or a failure. Keep pure parsers and transaction builders synchronous.

Before adding a helper, check the pinned Mysten SDK's utilities and existing
SDK exports. Shared policy belongs in `@misofm/utils`; Sui queries belong in
protocol and filesystem/process policy belongs in transcoding. Generated
contract bindings must be changed through code generation.

Packages publish independently. Release `utils` before packages that newly
depend on it, then streaming and protocol before platform and transcoding.
The publishing workflow accepts `utils-v*` tags. Actual npm publication still
requires the package's trusted-publisher configuration.

## License

Apache-2.0 — see [LICENSE](LICENSE).
