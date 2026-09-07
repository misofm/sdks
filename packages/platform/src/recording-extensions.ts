// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { readFieldsEffect } from "./queries.ts";

import { toPromise, tryPromise, workflow, type SdkError } from "@misofm/utils/effect";
import { Effect } from "effect";

/** Cap-authorized builders and reads for data-only Recording metadata extensions. */

import { isNotFound } from "@misofm/protocol";
import * as advisory from "@misofm/protocol/contracts/recording_advisory/recording_advisory";
import * as engineSession from "@misofm/protocol/contracts/recording_engine_session/recording_engine_session";
import * as walrusData from "@misofm/protocol/contracts/recording_master_reference/deps/ori/data";
import * as masterReference from "@misofm/protocol/contracts/recording_master_reference/recording_master_reference";
import * as streamingTranscode from "@misofm/protocol/contracts/recording_streaming_transcode/recording_streaming_transcode";
import { bcs } from "@mysten/sui/bcs";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { Transaction, TransactionArgument, TransactionObjectArgument } from "@mysten/sui/transactions";
import { deriveDynamicFieldID, fromHex, toHex } from "@mysten/sui/utils";
import { unencryptedWalrusBlob } from "./internal.ts";
import type { TxThunk } from "./transactions.ts";
import { invokeWithAdminCap, type AdminCapAuthority, type ObjectInput } from "./vault.ts";

export interface RecordingExtensionTarget {
  readonly recordingId: ObjectInput;
  readonly authority: AdminCapAuthority;
  readonly recordingShareType: string;
  readonly compositionShareType: string;
}

function object(tx: Transaction, value: ObjectInput): TransactionObjectArgument {
  return typeof value === "string" ? tx.object(value) : value;
}

type Rating = "Explicit" | "NotExplicit" | "Cleaned";
export interface SetRecordingAdvisoryParams extends RecordingExtensionTarget {
  readonly recordingAdvisoryPackageId: string;
  readonly rating: Rating;
}

export function setRecordingAdvisory(p: SetRecordingAdvisoryParams): TxThunk {
  return (tx) => {
    const rating = tx.add(
      p.rating === "Explicit" ? advisory.explicit({ package: p.recordingAdvisoryPackageId })
        : p.rating === "NotExplicit" ? advisory.notExplicit({ package: p.recordingAdvisoryPackageId })
          : advisory.cleaned({ package: p.recordingAdvisoryPackageId }),
    );
    invokeWithAdminCap(tx, p.authority, {
      target: `${p.recordingAdvisoryPackageId}::recording_advisory::set_rating`,
      typeArguments: [p.recordingShareType, p.compositionShareType],
      arguments: [object(tx, p.recordingId), rating],
      adminCapIndex: 1,
    });
  };
}

export interface SetRecordingLanguagesParams extends RecordingExtensionTarget {
  readonly recordingLanguagePackageId: string;
  /** A vector<LanguageCode> built by the language-code package in this PTB. */
  readonly languages: TransactionArgument;
}

export function setRecordingLanguages(p: SetRecordingLanguagesParams): TxThunk {
  return (tx) => {
    invokeWithAdminCap(tx, p.authority, {
      target: `${p.recordingLanguagePackageId}::recording_language::set_languages`,
      typeArguments: [p.recordingShareType, p.compositionShareType],
      arguments: [object(tx, p.recordingId), p.languages],
      adminCapIndex: 1,
    });
  };
}

export function setRecordingInstrumental(p: Omit<SetRecordingLanguagesParams, "languages">): TxThunk {
  return (tx) => {
    invokeWithAdminCap(tx, p.authority, {
      target: `${p.recordingLanguagePackageId}::recording_language::set_instrumental`,
      typeArguments: [p.recordingShareType, p.compositionShareType],
      arguments: [object(tx, p.recordingId)],
      adminCapIndex: 1,
    });
  };
}

interface RecordingWalrusReferenceParams extends RecordingExtensionTarget {
  /** An `ori::data::WalrusBlob` value assembled in the same PTB. */
  readonly reference: TransactionArgument;
}

export interface SetRecordingMasterReferenceParams extends RecordingWalrusReferenceParams {
  readonly recordingMasterReferencePackageId: string;
}
export function setRecordingMasterReference(p: SetRecordingMasterReferenceParams): TxThunk {
  return (tx) => {
    invokeWithAdminCap(tx, p.authority, {
      target: `${p.recordingMasterReferencePackageId}::recording_master_reference::set_master_reference`,
      typeArguments: [p.recordingShareType, p.compositionShareType],
      arguments: [object(tx, p.recordingId), p.reference],
      adminCapIndex: 1,
    });
  };
}

export interface SetRecordingStreamingTranscodeParams extends RecordingExtensionTarget {
  readonly recordingStreamingTranscodePackageId: string;
  /** External `ori` package used to construct the complete Walrus Quilt reference. */
  readonly oriPackageId: string;
  /** Complete Walrus Quilt ID as its on-chain `u256` value. */
  readonly quiltId: bigint | string;
}

/** Sets or replaces the complete streaming-transcode Quilt attached to a Recording. */
export function setRecordingStreamingTranscode(
  p: SetRecordingStreamingTranscodeParams,
): TxThunk {
  return (tx) => {
    const quilt = tx.moveCall({
      target: `${p.oriPackageId}::data::new_quilt`,
      arguments: [tx.pure.u256(p.quiltId)],
    });
    const transcode = tx.add(streamingTranscode._new({
      package: p.recordingStreamingTranscodePackageId,
      arguments: [quilt],
    }));
    invokeWithAdminCap(tx, p.authority, {
      target: `${p.recordingStreamingTranscodePackageId}::recording_streaming_transcode::set_streaming_transcode`,
      typeArguments: [p.recordingShareType, p.compositionShareType],
      arguments: [object(tx, p.recordingId), transcode],
      adminCapIndex: 1,
    });
  };
}

export type UnsetRecordingStreamingTranscodeParams = Omit<
  SetRecordingStreamingTranscodeParams,
  "oriPackageId" | "quiltId"
>;

/** One stem a Session V1 document references, paired with its Walrus blob. */
export interface RecordingEngineSessionStemInput {
  /** 32-byte SHA-256 of the stem's canonical PCM (engine STEM_IDENTITY_V1): raw bytes or 64 hex chars. */
  readonly digest: Uint8Array | string;
  /** Unencrypted Walrus blob holding the stem's FLAC, as its on-chain `u256`. */
  readonly blobId: bigint | string;
}

export interface SetRecordingEngineSessionParams extends RecordingExtensionTarget {
  readonly recordingEngineSessionPackageId: string;
  /** External `ori` package used to construct the plaintext Walrus blob references. */
  readonly oriPackageId: string;
  /** Unencrypted Walrus blob holding the canonical Session V1 JSON, as its on-chain `u256`. */
  readonly sessionBlobId: bigint | string;
  /** Every stem the document's sources reference. Order does not matter; the builder sorts. */
  readonly stems: readonly RecordingEngineSessionStemInput[];
}

const STEM_DIGEST_BYTES = 32;

function stemDigestBytes(digest: Uint8Array | string): Uint8Array {
  const bytes = typeof digest === "string" ? fromHex(digest) : digest;
  if (bytes.length !== STEM_DIGEST_BYTES) {
    throw new Error(`stem digest must be ${STEM_DIGEST_BYTES} bytes`);
  }
  return bytes;
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return 0;
}

/**
 * Sets or replaces the Miso Engine session attached to a Recording: the
 * Session V1 blob plus one `Stem` per source. Stems are sorted by digest and
 * checked for duplicates here, mirroring `recording_engine_session::new`, so a
 * bad input fails before signing rather than on chain.
 */
export function setRecordingEngineSession(p: SetRecordingEngineSessionParams): TxThunk {
  const stems = p.stems
    .map((stem) => ({ digest: stemDigestBytes(stem.digest), blobId: stem.blobId }))
    .sort((a, b) => compareBytes(a.digest, b.digest));
  for (let index = 1; index < stems.length; index += 1) {
    if (compareBytes(stems[index - 1]!.digest, stems[index]!.digest) === 0) {
      throw new Error(`duplicate stem digest ${toHex(stems[index]!.digest)}`);
    }
  }
  return (tx) => {
    const pkg = p.recordingEngineSessionPackageId;
    const sessionBlob = unencryptedWalrusBlob(tx, p.oriPackageId, p.sessionBlobId);
    const stemValues = stems.map((stem) => tx.add(engineSession.newStem({
      package: pkg,
      arguments: [
        tx.pure.vector("u8", Array.from(stem.digest)),
        unencryptedWalrusBlob(tx, p.oriPackageId, stem.blobId),
      ],
    })));
    const stemVector = tx.makeMoveVec({
      type: `${pkg}::recording_engine_session::Stem`,
      elements: stemValues,
    });
    const session = tx.add(engineSession._new({
      package: pkg,
      arguments: [sessionBlob, stemVector],
    }));
    invokeWithAdminCap(tx, p.authority, {
      target: `${pkg}::recording_engine_session::set_engine_session`,
      typeArguments: [p.recordingShareType, p.compositionShareType],
      arguments: [object(tx, p.recordingId), session],
      adminCapIndex: 1,
    });
  };
}

export type UnsetRecordingEngineSessionParams = Omit<
  SetRecordingEngineSessionParams,
  "oriPackageId" | "sessionBlobId" | "stems"
>;

/** Removes the Recording's Miso Engine session reference, if present. */
export function unsetRecordingEngineSession(p: UnsetRecordingEngineSessionParams): TxThunk {
  return (tx) => {
    invokeWithAdminCap(tx, p.authority, {
      target: `${p.recordingEngineSessionPackageId}::recording_engine_session::unset_engine_session`,
      typeArguments: [p.recordingShareType, p.compositionShareType],
      arguments: [object(tx, p.recordingId)],
      adminCapIndex: 1,
    });
  };
}

/** Removes the Recording's streaming-transcode reference, if present. */
export function unsetRecordingStreamingTranscode(
  p: UnsetRecordingStreamingTranscodeParams,
): TxThunk {
  return (tx) => {
    invokeWithAdminCap(tx, p.authority, {
      target: `${p.recordingStreamingTranscodePackageId}::recording_streaming_transcode::unset_streaming_transcode`,
      typeArguments: [p.recordingShareType, p.compositionShareType],
      arguments: [object(tx, p.recordingId)],
      adminCapIndex: 1,
    });
  };
}

// ── Streaming-transcode reads ────────────────────────────────────────────────

// recording_streaming_transcode stores the ori::data::WalrusQuilt inline in a
// dynamic field on the Recording; its empty ExtensionKey serializes to one
// false byte, so the field id derives without listing dynamic fields.
const StreamingTranscodeField = bcs.struct("Field", {
  id: bcs.Address,
  name: streamingTranscode.ExtensionKey,
  value: streamingTranscode.StreamingTranscode,
});
const STREAMING_TRANSCODE_KEY_BYTES = streamingTranscode.ExtensionKey.serialize([false]).toBytes();

/** Parse a streaming-transcode dynamic field into its Quilt id (decimal `u256`). */
export function parseRecordingStreamingTranscodeContent(content: Uint8Array): string {
  return String(StreamingTranscodeField.parse(content).value.quilt.quilt_id);
}

/** Deterministic dynamic-field id for a Recording's streaming transcode. */
export function recordingStreamingTranscodeFieldId(
  recordingId: string,
  recordingStreamingTranscodePackageId: string,
): string {
  return deriveDynamicFieldID(
    recordingId,
    `${recordingStreamingTranscodePackageId}::recording_streaming_transcode::ExtensionKey`,
    STREAMING_TRANSCODE_KEY_BYTES,
  );
}

/** Read one Recording's streaming-transcode Quilt id, or null when absent. */
export function getRecordingStreamingTranscodeEffect(
  client: ClientWithCoreApi,
  recordingId: string,
  recordingStreamingTranscodePackageId: string,
): Effect.Effect<string | null, SdkError> {
  return workflow("getRecordingStreamingTranscode", function* () {
    return (
      (yield* getRecordingStreamingTranscodesByIdsEffect(client, [recordingId], recordingStreamingTranscodePackageId))[
        recordingId
      ] ?? null
    );
  });
}

export const getRecordingStreamingTranscode = toPromise(getRecordingStreamingTranscodeEffect);

/**
 * Read streaming-transcode Quilt ids for many Recordings in one Core request.
 * Missing and malformed fields are omitted, like master references.
 */
export function getRecordingStreamingTranscodesByIdsEffect(
  client: ClientWithCoreApi,
  recordingIdsInput: readonly string[],
  recordingStreamingTranscodePackageId: string,
): Effect.Effect<Partial<Record<string, string>>, SdkError> {
  return readFieldsEffect(
    client,
    recordingIdsInput,
    (id) => recordingStreamingTranscodeFieldId(id, recordingStreamingTranscodePackageId),
    parseRecordingStreamingTranscodeContent,
    "omit",
  );
}

export const getRecordingStreamingTranscodesByIds = toPromise(getRecordingStreamingTranscodesByIdsEffect);

// ── Engine-session reads ─────────────────────────────────────────────────────

/** A Recording's attached engine session, ids as decimal `u256` strings. */
export interface RecordingEngineSessionView {
  /** Unencrypted Walrus blob holding the canonical Session V1 JSON. */
  readonly sessionBlobId: string;
  /** Sorted by digest, as stored. `digest` is 64 lowercase hex chars. */
  readonly stems: readonly { readonly digest: string; readonly blobId: string }[];
}

const EngineSessionField = bcs.struct("Field", {
  id: bcs.Address,
  name: engineSession.ExtensionKey,
  value: engineSession.EngineSession,
});
const ENGINE_SESSION_KEY_BYTES = engineSession.ExtensionKey.serialize([false]).toBytes();

/** Parse an engine-session dynamic field's BCS content. */
export function parseRecordingEngineSessionContent(content: Uint8Array): RecordingEngineSessionView {
  const { value } = EngineSessionField.parse(content);
  if (value.data.confidentiality.$kind !== "Unencrypted") {
    throw new Error("Recording engine session is unexpectedly encrypted");
  }
  return {
    sessionBlobId: String(value.data.blob_id),
    stems: value.stems.map((stem) => {
      if (stem.data.confidentiality.$kind !== "Unencrypted") {
        throw new Error("Recording engine session stem is unexpectedly encrypted");
      }
      return { digest: toHex(Uint8Array.from(stem.digest)), blobId: String(stem.data.blob_id) };
    }),
  };
}

/** Deterministic dynamic-field id for a Recording's engine session. */
export function recordingEngineSessionFieldId(
  recordingId: string,
  recordingEngineSessionPackageId: string,
): string {
  return deriveDynamicFieldID(
    recordingId,
    `${recordingEngineSessionPackageId}::recording_engine_session::ExtensionKey`,
    ENGINE_SESSION_KEY_BYTES,
  );
}

/** Read one Recording's engine session, or null when none is attached. */
export function getRecordingEngineSessionEffect(
  client: ClientWithCoreApi,
  recordingId: string,
  recordingEngineSessionPackageId: string,
): Effect.Effect<RecordingEngineSessionView | null, SdkError> {
  return workflow("getRecordingEngineSession", function* () {
    const fieldId = recordingEngineSessionFieldId(recordingId, recordingEngineSessionPackageId);
    const { objects } = yield* tryPromise("getRecordingEngineSession", (signal) =>
      client.core.getObjects({ signal, objectIds: [fieldId], include: { content: true } }),
    );
    const field = objects[0];
    if (!field) throw new Error("Recording engine-session read returned no result");
    if (field instanceof Error) {
      if (isNotFound(field)) return null;
      throw field;
    }
    if (!field.content) throw new Error("Recording engine-session field is missing BCS content");
    return parseRecordingEngineSessionContent(field.content);
  });
}

export const getRecordingEngineSession = toPromise(getRecordingEngineSessionEffect);

/**
 * Read engine sessions for many Recordings in one Core request. Missing and
 * malformed fields are omitted.
 */
export function getRecordingEngineSessionsByIdsEffect(
  client: ClientWithCoreApi,
  recordingIdsInput: readonly string[],
  recordingEngineSessionPackageId: string,
): Effect.Effect<Partial<Record<string, RecordingEngineSessionView>>, SdkError> {
  return readFieldsEffect(
    client,
    recordingIdsInput,
    (id) => recordingEngineSessionFieldId(id, recordingEngineSessionPackageId),
    parseRecordingEngineSessionContent,
    "omit",
  );
}

export const getRecordingEngineSessionsByIds = toPromise(getRecordingEngineSessionsByIdsEffect);

// ── Master-reference reads ───────────────────────────────────────────────────

// recording_master_reference stores the ori::data::WalrusBlob value inline in a
// dynamic field on the Recording. Its empty ExtensionKey serializes to one false
// byte, so the field object id can be derived without listing the Recording's
// dynamic fields.
const MasterReferenceField = bcs.struct("Field", {
  id: bcs.Address,
  name: masterReference.ExtensionKey,
  value: walrusData.WalrusBlob,
});
const MASTER_REFERENCE_KEY_BYTES = masterReference.ExtensionKey.serialize([
  false,
]).toBytes();

/**
 * Parse an attached master reference's standalone Walrus blob id (decimal
 * `u256`). Encrypted masters are returned as-is: the reference is the same
 * either way, and access control belongs to the caller.
 */
export function parseRecordingMasterReferenceContent(content: Uint8Array): string {
  return String(MasterReferenceField.parse(content).value.blob_id);
}

/** Deterministic dynamic-field id for a Recording's master reference. */
export function recordingMasterReferenceFieldId(
  recordingId: string,
  recordingMasterReferencePackageId: string,
): string {
  return deriveDynamicFieldID(
    recordingId,
    `${recordingMasterReferencePackageId}::recording_master_reference::ExtensionKey`,
    MASTER_REFERENCE_KEY_BYTES,
  );
}

/** Read one Recording's master-reference blob id, or null when absent. */
export function getRecordingMasterReferenceEffect(
  client: ClientWithCoreApi,
  recordingId: string,
  recordingMasterReferencePackageId: string,
): Effect.Effect<string | null, SdkError> {
  return workflow("getRecordingMasterReference", function* () {
    return (
      (yield* getRecordingMasterReferencesByIdsEffect(client, [recordingId], recordingMasterReferencePackageId))[
        recordingId
      ] ?? null
    );
  });
}

export const getRecordingMasterReference = toPromise(getRecordingMasterReferenceEffect);

/**
 * Read master-reference blob ids for many Recordings in one Core request.
 *
 * Missing fields and malformed individual objects are omitted so one Recording
 * without a playable master cannot make the rest of an album unplayable.
 */
export function getRecordingMasterReferencesByIdsEffect(
  client: ClientWithCoreApi,
  recordingIdsInput: readonly string[],
  recordingMasterReferencePackageId: string,
): Effect.Effect<Partial<Record<string, string>>, SdkError> {
  return readFieldsEffect(
    client,
    recordingIdsInput,
    (id) => recordingMasterReferenceFieldId(id, recordingMasterReferencePackageId),
    parseRecordingMasterReferenceContent,
    "omit",
  );
}

export const getRecordingMasterReferencesByIds = toPromise(getRecordingMasterReferencesByIdsEffect);
