# Changelog

All notable changes to `@misofm/party` (published as `@misofm/partyos` up to 0.8.0), newest first.

## 0.9.0

Renames the package from `@misofm/partyos` to `@misofm/party`, the SDK for the core
party-protocol Move contracts (Party identity, admin cap, group membership). Every exported
name that carried `Partyos`/`PARTYOS` now carries `PartyProtocol`/`PARTY_PROTOCOL`. The
service is `PartyProtocol`, not `Party`, because `Party` is the domain type. Behaviour,
transactions (the golden vectors are byte-identical), BCS codecs and the generated contract
bindings are unchanged. `@misofm/partyos` stays on npm at 0.8.0 and gets no further releases.

This release does not yet track party-protocol's removal of the Party `name` field; the
bindings are still generated from the same Move revision as 0.8.0.

### Changed (breaking)

- **Package name `@misofm/partyos` → `@misofm/party`.** Subpaths keep their shape. The
  generated binding directory is still `contracts/partyos/` (named after the Move package at
  the generated revision), so the raw-binding subpath is
  `@misofm/party/contracts/partyos/party`.
- **Service `Partyos` → `PartyProtocol`**, with the `Context.Service` identifier
  `"@misofm/partyos/Partyos"` → `"@misofm/party/PartyProtocol"`. `PartyosService` →
  `PartyProtocolService`, `PartyosOptions` → `PartyProtocolOptions`. The source file is now
  `src/PartyProtocol.ts`. Span names follow (`Partyos.getPartyById` →
  `PartyProtocol.getPartyById`).
- **Promise registration `partyos()` → `partyProtocol()`.** Its default client property is now
  `client.partyProtocol` (was `client.partyos`); `options.name` still overrides it.
- **Error `PartyosDeploymentError` → `PartyProtocolDeploymentError`.** `_tag`s move from
  `partyos/…` to `party/…`: `party/DeploymentError` and `party/PartyNotFound` (the
  `PartyNotFound` class keeps its name). Update any `Effect.catchTag` call site.
- **Constants and types:** `PARTYOS_DEPLOYMENTS` → `PARTY_PROTOCOL_DEPLOYMENTS`,
  `PARTYOS_TEST_DEPLOYMENT` → `PARTY_PROTOCOL_TEST_DEPLOYMENT`, `PartyosNetwork` →
  `PartyProtocolNetwork`, `PartyosPackageName` → `PartyProtocolPackageName`.
- The `Party` schema identifier moves from `@misofm/partyos/Party` to `@misofm/party/Party`.
- Error-message prefixes read `@misofm/party:` instead of `@misofm/partyos:`.
- Release tags for this package are now `party-v*` (were `partyos-v*`).
- **`PartyProtocol.layerConfig` reads `PARTY_PROTOCOL_PACKAGE_ID`** (was `PARTYOS_PACKAGE_ID`).
  The old name is not read at all. An environment that still sets only `PARTYOS_PACKAGE_ID`
  does not fail: the value is ignored and the layer silently falls back to the bundled
  manifest for the client's network. Set `PARTY_PROTOCOL_PACKAGE_ID` everywhere you set
  the old name.

### Unchanged on purpose

- The deployment-manifest key stays `partyos` (`PartyDeployment`, `{ partyos: "0x…" }`): it is
  the Move package name recorded in the publish manifests.

### Migrating from `@misofm/partyos` 0.8.x

1. Replace the dependency: `@misofm/partyos` → `@misofm/party@0.9.0`, and every import
   specifier `@misofm/partyos…` → `@misofm/party…`.
2. Rename `Partyos` → `PartyProtocol`, `partyos()` → `partyProtocol()`, `client.partyos` →
   `client.partyProtocol`, and the constants, types and error listed above.
3. Change `catchTag("partyos/…")` to `catchTag("party/…")`.
4. Rename the environment variable `PARTYOS_PACKAGE_ID` to `PARTY_PROTOCOL_PACKAGE_ID` in every
   environment, `.env` file and deploy config. Do this before deploying 0.9.0: the old name is
   ignored, and the bundled manifest is used in its place without any error.

## 0.8.0

Moves the package from Effect `4.0.0-rc.112` to stable Effect `4.0.x` (developed and tested on `4.0.4`, peer floor `4.0.3`) and
`@unconfirmed/sui-effect` `0.3.0`, and loosens two peer ranges so one copy of each Sui
library is installed. The public API is unchanged: every export, including the
`createIndividualParty` / `createGroupParty` recipes, `PARTYOS_DEPLOYMENTS`,
`getPartyDeployment` and `partyEventParsers`, keeps its name and signature (the built
`.d.ts` files are identical to 0.7.1), and no contract binding changed.

### Changed (breaking)

- **Peer `effect` is now `>=4.0.3 <4.1`** (was exactly `4.0.0-rc.112`). Release candidates are
  no longer supported; stay on 0.7.x for `effect@4.0.0-rc.112`.
- **Peer `@unconfirmed/sui-effect` is now `>=0.3.0 <0.4.0`** (was `>=0.1.0 <0.3.0`).
- **`@mysten/bcs` moved from `dependencies` to a peer, `^2.1.1`** (as `sui-effect` and
  `@misofm/musicos` have it), so a consumer installs one copy; the use is type-only (the
  generated declarations import `@mysten/bcs` types; runtime codecs come through
  `@mysten/sui/bcs`). Install it next to
  `@mysten/sui` if your package manager does not install peers automatically.
- **Peer `@mysten/sui` is widened from exactly `2.29.0` to `^2.29.0`.** Development stays
  pinned to `2.29.0`.

### Added

- `tests/golden.test.ts` builds both party-creation recipes fully offline (no client, no
  network) for four sponsored vectors (mainnet individual, testnet group, a Unicode name,
  a maximum-length name) and asserts the TransactionData bytes and digests equal
  `tests/fixtures/party.golden.json`, generated by 0.7.1 on the rc.112 stack. The 0.8.0
  recipes are byte-identical to 0.7.1's.

### Internal

- `Partyos.layerConfig` uses `Config.NonEmptyString` (rc.113 renamed the `Config`
  constructors to PascalCase). Behaviour is unchanged: `PARTYOS_PACKAGE_ID` unset or empty
  falls back to the bundled manifest, a set value overrides it.
- README install line and peer list updated.

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
- `ManagedRuntime.dispose` (the Promise face you get from `client.$extend(...)`) now waits
  for managed fibers and their cleanup to finish before it releases layer resources
  (Effect #8528), `Scope.close` finalizers run uninterruptibly (#8512), and disposing from
  one of the runtime's own fibers no longer deadlocks (#8783). In-flight calls were
  interrupted by `dispose` before and still are; what changes is that `dispose()` now
  resolves only after their cleanup has run.
- A `SchemaError` serialised as JSON, inspected or sent through a JSON logger is now a
  compact `{ _tag, message }` object instead of a dump of the schema AST (Effect #8895), so
  such log lines are shorter. `Cause.pretty` is unchanged. This package maps decode
  failures to strings before they escape, so it has no impact here. The error classes' own `message`, `toString`, JSON and
  `Schema` encode/decode output is byte-identical to the previous release (differential
  check over every exported error class against the rc.112 build).

### Migrating from 0.7.x

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
2. Move `@unconfirmed/sui-effect` to `0.3.0` (its own CHANGELOG has the full migration).
3. Add `@mysten/bcs@^2.1.1` to your dependencies if it is not already installed (it was a
   bundled dependency; it is now a peer). Keep one copy.
4. `@mysten/sui` may now be any `^2.29.0` (it had to be exactly `2.29.0`).
5. Update your own rc imports (`effect/unstable/*` is now `effect/*`) and renames
   (Effect's `MIGRATION.md`, "Effect v4 release candidates to 4.0.x"). Review
   `partition`/`separate` destructuring: 4.0.x returns `[successes, failures]`.
