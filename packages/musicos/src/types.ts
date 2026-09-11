// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Schema } from "effect";

// ============================================================================
// Common
// ============================================================================

/** Basis points value (0-10000, where 10000 = 100%). */
export class BPS extends Schema.Class<BPS>("@misofm/musicos/BPS")({
  value: Schema.Number,
}) {}

/** Shared lifecycle-state shape for Composition, Recording, and Release: Initialized -> Published(timestampMs). */
const WorkState = Schema.Union([
  Schema.Struct({ type: Schema.Literal("Initialized") }),
  Schema.Struct({ type: Schema.Literal("Published"), timestampMs: Schema.Number }),
]);

// ============================================================================
// Composition
// ============================================================================

/** Lifecycle state of a composition. */
export const CompositionState = WorkState;
export type CompositionState = typeof WorkState.Type;

/**
 * A musical composition representing the underlying written work.
 *
 * Compositions are the written musical works (songs, instrumentals) that
 * recordings are based on. Each composition has its own share token for
 * ownership distribution.
 *
 * State machine: Initialized -> Published (immutable after publish)
 */
export class Composition extends Schema.Class<Composition>("@misofm/musicos/Composition")({
  /** Unique identifier for this composition. */
  id: Schema.String,
  /** Current lifecycle state. */
  state: CompositionState,
  /** Primary title of the composition. */
  title: Schema.String,
  /**
   * Royalty rate this composition earns from each recording's revenue (basis
   * points, 0-10000). Immutable for the composition's lifetime.
   */
  royaltyRate: BPS,
}) {}

/** Emitted when a composition and its share currency are created. */
export interface CompositionCreatedEvent {
  compositionId: string;
  compositionAdminCapId: string;
  shareCurrencyId: string;
  consumedTreasuryCapId: string;
  createdBy: string;
  titleBytes: number[];
  royaltyRateBps: number;
  shareSupplyBefore: string;
  shareSupplyAfter: string;
  sharesReturned: string;
  shareDecimals: number;
  shareSupplyFixedAfter: boolean;
}

/** Emitted once when a composition is published, with its immutable payload. */
export interface CompositionPublishedEvent {
  compositionId: string;
  compositionAdminCapId: string;
  clockId: string;
  titleBytes: number[];
  royaltyRateBps: number;
  publishedAtMs: string;
  sharedAfter: boolean;
}

/**
 * Admin cap for a Composition, derived deterministically from the Composition object ID.
 *
 * The share type parameter T is extracted from the on-chain type
 * `CompositionAdminCap<T>` where T is the composition's share token type.
 */
export class CompositionAdminCap extends Schema.Class<CompositionAdminCap>("@misofm/musicos/CompositionAdminCap")({
  /** The object ID of the admin cap. */
  id: Schema.String,
  /** The share type parameter T from CompositionAdminCap<T>. */
  shareType: Schema.String,
}) {}

// ============================================================================
// Recording
// ============================================================================

/** Lifecycle state of a recording. */
export const RecordingState = WorkState;
export type RecordingState = typeof WorkState.Type;

/**
 * An audio recording of a composition.
 *
 * Recordings are the audio performances that are distributed and played.
 * Each recording has its own share token for ownership distribution.
 *
 * A recording carries no name of its own: its display title is its
 * composition's title, resolved through the recording's `CompositionShare`
 * type parameter. Richer naming ("(Live)", localized titles) lives in the
 * metadata extension.
 *
 * State machine: Initialized -> Published (immutable after publish)
 */
export class Recording extends Schema.Class<Recording>("@misofm/musicos/Recording")({
  /** Unique identifier for this recording. */
  id: Schema.String,
  /** Current lifecycle state. */
  state: RecordingState,
  /**
   * Object ID of the parent composition. An identity/membership handle — not a
   * revenue routing target: the composition is paid via its recording-share
   * ownership, settled at recording creation. Immutable.
   */
  compositionId: Schema.String,
}) {}

/** Emitted when a recording and its share currency are created. */
export interface RecordingCreatedEvent {
  recordingId: string;
  compositionId: string;
  recordingAdminCapId: string;
  shareCurrencyId: string;
  consumedTreasuryCapId: string;
  createdBy: string;
  compositionRoyaltyRateBps: number;
  shareSupplyBefore: string;
  sharesBeforeGrant: string;
  compositionSharesGranted: string;
  sharesReturned: string;
  shareDecimals: number;
  shareSupplyFixedAfter: boolean;
  compositionFundsSent: boolean;
}

/** Emitted once when a recording is published, with its immutable payload. */
export interface RecordingPublishedEvent {
  recordingId: string;
  compositionId: string;
  recordingAdminCapId: string;
  clockId: string;
  publishedAtMs: string;
  sharedAfter: boolean;
}

/**
 * Legacy event emitted by older recording creation flows. It remains decodable
 * for historical data, but current recording creation emits
 * `RecordingCreatedEvent` instead.
 */
export interface CompositionSharesGrantedEvent {
  recordingId: string;
  compositionId: string;
  /** Recording-share base units sent to the composition address. */
  value: string;
  /** The immutable composition royalty rate applied at recording creation. */
  rateBps: number;
  grantedBy: string;
}

/**
 * Admin cap for a Recording, derived deterministically from the Recording object ID.
 *
 * The share type parameter T is extracted from the on-chain type
 * `RecordingAdminCap<T>` where T is the recording's share token type.
 */
export class RecordingAdminCap extends Schema.Class<RecordingAdminCap>("@misofm/musicos/RecordingAdminCap")({
  /** The object ID of the admin cap. */
  id: Schema.String,
  /** The share type parameter T from RecordingAdminCap<T>. */
  shareType: Schema.String,
}) {}

// Track
// ============================================================================

/** Lifecycle state of a track on a release. */
export const TrackState = Schema.Literals(["Unassigned", "Assigned"]);
export type TrackState = typeof TrackState.Type;

/**
 * A track on a release, linking a recording to its position in the tracklist.
 * The recording is the handle through which all other metadata (share types,
 * composition lineage, and — via the composition — the display title) is
 * reached.
 */
export class Track extends Schema.Class<Track>("@misofm/musicos/Track")({
  /** Current state of the track (Unassigned until the release claims it, then Assigned). */
  state: TrackState,
  /**
   * ID of the composition underlying this track's recording. An identity/
   * membership handle — not a revenue routing target: the composition is paid
   * via its recording-share ownership, and a track routes its full split to the
   * recording.
   */
  compositionId: Schema.String,
  /** ID of the recording on this track. */
  recordingId: Schema.String,
  /** Revenue split for this track within the release (in basis points). */
  splitBps: BPS,
}) {}

// ============================================================================
// Release
// ============================================================================

/** Lifecycle state of a release. */
export const ReleaseState = WorkState;
export type ReleaseState = typeof WorkState.Type;

/**
 * A music release (album, EP, or single).
 *
 * A release is a flat, ordered tracklist with per-track revenue distribution
 * configuration. Display grouping (discs, vinyl sides), cover art, and edition
 * naming live in extensions — the stored tracklist has the same shape as the
 * digest pre-image every track consented to.
 *
 * State machine: Initialized -> Published (immutable after publish)
 */
export class Release extends Schema.Class<Release>("@misofm/musicos/Release")({
  /** Unique identifier for this release. */
  id: Schema.String,
  /** Current lifecycle state. */
  state: ReleaseState,
  /** Title of the release. */
  title: Schema.String,
  /** The ordered tracklist. */
  tracks: Schema.Array(Track),
}) {}

/** Emitted when a release is created under the canonical registry. */
export interface ReleaseCreatedEvent {
  registryId: string;
  releaseId: string;
  releaseAdminCapId: string;
  titleBytes: number[];
  releaseDigest: number[];
  nonce: string;
  compositionIds: string[];
  recordingIds: string[];
  trackSplitBps: string[];
  trackCount: string;
}

/** Emitted once when a release is published, with its immutable payload. */
export interface ReleasePublishedEvent {
  releaseId: string;
  releaseAdminCapId: string;
  clockId: string;
  titleBytes: number[];
  publishedAtMs: string;
  compositionIds: string[];
  recordingIds: string[];
  trackSplitBps: string[];
  assignedTrackCount: string;
  sharedAfter: boolean;
}

/** Emitted when package initialization shares the canonical release registry. */
export interface ReleaseRegistryCreatedEvent {
  registryId: string;
  createdBy: string;
  sharedAfter: boolean;
}

/** The shared canonical core `miso::release::ReleaseRegistry`. */
export class ReleaseRegistry extends Schema.Class<ReleaseRegistry>("@misofm/musicos/ReleaseRegistry")({
  id: Schema.String,
}) {}

/**
 * Admin cap for a Release, derived deterministically from the Release object ID.
 *
 * Unlike Composition and Recording admin caps, ReleaseAdminCap is not generic
 * (Release has no share type parameter) and stores a reference to its Release.
 */
export class ReleaseAdminCap extends Schema.Class<ReleaseAdminCap>("@misofm/musicos/ReleaseAdminCap")({
  /** The object ID of the admin cap. */
  id: Schema.String,
  /** The object ID of the Release this cap administers. */
  releaseId: Schema.String,
}) {}
