// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Drift gate: serialize each event with an independent local BCS layout, then
// parse it through the public camelCase parser and assert every mapped field.
// Distinct values make field-order and field-name mistakes visible.

import { expect, test } from "bun:test";

import { Effect } from "effect";
import { ObjectId, SuiAddress } from "sui-effect";
import * as parse from "../src/parsers.ts";
import * as wire from "./event-fixtures.ts";

const id = (byte: number) => `0x${byte.toString(16).padStart(2, "0").repeat(32)}`;

test("compositionCreatedEvent preserves every field and wide values", () => {
  const bytes = wire.compositionCreatedWire.serialize({
    composition_id: id(0x11),
    composition_admin_cap_id: id(0x12),
    share_currency_id: id(0x13),
    consumed_treasury_cap_id: id(0x14),
    created_by: id(0x15),
    title_bytes: [0xc3, 0xa9, 0xf0, 0x9f, 0x8e, 0xb5],
    royalty_rate_bps: 4321,
    share_supply_before: 9007199254740993n,
    share_supply_after: 9007199254740997n,
    shares_returned: 1234567890123456n,
    share_decimals: 6,
    share_supply_fixed_after: true,
  }).toBytes();

  expect(Effect.runSync(parse.parseCompositionCreatedEvent(bytes))).toEqual({
    compositionId: id(0x11),
    compositionAdminCapId: id(0x12),
    shareCurrencyId: id(0x13),
    consumedTreasuryCapId: id(0x14),
    createdBy: id(0x15),
    titleBytes: [0xc3, 0xa9, 0xf0, 0x9f, 0x8e, 0xb5],
    royaltyRateBps: 4321,
    shareSupplyBefore: "9007199254740993",
    shareSupplyAfter: "9007199254740997",
    sharesReturned: "1234567890123456",
    shareDecimals: 6,
    shareSupplyFixedAfter: true,
  });
});

test("compositionPublishedEvent preserves its publication payload", () => {
  const bytes = wire.compositionPublishedWire.serialize({
    composition_id: id(0x21),
    composition_admin_cap_id: id(0x22),
    clock_id: id(0x23),
    title_bytes: [0x52, 0xc3, 0xa9],
    royalty_rate_bps: 17,
    published_at_ms: 9007199254740999n,
    shared_after: false,
  }).toBytes();

  expect(Effect.runSync(parse.parseCompositionPublishedEvent(bytes))).toEqual({
    compositionId: id(0x21),
    compositionAdminCapId: id(0x22),
    clockId: id(0x23),
    titleBytes: [0x52, 0xc3, 0xa9],
    royaltyRateBps: 17,
    publishedAtMs: "9007199254740999",
    sharedAfter: false,
  });
});

test("recordingCreatedEvent preserves zero royalty and no composition funds", () => {
  const bytes = wire.recordingCreatedWire.serialize({
    recording_id: id(0x31),
    composition_id: id(0x32),
    recording_admin_cap_id: id(0x33),
    share_currency_id: id(0x34),
    consumed_treasury_cap_id: id(0x35),
    created_by: id(0x36),
    composition_royalty_rate_bps: 0,
    share_supply_before: 0n,
    shares_before_grant: 0n,
    composition_shares_granted: 0n,
    shares_returned: 0n,
    share_decimals: 0,
    share_supply_fixed_after: false,
    composition_funds_sent: false,
  }).toBytes();

  expect(Effect.runSync(parse.parseRecordingCreatedEvent(bytes))).toEqual({
    recordingId: id(0x31),
    compositionId: id(0x32),
    recordingAdminCapId: id(0x33),
    shareCurrencyId: id(0x34),
    consumedTreasuryCapId: id(0x35),
    createdBy: id(0x36),
    compositionRoyaltyRateBps: 0,
    shareSupplyBefore: "0",
    sharesBeforeGrant: "0",
    compositionSharesGranted: "0",
    sharesReturned: "0",
    shareDecimals: 0,
    shareSupplyFixedAfter: false,
    compositionFundsSent: false,
  });
});

test("recordingCreatedEvent preserves nonzero grant and funds transfer", () => {
  const bytes = wire.recordingCreatedWire.serialize({
    recording_id: id(0x41),
    composition_id: id(0x42),
    recording_admin_cap_id: id(0x43),
    share_currency_id: id(0x44),
    consumed_treasury_cap_id: id(0x45),
    created_by: id(0x46),
    composition_royalty_rate_bps: 2500,
    share_supply_before: 10000000000000001n,
    shares_before_grant: 10000000000000001n,
    composition_shares_granted: 2500000000000000n,
    shares_returned: 7500000000000001n,
    share_decimals: 6,
    share_supply_fixed_after: true,
    composition_funds_sent: true,
  }).toBytes();

  expect(Effect.runSync(parse.parseRecordingCreatedEvent(bytes))).toEqual({
    recordingId: id(0x41),
    compositionId: id(0x42),
    recordingAdminCapId: id(0x43),
    shareCurrencyId: id(0x44),
    consumedTreasuryCapId: id(0x45),
    createdBy: id(0x46),
    compositionRoyaltyRateBps: 2500,
    shareSupplyBefore: "10000000000000001",
    sharesBeforeGrant: "10000000000000001",
    compositionSharesGranted: "2500000000000000",
    sharesReturned: "7500000000000001",
    shareDecimals: 6,
    shareSupplyFixedAfter: true,
    compositionFundsSent: true,
  });
});

test("recordingPublishedEvent preserves its publication payload", () => {
  const bytes = wire.recordingPublishedWire.serialize({
    recording_id: id(0x51),
    composition_id: id(0x52),
    recording_admin_cap_id: id(0x53),
    clock_id: id(0x54),
    published_at_ms: 9007199254740995n,
    shared_after: true,
  }).toBytes();

  expect(Effect.runSync(parse.parseRecordingPublishedEvent(bytes))).toEqual({
    recordingId: id(0x51),
    compositionId: id(0x52),
    recordingAdminCapId: id(0x53),
    clockId: id(0x54),
    publishedAtMs: "9007199254740995",
    sharedAfter: true,
  });
});

test("legacy compositionSharesGrantedEvent remains lossless and decodable", () => {
  const bytes = wire.compositionSharesGrantedWire.serialize({
    recording_id: id(0x61),
    composition_id: id(0x62),
    value: "12345678901234567",
    rate_bps: 1250,
    granted_by: id(0x63),
  }).toBytes();

  expect(Effect.runSync(parse.parseCompositionSharesGrantedEvent(bytes))).toEqual({
    recordingId: id(0x61),
    compositionId: id(0x62),
    value: "12345678901234567",
    rateBps: 1250,
    grantedBy: id(0x63),
  });
});

test("releaseCreatedEvent preserves ordered tracks and a wide nonce", () => {
  const bytes = wire.releaseCreatedWire.serialize({
    registry_id: id(0x71),
    release_id: id(0x72),
    release_admin_cap_id: id(0x73),
    title_bytes: [0xe2, 0x98, 0x83, 0x20, 0xf0, 0x9f, 0x8e, 0xb6],
    release_digest: [0x00, 0xff, 0x11, 0x80, 0x22],
    nonce: 2n ** 200n + 123n,
    composition_ids: [id(0x74), id(0x75)],
    recording_ids: [id(0x76), id(0x77)],
    track_split_bps: [2500n, 7500n],
    track_count: 2n,
  }).toBytes();

  expect(Effect.runSync(parse.parseReleaseCreatedEvent(bytes))).toEqual({
    registryId: id(0x71),
    releaseId: id(0x72),
    releaseAdminCapId: id(0x73),
    titleBytes: [0xe2, 0x98, 0x83, 0x20, 0xf0, 0x9f, 0x8e, 0xb6],
    releaseDigest: [0x00, 0xff, 0x11, 0x80, 0x22],
    nonce: "1606938044258990275541962092341162602522202993782792835301499",
    compositionIds: [id(0x74), id(0x75)],
    recordingIds: [id(0x76), id(0x77)],
    trackSplitBps: ["2500", "7500"],
    trackCount: "2",
  });
});

test("releasePublishedEvent preserves ordered publication payload", () => {
  const bytes = wire.releasePublishedWire.serialize({
    release_id: id(0x81),
    release_admin_cap_id: id(0x82),
    clock_id: id(0x83),
    title_bytes: [0x41, 0xc3, 0xa9],
    published_at_ms: 12345678901234567n,
    composition_ids: [id(0x84), id(0x85)],
    recording_ids: [id(0x86), id(0x87)],
    track_split_bps: [3333n, 6667n],
    assigned_track_count: 2n,
    shared_after: false,
  }).toBytes();

  expect(Effect.runSync(parse.parseReleasePublishedEvent(bytes))).toEqual({
    releaseId: id(0x81),
    releaseAdminCapId: id(0x82),
    clockId: id(0x83),
    titleBytes: [0x41, 0xc3, 0xa9],
    publishedAtMs: "12345678901234567",
    compositionIds: [id(0x84), id(0x85)],
    recordingIds: [id(0x86), id(0x87)],
    trackSplitBps: ["3333", "6667"],
    assignedTrackCount: "2",
    sharedAfter: false,
  });
});

test("releaseRegistryCreatedEvent preserves shared_after", () => {
  const bytes = wire.releaseRegistryCreatedWire.serialize({
    registry_id: id(0x91),
    created_by: id(0x92),
    shared_after: true,
  }).toBytes();

  expect(Effect.runSync(parse.parseReleaseRegistryCreatedEvent(bytes))).toEqual({
    registryId: id(0x91),
    createdBy: id(0x92),
    sharedAfter: true,
  });
});

test("a camelCase parser fed a different event's bytes fails with DecodeError, not a thrown value", () => {
  const releaseRegistryBytes = wire.releaseRegistryCreatedWire.serialize({
    registry_id: id(0xa1),
    created_by: id(0xa2),
    shared_after: true,
  }).toBytes();
  const error = Effect.runSync(Effect.flip(parse.parseCompositionCreatedEvent(releaseRegistryBytes)));
  expect(error._tag).toBe("DecodeError");
});

test("every parser also accepts a sui-effect Event's .bcs bytes", () => {
  const bytes = wire.releaseRegistryCreatedWire.serialize({
    registry_id: id(0xb1),
    created_by: id(0xb2),
    shared_after: false,
  }).toBytes();
  const event = {
    packageId: ObjectId.make(id(0x01)),
    module: "release",
    sender: SuiAddress.make(id(0x02)),
    eventType: `${id(0x01)}::release::ReleaseRegistryCreatedEvent`,
    bcs: bytes,
  };
  expect(Effect.runSync(parse.parseReleaseRegistryCreatedEvent(event))).toEqual({
    registryId: id(0xb1),
    createdBy: id(0xb2),
    sharedAfter: false,
  });
});
