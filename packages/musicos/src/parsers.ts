// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Event decoders, mapped to the public camelCase event shapes in `types.ts`.
// Every decoder takes either the raw event bytes or a sui-effect `Event`
// (whose `.bcs` is the same bytes), and fails with `DecodeError` instead of
// throwing — bytes that do not decode are a boundary failure like any other
// `SuiSchema.decode` caller sees, not a special case for events.

import { Effect, type Schema } from "effect";
import type { DecodeError, Event } from "sui-effect";
import { SuiSchema } from "sui-effect";
import * as schema from "./schema.ts";
import type {
  CompositionCreatedEvent,
  CompositionPublishedEvent,
  CompositionSharesGrantedEvent,
  RecordingCreatedEvent,
  RecordingPublishedEvent,
  ReleaseCreatedEvent,
  ReleasePublishedEvent,
  ReleaseRegistryCreatedEvent,
} from "./types.ts";

/** Decodes either raw event bytes, or a sui-effect `Event` (its `.bcs`). */
export interface EventDecoder<T> {
  (bytes: Uint8Array): Effect.Effect<T, DecodeError>;
  (event: Event): Effect.Effect<T, DecodeError>;
}

function eventDecoder<Raw, T>(codec: Schema.Codec<Raw, Uint8Array>, map: (raw: Raw) => T): EventDecoder<T> {
  return ((input: Uint8Array | Event) => {
    const bytes = input instanceof Uint8Array ? input : input.bcs;
    return Effect.map(SuiSchema.decode(codec, bytes), map);
  }) as EventDecoder<T>;
}

// === Composition ===

export const parseCompositionCreatedEvent: EventDecoder<CompositionCreatedEvent> = eventDecoder(
  schema.compositionCreatedEventContent,
  (e): CompositionCreatedEvent => ({
    compositionId: e.composition_id,
    compositionAdminCapId: e.composition_admin_cap_id,
    shareCurrencyId: e.share_currency_id,
    consumedTreasuryCapId: e.consumed_treasury_cap_id,
    createdBy: e.created_by,
    titleBytes: e.title_bytes,
    royaltyRateBps: e.royalty_rate_bps,
    shareSupplyBefore: e.share_supply_before,
    shareSupplyAfter: e.share_supply_after,
    sharesReturned: e.shares_returned,
    shareDecimals: e.share_decimals,
    shareSupplyFixedAfter: e.share_supply_fixed_after,
  }),
);

export const parseCompositionPublishedEvent: EventDecoder<CompositionPublishedEvent> = eventDecoder(
  schema.compositionPublishedEventContent,
  (e): CompositionPublishedEvent => ({
    compositionId: e.composition_id,
    compositionAdminCapId: e.composition_admin_cap_id,
    clockId: e.clock_id,
    titleBytes: e.title_bytes,
    royaltyRateBps: e.royalty_rate_bps,
    publishedAtMs: e.published_at_ms,
    sharedAfter: e.shared_after,
  }),
);

// === Recording ===

export const parseRecordingCreatedEvent: EventDecoder<RecordingCreatedEvent> = eventDecoder(
  schema.recordingCreatedEventContent,
  (e): RecordingCreatedEvent => ({
    recordingId: e.recording_id,
    compositionId: e.composition_id,
    recordingAdminCapId: e.recording_admin_cap_id,
    shareCurrencyId: e.share_currency_id,
    consumedTreasuryCapId: e.consumed_treasury_cap_id,
    createdBy: e.created_by,
    compositionRoyaltyRateBps: e.composition_royalty_rate_bps,
    shareSupplyBefore: e.share_supply_before,
    sharesBeforeGrant: e.shares_before_grant,
    compositionSharesGranted: e.composition_shares_granted,
    sharesReturned: e.shares_returned,
    shareDecimals: e.share_decimals,
    shareSupplyFixedAfter: e.share_supply_fixed_after,
    compositionFundsSent: e.composition_funds_sent,
  }),
);

export const parseRecordingPublishedEvent: EventDecoder<RecordingPublishedEvent> = eventDecoder(
  schema.recordingPublishedEventContent,
  (e): RecordingPublishedEvent => ({
    recordingId: e.recording_id,
    compositionId: e.composition_id,
    recordingAdminCapId: e.recording_admin_cap_id,
    clockId: e.clock_id,
    publishedAtMs: e.published_at_ms,
    sharedAfter: e.shared_after,
  }),
);

/** Decodes the dormant legacy royalty-rate share grant event. */
export const parseCompositionSharesGrantedEvent: EventDecoder<CompositionSharesGrantedEvent> = eventDecoder(
  schema.compositionSharesGrantedEventContent,
  (e): CompositionSharesGrantedEvent => ({
    recordingId: e.recording_id,
    compositionId: e.composition_id,
    value: e.value,
    rateBps: e.rate_bps,
    grantedBy: e.granted_by,
  }),
);

// === Release ===

export const parseReleaseCreatedEvent: EventDecoder<ReleaseCreatedEvent> = eventDecoder(
  schema.releaseCreatedEventContent,
  (e): ReleaseCreatedEvent => ({
    registryId: e.registry_id,
    releaseId: e.release_id,
    releaseAdminCapId: e.release_admin_cap_id,
    titleBytes: e.title_bytes,
    releaseDigest: e.release_digest,
    nonce: e.nonce,
    compositionIds: e.composition_ids,
    recordingIds: e.recording_ids,
    trackSplitBps: e.track_split_bps,
    trackCount: e.track_count,
  }),
);

export const parseReleasePublishedEvent: EventDecoder<ReleasePublishedEvent> = eventDecoder(
  schema.releasePublishedEventContent,
  (e): ReleasePublishedEvent => ({
    releaseId: e.release_id,
    releaseAdminCapId: e.release_admin_cap_id,
    clockId: e.clock_id,
    titleBytes: e.title_bytes,
    publishedAtMs: e.published_at_ms,
    compositionIds: e.composition_ids,
    recordingIds: e.recording_ids,
    trackSplitBps: e.track_split_bps,
    assignedTrackCount: e.assigned_track_count,
    sharedAfter: e.shared_after,
  }),
);

/** Decodes the singleton core release-registry creation event. */
export const parseReleaseRegistryCreatedEvent: EventDecoder<ReleaseRegistryCreatedEvent> = eventDecoder(
  schema.releaseRegistryCreatedEventContent,
  (e): ReleaseRegistryCreatedEvent => ({
    registryId: e.registry_id,
    createdBy: e.created_by,
    sharedAfter: e.shared_after,
  }),
);
