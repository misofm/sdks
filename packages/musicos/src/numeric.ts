// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/** JSON-safe input for an unsigned Move integer. Decimal strings preserve exactness. */
export type UnsignedInput = bigint | number | string;

function unsigned(name: string, value: UnsignedInput, maximum: bigint): bigint {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`${name}: number must be a non-negative safe integer; use bigint or decimal string`);
  }
  if (typeof value === "string" && !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${name}: expected an unsigned decimal integer`);
  }
  const parsed = typeof value === "bigint" ? value : BigInt(value);
  if (parsed < 0n || parsed > maximum) throw new Error(`${name}: value is outside its Move integer range`);
  return parsed;
}

export function asU64(name: string, value: UnsignedInput): bigint {
  return unsigned(name, value, 18_446_744_073_709_551_615n);
}

export function asU256(name: string, value: UnsignedInput): bigint {
  return unsigned(name, value, (1n << 256n) - 1n);
}
