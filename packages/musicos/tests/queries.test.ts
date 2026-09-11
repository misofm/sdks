// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The three GraphQL type-discovery reads, against a stubbed `SuiGraphQL`
// client (no network) composed with the real `Sui` harness for the
// follow-up Core read `getCompositionByShareType` / `getRecordingByShareType`
// make.

import { describe, expect, test } from "bun:test";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { Effect, Layer } from "effect";
import { GraphQLUnavailable, SuiGraphQL } from "sui-effect";
import { layerTest } from "sui-effect/testing";
import * as composition from "../src/contracts/musicos/composition.ts";
import * as recording from "../src/contracts/musicos/recording.ts";
import { MusicosWorkNotFound } from "../src/errors.ts";
import { getCompositionByShareType, getRecordingByShareType, getWorkAddressesByShareTypes } from "../src/queries.ts";

const padded = (suffix: string) => `0x${"0".repeat(64 - suffix.length)}${suffix}`;
const PACKAGE_ID = padded("7");
const CS = `${padded("c5")}::share::CompositionShare`;
const RS = `${padded("e5")}::share::RecordingShare`;
const COMPOSITION_ID = padded("c01");
const RECORDING_ID = padded("e01");

/** A stubbed `SuiGraphQLClient`: only `.query` is called by this module. */
function stubGraphQL(respond: (variables: Record<string, unknown>) => { data?: unknown; errors?: ReadonlyArray<{ message: string }> }): SuiGraphQLClient {
  return {
    query: (options: { variables?: Record<string, unknown> }) => Promise.resolve(respond(options.variables ?? {})),
  } as unknown as SuiGraphQLClient;
}

/** Always rejects with `GraphQLUnavailable`, the way `SuiGraphQL.layerUnavailable` does. */
const unavailableGraphQL: SuiGraphQLClient = {
  query: () => Promise.reject(new GraphQLUnavailable({ method: "query", reason: "no endpoint configured" })),
} as unknown as SuiGraphQLClient;

const script = {
  objects: [
    {
      objectId: COMPOSITION_ID,
      type: `${PACKAGE_ID}::composition::Composition<${CS}>`,
      version: 1n,
      content: composition.Composition.serialize({
        id: COMPOSITION_ID,
        state: { Initialized: true },
        title: "Found By Share Type",
        royalty_rate: [1000],
      }).toBytes(),
    },
    {
      objectId: RECORDING_ID,
      type: `${PACKAGE_ID}::recording::Recording<${RS}, ${CS}>`,
      version: 1n,
      content: recording.Recording.serialize({
        id: RECORDING_ID,
        state: { Initialized: true },
        composition_id: COMPOSITION_ID,
      }).toBytes(),
    },
  ],
};

const provide = <A, E>(effect: Effect.Effect<A, E, any>, client: SuiGraphQLClient) =>
  Effect.runPromise(
    Effect.provide(effect, Layer.mergeAll(layerTest(script), SuiGraphQL.layer(client)), { local: true }) as Effect.Effect<A, E>,
  );

describe("getCompositionByShareType", () => {
  test("happy path: GraphQL discovery + the follow-up Sui read", async () => {
    const client = stubGraphQL(() => ({ data: { objects: { nodes: [{ address: COMPOSITION_ID }] } } }));
    const result = await provide(getCompositionByShareType(CS, PACKAGE_ID), client);
    expect(result.title).toBe("Found By Share Type");
  });

  test("musicos/WorkNotFound when no composition carries the share type", async () => {
    const client = stubGraphQL(() => ({ data: { objects: { nodes: [] } } }));
    const error = await provide(Effect.flip(getCompositionByShareType(CS, PACKAGE_ID)), client);
    expect(error).toBeInstanceOf(MusicosWorkNotFound);
    expect((error as MusicosWorkNotFound).kind).toBe("composition");
    expect((error as MusicosWorkNotFound).outcome).toBe("not_applied");
  });

  test("GraphQLUnavailable lets through under layerUnavailable-style rejection", async () => {
    const error = await provide(Effect.flip(getCompositionByShareType(CS, PACKAGE_ID)), unavailableGraphQL);
    expect(error).toBeInstanceOf(GraphQLUnavailable);
  });
});

describe("getRecordingByShareType", () => {
  test("happy path: filters the bare Recording scan by the first type parameter", async () => {
    const client = stubGraphQL(() => ({
      data: {
        objects: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [{ address: RECORDING_ID, asMoveObject: { contents: { type: { repr: `${PACKAGE_ID}::recording::Recording<${RS}, ${CS}>` } } } }],
        },
      },
    }));
    const result = await provide(getRecordingByShareType(RS, PACKAGE_ID), client);
    expect(result.compositionId).toBe(COMPOSITION_ID);
  });

  test("a malformed repr (one type parameter) is skipped, not a defect, and search continues", async () => {
    const client = stubGraphQL(() => ({
      data: {
        objects: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            // Only one top-level type parameter: `extractTypeParams2` cannot
            // split it. Must be skipped, not thrown, and not crash the read.
            { address: padded("bad1"), asMoveObject: { contents: { type: { repr: `${PACKAGE_ID}::recording::Recording<${RS}>` } } } },
            { address: RECORDING_ID, asMoveObject: { contents: { type: { repr: `${PACKAGE_ID}::recording::Recording<${RS}, ${CS}>` } } } },
          ],
        },
      },
    }));
    const result = await provide(getRecordingByShareType(RS, PACKAGE_ID), client);
    expect(result.compositionId).toBe(COMPOSITION_ID);
  });

  test("musicos/WorkNotFound when no recording carries the share type", async () => {
    const client = stubGraphQL(() => ({ data: { objects: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } }));
    const error = await provide(Effect.flip(getRecordingByShareType(RS, PACKAGE_ID)), client);
    expect(error).toBeInstanceOf(MusicosWorkNotFound);
    expect((error as MusicosWorkNotFound).kind).toBe("recording");
  });
});

describe("getWorkAddressesByShareTypes", () => {
  test("happy path: resolves both compositions and recordings in one request", async () => {
    const client = stubGraphQL((variables) => ({
      data: {
        composition0: { nodes: [{ address: COMPOSITION_ID }] },
        recordings:
          "recordingType" in variables
            ? {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ address: RECORDING_ID, asMoveObject: { contents: { type: { repr: `${PACKAGE_ID}::recording::Recording<${RS}, ${CS}>` } } } }],
              }
            : null,
      },
    }));
    const result = await provide(
      getWorkAddressesByShareTypes({ compositions: [CS], recordings: [RS] }, PACKAGE_ID),
      client,
    );
    expect(result.compositions[CS]).toBe(COMPOSITION_ID);
    expect(result.recordings[RS]).toBe(RECORDING_ID);
  });

  test("GraphQLUnavailable lets through", async () => {
    const error = await provide(
      Effect.flip(getWorkAddressesByShareTypes({ compositions: [CS], recordings: [] }, PACKAGE_ID)),
      unavailableGraphQL,
    );
    expect(error).toBeInstanceOf(GraphQLUnavailable);
  });

  test("a malformed recording repr is skipped rather than thrown", async () => {
    const client = stubGraphQL(() => ({
      data: {
        recordings: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [{ address: padded("bad2"), asMoveObject: { contents: { type: { repr: `${PACKAGE_ID}::recording::Recording<${RS}>` } } } }],
        },
      },
    }));
    const result = await provide(getWorkAddressesByShareTypes({ compositions: [], recordings: [RS] }, PACKAGE_ID), client);
    expect(result.recordings[RS]).toBeUndefined();
  });
});
