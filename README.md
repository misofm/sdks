# misofm/sdks

Monorepo for the Miso platform-layer TypeScript SDKs.

| Package                                          | Description                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [`packages/platform`](packages/platform/README.md) | `@misofm/platform` — the complete client SDK for the Miso platform layer: catalog/artist/wallet reads, record production and sale, and Vault custody/Actions/plugins. |
| [`packages/protocol`](packages/protocol/README.md) | `@misofm/protocol` — typed bindings, queries, event decoders, and PTB builders for the Miso protocol and Party package set.            |
| [`packages/streaming`](packages/streaming/README.md)           | `@misofm/streaming` — the `miso-hls/1` streaming transcode contract (ladder, segment policy, Quilt item naming) plus a browser player entry point. |
| [`packages/transcoder`](packages/transcoder/README.md) | `@misofm/transcoder` — deterministic AAC-LC fMP4 HLS transcoder that produces and verifies the `miso-hls/1` layout. Node only, FFmpeg required. |

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
```

## License

Apache-2.0 — see [LICENSE](LICENSE).
