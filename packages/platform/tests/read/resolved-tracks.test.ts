import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { contracts } from "@misofm/musicos";
import { SuiGraphQL } from "@unconfirmed/sui-effect";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { layerTest, type FakeObject } from "@unconfirmed/sui-effect/testing";
import { getReleaseDetail } from "../../src/read/catalog.ts";
import { misoConfig } from "../../src/read/config.ts";

const releaseId = `0x${"11".repeat(32)}`;
const recordingId = `0x${"22".repeat(32)}`;
const compositionId = `0x${"33".repeat(32)}`;
const config = misoConfig("testnet");
const graphql = { query: async () => { throw new Error("Track objects must resolve directly by ID"); } } as unknown as SuiGraphQLClient;
function objects(includeRecording: boolean): FakeObject[] {
  return [
    { objectId: releaseId, type: `${config.deployment.musicos}::release::Release`, version: 1n,
      content: contracts.release.Release.serialize({ id: releaseId, state: { Published: 123n }, title: "EP", tracks:
        [6000, 4000].map(split => ({ state: { Assigned: true }, recording_id: recordingId, composition_id: compositionId, split_bps: [split] }))
      }).toBytes() },
    { objectId: compositionId, type: `${config.deployment.musicos}::composition::Composition<0x2::sui::SUI>`, version: 1n,
      content: contracts.composition.Composition.serialize({ id: compositionId, state: { Published: 122n }, title: "Song", royalty_rate: [1500] }).toBytes() },
    ...(includeRecording ? [{ objectId: recordingId, type: `${config.deployment.musicos}::recording::Recording<0x2::sui::SUI,0x2::sui::SUI>`, version: 1n,
      content: contracts.recording.Recording.serialize({ id: recordingId, state: { Published: 123n }, composition_id: compositionId }).toBytes() }] : []),
  ];
}
test("release resolves required full objects and preserves repeated tracks", async () => {
    const result = await Effect.runPromise(Effect.provide(getReleaseDetail(releaseId, config),
      Layer.mergeAll(layerTest({ objects: objects(true) }), SuiGraphQL.layer(graphql)), { local: true }));
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks.map(track => track.splitBps)).toEqual([6000, 4000]);
    for (const track of result.tracks) {
      expect(track.title).toBe("Song");
      expect(track).not.toHaveProperty("recordingId");
      expect(track).not.toHaveProperty("compositionId");
      expect(track.recording).toEqual({ id: recordingId, state: { type: "Published", timestampMs: 123 }, compositionId });
      expect(track.composition).toEqual({ id: compositionId, state: { type: "Published", timestampMs: 122 }, title: "Song", royaltyRate: { value: 1500 } });
    }
    expect(() => JSON.stringify(result)).not.toThrow();
});

test("release fails when a referenced recording cannot be resolved", async () => {
  const error = await Effect.runPromise(Effect.flip(Effect.provide(getReleaseDetail(releaseId, config),
    Layer.mergeAll(layerTest({ objects: objects(false) }), SuiGraphQL.layer(graphql)), { local: true })));
  expect(error._tag).toBe("DecodeError");
  expect(error.message).toContain(recordingId);
});

import { bcs } from "@mysten/sui/bcs";
import { Audio } from "../../src/contracts/audio/audio.ts";
import { ExtensionKey } from "../../src/contracts/recording_master/recording_master.ts";
import { recordingMasterFieldId } from "../../src/recording-extensions.ts";
import { u256ToB64Url } from "../../src/read/internal/walrus.ts";

test("release retains the complete master Audio alongside the legacy blob ID", async () => {
  const id = recordingMasterFieldId(recordingId, config.protocol.recordingMaster!);
  const master = { format: "flac", channels: 2, bit_depth: 24, sample_rate_hz: 44100,
    samples: "8500549", pcm_digest: Array(32).fill(3),
    data: { blob_id: "42", confidentiality: { Encrypted: { sealed_dek: [1, 2, 3] } } } };
  const content = bcs.struct("Field", { id: bcs.Address, name: ExtensionKey, value: Audio })
    .serialize({ id, name: [false], value: master }).toBytes();
  const result = await Effect.runPromise(Effect.provide(getReleaseDetail(releaseId, config),
    Layer.mergeAll(layerTest({ objects: [...objects(true), { objectId: id, type: "0x2::dynamic_field::Field", version: 1n, content }] }), SuiGraphQL.layer(graphql)), { local: true }));
  for (const track of result.tracks) {
    expect(track.master).toMatchObject(master);
    expect(track.masterBlobId).toBe(u256ToB64Url("42"));
  }
  expect(JSON.parse(JSON.stringify(result)).tracks[0].master).toEqual(result.tracks[0]!.master);
});
