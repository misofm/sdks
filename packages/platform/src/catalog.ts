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

import { Effect } from "effect";
import {
  extractTypeParams2,
  getOwnedRecordingAdminCaps,
  getRecordingsByIds,
  getReleaseById,
  getWorkAddressesByShareTypes,
  type Recording,
} from "@misofm/musicos";
import { SuiClient, SuiGraphQL, SuiRpcError, type BcsDecodeError, type ObjectNotFoundError } from "@misofm/effect";
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
  ObjectNotFoundError | SuiRpcError | BcsDecodeError,
  SuiClient | SuiGraphQL
> {
  const release = yield* getReleaseById(releaseId);
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
): Effect.fn.Return<Record<string, ReleaseTrackCredits>, SuiRpcError | BcsDecodeError, SuiClient | SuiGraphQL> {
  const recordingIds = [...new Set(recordingIdsInput)];
  if (recordingIds.length === 0) return {};

  const client = yield* SuiClient;
  const [recordingCreditsById, recordingObjects] = yield* Effect.all([
    getRecordingCreditsByIds(recordingIds, options.recordingCreditsPackageId),
    Effect.tryPromise({
      try: (signal) => client.core.getObjects({ objectIds: recordingIds, signal }),
      catch: (cause) => new SuiRpcError({ operation: "getObjects", cause }),
    }),
  ]);
  const recordingReads = recordingObjects.objects.map((object, index) => {
    const recordingId = recordingIds[index]!;
    if (object instanceof Error) throw object;
    const [, compositionShareType] = extractTypeParams2(object.type);
    return {
      recordingId,
      recordingCredits: recordingCreditsById[recordingId] ?? null,
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
 */
export const getAdministeredRecordings = Effect.fn("getAdministeredRecordings")(function* (
  owner: string,
  misoPackageId: string,
  options: GetAdministeredRecordingsOptions = {},
): Effect.fn.Return<Recording[], SuiRpcError | BcsDecodeError, SuiClient | SuiGraphQL> {
  void options;
  const caps = yield* getOwnedRecordingAdminCaps(owner, misoPackageId);
  if (caps.length === 0) return [];
  const addresses = yield* getWorkAddressesByShareTypes(
    { compositions: [], recordings: caps.map((cap) => cap.shareType) },
    misoPackageId,
  );
  const byId = yield* getRecordingsByIds(
    Object.values(addresses.recordings).filter((id): id is string => id !== undefined),
  );
  return caps.flatMap((cap) => {
    const id = addresses.recordings[cap.shareType];
    const recording = id ? byId[id] : undefined;
    return recording ? [recording] : [];
  });
});
