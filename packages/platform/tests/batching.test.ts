// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { contracts } from "@misofm/musicos";
import { getTrackCreditsByRecordingIds } from "../src/catalog.ts";
import { getReleaseCoversByIds } from "../src/cover.ts";
import {
  getCompositionCreditsByIds,
  getRecordingCreditsByIds,
  getReleaseCreditsByIds,
} from "../src/credits.ts";
import { getListing, getPressing, getSale } from "../src/pressing.ts";
import { getReleaseResources } from "../src/read/catalog.ts";
import type { MisoClient } from "../src/read/client.ts";

function missingClient(calls: unknown[][]): ClientWithCoreApi {
  return {
    core: {
      getObject: async ({ objectId }: { objectId: string }) => {
        calls.push([objectId]);
        return { object: undefined };
      },
      getObjects: async ({ objectIds }: { objectIds: string[] }) => {
        calls.push(objectIds);
        return {
          objects: objectIds.map(
            (objectId) => new Error(`Object ${objectId} not found`),
          ),
        };
      },
    },
  } as unknown as ClientWithCoreApi;
}

describe("bulk Core reads", () => {
  test("covers for many releases use one request", async () => {
    const calls: unknown[][] = [];
    const result = await getReleaseCoversByIds(
      missingClient(calls),
      ["0x1", "0x2"],
      "0xa",
    );
    expect(result).toEqual({});
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(2);
  });

  test("each credit kind batches current fields", async () => {
    for (const read of [
      getCompositionCreditsByIds,
      getRecordingCreditsByIds,
      getReleaseCreditsByIds,
    ]) {
      const calls: unknown[][] = [];
      expect(
        await read(missingClient(calls), ["0x1", "0x2", "0x1"], "0xa"),
      ).toEqual({});
      expect(calls).toHaveLength(1);
    }
  });

  test("pressings, listings, and a two-object sale never fan out", async () => {
    const pressingCalls: unknown[][] = [];
    expect(await getPressing(missingClient(pressingCalls), "0x1", "0xa")).toBeNull();
    expect(pressingCalls).toHaveLength(1);

    const listingCalls: unknown[][] = [];
    expect(await getListing(missingClient(listingCalls), "0x2", "0xa")).toBeNull();
    expect(listingCalls).toHaveLength(1);

    const saleCalls: unknown[][] = [];
    expect(
      await getSale(missingClient(saleCalls), {
        releaseId: "0x1",
        edition: 1,
        currencyType: "0x2::sui::SUI",
        recordPackageId: "0xa",
        recordShopPackageId: "0xb",
      }),
    ).toEqual({ pressing: null, listing: null });
    expect(saleCalls).toHaveLength(1);
    expect(saleCalls[0]).toHaveLength(2);
  });
});

test("track credits stay at three Core batches plus one GraphQL query as track count grows", async () => {
  const recordingIds = ["0x11", "0x12", "0x13"];
  const coreCalls: Array<{
    objectIds: string[];
    include?: { content?: boolean };
  }> = [];
  const client = {
    core: {
      getObjects: async (input: {
        objectIds: string[];
        include?: { content?: boolean };
      }) => {
        coreCalls.push(input);
        if (!input.include?.content) {
          return {
            objects: input.objectIds.map((objectId) => ({
              objectId,
              type: "0xa::recording::Recording<0xb::share::Recording, 0xc::share::Composition>",
            })),
          };
        }
        return {
          objects: input.objectIds.map(() => new Error("field not set")),
        };
      },
    },
  } as unknown as ClientWithCoreApi;
  let graphqlCalls = 0;
  const graphql = {
    query: async () => {
      graphqlCalls += 1;
      return { data: { composition0: { nodes: [{ address: "0x21" }] } } };
    },
  } as unknown as SuiGraphQLClient;

  const result = await getTrackCreditsByRecordingIds(
    client,
    graphql,
    recordingIds,
    {
      misoPackageId: "0xa",
      compositionCreditsPackageId: "0xd",
      recordingCreditsPackageId: "0xe",
    },
  );

  expect(Object.keys(result)).toEqual(recordingIds);
  expect(coreCalls).toHaveLength(3);
  expect(graphqlCalls).toBe(1);
});

test("release identity, cover, and credits share one Core request", async () => {
  const releaseId = "0x1";
  const calls: Array<{ objectIds: string[] }> = [];
  const client = {
    config: {
      protocol: {
        releaseCoverArt: "0xa",
        releaseCredits: "0xc",
      },
      walrusAggregatorUrl: "https://walrus.example",
    },
    protocol: {
      core: {
        getObjects: async (input: { objectIds: string[] }) => {
          calls.push(input);
          return {
            objects: [
              {
                objectId: releaseId,
                content: contracts.release.Release.serialize({
                  id: releaseId,
                  state: { Initialized: true },
                  title: "One request",
                  tracks: [],
                }).toBytes(),
                json: null,
              },
              ...input.objectIds.slice(1).map(() => new Error("field not set")),
            ],
          };
        },
      },
    },
  } as unknown as MisoClient;

  const result = await getReleaseResources(client, releaseId, [
    "cover",
    "credits",
  ]);
  expect(result.release.title).toBe("One request");
  expect(result.cover).toBeNull();
  expect(result.credits).toEqual([]);
  expect(calls).toHaveLength(1);
  expect(calls[0]?.objectIds).toHaveLength(3);
});
