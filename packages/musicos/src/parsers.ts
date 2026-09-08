// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Event parsers. The BCS layouts come from the codegen-generated structs (so
// they track the on-chain ABI automatically); these functions parse raw event
// bytes and map them to the public camelCase event types.

import { CompositionPublishedEvent as CompositionPublishedEventBcs } from "./contracts/musicos/composition.ts";
import {
  CompositionSharesGrantedEvent as CompositionSharesGrantedEventBcs,
  RecordingPublishedEvent as RecordingPublishedEventBcs,
} from "./contracts/musicos/recording.ts";
import {
  ReleasePublishedEvent as ReleasePublishedEventBcs,
  ReleaseRegistryCreatedEvent as ReleaseRegistryCreatedEventBcs,
} from "./contracts/musicos/release.ts";
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
