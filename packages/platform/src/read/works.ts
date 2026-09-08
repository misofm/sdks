// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Effect } from "effect";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import {
  contracts,
  extractTypeParams2,
  getCompositionsByIds,
  getWorkAddressesByShareTypes,
  Composition,
  Recording,
  Release,
  type TrackState,
  type WorkAddressesByShareType,
  type WorkShareTypes,
} from "@misofm/musicos";
import { decodeBcs, SuiClient, SuiGraphQL, SuiRpcError, type BcsDecodeError } from "@misofm/effect";

// `getWorkAddressesByShareTypes` (GraphQL type discovery) is owned by
// `@misofm/musicos` now — re-exported here so existing platform imports keep
// working.
export { getWorkAddressesByShareTypes };
export type { WorkAddressesByShareType, WorkShareTypes };

export interface WorkIds {
  compositions: readonly string[];
  recordings: readonly string[];
  releases: readonly string[];
}

export interface WorksById {
  compositions: Partial<Record<string, Composition>>;
  recordings: Partial<Record<string, Recording>>;
  releases: Partial<Record<string, Release>>;
}

// deno-lint-ignore no-explicit-any -- generated parse output is loosely typed
type Parsed = Record<string, any>;

function workState(value: Parsed): (typeof Composition.Type)["state"] {
  return value?.$kind === "Published"
    ? { type: "Published", timestampMs: Number(value.Published) }
    : { type: "Initialized" };
}

function mapComposition(id: string, d: Parsed) {
  return {
    id,
    state: workState(d.state),
    title: String(d.title),
    royaltyRate: {
      value: Number(Array.isArray(d.royalty_rate) ? d.royalty_rate[0] : d.royalty_rate),
    },
  };
}

function mapRecording(id: string, d: Parsed) {
  return {
    id,
    state: workState(d.state),
    compositionId: String(d.composition_id),
  };
}

function mapReleaseObject(id: string, d: Parsed) {
  return {
    id,
    state: workState(d.state),
    title: String(d.title),
    tracks: (d.tracks ?? []).map((track: Parsed) => ({
      state: (track.state?.$kind ?? "Unassigned") as TrackState,
      compositionId: String(track.composition_id),
      recordingId: String(track.recording_id),
      splitBps: {
        value: Number(Array.isArray(track.split_bps) ? track.split_bps[0] : track.split_bps),
      },
    })),
  };
}

/** Decode a Release object's raw BCS content into the public `Release` type. */
export function parseReleaseObject(id: string, content: Uint8Array): Effect.Effect<Release, BcsDecodeError> {
  return decodeBcs(
    { parse: (bytes: Uint8Array) => mapReleaseObject(id, contracts.release.Release.parse(bytes) as Parsed) },
    Release,
    content,
    { type: "Release", objectId: id },
  );
}

/** Fetch and parse heterogeneous works through one Core bulk request. */
export const getWorksByIds = Effect.fn("getWorksByIds")(function* (
  ids: WorkIds,
): Effect.fn.Return<WorksById, SuiRpcError | BcsDecodeError, SuiClient> {
  const kinds = new Map<string, keyof WorksById>();
  for (const [kind, objectIds] of Object.entries(ids) as Array<[keyof WorksById, readonly string[]]>) {
    for (const objectId of objectIds) {
      const normalized = normalizeSuiAddress(objectId);
      const previous = kinds.get(normalized);
      if (previous && previous !== kind) {
        throw new Error(`Work ${normalized} was requested as both ${previous} and ${kind}`);
      }
      kinds.set(normalized, kind);
    }
  }
  const out: WorksById = { compositions: {}, recordings: {}, releases: {} };
  if (kinds.size === 0) return out;

  const client = yield* SuiClient;
  const { objects } = yield* Effect.tryPromise({
    try: (signal) => client.core.getObjects({ objectIds: [...kinds.keys()], include: { content: true }, signal }),
    catch: (cause) => new SuiRpcError({ operation: "getObjects", cause }),
  });
  for (const object of objects) {
    if (object instanceof Error || !object.content) continue;
    const kind = kinds.get(normalizeSuiAddress(object.objectId));
    const objectId = object.objectId;
    const content = object.content;
    if (kind === "compositions") {
      out.compositions[objectId] = yield* decodeBcs(
        { parse: (bytes: Uint8Array) => mapComposition(objectId, contracts.composition.Composition.parse(bytes) as Parsed) },
        Composition,
        content,
        { type: "Composition", objectId },
      );
    } else if (kind === "recordings") {
      out.recordings[objectId] = yield* decodeBcs(
        { parse: (bytes: Uint8Array) => mapRecording(objectId, contracts.recording.Recording.parse(bytes) as Parsed) },
        Recording,
        content,
        { type: "Recording", objectId },
      );
    } else if (kind === "releases") {
      out.releases[objectId] = yield* parseReleaseObject(objectId, content);
    }
  }
  return out;
});

/** Resolve recording titles through each recording's canonical composition type. */
export const getRecordingTitles = Effect.fn("getRecordingTitles")(function* (
  recordingIds: readonly string[],
  misoPackageId: string,
): Effect.fn.Return<Record<string, string>, SuiRpcError | BcsDecodeError, SuiClient | SuiGraphQL> {
  const ids = [...new Set(recordingIds)];
  if (ids.length === 0) return {};

  const client = yield* SuiClient;
  const { objects } = yield* Effect.tryPromise({
    try: (signal) => client.core.getObjects({ objectIds: ids, include: {}, signal }),
    catch: (cause) => new SuiRpcError({ operation: "getObjects", cause }),
  });
  const titles: Record<string, string> = {};
  const compositionShareByRecording: Record<string, string> = {};

  for (const object of objects) {
    if (object instanceof Error) continue;
    const [, compositionShareType] = extractTypeParams2(object.type);
    compositionShareByRecording[object.objectId] = compositionShareType;
  }

  const compositionShareTypes = Object.values(compositionShareByRecording);
  if (compositionShareTypes.length === 0) return titles;
  const addresses = yield* getWorkAddressesByShareTypes(
    { compositions: compositionShareTypes, recordings: [] },
    misoPackageId,
  );
  const compositions = yield* getCompositionsByIds(
    Object.values(addresses.compositions).filter((id): id is string => !!id),
  );
  for (const [recordingId, shareType] of Object.entries(compositionShareByRecording)) {
    const compositionId = addresses.compositions[shareType];
    const title = compositionId ? compositions[compositionId]?.title : undefined;
    if (title) titles[recordingId] = title;
  }
  return titles;
});
