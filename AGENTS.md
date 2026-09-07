# SDK development

This Bun workspace publishes `utils`, `streaming`, `protocol`, `platform`, and
`transcoding` independently. Read the owning package README before changing its
public contract. The migration context is in `docs/effect-migration.md`.

- Use exactly Effect `4.0.0-rc.112`; inspect installed v4 declarations for API
  signatures. Keep `@effect/platform-node` on the same version.
- Express asynchronous orchestration as composable Effects. Add `Effect` to
  the operation name and retain a thin Promise adapter for established APIs.
  Yield owned Effect APIs directly; run the runtime only at the public boundary.
- Name domain reads `get`, raw HTTP `fetch`, decoders `parse`, deterministic
  identifiers `derive`, URL helpers `get...Url`, construction `build`, and
  submission `execute`. Keep established public aliases and domain verbs.
- Keep pure parsing and transaction command construction synchronous. Derive
  mapper types from generated codec output; do not introduce handwritten `any`.
- Use `SdkError` for foreign failures and preserve original Promise rejection
  values. State missing-data behavior explicitly. Domain errors retain their
  own types. Interruption must not become an optional-data fallback.
- Forward cancellation to supported reads. Never retry transaction submission
  or authenticated mutations automatically. Join started writes/checkpoints
  and owned filesystem work before releasing resources on interruption.
- Check Mysten SDK utilities and existing protocol APIs before adding helpers.
  Shared browser-safe policy belongs in utils; filesystem/process policy stays
  in transcoding. Keep player imports lazy and Node code out of browser entries.
- Do not manually edit `packages/protocol/src/contracts`; use code generation.
- Runtime dependencies must use publishable versions, never `workspace:`:
  npm packaging does not rewrite workspace specifiers.
- Validate with `bun run typecheck`, `bun run test`, `bun run build`, and
  `bun run test:consumer`. Add behavior tests for changed concurrency, failure,
  resource ownership, or protocol invariants. FFmpeg golden/browser conformance
  requires the pinned environment in `.github/workflows/transcoding-ffmpeg.yml`.
