// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { contracts } from "@misofm/musicos";
import { SuiGraphQL } from "sui-effect";
import { layerTest, type FakeObject } from "sui-effect/testing";
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

test("parseReleaseObject reads the canonical flat BCS tracklist", async () => {
  const release = await Effect.runPromise(parseReleaseObject(RELEASE, releaseBytes()));
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

test("getWorksByIds reads the canonical BCS tracklist (Sui never fetches the retired JSON projection)", async () => {
  const objects: FakeObject[] = [
    { objectId: RELEASE, type: `${PACKAGE}::release::Release`, version: 1n, content: releaseBytes() },
  ];

  const works = await Effect.runPromise(
    Effect.provide(
      getWorksByIds({ compositions: [], recordings: [], releases: [RELEASE] }),
      layerTest({ objects }),
      { local: true },
    ),
  );
  expect(works.releases[RELEASE]?.title).toBe("Canonical flat release");
  expect(works.releases[RELEASE]?.tracks).toHaveLength(2);
});

test("getRecordingTitles derives titles from the canonical composition type, not JSON", async () => {
  const objects: FakeObject[] = [
    {
      objectId: RECORDING_ONE,
      type: `${PACKAGE}::recording::Recording<${RECORDING_SHARE}, ${COMPOSITION_SHARE}>`,
      version: 1n,
      content: new Uint8Array(),
    },
    {
      objectId: COMPOSITION,
      type: `${PACKAGE}::composition::Composition<${COMPOSITION_SHARE}>`,
      version: 1n,
      content: contracts.composition.Composition.serialize({
        id: COMPOSITION,
        state: { Published: 1n },
        title: "Canonical composition title",
        royalty_rate: [1000],
      }).toBytes(),
    },
  ];
  const graphql = {
    query: async () => ({ data: { composition0: { nodes: [{ address: COMPOSITION }] } } }),
  } as unknown as SuiGraphQLClient;

  const titles = await Effect.runPromise(
    Effect.provide(
      getRecordingTitles([RECORDING_ONE], PACKAGE),
      Layer.mergeAll(layerTest({ objects }), SuiGraphQL.layer(graphql)),
      { local: true },
    ),
  );
  expect(titles).toEqual({ [RECORDING_ONE]: "Canonical composition title" });
});
