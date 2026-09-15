// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { Effect } from "effect";
import { ObjectId, SuiAddress, type DecodeError } from "@unconfirmed/sui-effect";
import { eventParsers } from "../src/events.ts";
import * as wire from "./event-fixtures.ts";

const id = (byte: number) => `0x${byte.toString(16).padStart(2, "0").repeat(32)}`;

test("recording publication preserves the composition grant receipt", () => {
  const published = wire.recordingPublishedWire.serialize({
    recording_id: id(0x21),
    composition_id: id(0x22),
    recording_admin_cap_id: id(0x23),
    clock_id: id(0x24),
    published_at_ms: 9876543210123456n,
    shared_after: false,
    share_currency_id: id(0x28),
    consumed_treasury_cap_id: id(0x29),
    created_by: id(0x2a),
    composition_royalty_rate_bps: 2500,
    share_supply_before: 100n,
    shares_before_grant: 90n,
    composition_shares_granted: 10n,
    shares_returned: 80n,
    share_decimals: 6,
    share_supply_fixed_after: true,
    composition_funds_sent: true,
    created_admin_cap_id: id(0x2b),
  }).toBytes();
  expect(Effect.runSync(eventParsers.core.recordingPublished(published))).toEqual({
    recording_id: id(0x21),
    composition_id: id(0x22),
    recording_admin_cap_id: id(0x23),
    clock_id: id(0x24),
    published_at_ms: "9876543210123456",
    shared_after: false,
    share_currency_id: id(0x28),
    consumed_treasury_cap_id: id(0x29),
    created_by: id(0x2a),
    composition_royalty_rate_bps: 2500,
    share_supply_before: "100",
    shares_before_grant: "90",
    composition_shares_granted: "10",
    shares_returned: "80",
    share_decimals: 6,
    share_supply_fixed_after: true,
    composition_funds_sent: true,
    created_admin_cap_id: id(0x2b),
  });
});

test("core raw event decoders preserve every publication and registry field", () => {
  const composition = wire.compositionPublishedWire.serialize({
    composition_id: id(0x51),
    composition_admin_cap_id: id(0x52),
    clock_id: id(0x53),
    title_bytes: [1, 2],
    royalty_rate_bps: 900,
    published_at_ms: 123n,
    shared_after: true,
    share_currency_id: id(0x57),
    consumed_treasury_cap_id: id(0x58),
    created_by: id(0x59),
    share_supply_before: 10n,
    share_supply_after: 11n,
    shares_returned: 1n,
    share_decimals: 6,
    share_supply_fixed_after: true,
    created_admin_cap_id: id(0x5a),
  }).toBytes();
  expect(Effect.runSync(eventParsers.core.compositionPublished(composition))).toEqual({
    composition_id: id(0x51),
    composition_admin_cap_id: id(0x52),
    clock_id: id(0x53),
    title_bytes: [1, 2],
    royalty_rate_bps: 900,
    published_at_ms: "123",
    shared_after: true,
    share_currency_id: id(0x57),
    consumed_treasury_cap_id: id(0x58),
    created_by: id(0x59),
    share_supply_before: "10",
    share_supply_after: "11",
    shares_returned: "1",
    share_decimals: 6,
    share_supply_fixed_after: true,
    created_admin_cap_id: id(0x5a),
  });

  const release = wire.releasePublishedWire.serialize({
    release_id: id(0x54),
    release_admin_cap_id: id(0x55),
    clock_id: id(0x56),
    title_bytes: [3, 4],
    published_at_ms: 456n,
    assigned_track_count: 2n,
    shared_after: false,
    registry_id: id(0x5c),
    release_digest: [9, 8, 7],
    nonce: 123n,
  }).toBytes();
  expect(Effect.runSync(eventParsers.core.releasePublished(release))).toEqual({
    release_id: id(0x54),
    release_admin_cap_id: id(0x55),
    clock_id: id(0x56),
    title_bytes: [3, 4],
    published_at_ms: "456",
    assigned_track_count: "2",
    shared_after: false,
    registry_id: id(0x5c),
    release_digest: [9, 8, 7],
    nonce: "123",
  });

  const registry = wire.releaseRegistryCreatedWire.serialize({
    registry_id: id(0x5b),
    created_by: id(0x5c),
    shared_after: true,
  }).toBytes();
  expect(Effect.runSync(eventParsers.core.releaseRegistryCreated(registry))).toEqual({
    registry_id: id(0x5b),
    created_by: id(0x5c),
    shared_after: true,
  });
});

test("core event decoders fail with DecodeError, not a thrown Error, on truncated BCS bytes", () => {
  const fixtures: ReadonlyArray<readonly [(bytes: Uint8Array) => Effect.Effect<unknown, DecodeError>, Uint8Array]> = [
    [
      eventParsers.core.compositionPublished,
      wire.compositionPublishedWire.serialize({
        composition_id: id(0x61),
        composition_admin_cap_id: id(0x62),
        clock_id: id(0x63),
        title_bytes: [1],
        royalty_rate_bps: 1,
        published_at_ms: 1n,
        shared_after: false,
        share_currency_id: id(0x64),
        consumed_treasury_cap_id: id(0x65),
        created_by: id(0x66),
        share_supply_before: 1n,
        share_supply_after: 1n,
        shares_returned: 0n,
        share_decimals: 6,
        share_supply_fixed_after: true,
        created_admin_cap_id: id(0x67),
      }).toBytes(),
    ],
    [
      eventParsers.core.recordingPublished,
      wire.recordingPublishedWire.serialize({
        recording_id: id(0x68),
        composition_id: id(0x69),
        recording_admin_cap_id: id(0x6a),
        clock_id: id(0x6b),
        published_at_ms: 1n,
        shared_after: false,
        share_currency_id: id(0x6c),
        consumed_treasury_cap_id: id(0x6d),
        created_by: id(0x6e),
        composition_royalty_rate_bps: 0,
        share_supply_before: 0n,
        shares_before_grant: 0n,
        composition_shares_granted: 0n,
        shares_returned: 0n,
        share_decimals: 0,
        share_supply_fixed_after: false,
        composition_funds_sent: false,
        created_admin_cap_id: id(0x6f),
      }).toBytes(),
    ],
    [
      eventParsers.core.releasePublished,
      wire.releasePublishedWire.serialize({
        release_id: id(0x6c),
        release_admin_cap_id: id(0x6d),
        clock_id: id(0x6e),
        title_bytes: [1],
        published_at_ms: 1n,
        assigned_track_count: 0n,
        shared_after: false,
        registry_id: id(0x70),
        release_digest: [1],
        nonce: 0n,
      }).toBytes(),
    ],
  ] as const;

  for (const [decode, bytes] of fixtures) {
    const error = Effect.runSync(Effect.flip(decode(bytes.slice(0, -1))));
    expect(error._tag).toBe("DecodeError");
  }
});

test("a decoder fed a different event's bytes fails with DecodeError (the re-serialize length check, independent of any type tag)", () => {
  const releaseRegistryBytes = wire.releaseRegistryCreatedWire.serialize({
    registry_id: id(0x71),
    created_by: id(0x72),
    shared_after: true,
  }).toBytes();
  const error = Effect.runSync(Effect.flip(eventParsers.core.compositionPublished(releaseRegistryBytes)));
  expect(error._tag).toBe("DecodeError");
});

test("the second overload decodes a sui-effect Event's .bcs bytes", () => {
  const bytes = wire.releaseRegistryCreatedWire.serialize({
    registry_id: id(0x81),
    created_by: id(0x82),
    shared_after: false,
  }).toBytes();
  const event = {
    packageId: ObjectId.make(id(0x01)),
    module: "release",
    sender: SuiAddress.make(id(0x02)),
    eventType: `${id(0x01)}::release::ReleaseRegistryCreatedEvent`,
    bcs: bytes,
  };
  expect(Effect.runSync(eventParsers.core.releaseRegistryCreated(event))).toEqual({
    registry_id: id(0x81),
    created_by: id(0x82),
    shared_after: false,
  });
});
