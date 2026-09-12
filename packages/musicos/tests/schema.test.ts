// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Every codec in `src/schema.ts`: decodes bytes a generated codec serialized
// into the domain class the bridge composes it with, and rejects an
// `objectBcs`-style envelope — bytes with a trailing byte the struct itself
// would never produce — with `DecodeError`, via the bridge's re-serialize
// length check (independent of any type-tag comparison).

import { describe, expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import { SuiSchema } from "@unconfirmed/sui-effect";
import * as compositionContract from "../src/contracts/musicos/composition.ts";
import * as recordingContract from "../src/contracts/musicos/recording.ts";
import * as releaseContract from "../src/contracts/musicos/release.ts";
import * as schema from "../src/schema.ts";
import { Composition, Recording, Release, ReleaseAdminCap, ReleaseRegistry } from "../src/types.ts";

const PKG = `0x${"cd".repeat(32)}`;
const ADDR = `0x${"ab".repeat(32)}`;

describe("object codecs", () => {
  test("compositionContent decodes into a Composition instance, tag-matching every share type", () => {
    const bytes = compositionContract.Composition.serialize({
      id: ADDR,
      state: { Initialized: true },
      title: "Song",
      royalty_rate: [1000],
    }).toBytes();
    const composition = Effect.runSync(
      SuiSchema.decode(schema.compositionContent(PKG), bytes, { actualType: `${PKG}::composition::Composition<${PKG}::share::Share>` }),
    );
    expect(composition).toBeInstanceOf(Composition);
    expect(composition.id).toBe(ADDR);
    expect(composition.title).toBe("Song");
    expect(composition.royaltyRate.value).toBe(1000);
  });

  test("compositionContent rejects a mismatched instantiation of a DIFFERENT generic (not a bare match)", () => {
    const bytes = compositionContract.Composition.serialize({
      id: ADDR,
      state: { Initialized: true },
      title: "Song",
      royalty_rate: [1000],
    }).toBytes();
    const error = Effect.runSync(
      Effect.flip(
        SuiSchema.decode(schema.compositionContent(PKG), bytes, {
          // A Recording, not a Composition: a real type mismatch, not merely a
          // different instantiation of the same generic.
          actualType: `${PKG}::recording::Recording<${PKG}::a::A, ${PKG}::b::B>`,
        }),
      ),
    );
    expect(error._tag).toBe("DecodeError");
  });

  test("recordingContent decodes into a Recording instance", () => {
    const bytes = recordingContract.Recording.serialize({
      id: ADDR,
      state: { Published: "1700000000000" },
      composition_id: ADDR,
    }).toBytes();
    const recording = Effect.runSync(SuiSchema.decode(schema.recordingContent(PKG), bytes));
    expect(recording).toBeInstanceOf(Recording);
    expect(recording.state).toEqual({ type: "Published", timestampMs: 1700000000000 });
    expect(recording.compositionId).toBe(ADDR);
  });

  test("releaseContent decodes a release with its ordered tracklist", () => {
    const bytes = releaseContract.Release.serialize({
      id: ADDR,
      state: { Initialized: true },
      title: "Release",
      tracks: [{ state: { Assigned: true }, composition_id: ADDR, recording_id: ADDR, split_bps: [5000] }],
    }).toBytes();
    const release = Effect.runSync(SuiSchema.decode(schema.releaseContent(PKG), bytes));
    expect(release).toBeInstanceOf(Release);
    expect(release.tracks).toHaveLength(1);
    expect(release.tracks[0]).toEqual({ state: "Assigned", compositionId: ADDR, recordingId: ADDR, splitBps: { value: 5000 } });
  });

  test("releaseRegistryContent decodes into a ReleaseRegistry instance", () => {
    const bytes = releaseContract.ReleaseRegistry.serialize({ id: ADDR }).toBytes();
    const registry = Effect.runSync(SuiSchema.decode(schema.releaseRegistryContent(PKG), bytes));
    expect(registry).toBeInstanceOf(ReleaseRegistry);
    expect(registry.id).toBe(ADDR);
  });

  test("releaseAdminCapContent decodes id and releaseId from BCS content", () => {
    const bytes = releaseContract.ReleaseAdminCap.serialize({ id: ADDR, release_id: ADDR }).toBytes();
    const cap = Effect.runSync(SuiSchema.decode(schema.releaseAdminCapContent(PKG), bytes));
    expect(cap).toBeInstanceOf(ReleaseAdminCap);
    expect(cap.releaseId).toBe(ADDR);
  });

  test("compositionAdminCapContent decodes only { id }; the share type is not in BCS content", () => {
    const bytes = compositionContract.CompositionAdminCap.serialize({ id: ADDR }).toBytes();
    const decoded = Effect.runSync(SuiSchema.decode(schema.compositionAdminCapContent(PKG), bytes));
    expect(decoded).toEqual({ id: ADDR });
  });

  test("recordingAdminCapContent decodes only { id }", () => {
    const bytes = recordingContract.RecordingAdminCap.serialize({ id: ADDR }).toBytes();
    const decoded = Effect.runSync(SuiSchema.decode(schema.recordingAdminCapContent(PKG), bytes));
    expect(decoded).toEqual({ id: ADDR });
  });
});

describe("the re-serialize length check rejects a trailing byte", () => {
  test("an objectBcs-style envelope (one extra trailing byte) does not decode as the struct it wraps", () => {
    const bytes = releaseContract.ReleaseRegistry.serialize({ id: ADDR }).toBytes();
    const envelope = new Uint8Array([...bytes, 0]);
    const error = Effect.runSync(Effect.flip(SuiSchema.decode(schema.releaseRegistryContent(PKG), envelope)));
    expect(error._tag).toBe("DecodeError");
  });

  test("the same envelope rejects a Release, a Composition and a ReleaseAdminCap the same way", () => {
    const releaseBytes = releaseContract.Release.serialize({
      id: ADDR,
      state: { Initialized: true },
      title: "R",
      tracks: [],
    }).toBytes();
    const compositionBytes = compositionContract.Composition.serialize({
      id: ADDR,
      state: { Initialized: true },
      title: "C",
      royalty_rate: [1],
    }).toBytes();
    const adminCapBytes = releaseContract.ReleaseAdminCap.serialize({ id: ADDR, release_id: ADDR }).toBytes();

    const cases: ReadonlyArray<readonly [Schema.Codec<unknown, Uint8Array>, Uint8Array]> = [
      [schema.releaseContent(PKG), releaseBytes],
      [schema.compositionContent(PKG), compositionBytes],
      [schema.releaseAdminCapContent(PKG), adminCapBytes],
    ];
    for (const [codec, bytes] of cases) {
      const envelope = new Uint8Array([...bytes, 0]);
      const error = Effect.runSync(Effect.flip(SuiSchema.decode(codec, envelope)));
      expect(error._tag).toBe("DecodeError");
    }
  });
});

describe("event codecs", () => {
  test("compositionCreatedEventContent decodes the raw snake_case shape", () => {
    const bytes = compositionContract.CompositionCreatedEvent.serialize({
      composition_id: ADDR,
      composition_admin_cap_id: ADDR,
      share_currency_id: ADDR,
      consumed_treasury_cap_id: ADDR,
      created_by: ADDR,
      title_bytes: [1, 2, 3],
      royalty_rate_bps: 500,
      share_supply_before: 1n,
      share_supply_after: 2n,
      shares_returned: 0n,
      share_decimals: 6,
      share_supply_fixed_after: true,
    }).toBytes();
    const decoded = Effect.runSync(SuiSchema.decode(schema.compositionCreatedEventContent, bytes));
    expect(decoded.composition_id).toBe(ADDR);
    expect(decoded.royalty_rate_bps).toBe(500);
  });
});

test("the domain class encode direction is the inverse mapper (round-trips through Schema.encodeUnknownEffect)", () => {
  const bytes = compositionContract.Composition.serialize({
    id: ADDR,
    state: { Published: "1700000000000" },
    title: "Song",
    royalty_rate: [2500],
  }).toBytes();
  const composition = Effect.runSync(SuiSchema.decode(schema.compositionContent(PKG), bytes));
  const encoded = Effect.runSync(Schema.encodeUnknownEffect(schema.compositionContent(PKG))(composition));
  expect(Array.from(encoded)).toEqual(Array.from(bytes));
});
