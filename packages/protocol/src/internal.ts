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
} from "./types.ts";
import { Composition as CompositionBcs } from "./contracts/miso/composition.ts";
import { Recording as RecordingBcs } from "./contracts/miso/recording.ts";
import { Release as ReleaseBcs } from "./contracts/miso/release.ts";
import { Track as TrackBcs } from "./contracts/miso/track.ts";

// === Mappers ===

type ParsedComposition = ReturnType<typeof CompositionBcs.parse>;

// === Primitives ===

/** `BPS` is a Move tuple struct `(u16)`, parsed as `[number]`. */
export function mapBps(d: ParsedComposition["royalty_rate"]): BPS {
  return { value: d[0] };
}

/** Lifecycle state enum (`Initialized | Published(u64)`). */
export function mapState(
  d: ParsedComposition["state"],
): { type: "Initialized" } | { type: "Published"; timestampMs: number } {
  if (d?.$kind === "Published") return { type: "Published", timestampMs: Number(d.Published) };
  return { type: "Initialized" };
}

// === Objects ===

export function mapComposition(id: string, d: ParsedComposition): Composition {
  return {
    id,
    state: mapState(d.state),
    title: d.title,
    royaltyRate: mapBps(d.royalty_rate),
  };
}

export function mapRecording(id: string, d: ReturnType<typeof RecordingBcs.parse>): Recording {
  return {
    id,
    state: mapState(d.state),
    compositionId: d.composition_id,
  };
}

export function mapTrack(d: ReturnType<typeof TrackBcs.parse>): Track {
  return {
    state: d.state.$kind,
    compositionId: d.composition_id,
    recordingId: d.recording_id,
    splitBps: mapBps(d.split_bps),
  };
}

export function mapRelease(id: string, d: ReturnType<typeof ReleaseBcs.parse>): ReleaseType {
  return {
    id,
    state: mapState(d.state),
    title: d.title,
    tracks: d.tracks.map(mapTrack),
  };
}
