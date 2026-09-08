// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Internal shared helpers (not exported from the package root).
//
// Mappers from the generated BCS-parse output (snake_case, with @mysten/bcs
// conventions: enums as `{ $kind, [Variant]: payload }`, tuples as arrays,
// VecMap as `{ contents: [{ key, value }] }`, u64/u256 as strings, Address as
// hex) into the camelCase constructor-input shape of the public `Schema.Class`
// domain types in `./types`. These mappers return plain objects, not schema
// instances — `queries.ts` runs the mapped output through `decodeBcs` (which
// calls `Schema.decodeUnknownEffect`) to validate and construct the actual
// class instance. This is the single boundary between codegen output and the
// public API, so when the generated shapes change, type errors surface here.
//

// === Mappers ===

/* eslint-disable @typescript-eslint/no-explicit-any */
type Parsed = any;

// === Primitives ===

/** `BPS` is a Move tuple struct `(u16)`, parsed as `[number]`. */
export function mapBps(d: Parsed): { value: number } {
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

export function mapComposition(id: string, d: Parsed) {
  return {
    id,
    state: mapState(d.state),
    title: d.title as string,
    royaltyRate: mapBps(d.royalty_rate),
  };
}

export function mapRecording(id: string, d: Parsed) {
  return {
    id,
    state: mapState(d.state),
    compositionId: d.composition_id as string,
  };
}

export function mapTrack(d: Parsed) {
  return {
    state: (d.state?.$kind ?? "Unassigned") as "Unassigned" | "Assigned",
    compositionId: d.composition_id as string,
    recordingId: d.recording_id as string,
    splitBps: mapBps(d.split_bps),
  };
}

export function mapRelease(id: string, d: Parsed) {
  return {
    id,
    state: mapState(d.state),
    title: d.title as string,
    tracks: (d.tracks ?? []).map(mapTrack),
  };
}
