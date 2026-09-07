// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { EncryptedObject } from "@mysten/seal";
import { bcs } from "@mysten/sui/bcs";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import * as engineSessionContract from "@misofm/protocol/contracts/recording_engine_session/recording_engine_session";
import * as recordContract from "@misofm/protocol/contracts/miso_record/record";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  encodeEngineSessionV1,
  encodeRecordingSessionIdentity,
  getRecordReleaseId,
  getRecordingEngineSession,
  inspectEngineSessionKey,
  parseEngineSessionV1,
  parseRecordingSessionIdentity,
  recordingEngineSessionFieldId,
  stemCipherBytes,
  stemCipherDomain,
  walrusBlobIdFromU256,
  type EngineSessionV1,
} from "../src/mix.ts";

const GATE = `0x${"11".repeat(32)}`;
const RECORDING = `0x${"22".repeat(32)}`;
const RELEASE = `0x${"33".repeat(32)}`;
const RECORD = `0x${"44".repeat(32)}`;
const POLICY = `0x${"55".repeat(32)}`;
const SERVICE = `0x${"66".repeat(32)}`;
const EXTENSION = `0x${"77".repeat(32)}`;
const ORI = `0x${"88".repeat(32)}`;
const CAP = `0x${"99".repeat(32)}`;
const SHARE = `${`0x${"aa".repeat(32)}`}::share::Share`;
const COMPOSITION_SHARE = `${`0x${"bb".repeat(32)}`}::share::Share`;
const NONCE = new Uint8Array(32).fill(0xcc);

function sealedKey(
  overrides: {
    id?: Uint8Array;
    packageId?: string;
    serviceId?: string;
    services?: readonly (readonly [string, number])[];
    threshold?: number;
    payloadBytes?: number;
    aad?: Uint8Array | null;
  } = {},
): Uint8Array {
  const id = overrides.id ?? encodeRecordingSessionIdentity({
    recordGateId: GATE,
    recordingId: RECORDING,
    nonce: NONCE,
  });
  return EncryptedObject.serialize({
    version: 0,
    packageId: overrides.packageId ?? POLICY,
    id: Array.from(id, (byte) => byte.toString(16).padStart(2, "0")).join(""),
    services: overrides.services ?? [[overrides.serviceId ?? SERVICE, 1]],
    threshold: overrides.threshold ?? 1,
    encryptedShares: {
      BonehFranklinBLS12381: {
        nonce: new Uint8Array(96).fill(1),
        encryptedShares: [new Uint8Array(32).fill(2)],
        encryptedRandomness: new Uint8Array(32).fill(3),
      },
    },
    ciphertext: {
      Aes256Gcm: {
        blob: new Uint8Array(overrides.payloadBytes ?? 48).fill(4),
        aad: overrides.aad ?? null,
      },
    },
  }).toBytes();
}

function session(): EngineSessionV1 {
  return {
    schema: "miso.engine-session/1",
    network: "testnet",
    recordingId: RECORDING,
    title: "A Track",
    artist: "An Artist",
    sampleRateHz: 48_000,
    seal: { encryptedKey: bytesToBase64Url(sealedKey()) },
    cipher: {
      framing: "aes-256-gcm-hkdf-stream/2",
      chunkSize: 1_048_576,
      tagSize: 16,
    },
    stems: [
      {
        id: "lead-vocal",
        identity: `sha256:${"0a".repeat(32)}`,
        name: "Lead Vocal",
        role: "vocal",
        channels: 2,
        bitDepth: 24,
        frames: 144_000,
        preset: {
          faderDb: -1.5,
          pan: 0,
          muted: false,
          soloed: false,
          effects: [{ slot: 0, bypassed: false, params: { mix: 0.25 } }],
        },
        blobId: walrusBlobIdFromU256(123n),
        ciphertextSha256: "0b".repeat(32),
        plainBytes: 2_000_000,
        cipherBytes: stemCipherBytes(2_000_000),
      },
    ],
  };
}

test("Recording session identity has an exact unambiguous 98-byte layout", () => {
  const encoded = encodeRecordingSessionIdentity({
    recordGateId: GATE,
    recordingId: RECORDING,
    nonce: NONCE,
  });
  expect(encoded).toHaveLength(98);
  expect(Array.from(encoded.slice(0, 4))).toEqual([1, 1, 0x11, 0x11]);
  expect(parseRecordingSessionIdentity(encoded)).toEqual({
    schema: 1,
    kind: 1,
    recordGateId: GATE,
    recordingId: RECORDING,
    nonce: NONCE,
  });
  expect(() => parseRecordingSessionIdentity(encoded.slice(0, 97))).toThrow(/exactly 98/);
  expect(() => parseRecordingSessionIdentity(new Uint8Array([...encoded, 0]))).toThrow(/exactly 98/);
  const wrongKind = encoded.slice();
  wrongKind[1] = 2;
  expect(() => parseRecordingSessionIdentity(wrongKind)).toThrow(/kind 2/);
});

test("stem domains are stable, separated, and validate portable ids", () => {
  expect(stemCipherDomain("vocal")).not.toEqual(stemCipherDomain("drums"));
  expect(new TextDecoder().decode(stemCipherDomain("vocal")).startsWith("miso.mix.asset/2\0"))
    .toBe(true);
  expect(() => stemCipherDomain("../vocal")).toThrow(/portable/);
});

test("Seal envelope inspection binds one service, one 32-byte key, and exact identity", () => {
  const inspected = inspectEngineSessionKey(sealedKey());
  expect(inspected.packageId).toBe(POLICY);
  expect(inspected.services).toEqual([[SERVICE, 1]]);
  expect(parseRecordingSessionIdentity(inspected.innerId).recordingId).toBe(RECORDING);
  expect(() => inspectEngineSessionKey(sealedKey({ payloadBytes: 49 }))).toThrow(/exactly one 32-byte key/);
  expect(() => inspectEngineSessionKey(sealedKey({ threshold: 2 }))).toThrow(/threshold-1/);
  expect(() => inspectEngineSessionKey(sealedKey({ aad: new Uint8Array([1]) }))).toThrow(/must not carry AAD/);
});

test("engine session round trips only its exact canonical plaintext schema", () => {
  const value = session();
  const bytes = encodeEngineSessionV1(value);
  expect(parseEngineSessionV1(bytes)).toEqual(value);
  const source = new TextDecoder().decode(bytes);
  expect(() => parseEngineSessionV1(`${source}\n`)).toThrow(/canonical JSON/);
  expect(() => parseEngineSessionV1(JSON.stringify(value))).toThrow(/canonical JSON/);
  expect(() => encodeEngineSessionV1({ ...value, extra: true } as never)).toThrow(/exactly/);
});

test("engine session rejects cross-recording envelopes and contradictory stem metadata", () => {
  const value = session();
  const other = `0x${"ef".repeat(32)}`;
  expect(() => encodeEngineSessionV1({ ...value, recordingId: other })).toThrow(/does not match/);
  expect(() => encodeEngineSessionV1({
    ...value,
    stems: [{ ...value.stems[0]!, cipherBytes: value.stems[0]!.cipherBytes + 1 }],
  })).toThrow(/contradicts/);
  expect(() => encodeEngineSessionV1({
    ...value,
    stems: [value.stems[0]!, { ...value.stems[0]!, id: "copy" }],
  })).toThrow(/duplicate stem identity/);
  expect(() => encodeEngineSessionV1({
    ...value,
    stems: [{ ...value.stems[0]!, blobId: "not-a-blob" }],
  })).toThrow(/Walrus blob id/);
});

test("base64url and Walrus u256 conversion are canonical and little-endian", () => {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => index);
  const encoded = bytesToBase64Url(bytes);
  expect(encoded).toHaveLength(43);
  expect(base64UrlToBytes(encoded)).toEqual(bytes);
  expect(() => base64UrlToBytes(`${encoded}=`)).toThrow(/canonical/);
  expect(walrusBlobIdFromU256(1n)).toBe(bytesToBase64Url(new Uint8Array([1, ...new Uint8Array(31)])));
});

const Field = bcs.struct("Field", {
  id: bcs.Address,
  name: engineSessionContract.ExtensionKey,
  value: engineSessionContract.EngineSession,
});

test("Recording session lookup derives one deterministic field and rejects encrypted roots", async () => {
  const fieldId = recordingEngineSessionFieldId(RECORDING, EXTENSION);
  const valid = Field.serialize({
    id: fieldId,
    name: [false],
    value: { data: { blob_id: 123n, confidentiality: { Unencrypted: true } } },
  }).toBytes();
  const client = {
    core: {
      getObjects: async (input: { objectIds: string[] }) => {
        expect(input.objectIds).toEqual([fieldId]);
        return { objects: [{ objectId: fieldId, content: valid }] };
      },
    },
  } as unknown as ClientWithCoreApi;
  await expect(getRecordingEngineSession(client, RECORDING, EXTENSION)).resolves.toEqual({ blobId: 123n });

  const encrypted = Field.serialize({
    id: fieldId,
    name: [false],
    value: { data: { blob_id: 123n, confidentiality: { Encrypted: { sealed_dek: [1, 2, 3] } } } },
  }).toBytes();
  const badClient = {
    core: { getObjects: async () => ({ objects: [{ objectId: fieldId, content: encrypted }] }) },
  } as unknown as ClientWithCoreApi;
  await expect(getRecordingEngineSession(badClient, RECORDING, EXTENSION)).rejects.toThrow(/unexpectedly encrypted/);
});

test("Record release lookup validates the configured concrete type before BCS", async () => {
  const content = recordContract.Record.serialize({
    id: RECORD,
    release_id: RELEASE,
    pressing_id: `0x${"66".repeat(32)}`,
    edition: 1,
    number: 1,
    purchase_currency: { name: "0x2::sui::SUI" },
    purchase_price: "1",
    purchased_by: `0x${"77".repeat(32)}`,
    purchased_timestamp_ms: "1",
  }).toBytes();
  const client = {
    core: {
      getObject: async () => ({
        object: { objectId: RECORD, type: `${POLICY}::record::Record`, content },
      }),
    },
  } as unknown as ClientWithCoreApi;
  await expect(getRecordReleaseId(client, RECORD, POLICY)).resolves.toBe(RELEASE);
  await expect(getRecordReleaseId(client, RECORD, EXTENSION)).rejects.toThrow(/configured concrete/);
});

