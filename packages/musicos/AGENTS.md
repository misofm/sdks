# Agent guidance: @misofm/musicos

`@misofm/musicos` is a [sui-effect](https://github.com/unconfirmedlabs/sui-effect)
extension for the `musicos` Move package (Composition, Recording, Release,
Track). Read `node_modules/@unconfirmed/sui-effect/docs/extensions.md` in full before
changing anything here — it is the contract this package follows — then
`node_modules/@unconfirmed/sui-effect/LLMS.md` for every sui-effect signature and
`node_modules/@unconfirmed/sui-effect/AGENTS.md` for the library's own rules. This file is
the musicos-specific addendum.

## Ground rules

- **One service.** `Musicos` (`src/Musicos.ts`), identifier
  `"@misofm/musicos/Musicos"` — a runtime key, never changed after
  publication. Its `layer` requires `Sui` and nothing it could have built
  itself.
- **Every member is `Effect.fn("Musicos.<name>", ..., Effect.provideService(Sui, sui))`**,
  so `R` is empty. Non-generic types (`Release`, `ReleaseRegistry`,
  `ReleaseAdminCap`) read through `sui.getObject(id, { schema })`. Generic
  ones (`Composition<T>`, `Recording<R, C>`, their two admin caps) read
  through the exact same path, with a **bare** expected tag — sui-effect's
  bridge matches every instantiation of a bare tag, so there is no separate
  "generic read" function. See `src/schema.ts` for why the two admin caps'
  codecs stop at `{ id }`: their share type is a phantom parameter, nothing
  to decode from BCS content, read off the object's own `type` instead.
- **Nothing submits.** `Musicos` has no member that calls `Tx.run` or
  `Tx.submit`. Every write to the object model is a `Recipe` fragment in
  `src/transactions.ts`; a consumer composes fragments (from this package and
  others) into one `Transaction` and runs it once.
- **Codecs are functions of `packageId`.** A Move type tag is per deployment,
  so `src/schema.ts` exports factories (`compositionContent(packageId)`, not
  a bare `compositionContent`), built once inside `Musicos`'s `make()`
  closure at layer build, not per call.
- **No `typeOrigin`, deliberately.** sui-effect's guide distinguishes
  `packageId` (what `moveCall` targets) from `typeOrigin` (the package a
  Move *type* was first published in, which is what survives inside a type
  name after an upgrade) for an upgradeable package. `Musicos` has no
  `typeOrigin` option and uses `deployment.packageId` for both calls and
  codecs. This is deliberate, not an oversight: `deployments.ts`'s own
  contract is that every bundled and caller-supplied manifest names a
  **verified immutable** publish (`MISO_DEPLOYMENTS`'s doc comment, and
  `assertMisoDeployment`'s validation, both predate this conversion and are
  unchanged by it) — the `musicos` package this SDK targets is never
  upgraded, so `packageId` and `typeOrigin` are the same value for the
  lifetime of every deployment this package can ever be given. Revisit this
  the day `musicos` itself gains an `UpgradeCap` a deployment might name a
  post-upgrade `packageId` for: add `typeOrigin?: string` (defaulting to
  `packageId`) to `MusicosOptions`/`MisoProtocolDeployment`, thread it into
  every `schema.ts` factory and `Musicos.ts`'s bare-tag constants in place
  of `deployment.packageId`, and keep `packageId` for `moveCall` targets
  only (`transactions.ts`'s `misoPackageId` parameters, `view`'s recipe).
- **Errors**: `src/errors.ts` declares its own —
  `musicos/TreasuryCapNotFound`, `musicos/WorkNotFound`,
  `musicos/DeploymentInvalid` — each with `outcome: "not_applied"`.
  Everything else is sui-effect's taxonomy,
  re-exported from the same module so `@misofm/musicos/errors` is still one
  place to import the whole vocabulary from. Do not invent a tag for
  something the taxonomy already names (a missing object is `ObjectNotFound`,
  not a musicos-specific "not found").
- **The three GraphQL reads** (`getCompositionByShareType`,
  `getRecordingByShareType`, `getWorkAddressesByShareTypes`, in
  `src/queries.ts`) stay standalone `Effect<A, E, Sui | SuiGraphQL>`
  functions, not `Musicos` service members: `Musicos.layer` must keep
  requiring only `Sui`, and a consumer without a GraphQL endpoint should
  never be forced to provide one just to build the service. This is an
  amendment to misofm/sdks#34 made after scoping — the issue's own "Removed"
  section says these move to platform; they did not. If you find yourself
  re-reading the issue text on this point, trust this file and
  `src/queries.ts`'s own comment over the issue.
- **`src/contracts/**` is generated.** Never hand-edit; regenerate with
  `bun run codegen` at the repo root and `bun run codegen:check` must show
  no diff. `src/contracts.ts` (no trailing slash) is a **hand-written**
  barrel curating that generated tree into the public `contracts` namespace
  (`packages.ts`'s `bindModulePackage`, minus reference-returning calls) —
  it is fine, and sometimes necessary, to edit it.
- **Deprecated compatibility exports** (`index.ts`'s `TxThunk`,
  `events.ts`'s `decodeEvent`/`BcsParser`) exist only because
  `packages/platform` still imports them; platform's own conversion
  (misofm/sdks#35) is what removes the need for them. Do not add new ones
  without a concrete platform (or other in-repo) caller — the "keep a
  compatibility export" allowance is for breakage this conversion caused,
  not a general escape hatch.

## The two rules everywhere a Move type is compared

A bare expected tag (`pkg::composition::Composition`) matches every
instantiation of the generic; a tag carrying type arguments
(`pkg::composition::Composition<0x2::sui::SUI>`) is compared in full after
normalization. This governs `sui.getObject`'s `schema`/`expectedType`,
`SuiSchema.decode`'s `actualType`, and `streamOwnedObjects`'s `type` filter —
sui-effect's own rule (`typeMatches`), not something this package
reimplements. `getOwned*AdminCaps` relies on it directly: the type filter
passed to `streamOwnedObjects` is the bare cap tag.

## Testing

`@unconfirmed/sui-effect/testing` is the whole harness — no hand-rolled fakes, no network.
`tests/musicos.test.ts` is `layerExtensionTest(Musicos.layerTest({ packageId }), script)`;
`FakeObject.content` is built with the generated codecs' own `.serialize(...).toBytes()`,
never hand-written bytes. `tests/extension.test.ts` drives the derived
Promise face through `SuiCoreFake`'s `client.$extend(...)`, the same way a
real consumer would. A test asserting a Move-type mismatch decodes bytes for
one object kind against another kind's codec (see `tests/schema.test.ts`),
not a fabricated tag string — the point is to prove the bridge's real
comparison, not a string equality this package wrote.

## Done means

`bun run typecheck`, `test`, `build` green in this package; `bun run
codegen:check` (from the repo root) shows no diff under `src/contracts`;
`bun run test:consumer` (from the repo root) installs the packed tarball into
an isolated fixture with one copy of `effect` and `@unconfirmed/sui-effect`. `LLMS.md` (if
present) documents every public signature; a stale one is a bug the same as
a stale `README.md`.
