// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The exported query helpers that are pure (no network): type-param extraction.
// Effect-requiring reads are exercised against a fake `ClientWithCoreApi`,
// providing `SuiClient.layer(...)` at the boundary.

import { test, expect } from "bun:test";
import { Effect, Option } from "effect";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { SuiClient, SuiGraphQL } from "@misofm/effect";
import {
  getExtensionField,
  getReleaseDspLink,
  getReleaseRegistryById,
  getTrackDspLinks,
  extractTypeParam,
  extractTypeParams2,
  getCompositionAddressByShareType,
  getRecordingByShareType,
} from "../src/queries.ts";
import { CompositionPublishedEvent } from "../src/contracts/musicos/composition.ts";
import { Recording } from "../src/contracts/musicos/recording.ts";
import { ReleaseRegistry as ReleaseRegistryBcs } from "../src/contracts/musicos/release.ts";

const PKG = "0x" + "cd".repeat(32);

function fakeCoreClient(core: Record<string, unknown>): ClientWithCoreApi {
  return { core } as unknown as ClientWithCoreApi;
}

function runWithCore<A, E>(effect: Effect.Effect<A, E, SuiClient>, client: ClientWithCoreApi): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(SuiClient.layer(client))));
}

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

// ── GraphQL discovery ────────────────────────────────────────────────────────

test("getCompositionAddressByShareType queries the fully-qualified composition type", async () => {
  const calls: unknown[] = [];
  const graphqlClient = {
    query: async (input: unknown) => {
      calls.push(input);
      return { data: { objects: { nodes: [{ address: "0xcomposition" }] } } };
    },
  } as unknown as SuiGraphQLClient;

  const address = await Effect.runPromise(
    getCompositionAddressByShareType(`${PKG}::share::CompositionShare`, PKG).pipe(
      Effect.provide(SuiGraphQL.layer(graphqlClient)),
    ),
  );

  expect(Option.getOrNull(address)).toBe("0xcomposition");
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    variables: {
      type: `${PKG}::composition::Composition<${PKG}::share::CompositionShare>`,
    },
  });
});

test("getCompositionAddressByShareType resolves to None when no composition matches", async () => {
  const graphqlClient = {
    query: async () => ({ data: { objects: { nodes: [] } } }),
  } as unknown as SuiGraphQLClient;

  const address = await Effect.runPromise(
    getCompositionAddressByShareType(`${PKG}::share::Missing`, PKG).pipe(Effect.provide(SuiGraphQL.layer(graphqlClient))),
  );
  expect(Option.isNone(address)).toBe(true);
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
  const coreClient = fakeCoreClient({
    getObject: async ({ objectId }: { objectId: string }) => ({
      object: {
        content: Recording.serialize({
          id: objectId,
          state: { Initialized: true },
          composition_id: PKG,
        }).toBytes(),
      },
    }),
  });

  const recording = await Effect.runPromise(
    getRecordingByShareType(targetShare, PKG).pipe(
      Effect.provide(SuiGraphQL.layer(graphqlClient)),
      Effect.provide(SuiClient.layer(coreClient)),
    ),
  );

  expect(recording).toMatchObject({ id: matchingId, compositionId: PKG });
  expect(calls).toHaveLength(2);
  expect(calls[1]).toMatchObject({ variables: { cursor: "page-2" } });
});

test("getExtensionField reads a fieldless ExtensionKey and resolves to None only for absence", async () => {
  const calls: unknown[] = [];
  const value = CompositionPublishedEvent.serialize({
    composition_id: PKG,
  }).toBytes();
  const client = fakeCoreClient({
    getDynamicField: async (request: unknown) => {
      calls.push(request);
      return { dynamicField: { value: { bcs: value } } };
    },
  });

  const result = await runWithCore(
    getExtensionField(PKG, {
      packageId: PKG,
      module: "some_extension",
      codec: CompositionPublishedEvent,
    }),
    client,
  );
  expect(Option.getOrThrow(result)).toEqual({ composition_id: PKG });
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    parentId: PKG,
    name: {
      type: `${PKG}::some_extension::ExtensionKey`,
      bcs: new Uint8Array([0]),
    },
  });

  const missing = fakeCoreClient({
    getDynamicField: async () => {
      throw Object.assign(new Error("Dynamic field not found for object"), {
        code: "dynamicFieldNotFound",
      });
    },
  });
  const missingResult = await runWithCore(
    getExtensionField(PKG, {
      packageId: PKG,
      module: "some_extension",
      codec: CompositionPublishedEvent,
    }),
    missing,
  );
  expect(Option.isNone(missingResult)).toBe(true);
});

test("DSP fields use their platform-keyed dynamic-field names", async () => {
  const calls: unknown[] = [];
  const value = CompositionPublishedEvent.serialize({
    composition_id: PKG,
  }).toBytes();
  const client = fakeCoreClient({
    getDynamicField: async (request: unknown) => {
      calls.push(request);
      return { dynamicField: { value: { bcs: value } } };
    },
  });

  await runWithCore(
    getReleaseDspLink(PKG, {
      packageId: PKG,
      platform: 7,
      codec: CompositionPublishedEvent,
    }),
    client,
  );
  await runWithCore(
    getTrackDspLinks(PKG, {
      packageId: PKG,
      platform: 7,
      codec: CompositionPublishedEvent,
    }),
    client,
  );

  expect(calls).toHaveLength(2);
  expect(calls[0]).toMatchObject({
    parentId: PKG,
    name: {
      type: `${PKG}::release_dsp_link::ReleaseLinkKey`,
      bcs: new Uint8Array([7]),
    },
  });
  expect(calls[1]).toMatchObject({
    parentId: PKG,
    name: {
      type: `${PKG}::release_dsp_link::TrackLinksKey`,
      bcs: new Uint8Array([7]),
    },
  });

  let thrown: unknown;
  try {
    await runWithCore(
      getReleaseDspLink(PKG, {
        packageId: PKG,
        platform: 256,
        codec: CompositionPublishedEvent,
      }),
      client,
    );
  } catch (error) {
    thrown = error;
  }
  expect(String(thrown)).toMatch(/u8/);
});

test("core registry parsing is deterministic", async () => {
  const client = fakeCoreClient({
    getObject: async () => ({
      object: { content: ReleaseRegistryBcs.serialize({ id: PKG }).toBytes() },
    }),
  });
  const registry = await runWithCore(getReleaseRegistryById(PKG), client);
  expect(registry).toEqual({ id: PKG });
});
