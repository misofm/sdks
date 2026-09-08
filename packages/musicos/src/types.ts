// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// ============================================================================
// Common
// ============================================================================

/** Basis points value (0-10000, where 10000 = 100%). */
export interface BPS {
  value: number;
}

// ============================================================================
// Composition
// ============================================================================

/** Lifecycle state of a composition. */
export type CompositionState =
  | { type: "Initialized" }
  | { type: "Published"; timestampMs: number };

/**
 * A musical composition representing the underlying written work.
 *
 * Compositions are the written musical works (songs, instrumentals) that
 * recordings are based on. Each composition has its own share token for
 * ownership distribution.
 *
 * State machine: Initialized -> Published (immutable after publish)
 */
export interface Composition {
  /** Unique identifier for this composition. */
  id: string;
  /** Current lifecycle state. */
  state: CompositionState;
  /** Primary title of the composition. */
  title: string;
  /**
   * Royalty rate this composition earns from each recording's revenue (basis
   * points, 0-10000). Immutable for the composition's lifetime.
   */
  royaltyRate: BPS;
}

/**
 * Emitted once when a composition is published. A pure pointer carrying only the
 * composition's identity — an indexer fetches the full immutable object by
 * `compositionId`.
 */
export interface CompositionPublishedEvent {
  compositionId: string;
}

/**
 * Admin cap for a Composition, derived deterministically from the Composition object ID.
 *
 * The share type parameter T is extracted from the on-chain type
 * `CompositionAdminCap<T>` where T is the composition's share token type.
 */
export interface CompositionAdminCap {
  /** The object ID of the admin cap. */
  id: string;
  /** The share type parameter T from CompositionAdminCap<T>. */
  shareType: string;
}

// ============================================================================
// Recording
// ============================================================================

/** Lifecycle state of a recording. */
export type RecordingState =
  | { type: "Initialized" }
  | { type: "Published"; timestampMs: number };

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
export interface Recording {
  /** Unique identifier for this recording. */
  id: string;
  /** Current lifecycle state. */
  state: RecordingState;
  /**
   * Object ID of the parent composition. An identity/membership handle — not a
   * revenue routing target: the composition is paid via its recording-share
   * ownership, settled at recording creation. Immutable.
   */
  compositionId: string;
}

/**
 * Emitted once when a recording is published. A pure pointer carrying only the
 * recording's identity — an indexer fetches the full immutable object by
 * `recordingId`.
 */
export interface RecordingPublishedEvent {
  recordingId: string;
}

/**
 * Emitted when recording creation grants the composition its immutable royalty
 * rate's share of the new recording currency.
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
export interface RecordingAdminCap {
  /** The object ID of the admin cap. */
  id: string;
  /** The share type parameter T from RecordingAdminCap<T>. */
  shareType: string;
}

// Track
// ============================================================================

/** Lifecycle state of a track on a release. */
export type TrackState = "Unassigned" | "Assigned";

/**
 * A track on a release, linking a recording to its position in the tracklist.
 * The recording is the handle through which all other metadata (share types,
 * composition lineage, and — via the composition — the display title) is
 * reached.
 */
export interface Track {
  /** Current state of the track (Unassigned until the release claims it, then Assigned). */
  state: TrackState;
  /**
   * ID of the composition underlying this track's recording. An identity/
   * membership handle — not a revenue routing target: the composition is paid
   * via its recording-share ownership, and a track routes its full split to the
   * recording.
   */
  compositionId: string;
  /** ID of the recording on this track. */
  recordingId: string;
  /** Revenue split for this track within the release (in basis points). */
  splitBps: BPS;
}

// ============================================================================
// Release
// ============================================================================

/** Lifecycle state of a release. */
export type ReleaseState =
  | { type: "Initialized" }
  | { type: "Published"; timestampMs: number };

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
export interface Release {
  /** Unique identifier for this release. */
  id: string;
  /** Current lifecycle state. */
  state: ReleaseState;
  /** Title of the release. */
  title: string;
  /** The ordered tracklist. */
  tracks: Track[];
}

/**
 * Emitted once when a release is published. A pure pointer carrying only the
 * release's identity — an indexer fetches the full immutable object by
 * `releaseId`.
 */
export interface ReleasePublishedEvent {
  releaseId: string;
}

/** Emitted when package initialization shares the canonical release registry. */
export interface ReleaseRegistryCreatedEvent {
  registryId: string;
  createdBy: string;
}

/**
 * Admin cap for a Release, derived deterministically from the Release object ID.
 *
 * Unlike Composition and Recording admin caps, ReleaseAdminCap is not generic
 * (Release has no share type parameter) and stores a reference to its Release.
 */
export interface ReleaseAdminCap {
  /** The object ID of the admin cap. */
  id: string;
  /** The object ID of the Release this cap administers. */
  releaseId: string;
}
