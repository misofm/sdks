// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Canonical Record-gated engine-session contracts.
 *
 * The plaintext Walrus session is the complete public manifest. It contains
 * mixer metadata, one Seal-wrapped AES key, and the encrypted stem blob IDs.
 * There is deliberately no second encrypted mix document and no off-chain
 * pointer table.
 */

import { EncryptedObject } from "@mysten/seal";
import { bcs } from "@mysten/sui/bcs";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type {
  Transaction,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";
import {
  deriveDynamicFieldID,
  normalizeSuiObjectId,
  parseStructTag,
} from "@mysten/sui/utils";
import { getReleaseById, isNotFound } from "@misofm/protocol";
import * as engineSessionContract from "@misofm/protocol/contracts/recording_engine_session/recording_engine_session";
import * as recordContract from "@misofm/protocol/contracts/miso_record/record";
import type { TxThunk } from "./transactions.ts";
import {
  invokeWithAdminCap,
  type AdminCapAuthority,
  type ObjectInput,
} from "./vault.ts";

export const RECORDING_SESSION_ID_BYTES = 98;
export const RECORDING_SESSION_ID_SCHEMA = 1 as const;
export const RECORDING_SESSION_ID_KIND = 1 as const;

export const ENGINE_SESSION_SCHEMA_V1 = "miso.engine-session/1" as const;
export const ENGINE_SESSION_NETWORK_V1 = "testnet" as const;
export const STEM_CIPHER_FRAMING_V1 =
  "aes-256-gcm-hkdf-stream/2" as const;
export const STEM_CIPHER_CHUNK_BYTES = 1_048_576 as const;
export const STEM_CIPHER_TAG_BYTES = 16 as const;
export const STEM_CIPHER_HEADER_BYTES = 25 as const;
export const MAX_ENGINE_SESSION_BYTES = 256 * 1024;
export const MAX_ENGINE_SESSION_STEMS = 32;
export const MAX_STEM_FLAC_BYTES = 128 * 1024 * 1024;
export const MAX_SESSION_FLAC_BYTES = 256 * 1024 * 1024;
export const MAX_STEM_CANONICAL_PCM_BYTES = 384 * 1024 * 1024;
export const ENGINE_SESSION_SAMPLE_RATES = [
  44_100,
  48_000,
  88_200,
  96_000,
] as const;
export type EngineSessionSampleRate =
  (typeof ENGINE_SESSION_SAMPLE_RATES)[number];

const MAX_U32 = 0xffff_ffff;
const ADDRESS_RE = /^0x[0-9a-f]{64}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const PCM_IDENTITY_RE = /^sha256:[0-9a-f]{64}$/;
const BLOB_ID_RE = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const STEM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PARAM_KEY_RE = /^[a-z0-9_]{1,48}$/;
const STEM_DOMAIN_PREFIX = new TextEncoder().encode("miso.mix.asset/2\0");

export interface RecordingSessionIdentity {
  readonly schema: typeof RECORDING_SESSION_ID_SCHEMA;
  readonly kind: typeof RECORDING_SESSION_ID_KIND;
  readonly recordGateId: string;
  readonly recordingId: string;
  readonly nonce: Uint8Array;
}

/** Encode `[schema | kind | gate | recording | 32-byte nonce]`. */
export function encodeRecordingSessionIdentity(
  identity: Omit<RecordingSessionIdentity, "schema" | "kind"> &
    Partial<Pick<RecordingSessionIdentity, "schema" | "kind">>,
): Uint8Array {
  if ((identity.schema ?? 1) !== 1) {
    throw new Error("Recording session identity schema must be 1");
  }
  if ((identity.kind ?? 1) !== 1) {
    throw new Error("Recording session identity kind must be 1");
  }
  const gate = addressBytes("recordGateId", identity.recordGateId);
  const recording = addressBytes("recordingId", identity.recordingId);
  if (!(identity.nonce instanceof Uint8Array) || identity.nonce.length !== 32) {
    throw new Error("nonce must be exactly 32 bytes");
  }
  return concatBytes(
    new Uint8Array([1, 1]),
    gate,
    recording,
    identity.nonce,
  );
}

/** Strictly parse one exact identity; short and trailing bytes are rejected. */
export function parseRecordingSessionIdentity(
  bytes: Uint8Array,
): RecordingSessionIdentity {
  if (!(bytes instanceof Uint8Array) || bytes.length !== RECORDING_SESSION_ID_BYTES) {
    throw new Error(
      `Recording session identity must be exactly ${RECORDING_SESSION_ID_BYTES} bytes`,
    );
  }
  if (bytes[0] !== 1) {
    throw new Error(`unsupported Recording session identity schema ${bytes[0]}`);
  }
  if (bytes[1] !== 1) {
    throw new Error(`unsupported Recording session identity kind ${bytes[1]}`);
  }
  return {
    schema: 1,
    kind: 1,
    recordGateId: bytesToAddress(bytes.subarray(2, 34)),
    recordingId: bytesToAddress(bytes.subarray(34, 66)),
    nonce: bytes.slice(66, 98),
  };
}

export function recordingSessionIdentityHex(
  identity: Parameters<typeof encodeRecordingSessionIdentity>[0],
): string {
  return bytesToHex(encodeRecordingSessionIdentity(identity));
}

/** Stable unique HKDF/AAD domain for one encrypted stem. */
export function stemCipherDomain(stemId: string): Uint8Array {
  if (!STEM_ID_RE.test(stemId)) {
    throw new Error("stemId must be a portable 1..128 byte ASCII identifier");
  }
  const id = new TextEncoder().encode(stemId);
  return concatBytes(STEM_DOMAIN_PREFIX, new Uint8Array([1, id.length]), id);
}

export interface EngineSessionEffectPreset {
  readonly slot: number;
  readonly bypassed: boolean;
  readonly params: Readonly<Record<string, number>>;
}

export interface EngineSessionStemPreset {
  readonly faderDb: number;
  readonly pan: number;
  readonly muted: boolean;
  readonly soloed: boolean;
  readonly effects: readonly EngineSessionEffectPreset[];
}

export interface EngineSessionStemV1 {
  /** Portable encryption-domain id, independent of PCM/container identity. */
  readonly id: string;
  /** Canonical decoded PCM identity consumed by the stem store. */
  readonly identity: `sha256:${string}`;
  readonly name: string;
  readonly role: string;
  readonly channels: 1 | 2;
  readonly bitDepth: 16 | 24;
  readonly frames: number;
  readonly preset: EngineSessionStemPreset;
  /** Standalone Walrus blob containing framed AES-GCM ciphertext. */
  readonly blobId: string;
  readonly ciphertextSha256: string;
  readonly plainBytes: number;
  readonly cipherBytes: number;
}

export interface EngineSessionV1 {
  readonly schema: typeof ENGINE_SESSION_SCHEMA_V1;
  readonly network: typeof ENGINE_SESSION_NETWORK_V1;
  readonly recordingId: string;
  readonly title: string;
  readonly artist: string;
  readonly sampleRateHz: EngineSessionSampleRate;
  readonly seal: {
    /** Canonical base64url Seal EncryptedObject wrapping exactly 32 AES bytes. */
    readonly encryptedKey: string;
  };
  readonly cipher: {
    readonly framing: typeof STEM_CIPHER_FRAMING_V1;
    readonly chunkSize: typeof STEM_CIPHER_CHUNK_BYTES;
    readonly tagSize: typeof STEM_CIPHER_TAG_BYTES;
  };
  readonly stems: readonly EngineSessionStemV1[];
}

/** Ciphertext length implied by the fixed authenticated-record framing. */
export function stemCipherBytes(plainBytes: number): number {
  integer("plainBytes", plainBytes, 1, Number.MAX_SAFE_INTEGER);
  const records = Math.ceil(plainBytes / STEM_CIPHER_CHUNK_BYTES);
  if (records > MAX_U32) throw new Error("cipher record count exceeds u32");
  const bytes =
    STEM_CIPHER_HEADER_BYTES +
    plainBytes +
    records * STEM_CIPHER_TAG_BYTES;
  if (!Number.isSafeInteger(bytes)) {
    throw new Error("cipher byte size exceeds safe JSON integer range");
  }
  return bytes;
}

/** Validate exact shape, bounds, identity, and the embedded Seal object. */
export function assertEngineSessionV1(
  value: unknown,
): asserts value is EngineSessionV1 {
  const session = exact(value, "session", [
    "schema",
    "network",
    "recordingId",
    "title",
    "artist",
    "sampleRateHz",
    "seal",
    "cipher",
    "stems",
  ]);
  literal("schema", session.schema, ENGINE_SESSION_SCHEMA_V1);
  literal("network", session.network, ENGINE_SESSION_NETWORK_V1);
  address("recordingId", session.recordingId);
  text("title", session.title);
  text("artist", session.artist);
  if (!ENGINE_SESSION_SAMPLE_RATES.includes(session.sampleRateHz as EngineSessionSampleRate)) {
    throw new Error(
      `sampleRateHz must be one of ${ENGINE_SESSION_SAMPLE_RATES.join(", ")}`,
    );
  }

  const seal = exact(session.seal, "seal", ["encryptedKey"]);
  if (typeof seal.encryptedKey !== "string") {
    throw new Error("seal.encryptedKey must be canonical base64url");
  }
  const encryptedKey = base64UrlToBytes(seal.encryptedKey);
  const inspected = inspectEngineSessionKey(encryptedKey);
  const identity = parseRecordingSessionIdentity(inspected.innerId);
  if (identity.recordingId !== session.recordingId) {
    throw new Error("Seal identity recording does not match session recordingId");
  }

  const cipher = exact(session.cipher, "cipher", [
    "framing",
    "chunkSize",
    "tagSize",
  ]);
  literal("cipher.framing", cipher.framing, STEM_CIPHER_FRAMING_V1);
  literal("cipher.chunkSize", cipher.chunkSize, STEM_CIPHER_CHUNK_BYTES);
  literal("cipher.tagSize", cipher.tagSize, STEM_CIPHER_TAG_BYTES);

  if (
    !Array.isArray(session.stems) ||
    session.stems.length < 1 ||
    session.stems.length > MAX_ENGINE_SESSION_STEMS
  ) {
    throw new Error(`stems must contain 1..${MAX_ENGINE_SESSION_STEMS} entries`);
  }
  const ids = new Set<string>();
  const identities = new Set<string>();
  let aggregate = 0;
  for (const [index, raw] of session.stems.entries()) {
    const stem = exact(raw, `stems[${index}]`, [
      "id",
      "identity",
      "name",
      "role",
      "channels",
      "bitDepth",
      "frames",
      "preset",
      "blobId",
      "ciphertextSha256",
      "plainBytes",
      "cipherBytes",
    ]);
    if (typeof stem.id !== "string" || !STEM_ID_RE.test(stem.id)) {
      throw new Error(`stems[${index}].id is not portable`);
    }
    if (ids.has(stem.id)) throw new Error(`duplicate stem id ${stem.id}`);
    ids.add(stem.id);
    if (typeof stem.identity !== "string" || !PCM_IDENTITY_RE.test(stem.identity)) {
      throw new Error(`stems[${index}].identity is not canonical PCM SHA-256`);
    }
    if (identities.has(stem.identity)) {
      throw new Error(`duplicate stem identity ${stem.identity}`);
    }
    identities.add(stem.identity);
    text(`stems[${index}].name`, stem.name);
    text(`stems[${index}].role`, stem.role);
    integer(`stems[${index}].channels`, stem.channels, 1, 2);
    if (stem.bitDepth !== 16 && stem.bitDepth !== 24) {
      throw new Error(`stems[${index}].bitDepth must be 16 or 24`);
    }
    integer(`stems[${index}].frames`, stem.frames, 1, Number.MAX_SAFE_INTEGER);
    const pcmBytes =
      BigInt(stem.frames as number) *
      BigInt(stem.channels as number) *
      BigInt((stem.bitDepth as number) / 8);
    if (pcmBytes > BigInt(MAX_STEM_CANONICAL_PCM_BYTES)) {
      throw new Error(`stems[${index}] canonical PCM exceeds the browser limit`);
    }
    assertPreset(stem.preset, `stems[${index}].preset`);
    blobId(`stems[${index}].blobId`, stem.blobId);
    sha256(`stems[${index}].ciphertextSha256`, stem.ciphertextSha256);
    integer(
      `stems[${index}].plainBytes`,
      stem.plainBytes,
      1,
      MAX_STEM_FLAC_BYTES,
    );
    integer(
      `stems[${index}].cipherBytes`,
      stem.cipherBytes,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    if (stem.cipherBytes !== stemCipherBytes(stem.plainBytes as number)) {
      throw new Error(`stems[${index}].cipherBytes contradicts its framing`);
    }
    aggregate += stem.plainBytes as number;
    if (!Number.isSafeInteger(aggregate) || aggregate > MAX_SESSION_FLAC_BYTES) {
      throw new Error("session FLAC bytes exceed the aggregate browser limit");
    }
  }
}

/** Canonical plaintext bytes uploaded as the Recording's session blob. */
export function encodeEngineSessionV1(session: EngineSessionV1): Uint8Array {
  assertEngineSessionV1(session);
  const bytes = new TextEncoder().encode(canonicalJson(session));
  if (bytes.length > MAX_ENGINE_SESSION_BYTES) {
    throw new Error(`engine session exceeds ${MAX_ENGINE_SESSION_BYTES} bytes`);
  }
  return bytes;
}

/** Parse only canonical JSON: unknown keys, whitespace, and trailing data fail. */
export function parseEngineSessionV1(
  input: Uint8Array | string,
): EngineSessionV1 {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > MAX_ENGINE_SESSION_BYTES) {
    throw new Error(`engine session must be 1..${MAX_ENGINE_SESSION_BYTES} bytes`);
  }
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("engine session is not valid UTF-8");
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("engine session is not valid JSON");
  }
  assertEngineSessionV1(value);
  if (canonicalJson(value) !== source) {
    throw new Error("engine session must use canonical JSON with no trailing bytes");
  }
  return value;
}

export interface InspectedEngineSessionKey {
  readonly packageId: string;
  readonly innerId: Uint8Array;
  readonly services: readonly (readonly [string, number])[];
  readonly threshold: number;
}

/** Parse and constrain the official Seal object carrying the session AES key. */
export function inspectEngineSessionKey(
  bytes: Uint8Array,
): InspectedEngineSessionKey {
  let encrypted: typeof EncryptedObject.$inferType;
  try {
    encrypted = EncryptedObject.parse(bytes);
  } catch (error) {
    throw new Error(
      `seal.encryptedKey is not a Seal EncryptedObject: ${error instanceof Error ? error.message : error}`,
    );
  }
  const canonical = EncryptedObject.serialize(encrypted).toBytes();
  if (
    canonical.length !== bytes.length ||
    canonical.some((byte, index) => byte !== bytes[index])
  ) {
    throw new Error("seal.encryptedKey is not canonical");
  }
  if (encrypted.version !== 0) {
    throw new Error(`unsupported Seal version ${encrypted.version}`);
  }
  if (
    encrypted.threshold !== 1 ||
    encrypted.services.length !== 1 ||
    encrypted.services[0]?.[1] !== 1
  ) {
    throw new Error("engine session requires one threshold-1 Seal service");
  }
  if (encrypted.encryptedShares.$kind !== "BonehFranklinBLS12381") {
    throw new Error("engine session key uses an unsupported Seal KEM");
  }
  if (
    encrypted.encryptedShares.BonehFranklinBLS12381.encryptedShares.length !== 1
  ) {
    throw new Error("Seal encrypted share count is inconsistent");
  }
  if (encrypted.ciphertext.$kind !== "Aes256Gcm") {
    throw new Error("Seal payload must use AES-256-GCM");
  }
  const payload = encrypted.ciphertext.Aes256Gcm;
  if (payload.blob.length !== 48) {
    throw new Error("Seal payload must wrap exactly one 32-byte key");
  }
  if (payload.aad !== null && payload.aad.length !== 0) {
    throw new Error("Seal session-key payload must not carry AAD");
  }
  return {
    packageId: normalizeSuiObjectId(encrypted.packageId),
    innerId: hexToBytes(`0x${encrypted.id}`, RECORDING_SESSION_ID_BYTES, "Seal id"),
    services: encrypted.services.map(([id, weight]) => [
      normalizeSuiObjectId(id),
      weight,
    ] as const),
    threshold: encrypted.threshold,
  };
}

// ── Direct on-chain graph ───────────────────────────────────────────────────

const EngineSessionField = bcs.struct("Field", {
  id: bcs.Address,
  name: engineSessionContract.ExtensionKey,
  value: engineSessionContract.EngineSession,
});
const ENGINE_SESSION_KEY_BYTES = engineSessionContract.ExtensionKey.serialize([
  false,
]).toBytes();
// `release_mix_reference` predates the ori `walrus_data` → `data` split and is
// not part of the current deployment. Its stored value is still the legacy
// `ori::walrus_data::WalrusData` enum, kept here verbatim for reads.
const LegacyConfidentiality = bcs.enum("Confidentiality", {
  Unencrypted: null,
  Encrypted: bcs.struct("Confidentiality.Encrypted", { dek: bcs.vector(bcs.u8()) }),
});
const LegacyWalrusData = bcs.enum("WalrusData", {
  Blob: bcs.tuple([bcs.u256(), LegacyConfidentiality]),
  QuiltPatch: bcs.tuple([bcs.u256(), bcs.u8(), bcs.u16(), bcs.u16()]),
});
const ReleaseMixReferenceField = bcs.struct("Field", {
  id: bcs.Address,
  name: bcs.tuple([bcs.bool()]),
  value: bcs.tuple([bcs.vector(bcs.option(LegacyWalrusData))]),
});

export interface RecordingEngineSessionReference {
  readonly blobId: bigint;
}

export interface ReleaseMixReference {
  readonly blobId: bigint;
}

/** Read the release-aligned optional descriptor references in track order. */
export async function getReleaseMixReferences(
  client: ClientWithCoreApi,
  releaseId: string,
  packageId: string,
): Promise<Array<ReleaseMixReference | null> | null> {
  const fieldId = deriveDynamicFieldID(
    releaseId,
    `${packageId}::release_mix_reference::ExtensionKey`,
    new Uint8Array([0]),
  );
  try {
    const { object } = await client.core.getObject({ objectId: fieldId, include: { content: true } });
    if (!object?.content) throw new Error("Release mix-reference field is missing BCS content");
    const [entries] = ReleaseMixReferenceField.parse(object.content).value;
    return entries.map((entry) => {
      if (entry == null) return null;
      if (entry.$kind !== "Blob" || entry.Blob[1].$kind !== "Unencrypted") {
        throw new Error("Release mix reference is not a plaintext standalone Walrus blob");
      }
      return { blobId: BigInt(entry.Blob[0]) };
    });
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export function recordingEngineSessionFieldId(
  recordingId: string,
  packageId: string,
): string {
  return deriveDynamicFieldID(
    recordingId,
    `${packageId}::recording_engine_session::ExtensionKey`,
    ENGINE_SESSION_KEY_BYTES,
  );
}

export function parseRecordingEngineSessionContent(
  content: Uint8Array,
): RecordingEngineSessionReference {
  const { data } = EngineSessionField.parse(content).value;
  if (data.confidentiality.$kind !== "Unencrypted") {
    throw new Error("Recording engine session is unexpectedly encrypted");
  }
  return { blobId: BigInt(data.blob_id) };
}

export async function getRecordingEngineSession(
  client: ClientWithCoreApi,
  recordingId: string,
  packageId: string,
): Promise<RecordingEngineSessionReference | null> {
  const fieldId = recordingEngineSessionFieldId(recordingId, packageId);
  const { objects } = await client.core.getObjects({
    objectIds: [fieldId],
    include: { content: true },
  });
  const field = objects[0];
  if (!field) throw new Error("Recording engine-session read returned no result");
  if (field instanceof Error) {
    if (isNotFound(field)) return null;
    throw field;
  }
  if (!field.content) {
    throw new Error("Recording engine-session field is missing BCS content");
  }
  return parseRecordingEngineSessionContent(field.content);
}

/** Exact concrete Record read using BCS, never transport-dependent JSON. */
export async function getRecordReleaseId(
  client: ClientWithCoreApi,
  recordId: string,
  recordPackageId: string,
): Promise<string> {
  const { object } = await client.core.getObject({
    objectId: recordId,
    include: { content: true },
  });
  const tag = parseStructTag(object.type);
  if (
    tag.address !== normalizeSuiObjectId(recordPackageId) ||
    tag.module !== "record" ||
    tag.name !== "Record" ||
    tag.typeParams.length !== 0
  ) {
    throw new Error("recordId is not the configured concrete Miso Record type");
  }
  if (!object.content) throw new Error("Record is missing BCS content");
  const record = recordContract.Record.parse(object.content);
  if (normalizeSuiObjectId(record.id) !== normalizeSuiObjectId(recordId)) {
    throw new Error("Record UID does not match recordId");
  }
  return normalizeSuiObjectId(record.release_id);
}

export interface ResolvedRecordEngineSession {
  readonly releaseId: string;
  readonly recordingId: string;
  readonly sessionBlobId: string;
}

/**
 * Resolve Record → immutable Release track → Recording dynamic field.
 *
 * Every edge is a direct Sui object read. No event scan, dynamic-field list,
 * API hint, or indexer-maintained relation participates in the answer.
 */
export async function resolveRecordEngineSession(
  client: ClientWithCoreApi,
  input: {
    readonly recordId: string;
    readonly trackIndex: number;
    readonly recordPackageId: string;
    readonly recordingEngineSessionPackageId: string;
  },
): Promise<ResolvedRecordEngineSession> {
  integer("trackIndex", input.trackIndex, 0, MAX_U32);
  const releaseId = await getRecordReleaseId(
    client,
    input.recordId,
    input.recordPackageId,
  );
  const release = await getReleaseById(client, releaseId);
  const track = release.tracks[input.trackIndex];
  if (!track) throw new Error("trackIndex is outside the Record's Release");
  const recordingId = normalizeSuiObjectId(track.recordingId);
  const reference = await getRecordingEngineSession(
    client,
    recordingId,
    input.recordingEngineSessionPackageId,
  );
  if (!reference) throw new Error("Recording has no canonical engine session");
  return {
    releaseId,
    recordingId,
    sessionBlobId: walrusBlobIdFromU256(reference.blobId),
  };
}

function object(tx: Transaction, input: ObjectInput): TransactionObjectArgument {
  return typeof input === "string" ? tx.object(input) : input;
}

// ── Binary and validation helpers ───────────────────────────────────────────

export function walrusBlobIdFromU256(value: bigint | string): string {
  let remaining = u256("Walrus blob id", value);
  const bytes = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytesToBase64Url(bytes);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    output += alphabet[a >>> 2];
    output += alphabet[((a & 3) << 4) | (b >>> 4)];
    if (index + 1 < bytes.length) {
      output += alphabet[((b & 15) << 2) | (c >>> 6)];
    }
    if (index + 2 < bytes.length) output += alphabet[c & 63];
  }
  return output;
}

export function base64UrlToBytes(value: string): Uint8Array {
  if (
    typeof value !== "string" ||
    value.length % 4 === 1 ||
    value.includes("=") ||
    !/^[A-Za-z0-9_-]*$/.test(value)
  ) {
    throw new Error("invalid canonical base64url");
  }
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const bytes = new Uint8Array(Math.floor((value.length * 6) / 8));
  let accumulator = 0;
  let bits = 0;
  let outputIndex = 0;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("invalid canonical base64url");
    accumulator = (accumulator << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[outputIndex] = (accumulator >>> bits) & 0xff;
      outputIndex += 1;
      accumulator &= (1 << bits) - 1;
    }
  }
  if (bytesToBase64Url(bytes) !== value) {
    throw new Error("invalid canonical base64url padding bits");
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  let value = "0x";
  for (const byte of bytes) value += byte.toString(16).padStart(2, "0");
  return value;
}

export function hexToBytes(
  value: string,
  expectedBytes?: number,
  label = "hex",
): Uint8Array {
  if (typeof value !== "string" || !/^0x(?:[0-9a-f]{2})*$/.test(value)) {
    throw new Error(`${label} must be canonical lowercase 0x-prefixed hex`);
  }
  const bytes = new Uint8Array((value.length - 2) / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(2 + index * 2, 4 + index * 2), 16);
  }
  if (expectedBytes !== undefined && bytes.length !== expectedBytes) {
    throw new Error(`${label} must encode exactly ${expectedBytes} bytes`);
  }
  return bytes;
}

function addressBytes(label: string, value: string): Uint8Array {
  address(label, value);
  return hexToBytes(value, 32, label);
}

function bytesToAddress(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function exact(value: unknown, label: string, keys: readonly string[]): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const actual = Object.keys(value as object).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly: ${expected.join(", ")}`);
  }
  return value as Record<string, unknown>;
}

function literal(label: string, value: unknown, expected: string | number): void {
  if (value !== expected) throw new Error(`${label} must be ${JSON.stringify(expected)}`);
}

function text(label: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 256) {
    throw new Error(`${label} must be 1..256 characters`);
  }
}

function address(label: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || !ADDRESS_RE.test(value)) {
    throw new Error(`${label} must be a canonical 32-byte Sui address`);
  }
}

function sha256(label: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
}

function blobId(label: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || !BLOB_ID_RE.test(value)) {
    throw new Error(`${label} must be a canonical Walrus blob id`);
  }
}

function integer(
  label: string,
  value: unknown,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${label} must be an integer in ${minimum}..${maximum}`);
  }
}

function flag(label: string, value: unknown): asserts value is boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
}

function finite(label: string, value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
}

function assertPreset(value: unknown, label: string): void {
  const preset = exact(value, label, [
    "faderDb",
    "pan",
    "muted",
    "soloed",
    "effects",
  ]);
  finite(`${label}.faderDb`, preset.faderDb);
  finite(`${label}.pan`, preset.pan);
  flag(`${label}.muted`, preset.muted);
  flag(`${label}.soloed`, preset.soloed);
  if (!Array.isArray(preset.effects) || preset.effects.length > 64) {
    throw new Error(`${label}.effects must contain at most 64 entries`);
  }
  for (const [index, raw] of preset.effects.entries()) {
    const effect = exact(raw, `${label}.effects[${index}]`, [
      "slot",
      "bypassed",
      "params",
    ]);
    integer(`${label}.effects[${index}].slot`, effect.slot, 0, MAX_U32);
    flag(`${label}.effects[${index}].bypassed`, effect.bypassed);
    const params = exactOpenObject(effect.params, `${label}.effects[${index}].params`);
    for (const [key, parameter] of Object.entries(params)) {
      if (!PARAM_KEY_RE.test(key)) throw new Error(`${label} parameter key ${key} is invalid`);
      finite(`${label} parameter ${key}`, parameter);
    }
  }
}

function exactOpenObject(value: unknown, label: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function u256(label: string, value: bigint | string): bigint {
  let parsed: bigint;
  try {
    parsed = typeof value === "bigint" ? value : BigInt(value);
  } catch {
    throw new Error(`${label} must be an exact u256 integer`);
  }
  if (parsed < 0n || parsed >= 1n << 256n) {
    throw new Error(`${label} is outside u256 range`);
  }
  return parsed;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON forbids non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value !== "object") throw new Error("canonical JSON contains an unsupported value");
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}
