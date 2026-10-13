# Changelog

All notable changes to `@misofm/streaming`, newest first.

## 0.4.0

Moves the package from Effect `4.0.0-rc.112` to stable Effect `4.0.3`. The public API and
the `miso-hls/v1` contract are unchanged: no export was added, removed or re-typed (the
built `.d.ts` files are identical to 0.3.0), and the source needed no change.

### Changed (breaking)

- **Peer `effect` is now `>=4.0.3 <4.1`** (was exactly `4.0.0-rc.112`). Release candidates are
  no longer supported; stay on 0.3.x for `effect@4.0.0-rc.112`. The optional `hls.js` peer
  (`^1.6`) is unchanged.

### Behaviour changes to be aware of (from Effect 4.0.x)

Audit of this package: it uses `Effect.acquireRelease` / `Effect.scoped` (`acquirePlayer`),
`Fiber.interrupt` (warm-up cancellation) and `Schema.TaggedError` errors, and no
`partition`, `Effect.retry`, `Effect.timeout` or `Stream` operator. The tests that cover
release-on-scope-close, interruption aborting every in-flight fetch, and the error classes
pass unchanged. The error classes' `message`, JSON and `Schema` encode/decode output is
byte-identical to 0.3.0.

- `Scope.close` finalizers (so `acquirePlayer`'s release) run uninterruptibly in Effect
  4.0.x; the release only detaches hls.js and clears the media element, so this is
  unobservable here.
- `Cause.pretty` includes stack frames and `SchemaError` renders as JSON, so logged error
  text is longer.

### Migrating from 0.3.x

1. Move the whole Effect release train to stable together (`effect@4.0.3`, every `@effect/*`
   package at `4.0.3`). Pin `4.0.x` explicitly; the `rc` dist-tag still points at a
   release candidate.
2. Nothing to change in code that imports from `@misofm/streaming`.
