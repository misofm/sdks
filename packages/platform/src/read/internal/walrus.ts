// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs } from "@mysten/sui/bcs";
import { toBase64 } from "@mysten/sui/utils";
import { walrusBlobIdFromU256 } from "../../walrus-ids.ts";

const u256 = bcs.u256();

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/=*$/, "").replaceAll("+", "-").replaceAll("/", "_");
}

export function u256ToB64Url(value: bigint | string): string {
  return walrusBlobIdFromU256(value);
}

/** Build a blob URL with Walrus's non-strict default made explicit. */
export function walrusBlobReadUrl(
  aggregator: string,
  blobId: bigint | string,
): string {
  const base = aggregator.replace(/\/$/, "");
  return `${base}/v1/blobs/${u256ToB64Url(blobId)}?strict_consistency_check=false`;
}

/** Build Walrus's 37-byte quilt-patch id. All fields use BCS little-endian. */
export function quiltPatchId(
  quiltId: bigint | string,
  version: number,
  startIndex: number,
  endIndex: number,
): string {
  const bytes = new Uint8Array(37);
  bytes.set(u256.serialize(BigInt(quiltId)).toBytes(), 0);
  bytes[32] = version;
  bytes[33] = startIndex & 0xff;
  bytes[34] = (startIndex >> 8) & 0xff;
  bytes[35] = endIndex & 0xff;
  bytes[36] = (endIndex >> 8) & 0xff;
  return toBase64Url(bytes);
}
