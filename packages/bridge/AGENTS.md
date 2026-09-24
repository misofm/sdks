# Bridge package contract

- `openapi/bridge-2026-09-23.json` is the byte-pinned official Bridge OpenAPI
  source. Its provenance and SHA-256 are recorded in `openapi/README.md`.
- `openapi/operation-manifest.json` is the stable mapping from upstream
  `method + path` pairs to operation IDs and public group keys. Review contract
  renames explicitly; do not regenerate this manifest as part of normal codegen.
- `openapi/normalization-overlay.json` contains the small, reasoned set of
  upstream corrections applied before generation. Keep its rationale current.
- `src/generated/BridgeApi.ts` is generated only by
  `bun run generate` / `bun run generate:check`. Never edit generated code.
- `bun run generate:check` reads only committed files and must be byte-for-byte
  clean. It verifies the source hash, 134-operation manifest, warning baseline,
  and generated output.
- The generated API uses Effect v4 `HttpApi` groups and endpoints. Runtime
  client/service construction belongs in the package's handwritten modules;
  those modules should consume the generated `BridgeApi` and its exported
  schemas.
- Bridge wire field names and scalar encodings come from the pinned upstream
  schemas. Do not globally loosen required fields or enum values to accommodate
  conflicting examples; document each upstream discrepancy at its boundary.
- The package pins `effect@4.0.0-rc.112` exactly. The generator is development
  tooling and is not a runtime package dependency.
