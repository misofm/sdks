# misofm/sdks Agent Guide

## Sui Development Skills

Install community-maintained skills for Sui development:

```sh
npx skills https://github.com/MystenLabs/skills
```

## Sui SDK Reference

Every `@mysten/*` package ships LLM documentation in its `docs/` directory. When working with
these packages, find the relevant docs by looking for `docs/llms-index.md` files inside
`node_modules/@mysten/*/`. Read the index first to find the page you need, then read that page
for details.

## Official Resources

When unsure about Move patterns or Sui APIs, consult these sources. Do not guess or
extrapolate from other blockchains.

- Move Book: https://move-book.com (use https://move-book.com/llms.txt)
- Sui Docs: https://docs.sui.io (use https://docs.sui.io/llms.txt)
- Sui Move examples: https://github.com/MystenLabs/sui/tree/main/examples/move

## Project Structure

This is a Bun workspace of publishable packages under `packages/*`:

- `packages/musicos` — `@misofm/musicos`, the works object model SDK (Composition,
  Recording, Release, Track).
- `packages/partyos` — `@misofm/partyos`, the Party object model SDK (Party, admin cap,
  group membership).
- `packages/platform` — `@misofm/platform`, a `sui-effect` extension (the `Miso` service)
  for everything Miso builds on top of the object models (work and Party extensions,
  royalty primitives, Vault, Actions, product workflows), composed over `@misofm/musicos`
  and `@misofm/partyos`.
- `packages/effect` — `@misofm/effect`, **deprecated**: superseded by `sui-effect` (the
  Effect v4 foundation every package is being converted to; see the migration table in
  `packages/effect/README.md`). Do not add new code here.
- `packages/streaming`, `packages/transcoding` — the streaming transcode contract and
  transcoder.

Within `packages/musicos`, `packages/partyos`, and `packages/platform`:

- `src/` — public TypeScript SDK, transaction builders, reads, and generated bindings
- `src/contracts/` — generated bindings; regenerate with `bun run codegen` at the repo root
- `tests/` — Bun unit and transaction-shape tests

At the repo root:

- `sui-codegen.config.ts` — the three generated trees' Move package inputs, and the source of
  truth for which package lands in `packages/musicos/src/contracts/`,
  `packages/partyos/src/contracts/`, or `packages/platform/src/contracts/`. See the "Expected checkout layout" comment there for
  where this repo expects its sibling Move package checkouts to live — do not restate that
  layout elsewhere.
- `scripts/codegen.ts` — the codegen runner that generates every tree.

## The object-model / platform boundary

> `@misofm/musicos` and `@misofm/partyos` are the object models. Everything Miso offers on top
> of them is platform.

When adding a feature, decide which package it belongs to using that rule, not convenience:
if it is intrinsic to a Composition/Recording/Release/Track, it belongs in `musicos`; if it is
intrinsic to a Party (identity, admin cap, membership), it belongs in `partyos`; if it is an
opinion Miso's product adds on top — including every `party_*` extension — it belongs in
`platform`.

## Effect conventions

- Effect v4 release candidate, pinned exactly (see any package's `peerDependencies`). Read
  `node_modules/effect/AGENTS.md` and `ai-docs/` before writing Effect code; v4 is not v3.
- I/O returns `Effect` with `SuiClient` (from `@misofm/effect`) in the requirements; client
  extension classes provide the layer internally. PTB builders stay synchronous.
- Failures are `Schema.TaggedError` classes in each package's `src/errors.ts` (`./errors`
  subpath); never throw strings or plain `Error` from public reads.
- Domain types are `Schema.Class`; generated BCS shapes under `src/contracts/` never appear
  in a public signature.

## Project Rules

- Use `@mysten/sui` v2 APIs and gRPC/Core client patterns; do not add JSON-RPC.
- Do not hand-edit generated files under any `packages/*/src/contracts/`.
- Keep PTB helpers composable: accept a `Transaction`, return results when useful, and do not execute.
- Run `bun run typecheck`, `bun test`, `bun run build`, `bun run codegen:check`, and
  `bun run test:consumer` before handoff.
