// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The Move layouts `Musicos` reads, bridged into `Schema`. `SuiSchema.bcs(layout,
// type)` is a `Schema.Codec<T, Uint8Array>` that also records the Move type, so
// `sui.getObject(id, { schema })` checks the object's type tag before it parses
// a single byte — a wrong object is a `DecodeError` naming both types rather
// than a confusing parse failure.
//
// Every codec here is a function of `packageId`, not a bare module-level
// constant: a Move type tag is per deployment, so `Musicos.layer` builds these
// once, inside its closure over the resolved package id.
//
// `Composition<T>`, its admin cap, `Recording<R, C>` and its admin cap are
// generic. Given the BARE tag — no type arguments — `sui.getObject`'s bridge
// matches every instantiation of the generic (see `docs/extensions.md`'s
// "Generic Move types"), so one codec per type reads every share-typed
// instance; there is no per-instantiation codec and no separate "generic"
// read path. The two admin caps carry their share type only as a phantom type
// parameter — nothing to decode from BCS content — so their codecs stop at the
// raw `{ id }` shape and `Musicos` reads the share type off the object's own
// `type` tag instead.
//
// Domain mapping (field renames, the lifecycle-state and BPS shapes) goes
// through `Schema.decodeTo` composed with `internal.ts`'s mappers, never a
// custom `parse`: the bridge needs a real `BcsType` to re-serialize what it
// parsed and reject trailing bytes (an `objectBcs` envelope decoding as the
// struct it wraps), and a domain type is not a BCS layout.

import { Schema, SchemaTransformation } from "effect";
import { SuiSchema } from "@unconfirmed/sui-effect";
import * as composition from "./contracts/musicos/composition.ts";
import * as recording from "./contracts/musicos/recording.ts";
import * as release from "./contracts/musicos/release.ts";
import { mapComposition, mapRecording, mapRelease } from "./internal.ts";
import {
  Composition,
  Recording,
  Release,
  ReleaseAdminCap,
  ReleaseRegistry,
} from "./types.ts";

// ============================================================================
// Encode helpers (the inverse of internal.ts's mappers)
// ============================================================================

type WorkStateParts = { readonly type: "Initialized" } | { readonly type: "Published"; readonly timestampMs: number };

const ZERO_ADDRESS = `0x${"0".repeat(64)}`;

/** `{ type: "Published", timestampMs }` -> the Move enum's serialize input. */
function encodePublishedState(state: Extract<WorkStateParts, { readonly type: "Published" }>) {
  return { $kind: "Published" as const, Published: String(state.timestampMs) };
}

/**
 * The raw Initialized variants retain creation-only data for the atomic
 * new→publish flow. The public object model intentionally exposes only the
 * lifecycle tag, so its inverse uses a zero placeholder payload; object reads
 * always decode the on-chain payload, while the SDK never writes a work object.
 */
function encodeCompositionState(state: WorkStateParts) {
  return state.type === "Published"
    ? encodePublishedState(state)
    : {
        $kind: "Initialized" as const,
        Initialized: {
          share_currency_id: ZERO_ADDRESS,
          consumed_treasury_cap_id: ZERO_ADDRESS,
          created_by: ZERO_ADDRESS,
          share_supply_before: "0",
          share_supply_after: "0",
          shares_returned: "0",
          share_decimals: 0,
          share_supply_fixed_after: false,
          created_admin_cap_id: ZERO_ADDRESS,
        },
      };
}

function encodeRecordingState(state: WorkStateParts) {
  return state.type === "Published"
    ? encodePublishedState(state)
    : {
        $kind: "Initialized" as const,
        Initialized: {
          share_currency_id: ZERO_ADDRESS,
          consumed_treasury_cap_id: ZERO_ADDRESS,
          created_by: ZERO_ADDRESS,
          composition_royalty_rate_bps: 0,
          share_supply_before: "0",
          shares_before_grant: "0",
          composition_shares_granted: "0",
          shares_returned: "0",
          share_decimals: 0,
          share_supply_fixed_after: false,
          composition_funds_sent: false,
          created_admin_cap_id: ZERO_ADDRESS,
        },
      };
}

function encodeReleaseState(state: WorkStateParts) {
  return state.type === "Published"
    ? encodePublishedState(state)
    : {
        $kind: "Initialized" as const,
        Initialized: {
          registry_id: ZERO_ADDRESS,
          release_digest: [],
          nonce: "0",
        },
      };
}

/** `{ value }` -> the Move tuple's serialize input, `[value]`. */
function encodeBps(bps: { readonly value: number }): [number] {
  return [bps.value];
}

/**
 * A track's `Unassigned` variant carries the target release address in Move,
 * but the domain `Track.state` (`"Unassigned" | "Assigned"`) does not retain
 * it — `internal.ts`'s `mapTrack` keeps only the `$kind`. Round-tripping a
 * decoded release back to bytes is not a supported path (`Musicos` never
 * writes a `Release`); this placeholder keeps the codec's `encode` total
 * rather than partial.
 */
function encodeTrack(track: {
  readonly state: "Unassigned" | "Assigned";
  readonly compositionId: string;
  readonly recordingId: string;
  readonly splitBps: { readonly value: number };
}) {
  return {
    state:
      track.state === "Assigned"
        ? { $kind: "Assigned" as const, Assigned: true }
        : { $kind: "Unassigned" as const, Unassigned: ZERO_ADDRESS },
    composition_id: track.compositionId,
    recording_id: track.recordingId,
    split_bps: encodeBps(track.splitBps),
  };
}

// ============================================================================
// Composition
// ============================================================================

/** `${packageId}::composition::Composition` — the bare tag matches every share type. */
export const compositionContent = (packageId: string) =>
  SuiSchema.bcs(composition.Composition, `${packageId}::composition::Composition`).pipe(
    Schema.decodeTo(
      Composition,
      SchemaTransformation.transform<ReturnType<typeof mapComposition>, typeof composition.Composition.$inferType>({
        decode: (fields) => mapComposition(fields.id, fields),
        encode: (parts) => ({
          id: parts.id,
          state: encodeCompositionState(parts.state),
          title: parts.title,
          royalty_rate: encodeBps(parts.royaltyRate),
        }),
      }),
    ),
  );

/**
 * `${packageId}::composition::CompositionAdminCap` — decodes only `{ id }`.
 * The share type is a phantom parameter with nothing in BCS content; read it
 * off the object's own instantiated `type` with {@link extractTypeParam}.
 */
export const compositionAdminCapContent = (packageId: string) =>
  SuiSchema.bcs(composition.CompositionAdminCap, `${packageId}::composition::CompositionAdminCap`);

// ============================================================================
// Recording
// ============================================================================

/** `${packageId}::recording::Recording` — the bare tag matches every share-type pair. */
export const recordingContent = (packageId: string) =>
  SuiSchema.bcs(recording.Recording, `${packageId}::recording::Recording`).pipe(
    Schema.decodeTo(
      Recording,
      SchemaTransformation.transform<ReturnType<typeof mapRecording>, typeof recording.Recording.$inferType>({
        decode: (fields) => mapRecording(fields.id, fields),
        encode: (parts) => ({
          id: parts.id,
          state: encodeRecordingState(parts.state),
          composition_id: parts.compositionId,
        }),
      }),
    ),
  );

/** `${packageId}::recording::RecordingAdminCap` — decodes only `{ id }`; see {@link compositionAdminCapContent}. */
export const recordingAdminCapContent = (packageId: string) =>
  SuiSchema.bcs(recording.RecordingAdminCap, `${packageId}::recording::RecordingAdminCap`);

// ============================================================================
// Release (not generic — no share type parameter)
// ============================================================================

export const releaseContent = (packageId: string) =>
  SuiSchema.bcs(release.Release, `${packageId}::release::Release`).pipe(
    Schema.decodeTo(
      Release,
      SchemaTransformation.transform<ReturnType<typeof mapRelease>, typeof release.Release.$inferType>({
        decode: (fields) => mapRelease(fields.id, fields),
        encode: (parts) => ({
          id: parts.id,
          state: encodeReleaseState(parts.state),
          title: parts.title,
          tracks: parts.tracks.map(encodeTrack),
        }),
      }),
    ),
  );

/** The BCS shape (`{ id }`) already matches `ReleaseRegistry`'s fields: a straight compose, no transform needed. */
export const releaseRegistryContent = (packageId: string) =>
  SuiSchema.bcs(release.ReleaseRegistry, `${packageId}::release::ReleaseRegistry`).pipe(Schema.decodeTo(ReleaseRegistry));

export const releaseAdminCapContent = (packageId: string) =>
  SuiSchema.bcs(release.ReleaseAdminCap, `${packageId}::release::ReleaseAdminCap`).pipe(
    Schema.decodeTo(
      ReleaseAdminCap,
      SchemaTransformation.transform<{ readonly id: string; readonly releaseId: string }, typeof release.ReleaseAdminCap.$inferType>({
        decode: (fields) => ({ id: fields.id, releaseId: fields.release_id }),
        encode: (parts) => ({ id: parts.id, release_id: parts.releaseId }),
      }),
    ),
  );

// ============================================================================
// Events
// ============================================================================
//
// Event codecs carry no Move type: the struct name a generated event codec's
// `.name` records is a `@local-pkg/…` source label, never resolved to a real
// address, so it cannot be compared against a real event's `eventType` the
// way an object's tag can be. `parsers.ts` decodes from raw bytes or a
// sui-effect `Event`'s `.bcs` either way; what still protects a decoder from
// the wrong event's bytes is the re-serialize length check every `BcsType`
// codec performs, independent of any type tag.

export const compositionPublishedEventContent = SuiSchema.bcs(composition.CompositionPublishedEvent);
export const recordingPublishedEventContent = SuiSchema.bcs(recording.RecordingPublishedEvent);
export const releasePublishedEventContent = SuiSchema.bcs(release.ReleasePublishedEvent);
export const releaseRegistryCreatedEventContent = SuiSchema.bcs(release.ReleaseRegistryCreatedEvent);
