# Changelog

All notable changes to `@misofm/streaming`, newest first.

## 0.4.0

Moves the package from Effect `4.0.0-rc.112` to stable Effect `4.0.x` (developed and tested on `4.0.4`, peer floor `4.0.3`). The public API and
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
- A `SchemaError` serialised as JSON or inspected is now a compact `{ _tag, message }`
  object instead of a dump of the schema AST (Effect #8895), so such log lines are
  shorter. `Cause.pretty` is unchanged. Nothing in this package logs a `SchemaError`.

### Migrating from 0.3.x

1. Move the whole Effect release train to stable together and pin it to one `4.0.x`
   version, for example `"effect": "4.0.4"` with `"@effect/platform-node": "4.0.4"` and every
   other `@effect/*` package you use at `4.0.4` (`4.0.3` works too, if all of them match).
   Do not rely on the peer range alone: it admits `>=4.0.3 <4.1`, but each `@effect/*` package
   peers on its own `effect` floor (for example `@effect/platform-node@4.0.4` and its
   `@effect/platform-node-shared` need `effect ^4.0.4`), so an unpinned install can resolve an
   invalid tree (npm `ERESOLVE` / `ELSPROBLEMS`). A mixed release-candidate and stable install
   fails to resolve `effect/*` module paths, and two `effect` copies give the shared
   `Context.Service` tags and tagged-error classes different identities. The `rc` dist-tag
   still points at a release candidate.
2. Nothing to change in code that imports from `@misofm/streaming`.
