# @misofm/effect

The shared Effect foundation for the Miso SDKs: one `SuiClient` service, one error
vocabulary, and the read/execute primitives every `@misofm/*` package's queries and
transaction builders are composed from.

Every other `@misofm/*` package depends on `@misofm/effect`, so there is exactly one
`SuiClient` service tag and one set of tagged errors across the SDKs — a program that
mixes primitives from `@misofm/musicos`, `@misofm/partyos`, and `@misofm/platform` still
needs only one `Effect.provide(SuiClient.layer(client))` at its boundary.

## Use

```ts
import { Effect } from "effect";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SuiClient, getObjectContent } from "@misofm/effect";

const client = new SuiGrpcClient({ network: "testnet" });

const program = Effect.gen(function* () {
  const object = yield* getObjectContent("0x...");
  return object.type;
}).pipe(
  // `ObjectNotFoundError` is a tagged failure, not a bare throw — recover
  // from it without inspecting a message.
  Effect.catchTag("ObjectNotFoundError", (error) =>
    Effect.succeed(`missing: ${error.objectId}`),
  ),
);

const type = await Effect.runPromise(
  program.pipe(Effect.provide(SuiClient.layer(client))),
);
```

`getObjectContent`, `getObjectsContent`, `getOptionalObjectContent`, `listDynamicFields`,
and `decodeBcs` all require the `SuiClient` service; `signAndExecute` and `execThunks`
additionally need a `Signer`. Provide `SuiClient.layer(client)` once at the edge of your
program — every primitive composed from these requires the service only once in `R`.

## Errors

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

## License

Apache-2.0
