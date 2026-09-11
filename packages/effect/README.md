# @misofm/effect — DEPRECATED

`@misofm/effect` is superseded by [`sui-effect`](https://github.com/unconfirmedlabs/sui-effect). `0.2.0`
is its final release: **code-identical to `0.1.1`** — every export still works exactly as before, no
signature or runtime change — but every export now carries an `@deprecated` JSDoc tag naming its
sui-effect replacement, and this README is the migration table.

`@misofm/effect@0.1.1` **stays on npm** and is not removed; pin it (together with `@misofm/musicos <0.4`,
`@misofm/partyos <0.4` and `@misofm/platform <0.28`) for as long as you need to. New work should target
`sui-effect` directly — see its `docs/extensions.md` §11 for the same table this README carries, and §1–§10
for how to build against it.

## Migration

| `@misofm/effect` | sui-effect | Behaviour change |
|---|---|---|
| `SuiClient.layer(client)` | `Sui.layerNoDeps.pipe(Layer.provideMerge(SuiCore.layerFromClient(client)))` | build reads `getChainIdentifier`; fails `NetworkMismatch \| TransportError` on mainnet/testnet mismatch |
| `SuiClient` (raw reach-through: `yield* SuiClient; client.core.x()`) | `sui.core.x()` or `sui.core.use((client, signal) => ...)` | errors mapped, signal forwarded |
| `SuiGraphQL` | sui-effect's `SuiGraphQL` service tag (`layer(client)`, `layerConfig`, `layerUnavailable`); sui-effect does not wrap the GraphQL API itself | one shared tag across musicos and platform |
| `getObjectContent(id)` | `sui.getObject(ObjectId.make(id))` → `SuiObject<Uint8Array>` | `version` is `bigint`; fails `ObjectNotFound \| ObjectDeleted \| ObjectUnavailable`; ids and addresses are branded |
| `getOptionalObjectContent` | `sui.getObjectOption` | deleted → `None`; `ObjectUnavailable` still fails |
| `getObjectsContent(ids)` → `ReadonlyMap` | `sui.getObjects(ids)` → `ReadonlyArray<Result<SuiObject, BatchItemError>>` | **per-item `Result`** — errored ids are no longer silently dropped; chunked by 50, deduped, integrity-checked |
| `listDynamicFields(parent)` | `sui.streamDynamicFields(parent)` | none |
| `decodeBcs(codec, Class, bytes, ctx)` | `SuiSchema.decode(SuiSchema.bcs(Struct, type).pipe(Schema.decodeTo(Class, ...)), bytes, { objectId })`, or `sui.getObject(id, { schema })` | `codec` must be a `@mysten/bcs` `BcsType`, not a bare `{ parse }` |
| `BcsParser<T>` | dropped — `SuiSchema.bcs` takes a `@mysten/bcs` `BcsType`; generated `MoveStruct`/`MoveEnum` already qualify | none |
| `ObjectContent`, `DynamicField`, `DecodeBcsContext` | the shapes `sui.getObject`, `sui.streamDynamicFields`, and `SuiSchema.decode`'s options return/accept | folded into the calls above |
| `assertObjectType` | the bridge's tag check (`sui.getObject({ schema })`, `SuiSchema.decode({ expectedType })`) | `normalizeStructTag` on both sides |
| `ObjectNotFoundError` | `ObjectNotFound`, plus `ObjectDeleted` and `ObjectUnavailable` from the SDK's own `reason` | one error becomes three, distinguishing deleted / unavailable from never-existed |
| `ObjectTypeMismatchError` | `DecodeError { objectId, expectedType, issue }` | from the bridge's normalized tag check |
| `BcsDecodeError` | `DecodeError { objectId?, expectedType?, issue }` | |
| `SuiRpcError { operation, cause }` | `TransportError { method, retryable, status?, cause }` | callers that construct it directly must supply `retryable` |
| `SuiReadError` | `GetObjectError` | |
| `GraphQLUnavailableError` | sui-effect's `GraphQLUnavailable` (outcome `not_applied`), raised by `SuiGraphQL.layerUnavailable` | |
| `DeploymentError` | dropped from this package — define an equivalent tag-prefixed `Schema.TaggedError` (e.g. `musicos/DeploymentError`) in each consumer's own `errors.ts`, with `outcome: "not_applied"` | |
| `TxThunk = (tx) => void \| Promise<void>` | `Recipe = (tx) => void` | **async thunks are gone** — every thunk inside these SDKs is synchronous; a consumer's `async (tx) => ...` hoists its `await` before the recipe |
| `buildTx(...thunks)` → `Transaction` | compose recipes — `(tx) => { a(tx); b(tx) }` — then `Tx.build(recipe, { sender })` for bytes, or `const tx = new Transaction(); recipe(tx)` when the builder object itself is needed | `Tx.build` simulates and sets a `ValidDuring` expiration |
| `signAndExecute` / `execThunks` | `Tx.run(recipe, { signer: Signer.fromKeypair(kp) })` → `Executed` | **no redundant `waitForTransaction`** — `signAndExecute` sent once and then polled; `Tx.run` returns the execution result directly, holds the sender lock, journals the signed bytes, and re-sends the identical bytes on retryable transport failures |
| `TransactionFailedError { digest, status }` | `ExecutionFailed { digest, reason, command?, effects }` | **on-chain (aborted/reverted) failure is `ExecutionFailed`**, not a bare thrown status; `reason` is the `$kind`-tagged `ExecutionReason`, `outcome` is `"applied"` |
| a transport failure after bytes may already have been submitted | `SubmissionUnknown` | **carries the bytes that were sent**, so a caller can reconcile instead of blindly resubmitting; `signAndExecute` surfaced the same situation as an opaque `SuiRpcError` |
| `ExecResult` | `Executed` | see the extractors below |
| `ExecResult.gasUsed: number` | `executed.gasUsedTotal` | **`bigint`, not `number`** |
| `balanceDelta(r, addr, coin): string` | `executed.balanceChange(addr, coin)` | **`bigint`, not a decimal string** |
| `createdByType` / `allCreatedByType` / `maybeCreatedByType` (substring match) | `executed.createdWhere(ref => ref.type?.includes(s))` | |
| `createdByExactType` | `executed.created(type)` | compares **normalized** struct tags; returns a `ChangedRef`, not a string |
| `publishedPackageId` / `allPublishedPackageIds` | `executed.packagesPublished()` | returns `ChangedRef`s, not strings |
| — (no equivalent) | `executed.expectCreated(type)` | fails `UnexpectedEffects` instead of throwing when nothing matches |
| `toExecResult`, `FULL_INCLUDE` | internal to `Tx.submit` | not part of the public surface any more |
| a hand-rolled `register(client)` building a class of Promise methods | the sui-effect service pattern plus `SuiExtension.fromService` | see `docs/extensions.md` §1–§7 |

### Behaviour changes to expect

The conversion is mechanical except for these five, worth calling out on their own before converting a caller:

1. **`getObjects` returns a per-item `Result`.** Ids that failed are no longer silently dropped from the
   returned collection the way `getObjectsContent` dropped them from its `ReadonlyMap`.
2. **Balances and gas are `bigint`, not `number` or a decimal `string`.** `executed.gasUsedTotal` and
   `executed.balanceChange(...)` both return `bigint`.
3. **No redundant `waitForTransaction`.** `signAndExecute` sent the transaction once and then called
   `waitForTransaction`; `Tx.submit` never calls it, returns the execution result directly, and instead
   re-sends the identical signed bytes on retryable transport failures before reconciling by digest.
4. **On-chain execution failure is `ExecutionFailed`.** A transaction that reached the chain and aborted or
   reverted fails with `ExecutionFailed { digest, reason, command?, effects }`, not the old
   `TransactionFailedError { digest, status }` shape.
5. **An unknown outcome is `SubmissionUnknown`, carrying bytes.** If a transport failure happens after the
   transaction may already have been sent, sui-effect fails with `SubmissionUnknown` and the bytes that were
   submitted, so a caller can reconcile deliberately. `signAndExecute` never retried; it surfaced the same
   situation as an opaque `SuiRpcError` with no bytes to reconcile from.

## Errors (0.1.1 reference)

Every failure is a `Schema.TaggedError` carrying the fields a caller needs to act:
`ObjectNotFoundError { objectId }`, `ObjectTypeMismatchError { objectId, expected, actual }`,
`SuiRpcError { operation, cause }`, `BcsDecodeError { type, objectId?, cause }`,
`TransactionFailedError { digest, status }`, `GraphQLUnavailableError {}`, and
`DeploymentError { message }`. Recover from one with `Effect.catchTag("ObjectNotFoundError", ...)`
rather than an `isNotFound(error)` predicate.

## Subpaths

| Subpath              | Purpose                                                        |
| --------------------- | --------------------------------------------------------------- |
| `@misofm/effect`      | Everything below, re-exported                                   |
| `@misofm/effect/errors` | The `Schema.TaggedError` classes and the `SuiReadError` union |
| `@misofm/effect/sui-client` | The `SuiClient` and `SuiGraphQL` services + their layers   |
| `@misofm/effect/reads` | `getObjectContent`, `getObjectsContent`, `getOptionalObjectContent`, `listDynamicFields`, `decodeBcs`, `assertObjectType` |
| `@misofm/effect/execute` | `buildTx`, `signAndExecute`, `execThunks`, and the pure `ExecResult` extractors |

## Install

```sh
bun add @misofm/effect effect @mysten/sui
```

Peer dependencies: `effect@4.0.0-rc.112` and `@mysten/sui@2.29.0` (both exact).

## Release notes

- **`0.2.0`** — deprecation release. Code-identical to `0.1.1`: no export's signature or runtime behaviour
  changed. Every export gained an `@deprecated` JSDoc tag pointing at its sui-effect replacement, and this
  README became the migration table above. `description` in `package.json` is prefixed `DEPRECATED:`.

  Once `@misofm/platform@0.28.0` (the last sibling package to move onto `sui-effect`) has published, this
  package is deprecated on the npm registry with:

  ```sh
  npm deprecate "@misofm/effect@<=0.2.0" "@misofm/effect is superseded by sui-effect. @misofm/musicos@>=0.4, @misofm/partyos@>=0.4 and @misofm/platform@>=0.28 depend on sui-effect directly and no longer accept the SuiClient service. Migration table: packages/effect/README.md in misofm/sdks and node_modules/sui-effect/docs/extensions.md §11. Pin 0.1.1 only together with the pre-0.28 SDKs."
  ```

- **`0.1.1`** — last pre-deprecation release, kept on npm indefinitely for consumers who have not yet moved
  to `sui-effect`.

## License

Apache-2.0
