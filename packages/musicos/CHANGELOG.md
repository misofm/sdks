# Changelog

All notable changes to `@misofm/musicos`, newest first.

## 0.8.0

Moves the package from Effect `4.0.0-rc.112` to stable Effect `4.0.3` and
`@unconfirmed/sui-effect` `0.3.0`. The public API is unchanged: no export was added,
removed or re-typed (the built `.d.ts` files are identical to 0.7.1), and no contract
binding changed.

### Changed (breaking)

- **Peer `effect` is now `>=4.0.3 <4.1`** (was `>=4.0.0-rc.112 <4.1`). Release candidates are
  no longer supported; stay on 0.7.x for `effect@4.0.0-rc.112`.
- **Peer `@unconfirmed/sui-effect` is now `>=0.3.0 <0.4.0`** (was `>=0.1.0 <0.3.0`).
  Dev dependencies move to `effect@4.0.3` and `@unconfirmed/sui-effect@0.3.0`.
- Peers `@mysten/sui` (`^2.28`) and `@mysten/bcs` (`^2.1.1`) are unchanged.

### Internal

- `Musicos.layerConfig` uses `Config.NonEmptyString` (rc.113 renamed the `Config`
  constructors to PascalCase; `Config.nonEmptyString` does not exist on 4.0.x).
  Behaviour is unchanged: `MUSICOS_PACKAGE_ID` unset or empty falls back to the bundled
  manifest, a set value overrides it (checked against rc.112 and 4.0.3 with the same
  `ConfigProvider`).
- Docs: `LLMS.md` and `README.md` name the new peer ranges.

### Behaviour changes to be aware of (from Effect 4.0.x and sui-effect 0.3.0)

None changes a type, a stored byte or a transaction. Audit of this package: it uses no
`partition`/`separate`, no `Effect.timeout`, no `Effect.retry`, no `Schema.brand`, no
`Encoding`; the `Config` rename above is the only source change.

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

### Migrating from 0.7.x

1. Move the whole Effect release train to stable together: `effect@4.0.3` and every
   `@effect/*` package you use at `4.0.3`. A mixed release-candidate and stable install
   fails to resolve `effect/*` module paths, and two `effect` copies give the shared
   `Context.Service` tags and tagged-error classes different identities. Pin `4.0.x`
   explicitly (the `rc` dist-tag still points at a release candidate).
2. Move `@unconfirmed/sui-effect` to `0.3.0` (its own CHANGELOG has the full migration).
3. Nothing to change in code that imports from `@misofm/musicos`; update your own rc
   imports (`effect/unstable/*` is now `effect/*`) and renames (Effect's `MIGRATION.md`,
   "Effect v4 release candidates to 4.0.x").
4. Review `partition`/`separate` destructuring in your own code: Effect 4.0.x returns
   `[successes, failures]` (rc: `[failures, successes]`), which compiles either way when
   both sides have the same type.
