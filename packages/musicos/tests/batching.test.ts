// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import {
  getOwnedReleaseAdminCaps,
  getWorkAddressesByShareTypes,
  getWorksByIds,
} from "../src/queries.ts";
import { Composition } from "../src/contracts/musicos/composition.ts";
import { Recording } from "../src/contracts/musicos/recording.ts";
import { Release } from "../src/contracts/musicos/release.ts";

const id = (digit: string) => `0x${digit.repeat(64)}`;

test("getWorkAddressesByShareTypes combines all type discovery in one GraphQL request", async () => {
  const packageId = id("a");
  const compositionShare = `${id("1")}::share::CompositionShare`;
  const recordingShare = `${id("2")}::share::RecordingShare`;
  const compositionId = id("3");
  const recordingId = id("4");
  const calls: Array<{ query: string; variables: Record<string, string> }> = [];
  const client = {
    query: async (request: {
      query: string;
      variables: Record<string, string>;
    }) => {
      calls.push(request);
      return {
        data: {
          composition0: { nodes: [{ address: compositionId }] },
          recordings: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                address: recordingId,
                asMoveObject: {
                  contents: {
                    type: {
                      repr: `${packageId}::recording::Recording<${recordingShare}, ${compositionShare}>`,
                    },
                  },
                },
              },
            ],
          },
        },
      };
    },
  } as unknown as SuiGraphQLClient;

  const result = await getWorkAddressesByShareTypes(
    client,
    {
      compositions: [compositionShare, compositionShare],
      recordings: [recordingShare],
    },
    packageId,
  );

  expect(calls).toHaveLength(1);
  expect(calls[0]!.query.match(/objects\(first:/g)).toHaveLength(2);
  expect(result).toEqual({
    compositions: { [compositionShare]: compositionId },
    recordings: { [recordingShare]: recordingId },
  });
});

test("getWorksByIds fetches heterogeneous work objects in one Core request", async () => {
  const compositionId = id("1");
  const recordingId = id("2");
  const releaseId = id("3");
  const calls: unknown[] = [];
  const client = {
    core: {
      getObjects: async (request: unknown) => {
        calls.push(request);
        return {
          objects: [
            {
              objectId: compositionId,
              content: Composition.serialize({
                id: compositionId,
                state: { Initialized: true },
                title: "Composition",
                royalty_rate: [500],
              }).toBytes(),
              json: null,
            },
            {
              objectId: recordingId,
              content: Recording.serialize({
                id: recordingId,
                state: { Published: "10" },
                composition_id: compositionId,
              }).toBytes(),
              json: null,
            },
            {
              objectId: releaseId,
              content: Release.serialize({
                id: releaseId,
                state: { Initialized: true },
                title: "Release",
                tracks: [],
              }).toBytes(),
              json: null,
            },
          ],
        };
      },
    },
  } as unknown as ClientWithCoreApi;

  const result = await getWorksByIds(client, {
    compositions: [compositionId],
    recordings: [recordingId],
    releases: [releaseId],
  });

  expect(calls).toEqual([
    {
      objectIds: [compositionId, recordingId, releaseId],
      include: { content: true },
    },
  ]);
  expect(result.compositions[compositionId]?.title).toBe("Composition");
  expect(result.recordings[recordingId]?.state).toEqual({
    type: "Published",
    timestampMs: 10,
  });
  expect(result.releases[releaseId]?.title).toBe("Release");
});

test("getOwnedReleaseAdminCaps uses the list projection without a second object fetch", async () => {
  const capId = id("1");
  const secondCapId = id("4");
  const releaseId = id("2");
  const calls: unknown[] = [];
  const client = {
    core: {
      listOwnedObjects: async (request: unknown) => {
        calls.push(request);
        if (calls.length === 2) {
          return {
            objects: [{ objectId: secondCapId, json: { release_id: id("5") } }],
            hasNextPage: false,
            cursor: null,
          };
        }
        return {
          objects: [{ objectId: capId, json: { release_id: releaseId } }],
          hasNextPage: true,
          cursor: "next",
        };
      },
      getObjects: async () => {
        throw new Error("unexpected second request");
      },
    },
  } as unknown as ClientWithCoreApi;

  await expect(
    getOwnedReleaseAdminCaps(client, id("3"), id("a")),
  ).resolves.toEqual([{ id: capId, releaseId }, { id: secondCapId, releaseId: id("5") }]);
  expect(calls).toEqual([
    {
      owner: id("3"),
      type: `${id("a")}::release::ReleaseAdminCap`,
      include: { json: true },
    },
    {
      owner: id("3"),
      type: `${id("a")}::release::ReleaseAdminCap`,
      include: { json: true },
      cursor: "next",
    },
  ]);
});
