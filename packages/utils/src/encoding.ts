// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs, fromBase64, toBase64 } from "@mysten/bcs";

/** Unpadded base64url using the same codec exported by @mysten/sui/utils. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/=+$/, "").replaceAll("+", "-").replaceAll("/", "_");
}

/** Strict canonical inverse: rejects padding, invalid characters, and unused bits. */
export function base64UrlToBytes(value: string): Uint8Array {
  if (typeof value !== "string" || value.length % 4 === 1 || !/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new Error("invalid canonical base64url");
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(padded);
  } catch {
    throw new Error("invalid canonical base64url padding bits");
  }
  if (bytesToBase64Url(bytes) !== value) throw new Error("invalid canonical base64url padding bits");
  return bytes;
}

/** Legacy Walrus scalar policy: accepts BigInt-compatible strings, with exact u256 bounds. */
export function walrusU256(label: string, value: bigint | string): bigint {
  let parsed: bigint;
  try {
    parsed = typeof value === "bigint" ? value : BigInt(value);
  } catch {
    throw new Error(`${label} must be an exact u256 integer`);
  }
  if (parsed < 0n || parsed >= 1n << 256n) throw new Error(`${label} is outside u256 range`);
  return parsed;
}

/** Encode the 32 little-endian bytes of a Walrus blob ID. */
export function walrusBlobIdFromU256(value: bigint | string): string {
  return bytesToBase64Url(bcs.u256().serialize(walrusU256("Walrus blob id", value)).toBytes());
}

/** Decode a canonical unpadded 43-character Walrus blob ID. */
export function walrusBlobIdToU256(value: string): bigint {
  const bytes = base64UrlToBytes(value);
  if (bytes.length !== 32) throw new Error("Walrus blob id must decode to exactly 32 bytes");
  return BigInt(bcs.u256().parse(bytes));
}
