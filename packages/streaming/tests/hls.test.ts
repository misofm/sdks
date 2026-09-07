// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import {
  CODEC,
  DEFAULT_SEGMENT_TARGET_MS,
  HLS_CONTRACT,
  MAX_QUILT_ITEMS,
  MAX_SEGMENTS_PER_RENDITION,
  MAX_SEGMENT_TARGET_MS,
  RENDITIONS,
  canonicalItemOrder,
  chooseSegmentTargetMs,
  contentTypeFor,
  isValidIdentifier,
  maxTrackDurationMs,
  renditionInitIdentifier,
  renditionPlaylistIdentifier,
  segmentIdentifier,
} from "../src/index.ts";

test("the ladder is fixed, ascending, and AAC-LC", () => {
  expect(HLS_CONTRACT).toBe("miso-hls/1");
  expect(RENDITIONS.map((r) => r.id)).toEqual(["aac-96", "aac-160", "aac-256"]);
  expect(RENDITIONS.map((r) => r.nominalBitrate)).toEqual([96_000, 160_000, 256_000]);
  expect(CODEC).toBe("mp4a.40.2");
});

test("item identifiers follow the shipped flat layout", () => {
  expect(renditionPlaylistIdentifier("aac-96")).toBe("aac-96.m3u8");
  expect(renditionInitIdentifier("aac-160")).toBe("aac-160-init.mp4");
  expect(segmentIdentifier("aac-256", 0)).toBe("aac-256-00000.m4s");
  expect(segmentIdentifier("aac-256", 218)).toBe("aac-256-00218.m4s");
  expect(() => segmentIdentifier("aac-96", -1)).toThrow(RangeError);
  for (const id of ["master.m3u8", "index.json", "aac-96-00001.m4s"]) {
    expect(isValidIdentifier(id)).toBe(true);
  }
  expect(isValidIdentifier("aac/96.m3u8")).toBe(false);
  expect(isValidIdentifier("../x")).toBe(false);
  expect(contentTypeFor("index.json")).toBe("application/json; charset=utf-8");
  expect(contentTypeFor("aac-96.m3u8")).toBe("application/vnd.apple.mpegurl");
  expect(contentTypeFor("aac-96-init.mp4")).toBe("audio/mp4");
});

test("a maximal package fits one Quilt", () => {
  const order = canonicalItemOrder([
    MAX_SEGMENTS_PER_RENDITION,
    MAX_SEGMENTS_PER_RENDITION,
    MAX_SEGMENTS_PER_RENDITION,
  ]);
  expect(order.length).toBeLessThanOrEqual(MAX_QUILT_ITEMS);
  expect(order.slice(0, 4)).toEqual(["index.json", "master.m3u8", "aac-96.m3u8", "aac-96-init.mp4"]);
  expect(new Set(order).size).toBe(order.length);
  expect(() => canonicalItemOrder([1, 1])).toThrow(RangeError);
  expect(() => canonicalItemOrder([1, 1, MAX_SEGMENTS_PER_RENDITION + 1])).toThrow(RangeError);
});

test("segment targets stretch from the default toward the ceiling, then refuse", () => {
  expect(chooseSegmentTargetMs(3 * 60_000)).toBe(DEFAULT_SEGMENT_TARGET_MS);
  const longest = maxTrackDurationMs();
  expect(chooseSegmentTargetMs(longest)).toBeLessThanOrEqual(MAX_SEGMENT_TARGET_MS);
  expect(chooseSegmentTargetMs(longest + 1)).toBeUndefined();
  // Roughly 36 minutes at the 10 s ceiling and 219 segments.
  expect(longest).toBeGreaterThan(36 * 60_000);
  expect(longest).toBeLessThan(37 * 60_000);
  expect(chooseSegmentTargetMs(0)).toBeUndefined();
});

test("quilt item URLs follow the aggregator by-quilt-id shape", async () => {
  const { quiltItemUrl } = await import("../src/index.ts");
  expect(quiltItemUrl("https://stream.miso.fm/", "abc_-1", "master.m3u8")).toBe(
    "https://stream.miso.fm/v1/blobs/by-quilt-id/abc_-1/master.m3u8",
  );
  expect(() => quiltItemUrl("https://x", "q", "../etc")).toThrow(RangeError);
});
