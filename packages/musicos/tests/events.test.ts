// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { Effect } from "effect";
import { ObjectId, SuiAddress, type DecodeError } from "@unconfirmed/sui-effect";
import { eventParsers } from "../src/events.ts";
import * as wire from "./event-fixtures.ts";

const id = (byte: number) => `0x${byte.toString(16).padStart(2, "0").repeat(32)}`;

test("core raw event decoders preserve the complete composition creation layout", () => {
  const bytes = wire.compositionCreatedWire.serialize({
    composition_id: id(0x11),
    composition_admin_cap_id: id(0x12),
    share_currency_id: id(0x13),
    consumed_treasury_cap_id: id(0x14),
    created_by: id(0x15),
    title_bytes: [1, 2, 3],
    royalty_rate_bps: 7,
    share_supply_before: 10n,
    share_supply_after: 11n,
    shares_returned: 12n,
    share_decimals: 6,
    share_supply_fixed_after: true,
  }).toBytes();
  expect(Effect.runSync(eventParsers.core.compositionCreated(bytes))).toEqual({
    composition_id: id(0x11),
    composition_admin_cap_id: id(0x12),
    share_currency_id: id(0x13),
    consumed_treasury_cap_id: id(0x14),
    created_by: id(0x15),
    title_bytes: [1, 2, 3],
    royalty_rate_bps: 7,
    share_supply_before: "10",
    share_supply_after: "11",
    shares_returned: "12",
    share_decimals: 6,
    share_supply_fixed_after: true,
  });
});

test("core raw event decoders preserve publication and legacy recording layouts", () => {
  const published = wire.recordingPublishedWire.serialize({
    recording_id: id(0x21),
    composition_id: id(0x22),
    recording_admin_cap_id: id(0x23),
    clock_id: id(0x24),
    published_at_ms: 9876543210123456n,
    shared_after: false,
  }).toBytes();
  expect(Effect.runSync(eventParsers.core.recordingPublished(published))).toEqual({
    recording_id: id(0x21),
    composition_id: id(0x22),
    recording_admin_cap_id: id(0x23),
    clock_id: id(0x24),
    published_at_ms: "9876543210123456",
    shared_after: false,
  });

  const legacy = wire.compositionSharesGrantedWire.serialize({
    recording_id: id(0x25),
    composition_id: id(0x26),
    value: 33n,
    rate_bps: 125,
    granted_by: id(0x27),
  }).toBytes();
  expect(Effect.runSync(eventParsers.core.compositionSharesGranted(legacy))).toEqual({
    recording_id: id(0x25),
    composition_id: id(0x26),
    value: "33",
    rate_bps: 125,
    granted_by: id(0x27),
  });
});

test("core raw event decoders preserve recording creation fields including zero values", () => {
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
  expect(Effect.runSync(eventParsers.core.recordingCreated(bytes))).toEqual({
    recording_id: id(0x31),
    composition_id: id(0x32),
    recording_admin_cap_id: id(0x33),
    share_currency_id: id(0x34),
    consumed_treasury_cap_id: id(0x35),
    created_by: id(0x36),
    composition_royalty_rate_bps: 0,
    share_supply_before: "0",
    shares_before_grant: "0",
    composition_shares_granted: "0",
    shares_returned: "0",
    share_decimals: 0,
    share_supply_fixed_after: false,
    composition_funds_sent: false,
  });
});

test("core raw event decoders preserve release creation and ordered arrays", () => {
  const bytes = wire.releaseCreatedWire.serialize({
    registry_id: id(0x41),
    release_id: id(0x42),
    release_admin_cap_id: id(0x43),
    title_bytes: [0xe2, 0x98, 0x83],
    release_digest: [0, 255, 1],
    nonce: 2n ** 200n + 123n,
    composition_ids: [id(0x44), id(0x45)],
    recording_ids: [id(0x46), id(0x47)],
    track_split_bps: [1111n, 8889n],
    track_count: 2n,
  }).toBytes();
  expect(Effect.runSync(eventParsers.core.releaseCreated(bytes))).toEqual({
    registry_id: id(0x41),
    release_id: id(0x42),
    release_admin_cap_id: id(0x43),
    title_bytes: [0xe2, 0x98, 0x83],
    release_digest: [0, 255, 1],
    nonce: "1606938044258990275541962092341162602522202993782792835301499",
    composition_ids: [id(0x44), id(0x45)],
    recording_ids: [id(0x46), id(0x47)],
    track_split_bps: ["1111", "8889"],
    track_count: "2",
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
  }).toBytes();
  expect(Effect.runSync(eventParsers.core.compositionPublished(composition))).toEqual({
    composition_id: id(0x51),
    composition_admin_cap_id: id(0x52),
    clock_id: id(0x53),
    title_bytes: [1, 2],
    royalty_rate_bps: 900,
    published_at_ms: "123",
    shared_after: true,
  });

  const release = wire.releasePublishedWire.serialize({
    release_id: id(0x54),
    release_admin_cap_id: id(0x55),
    clock_id: id(0x56),
    title_bytes: [3, 4],
    published_at_ms: 456n,
    composition_ids: [id(0x57), id(0x58)],
    recording_ids: [id(0x59), id(0x5a)],
    track_split_bps: [4000n, 6000n],
    assigned_track_count: 2n,
    shared_after: false,
  }).toBytes();
  expect(Effect.runSync(eventParsers.core.releasePublished(release))).toEqual({
    release_id: id(0x54),
    release_admin_cap_id: id(0x55),
    clock_id: id(0x56),
    title_bytes: [3, 4],
    published_at_ms: "456",
    composition_ids: [id(0x57), id(0x58)],
    recording_ids: [id(0x59), id(0x5a)],
    track_split_bps: ["4000", "6000"],
    assigned_track_count: "2",
    shared_after: false,
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
      eventParsers.core.compositionCreated,
      wire.compositionCreatedWire.serialize({
        composition_id: id(0x61),
        composition_admin_cap_id: id(0x62),
        share_currency_id: id(0x63),
        consumed_treasury_cap_id: id(0x64),
        created_by: id(0x65),
        title_bytes: [1],
        royalty_rate_bps: 1,
        share_supply_before: 1n,
        share_supply_after: 1n,
        shares_returned: 0n,
        share_decimals: 6,
        share_supply_fixed_after: true,
      }).toBytes(),
    ],
    [
      eventParsers.core.recordingCreated,
      wire.recordingCreatedWire.serialize({
        recording_id: id(0x66),
        composition_id: id(0x67),
        recording_admin_cap_id: id(0x68),
        share_currency_id: id(0x69),
        consumed_treasury_cap_id: id(0x6a),
        created_by: id(0x6b),
        composition_royalty_rate_bps: 0,
        share_supply_before: 0n,
        shares_before_grant: 0n,
        composition_shares_granted: 0n,
        shares_returned: 0n,
        share_decimals: 0,
        share_supply_fixed_after: false,
        composition_funds_sent: false,
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
        composition_ids: [],
        recording_ids: [],
        track_split_bps: [],
        assigned_track_count: 0n,
        shared_after: false,
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
  const error = Effect.runSync(Effect.flip(eventParsers.core.compositionCreated(releaseRegistryBytes)));
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
