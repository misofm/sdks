// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Drift gate for object mapping: serialize a struct with its generated BCS
// definition, parse it, and run it through the internal mappers, asserting the
// public camelCase shape. Exercises the BPS tuple and the lifecycle state enum.

import { test, expect } from "bun:test";

import { Composition } from "../src/contracts/musicos/composition.ts";
import { Recording } from "../src/contracts/musicos/recording.ts";
import { Release } from "../src/contracts/musicos/release.ts";
import { mapComposition, mapBps, mapRecording, mapRelease } from "../src/internal.ts";

const ADDR = "0x" + "ab".repeat(32);

test("mapComposition: royaltyRate (BPS), state enum", () => {
  const bytes = Composition.serialize({
    id: ADDR,
    state: { Initialized: true },
    title: "My Song",
    royalty_rate: [1000],
  }).toBytes();

  const comp = mapComposition(ADDR, Composition.parse(bytes));
  expect(comp.id).toBe(ADDR);
  expect(comp.state).toEqual({ type: "Initialized" });
  expect(comp.title).toBe("My Song");
  expect(comp.royaltyRate).toEqual({ value: 1000 });
});

test("mapState maps Published with timestamp", () => {
  const bytes = Composition.serialize({
    id: ADDR,
    state: { Published: "1700000000000" },
    title: "x",
    royalty_rate: [1000],
  }).toBytes();
  expect(mapComposition(ADDR, Composition.parse(bytes)).state).toEqual({
    type: "Published",
    timestampMs: 1700000000000,
  });
});

test("mapBps unit behavior", () => {
  expect(mapBps([2500])).toEqual({ value: 2500 });
});

test("mapRecording: compositionId, state enum", () => {
  const bytes = Recording.serialize({
    id: ADDR,
    state: { Initialized: true },
    composition_id: ADDR,
  }).toBytes();

  const rec = mapRecording(ADDR, Recording.parse(bytes));
  expect(rec.id).toBe(ADDR);
  expect(rec.state).toEqual({ type: "Initialized" });
  expect(rec.compositionId).toBe(ADDR);
});

test("mapRelease parses the canonical flat track list", () => {
  const bytes = Release.serialize({
    id: ADDR,
    state: { Published: "1700000000000" },
    title: "Canonical Release",
    tracks: [
      {
        state: { Unassigned: ADDR },
        composition_id: ADDR,
        recording_id: ADDR,
        split_bps: [5000],
      },
    ],
  }).toBytes();

  expect(mapRelease(ADDR, Release.parse(bytes))).toEqual({
    id: ADDR,
    state: { type: "Published", timestampMs: 1700000000000 },
    title: "Canonical Release",
    tracks: [
      {
        state: "Unassigned",
        compositionId: ADDR,
        recordingId: ADDR,
        splitBps: { value: 5000 },
      },
    ],
  });
});
