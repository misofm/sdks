// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Composed catalog reads.
//
// `@misofm/musicos` exposes one-question reads: fetch an object by id, list the
// caps an address owns, resolve a share type to its work. Stitching several of
// those together to answer a PRODUCT question — "show me everything this artist
// administers" — is orchestration, and it lives here for the same reason the
// opinionated publish flows do: it picks a traversal strategy, decides how much
// to fetch, and chooses a concurrency/rate-limit tradeoff. Those are platform
// calls, not protocol facts.

import { Effect, Result } from "effect";
import {
  extractTypeParams2,
  getWorkAddressesByShareTypes,
  Musicos,
  type MusicosDeploymentInvalid,
  type MusicosService,
  type OwnedReadError,
  type ReadError,
  type Recording,
} from "@misofm/musicos";
import { ObjectId, Sui, SuiAddress, SuiGraphQL, type BatchItemError, type GraphQLUnavailable, type TransportError } from "sui-effect";
import {
  getCompositionCreditsByIds,
  getRecordingCreditsByIds,
  type CreditView,
  type RecordingCreditsView,
} from "./credits.ts";

export interface GetReleaseTrackCreditsOptions {
  /** Core Miso package that defines Composition and Recording. */
  misoPackageId: string;
  /** Package that defines the composition_credits extension key. */
  compositionCreditsPackageId: string;
  /** Package that defines the recording_credits extension key. */
  recordingCreditsPackageId: string;
}

export interface ReleaseTrackCredits {
  compositionCredits: CreditView[];
  recordingCredits: RecordingCreditsView;
}

const EMPTY_RECORDING_CREDITS: RecordingCreditsView = {
  credits: [],
  primaryArtistIds: [],
  featuredArtistIds: [],
};

/**
 * Builds `Musicos.layer({ deployment: { packageId } })`, provides it, and
 * hands back the effect it wraps — sui-effect's "converting an existing
 * facade" idiom (`docs/extensions.md`) applied at function granularity, so a
 * standalone catalog read composes the sibling `@misofm/musicos` extension
 * internally and its own requirement channel stays `Sui`, never
 * `Sui | Musicos`. This is what a non-facade consumer (the crank service,
 * this module itself) uses in place of a bound `Miso.protocol`.
 */
function withMusicos<A, E>(
  packageId: string,
  effect: (musicos: MusicosService) => Effect.Effect<A, E, Sui>,
): Effect.Effect<A, E | MusicosDeploymentInvalid, Sui> {
  return Effect.gen(function* () {
    const musicos = yield* Musicos;
    return yield* effect(musicos);
  }).pipe(Effect.provide(Musicos.layer({ deployment: { packageId } })));
}

/**
 * Composition and recording credits for every track on a release, keyed by
 * recording id.
 *
 * The read follows the chain's actual object graph instead of release credits:
 * Release -> Recording -> Composition. Recording credit fields and recording
 * type parameters are fetched together for every track. Composition addresses
 * are then resolved concurrently, deduplicated, and all composition credit
 * fields are fetched concurrently as well.
 */
export const getReleaseTrackCredits = Effect.fn("getReleaseTrackCredits")(function* (
  releaseId: string,
  options: GetReleaseTrackCreditsOptions,
): Effect.fn.Return<
  Record<string, ReleaseTrackCredits>,
  ReadError | MusicosDeploymentInvalid | GraphQLUnavailable | TransportError,
  Sui | SuiGraphQL
> {
  const release = yield* withMusicos(options.misoPackageId, (musicos) => musicos.getReleaseById(ObjectId.make(releaseId)));
  return yield* getTrackCreditsByRecordingIds(
    release.tracks.map((track) => track.recordingId),
    options,
  );
});

/**
 * Composition and recording credits for the supplied recordings, keyed by
 * recording id. This form is intended for consumers that already loaded a
 * release and do not need to fetch it again.
 */
export const getTrackCreditsByRecordingIds = Effect.fn("getTrackCreditsByRecordingIds")(function* (
  recordingIdsInput: readonly string[],
  options: GetReleaseTrackCreditsOptions,
): Effect.fn.Return<
  Record<string, ReleaseTrackCredits>,
  BatchItemError | GraphQLUnavailable | TransportError,
  Sui | SuiGraphQL
> {
  const recordingIds = [...new Set(recordingIdsInput)];
  if (recordingIds.length === 0) return {};

  const sui = yield* Sui;
  const [recordingCreditsById, recordingObjects] = yield* Effect.all([
    getRecordingCreditsByIds(recordingIds, options.recordingCreditsPackageId),
    // A hard read: every id must resolve, same as the predecessor's
    // `object instanceof Error) throw object` — a typed BatchItemError now,
    // not a defect (sui-effect's `getObjectsOrFail`).
    sui.getObjectsOrFail(recordingIds.map((id) => ObjectId.make(id))),
  ]);
  const recordingReads = recordingObjects.map((object) => {
    const [, compositionShareType] = extractTypeParams2(object.type);
    return {
      recordingId: object.id,
      recordingCredits: recordingCreditsById[object.id] ?? null,
      compositionShareType,
    };
  });

  const compositionShareTypes = [...new Set(recordingReads.map((read) => read.compositionShareType))];
  const addresses = yield* getWorkAddressesByShareTypes(
    { compositions: compositionShareTypes, recordings: [] },
    options.misoPackageId,
  );
  for (const shareType of compositionShareTypes) {
    if (!addresses.compositions[shareType]) {
      throw new Error(`Composition not found for share type: ${shareType}`);
    }
  }
  const compositionIds = [
    ...new Set(Object.values(addresses.compositions).filter((id): id is string => id !== undefined)),
  ];
  const compositionCreditsById = yield* getCompositionCreditsByIds(
    compositionIds,
    options.compositionCreditsPackageId,
  );

  return Object.fromEntries(
    recordingReads.map((read) => {
      const compositionId = addresses.compositions[read.compositionShareType]!;
      return [
        read.recordingId,
        {
          compositionCredits: compositionCreditsById[compositionId] ?? [],
          recordingCredits: read.recordingCredits ?? EMPTY_RECORDING_CREDITS,
        },
      ];
    }),
  );
});

export interface GetAdministeredRecordingsOptions {
  /**
   * @deprecated Resolution is batched; this option is retained for source
   * compatibility and no longer affects request concurrency.
   */
  concurrency?: number;
}

/**
 * Every `Recording` administered by `owner`.
 *
 * Three bounded stages: list the owner's `RecordingAdminCap`s, resolve every
 * share type in one aliased GraphQL query, then batch-fetch the recordings.
 * A recording id that fails to resolve is dropped rather than failing the
 * whole read (the predecessor's behaviour, now via `sui.getObjects`' per-item
 * `Result` instead of a silently-dropping map).
 */
export const getAdministeredRecordings = Effect.fn("getAdministeredRecordings")(function* (
  owner: string,
  misoPackageId: string,
  options: GetAdministeredRecordingsOptions = {},
): Effect.fn.Return<
  Recording[],
  MusicosDeploymentInvalid | OwnedReadError | GraphQLUnavailable | TransportError,
  Sui | SuiGraphQL
> {
  void options;
  const caps = yield* withMusicos(misoPackageId, (musicos) => musicos.getOwnedRecordingAdminCaps(SuiAddress.make(owner)));
  if (caps.length === 0) return [];
  const addresses = yield* getWorkAddressesByShareTypes(
    { compositions: [], recordings: caps.map((cap) => cap.shareType) },
    misoPackageId,
  );
  const ids = Object.values(addresses.recordings).filter((id): id is string => id !== undefined);
  const results = yield* withMusicos(misoPackageId, (musicos) => musicos.getRecordingsByIds(ids.map((id) => ObjectId.make(id))));
  const byId = new Map(
    results.flatMap((result, index) => (Result.isSuccess(result) ? [[ids[index]!, result.success] as const] : [])),
  );
  return caps.flatMap((cap) => {
    const id = addresses.recordings[cap.shareType];
    const recording = id ? byId.get(id) : undefined;
    return recording ? [recording] : [];
  });
});
