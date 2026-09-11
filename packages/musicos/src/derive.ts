// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Deterministic admin-cap id derivation. Pure — no chain read, no `Sui`
// requirement — so these stay standalone exports rather than `Musicos`
// service members; unchanged from 0.3.x.

import { deriveObjectID } from "@mysten/sui/utils";

/** Key bytes for Move unit structs (single `0x00` for `dummy_field: bool = false`). */
const UNIT_STRUCT_KEY_BYTES = new Uint8Array([0x00]);

export function deriveCompositionAdminCapId(compositionId: string, misoPackageId: string): string {
  return deriveObjectID(compositionId, `${misoPackageId}::composition::CompositionAdminCapKey`, UNIT_STRUCT_KEY_BYTES);
}

export function deriveRecordingAdminCapId(recordingId: string, misoPackageId: string): string {
  return deriveObjectID(recordingId, `${misoPackageId}::recording::RecordingAdminCapKey`, UNIT_STRUCT_KEY_BYTES);
}

export function deriveReleaseAdminCapId(releaseId: string, misoPackageId: string): string {
  return deriveObjectID(releaseId, `${misoPackageId}::release::ReleaseAdminCapKey`, UNIT_STRUCT_KEY_BYTES);
}
