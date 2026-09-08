// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from "bun:test";
import { Effect, Option, Schema, Stream } from "effect";
import type { ClientWithCoreApi, SuiClientTypes } from "@mysten/sui/client";

import {
  assertObjectType,
  decodeBcs,
  getObjectContent,
  getObjectsContent,
  getOptionalObjectContent,
  listDynamicFields,
} from "../src/reads.ts";
import { BcsDecodeError, ObjectNotFoundError, ObjectTypeMismatchError, SuiRpcError } from "../src/errors.ts";
import { SuiClient } from "../src/sui-client.ts";

/** Builds a fake `ClientWithCoreApi` exposing only the `core` methods a test needs. */
function fakeClient(core: Record<string, unknown>): ClientWithCoreApi {
  return { core } as unknown as ClientWithCoreApi;
}

/** Runs a `SuiClient`-requiring program against a fake client. */
function run<A, E>(effect: Effect.Effect<A, E, SuiClient>, client: ClientWithCoreApi): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(SuiClient.layer(client))));
}

function entry(fieldId: string): SuiClientTypes.DynamicFieldEntry {
  return {
    $kind: "DynamicField",
    fieldId,
    type: `0x1::field::Field<${fieldId}>`,
    name: { type: "0x1::field::Key", bcs: new Uint8Array() },
    valueType: "0x1::field::Value",
  };
}

// ── getObjectContent ─────────────────────────────────────────────────────────

test("getObjectContent returns content, type, and version on success", async () => {
  const client = fakeClient({
    getObject: async ({ objectId }: { objectId: string }) => ({
      object: { objectId, type: "0x1::foo::Bar", version: "3", content: new Uint8Array([1, 2, 3]) },
    }),
  });

  const result = await run(getObjectContent("0xabc"), client);

  expect(result).toEqual({ content: new Uint8Array([1, 2, 3]), type: "0x1::foo::Bar", version: "3" });
});

test("getObjectContent fails with ObjectNotFoundError when the Core API reports the object missing", async () => {
  const client = fakeClient({
    getObject: async () => {
      throw new Error("Object 0xabc does not exist");
    },
  });

  const err = await run(getObjectContent("0xabc").pipe(Effect.flip), client);

  expect(err).toBeInstanceOf(ObjectNotFoundError);
  expect(err).toMatchObject({ _tag: "ObjectNotFoundError", objectId: "0xabc" });
});

test("getObjectContent fails with SuiRpcError for a transport/protocol rejection", async () => {
  const client = fakeClient({
    getObject: async () => {
      throw new Error("Method not found");
    },
  });

  const err = await run(getObjectContent("0xabc").pipe(Effect.flip), client);

  expect(err).toBeInstanceOf(SuiRpcError);
  expect(err).toMatchObject({ _tag: "SuiRpcError", operation: "getObject" });
});

// ── getOptionalObjectContent ─────────────────────────────────────────────────

test("getOptionalObjectContent resolves to None when the object is missing", async () => {
  const client = fakeClient({
    getObject: async () => {
      throw Object.assign(new Error("boom"), { code: "notExists" });
    },
  });

  const result = await run(getOptionalObjectContent("0xabc"), client);

  expect(Option.isNone(result)).toBe(true);
});

test("getOptionalObjectContent resolves to Some when the object exists", async () => {
  const client = fakeClient({
    getObject: async ({ objectId }: { objectId: string }) => ({
      object: { objectId, type: "0x1::foo::Bar", version: "1", content: new Uint8Array([9]) },
    }),
  });

  const result = await run(getOptionalObjectContent("0xabc"), client);

  expect(Option.isSome(result)).toBe(true);
  expect(Option.getOrThrow(result).type).toBe("0x1::foo::Bar");
});

// ── getObjectsContent ────────────────────────────────────────────────────────

test("getObjectsContent omits ids that errored or have no content", async () => {
  const client = fakeClient({
    getObjects: async ({ objectIds }: { objectIds: string[] }) => ({
      objects: [
        { objectId: objectIds[0], type: "T1", content: new Uint8Array([1]) },
        new Error("missing"),
        { objectId: objectIds[2], type: "T3", content: undefined },
      ],
    }),
  });

  const result = await run(getObjectsContent(["0x1", "0x2", "0x3"]), client);

  expect(result.size).toBe(1);
  expect(result.get("0x1")).toEqual({ content: new Uint8Array([1]), type: "T1" });
});

test("getObjectsContent short-circuits with an empty map for an empty id list", async () => {
  const client = fakeClient({
    getObjects: async () => {
      throw new Error("should not be called");
    },
  });

  const result = await run(getObjectsContent([]), client);

  expect(result.size).toBe(0);
});

// ── listDynamicFields ────────────────────────────────────────────────────────

test("listDynamicFields pages through the cursor until hasNextPage is false", async () => {
  const pages = [
    { dynamicFields: [entry("a")], hasNextPage: true, cursor: "c1" },
    { dynamicFields: [entry("b")], hasNextPage: true, cursor: "c2" },
    { dynamicFields: [entry("c")], hasNextPage: false, cursor: null },
  ];
  let call = 0;
  const seenCursors: (string | null)[] = [];
  const client = fakeClient({
    listDynamicFields: async ({ cursor }: { cursor: string | null }) => {
      seenCursors.push(cursor);
      return pages[call++]!;
    },
  });

  const result = await Effect.runPromise(
    Stream.runCollect(listDynamicFields("0xparent")).pipe(Effect.provide(SuiClient.layer(client))),
  );

  expect(result.map((f) => f.fieldId)).toEqual(["a", "b", "c"]);
  expect(seenCursors).toEqual([null, "c1", "c2"]);
});

// ── decodeBcs ────────────────────────────────────────────────────────────────

class Thing extends Schema.Class<Thing>("Thing")({ id: Schema.Number }) {}

test("decodeBcs runs the codec then decodes into the schema type", async () => {
  const codec = { parse: (bytes: Uint8Array) => ({ id: bytes[0] }) };

  const result = await Effect.runPromise(decodeBcs(codec, Thing, new Uint8Array([7]), { type: "Thing" }));

  expect(result).toEqual(new Thing({ id: 7 }));
});

test("decodeBcs fails with BcsDecodeError when the codec's parse throws", async () => {
  const codec = {
    parse: () => {
      throw new Error("bad bytes");
    },
  };

  const err = await Effect.runPromise(
    decodeBcs(codec, Thing, new Uint8Array(), { type: "Thing", objectId: "0x1" }).pipe(Effect.flip),
  );

  expect(err).toBeInstanceOf(BcsDecodeError);
  expect(err).toMatchObject({ _tag: "BcsDecodeError", type: "Thing", objectId: "0x1" });
});

test("decodeBcs fails with BcsDecodeError when the parsed value fails schema validation", async () => {
  const codec = { parse: () => ({ id: "not-a-number" }) };

  const err = await Effect.runPromise(decodeBcs(codec, Thing, new Uint8Array(), { type: "Thing" }).pipe(Effect.flip));

  expect(err).toBeInstanceOf(BcsDecodeError);
  expect(err._tag).toBe("BcsDecodeError");
});

// ── assertObjectType ─────────────────────────────────────────────────────────

test("assertObjectType fails with ObjectTypeMismatchError on a mismatch", async () => {
  const err = await Effect.runPromise(assertObjectType("0x1", "TypeA", "TypeB").pipe(Effect.flip));

  expect(err).toBeInstanceOf(ObjectTypeMismatchError);
  expect(err).toMatchObject({ objectId: "0x1", actual: "TypeA", expected: "TypeB" });
});

test("assertObjectType succeeds when the actual type matches", async () => {
  await Effect.runPromise(assertObjectType("0x1", "TypeA", "TypeA"));
});
