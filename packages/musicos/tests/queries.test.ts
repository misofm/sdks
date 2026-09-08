// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The exported query helpers that are pure (no network): type-param extraction
// and missing-object detection.

import { test, expect } from "bun:test";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import {
  getExtensionField,
  getReleaseDspLink,
  getReleaseRegistryById,
  getTrackDspLinks,
  extractTypeParam,
  extractTypeParams2,
  getCompositionAddressByShareType,
  getRecordingByShareType,
  isNotFound,
} from "../src/queries.ts";
import { CompositionPublishedEvent } from "../src/contracts/musicos/composition.ts";
import { ReleaseRegistry } from "../src/contracts/musicos/release.ts";
import { Recording } from "../src/contracts/musicos/recording.ts";

const PKG = "0x" + "cd".repeat(32);

// ── extractTypeParam / extractTypeParams2 ─────────────────────────────────────

test("extractTypeParam pulls the single type parameter", () => {
  expect(extractTypeParam(`${PKG}::composition::Composition<${PKG}::share::Share>`)).toBe(`${PKG}::share::Share`);
  expect(() => extractTypeParam(`${PKG}::release::Release`)).toThrow(/Could not extract/);
});

test("extractTypeParams2 splits two top-level parameters, respecting nesting", () => {
  const [a, b] = extractTypeParams2(`${PKG}::recording::Recording<${PKG}::r::R, ${PKG}::c::C>`);
  expect(a).toBe(`${PKG}::r::R`);
  expect(b).toBe(`${PKG}::c::C`);

  // A nested generic in the first slot must not split at its inner comma.
  const [x, y] = extractTypeParams2(`${PKG}::t::T<${PKG}::w::W<${PKG}::a::A, ${PKG}::b::B>, ${PKG}::c::C>`);
  expect(x).toBe(`${PKG}::w::W<${PKG}::a::A, ${PKG}::b::B>`);
  expect(y).toBe(`${PKG}::c::C`);

  expect(() => extractTypeParams2(`${PKG}::composition::Composition<${PKG}::share::Share>`)).toThrow(
    /Expected two type parameters/,
  );
});

// ── isNotFound ────────────────────────────────────────────────────────────────

test("isNotFound matches structured ObjectError codes from the JSON-RPC/GraphQL clients", () => {
  const withCode = (code: string) => Object.assign(new Error("boom"), { code });
  expect(isNotFound(withCode("notExists"))).toBe(true);
  expect(isNotFound(withCode("deleted"))).toBe(true);
  expect(isNotFound(withCode("dynamicFieldNotFound"))).toBe(true);
  expect(isNotFound(withCode("notFound"))).toBe(true);
  expect(isNotFound(withCode("displayError"))).toBe(false);
});

test("isNotFound matches the missing-object message shapes of each transport", () => {
  expect(isNotFound(new Error(`Object ${PKG} does not exist`))).toBe(true); // JSON-RPC
  expect(isNotFound(new Error(`Object ${PKG} not found`))).toBe(true); // GraphQL / gRPC
  expect(isNotFound(new Error(`Object ${PKG} has been deleted`))).toBe(true); // JSON-RPC
  expect(isNotFound(new Error(`Dynamic field not found for object ${PKG}`))).toBe(true); // JSON-RPC
  expect(isNotFound(new Error(`No object found for id ${PKG}`))).toBe(true); // codegen MoveStruct.get
});

test("isNotFound does NOT match transport/protocol errors", () => {
  expect(isNotFound(new Error("Method not found"))).toBe(false); // JSON-RPC -32601
  expect(isNotFound(new Error("peer not found"))).toBe(false);
  expect(isNotFound(new Error("route not found"))).toBe(false);
  expect(isNotFound(new Error("fetch failed"))).toBe(false);
  expect(isNotFound("not found")).toBe(false); // bare phrase, no object context
});

// ── GraphQL discovery ────────────────────────────────────────────────────────

test("getCompositionAddressByShareType queries the fully-qualified composition type", async () => {
  const calls: unknown[] = [];
  const graphqlClient = {
    query: async (input: unknown) => {
      calls.push(input);
      return { data: { objects: { nodes: [{ address: "0xcomposition" }] } } };
    },
  } as unknown as SuiGraphQLClient;

  const address = await getCompositionAddressByShareType(graphqlClient, `${PKG}::share::CompositionShare`, PKG);

  expect(address).toBe("0xcomposition");
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    variables: {
      type: `${PKG}::composition::Composition<${PKG}::share::CompositionShare>`,
    },
  });
});

test("getCompositionAddressByShareType returns null when no composition matches", async () => {
  const graphqlClient = {
    query: async () => ({ data: { objects: { nodes: [] } } }),
  } as unknown as SuiGraphQLClient;

  await expect(getCompositionAddressByShareType(graphqlClient, `${PKG}::share::Missing`, PKG)).resolves.toBeNull();
});

test("getRecordingByShareType follows GraphQL pages before loading the matching object", async () => {
  const targetShare = `${PKG}::share::RecordingShare`;
  const otherShare = `${PKG}::share::OtherShare`;
  const compositionShare = `${PKG}::share::CompositionShare`;
  const matchingId = "0x" + "22".repeat(32);
  const calls: unknown[] = [];
  const graphqlClient = {
    query: async (input: { variables?: { cursor?: string | null } }) => {
      calls.push(input);
      if (!input.variables?.cursor) {
        return {
          data: {
            objects: {
              pageInfo: { hasNextPage: true, endCursor: "page-2" },
              nodes: [{
                address: "0xother",
                asMoveObject: { contents: { type: { repr: `${PKG}::recording::Recording<${otherShare}, ${compositionShare}>` } } },
              }],
            },
          },
        };
      }
      return {
        data: {
          objects: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [{
              address: matchingId,
              asMoveObject: { contents: { type: { repr: `${PKG}::recording::Recording<${targetShare}, ${compositionShare}>` } } },
            }],
          },
        },
      };
    },
  } as unknown as SuiGraphQLClient;
  const coreClient = {
    core: {
      getObject: async ({ objectId }: { objectId: string }) => ({
        object: {
          content: Recording.serialize({
            id: objectId,
            state: { Initialized: true },
            composition_id: PKG,
          }).toBytes(),
        },
      }),
    },
  } as unknown as ClientWithCoreApi;

  await expect(getRecordingByShareType(coreClient, graphqlClient, targetShare, PKG)).resolves.toMatchObject({
    id: matchingId,
    compositionId: PKG,
  });
  expect(calls).toHaveLength(2);
  expect(calls[1]).toMatchObject({ variables: { cursor: "page-2" } });
});

test("getExtensionField reads a fieldless ExtensionKey and returns null only for absence", async () => {
  const calls: unknown[] = [];
  const value = CompositionPublishedEvent.serialize({
    composition_id: PKG,
  }).toBytes();
  const client = {
    core: {
      getDynamicField: async (request: unknown) => {
        calls.push(request);
        return { dynamicField: { value: { bcs: value } } };
      },
    },
  } as unknown as ClientWithCoreApi;

  await expect(
    getExtensionField(client, PKG, {
      packageId: PKG,
      module: "some_extension",
      codec: CompositionPublishedEvent,
    }),
  ).resolves.toEqual({ composition_id: PKG });
  expect(calls).toEqual([
    {
      parentId: PKG,
      name: {
        type: `${PKG}::some_extension::ExtensionKey`,
        bcs: new Uint8Array([0]),
      },
    },
  ]);

  const missing = {
    core: {
      getDynamicField: async () => {
        throw Object.assign(new Error("Dynamic field not found for object"), {
          code: "dynamicFieldNotFound",
        });
      },
    },
  } as unknown as ClientWithCoreApi;
  await expect(
    getExtensionField(missing, PKG, {
      packageId: PKG,
      module: "some_extension",
      codec: CompositionPublishedEvent,
    }),
  ).resolves.toBeNull();
});

test("DSP fields use their platform-keyed dynamic-field names", async () => {
  const calls: unknown[] = [];
  const value = CompositionPublishedEvent.serialize({
    composition_id: PKG,
  }).toBytes();
  const client = {
    core: {
      getDynamicField: async (request: unknown) => {
        calls.push(request);
        return { dynamicField: { value: { bcs: value } } };
      },
    },
  } as unknown as ClientWithCoreApi;

  await getReleaseDspLink(client, PKG, {
    packageId: PKG,
    platform: 7,
    codec: CompositionPublishedEvent,
  });
  await getTrackDspLinks(client, PKG, {
    packageId: PKG,
    platform: 7,
    codec: CompositionPublishedEvent,
  });

  expect(calls).toEqual([
    {
      parentId: PKG,
      name: {
        type: `${PKG}::release_dsp_link::ReleaseLinkKey`,
        bcs: new Uint8Array([7]),
      },
    },
    {
      parentId: PKG,
      name: {
        type: `${PKG}::release_dsp_link::TrackLinksKey`,
        bcs: new Uint8Array([7]),
      },
    },
  ]);
  await expect(
    getReleaseDspLink(client, PKG, {
      packageId: PKG,
      platform: 256,
      codec: CompositionPublishedEvent,
    }),
  ).rejects.toThrow(/u8/);
});

test("core registry parsing is deterministic", async () => {
  const client = {
    core: {
      getObject: async () => ({
        object: { content: ReleaseRegistry.serialize({ id: PKG }).toBytes() },
      }),
    },
  } as unknown as ClientWithCoreApi;
  await expect(getReleaseRegistryById(client, PKG)).resolves.toEqual({ id: PKG });
});
