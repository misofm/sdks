// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * `miso-hls/v1`: the one definition of a Miso streaming transcode.
 *
 * The transcoder produces this layout, the publisher packs it into one Walrus
 * Quilt, and players fetch items out of that Quilt by identifier. All three
 * import this module so a change in one cannot drift from the others.
 *
 * This package is dependency-free and browser-safe. It knows the shape of a
 * transcode: nothing about storage, networks, or the tools that produce it.
 */

/** Contract identifier recorded next to every transcode this layout describes. */
export const HLS_CONTRACT = "miso-hls/v1" as const;

/** The rendition ladder, ascending. AAC-LC, stereo, source sample rate. */
export const RENDITIONS = [
  { id: "aac-96", nominalBitrate: 96_000 },
  { id: "aac-160", nominalBitrate: 160_000 },
  { id: "aac-256", nominalBitrate: 256_000 },
] as const;

export type Rendition = (typeof RENDITIONS)[number];
export type RenditionId = Rendition["id"];
export type NominalBitrate = Rendition["nominalBitrate"];

/** RFC 6381 codec string every rendition declares. */
export const CODEC = "mp4a.40.2" as const;

/** Output channel count. Mono sources are upmixed by the encoder. */
export const CHANNELS = 2 as const;

/** Sample rates a transcode may carry; the encoder preserves the source's. */
export const SAMPLE_RATES = [44_100, 48_000] as const;
export type SampleRateHz = (typeof SAMPLE_RATES)[number];

/** Segment length the encoder aims for, and the ceiling it may stretch to. */
export const DEFAULT_SEGMENT_TARGET_MS = 6_000;
export const MAX_SEGMENT_TARGET_MS = 10_000;

/** AAC frame length, used to bound segment-count estimates conservatively. */
export const AAC_FRAME_SAMPLES = 1_024;

/**
 * Upper bound on segments per rendition so one track always fits one Quilt:
 * a Quilt holds at most {@link MAX_QUILT_ITEMS} items, and a package is the
 * index, the master playlist, and per rendition a playlist, an init segment,
 * and its media segments. 2 + 3 × (2 + 219) = 665.
 */
export const MAX_SEGMENTS_PER_RENDITION = 219;

/** Walrus Quilt item limit for the shard configuration Miso publishes to. */
export const MAX_QUILT_ITEMS = 666;

/** Every item identifier in a package matches this and never contains `..`. */
export const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const MASTER_PLAYLIST = "master.m3u8" as const;
export const PACKAGE_INDEX = "index.json" as const;
export const PACKAGE_INDEX_SCHEMA = "miso.transcode-package/1" as const;

export const PLAYLIST_CONTENT_TYPE = "application/vnd.apple.mpegurl" as const;
export const MEDIA_CONTENT_TYPE = "audio/mp4" as const;
export const PACKAGE_INDEX_CONTENT_TYPE = "application/json; charset=utf-8" as const;

const SEGMENT_SEQUENCE_DIGITS = 5;

/** `aac-96.m3u8` */
export function renditionPlaylistIdentifier(id: RenditionId): string {
  return `${id}.m3u8`;
}

/** `aac-96-init.mp4` */
export function renditionInitIdentifier(id: RenditionId): string {
  return `${id}-init.mp4`;
}

/** `aac-96-00017.m4s` */
export function segmentIdentifier(id: RenditionId, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new RangeError(`segment sequence must be a non-negative integer, got ${sequence}`);
  }
  return `${id}-${String(sequence).padStart(SEGMENT_SEQUENCE_DIGITS, "0")}.m4s`;
}

/** Content type for an item, by its identifier. */
export function contentTypeFor(identifier: string): string {
  if (identifier === PACKAGE_INDEX) return PACKAGE_INDEX_CONTENT_TYPE;
  if (identifier.endsWith(".m3u8")) return PLAYLIST_CONTENT_TYPE;
  return MEDIA_CONTENT_TYPE;
}

/** Whether an identifier is safe to store and serve under this contract. */
export function isValidIdentifier(identifier: string): boolean {
  return IDENTIFIER_PATTERN.test(identifier) && !identifier.includes("..");
}

/**
 * The canonical item order of a package: index, master playlist, then per
 * rendition (ascending) its playlist, init, and segments. `segmentCounts`
 * gives the number of media segments each rendition carries, in ladder order.
 *
 * Storage may impose its own order on items; this is the order the package
 * index lists them in and the order verification walks.
 */
export function canonicalItemOrder(segmentCounts: readonly number[]): string[] {
  if (segmentCounts.length !== RENDITIONS.length) {
    throw new RangeError(`expected ${RENDITIONS.length} segment counts, got ${segmentCounts.length}`);
  }
  const items: string[] = [PACKAGE_INDEX, MASTER_PLAYLIST];
  RENDITIONS.forEach((rendition, index) => {
    const count = segmentCounts[index]!;
    if (!Number.isSafeInteger(count) || count < 1 || count > MAX_SEGMENTS_PER_RENDITION) {
      throw new RangeError(`rendition ${rendition.id} has ${count} segments; must be 1..${MAX_SEGMENTS_PER_RENDITION}`);
    }
    items.push(renditionPlaylistIdentifier(rendition.id), renditionInitIdentifier(rendition.id));
    for (let sequence = 0; sequence < count; sequence += 1) {
      items.push(segmentIdentifier(rendition.id, sequence));
    }
  });
  return items;
}

/**
 * Conservative segment count for a duration at a target length: the encoder
 * may emit one extra segment for the trailing partial AAC frame.
 */
export function conservativeSegmentCount(durationMs: number, targetMs: number): number {
  return Math.ceil((durationMs + Math.ceil((AAC_FRAME_SAMPLES * 1_000) / 44_100)) / targetMs);
}

/**
 * The segment target the encoder should use for a track so every rendition
 * fits within {@link MAX_SEGMENTS_PER_RENDITION}, stretching from the default
 * toward the maximum one millisecond at a time. `undefined` means the track is
 * too long for one Quilt under this contract.
 */
export function chooseSegmentTargetMs(
  durationMs: number,
  maxSegmentsPerRendition: number = MAX_SEGMENTS_PER_RENDITION,
): number | undefined {
  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs <= 0 ||
    !Number.isSafeInteger(maxSegmentsPerRendition) ||
    maxSegmentsPerRendition < 1
  ) {
    return undefined;
  }
  for (let target = DEFAULT_SEGMENT_TARGET_MS; target <= MAX_SEGMENT_TARGET_MS; target += 1) {
    if (conservativeSegmentCount(durationMs, target) <= maxSegmentsPerRendition) return target;
  }
  return undefined;
}

/**
 * URL of one item inside a Quilt on a Walrus aggregator, or a CDN in front of
 * one. `base` is the origin with no trailing slash requirement.
 */
export function quiltItemUrl(base: string, quiltId: string, identifier: string): string {
  if (!isValidIdentifier(identifier)) throw new RangeError(`invalid item identifier: ${identifier}`);
  return `${base.replace(/\/$/, "")}/v1/blobs/by-quilt-id/${encodeURIComponent(quiltId)}/${identifier}`;
}

/** Longest track this contract can pack into one Quilt, in milliseconds. */
export function maxTrackDurationMs(): number {
  let low = 1;
  let high = 24 * 60 * 60 * 1_000;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (chooseSegmentTargetMs(mid) === undefined) high = mid - 1;
    else low = mid;
  }
  return low;
}
