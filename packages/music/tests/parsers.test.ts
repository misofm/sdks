// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Drift gate: serialize each retained event with an independent local BCS layout, then
// parse it through the public camelCase parser and assert every mapped field.
// Distinct values make field-order and field-name mistakes visible.

import { describe, expect, test } from "bun:test";

import { Effect } from "effect";
import { ObjectId, SuiAddress } from "@unconfirmed/sui-effect";
import * as parse from "../src/parsers.ts";
import * as wire from "./event-fixtures.ts";

const id = (byte: number) => `0x${byte.toString(16).padStart(2, "0").repeat(32)}`;

test("compositionPublishedEvent preserves its publication payload", () => {
  const bytes = wire.compositionPublishedWire.serialize({
    composition_id: id(0x21),
    composition_admin_cap_id: id(0x22),
    clock_id: id(0x23),
    title_bytes: [0x52, 0xc3, 0xa9],
    royalty_rate_bps: 17,
    published_at_ms: 9007199254740999n,
    shared_after: false,
    share_currency_id: id(0x24),
    consumed_treasury_cap_id: id(0x25),
    created_by: id(0x26),
    share_supply_before: 9007199254740993n,
    share_supply_after: 9007199254740997n,
    shares_returned: 1234567890123456n,
    share_decimals: 6,
    share_supply_fixed_after: true,
    created_admin_cap_id: id(0x27),
  }).toBytes();

  expect(Effect.runSync(parse.parseCompositionPublishedEvent(bytes))).toEqual({
    compositionId: id(0x21),
    compositionAdminCapId: id(0x22),
    clockId: id(0x23),
    titleBytes: [0x52, 0xc3, 0xa9],
    royaltyRateBps: 17,
    publishedAtMs: "9007199254740999",
    sharedAfter: false,
    shareCurrencyId: id(0x24),
    consumedTreasuryCapId: id(0x25),
    createdBy: id(0x26),
    shareSupplyBefore: "9007199254740993",
    shareSupplyAfter: "9007199254740997",
    sharesReturned: "1234567890123456",
    shareDecimals: 6,
    shareSupplyFixedAfter: true,
    createdAdminCapId: id(0x27),
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
    share_currency_id: id(0x55),
    consumed_treasury_cap_id: id(0x56),
    created_by: id(0x57),
    composition_royalty_rate_bps: 2500,
    share_supply_before: 10000000000000001n,
    shares_before_grant: 10000000000000001n,
    composition_shares_granted: 2500000000000000n,
    shares_returned: 7500000000000001n,
    share_decimals: 6,
    share_supply_fixed_after: true,
    composition_funds_sent: true,
    created_admin_cap_id: id(0x58),
  }).toBytes();

  expect(Effect.runSync(parse.parseRecordingPublishedEvent(bytes))).toEqual({
    recordingId: id(0x51),
    compositionId: id(0x52),
    recordingAdminCapId: id(0x53),
    clockId: id(0x54),
    publishedAtMs: "9007199254740995",
    sharedAfter: true,
    shareCurrencyId: id(0x55),
    consumedTreasuryCapId: id(0x56),
    createdBy: id(0x57),
    compositionRoyaltyRateBps: 2500,
    shareSupplyBefore: "10000000000000001",
    sharesBeforeGrant: "10000000000000001",
    compositionSharesGranted: "2500000000000000",
    sharesReturned: "7500000000000001",
    shareDecimals: 6,
    shareSupplyFixedAfter: true,
    compositionFundsSent: true,
    createdAdminCapId: id(0x58),
  });
});

test("releasePublishedEvent preserves ordered publication payload", () => {
  const bytes = wire.releasePublishedWire.serialize({
    release_id: id(0x81),
    release_admin_cap_id: id(0x82),
    clock_id: id(0x83),
    title_bytes: [0x41, 0xc3, 0xa9],
    published_at_ms: 12345678901234567n,
    assigned_track_count: 2n,
    shared_after: false,
    registry_id: id(0x88),
    release_digest: [0x01, 0xff, 0x20],
    nonce: 2n ** 200n + 123n,
    track_allocations: [
      { composition_id: id(0x89), recording_id: id(0x90), split_bps: 0 },
      { composition_id: id(0x89), recording_id: id(0x90), split_bps: 10000 },
    ],
  }).toBytes();

  expect(Effect.runSync(parse.parseReleasePublishedEvent(bytes))).toEqual({
    releaseId: id(0x81),
    releaseAdminCapId: id(0x82),
    clockId: id(0x83),
    titleBytes: [0x41, 0xc3, 0xa9],
    publishedAtMs: "12345678901234567",
    assignedTrackCount: "2",
    sharedAfter: false,
    registryId: id(0x88),
    releaseDigest: [0x01, 0xff, 0x20],
    nonce: "1606938044258990275541962092341162602522202993782792835301499",
    trackAllocations: [
      { compositionId: id(0x89), recordingId: id(0x90), splitBps: 0 },
      { compositionId: id(0x89), recordingId: id(0x90), splitBps: 10000 },
    ],
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
  const error = Effect.runSync(Effect.flip(parse.parseCompositionPublishedEvent(releaseRegistryBytes)));
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

describe("the Event overload's module::name suffix check", () => {
  const bytes = wire.compositionPublishedWire.serialize({
    composition_id: id(0xc1),
    composition_admin_cap_id: id(0xc2),
    clock_id: id(0xc3),
    title_bytes: [1],
    royalty_rate_bps: 1,
    published_at_ms: 1n,
    shared_after: true,
    share_currency_id: id(0xc4),
    consumed_treasury_cap_id: id(0xc5),
    created_by: id(0xc6),
    share_supply_before: 1n,
    share_supply_after: 1n,
    shares_returned: 0n,
    share_decimals: 6,
    share_supply_fixed_after: true,
    created_admin_cap_id: id(0xc7),
  }).toBytes();
  const packageA = id(0x01);
  const packageB = id(0x02);

  test("a different module::name is rejected with DecodeError before decoding", () => {
    const event = {
      packageId: ObjectId.make(packageA),
      module: "recording",
      sender: SuiAddress.make(id(0x03)),
      // Same bytes, but the tag names a different event entirely.
      eventType: `${packageA}::recording::RecordingPublishedEvent`,
      bcs: bytes,
    };
    const error = Effect.runSync(Effect.flip(parse.parseCompositionPublishedEvent(event)));
    expect(error._tag).toBe("DecodeError");
  });

  test("a different package, same module::name, is accepted (the package address is not checked)", () => {
    const event = {
      packageId: ObjectId.make(packageB),
      module: "composition",
      sender: SuiAddress.make(id(0x03)),
      eventType: `${packageB}::composition::CompositionPublishedEvent`,
      bcs: bytes,
    };
    const decoded = Effect.runSync(parse.parseCompositionPublishedEvent(event));
    expect(decoded.compositionId).toBe(id(0xc1));
  });

  test("a generic suffix on the event type is accepted (bareEventType strips it before comparing)", () => {
    const event = {
      packageId: ObjectId.make(packageA),
      module: "composition",
      sender: SuiAddress.make(id(0x03)),
      eventType: `${packageA}::composition::CompositionPublishedEvent<${packageA}::share::Share>`,
      bcs: bytes,
    };
    const decoded = Effect.runSync(parse.parseCompositionPublishedEvent(event));
    expect(decoded.compositionId).toBe(id(0xc1));
  });
});
