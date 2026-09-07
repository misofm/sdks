// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { HLS_CONTRACT, MASTER_PLAYLIST, WALRUS_N_SHARDS, quiltItemUrl } from "../src/streaming.ts";

test("platform re-exports the miso-hls/1 contract and pins the Walrus shard count", () => {
  expect(HLS_CONTRACT).toBe("miso-hls/1");
  expect(WALRUS_N_SHARDS).toBe(1000);
  expect(quiltItemUrl("https://stream.miso.fm", "q", MASTER_PLAYLIST)).toBe(
    "https://stream.miso.fm/v1/blobs/by-quilt-id/q/master.m3u8",
  );
});
