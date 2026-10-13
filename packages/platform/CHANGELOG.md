# Changelog

All notable changes to `@misofm/platform`, newest first.

## 0.46.0

Moves the package from Effect `4.0.0-rc.112` to stable Effect `4.0.3` and
`@unconfirmed/sui-effect` `0.3.0`, on top of `@misofm/musicos` 0.8.0, `@misofm/partyos`
0.8.0 and `@misofm/streaming` 0.4.0. The public API is unchanged: no export was added,
removed or re-typed (the built `.d.ts` files are identical to 0.45.0), and no contract
binding changed.

### Changed (breaking)

- **Peer `effect` is now `>=4.0.3 <4.1`** (was exactly `4.0.0-rc.112`). Release candidates are
  no longer supported; stay on 0.45.x for `effect@4.0.0-rc.112`.
- **Peer `@unconfirmed/sui-effect` is now `>=0.3.0 <0.4.0`** (was `>=0.1.0 <0.3.0`).
- **`@mysten/bcs` moved from `dependencies` to a peer, `^2.1.1`**, so a consumer installs
  one copy shared with `sui-effect`, `@misofm/musicos` and `@misofm/partyos`.
- **Peer `@mysten/sui` is widened from exactly `2.29.0` to `^2.29.0`.** Development stays
  pinned to `2.29.0`.
- Dependencies `@misofm/musicos` and `@misofm/partyos` move to `0.8.0` and
  `@misofm/streaming` to `0.4.0` (all exact, as before).

### Internal

- `Miso.layerConfig` uses `Config.NonEmptyString` (rc.113 renamed the `Config`
  constructors to PascalCase). `MISO_NETWORK` unset or empty still falls back to
  `sui.network`.
- The isolated-consumer fixture no longer includes the deprecated `@misofm/effect` (it
  stays on `effect@4.0.0-rc.112` and cannot share an install with this package); it also
  asserts a single `@mysten/bcs`. `tests/dependency-contract.test.ts` pins the new peer
  ranges.

### Behaviour changes to be aware of (from Effect 4.0.x and sui-effect 0.3.0)

None changes a type, a stored byte or a transaction. Audit of this package: it uses no
`partition`/`separate`, no `Effect.timeout`, no `Effect.retry`, no `Schema.brand`, no
`Encoding`. `Effect.orElseSucceed(() => null)` in `auth.ts` (the response-body fallback)
ignores the error argument that 4.0.x now passes, so it behaves as before.

- `Effect.retry` semantics (Effect 4.0.2): a typed failure accompanied by a defect or an
  interruption in the same `Cause` is no longer retried. This package passes no retry
  schedule of its own; the retry policies it inherits come from `sui-effect` and retry
  only the typed, retryable `TransportError`.
- `TimeoutError` now has a message (`Operation timed out after '<duration>'`; rc.112's was
  empty). It reaches this package's callers only through `sui-effect` (`SuiError.describe`,
  the journal's `lastError`); no text in this package matches on it.
- `ManagedRuntime.dispose` (the Promise face you get from `client.$extend(...)`) now
  interrupts calls still in flight instead of letting them finish: await your calls
  before disposing.
- `Cause.pretty` includes stack frames and `SchemaError` renders as JSON, so logged
  error text is longer. The error classes' own `message`, `toString`, JSON and
  `Schema` encode/decode output is byte-identical to the previous release (differential
  check over every exported error class against the rc.112 build).

### Migrating from 0.45.x

1. Move the whole Effect release train to stable together: `effect@4.0.3` and every
   `@effect/*` package you use at `4.0.3`. A mixed release-candidate and stable install
   fails to resolve `effect/*` module paths, and two `effect` copies give the shared
   `Context.Service` tags and tagged-error classes different identities. Pin `4.0.x`
   explicitly (the `rc` dist-tag still points at a release candidate).
2. Move `@unconfirmed/sui-effect` to `0.3.0` (its own CHANGELOG has the full migration).
3. Add `@mysten/bcs@^2.1.1` to your dependencies if it is not already installed (it was a
   bundled dependency; it is now a peer).
4. `@mysten/sui` may now be any `^2.29.0`.
5. Update your own rc imports (`effect/unstable/*` is now `effect/*`) and renames
   (Effect's `MIGRATION.md`). Review `partition`/`separate` destructuring: 4.0.x returns
   `[successes, failures]`.
6. Install `@misofm/musicos` 0.8.0, `@misofm/partyos` 0.8.0 and `@misofm/streaming` 0.4.0
   only through this package (they resolve transitively); a second copy at another version
   gives two sets of tagged-error classes.
