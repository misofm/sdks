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

/**
 * The canonical read URL for a blob: `{aggregator}/v1/blobs/{blob_id}`, no query.
 *
 * Read policy is not the client's to pin. Walrus's default consistency check
 * has been the fast one since v1.37, its aggregator rejects any query
 * parameter it does not know, and a query string splits every cache (browser,
 * edge, CDN) into one entry per spelling of the same blob. Anything Miso wants
 * to say to the aggregator about a read belongs in the CDN that fronts it.
 */
export function walrusBlobReadUrl(
  aggregator: string,
  blobId: bigint | string,
): string {
  const base = aggregator.replace(/\/$/, "");
  return `${base}/v1/blobs/${u256ToB64Url(blobId)}`;
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
