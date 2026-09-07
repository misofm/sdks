# @misofm/protocol

Typed bindings, queries, event decoders, and PTB builders for the Miso
protocol and Party package set on Sui.

## Exports

| Subpath                  | Purpose                                              |
| ------------------------ | ----------------------------------------------------- |
| `@misofm/protocol`         | Root entrypoint                                        |
| `@misofm/protocol/client`      | Client construction                                    |
| `@misofm/protocol/deployments` | Deployed package/object IDs by network                |
| `@misofm/protocol/queries`     | Read queries over protocol and Party objects           |
| `@misofm/protocol/transactions`| PTB command builders                                   |
| `@misofm/protocol/execute`     | Transaction execution helpers                          |
| `@misofm/protocol/view`        | `devInspect`-backed view helpers                        |
| `@misofm/protocol/types`       | Shared TypeScript types                                 |
| `@misofm/protocol/parsers`     | Canonical object and event BCS parsers                   |
| `@misofm/protocol/events`      | Event decoders                                          |
| `@misofm/protocol/packages`    | Module→package bindings                                 |
| `@misofm/protocol/party`       | Party identity bindings                                 |
| `@misofm/protocol/contracts`   | Generated ABI-bound bindings (BCS structs + Move calls)  |

## Install

```sh
bun add @misofm/protocol @mysten/sui@2.29.0 effect@4.0.0-rc.112
```

Peer dependencies: `@mysten/sui@2.29.0`, `effect@4.0.0-rc.112` (exact), and TypeScript 5.9 or later within the declared major ranges.

## Effects and Promise compatibility

Async queries, Party reads, simulation, and execution expose matching `...Effect`
functions. Protocol and Party client query methods also expose these forms.
The original Promise functions run the same program once at their boundary.
Compose Effects directly to retain cancellation and typed `SdkError` failures:

```ts
import { Effect } from "effect";
import { runPromise } from "@misofm/utils/effect";
import { getRecordingByIdEffect, getCompositionByIdEffect } from "@misofm/protocol/queries";

const work = Effect.gen(function* () {
  const recording = yield* getRecordingByIdEffect(sui, recordingId);
  const composition = yield* getCompositionByIdEffect(sui, recording.compositionId);
  return { recording, composition };
});
const result = await runPromise(work, { signal: controller.signal });
```

`SdkError.operation` identifies the failed boundary and `SdkError.cause` retains
the original foreign rejection or codec exception. Catch failures with
`Effect.catch`; the Promise bridge rejects with that original object, preserving
domain classes and `AbortError` identity. Core and GraphQL reads pass cancellation
to their transport. Once transaction submission starts, execution waits for its
result and finality even if interrupted; it never retries a submission. Thunks
that share a Transaction run sequentially.

`executeThunks` / `executeThunksEffect` are the descriptive aliases for
`execThunks` / `execThunksEffect`. `buildTx` builds without submitting; pure
`parse*`, `derive*`, and transaction command builders remain synchronous.

## Missing data and migration notes

Required single-object getters fail for missing objects. Optional extension
fields return `null`, and Party collection extensions return `[]` when absent.
Transport failures still fail the read, including Party errors such as
`peer not found`. Existing bulk reads continue to skip per-object error entries
while a failed bulk request rejects the operation. Pagination rejects missing,
repeated, or cyclic continuation cursors. GraphQL service errors now fail
single-share discovery instead of being reported as an absent work.

Canonical `parseCompositionObject(id, bytes)`, `parseRecordingObject(id, bytes)`,
and `parseReleaseObject(id, bytes)` accept Move object content bytes, not the
full object envelope. They use generated codecs and return public domain types.

Walrus decoding now requires canonical unpadded base64url representing exactly
32 bytes; padded or permissively decoded spellings previously accepted by Party
helpers are rejected. Unsigned integer inputs still accept non-negative safe
integer numbers, bigint, and canonical decimal strings. Legacy numeric exports
delegate to the shared browser-safe `@misofm/utils` policy.

## License

Apache-2.0
