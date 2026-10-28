// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Transaction builders. Every builder adds commands to a caller-owned
// `Transaction`, so flows compose in a single PTB.
// The `create*` primitives take the `Transaction` as their FIRST argument and
// return their by-value results, so those results can be threaded into later
// commands. Miso calls go through the codegen-generated, type-safe call
// functions.
//
// This module keeps the bare protocol PRIMITIVES only. The rule is: do the
// minimum the Move semantics FORCE, and return anything the caller could
// legitimately route elsewhere.
//
// `createComposition` and `createRecording` each append a
// single `::new` and hand back its by-value results — never dispersing a share
// supply, publishing (sharing) the object, or routing an admin cap.
//
// Each created object MUST still be consumed by its `publish` in the same PTB
// (`Composition`, `Recording`, and `Release` are all `key`-only with no `drop`),
// but that is a same-TRANSACTION requirement, not a same-FUNCTION one: a later
// `finalize*` command on the same `tx` satisfies it. Keeping them apart is what
// lets the intermediate value be used at all — borrowing a still-unshared
// composition into `recording::new`, attaching a royalty pool via `uid_mut`, or
// sending an admin cap somewhere other than a plain address (every admin cap is
// `key, store`, so it is freely routable).
//
// This package exposes the complete low-level current ABI. The platform SDK
// should own product-specific orchestration (cap disposition, currency
// lifecycle, authority-package workflows) on top of these composable calls.

import {
  Transaction,
  type TransactionObjectArgument,
} from "@mysten/sui/transactions";

import * as composition from "./contracts/musicos/composition.ts";
import * as recording from "./contracts/musicos/recording.ts";
import * as release from "./contracts/musicos/release.ts";
import { asU256, type UnsignedInput } from "./numeric.ts";
import * as track from "./contracts/musicos/track.ts";

// Every builder here is a `Recipe` fragment (`sui-effect`'s `(tx) => void`, or
// `(tx) => A` for one that hands back by-value results to thread onward): a
// caller-owned `Transaction` first, composed with other fragments and run
// once with `Tx.run`. `TxThunk` is no longer exported — `Recipe` from
// `sui-effect` is the type; see `index.ts` for a deprecated alias kept for
// existing callers.

// ============================================================================
// Shared inputs
// ============================================================================

/**
 * Share-currency binding for a work: the fully-qualified `share::Share` type, the
 * `Currency<Share>` object, and the `TreasuryCap<Share>`. All three are known once
 * the currency has been published + initialized, so builders take them explicitly
 * rather than reading them from chain — keeping the thunks synchronous and
 * composable (no RPC inside the transaction build).
 */
export interface ShareCurrencyBinding {
  /** The `${packageId}::share::Share` type. */
  shareType: string;
  /** The `Currency<Share>` object id. */
  shareCurrencyId: string;
  /** The `TreasuryCap<Share>` object id (held by the caller, consumed by `new`). */
  shareTreasuryCapId: string;
}

// ============================================================================
// Composition
// ============================================================================

/** The three by-value results of `composition::new`, for threading onward in a PTB. */
export interface CompositionParts {
  composition: TransactionObjectArgument;
  adminCap: TransactionObjectArgument;
  /** The creator's freshly-minted share supply (a `Balance<Share>`). */
  balance: TransactionObjectArgument;
}

export interface CreateCompositionParams extends ShareCurrencyBinding {
  title: string;
  royaltyRateBps: number;
  misoPackageId: string;
}

/**
 * PRIMITIVE. Appends `composition::new` and returns its by-value results without
 * dispersing, sharing, or transferring anything — the caller decides what happens
 * next (share it, keep it unshared to bundle with a recording, attach a dynamic
 * field via `uid_mut`, …). Composes with anything in the same PTB.
 */
export function createComposition(tx: Transaction, params: CreateCompositionParams): CompositionParts {
  const result = tx.add(
    composition._new({
      package: params.misoPackageId,
      typeArguments: [params.shareType],
      arguments: [tx.pure.string(params.title), tx.pure.u16(params.royaltyRateBps), tx.object(params.shareCurrencyId), tx.object(params.shareTreasuryCapId)],
    }),
  );
  return { composition: result[0]!, adminCap: result[1]!, balance: result[2]! };
}

// ============================================================================
// Recording
// ============================================================================

/** The three by-value results of `recording::new`, for threading onward in a PTB. */
export interface RecordingParts {
  recording: TransactionObjectArgument;
  adminCap: TransactionObjectArgument;
  /** The creator's remaining share supply after the composition's cut is split off. */
  balance: TransactionObjectArgument;
}

export interface CreateRecordingParams extends ShareCurrencyBinding {
  /** Share type of the parent composition (the recording's `CompositionShare` phantom). */
  compositionShareType: string;
  /**
   * Parent `Composition`, passed by immutable reference (`recording::new` reads only
   * its id + royalty rate). May be an on-chain object (`tx.object(id)`) or a still-
   * unshared, transaction-local `createComposition(...).composition` result.
   */
  composition: TransactionObjectArgument;
  misoPackageId: string;
}

/**
 * PRIMITIVE. Appends `recording::new` and returns its by-value results without
 * publishing/dispersing/transferring. Because it borrows the composition by
 * reference, it can run against a composition that is still an unshared PTB-local
 * value — the borrow-before-share pattern that lets a composition + recording share
 * one PTB.
 */
export function createRecording(tx: Transaction, params: CreateRecordingParams): RecordingParts {
  const result = tx.add(
    recording._new({
      package: params.misoPackageId,
      typeArguments: [params.shareType, params.compositionShareType],
      arguments: [params.composition, tx.object(params.shareCurrencyId), tx.object(params.shareTreasuryCapId)],
    }),
  );
  return { recording: result[0]!, adminCap: result[1]!, balance: result[2]! };
}

// ============================================================================
// Track
// ============================================================================

export interface CreateTrackParams {
  /** Shared recording object ID, unless `recording` is PTB-local. */
  recordingId?: string;
  /** A recording returned by `createRecording` earlier in this same PTB. */
  recording?: TransactionObjectArgument;
  recordingAdminCapId?: string;
  recordingAdminCap?: TransactionObjectArgument;
  /** Share type of the recording (the track's `RecordingShare` phantom). */
  recordingShareType: string;
  /** Share type of the parent composition (the track's `CompositionShare` phantom). */
  compositionShareType: string;
  targetReleaseId: string;
  trackSplitBps: number;
  misoPackageId: string;
}

/**
 * PRIMITIVE. Appends `track::new` and returns its by-value `Track`. A track has
 * `drop, store`, so callers may leave it unused; to assemble a release, pass
 * returned tracks to `tx.makeMoveVec({ type: `${misoPackageId}::track::Track`,
 * elements })` and then pass that vector to `createRelease` with its shared
 * `ReleaseRegistry` object.
 *
 * The `recordingAdminCap` may be passed as an on-chain object id
 * (`recordingAdminCapId`) or as a PTB-local argument (`recordingAdminCap`) —
 * the latter lets a track be created against a recording created earlier in the
 * same transaction, before its cap has been transferred anywhere.
 */
export function createTrack(tx: Transaction, params: CreateTrackParams): TransactionObjectArgument {
  if (!params.recordingAdminCap && !params.recordingAdminCapId) {
    throw new Error("createTrack: recordingAdminCapId or recordingAdminCap required");
  }
  if (!params.recording && !params.recordingId) {
    throw new Error("createTrack: recordingId or recording required");
  }
  const adminCapArg = params.recordingAdminCap ?? tx.object(params.recordingAdminCapId!);
  const recordingArg = params.recording ?? tx.object(params.recordingId!);
  return tx.add(
    track._new({
      package: params.misoPackageId,
      typeArguments: [params.recordingShareType, params.compositionShareType],
      arguments: [
        adminCapArg,
        recordingArg,
        tx.pure.id(params.targetReleaseId),
        tx.pure.u16(params.trackSplitBps),
      ],
    }),
  );
}

// ============================================================================
// Publish finalizers
// ============================================================================

/** Consume and share an initialized composition. The generated call supplies Clock. */
export function publishComposition(
  tx: Transaction,
  params: {
    composition: TransactionObjectArgument;
    adminCap: TransactionObjectArgument;
    shareType: string;
    misoPackageId: string;
  },
): void {
  tx.add(
    composition.publish({
      package: params.misoPackageId,
      typeArguments: [params.shareType],
      arguments: [params.composition, params.adminCap],
    }),
  );
}

/** Consume and share an initialized recording. The generated call supplies Clock. */
export function publishRecording(
  tx: Transaction,
  params: {
    recording: TransactionObjectArgument;
    adminCap: TransactionObjectArgument;
    recordingShareType: string;
    compositionShareType: string;
    misoPackageId: string;
  },
): void {
  tx.add(
    recording.publish({
      package: params.misoPackageId,
      typeArguments: [params.recordingShareType, params.compositionShareType],
      arguments: [params.recording, params.adminCap],
    }),
  );
}

/** Consume and share an initialized release. The generated call supplies Clock. */
export function publishRelease(
  tx: Transaction,
  params: {
    release: TransactionObjectArgument;
    adminCap: TransactionObjectArgument;
    misoPackageId: string;
  },
): void {
  tx.add(
    release.publish({
      package: params.misoPackageId,
      arguments: [params.release, params.adminCap],
    }),
  );
}

// ============================================================================
// Core release registry
// ============================================================================

/** The by-value result of core `release::new`. Publish it in this PTB. */
export interface ReleaseParts {
  release: TransactionObjectArgument;
  adminCap: TransactionObjectArgument;
}

export interface CreateReleaseParams {
  /** Shared, canonical `miso::release::ReleaseRegistry` object ID. */
  releaseRegistryId: string;
  title: string;
  /** `Track` values returned by {@link createTrack}; all are consumed. */
  tracks: readonly TransactionObjectArgument[];
  nonce: UnsignedInput;
  /** Freshly published core `miso` package ID. */
  misoPackageId: string;
}

/**
 * Assemble a release through core `miso::release::new`. The registry is the
 * first object argument; there is no arbitrary-parent or utility-package path.
 * Both returned values are non-drop and must be published or otherwise consumed
 * in this PTB.
 */
export function createRelease(
  tx: Transaction,
  params: CreateReleaseParams,
): ReleaseParts {
  const tracks = tx.makeMoveVec({
    type: `${params.misoPackageId}::track::Track`,
    elements: [...params.tracks],
  });
  const result = tx.add(
    release._new({
      package: params.misoPackageId,
      arguments: [
        tx.object(params.releaseRegistryId),
        tx.pure.string(params.title),
        tracks,
        tx.pure.u256(asU256("release nonce", params.nonce)),
      ],
    }),
  );
  return { release: result[0]!, adminCap: result[1]! };
}
