// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The shared read primitives every `@misofm/*` package's queries are built
// from. Every primitive requires the `SuiClient` service instead of taking a
// client parameter, and every not-found path is classified into a typed
// `ObjectNotFoundError` rather than a bare thrown error — see `isNotFound`
// below, ported from the transport-sniffing heuristic each package used to
// hand-roll.

import { Effect, Option, Schema, Stream } from "effect";
import type { SuiClientTypes } from "@mysten/sui/client";

import { BcsDecodeError, ObjectNotFoundError, ObjectTypeMismatchError, SuiRpcError } from "./errors.ts";
import { SuiClient } from "./sui-client.ts";

/**
 * One object's BCS content, on-chain type, and version.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. `sui.getObject` returns a `SuiObject<Uint8Array>`
 * instead (`version` is `bigint`) — see the migration table in this package's README.
 */
export interface ObjectContent {
  readonly content: Uint8Array;
  readonly type: string;
  readonly version: string;
}

/**
 * A dynamic field entry as returned by `listDynamicFields` (name + value type, not the decoded value).
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `sui.streamDynamicFields` instead — see the
 * migration table in this package's README.
 */
export type DynamicField = SuiClientTypes.DynamicFieldEntry;

/**
 * Any generated BCS codec with a `parse` method — the shape every `src/contracts/**` struct exports.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect and this type is dropped. `SuiSchema.bcs` takes a
 * `@mysten/bcs` `BcsType` instead — see the migration table in this package's README.
 */
export interface BcsParser<T> {
  parse(bytes: Uint8Array): T;
}

/**
 * Identifies the object/type a `decodeBcs` failure is reported against.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. This is folded into `SuiSchema.decode(..., { objectId,
 * expectedType })` instead — see the migration table in this package's README.
 */
export interface DecodeBcsContext {
  /** Fully-qualified Move type (or domain type name) being decoded. */
  readonly type: string;
  /** Object id being decoded, when decoding a specific object's content. */
  readonly objectId?: string;
}

/**
 * Fetches one object's BCS content by id; fails with `ObjectNotFoundError` if it does not exist.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `sui.getObject(id)` instead — with no schema,
 * `content` is the raw bytes — see the migration table in this package's README.
 */
export const getObjectContent = Effect.fn("getObjectContent")(function* (
  objectId: string,
): Effect.fn.Return<ObjectContent, ObjectNotFoundError | SuiRpcError, SuiClient> {
  const client = yield* SuiClient;
  const { object } = yield* Effect.tryPromise({
    try: (signal) => client.core.getObject({ objectId, include: { content: true }, signal }),
    catch: (cause) => classifyObjectError(objectId, "getObject", cause),
  });
  if (!object.content) {
    return yield* new ObjectNotFoundError({ objectId });
  }
  return { content: object.content, type: object.type, version: object.version };
});

/**
 * Like {@link getObjectContent}, but a missing object resolves to `Option.none()` instead of failing.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `sui.getObjectOption` instead — see the
 * migration table in this package's README.
 */
export const getOptionalObjectContent = Effect.fn("getOptionalObjectContent")(function* (
  objectId: string,
): Effect.fn.Return<Option.Option<ObjectContent>, SuiRpcError, SuiClient> {
  return yield* getObjectContent(objectId).pipe(
    Effect.map(Option.some),
    Effect.catchTag("ObjectNotFoundError", () => Effect.succeed(Option.none())),
  );
});

/**
 * Fetches many objects' BCS content in one Core request; ids that are missing or errored are omitted from the map.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `sui.getObjects` instead — chunked,
 * integrity-checked, and returning a per-item `Result` instead of silently dropping errored ids — see the
 * migration table in this package's README.
 */
export const getObjectsContent = Effect.fn("getObjectsContent")(function* (
  objectIds: readonly string[],
): Effect.fn.Return<ReadonlyMap<string, { content: Uint8Array; type: string }>, SuiRpcError, SuiClient> {
  const out = new Map<string, { content: Uint8Array; type: string }>();
  if (objectIds.length === 0) return out;

  const client = yield* SuiClient;
  const { objects } = yield* Effect.tryPromise({
    try: (signal) => client.core.getObjects({ objectIds: [...objectIds], include: { content: true }, signal }),
    catch: (cause) => new SuiRpcError({ operation: "getObjects", cause }),
  });
  for (const obj of objects) {
    if (obj instanceof Error || !obj.content) continue;
    out.set(obj.objectId, { content: obj.content, type: obj.type });
  }
  return out;
});

/**
 * Pages every dynamic field under `parentId` through `client.core.listDynamicFields`, following the cursor.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `sui.streamDynamicFields` instead — see the
 * migration table in this package's README.
 */
export function listDynamicFields(parentId: string): Stream.Stream<DynamicField, SuiRpcError, SuiClient> {
  return Stream.paginate<string | null, DynamicField, SuiRpcError, SuiClient>(null, (cursor) =>
    Effect.gen(function* () {
      const client = yield* SuiClient;
      const page = yield* Effect.tryPromise({
        try: (signal) => client.core.listDynamicFields({ parentId, cursor, signal }),
        catch: (cause) => new SuiRpcError({ operation: "listDynamicFields", cause }),
      });
      const next = page.hasNextPage ? Option.some(page.cursor) : Option.none();
      return [page.dynamicFields, next] as const;
    }),
  );
}

/**
 * Runs a generated BCS codec's `.parse`, then decodes the result into a domain `Schema` type; both failure paths become `BcsDecodeError`.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use
 * `SuiSchema.decode(SuiSchema.bcs(Struct, type).pipe(Schema.decodeTo(Class, ...)), bytes, { objectId })`, or
 * `sui.getObject(id, { schema })`, instead — see the migration table in this package's README.
 */
export const decodeBcs = Effect.fn("decodeBcs")(function* <A>(
  codec: BcsParser<unknown>,
  schema: Schema.Codec<A, any, never, never>,
  bytes: Uint8Array,
  context: DecodeBcsContext,
): Effect.fn.Return<A, BcsDecodeError> {
  const parsed = yield* Effect.try({
    try: () => codec.parse(bytes),
    catch: (cause) => new BcsDecodeError({ type: context.type, objectId: context.objectId, cause }),
  });
  return yield* Schema.decodeUnknownEffect(schema)(parsed).pipe(
    Effect.mapError((cause) => new BcsDecodeError({ type: context.type, objectId: context.objectId, cause })),
  );
});

/**
 * Fails with `ObjectTypeMismatchError` unless `actual` is exactly `expected`.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. This is folded into the bridge's tag check
 * (`sui.getObject(id, { schema })`, `SuiSchema.decode({ expectedType })`) instead — see the migration table in
 * this package's README.
 */
export const assertObjectType = Effect.fn("assertObjectType")(function* (
  objectId: string,
  actual: string,
  expected: string,
): Effect.fn.Return<void, ObjectTypeMismatchError> {
  if (actual !== expected) {
    return yield* new ObjectTypeMismatchError({ objectId, expected, actual });
  }
});

// ── Private ──────────────────────────────────────────────────────────────────

/** Classifies a Core API rejection: a missing object becomes `ObjectNotFoundError`, anything else `SuiRpcError`. */
function classifyObjectError(objectId: string, operation: string, cause: unknown): ObjectNotFoundError | SuiRpcError {
  return isNotFound(cause) ? new ObjectNotFoundError({ objectId }) : new SuiRpcError({ operation, cause });
}

/**
 * True when `e` is a "this object does not exist" error from any of the Sui
 * client transports. Matches, in order of preference:
 *
 *   1. Structured `ObjectError.code` values thrown by the JSON-RPC core client
 *      (`notExists`, `deleted`, `dynamicFieldNotFound`) and the GraphQL core
 *      client (`notFound`). The class itself is not exported by `@mysten/sui`,
 *      so we duck-type on `code`.
 *   2. The message shapes those clients (and the gRPC core client, which wraps
 *      the server's per-object status message in a plain `Error`) produce:
 *      "Object 0x… does not exist" / "Object 0x… not found" / "Object 0x… has
 *      been deleted" / "Dynamic field not found for object 0x…" / "No object
 *      found for id 0x…".
 *
 * Transport/protocol errors must NOT match: every message pattern requires
 * object-ish context ("object" / "dynamic field"), so e.g. a JSON-RPC
 * "Method not found" or a gRPC "peer not found" is never treated as a missing
 * object and is reported as a `SuiRpcError` instead.
 */
function isNotFound(e: unknown): boolean {
  if (typeof e === "object" && e !== null && "code" in e) {
    const code = (e as { code: unknown }).code;
    if (code === "notExists" || code === "deleted" || code === "dynamicFieldNotFound" || code === "notFound") {
      return true;
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  return (
    /\bobject\b[\s\S]*\b(?:not\s?found|does not exist|has been deleted)\b/i.test(msg) ||
    /\bdynamic field\b[\s\S]*\bnot\s?found\b/i.test(msg) ||
    /\bno object\b/i.test(msg)
  );
}
