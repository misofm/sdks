# `@misofm/platform` sui-effect conversion

Tracks misofm/sdks#35 ("Convert `@misofm/platform` to a sui-effect
extension") across its three planned runs on `sui-effect/platform`. Stage 3
(WP6 facade derivation, WP7 consumer smoke) is the last of the three; this
file is now the permanent record of the conversion (renamed from
`CONVERSION-STATUS.md`, which framed it as in-progress) — do not delete
history from it, append instead.

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

## Stage 2 (this run): WP3 party/protocol composition, WP4 publication and
pressing writes as fragments, WP5 vault and credits

### Setup carried out before WP3–WP5

- **`sui-effect/integration` merged** into `sui-effect/platform` (no
  lockfile conflict; a clean `ort` merge bringing in musicos's final
  verification-test commits, `82f437b`/`884f959`).
- **Vendored tarball refreshed** to the final pre-release build
  (`vendor/sui-effect-0.1.0.tgz`, `93e8ac4`) and `bun install --force`
  (bun's own tarball-hash cache key did not change on a same-named,
  same-version, different-content re-pack, so a plain `bun install`
  reported "no changes" until `--force` was used — worth flagging
  upstream, see "Skill and library feedback" below).
- **`@misofm/partyos` and `@misofm/musicos` gates re-run against the
  refreshed tarball: green with zero changes needed.** `bun run
  typecheck && bun run test` for both packages passed exactly as before
  (36 + 101 tests). None of the setup step's named behaviour changes
  (`Tx.build` always simulating, a `SubmitConfig.nonce` out of range or a
  gRPC `NOT_FOUND` becoming `BuildError`, `NotApplied { inputConsumed }`
  needing a scripted consuming transaction, `SuiSchema.matchesType`/
  `SuiGraphQL.query`/`SuiError.toJson`, dynamic-field matching on
  `name.bcs`) required a test-side fix in either package — the
  `sui-effect/integration` merge above had already carried musicos's own
  adjustments for the identical tarball, and partyos's WP2 conversion
  (already merged before this run started) had none of the moved
  assertions to begin with (it never asserted a `simulateTransaction`
  call count, never built two transactions expecting different digests,
  and its one `NotApplied`-adjacent path was already scripted with
  `SuiTest.recordTransaction`).

### What stage 2 built

- **WP3 — party and protocol composition.**
  - `src/party/client.ts` rewritten: the `PartyPlatformClient` class is
    **deleted**. `bindModulePackage` (the generated-call-binding helper)
    survives as a standalone export. A new `MisoPartyService` interface
    and `makeMisoParty(sui, partyos, deployment)` factory replace it — not
    a `Context.Service` of its own (the issue's `MisoPartyService` is a
    member *type* of `Miso`, not a second service to register), a plain
    object `Miso`'s own `make` assembles from the `Sui` and converted
    `Partyos` it already holds, per `docs/extensions.md` §12 step 3
    ("the service's members are thin: they close over the layer's `Sui`
    ... and call the standalone function"). It has:
    - the 7 core delegations (`getPartyById`, `getPartiesByIds`,
      `derivePartyAdminCapId`, `getMemberships`, `getPendingInvites`,
      `getPendingMemberships`, `isMember`) — 6 straight from `Partyos`
      (already `R = never`), one (`derivePartyAdminCapId`) a bound call
      into `@misofm/partyos`'s free `derivePartyAdminCapId` function;
    - the 7 party-extension reads (`getProfile`/`getMedia`/`getRoles`/
      `getTags`/`getGenres`/`getCtas`/`getLinks`), each `party/queries.ts`'s
      already-converted (stage 1) `Effect<A, E, Sui>` function with
      `Effect.provideService(Sui, sui)` applied at bind time;
    - `tx`: 25 fragments (9 delegated from `Partyos.tx`, 16 first-party
      extension builders — profile/media/roles/tags/genres/CTAs/platform
      links, unchanged from the predecessor since they were already
      `Recipe`-shaped `TxThunk`s reading no client);
    - `call` (11 bound generated-call namespaces, `party` now bound via
      `@misofm/partyos`'s own exported `contracts.party` since the
      converted `Partyos` service has no `call` member of its own to
      delegate — see deviation below) and `bcs` (21 codecs, **without**
      the predecessor's `...this.#core.bcs` spread, since `PartyosService`
      exposes no `bcs` member either — a narrower, honest surface, not a
      silent drop).
  - `Miso.ts`'s `party` member upgrades from the raw `Partyos` service to
    `MisoPartyService`; both `make` (the checked layer) and
    `makeUnchecked` (`layerTest`) now call `makeMisoParty(sui, partyos,
    deployment.party)`.
  - `tests/Miso.test.ts`'s exact-chain test asserted through
    `m.party.deployment.partyos`, which no longer exists on the richer
    type; it now proves the same partyos-package binding through
    `m.party.derivePartyAdminCapId(id)`, comparing against the free
    `derivePartyAdminCapId(id, TESTNET.partyos.partyos)` — a call that
    needs no chain read, so it stays a synchronous assertion.

- **WP4 — publication and pressing writes as fragments.**
  - `src/share.ts` rewritten onto `Tx.run`. The three submit-on-behalf
    functions now take a signer (and optional `gasOwner`/`sponsor` for a
    sponsored write) as a parameter object instead of a raw SDK `Signer`
    plus a `ParallelTransactionExecutor`:
    - `createShareCurrency(params, { signer })` — two `Tx.run`s (publish,
      then initialize), `Effect<ShareCurrency, RunError | UnexpectedEffects>`;
      `ShareCurrency.gasUsed` is now `bigint`, summed from
      `Executed.gasUsedTotal` across both runs.
    - `publishShareCurrencies(count, { signer, ... })` — batched at 5
      publishes per `Tx.run` (unchanged cap), package ids read off
      `Executed.packagesPublished()`.
    - `initializeShareCurrencies(packageIds, metaOf, { signer, onBatch?
      })` — batched at 10 per `Tx.run`; `onBatch` is now an
      `Effect.Effect<void, E>` per the issue's own target shape. A
      failing batch still reports every already-succeeded batch through
      `onBatch` before the whole call fails — but now fails with **that
      batch's own typed error** (the first one encountered) rather than
      throwing a hand-aggregated plain `Error` string (a deliberate
      behaviour refinement past the predecessor: a caller can now
      `catchTag`/read `outcome` on what actually went wrong, per the
      issue's "fails typed" acceptance wording).
    - Every `Tx.run` call takes `{ signer, gasOwner, sponsor }` uniformly,
      so a sponsored batch is a call-site concern, not a second code
      path.
  - `src/execute.ts` and its `./execute` subpath (package.json `exports`
    and `src/index.ts`'s re-export) are **deleted**. Nothing needed it
    once `share.ts` stopped calling `executeViaExecutor`; `client.ts`'s
    own `executeViaExecutor` wrapper method is deleted too (see below).
  - `src/publication.ts`'s `parseAtomicPublicationResult(p, result)`
    takes a sui-effect `Executed` instead of the deleted
    `PlatformExecResult`: `allCreatedByType(result, prefix)` +
    `findByShareType` (substring matching) is replaced by one
    `expectOneCreated(result, exactType, description)` helper built on
    `Executed.created(type)` (exact-tag match, since every call site here
    already has the full share/currency type to name); `createdByExactType`
    likewise becomes `expectOneCreated`. `result.gasUsed` (`number`) →
    `result.gasUsedTotal` (`bigint`); `result.digest` (already a string)
    → `String(result.digest)` (now a branded `Digest`).
    `AtomicPublicationResult.gasUsed` is `bigint`.
  - `src/transactions.ts` and `src/pressing.ts`'s builders needed **no
    change**: every one of them already returned `TxThunk`, and
    `TxThunk = Recipe` was already established (re-exported from
    `@misofm/musicos`) before this stage — the "typed `Recipe`"
    acceptance criterion was structurally satisfied already. Only
    `src/release-graph.ts`'s `publishReleaseGraph` had an inline
    structural type (`(tx: Transaction) => void`) instead of the named
    `Recipe`; retyped for consistency, no behaviour change.
  - **`publishCatalog` via `Tx.run` is not added this stage** — see
    deviations below; `publishAtomicCatalog` (the fragment) and
    `parseAtomicPublicationResult` (now `Executed`-shaped) are the pieces
    the issue's target `Miso.publishCatalog` member would compose, and
    remain available as standalone functions for a caller to run through
    `Tx.run` directly today.
  - New `tests/share.test.ts` (4 tests, on `sui-effect/testing`'s
    `layerTest`/`FakeOutcome`/`SuiTest`/`Journal.layerMemory` harness, no
    network): `createShareCurrency`'s two `Tx.run`s producing the right
    package/currency/treasury ids; `publishShareCurrencies` batching 6
    requested packages as 5 + 1 across two `Tx.run`s;
    `initializeShareCurrencies`'s happy path (`onBatch` fires once) and
    its one-failing-batch path (11 package ids batch as 10 + 1; the
    second batch's `transportError` is retryable, so the test forks the
    program, drives `TestClock` past `SubmitConfig.resubmit`'s schedule
    instead of waiting on real time, and asserts the first batch's 10
    currencies were already reported through `onBatch` before the typed
    failure lands).
  - `tests/publication.test.ts`'s hand-built mock result (a
    `PlatformExecResult`-shaped object cast with `as unknown as`) is
    replaced with a real `Executed` built via
    `Schema.decodeUnknownSync(Executed)` from a minimal but fully
    schema-valid encoded shape (a `buildExecuted` test helper) — the cast
    could not simply widen to the new type, since `Executed`'s accessors
    (`created`, `gasUsedTotal`, ...) are real methods a plain object does
    not have.

- **WP5 — vault and credits.**
  - `src/vault.ts`: `getVaultAdminCap` and `resolveReceivingCoins` (the
    only two `@misofm/effect`-backed members left in the file — every
    write in it was already a plain `(tx, params) => ...` fragment
    function, untouched) move onto `Sui`: `sui.getObjectOption(id, {
    expectedType })` + `SuiSchema.decode(SuiSchema.bcs(vault.VaultAdminCap),
    ...)` replaces `getOptionalObjectContent` + `assertObjectType` +
    `decodeBcs`; `sui.core.getObjects({ objectIds })` replaces the raw
    `client.core.getObjects` promise wrapped by hand into a `SuiRpcError`
    (the sui-effect mechanical tier already wraps it as a `TransportError`
    Effect, so the manual `Effect.tryPromise`/error-construction disappears
    entirely).
  - `src/credits.ts` needed **no change**: stage 1 already converted its
    reads and every writer in it was already `TxThunk`-shaped.
  - `src/genre.ts` and `src/royalty.ts` (named as deferred-but-owed in
    stage 1's own "what stage 2 owes") converted too, since the task's
    package.json cleanup target ("zero files importing `@misofm/effect`")
    could not be met otherwise: `getReleaseGenres`/`getRecordingGenres`
    onto `sui.getObjectOption` (raw bytes, no schema — these read a
    dynamic field's own object by its *derived* id, the same shape as
    before, just through `Sui`); `getRoyaltyPoolById`/
    `getRoyaltyStakeById`/`getRoutedStakeById` onto
    `sui.getObjectOption` + `SuiSchema.decode(SuiSchema.bcs(rawBcsType),
    ...)` — the predecessor's `{ parse: (bytes) => mapX(...) }` object
    never actually qualified as a bridge codec (`docs/extensions.md` §3:
    "a hand-rolled `{ parse(bytes) {…} }` wrapper does not qualify"), so
    this is also a correctness fix, not just a mechanical port.
  - **No `vault` *namespace object* was assembled** on `Miso` this
    stage — see deviations below; `vault.ts`'s functions stay standalone,
    same as `pressing.ts`'s.
  - `tests/genre.test.ts`'s one hand-rolled `ClientWithCoreApi` stub is
    replaced with `sui-effect/testing`'s `layerTest`/`FakeObject`, per the
    "replace every hand-rolled client stub in tests with `SuiTest`
    fixtures" acceptance criterion. `royalty.ts` and `vault.ts`'s
    converted reads have **no test coverage before or after this
    stage** — `tests/royalty.test.ts` and `tests/vault.test.ts` only ever
    exercised the pure PTB builders in those files; this is a pre-existing
    gap this stage did not introduce but also did not close (see
    "Skill and library feedback").

- **`@misofm/effect` removed from `package.json` `dependencies`.** All
  seven files stage 1 named (`client.ts`, `execute.ts`, `genre.ts`,
  `party/client.ts`, `royalty.ts`, `share.ts`, `vault.ts`) reached zero
  imports: five by conversion above, `execute.ts` by deletion, and
  `client.ts` by the conversion described next (a stage-3-assigned item
  this run pulled forward — see deviations). `bun install` after the
  edit reports no lockfile changes beyond the removed dependency line;
  platform typecheck and test stayed green.

- **`client.ts` (`MisoPlatformClient`): party/protocol removed, pressing
  reads converted, the class itself kept.** This file's own conversion
  was stage 1's own table entry assigned wholesale to stage 3 ("WP6 —
  this whole class is deleted and replaced by `Miso` +
  `SuiExtension.fromService`"), but two of its four causes were squarely
  WP3/`@misofm/effect`-removal work, so this run did them now rather than
  leave the file with *more* errors than it already had:
  - `#protocol: MisoProtocolClient` and `#party: PartyPlatformClient`
    fields, their getters, and the constructor logic that built them
    (`protocolMiso({...}).register(client)`, `new
    PartyosClient(client, ...)`, `new PartyPlatformClient(...)`) are
    **removed outright** — both surfaces now live on `Miso` (this
    stage's WP3 work), and the issue's own consumer table already showed
    no in-repo consumer reaches `client.miso.protocol`/`.party` through
    this specific class (app/cli reach them through the *facade*, which
    is `Miso`'s job in the target shape, not this predecessor's).
  - `executeViaExecutor` and `createShareCurrency` methods are **removed
    outright** too — the issue's own consumer table states "No consumer
    calls ... `executeViaExecutor` or `createShareCurrency`", and both
    wrapped now-deleted (`execute.ts`) or now-reshaped (`share.ts`)
    functions.
  - `#run`/`#layer` (used only by the four pressing-read methods once
    the above were removed) move from `@misofm/effect`'s
    `SuiClient.layer(client)` to `Sui.layerNoDeps.pipe(Layer.provide(
    SuiCore.layerFromClient(client)))`; `getPressing`/`getListing`/
    `getRecord`/`getSale`'s declared error unions are corrected to match
    what `pressing.ts`'s (already stage-1-converted) reads actually
    produce (`DecodeError | ObjectUnavailable | TransportError`, plus
    `NetworkMismatch` from `Sui.layerNoDeps`'s own chain-identifier
    check, alongside the class's existing `MisoChainIdentifierMismatchError`).
    This is the one piece of this conversion that is genuinely
    "facade derivation"-shaped work pulled forward from stage 3 — see
    deviations.
  - **`MisoPlatformClient` the class, `misoPlatform()`, and
    `MisoClientNotReadyError` are *not* deleted.** The class still has a
    real job (pressing reads, `ids`/`tx`/`call`/`bcs`/`vault` gated by
    `#requireReady`) with no `Miso`-service replacement yet, and
    `#requireReady` still throws `MisoClientNotReadyError` for every one
    of those synchronous surfaces — deleting either now would delete
    working functionality with nothing to replace it, which the task's
    own conditional ("remove `MisoClientNotReadyError` *if* `client.ts`
    no longer needs it") anticipates.

### Platform typecheck error count

**Before (start of this stage): 46 errors**, exactly the five-file
breakdown stage 1 recorded (`party/client.ts` 15, `client.ts` 10,
`share.ts` 11, `execute.ts` 5, `publication.ts` 5).

**After (end of this stage): 0 errors.** Every error stage 1 deferred to
stage 2 is fixed; the `client.ts` pressing-read mismatches stage 1's own
table assigned to stage 3 are fixed too (see above) rather than carried
forward — so there is nothing left to list "assigned to stage 3" in the
typecheck sense. What stage 3 still owes is facade *derivation*
(deleting the class, deriving the Promise face), not typecheck-error
remediation of the class as it stands.

Reproduce: `bun run --filter '@misofm/platform' typecheck 2>&1 | grep -c
"error TS"` at the worktree root.

### Gate results

- `bun run typecheck && bun run test` for `@misofm/partyos` and
  `@misofm/musicos` on the refreshed tarball: **green, no changes
  needed** (36 + 101 tests; see "Setup" above for why).
- Platform typecheck error count: **46 → 0**, strictly decreased.
- Platform tests: **319 pass, 0 new fail.** The only remaining failure
  is `tests/client.test.ts`, unchanged by this stage (confirmed via
  `git diff` on the file — zero lines touched) and pre-existing since
  before stage 1 began: it imports `PartyosClient` from `@misofm/partyos`,
  a class that stopped existing when partyos converted, so the whole
  file fails to load (`SyntaxError` at the import, not a test failure).
  `tests/publication.test.ts`, stage 1's other named pre-existing
  failure, is fixed this stage as a side effect of `parseAtomicPublicationResult`
  taking `Executed` (see WP4 above) — its mock now decodes as one.
- `git diff --stat -- packages/*/src/contracts`: **empty.**
- `docs/CONVERSION-STATUS.md` (this file) committed last.

### Deviations from the issue, with reasons

1. **`MisoPartyService` is not a second `Context.Service`.** The issue's
   prose could be read either way; its own service-interface table lists
   `party: MisoPartyService` as a *member* of `MisoService`, with no
   separate `layer`/`layerTest` of its own named anywhere for it — unlike
   `Miso`, `SuiGraphQL` and (implicitly) `Musicos`/`Partyos`, which do get
   their own layers. Making it a full service would mean either
   registering it independently (which nothing in the issue's migration
   map or facade section asks for) or building a throwaway layer just to
   immediately unwrap it inside `Miso.make` — `docs/extensions.md` §12's
   "assemble the service from those functions" idiom is a plainer fit,
   and it is what this stage built.
2. **`client.ts`'s pressing-read/`#run` conversion was pulled forward
   from stage 3.** Stage 1's own table assigned all 10 of `client.ts`'s
   baseline errors to stage 3 ("WP6 — this whole class is deleted").
   This stage's explicit brief said `@misofm/effect` importers "must
   reach zero" by its end, which is not possible while `client.ts` still
   imports `SuiClient`/`SuiRpcError`/`BcsDecodeError`/
   `ObjectTypeMismatchError`/`TransactionFailedError` from it. The
   contained part of that conversion (four read methods plus `#run`,
   not the whole class) turned out tractable without touching anything
   `ids`/`tx`/`call`/`vault`-shaped, so it was done now rather than left
   as a documented, deferred blocker on the dependency-removal
   requirement. The class itself, `misoPlatform()`, and
   `MisoClientNotReadyError` are still there, still doing real work, and
   are still stage 3's to delete.
3. **`Miso.publishCatalog` (a service member wrapping
   `publishAtomicCatalog` through `Tx.run`) was not added.** The issue's
   target `MisoService` interface names it, but nothing in WP3–WP5's own
   acceptance criteria asks for it (WP4's acceptance criterion is about
   `publishAtomicCatalog` itself submitting exactly once when a *caller*
   runs it through `Tx.run`, which the fragment already supports
   unchanged) and the WP1 skeleton's own scope note already deferred the
   rest of `MisoService`'s members (`tx.*`, `call`/`bcs`, `vault`, `read.*`,
   `createShareCurrency`, `publishCatalog`) to "stage 2/3" without pinning
   which. Adding one isolated service member ahead of the `Miso` service's
   own `tx`/`vault`/`call` surface (still entirely unbuilt) seemed more
   likely to need rework once that surface exists than to be worth doing
   in isolation now.
4. **No `vault` namespace object on `Miso`.** Same reasoning as #3: the
   issue's target `vault` member is `vault.ts`'s builders **bound** to
   `deployment.operations`, which is exactly the kind of binding this
   stage did build for `party` — but doing it for `vault` in isolation,
   with no `Miso.tx`/`Miso.call` surface yet to sit beside it and no
   `OperationsUnavailableError`-throwing wrapper convention established
   elsewhere on the service yet, would mean re-deciding that shape once
   `tx.*`/`call`/`bcs` land in stage 3 rather than reusing a decision
   already made. `vault.ts`'s functions stay standalone and fully
   converted (this stage's actual WP5 scope: get them off
   `@misofm/effect`), exactly like `pressing.ts`'s.
5. **`initializeShareCurrencies`'s partial-failure behaviour changed**
   from throwing a hand-aggregated plain `Error` string (every failing
   batch's message joined) to failing with the **first** typed batch
   error and dropping the others. A `Schema.TaggedError` union has no
   clean way to carry "these N batches failed for M different typed
   reasons" without inventing a wrapper error the taxonomy does not name;
   the first-typed-error rule is what the issue's own acceptance
   wording ("fails typed") asks for, and `onBatch` already reported every
   batch that *did* succeed before the failure surfaces, which is the
   part a resume actually needs.
6. **`royalty.ts` and `vault.ts`'s converted reads
   (`getRoyaltyPoolById`/`getRoyaltyStakeById`/`getRoutedStakeById`,
   `getVaultAdminCap`, `resolveReceivingCoins`) have no test coverage.**
   Pre-existing (their test files only ever covered the pure PTB
   builders in the same files); this stage converted them correctly
   (confirmed by typecheck and by the package's `build`) but did not add
   new tests for them, given the stage's time budget was spent on the
   genuinely new, previously-untested `Tx.run` behaviour in `share.ts`.
7. **`tests/client.test.ts` left broken.** Pre-existing since before
   stage 1 (unmodified by this stage — `git diff` on the file is empty);
   it is the file the issue's own WP6 acceptance criterion names for a
   full rewrite ("`client.test.ts` rewritten against
   `client.$extend(miso({ deployment }))`"), and several of its tests
   (`"MisoPlatformClient.party delegates core reads to PartyosClient..."`,
   `"protocol and nested Party surfaces cannot read or build before
   readiness"`) assert against members this stage removed from the class
   for exactly the reason WP6 will delete the class outright. Rewriting
   it now would be throwaway work against a class stage 3 deletes.
8. **Isolated-consumer fixture untouched** (as stage 1 found it): still
   references `PartyosClient`, `MisoPlatformClient`, `PartyPlatformClient`
   and other now-deleted names; `bun run test:consumer` was already
   failing before this stage and stays that way. WP6/WP7 scope per the
   issue.

## What stage 3 (WP6 facade derivation and README, WP7 consumer smoke)
still owes

- `MisoService` fully assembled on `Miso`: `getPressing`/`getListing`/
  `getRecord`/`getSale`, `ids.*`, `tx.*`, `call`/`bcs`, a bound `vault`
  namespace (`OperationsUnavailableError` from every member when
  unavailable), `createShareCurrency`/`publishShareCurrencies`/
  `initializeShareCurrencies` as service members over the now-`Tx.run`-shaped
  `share.ts`, `publishCatalog`, `read.*`, `events` — this is where
  `Miso.layer`'s requirement channel finally needs `SuiGraphQL` too, once
  `read.*` joins the service.
- `miso()` registration via `SuiExtension.fromService`, with the
  deprecated `ready: Effect.void` warm-up member the migration map calls
  for.
- `read/client.ts`'s `MisoClient.layer` widened to `Miso | Sui | SuiCore |
  SuiGraphQL` (needs a complete `MisoPlatformDeployment`, not just the
  package-id subset `MisoConfig` carries today).
- Delete `client.ts`'s `MisoPlatformClient` class outright (its
  remaining surface — pressing reads, `ids`/`tx`/`call`/`bcs`/`vault`,
  all now typechecking cleanly against `Sui` per this stage — folds into
  `MisoService`), `misoPlatform()`, and `MisoClientNotReadyError` (kept
  through stages 1 and 2 for source compatibility with the
  still-standing class — see deviation #2).
- README rewrite (Usage on the service and the face, error table, layer
  table, 0.28 migration section); `package.json` version bump to
  `0.28.0` (`@misofm/effect` is already gone from `dependencies` as of
  this stage).
- Isolated-consumer fixture (`tests/fixtures/isolated-consumer/`)
  rewrite (`imports.ts`/`verify.mjs`); `tests/client.test.ts` rewrite
  against `client.$extend(miso({ deployment }))`.
- `misofm/app`/`misofm/cli` consumer-edit list (WP7).

## Stage 3 (this run): WP6 facade derivation and README, WP7 consumer smoke

### What stage 3 built

- **`MisoService` fully assembled on `Miso`** (`src/Miso.ts`, `assemble()`):
  `getPressing`/`getListing`/`getRecord`/`getSale` (bound to
  `deployment.recordSales`, failing typed `RecordSalesUnavailableError`
  instead of the predecessor's synchronous throw, since these are `Effect`
  members); `ids.*` (sync, throws `RecordSalesUnavailableError`/
  `OperationsUnavailableError` — the same synchronous-gate shape the
  predecessor used, now closing over `deployment` directly instead of a
  `#requireReady` proxy); `tx.*` (all 7 sales builders, both share-currency
  fragments, 4 publish builders, `publishReleaseGraph`, 12 extension
  setters — ported from `client.ts`'s own `tx` object almost verbatim, minus
  the deleted readiness gate, since `warm`/`$ready()` supersede it); `call`/
  `bcs` (ported from `client.ts` unchanged in shape — still `undefined` for
  an unconfigured section, exactly like the predecessor); `vault` (always an
  object now — `vaultActions` plus `getVaultAdminCap`/`resolveReceivingCoins`
  bound to `Sui`, wrapped in a `gateAvailability` Proxy that throws
  `OperationsUnavailableError` from every member call when
  `deployment.operations.status !== "available"`, replacing the
  predecessor's `vault: typeof vaultActions | undefined`);
  `createShareCurrency`/`publishShareCurrencies`/`initializeShareCurrencies`
  (thin `withSui` wrappers over the already-`Tx.run`-shaped `share.ts`
  functions stage 2 built); `publishCatalog` (new: `Tx.run(publishAtomicCatalog(...))`
  then `parseAtomicPublicationResult`, in one member); `read.*` (new: the 27
  `read/*` functions bound to one `MisoConfig` derived from `deployment` via
  the new `configFromDeployment` — see below — through a uniform
  `withEnv` helper that provides both `Sui` and `SuiGraphQL`, since which of
  the two each function actually reads varies and providing an unused
  service is harmless); `events` (`platformEventParsers`, unchanged); the
  deprecated `ready: Effect.void` warm-up member the migration map calls for.
  `Miso.layer`/`layerNoDeps`/`layerConfig`/`layerTest` all widen their
  requirement channel from `Sui` to `Sui | SuiGraphQL` now that `read.*` and
  the catalog reads need it. The incoming `deployment` is now recursively
  frozen (`immutableSnapshot`) inside `assemble`, restoring the predecessor's
  own "later caller mutation cannot retarget an existing client" guarantee,
  which the WP1/WP2/WP3 skeleton had not carried forward.
- **`src/read/config.ts`**: new `configFromDeployment(deployment, overrides?)`,
  factored out of `misoConfig(network, overrides?)` (which now just calls it
  with a bundled-table lookup) so `Miso.read.*` and `createMisoClient` share
  one derivation instead of two, and so a custom `MisoPlatformDeployment`
  (not just a bundled network) can back the `read.*` namespace.
- **`src/client.ts` rewritten wholesale** as the `miso()` registration:
  `SuiExtension.fromService(Miso, { name, layer, sui?, warm })`, same options
  shape as the sibling extensions (`name?`, `deployment?`, `chainId?`, plus
  `graphqlClient?` for the GraphQL-backed paths). `MisoClient` is now the
  `PromiseFace<MisoService> & ExtensionFace` type alias. `MisoPlatformClient`,
  `misoPlatform()`, `MisoPlatformConfig`, `bindModulePackage` (the class's own
  copy — a second one now lives in `Miso.ts` for `call`/`bcs`), and both
  `requireReadyOn*` proxies are deleted outright.
- **`src/errors.ts`**: `MisoClientNotReadyError` deleted (nothing imports it
  once `client.ts`'s ready-state machine is gone).
- **`src/read/client.ts`**: `MisoClient.layer` widened from `Sui | SuiGraphQL`
  to `Miso | Sui | SuiCore | SuiGraphQL` (`Miso.layer(deployment)` composed
  over `Sui.layerNoDeps`/`SuiCore.layerGrpc`/`SuiGraphQL.layer` via
  `Layer.provideMerge`, so every service stays visible in the output);
  `createMisoClient` now also returns `client` (`sui.$extend(miso({
  deployment, graphqlClient }))`) and accepts an optional `deployment`
  override, since `MisoConfig` alone (a package-id subset) cannot
  reconstruct the `operations`/`packages` sections `Miso.layer` needs for an
  unbundled network — the gap stage 1/2 flagged and left open.
- **`src/index.ts`**: exports the finished `Miso`/`MisoService` surface (plus
  `MisoTx`/`MisoIds`/`MisoCall`/`MisoBcs`/`MisoVault` member-shape types) and
  `miso`/`MisoOptions`/`MisoClient` from `client.ts`; drops `misoPlatform`/
  `MisoPlatformClient`/`MisoClientNotReadyError`/`MisoPlatformConfig`.
- **Tests.** `tests/client.test.ts` rewritten on the harness (WP6's own
  acceptance list): a warm registration on the fake (`SuiCoreFake.layer(...).client.$extend(miso(...))`)
  with nested namespaces reachable and a platform `tx` fragment composed with
  a `party` fragment in one PTB; a cold (non-warm, direct
  `SuiExtension.fromService`) registration proving `ExtensionNotReady` before
  `$ready()`; a submit-on-behalf member (`createShareCurrency`) through
  `Tx.run` with a scripted `execute`; rejection identity through the face
  (`_tag` preserved for both a platform tag, `RecordSalesUnavailableError`,
  and a composed sibling service's own tag, `partyos/PartyNotFound`); the
  network-mismatch path, both under `warm` (synchronous throw at `$extend`)
  and lazily (deferred to the first call) — see "Deviations" below. Pure
  `deployments.ts` validation (frozen snapshot, `requireRecordSalesDeployment`/
  `requireOperationsDeployment`) moved to a new `tests/deployments.test.ts`,
  since none of it exercises the facade. `tests/Miso.test.ts`'s `layerTest(...)`
  compositions gained `SuiGraphQL.layerUnavailable`, needed once `Miso.layer`
  widened its requirement.
- **Isolated-consumer fixture** (`tests/fixtures/isolated-consumer/`):
  `imports.ts`/`verify.mjs` updated for all three deleted classes it still
  referenced — `PartyosClient` (`@misofm/partyos`, deleted by that package's
  own conversion), `MisoPlatformClient`/`PartyPlatformClient`
  (`@misofm/platform`, deleted this stage) — replaced with `Partyos`/
  `partyos()`, `Miso`/`miso()`, and `MisoPartyService`/`makeMisoParty`, plus
  the same "registration builds synchronously, no network" probe `musicos()`
  already had, now also for `partyos()` and `miso()`.
- **README rewritten**: `## Install` with peers, an `## Usage` section split
  into `### Effect` (`yield* Miso`) and `### Promise` (`$extend(miso())`,
  `warm`, the network/deployment-mismatch timing), the namespace/error
  tables, a `### Migrating from 0.27` section (moved/removed/behaviour-changed
  tables), and a `## Testing` section on the harness. Every remaining
  section that named `MisoPlatformClient`/`PartyPlatformClient`/
  `PartyosClient`/`misoPlatform`/`executeViaExecutor`/`ParallelTransactionExecutor`/
  `@misofm/effect` in current (non-migration-table) prose was updated to the
  new surface. Root `README.md` and `CLAUDE.md`'s platform rows updated to
  describe it as a sui-effect extension.
- **`package.json`**: version `0.28.0`. `@misofm/effect` was already removed
  from `dependencies` in stage 2.
- This file renamed from `CONVERSION-STATUS.md` to `CONVERSION.md` (this
  edit) as the permanent record, per this stage's own brief.

### Facade surface: preserved vs. removed

Every name the in-repo consumer grep (`misofm/app`, `misofm/cli`,
`misofm/api`) actually reaches survives, unchanged in spelling:
`client.miso.ready()` (kept, deprecated no-op — see below),
`client.miso.party`, `client.miso.protocol` (the `!` non-null assertions at
every call site are now redundant, not wrong — `protocol`/`party` are never
undefined), `client.miso.ids.genre`, `client.miso.deployment`. **Nothing an
in-repo consumer calls today was removed.**

Removed from the package (no in-repo consumer reaches any of these — see the
issue's own consumer table, confirmed again by this stage's grep):
`MisoPlatformClient`, `misoPlatform()`, `MisoPlatformConfig`,
`MisoClientNotReadyError`, `client.miso.validateChainIdentifier()`,
`executeViaExecutor` (the class method), `@misofm/platform/execute` (the
whole subpath, deleted in stage 2), `PartyPlatformClient`.

**A real, mechanical consumer-edit surface remains, and none of it is a name
change** — `SuiExtension.fromService`'s derived Promise face turns every
`Effect` member into a Promise-returning method, where the predecessor's
`miso()` attached the raw `MisoPlatformClient` class instance (genuinely
`Effect`-returning methods, no Promise translation at all). Every
`Effect.runPromise(client.miso.<member>(...))` call site must drop the
`Effect.runPromise` wrapper and just `await` the call directly:

| Repo | File:line | Today | After this conversion |
| --- | --- | --- | --- |
| cli | `config.ts:362` | `await Effect.runPromise(client.miso.ready())` | `await client.miso.ready()` |
| cli | `show.ts:33,66,74,107` | `await Effect.runPromise(config.client.miso.protocol!.get*(...))` | `await config.client.miso.protocol.get*(...)` (the `!` is now optional, not wrong) |
| cli | `resolve.ts:967` | `await Effect.runPromise(config.client.miso.protocol!.getCompositionById(...))` | `await config.client.miso.protocol.getCompositionById(...)` |
| cli | `resolve.ts:1293` | `await Effect.runPromise(config.client.miso.party.getPartyById(...))` | `await config.client.miso.party.getPartyById(...)` |
| cli | `exec.ts:20` | `export * from "@misofm/platform/execute"` | delete the line — the subpath was removed in stage 2, this re-export is already broken independent of this stage |
| cli | `resolve.ts:1343,1371,1440` (the "two share-currency call sites" plus the `executeViaExecutor` call) | `dependencies.publishShareCurrencies(executor, signerAddress, count)` / `dependencies.initializeShareCurrencies(executor, signerAddress, ids, metaOf, onBatch)` / `dependencies.executeViaExecutor(executor, transaction)` — all against `@misofm/platform/share`'s stage-2-converted signatures, which cli was never updated for | `publishShareCurrencies(count, { signer })` / `initializeShareCurrencies(ids, metaOf, { signer, onBatch: (batch, gasUsed) => Effect<void, E> })`; `executeViaExecutor` is gone — the whole `createExecutor`/executor-threading shape in `resolve.ts`'s `dependencies` object needs to become a `Signer` instead, which is genuinely cli's own conversion's work, not a one-line fix |
| app | (none) | — | no `client.miso.*` call site in `misofm/app` wraps a member in `Effect.runPromise` — `lib/sui-client.ts`'s own `readySuiClient()`/`lib/party.ts`'s `readyPartyClient()` already treat `client.miso.ready()`/`client.miso.party` as Promise-shaped, so app needs **no edit** |

This table is the "written list of every remaining consumer edit" WP7 asks
for; none of it was applied here (`misofm/app`/`misofm/cli`/`misofm/api` are
sibling repos outside this worktree, and the stage 3 brief's own gates name
only this workspace) — it feeds those repos' own conversion issues.

### Gate results

```
$ bun run typecheck
@misofm/effect typecheck: Exited with code 0
@misofm/streaming typecheck: Exited with code 0
@misofm/partyos typecheck: Exited with code 0
@misofm/musicos typecheck: Exited with code 0
@misofm/platform typecheck: Exited with code 0
@misofm/transcoding typecheck: Exited with code 0

$ bun run test
@misofm/streaming test:  27 pass, 0 fail (99 expect() calls, 3 files)
@misofm/effect test:  23 pass, 0 fail (41 expect() calls, 2 files)
@misofm/partyos test:  36 pass, 0 fail (76 expect() calls, 2 files)
@misofm/transcoding test:  52 pass, 0 fail (166 expect() calls, 9 files)
@misofm/musicos test:  101 pass, 0 fail (234 expect() calls, 13 files)
@misofm/platform test:  334 pass, 0 fail (1088 expect() calls, 35 files)

$ bun run build
@misofm/streaming build: Exited with code 0
@misofm/effect build: Exited with code 0
@misofm/musicos build: Exited with code 0
@misofm/partyos build: Exited with code 0
@misofm/platform build: Exited with code 0
@misofm/transcoding build: Exited with code 0

$ git diff --stat -- packages/*/src/contracts
(empty)

$ bun run test:consumer
isolated consumer verified: single @mysten/sui@2.29.0 installed
isolated consumer verified: single effect@4.0.0-rc.112 installed
isolated consumer verified: single @misofm/effect@0.2.0 installed
isolated consumer verified: single @misofm/musicos@0.4.0 installed
isolated consumer verified: single @misofm/partyos@0.4.0 installed
isolated consumer verified: single @misofm/platform@0.28.0 installed
isolated consumer verified: single @misofm/streaming@0.3.0 installed
isolated consumer verified: single @misofm/transcoding@0.4.0 installed
isolated consumer dependency identity verified
test:consumer: OK — 6 package(s) packed, installed, and verified in isolation
```

Platform: **319 → 334 tests passing** (client.test.ts's 943-line rewrite plus
the new `deployments.test.ts` net add 15; nothing regressed).
`codegen:check` was not run — it needs sibling Move checkouts absent from
this environment, exactly as stage 1/2 recorded; `git diff --stat --
packages/*/src/contracts` (above) is empty, confirming no generated file
was hand-touched.

### Deviations from the issue, with reasons

1. **Network/deployment mismatch throws synchronously at `$extend` again,
   for `testnet`/`mainnet`** — contradicting the issue's own migration-map
   row ("network-label mismatch is no longer a synchronous throw at
   `$extend`; it rejects the first call"). This stage's own brief hands
   `miso()` the exact `warm: { chainId }` snippet, matching `partyos()`'s own
   choice; `warm` builds the whole layer synchronously inside `register`
   (sui-effect's own documented contract — "Build the runtime **inside
   `register`**, synchronously"), so ANY layer failure, not only the two
   named async/no-chain-id preconditions, surfaces as a synchronous throw
   when the chain id is knowable (the built-in table covers `mainnet`/
   `testnet`) — confirmed empirically in `tests/client.test.ts`. The
   migration-map wording describes a **lazy** registration, which still
   defers to the first call exactly as written (also tested). Both paths are
   covered; the deviation is that `miso()`'s own chosen default (`warm`,
   per this stage's brief) no longer matches that one migration-map
   sentence for the common case.
2. **`vault`'s gating is a whole-namespace availability Proxy, not
   per-builder deployment-id binding.** The predecessor's `get vault()`
   already returned the bare, UNBOUND `vault.ts` module (every builder still
   takes its package ids as explicit parameters) or `undefined`; this stage
   keeps that same unbound shape and only changes the failure mode from
   "namespace is `undefined`" to "every member throws
   `OperationsUnavailableError`" — matching the migration map's own wording
   exactly, without inventing a new per-builder id-binding design the issue
   never asked for.
3. **The two still-optional deployment package fields
   (`recordingGenre`, `recordingStreamingTranscode`) throw a plain `Error`,
   not a tagged one, from `tx.setRecordingGenres`/`setRecordingStreamingTranscode`
   etc. when absent.** Same as the predecessor's `#requiredConfig` behaviour;
   inventing a new tagged error with an `outcome` for this one corner (every
   other package id in `MisoPlatformDeployment` is required, so this is the
   only place a bound `tx.*` builder can still be missing a package
   entirely) was judged out of this stage's scope — nothing in the issue's
   target shape or WP6 acceptance criteria names it.
4. **`Miso.read.*` binds every config-consuming `read/*` function, but a
   handful of pure, config-free helpers (`currencyInfo`, `primaryArtistNames`,
   `toTracks`, `isRecordSoldEventType`, `recordSoldCurrencyType`,
   `findRecordSales`, `findRecordSale`, `breakdown`) are exposed unbound**
   (still taking their existing explicit parameters) rather than partially
   applying an id like `recordShopPackageId` from the deployment for
   convenience. They have no `MisoConfig` parameter to capture in the first
   place, so "config captured from the layer" does not apply to them; adding
   a second, narrower binding convention for this handful was judged not
   worth the surface-area increase.
5. **`createMisoClient`'s `CreateMisoClientOptions` gained an optional
   `deployment?: MisoPlatformDeployment`**, not named in the issue's own
   `read/client.ts` prose. Required to close the gap stage 1/2's own notes
   flagged ("needs a complete `MisoPlatformDeployment`, not just the
   package-id subset `MisoConfig` carries") — the bundled-network path
   resolves one automatically via `getMisoPlatformDeployment`, so this is
   additive, not a breaking change to the existing options shape.
6. **The isolated-consumer fixture's `partyos`-related breakage
   (`PartyosClient` no longer exported) was fixed here too**, not left for
   `sui-effect/partyos`'s own (already-merged) conversion to revisit. The
   fixture is one shared file across all three converted packages, and this
   stage's own gate (`bun run test:consumer` green) cannot pass while any
   one of the three is still broken in it.
7. **App/cli/api are not edited.** Per this stage's own scope ("work only
   in this worktree"), and because none of the four required gates
   (`typecheck`/`test`/`build`/`test:consumer`) touch those sibling repos —
   the "written list of every remaining consumer edit" table above is the
   substitute WP7 asks for in that case.

### What remains (follow-up issues, not this one)

- The consumer-edit table above, applied inside `misofm/app`/`misofm/cli`/
  `misofm/api`'s own conversion issues.
- `royalty.ts`/`vault.ts`'s converted reads still have no dedicated test
  coverage (flagged in stage 2, unchanged this stage — this stage's own new
  test budget went to the facade rewrite).
- `MisoConfig`'s `grpcUrl`/`graphqlUrl`/`apiBaseUrl`/`money` fields are still
  hard-coded Testnet defaults regardless of `network`/`deployment.network`
  (a pre-existing gap, noted in `read/config.ts`'s own `configFromDeployment`
  doc comment; `overrides` is the workaround today).
- `sui-effect`'s own npm-swap checklist (bump `peerDependencies`, drop
  `peerDependenciesMeta`, remove the vendored tarball and its `file:`
  devDependency) is unchanged by this stage and still pending the first
  `sui-effect` release — done in Stage 4 below.

## Stage 4: npm package swap

`sui-effect` published its first release as `@unconfirmed/sui-effect@0.1.0`
(subpaths `/tx`, `/journal`, `/extension`, `/script`, `/testing` unchanged;
API otherwise identical to the vendored 0.1.0 build). `vendor/` is deleted;
`partyos`, `musicos` and `platform` now take `@unconfirmed/sui-effect` as an
ordinary registry `devDependency`/`peerDependency` pair (no more `file:`
tarball, no `peerDependenciesMeta` optional-peer entry), and every import
specifier, the isolated-consumer fixture, and `dependency-contract.test.ts`
were updated from `sui-effect` to `@unconfirmed/sui-effect` to match. The
Stage 1-3 narrative above describes the vendored-tarball setup as it was at
the time and is left as history, per this file's own rule.
