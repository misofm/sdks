// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Internal shared helpers (not exported from the package root).
//
// Mappers from the generated BCS-parse output (snake_case, with @mysten/bcs
// conventions: enums as `{ $kind, [Variant]: payload }`, tuples as arrays,
// VecMap as `{ contents: [{ key, value }] }`, u64/u256 as strings, Address as
// hex) into the public camelCase domain types in `./types`. These are the
// single boundary between codegen output and the public API, so when the
// generated shapes change, type errors surface here.
//

import type {
  BPS,
  Composition,
  Recording,
  Release as ReleaseType,
  Track,
  TrackState,
} from "./types.ts";

// === Mappers ===

/* eslint-disable @typescript-eslint/no-explicit-any */
type Parsed = any;

// === Primitives ===

/** `BPS` is a Move tuple struct `(u16)`, parsed as `[number]`. */
export function mapBps(d: Parsed): BPS {
  return { value: Number(Array.isArray(d) ? d[0] : d) };
}

/** Lifecycle state enum (`Initialized | Published(u64)`). */
export function mapState(
  d: Parsed,
): { type: "Initialized" } | { type: "Published"; timestampMs: number } {
  if (d?.$kind === "Published") return { type: "Published", timestampMs: Number(d.Published) };
  return { type: "Initialized" };
}

// === Objects ===

export function mapComposition(id: string, d: Parsed): Composition {
  return {
    id,
    state: mapState(d.state),
    title: d.title,
    royaltyRate: mapBps(d.royalty_rate),
  };
}

export function mapRecording(id: string, d: Parsed): Recording {
  return {
    id,
    state: mapState(d.state),
    compositionId: d.composition_id,
  };
}

export function mapTrack(d: Parsed): Track {
  return {
    state: (d.state?.$kind ?? "Unassigned") as TrackState,
    compositionId: d.composition_id,
    recordingId: d.recording_id,
    splitBps: mapBps(d.split_bps),
  };
}

export function mapRelease(id: string, d: Parsed): ReleaseType {
  return {
    id,
    state: mapState(d.state),
    title: d.title,
    tracks: (d.tracks ?? []).map(mapTrack),
  };
}
