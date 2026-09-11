// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Event parsers. The BCS layouts come from the codegen-generated structs (so
// they track the on-chain ABI automatically); these functions parse raw event
// bytes and map them to the public camelCase event types.

import {
  CompositionCreatedEvent as CompositionCreatedEventBcs,
  CompositionPublishedEvent as CompositionPublishedEventBcs,
} from "./contracts/musicos/composition.ts";
import {
  CompositionSharesGrantedEvent as CompositionSharesGrantedEventBcs,
  RecordingCreatedEvent as RecordingCreatedEventBcs,
  RecordingPublishedEvent as RecordingPublishedEventBcs,
} from "./contracts/musicos/recording.ts";
import {
  ReleaseCreatedEvent as ReleaseCreatedEventBcs,
  ReleasePublishedEvent as ReleasePublishedEventBcs,
  ReleaseRegistryCreatedEvent as ReleaseRegistryCreatedEventBcs,
} from "./contracts/musicos/release.ts";
import type {
  CompositionCreatedEvent,
  CompositionPublishedEvent,
  CompositionSharesGrantedEvent,
  RecordingCreatedEvent,
  RecordingPublishedEvent,
  ReleaseCreatedEvent,
  ReleaseRegistryCreatedEvent,
  ReleasePublishedEvent,
} from "./types.ts";

// === Composition ===

export function parseCompositionCreatedEvent(bytes: Uint8Array): CompositionCreatedEvent {
  const e = CompositionCreatedEventBcs.parse(bytes);
  return {
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
  };
}

export function parseCompositionPublishedEvent(bytes: Uint8Array): CompositionPublishedEvent {
  const e = CompositionPublishedEventBcs.parse(bytes);
  return {
    compositionId: e.composition_id,
    compositionAdminCapId: e.composition_admin_cap_id,
    clockId: e.clock_id,
    titleBytes: e.title_bytes,
    royaltyRateBps: e.royalty_rate_bps,
    publishedAtMs: e.published_at_ms,
    sharedAfter: e.shared_after,
  };
}

// === Recording ===

export function parseRecordingCreatedEvent(bytes: Uint8Array): RecordingCreatedEvent {
  const e = RecordingCreatedEventBcs.parse(bytes);
  return {
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
  };
}

export function parseRecordingPublishedEvent(bytes: Uint8Array): RecordingPublishedEvent {
  const e = RecordingPublishedEventBcs.parse(bytes);
  return {
    recordingId: e.recording_id,
    compositionId: e.composition_id,
    recordingAdminCapId: e.recording_admin_cap_id,
    clockId: e.clock_id,
    publishedAtMs: e.published_at_ms,
    sharedAfter: e.shared_after,
  };
}

/** Decode the dormant legacy royalty-rate share grant event. */
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

export function parseReleaseCreatedEvent(bytes: Uint8Array): ReleaseCreatedEvent {
  const e = ReleaseCreatedEventBcs.parse(bytes);
  return {
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
  };
}

export function parseReleasePublishedEvent(bytes: Uint8Array): ReleasePublishedEvent {
  const e = ReleasePublishedEventBcs.parse(bytes);
  return {
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
  };
}

/** Decode the singleton core release-registry creation event. */
export function parseReleaseRegistryCreatedEvent(
  bytes: Uint8Array,
): ReleaseRegistryCreatedEvent {
  const e = ReleaseRegistryCreatedEventBcs.parse(bytes);
  return {
    registryId: e.registry_id,
    createdBy: e.created_by,
    sharedAfter: e.shared_after,
  };
}
