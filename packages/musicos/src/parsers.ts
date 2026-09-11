// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Event decoders, mapped to the public camelCase event shapes in `types.ts`.
// Every decoder takes either the raw event bytes or a sui-effect `Event`
// (whose `.bcs` is the same bytes), and fails with `DecodeError` instead of
// throwing — bytes that do not decode are a boundary failure like any other
// `SuiSchema.decode` caller sees, not a special case for events.

import { Effect, type Schema } from "effect";
import { DecodeError, type Event } from "sui-effect";
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

/**
 * A generated event codec's own `.name` is a `@local-pkg/…` source label,
 * never resolved to a real address (see `schema.ts`), so it cannot be
 * compared against a real event's `eventType` the way an object's tag can.
 * What this CAN still check, given only the `Event` overload: the
 * `module::EventName` suffix — package address and any generic type
 * arguments aside — which is exactly `bareEventType` strips down to.
 */
export function bareEventType(eventType: string): string {
  const generic = eventType.indexOf("<");
  return generic === -1 ? eventType : eventType.slice(0, generic);
}

export function matchesEventSuffix(eventType: string, suffix: string): boolean {
  return bareEventType(eventType).endsWith(`::${suffix}`);
}

function eventDecoder<Raw, T>(codec: Schema.Codec<Raw, Uint8Array>, suffix: string, map: (raw: Raw) => T): EventDecoder<T> {
  return ((input: Uint8Array | Event) => {
    if (input instanceof Uint8Array) {
      return Effect.map(SuiSchema.decode(codec, input), map);
    }
    if (!matchesEventSuffix(input.eventType, suffix)) {
      return Effect.fail(
        new DecodeError({
          expectedType: suffix,
          issue: `event type ${input.eventType} does not name ${suffix}`,
        }),
      );
    }
    return Effect.map(SuiSchema.decode(codec, input.bcs, { actualType: input.eventType }), map);
  }) as EventDecoder<T>;
}

// === Composition ===

export const parseCompositionCreatedEvent: EventDecoder<CompositionCreatedEvent> = eventDecoder(
  schema.compositionCreatedEventContent,
  "composition::CompositionCreatedEvent",
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
  "composition::CompositionPublishedEvent",
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
  "recording::RecordingCreatedEvent",
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
  "recording::RecordingPublishedEvent",
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
  "recording::CompositionSharesGrantedEvent",
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
  "release::ReleaseCreatedEvent",
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
  "release::ReleasePublishedEvent",
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
  "release::ReleaseRegistryCreatedEvent",
  (e): ReleaseRegistryCreatedEvent => ({
    registryId: e.registry_id,
    createdBy: e.created_by,
    sharedAfter: e.shared_after,
  }),
);
