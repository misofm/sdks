// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Event parsers. The BCS layouts come from the codegen-generated structs (so
// they track the on-chain ABI automatically); these functions parse raw event
// bytes and map them to the public camelCase event types.

import { CompositionPublishedEvent as CompositionPublishedEventBcs } from "./contracts/miso/composition.ts";
import {
  CompositionSharesGrantedEvent as CompositionSharesGrantedEventBcs,
  RecordingPublishedEvent as RecordingPublishedEventBcs,
} from "./contracts/miso/recording.ts";
import {
  ReleasePublishedEvent as ReleasePublishedEventBcs,
  ReleaseRegistryCreatedEvent as ReleaseRegistryCreatedEventBcs,
} from "./contracts/miso/release.ts";
import { Composition } from "./contracts/miso/composition.ts";
import { Recording } from "./contracts/miso/recording.ts";
import { Release } from "./contracts/miso/release.ts";
import { mapComposition, mapRecording, mapRelease } from "./internal.ts";

/** Decode object content bytes (not the full object envelope). Throws on invalid BCS. */
export function parseCompositionObject(id: string, bytes: Uint8Array) {
  return mapComposition(id, Composition.parse(bytes));
}
export function parseRecordingObject(id: string, bytes: Uint8Array) {
  return mapRecording(id, Recording.parse(bytes));
}
export function parseReleaseObject(id: string, bytes: Uint8Array) {
  return mapRelease(id, Release.parse(bytes));
}

import type {
  CompositionPublishedEvent,
  CompositionSharesGrantedEvent,
  RecordingPublishedEvent,
  ReleaseRegistryCreatedEvent,
  ReleasePublishedEvent,
} from "./types.ts";

// === Composition ===

export function parseCompositionPublishedEvent(bytes: Uint8Array): CompositionPublishedEvent {
  const e = CompositionPublishedEventBcs.parse(bytes);
  return { compositionId: e.composition_id };
}

// === Recording ===

export function parseRecordingPublishedEvent(bytes: Uint8Array): RecordingPublishedEvent {
  const e = RecordingPublishedEventBcs.parse(bytes);
  return { recordingId: e.recording_id };
}

/** Decode the royalty-rate share grant emitted during `recording::new`. */
export function parseCompositionSharesGrantedEvent(
  bytes: Uint8Array,
): CompositionSharesGrantedEvent {
  const e = CompositionSharesGrantedEventBcs.parse(bytes);
  return {
    recordingId: e.recording_id,
    compositionId: e.composition_id,
    value: e.value,
    rateBps: e.rate_bps,
    grantedBy: e.granted_by,
  };
}

// === Release ===

export function parseReleasePublishedEvent(bytes: Uint8Array): ReleasePublishedEvent {
  const e = ReleasePublishedEventBcs.parse(bytes);
  return { releaseId: e.release_id };
}

/** Decode the singleton core release-registry creation event. */
export function parseReleaseRegistryCreatedEvent(
  bytes: Uint8Array,
): ReleaseRegistryCreatedEvent {
  const e = ReleaseRegistryCreatedEventBcs.parse(bytes);
  return { registryId: e.registry_id, createdBy: e.created_by };
}
