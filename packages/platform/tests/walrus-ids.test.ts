// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  walrusBlobIdFromU256,
  walrusBlobIdToU256,
} from "../src/walrus-ids.ts";

test("base64url and Walrus u256 conversion are canonical and little-endian", () => {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => index);
  const encoded = bytesToBase64Url(bytes);
  expect(encoded).toHaveLength(43);
  expect(base64UrlToBytes(encoded)).toEqual(bytes);
  expect(() => base64UrlToBytes(`${encoded}=`)).toThrow(/canonical/);
  expect(walrusBlobIdFromU256(1n)).toBe(
    bytesToBase64Url(new Uint8Array([1, ...new Uint8Array(31)])),
  );
});

test("blob id round-trips through u256 and rejects the wrong length", () => {
  const max = (1n << 256n) - 1n;
  expect(walrusBlobIdToU256(walrusBlobIdFromU256(max))).toBe(max);
  expect(walrusBlobIdToU256(walrusBlobIdFromU256("123456789"))).toBe(123456789n);
  expect(walrusBlobIdToU256("VwMOwKRnoRohGqEfRvE_21IUqOLaBp7pbyXnwD68UAE")).toBe(
    walrusBlobIdToU256("VwMOwKRnoRohGqEfRvE_21IUqOLaBp7pbyXnwD68UAE"),
  );
  expect(() => walrusBlobIdToU256("AAAA")).toThrow(/32 bytes/);
  expect(() => walrusBlobIdFromU256(1n << 256n)).toThrow(/u256 range/);
});
