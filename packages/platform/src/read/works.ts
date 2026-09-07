// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { toPromise, tryPromise, workflow, type SdkError } from "@misofm/utils/effect";
import { Effect } from "effect";

import { extractTypeParams2, getCompositionsByIdsEffect, getWorkAddressesByShareTypesEffect } from "@misofm/protocol";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
export {
  getWorkAddressesByShareTypes,
  getWorkAddressesByShareTypesEffect,
  getWorksByIds,
  getWorksByIdsEffect,
} from "@misofm/protocol";
export type { WorkAddressesByShareType, WorkIds, WorksById, WorkShareTypes } from "@misofm/protocol";
export { parseReleaseObject } from "@misofm/protocol/parsers";

/** Resolve recording titles through each recording's canonical composition type. */
export function getRecordingTitlesEffect(
  client: ClientWithCoreApi,
  graphql: SuiGraphQLClient,
  recordingIds: readonly string[],
  misoPackageId: string,
): Effect.Effect<Record<string, string>, SdkError> {
  return workflow("getRecordingTitles", function* () {
    const ids = [...new Set(recordingIds)];
    if (ids.length === 0) return {};

    const { objects } = yield* tryPromise("getRecordingTitles", (signal) =>
      client.core.getObjects({ signal, objectIds: ids, include: {} }),
    );
    const titles: Record<string, string> = {};
    const compositionShareByRecording: Record<string, string> = {};

    for (const object of objects) {
      if (object instanceof Error) continue;
      const [, compositionShareType] = extractTypeParams2(object.type);
      compositionShareByRecording[object.objectId] = compositionShareType;
    }

    const compositionShareTypes = Object.values(compositionShareByRecording);
    if (compositionShareTypes.length === 0) return titles;
    const addresses = yield* getWorkAddressesByShareTypesEffect(
      graphql,
      { compositions: compositionShareTypes, recordings: [] },
      misoPackageId,
    );
    const compositions = yield* getCompositionsByIdsEffect(
      client,
      Object.values(addresses.compositions).filter((id): id is string => !!id),
    );
    for (const [recordingId, shareType] of Object.entries(compositionShareByRecording)) {
      const compositionId = addresses.compositions[shareType];
      const title = compositionId ? compositions[compositionId]?.title : undefined;
      if (title) titles[recordingId] = title;
    }
    return titles;
  });
}

export const getRecordingTitles = toPromise(getRecordingTitlesEffect);
