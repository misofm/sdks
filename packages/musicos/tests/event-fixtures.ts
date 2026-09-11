// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs } from "@mysten/sui/bcs";

// These schemas intentionally duplicate the reviewed Move field lists locally.
// They are independent wire-layout oracles for the generated codecs and the
// public raw/camelCase event parsers under test.
export const compositionCreatedWire = bcs.struct("CompositionCreatedEventFixture", {
  composition_id: bcs.Address,
  composition_admin_cap_id: bcs.Address,
  share_currency_id: bcs.Address,
  consumed_treasury_cap_id: bcs.Address,
  created_by: bcs.Address,
  title_bytes: bcs.vector(bcs.u8()),
  royalty_rate_bps: bcs.u16(),
  share_supply_before: bcs.u64(),
  share_supply_after: bcs.u64(),
  shares_returned: bcs.u64(),
  share_decimals: bcs.u8(),
  share_supply_fixed_after: bcs.bool(),
});

export const compositionPublishedWire = bcs.struct("CompositionPublishedEventFixture", {
  composition_id: bcs.Address,
  composition_admin_cap_id: bcs.Address,
  clock_id: bcs.Address,
  title_bytes: bcs.vector(bcs.u8()),
  royalty_rate_bps: bcs.u16(),
  published_at_ms: bcs.u64(),
  shared_after: bcs.bool(),
});

export const recordingCreatedWire = bcs.struct("RecordingCreatedEventFixture", {
  recording_id: bcs.Address,
  composition_id: bcs.Address,
  recording_admin_cap_id: bcs.Address,
  share_currency_id: bcs.Address,
  consumed_treasury_cap_id: bcs.Address,
  created_by: bcs.Address,
  composition_royalty_rate_bps: bcs.u16(),
  share_supply_before: bcs.u64(),
  shares_before_grant: bcs.u64(),
  composition_shares_granted: bcs.u64(),
  shares_returned: bcs.u64(),
  share_decimals: bcs.u8(),
  share_supply_fixed_after: bcs.bool(),
  composition_funds_sent: bcs.bool(),
});

export const recordingPublishedWire = bcs.struct("RecordingPublishedEventFixture", {
  recording_id: bcs.Address,
  composition_id: bcs.Address,
  recording_admin_cap_id: bcs.Address,
  clock_id: bcs.Address,
  published_at_ms: bcs.u64(),
  shared_after: bcs.bool(),
});

export const compositionSharesGrantedWire = bcs.struct("CompositionSharesGrantedEventFixture", {
  recording_id: bcs.Address,
  composition_id: bcs.Address,
  value: bcs.u64(),
  rate_bps: bcs.u16(),
  granted_by: bcs.Address,
});

export const releaseCreatedWire = bcs.struct("ReleaseCreatedEventFixture", {
  registry_id: bcs.Address,
  release_id: bcs.Address,
  release_admin_cap_id: bcs.Address,
  title_bytes: bcs.vector(bcs.u8()),
  release_digest: bcs.vector(bcs.u8()),
  nonce: bcs.u256(),
  composition_ids: bcs.vector(bcs.Address),
  recording_ids: bcs.vector(bcs.Address),
  track_split_bps: bcs.vector(bcs.u64()),
  track_count: bcs.u64(),
});

export const releasePublishedWire = bcs.struct("ReleasePublishedEventFixture", {
  release_id: bcs.Address,
  release_admin_cap_id: bcs.Address,
  clock_id: bcs.Address,
  title_bytes: bcs.vector(bcs.u8()),
  published_at_ms: bcs.u64(),
  composition_ids: bcs.vector(bcs.Address),
  recording_ids: bcs.vector(bcs.Address),
  track_split_bps: bcs.vector(bcs.u64()),
  assigned_track_count: bcs.u64(),
  shared_after: bcs.bool(),
});

export const releaseRegistryCreatedWire = bcs.struct("ReleaseRegistryCreatedEventFixture", {
  registry_id: bcs.Address,
  created_by: bcs.Address,
  shared_after: bcs.bool(),
});
