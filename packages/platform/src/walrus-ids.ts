// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Walrus blob id conversions.
 *
 * On chain a blob id is a `u256` (BCS little-endian). Off chain it is the
 * unpadded base64url encoding of those same 32 little-endian bytes, which is
 * also its key in a `miso-sources` staging bucket and its path on an
 * aggregator. Both directions here are canonical: a value that does not
 * round-trip byte for byte is rejected.
 */

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Parse a `bigint` or decimal string as an exact `u256`. */
export function walrusU256(label: string, value: bigint | string): bigint {
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

/** The base64url Walrus blob id for an on-chain `u256` blob id. */
export function walrusBlobIdFromU256(value: bigint | string): string {
  let remaining = walrusU256("Walrus blob id", value);
  const bytes = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytesToBase64Url(bytes);
}

/** The on-chain `u256` for a base64url Walrus blob id (43 characters). */
export function walrusBlobIdToU256(blobId: string): bigint {
  const bytes = base64UrlToBytes(blobId);
  if (bytes.length !== 32) {
    throw new Error("Walrus blob id must decode to exactly 32 bytes");
  }
  let value = 0n;
  for (let index = 31; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[index]!);
  }
  return value;
}

/** Unpadded base64url. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    output += ALPHABET[a >>> 2];
    output += ALPHABET[((a & 3) << 4) | (b >>> 4)];
    if (index + 1 < bytes.length) {
      output += ALPHABET[((b & 15) << 2) | (c >>> 6)];
    }
    if (index + 2 < bytes.length) output += ALPHABET[c & 63];
  }
  return output;
}

/** Strict inverse of {@link bytesToBase64Url}: no padding, no stray bits. */
export function base64UrlToBytes(value: string): Uint8Array {
  if (
    typeof value !== "string" ||
    value.length % 4 === 1 ||
    value.includes("=") ||
    !/^[A-Za-z0-9_-]*$/.test(value)
  ) {
    throw new Error("invalid canonical base64url");
  }
  const bytes = new Uint8Array(Math.floor((value.length * 6) / 8));
  let accumulator = 0;
  let bits = 0;
  let outputIndex = 0;
  for (const character of value) {
    const digit = ALPHABET.indexOf(character);
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
