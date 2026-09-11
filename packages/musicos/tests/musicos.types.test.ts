// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Type-level pins: every `MusicosService` member's error union and `R = never`,
// checked with `satisfies` so a change to either fails this file to compile.
// (This repository's `tsc --noEmit` covers `src/` only — see the package
// README's testing note — so this file is verified whenever the whole
// workspace, or this file directly, is typechecked with `tsc`.)

import { test } from "bun:test";
import type { Effect, Result } from "effect";
import type {
  BatchItemError,
  BuildError,
  DecodeError,
  ObjectDeleted,
  ObjectId,
  ObjectNotFound,
  ObjectUnavailable,
  SimulationFailed,
  SuiAddress,
  TransportError,
} from "sui-effect";
import type { MusicosTreasuryCapNotFound } from "../src/errors.ts";
import type { MusicosService } from "../src/Musicos.ts";
import type { Composition, CompositionAdminCap, Recording, RecordingAdminCap, Release, ReleaseAdminCap, ReleaseRegistry } from "../src/types.ts";

test("MusicosService member signatures compile (a type-only file)", () => {});

type ReadError = ObjectNotFound | ObjectDeleted | ObjectUnavailable | DecodeError | TransportError;
type OwnedReadError = DecodeError | TransportError;

// A single `satisfies` against the full interface: every member, its error
// union, and `R = never` all in one place, so a widened union or a leaked
// requirement fails to compile. `satisfies` is an expression operator, so
// this pins a (never-called) function's typed local rather than a bare
// `declare const` — bun's test runner strips types but still evaluates the
// statement, and a `declare`d binding has no runtime value to reference.
function pin() {
  const service = null as unknown as MusicosService;
  service satisfies {
  readonly packageId: ObjectId;
  readonly getCompositionById: (id: ObjectId) => Effect.Effect<Composition, ReadError, never>;
  readonly getCompositionsByIds: (
    ids: ReadonlyArray<ObjectId>,
  ) => Effect.Effect<ReadonlyArray<Result.Result<Composition, BatchItemError>>, TransportError, never>;
  readonly getCompositionShareType: (id: ObjectId) => Effect.Effect<string, ReadError, never>;
  readonly getCompositionAdminCapById: (id: ObjectId) => Effect.Effect<CompositionAdminCap, ReadError, never>;
  readonly getOwnedCompositionAdminCaps: (owner: SuiAddress) => Effect.Effect<ReadonlyArray<CompositionAdminCap>, OwnedReadError, never>;

  readonly getRecordingById: (id: ObjectId) => Effect.Effect<Recording, ReadError, never>;
  readonly getRecordingsByIds: (
    ids: ReadonlyArray<ObjectId>,
  ) => Effect.Effect<ReadonlyArray<Result.Result<Recording, BatchItemError>>, TransportError, never>;
  readonly getRecordingShareType: (id: ObjectId) => Effect.Effect<string, ReadError, never>;
  readonly getRecordingShareTypes: (id: ObjectId) => Effect.Effect<readonly [string, string], ReadError, never>;
  readonly getRecordingAdminCapById: (id: ObjectId) => Effect.Effect<RecordingAdminCap, ReadError, never>;
  readonly getOwnedRecordingAdminCaps: (owner: SuiAddress) => Effect.Effect<ReadonlyArray<RecordingAdminCap>, OwnedReadError, never>;

  readonly getReleaseById: (id: ObjectId) => Effect.Effect<Release, ReadError, never>;
  readonly getReleasesByIds: (
    ids: ReadonlyArray<ObjectId>,
  ) => Effect.Effect<ReadonlyArray<Result.Result<Release, BatchItemError>>, TransportError, never>;
  readonly getReleaseRegistryById: (id: ObjectId) => Effect.Effect<ReleaseRegistry, ReadError, never>;
  readonly getReleaseAdminCapById: (id: ObjectId) => Effect.Effect<ReleaseAdminCap, ReadError, never>;
  readonly getOwnedReleaseAdminCaps: (owner: SuiAddress) => Effect.Effect<ReadonlyArray<ReleaseAdminCap>, OwnedReadError, never>;

  readonly getShareCurrencyType: (currencyId: ObjectId) => Effect.Effect<string, ReadError, never>;
  readonly getShareCurrencyTreasuryCap: (
    shareType: string,
    owner: SuiAddress,
  ) => Effect.Effect<ObjectId, MusicosTreasuryCapNotFound | TransportError, never>;

  readonly view: {
    readonly deriveTargetReleaseId: (params: {
      readonly sender: SuiAddress;
      readonly recordingIds: ReadonlyArray<ObjectId>;
      readonly splitBps: ReadonlyArray<number | bigint | string>;
      readonly nonce: number | bigint | string;
      readonly releaseRegistryId: ObjectId;
    }) => Effect.Effect<ObjectId, SimulationFailed | BuildError | DecodeError | TransportError, never>;
  };
  };
  void service;
}
