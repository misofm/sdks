// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { toPromise, tryPromise, workflow, type SdkError } from "@misofm/utils/effect";
import { Effect } from "effect";

// Composed catalog reads.
//
// `@misofm/protocol` exposes one-question reads: fetch an object by id, list the
// caps an address owns, resolve a share type to its work. Stitching several of
// those together to answer a PRODUCT question — "show me everything this artist
// administers" — is orchestration, and it lives here for the same reason the
// opinionated publish flows do: it picks a traversal strategy, decides how much
// to fetch, and chooses a concurrency/rate-limit tradeoff. Those are platform
// calls, not protocol facts.

import {
  extractTypeParams2,
  getOwnedRecordingAdminCapsEffect,
  getRecordingsByIdsEffect,
  getReleaseByIdEffect,
  type Recording,
} from "@misofm/protocol";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import {
  getCompositionCreditsByIdsEffect,
  getRecordingCreditsByIdsEffect,
  type CreditView,
  type RecordingCreditsView,
} from "./credits.ts";
import { getWorkAddressesByShareTypesEffect } from "./read/works.ts";

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
export function getReleaseTrackCreditsEffect(
  client: ClientWithCoreApi,
  graphqlClient: SuiGraphQLClient,
  releaseId: string,
  options: GetReleaseTrackCreditsOptions,
): Effect.Effect<Record<string, ReleaseTrackCredits>, SdkError> {
  return workflow("getReleaseTrackCredits", function* () {
    const release = yield* getReleaseByIdEffect(client, releaseId);
    return yield* getTrackCreditsByRecordingIdsEffect(
      client,
      graphqlClient,
      release.tracks.map((track) => track.recordingId),
      options,
    );
  });
}

export const getReleaseTrackCredits = toPromise(getReleaseTrackCreditsEffect);

/**
 * Composition and recording credits for the supplied recordings, keyed by
 * recording id. This form is intended for consumers that already loaded a
 * release and do not need to fetch it again.
 */
export function getTrackCreditsByRecordingIdsEffect(
  client: ClientWithCoreApi,
  graphqlClient: SuiGraphQLClient,
  recordingIdsInput: readonly string[],
  options: GetReleaseTrackCreditsOptions,
): Effect.Effect<Record<string, ReleaseTrackCredits>, SdkError> {
  return workflow("getTrackCreditsByRecordingIds", function* () {
    const recordingIds = [...new Set(recordingIdsInput)];
    if (recordingIds.length === 0) return {};

    const [recordingCreditsById, recordingObjects] = yield* Effect.all(
      [
        getRecordingCreditsByIdsEffect(client, recordingIds, options.recordingCreditsPackageId),
        tryPromise("getTrackCreditsByRecordingIds", (signal) =>
          client.core.getObjects({ signal, objectIds: recordingIds }),
        ),
      ],
      { concurrency: 8 },
    );
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
    const addresses = yield* getWorkAddressesByShareTypesEffect(
      graphqlClient,
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
    const compositionCreditsById = yield* getCompositionCreditsByIdsEffect(
      client,
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
}

export const getTrackCreditsByRecordingIds = toPromise(getTrackCreditsByRecordingIdsEffect);

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
export function getAdministeredRecordingsEffect(
  client: ClientWithCoreApi,
  graphqlClient: SuiGraphQLClient,
  owner: string,
  misoPackageId: string,
  options: GetAdministeredRecordingsOptions = {},
): Effect.Effect<Recording[], SdkError> {
  return workflow("getAdministeredRecordings", function* () {
    void options;
    const caps = yield* getOwnedRecordingAdminCapsEffect(client, owner, misoPackageId);
    if (caps.length === 0) return [];
    const addresses = yield* getWorkAddressesByShareTypesEffect(
      graphqlClient,
      { compositions: [], recordings: caps.map((cap) => cap.shareType) },
      misoPackageId,
    );
    const byId = yield* getRecordingsByIdsEffect(
      client,
      Object.values(addresses.recordings).filter((id): id is string => id !== undefined),
    );
    return caps.flatMap((cap) => {
      const id = addresses.recordings[cap.shareType];
      const recording = id ? byId[id] : undefined;
      return recording ? [recording] : [];
    });
  });
}

export const getAdministeredRecordings = toPromise(getAdministeredRecordingsEffect);
