// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Drift gate: serialize each event with its generated BCS struct, then parse it
// back through the public parser and assert the mapped output. If the on-chain
// ABI changes, `bun run codegen` updates the generated struct and these
// round-trips fail loudly here.

import { test, expect } from "bun:test";

import { CompositionPublishedEvent } from "../src/contracts/musicos/composition.ts";
import {
  CompositionSharesGrantedEvent,
  RecordingPublishedEvent,
} from "../src/contracts/musicos/recording.ts";
import {
  ReleasePublishedEvent,
  ReleaseRegistryCreatedEvent,
} from "../src/contracts/musicos/release.ts";
import * as parse from "../src/parsers.ts";

const A1 = "0x" + "11".repeat(32);

test("compositionPublishedEvent round-trips", () => {
  const bytes = CompositionPublishedEvent.serialize({ composition_id: A1 }).toBytes();
  expect(parse.parseCompositionPublishedEvent(bytes)).toEqual({ compositionId: A1 });
});

test("recordingPublishedEvent round-trips (id only)", () => {
  const bytes = RecordingPublishedEvent.serialize({ recording_id: A1 }).toBytes();
  expect(parse.parseRecordingPublishedEvent(bytes)).toEqual({ recordingId: A1 });
});

test("compositionSharesGrantedEvent preserves the creation settlement payload", () => {
  const bytes = CompositionSharesGrantedEvent.serialize({
    recording_id: A1,
    composition_id: A1,
    value: "123456",
    rate_bps: 1250,
    granted_by: A1,
  }).toBytes();
  expect(parse.parseCompositionSharesGrantedEvent(bytes)).toEqual({
    recordingId: A1,
    compositionId: A1,
    value: "123456",
    rateBps: 1250,
    grantedBy: A1,
  });
});

test("releasePublishedEvent round-trips", () => {
  const bytes = ReleasePublishedEvent.serialize({ release_id: A1 }).toBytes();
  expect(parse.parseReleasePublishedEvent(bytes)).toEqual({ releaseId: A1 });
});

test("releaseRegistryCreatedEvent round-trips", () => {
  const bytes = ReleaseRegistryCreatedEvent.serialize({
    registry_id: A1,
    created_by: A1,
  }).toBytes();
  expect(parse.parseReleaseRegistryCreatedEvent(bytes)).toEqual({
    registryId: A1,
    createdBy: A1,
  });
});
