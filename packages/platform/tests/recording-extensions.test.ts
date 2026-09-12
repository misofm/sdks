// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";
import { Effect } from "effect";
import type { Sui } from "@unconfirmed/sui-effect";
import { layerTest, SuiTest, type FakeObject } from "@unconfirmed/sui-effect/testing";
import * as walrusData from "../src/contracts/cover_art/deps/ori/data.ts";
import * as masterReference from "../src/contracts/recording_master_reference/recording_master_reference.ts";
import * as engineSessionContract from "../src/contracts/recording_engine_session/recording_engine_session.ts";
import {
  getRecordingEngineSession,
  getRecordingMasterReference,
  getRecordingMasterReferencesByIds,
  recordingEngineSessionFieldId,
  recordingMasterReferenceFieldId,
  setRecordingEngineSession,
  setRecordingMasterReference,
  setRecordingStreamingTranscode,
  unsetRecordingEngineSession,
  unsetRecordingStreamingTranscode,
} from "../src/recording-extensions.ts";
import { unencryptedWalrusBlob } from "../src/internal.ts";

const RECORDING_ONE = `0x${"11".repeat(32)}`;
const RECORDING_TWO = `0x${"22".repeat(32)}`;
const PACKAGE = `0x${"33".repeat(32)}`;
const ORI_PACKAGE = `0x${"44".repeat(32)}`;
const STREAMING_PACKAGE = `0x${"55".repeat(32)}`;
const ENGINE_SESSION_PACKAGE = `0x${"77".repeat(32)}`;
const CAP = `0x${"66".repeat(32)}`;
const RECORDING_SHARE = `${PACKAGE}::recording_share::RECORDING_SHARE`;
const COMPOSITION_SHARE = `${PACKAGE}::composition_share::COMPOSITION_SHARE`;
const BLOB_ID = 123456789n;

const Field = bcs.struct("Field", {
  id: bcs.Address,
  name: masterReference.ExtensionKey,
  value: walrusData.WalrusBlob,
});

function masterContent(recordingId: string): Uint8Array {
  return Field.serialize({
    id: recordingMasterReferenceFieldId(recordingId, PACKAGE),
    name: [false],
    value: { blob_id: BLOB_ID, confidentiality: { Unencrypted: true } },
  }).toBytes();
}

interface MoveCall {
  package?: string;
  module: string;
  function: string;
  typeArguments: string[];
}

function moveCalls(tx: Transaction): MoveCall[] {
  return tx.getData().commands.flatMap((command) =>
    command.$kind === "MoveCall" ? [command.MoveCall as MoveCall] : []
  );
}

function run<A, E>(effect: Effect.Effect<A, E, Sui>, objects: FakeObject[]): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, layerTest({ objects }), { local: true }));
}

function runScripted<A, E>(effect: Effect.Effect<A, E, Sui>, objects: FakeObject[]): Promise<{ result: A; calls: readonly string[][] }> {
  return Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const result = yield* effect;
        const recorded = yield* SuiTest.calls("getObjects");
        const calls = recorded.map((call) => (call.options as { objectIds: readonly string[] }).objectIds as string[]);
        return { result, calls };
      }),
      layerTest({ objects }),
      { local: true },
    ),
  );
}

test("builds a composable streaming-transcode attachment from a complete Quilt ID", () => {
  const tx = new Transaction();
  setRecordingStreamingTranscode({
    recordingId: RECORDING_ONE,
    authority: { kind: "direct", adminCap: CAP },
    recordingShareType: RECORDING_SHARE,
    compositionShareType: COMPOSITION_SHARE,
    recordingStreamingTranscodePackageId: STREAMING_PACKAGE,
    oriPackageId: ORI_PACKAGE,
    quiltId: BLOB_ID,
  })(tx);

  const calls = moveCalls(tx);
  expect(calls.map((call) => `${call.module}::${call.function}`)).toEqual([
    "data::new_quilt",
    "recording_streaming_transcode::new",
    "recording_streaming_transcode::set_streaming_transcode",
  ]);
  expect(calls.map((call) => call.package)).toEqual([
    ORI_PACKAGE,
    STREAMING_PACKAGE,
    STREAMING_PACKAGE,
  ]);
  expect(calls[2]!.typeArguments).toEqual([
    RECORDING_SHARE,
    COMPOSITION_SHARE,
  ]);
});

test("builds a master reference from a plaintext ori::data::WalrusBlob", () => {
  const tx = new Transaction();
  setRecordingMasterReference({
    recordingId: RECORDING_ONE,
    authority: { kind: "direct", adminCap: CAP },
    recordingShareType: RECORDING_SHARE,
    compositionShareType: COMPOSITION_SHARE,
    recordingMasterReferencePackageId: PACKAGE,
    reference: unencryptedWalrusBlob(tx, ORI_PACKAGE, BLOB_ID),
  })(tx);

  const calls = moveCalls(tx);
  expect(calls.map((call) => `${call.module}::${call.function}`)).toEqual([
    "confidentiality::new_unencrypted",
    "data::new_blob",
    "recording_master_reference::set_master_reference",
  ]);
  expect(calls.map((call) => call.package)).toEqual([ORI_PACKAGE, ORI_PACKAGE, PACKAGE]);
});

test("builds an engine session with stems sorted by digest", () => {
  const tx = new Transaction();
  setRecordingEngineSession({
    recordingId: RECORDING_ONE,
    authority: { kind: "direct", adminCap: CAP },
    recordingShareType: RECORDING_SHARE,
    compositionShareType: COMPOSITION_SHARE,
    recordingEngineSessionPackageId: ENGINE_SESSION_PACKAGE,
    oriPackageId: ORI_PACKAGE,
    sessionBlobId: BLOB_ID,
    stems: [
      { digest: "ff".repeat(32), blobId: 2n },
      { digest: new Uint8Array(32), blobId: 1n },
    ],
  })(tx);

  const calls = moveCalls(tx);
  expect(calls.map((call) => `${call.module}::${call.function}`)).toEqual([
    "confidentiality::new_unencrypted",
    "data::new_blob",
    "confidentiality::new_unencrypted",
    "data::new_blob",
    "recording_engine_session::new_stem",
    "confidentiality::new_unencrypted",
    "data::new_blob",
    "recording_engine_session::new_stem",
    "recording_engine_session::new",
    "recording_engine_session::set_engine_session",
  ]);
  expect(calls[9]!.package).toBe(ENGINE_SESSION_PACKAGE);
  expect(calls[9]!.typeArguments).toEqual([RECORDING_SHARE, COMPOSITION_SHARE]);
  // The zero digest sorts first: its stem's blob (1n) is built before 2n.
  const inputs = tx.getData().inputs.map((input) =>
    input.$kind === "Pure" ? Buffer.from(input.Pure.bytes, "base64").toString("hex") : null,
  );
  const blobOrder = inputs.filter((hex) => hex !== null && hex.length === 64);
  expect(blobOrder[1]!.startsWith("01")).toBe(true);
  expect(blobOrder[2]!.startsWith("02")).toBe(true);
  expect(tx.getData().commands.some((command) => command.$kind === "MakeMoveVec")).toBe(true);

  expect(() => setRecordingEngineSession({
    recordingId: RECORDING_ONE,
    authority: { kind: "direct", adminCap: CAP },
    recordingShareType: RECORDING_SHARE,
    compositionShareType: COMPOSITION_SHARE,
    recordingEngineSessionPackageId: ENGINE_SESSION_PACKAGE,
    oriPackageId: ORI_PACKAGE,
    sessionBlobId: BLOB_ID,
    stems: [{ digest: "aa".repeat(32), blobId: 1n }, { digest: "aa".repeat(32), blobId: 2n }],
  })).toThrow(/duplicate stem digest/);
  expect(() => setRecordingEngineSession({
    recordingId: RECORDING_ONE,
    authority: { kind: "direct", adminCap: CAP },
    recordingShareType: RECORDING_SHARE,
    compositionShareType: COMPOSITION_SHARE,
    recordingEngineSessionPackageId: ENGINE_SESSION_PACKAGE,
    oriPackageId: ORI_PACKAGE,
    sessionBlobId: BLOB_ID,
    stems: [{ digest: "aa", blobId: 1n }],
  })).toThrow(/32 bytes/);

  const unset = new Transaction();
  unsetRecordingEngineSession({
    recordingId: RECORDING_ONE,
    authority: { kind: "direct", adminCap: CAP },
    recordingShareType: RECORDING_SHARE,
    compositionShareType: COMPOSITION_SHARE,
    recordingEngineSessionPackageId: ENGINE_SESSION_PACKAGE,
  })(unset);
  expect(moveCalls(unset).map((call) => `${call.module}::${call.function}`)).toEqual([
    "recording_engine_session::unset_engine_session",
  ]);
});

test("reads an engine session's session blob and stems table", async () => {
  const fieldId = recordingEngineSessionFieldId(RECORDING_ONE, ENGINE_SESSION_PACKAGE);
  const EngineSessionField = bcs.struct("Field", {
    id: bcs.Address,
    name: engineSessionContract.ExtensionKey,
    value: engineSessionContract.EngineSession,
  });
  const content = EngineSessionField.serialize({
    id: fieldId,
    name: [false],
    value: {
      data: { blob_id: 7n, confidentiality: { Unencrypted: true } },
      stems: [
        { digest: Array.from(new Uint8Array(32)), data: { blob_id: 1n, confidentiality: { Unencrypted: true } } },
        { digest: Array.from(new Uint8Array(32).fill(0xff)), data: { blob_id: 2n, confidentiality: { Unencrypted: true } } },
      ],
    },
  }).toBytes();
  const objects: FakeObject[] = [{ objectId: fieldId, type: "0x2::dynamic_field::Field", version: 1n, content }];
  await expect(run(getRecordingEngineSession(RECORDING_ONE, ENGINE_SESSION_PACKAGE), objects)).resolves.toEqual({
    sessionBlobId: "7",
    stems: [
      { digest: "00".repeat(32), blobId: "1" },
      { digest: "ff".repeat(32), blobId: "2" },
    ],
  });
});

test("builds an idempotent streaming-transcode removal", () => {
  const tx = new Transaction();
  unsetRecordingStreamingTranscode({
    recordingId: RECORDING_ONE,
    authority: { kind: "direct", adminCap: CAP },
    recordingShareType: RECORDING_SHARE,
    compositionShareType: COMPOSITION_SHARE,
    recordingStreamingTranscodePackageId: STREAMING_PACKAGE,
  })(tx);

  expect(moveCalls(tx).map((call) => `${call.module}::${call.function}`)).toEqual([
    "recording_streaming_transcode::unset_streaming_transcode",
  ]);
});

test("reads a Recording's master-reference blob id", async () => {
  const fieldId = recordingMasterReferenceFieldId(RECORDING_ONE, PACKAGE);
  const objects: FakeObject[] = [
    { objectId: fieldId, type: "0x2::dynamic_field::Field", version: 1n, content: masterContent(RECORDING_ONE) },
  ];

  await expect(
    run(getRecordingMasterReference(RECORDING_ONE, PACKAGE), objects),
  ).resolves.toBe(String(BLOB_ID));
});

test("batches unique master-reference fields and omits absent recordings", async () => {
  const objects: FakeObject[] = [
    {
      objectId: recordingMasterReferenceFieldId(RECORDING_ONE, PACKAGE),
      type: "0x2::dynamic_field::Field",
      version: 1n,
      content: masterContent(RECORDING_ONE),
    },
    // No FakeObject for RECORDING_TWO's field: sui.getObjects reports it
    // ObjectNotFound, and the soft read (readSoftFields) drops it.
  ];

  const { result, calls } = await runScripted(
    getRecordingMasterReferencesByIds([RECORDING_ONE, RECORDING_TWO, RECORDING_ONE], PACKAGE),
    objects,
  );
  expect(result).toEqual({ [RECORDING_ONE]: String(BLOB_ID) });
  expect(calls).toEqual([
    [
      recordingMasterReferenceFieldId(RECORDING_ONE, PACKAGE),
      recordingMasterReferenceFieldId(RECORDING_TWO, PACKAGE),
    ],
  ]);
});

// ── Streaming transcode and batched engine-session reads ────────────────────

import * as streamingTranscodeContract from "../src/contracts/recording_streaming_transcode/recording_streaming_transcode.ts";
import {
  getRecordingEngineSessionsByIds,
  getRecordingStreamingTranscode,
  getRecordingStreamingTranscodesByIds,
  recordingEngineSessionFieldId,
  recordingStreamingTranscodeFieldId,
} from "../src/recording-extensions.ts";

const QUILT_ID = 987654321n;
const TranscodeField = bcs.struct("Field", {
  id: bcs.Address,
  name: streamingTranscodeContract.ExtensionKey,
  value: streamingTranscodeContract.StreamingTranscode,
});

function transcodeContent(recordingId: string): Uint8Array {
  return TranscodeField.serialize({
    id: recordingStreamingTranscodeFieldId(recordingId, PACKAGE),
    name: [false],
    value: { quilt: { quilt_id: QUILT_ID } },
  }).toBytes();
}

const SessionField = bcs.struct("Field", {
  id: bcs.Address,
  name: engineSessionContract.ExtensionKey,
  value: engineSessionContract.EngineSession,
});
const STEM_DIGEST = new Uint8Array(32).fill(7);

function sessionContent(recordingId: string): Uint8Array {
  return SessionField.serialize({
    id: recordingEngineSessionFieldId(recordingId, PACKAGE),
    name: [false],
    value: {
      data: { blob_id: BLOB_ID, confidentiality: { Unencrypted: true } },
      stems: [
        {
          digest: Array.from(STEM_DIGEST),
          data: { blob_id: QUILT_ID, confidentiality: { Unencrypted: true } },
        },
      ],
    },
  }).toBytes();
}

function batchObjects(content: (recordingId: string) => Uint8Array, fieldId: string): FakeObject[] {
  return [{ objectId: fieldId, type: "0x2::dynamic_field::Field", version: 1n, content: content(RECORDING_ONE) }];
}

test("getRecordingStreamingTranscodesByIds derives one field per recording and drops missing ones", async () => {
  const { result, calls } = await runScripted(
    getRecordingStreamingTranscodesByIds([RECORDING_ONE, RECORDING_TWO, RECORDING_ONE], PACKAGE),
    batchObjects(transcodeContent, recordingStreamingTranscodeFieldId(RECORDING_ONE, PACKAGE)),
  );
  expect(result).toEqual({ [RECORDING_ONE]: String(QUILT_ID) });
  expect(calls).toEqual([
    [
      recordingStreamingTranscodeFieldId(RECORDING_ONE, PACKAGE),
      recordingStreamingTranscodeFieldId(RECORDING_TWO, PACKAGE),
    ],
  ]);
});

test("getRecordingStreamingTranscode returns null for a recording without a transcode", async () => {
  await expect(
    run(
      getRecordingStreamingTranscode(RECORDING_ONE, PACKAGE),
      batchObjects(transcodeContent, recordingStreamingTranscodeFieldId(RECORDING_ONE, PACKAGE)),
    ),
  ).resolves.toBe(String(QUILT_ID));
  await expect(run(getRecordingStreamingTranscode(RECORDING_TWO, PACKAGE), [])).resolves.toBeNull();
});

test("getRecordingEngineSessionsByIds parses sessions and stems in one request", async () => {
  const { result, calls } = await runScripted(
    getRecordingEngineSessionsByIds([RECORDING_ONE, RECORDING_TWO], PACKAGE),
    batchObjects(sessionContent, recordingEngineSessionFieldId(RECORDING_ONE, PACKAGE)),
  );
  expect(result).toEqual({
    [RECORDING_ONE]: {
      sessionBlobId: String(BLOB_ID),
      stems: [{ digest: "07".repeat(32), blobId: String(QUILT_ID) }],
    },
  });
  expect(calls).toEqual([
    [
      recordingEngineSessionFieldId(RECORDING_ONE, PACKAGE),
      recordingEngineSessionFieldId(RECORDING_TWO, PACKAGE),
    ],
  ]);
});
