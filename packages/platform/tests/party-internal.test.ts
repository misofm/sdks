// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import { b64UrlToU256, u256ToB64Url } from "../src/party/internal.ts";

describe("Walrus id encoding", () => {
  test("round-trips u256 ids through base64url", () => {
    const id = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    expect(b64UrlToU256(u256ToB64Url(id))).toBe(id);
  });

  test("emits URL-safe unpadded ids", () => {
    expect(u256ToB64Url("42")).not.toMatch(/[+/=]/);
  });
});
