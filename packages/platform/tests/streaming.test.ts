// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { HLS_CONTRACT, MASTER_PLAYLIST, quiltItemUrl, streamUrl } from "../src/streaming.ts";
import {
  WALRUS_BLOBS_DELETABLE,
  WALRUS_BLOBS_SHARED,
  WALRUS_N_SHARDS,
  WALRUS_STORAGE_EPOCHS,
  walrusAggregatorUrl,
} from "../src/walrus.ts";

test("platform re-exports the miso-hls/v1 contract and resolves stream URLs per network", () => {
  expect(HLS_CONTRACT).toBe("miso-hls/v1");
  expect(quiltItemUrl("https://stream.miso.fm", "q", MASTER_PLAYLIST)).toBe(
    "https://stream.miso.fm/v1/blobs/by-quilt-id/q/master.m3u8",
  );
  expect(streamUrl("testnet", "q")).toBe(
    "https://aggregator.testnet.walrus.mirai.cloud/v1/blobs/by-quilt-id/q/master.m3u8",
  );
});

test("Walrus publication policy is fixed by the platform, not release.json", () => {
  expect(WALRUS_N_SHARDS).toBe(1000);
  expect(WALRUS_STORAGE_EPOCHS).toBe(26);
  expect(WALRUS_BLOBS_DELETABLE).toBe(false);
  expect(WALRUS_BLOBS_SHARED).toBe(true);
  expect(walrusAggregatorUrl("mainnet")).toBe("https://aggregator.mainnet.walrus.mirai.cloud");
});
