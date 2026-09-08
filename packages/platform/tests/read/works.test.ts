// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { contracts } from "@misofm/musicos";
import { getRecordingTitles, getWorksByIds, parseReleaseObject } from "../../src/read/works.ts";

const RELEASE = "0x" + "11".repeat(32);
const RECORDING_ONE = "0x" + "22".repeat(32);
const RECORDING_TWO = "0x" + "33".repeat(32);
const TARGET = "0x" + "44".repeat(32);
const PACKAGE = "0x" + "55".repeat(32);
const COMPOSITION = "0x" + "66".repeat(32);
const RECORDING_SHARE = "0x" + "77".repeat(32) + "::share::Recording";
const COMPOSITION_SHARE = "0x" + "88".repeat(32) + "::share::Composition";

function releaseBytes(): Uint8Array {
  return contracts.release.Release.serialize({
    id: RELEASE,
    state: { Published: 123n },
    title: "Canonical flat release",
    tracks: [
      { state: { Assigned: true }, composition_id: COMPOSITION, recording_id: RECORDING_ONE, split_bps: [6000] },
      { state: { Unassigned: TARGET }, composition_id: COMPOSITION, recording_id: RECORDING_TWO, split_bps: [4000] },
    ],
  }).toBytes();
}

test("parseReleaseObject reads the canonical flat BCS tracklist", () => {
  const release = parseReleaseObject(RELEASE, releaseBytes());
  expect(release).toEqual({
    id: RELEASE,
    state: { type: "Published", timestampMs: 123 },
    title: "Canonical flat release",
    tracks: [
      { state: "Assigned", compositionId: COMPOSITION, recordingId: RECORDING_ONE, splitBps: { value: 6000 } },
      { state: "Unassigned", compositionId: COMPOSITION, recordingId: RECORDING_TWO, splitBps: { value: 4000 } },
    ],
  });
});

test("getWorksByIds ignores the retired discs-shaped JSON projection", async () => {
  const calls: Array<{ include?: { content?: boolean; json?: boolean } }> = [];
  const client = {
    core: {
      getObjects: async (input: { include?: { content?: boolean; json?: boolean } }) => {
        calls.push(input);
        return {
          objects: [{
            objectId: RELEASE,
            content: releaseBytes(),
            json: { title: "Retired JSON", discs: [{ tracks: [] }] },
          }],
        };
      },
    },
  } as unknown as ClientWithCoreApi;

  const works = await getWorksByIds(client, { compositions: [], recordings: [], releases: [RELEASE] });
  expect(calls[0]?.include).toEqual({ content: true });
  expect(works.releases[RELEASE]?.title).toBe("Canonical flat release");
  expect(works.releases[RELEASE]?.tracks).toHaveLength(2);
});

test("getRecordingTitles derives titles from the canonical composition type, not JSON", async () => {
  const calls: Array<{ objectIds: string[]; include?: { json?: boolean } }> = [];
  const client = {
    core: {
      getObjects: async (input: { objectIds: string[]; include?: { json?: boolean } }) => {
        calls.push(input);
        if (input.objectIds[0] === RECORDING_ONE) {
          return {
            objects: [{
              objectId: RECORDING_ONE,
              type: `${PACKAGE}::recording::Recording<${RECORDING_SHARE}, ${COMPOSITION_SHARE}>`,
              json: { title: "Retired recording title" },
            }],
          };
        }
        return {
          objects: [{
            objectId: COMPOSITION,
            content: contracts.composition.Composition.serialize({
              id: COMPOSITION,
              state: { Published: 1n },
              title: "Canonical composition title",
              royalty_rate: [1000],
            }).toBytes(),
          }],
        };
      },
    },
  } as unknown as ClientWithCoreApi;
  const graphql = {
    query: async () => ({ data: { composition0: { nodes: [{ address: COMPOSITION }] } } }),
  } as unknown as SuiGraphQLClient;

  const titles = await getRecordingTitles(client, graphql, [RECORDING_ONE], PACKAGE);
  expect(titles).toEqual({ [RECORDING_ONE]: "Canonical composition title" });
  expect(calls[0]?.include).toEqual({});
});
