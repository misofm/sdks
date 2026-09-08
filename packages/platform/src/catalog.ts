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

import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import {
  extractTypeParams2,
  getOwnedRecordingAdminCaps,
  getRecordingsByIds,
  getReleaseById,
  type Recording,
} from "@misofm/musicos";
import { getWorkAddressesByShareTypes } from "./read/works.ts";
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
export async function getReleaseTrackCredits(
  client: ClientWithCoreApi,
  graphqlClient: SuiGraphQLClient,
  releaseId: string,
  options: GetReleaseTrackCreditsOptions,
): Promise<Record<string, ReleaseTrackCredits>> {
  const release = await getReleaseById(client, releaseId);
  return getTrackCreditsByRecordingIds(
    client,
    graphqlClient,
    release.tracks.map((track) => track.recordingId),
    options,
  );
}

/**
 * Composition and recording credits for the supplied recordings, keyed by
 * recording id. This form is intended for consumers that already loaded a
 * release and do not need to fetch it again.
 */
export async function getTrackCreditsByRecordingIds(
  client: ClientWithCoreApi,
  graphqlClient: SuiGraphQLClient,
  recordingIdsInput: readonly string[],
  options: GetReleaseTrackCreditsOptions,
): Promise<Record<string, ReleaseTrackCredits>> {
  const recordingIds = [...new Set(recordingIdsInput)];
  if (recordingIds.length === 0) return {};

  const [recordingCreditsById, recordingObjects] = await Promise.all([
    getRecordingCreditsByIds(
      client,
      recordingIds,
      options.recordingCreditsPackageId,
    ),
    client.core.getObjects({ objectIds: recordingIds }),
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

  const compositionShareTypes = [
    ...new Set(recordingReads.map((read) => read.compositionShareType)),
  ];
  const addresses = await getWorkAddressesByShareTypes(
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
    ...new Set(
      Object.values(addresses.compositions).filter(
        (id): id is string => id !== undefined,
      ),
    ),
  ];
  const compositionCreditsById = await getCompositionCreditsByIds(
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
}

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
export async function getAdministeredRecordings(
  client: ClientWithCoreApi,
  graphqlClient: SuiGraphQLClient,
  owner: string,
  misoPackageId: string,
  options: GetAdministeredRecordingsOptions = {},
): Promise<Recording[]> {
  void options;
  const caps = await getOwnedRecordingAdminCaps(client, owner, misoPackageId);
  if (caps.length === 0) return [];
  const addresses = await getWorkAddressesByShareTypes(
    graphqlClient,
    { compositions: [], recordings: caps.map((cap) => cap.shareType) },
    misoPackageId,
  );
  const byId = await getRecordingsByIds(
    client,
    Object.values(addresses.recordings).filter(
      (id): id is string => id !== undefined,
    ),
  );
  return caps.flatMap((cap) => {
    const id = addresses.recordings[cap.shareType];
    const recording = id ? byId[id] : undefined;
    return recording ? [recording] : [];
  });
}
