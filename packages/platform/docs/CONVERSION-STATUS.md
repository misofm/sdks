# `@misofm/platform` sui-effect conversion — status

Tracks misofm/sdks#35 ("Convert `@misofm/platform` to a sui-effect
extension") across its three planned runs on `sui-effect/platform`. This
file is updated at the end of each stage; do not delete history from it —
append.

## Stage 1 (this run): WP1 foundation/errors, WP2 reads and catalog

### What stage 1 built

- **Vendored dependency setup.** `vendor/sui-effect-0.1.0.tgz` at the repo
  root (consolidated from the two identical copies under
  `packages/{partyos,musicos}/vendor/`); `partyos`, `musicos` and `platform`
  all point `sui-effect` at `file:../../vendor/sui-effect-0.1.0.tgz` in
  `devDependencies` with a `sui-effect": "^0.1.0"` optional peer. The
  isolated-consumer fixture's `sui-effect` dependency path is updated to
  match.
- **`src/errors.ts` rewritten** on sui-effect's taxonomy
  (`DecodeError`/`TransportError`/`ObjectNotFound`/`ObjectDeleted`/
  `ObjectUnavailable`/`GraphQLUnavailable`/`ExecutionFailed` re-exported from
  `sui-effect` instead of `@misofm/effect/errors`). Every platform-owned
  `Schema.TaggedError` now declares `outcome`. Tags are unchanged so existing
  `catchTag` call sites keep matching.
  - `MisoClientNotReadyError` is **kept** (not deleted, as the issue's target
    shape says) because `client.ts` — untouched this stage — still imports
    it. Deleting it now would regress the platform typecheck error count for
    no reason; it is slated for deletion in stage 3 alongside `client.ts`'s
    ready-state machine.
  - No `MisoGraphQLUnavailable` was added. The scoping brief's amendment
    ("GraphQL", 2026-09-11 evening) supersedes the issue body's original
    "platform-owned `SuiGraphQL` service" design: sui-effect now ships a bare
    `SuiGraphQL` tag that `@misofm/musicos` already reads through directly,
    and platform does the same — `sui-effect`'s own `GraphQLUnavailable` is
    reused everywhere a GraphQL read can fail, exactly like
    `@misofm/musicos/queries.ts` and `@misofm/partyos` do.
- **`src/deployments.ts`**: `validateMisoPlatformDeployment` now fails
  `MisoPlatformDeploymentInvalidError` instead of `@misofm/effect`'s
  `DeploymentError`; no other change.
- **`src/Miso.ts` (new): the `Miso` service SKELETON.**
  `"@misofm/platform/Miso"`, `layer(deployment)` / `layerConfig` (reads
  `MISO_NETWORK`) / `layerTest(state?)`. `layer` performs the exact-chain
  (network + `chainIdentifier`) check the predecessor
  `MisoPlatformClient#ready()` used to perform at first use, via `Sui`, and
  composes `Musicos.layer`/`Partyos.layer` internally (`Layer.provide`d
  inside `Miso`'s own layer) so the requirement channel stays `Sui`, never
  `Sui | Musicos | Partyos` — sui-effect's "converting an existing facade"
  idiom. `party` is bound to the raw `Partyos` service (not yet the richer
  `MisoPartyService` WP3 builds); `protocol` is the full `Musicos` service.
  9 tests in `tests/Miso.test.ts` cover the chain-id/network check both ways,
  `layerConfig`'s `MISO_NETWORK` override, and `layerTest` building the real
  `protocol`/`party` services with no chain check and no network. Exported
  from the package root (`Miso`, `MisoService`, `MisoLayerError`).
  - **This is explicitly not the full `MisoService` the issue specifies.**
    No `getPressing`/`getListing`/`getRecord`/`getSale`, `ids.*`, `tx.*`,
    `call`/`bcs`, `vault`, `createShareCurrency`, `publishCatalog`, `read.*`,
    or `events` member exists yet — see "What stage 2/3 still owe" below.
  - No member of the skeleton reads `SuiGraphQL`, so `Miso.layer`'s
    requirement is `Sui` only, not `Sui | SuiGraphQL` as the issue's
    prose for the *finished* service states. This becomes accurate once the
    `read`/catalog surface joins the service in a later stage.
- **WP2: every read in `src/read/*` and `src/catalog.ts` rewritten on
  `Sui`/`SuiGraphQL`**, plus the parts of `src/pressing.ts`, `src/cover.ts`,
  `src/credits.ts`, `src/release-extensions.ts`, `src/recording-extensions.ts`
  and `src/party/queries.ts` those depend on (their **reads only** — every
  write/tx-builder section in those five files is untouched, still on the
  old `@misofm/effect` surface where it was, and still typechecks because
  `@misofm/effect` itself did not change). Converted:
  - `src/read/genres.ts`, `src/read/artist.ts`, `src/read/works.ts`,
    `src/read/royalties.ts`, `src/read/receipts.ts`, `src/read/wallet.ts`,
    `src/read/catalog.ts`, `src/read/client.ts` (all of `src/read/*` except
    the already-pure `internal/scalars.ts`, `internal/walrus.ts`, `types.ts`,
    `config.ts`, `index.ts`, which needed no conversion).
  - `src/catalog.ts` (the composed track-credits / administered-recordings
    reads).
  - `src/party/queries.ts` (profile/media/roles/tags/genres/ctas/links —
    now `sui.getDynamicFieldOption`/`sui.streamDynamicFields` directly on
    field VALUE bytes, no `Field<K,V>` wrapper struct decode needed).
  - The **reads sections** of `src/pressing.ts` (`getPressing`/`getListing`/
    `getRecord`/`getSale`), `src/cover.ts` (`getReleaseCover`/
    `getReleaseCoversByIds`), `src/credits.ts` (`fetchCreditFields` and the
    three `get*Credits`/`get*CreditsByIds` pairs), `src/release-extensions.ts`
    (`getReleaseKind`), `src/recording-extensions.ts` (`readSoftFields` and
    the three engine-session/master-reference/streaming-transcode read
    families) — these five files' tx builders are untouched.
  - Standalone functions kept their exact names and now require
    `Sui`/`Sui | SuiGraphQL` (never a service) — this was already true
    before for most of them, since they took explicit package ids; the only
    structural change is composing the converted `Musicos`/`Partyos`
    services internally (a small file-local `withMusicos`/`withPartyos`
    helper, duplicated per file rather than centralized — a reasonable stage
    1 shortcut worth collapsing into one shared internal module once the
    dust settles, see "Deviations" below) instead of calling free functions
    that no longer exist on those packages' new service-shaped surfaces.
  - `getSale` (`src/pressing.ts`) is the issue's own WP2 acceptance example:
    a batch with one genuinely `ObjectUnavailable` id now fails typed,
    where the predecessor's `getObjectsContent` silently folded every kind
    of per-item failure into "missing" — `ObjectNotFound`/`ObjectDeleted`
    still mean a legitimate `null` half of a sale.
  - `resolveGenreNames` (`src/read/genres.ts`) is the issue's soft-read
    example: `sui.getObjects`' per-item `Result` replaces the hand-rolled
    try/catch-around-a-`Map`, dropping an unreadable genre rather than
    failing the page.
  - `getBalance` (`src/read/wallet.ts`): the predecessor's module-level
    `WeakMap`-keyed decimals cache is **dropped, not replaced** — see
    "Deviations" below.
- **Tests.** `tests/batching.test.ts` **deleted** (WP2's own acceptance
  criterion: chunking is sui-effect's concern now, this package's tests no
  longer assert request counts). Six test files that exercised converted
  code against a hand-rolled `ClientWithCoreApi` stub were rewritten onto
  `sui-effect/testing`'s `layerTest`/`SuiCoreFake`/`SuiTest` fixtures, per
  WP2's acceptance criterion ("replace every hand-rolled client stub in
  tests with `SuiTest` fixtures"): `tests/pressing-read.test.ts`,
  `tests/recording-extensions.test.ts`, `tests/read/works.test.ts`,
  `tests/read/wallet.test.ts`, `tests/read/vaulted-wallet.test.ts`,
  `tests/read/catalog-resources.test.ts`, `tests/read/release-kind.test.ts`,
  `tests/read/receipts.test.ts` (2 of its 9 tests). `tests/Miso.test.ts` is
  new (9 tests, the `Miso` skeleton). No test opens a socket.

### `@misofm/effect` — kept as a dependency, deliberately

The issue's Goal and DoD say `@misofm/effect` is "gone from dependencies".
**Stage 1 does not do this** — `package.json` is unchanged. Seven files still
import it: `src/client.ts`, `src/execute.ts`, `src/genre.ts`,
`src/party/client.ts`, `src/royalty.ts`, `src/share.ts`, `src/vault.ts` — all
stage 2/3 scope (the facade class, the deleted-in-target `execute.ts`, and
three files — `genre.ts`, `royalty.ts`, `vault.ts` — whose reads the original
issue's WP2 also named but this run's narrower scope deferred to stage 2's
"vault and credits", since they currently typecheck fine and touching them
was not necessary to convert `read/*`/`catalog.ts`). Removing the dependency
now, before any of those seven files converts, would not delete a single
import — it would turn every one of them from "compiles" into "cannot find
module '@misofm/effect'", which fails the stage 1 gate ("platform typecheck
error count strictly decreases") outright: `@misofm/effect` package itself
is unmodified by any sibling conversion, so these seven files' *current*
zero-error status depends entirely on the dependency staying resolvable.
Removal is now a stage 2/3 checklist item, done incrementally as each file
converts, with the literal `package.json` edit as the last step once none
of the seven import it any more (mirrors how `partyos`/`musicos` retired it
in their own single-shot conversions, which had no equivalent "the
dependent file hasn't converted yet" phase to navigate).

### Platform typecheck error count

**Before (baseline, start of this run): 63 errors**, all already present
because `@misofm/musicos` and `@misofm/partyos` had already converted on
this branch before stage 1 began (this is the exact inventory
`sdks-sui-effect-partyos`'s breakage report predicted, plus musicos's own
fallout). Full baseline list is reproducible with the command below; it is
not reproduced here since every one of those errors is either fixed or
re-counted in the "after" list.

**After (end of this run): 46 errors**, all in five files, none touched
this stage:

| File | Errors | Root cause | Stage that fixes it |
|---|---:|---|---|
| `src/party/client.ts` | 15 | `PartyPlatformClient` (1 missing `PartyosClient` import) plus 14 cascading from `src/party/queries.ts`'s new `Sui`/`DecodeError`-shaped reads vs. this file's still-`@misofm/effect`-shaped hand-annotated return types (`getProfile`/`getMedia`/`getRoles`/`getTags`/`getCtas`/`getLinks`) | **Stage 2, WP3** "party and protocol composition" — `PartyPlatformClient` is superseded by `MisoPartyService` |
| `src/client.ts` | 10 | `MisoPlatformClient` facade: 2 from the deleted `@misofm/musicos/client` subpath and `PartyosClient`; 8 cascading from `src/pressing.ts`'s new `Sui`/`DecodeError`-shaped `getPressing`/`getListing`/`getRecord`/`getSale` vs. this file's hand-annotated `@misofm/effect`-shaped return types | **Stage 3, WP6** "facade derivation" — this whole class is deleted and replaced by `Miso` + `SuiExtension.fromService` |
| `src/share.ts` | 11 | `@misofm/musicos`'s deleted free-function execution helpers (`execThunks`/`publishedPackageId`/`allPublishedPackageIds`/`createdByType`/`allCreatedByType`/`ExecResult`) plus `PlatformExecResult` (from `execute.ts`, itself broken) losing `.gasUsed`/being untyped | **Stage 2, WP4/WP5** — `createShareCurrency`/`publishShareCurrencies`/`initializeShareCurrencies` move to `Tx.run` |
| `src/execute.ts` | 5 | `@misofm/musicos`'s deleted `buildTx`/`toExecResult`/`FULL_INCLUDE`/`ExecResult`/`./execute` subpath | **Stage 2, WP4** — the issue's target shape deletes `execute.ts` outright (`Tx.run` replaces it) |
| `src/publication.ts` | 5 | `execute.ts`'s broken exports (`allCreatedByType`/`createdByExactType`) plus `PlatformExecResult` losing `.digest`/`.gasUsed` | **Stage 2, WP4** "publication and pressing writes as fragments" — `parseAtomicPublicationResult` moves to `(p, Executed)` |

Reproduce: `bun run --filter '@misofm/platform' typecheck 2>&1 | grep -c
"error TS"` at the worktree root (needs `bun install` run once, per the
vendored-tarball setup above).

### Gate results

- `bun run typecheck && bun run test` for `@misofm/partyos` and
  `@misofm/musicos`: **green**, unaffected by this stage (36 + 96 tests
  pass).
- Platform typecheck error count: **63 → 46**, strictly decreased; every
  remaining error is listed above with its stage.
- Platform tests: **304 pass, 0 fail** among every test that touches
  converted code, zero network (`sui-effect/testing`'s in-memory `SuiCore`
  fake only). The only 2 remaining failures (`tests/client.test.ts`,
  `tests/publication.test.ts`) are **pre-existing module-resolution
  breakage** from the musicos conversion (`@misofm/musicos/client` and
  `@misofm/musicos/execute`, both deleted subpaths) in files this stage
  does not touch (`client.ts`, `execute.ts`/`publication.ts` — stage 2/3);
  they failed the same way before this stage started.
- `git diff --stat -- packages/*/src/contracts`: **empty**.
- `docs/CONVERSION-STATUS.md` (this file) committed last.

### Deviations from the issue, with reasons

1. **`@misofm/effect` not yet removed from `package.json`.** See the
   dedicated section above — removing it now would regress the typecheck
   error count for seven files this run's narrower scope does not touch.
2. **No platform-owned `SuiGraphQL` service.** Superseded by the scoping
   brief's amendment; platform reads through sui-effect's own bare
   `SuiGraphQL` tag directly, matching `@misofm/musicos`.
3. **`MisoClientNotReadyError` kept, not deleted.** `client.ts` (stage 2/3)
   still imports it; deleting it now is a pure regression with no
   corresponding fix available this stage.
4. **`Miso` service is a skeleton, not the full `MisoService`.** WP1's own
   text asks for "the `Miso` service skeleton" specifically — this run
   built `deployment`/`network`/`chainId`, the exact-chain check, and
   `protocol`/`party` bound to `Musicos`/`Partyos`, and stopped there.
   Everything else the issue's `MisoService` interface names is stage 2/3.
5. **`getBalance`'s decimals cache dropped, not reimplemented.** The
   predecessor cached `getCoinMetadata` per `(transport client, coin type)`
   in a module-level `WeakMap`. `getBalance` is a standalone function with
   no layer to hold an `Effect.cachedWithTTL`-backed cache in — the issue's
   own suggested replacement design names a *layer*, which only exists once
   this becomes a `Miso.read.getBalance` service member. Every call now
   hits `sui.core.getCoinMetadata` fresh; correctness is unaffected, only
   request volume. Flagged for revisit once the `read` surface joins `Miso`.
6. **`withMusicos`/`withPartyos` helpers duplicated per file** (`catalog.ts`,
   `read/works.ts`, `read/artist.ts`, `read/catalog.ts`, `read/receipts.ts`,
   `read/wallet.ts`) rather than centralized in a shared internal module.
   Each is ~6 lines implementing sui-effect's "converting an existing
   facade" idiom at function granularity. Worth collapsing once it is clear
   whether stage 2/3's `Miso` service subsumes these call sites entirely
   (in which case the duplication is moot) or the standalone functions
   remain permanent (in which case centralize).
7. **`read/client.ts`'s `MisoClient` sheds `.protocol`/`.party`.** The
   predecessor's `.sui` was `$extend`-registered with `miso()`
   (`sui.miso.*`) and carried a `PartyPlatformClient`; neither exists yet.
   `MisoClient` now exposes `.layer: Layer<Sui | SuiGraphQL>` for providing
   directly to this package's standalone `read/*` functions instead — a
   narrower but honest surface, not a silent stub. TODO comments in the
   module point at WP3/WP6 for the restoration.
8. **`pressing.ts`/`cover.ts`/`credits.ts`/`release-extensions.ts`/
   `recording-extensions.ts` partially converted** (reads only, not the
   whole file). Necessary because `read/catalog.ts` cannot compile without
   them; the issue's own WP2 list names all five files' reads, so this is
   arguably in-scope rather than a deviation, but is called out because the
   task framing for this stage said "src/read/* and src/catalog.ts".

## What stage 2 (WP3 party/protocol composition, WP4 publication and
pressing writes as fragments, WP5 vault and credits) still owes

- `MisoPartyService` built over `Partyos` (delegations) plus the platform's
  own party EXTENSION reads (now living in `src/party/queries.ts`, already
  converted — WP3 mainly needs the `tx`/`call`/`bcs` binding and the
  `MisoService.party` member upgrade from raw `Partyos` to this richer
  type) and 25 `tx` fragment bindings; `party/client.ts`'s
  `PartyPlatformClient` deleted.
- `Miso.layerNoDeps` and `Miso.layer(deployment)` providing both
  `Musicos`/`Partyos` **and** the richer party service (today's skeleton
  already provides `Musicos`/`Partyos` — this is the upgrade, not new
  wiring).
- `transactions.ts`, `release-graph.ts`, `publication.ts`, `pressing.ts`
  (its builders — the reads are already done) typed `Recipe`;
  `parseAtomicPublicationResult(p, Executed)`; `publishCatalog` via
  `Tx.run`; `share.ts` on `Tx.run` (single and batched); delete
  `execute.ts` and its `./execute` subpath.
- `vault` namespace object (bound builders plus `getVaultAdminCap`,
  `resolveReceivingCoins`), `credits.ts` builders bound, `genre.ts` and
  `royalty.ts` converted (their reads currently still use
  `@misofm/effect`, deferred here since they typecheck fine as-is and
  weren't on `read/catalog.ts`'s dependency path); `OperationsUnavailableError`
  from every vault member when unavailable.
- Once WP3–WP5 land, revisit `@misofm/effect` removal from `package.json`
  (see "Deviations" #1) — it should be possible once `client.ts`,
  `execute.ts`, `genre.ts`, `royalty.ts`, `share.ts`, `vault.ts`,
  `party/client.ts` no longer import it (the last of those,
  `party/client.ts`, is deleted outright in WP3).

## What stage 3 (WP6 facade derivation and README, WP7 consumer smoke)
still owes

- `MisoService` fully assembled on `Miso` (today's skeleton plus
  `getPressing`/`getListing`/`getRecord`/`getSale`, `ids.*`, `tx.*`,
  `call`/`bcs`, `vault`, `createShareCurrency`, `publishCatalog`,
  `read.*` namespace, `events`) — this is where `Miso.layer`'s requirement
  channel finally needs `SuiGraphQL` too, once `read.*` joins the service.
- `miso()` registration via `SuiExtension.fromService`, with the deprecated
  `ready: Effect.void` warm-up member the migration map calls for.
- `read/client.ts`'s `MisoClient.layer` widened to
  `Miso | Sui | SuiCore | SuiGraphQL` (needs a complete
  `MisoPlatformDeployment`, not just the package-id subset `MisoConfig`
  carries today).
- Delete `client.ts`'s `MisoPlatformClient` class, `misoPlatform()`,
  `party/client.ts`; delete `MisoClientNotReadyError` (kept through stage 1
  and 2 for source compatibility — see "Deviations" #3).
- README rewrite (Usage on the service and the face, error table, layer
  table, 0.28 migration section); `package.json` version bump to `0.28.0`
  and `@misofm/effect` finally removed from `dependencies`.
- Isolated-consumer fixture (`tests/fixtures/isolated-consumer/`)
  updated: `imports.ts`/`verify.mjs` still reference `PartyosClient`,
  `MisoPlatformClient`, `PartyPlatformClient` and other names deleted by
  the partyos/musicos/platform conversions — this fixture was **not**
  touched by any of the three conversions' stage-1 work (only its
  `sui-effect` dependency path, per the shared setup step) and is already
  failing `bun run test:consumer` for reasons unrelated to this stage;
  WP6/WP7 is where it gets its full rewrite.
- `misofm/app`/`misofm/cli` consumer-edit list (WP7).
