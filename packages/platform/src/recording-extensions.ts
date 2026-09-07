// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/** Cap-authorized builders and reads for data-only Recording metadata extensions. */

import { bcs } from "@mysten/sui/bcs";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { Transaction, TransactionArgument, TransactionObjectArgument } from "@mysten/sui/transactions";
import { deriveDynamicFieldID } from "@mysten/sui/utils";
import type { TxThunk } from "./transactions.ts";
import { invokeWithAdminCap, type AdminCapAuthority, type ObjectInput } from "./vault.ts";
import * as advisory from "@misofm/protocol/contracts/recording_advisory/recording_advisory";
import * as language from "@misofm/protocol/contracts/recording_language/recording_language";
import * as walrusData from "@misofm/protocol/contracts/recording_master_reference/deps/ori/data";
import * as masterReference from "@misofm/protocol/contracts/recording_master_reference/recording_master_reference";
import * as engineSession from "@misofm/protocol/contracts/recording_engine_session/recording_engine_session";
import * as streamingTranscode from "@misofm/protocol/contracts/recording_streaming_transcode/recording_streaming_transcode";
import { unencryptedWalrusBlob } from "./internal.ts";

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

export interface SetRecordingEngineSessionParams extends RecordingExtensionTarget {
  readonly recordingEngineSessionPackageId: string;
  /** External `ori` package used to construct the plaintext Walrus blob reference. */
  readonly oriPackageId: string;
  /** Unencrypted Walrus blob ID of the Miso Engine session file, as its on-chain `u256`. */
  readonly sessionBlobId: bigint | string;
}

/**
 * Sets or replaces the Miso Engine session file attached to a Recording.
 *
 * `recording_engine_session::new` rejects encrypted blobs on chain, so the
 * reference is always built as a plaintext `ori::data::WalrusBlob`.
 */
export function setRecordingEngineSession(p: SetRecordingEngineSessionParams): TxThunk {
  return (tx) => {
    const session = tx.add(engineSession._new({
      package: p.recordingEngineSessionPackageId,
      arguments: [unencryptedWalrusBlob(tx, p.oriPackageId, p.sessionBlobId)],
    }));
    invokeWithAdminCap(tx, p.authority, {
      target: `${p.recordingEngineSessionPackageId}::recording_engine_session::set_engine_session`,
      typeArguments: [p.recordingShareType, p.compositionShareType],
      arguments: [object(tx, p.recordingId), session],
      adminCapIndex: 1,
    });
  };
}

export type UnsetRecordingEngineSessionParams = Omit<
  SetRecordingEngineSessionParams,
  "oriPackageId" | "sessionBlobId"
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
export async function getRecordingMasterReference(
  client: ClientWithCoreApi,
  recordingId: string,
  recordingMasterReferencePackageId: string,
): Promise<string | null> {
  return (
    (
      await getRecordingMasterReferencesByIds(
        client,
        [recordingId],
        recordingMasterReferencePackageId,
      )
    )[recordingId] ?? null
  );
}

/**
 * Read master-reference blob ids for many Recordings in one Core request.
 *
 * Missing fields and malformed individual objects are omitted so one Recording
 * without a playable master cannot make the rest of an album unplayable.
 */
export async function getRecordingMasterReferencesByIds(
  client: ClientWithCoreApi,
  recordingIdsInput: readonly string[],
  recordingMasterReferencePackageId: string,
): Promise<Partial<Record<string, string>>> {
  const recordingIds = [...new Set(recordingIdsInput)];
  const targets = recordingIds.map((recordingId) => ({
    recordingId,
    fieldId: recordingMasterReferenceFieldId(
      recordingId,
      recordingMasterReferencePackageId,
    ),
  }));
  if (targets.length === 0) return {};

  const { objects } = await client.core.getObjects({
    objectIds: targets.map((target) => target.fieldId),
    include: { content: true },
  });
  const out: Partial<Record<string, string>> = {};
  objects.forEach((object, index) => {
    const target = targets[index];
    if (!target || object instanceof Error || !object.content) return;
    try {
      out[target.recordingId] = parseRecordingMasterReferenceContent(object.content);
    } catch {
      // Extension metadata is soft: retain valid tracks when one field is stale.
    }
  });
  return out;
}
