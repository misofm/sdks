// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Effect, Result } from "effect";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import {
  contracts,
  extractTypeParams2,
  getWorkAddressesByShareTypes,
  Musicos,
  Composition,
  Recording,
  Release,
  type MusicosDeploymentInvalid,
  type MusicosService,
  type TrackState,
  type WorkAddressesByShareType,
  type WorkShareTypes,
} from "@misofm/musicos";
import { ObjectId, Sui, SuiGraphQL, SuiSchema, type DecodeError, type GraphQLUnavailable, type TransportError } from "sui-effect";

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
export function parseReleaseObject(id: string, content: Uint8Array): Effect.Effect<Release, DecodeError> {
  return SuiSchema.decode(SuiSchema.bcs(contracts.release.Release), content, { objectId: ObjectId.make(id) }).pipe(
    Effect.map((raw) => mapReleaseObject(id, raw as Parsed)),
  );
}

/**
 * Builds `Musicos.layer({ deployment: { packageId } })`, provides it, and
 * hands back the effect it wraps — see `catalog.ts`'s `withMusicos` for the
 * same idiom (kept file-local rather than shared, since each of these
 * standalone functions is a transitional non-facade consumer in its own
 * right; see `docs/CONVERSION-STATUS.md`).
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

/** Fetch and parse heterogeneous works through one chunked `sui.getObjects`. */
export const getWorksByIds = Effect.fn("getWorksByIds")(function* (
  ids: WorkIds,
): Effect.fn.Return<WorksById, DecodeError | TransportError, Sui> {
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

  const sui = yield* Sui;
  const requestedIds = [...kinds.keys()];
  const objects = yield* sui.getObjects(requestedIds.map((id) => ObjectId.make(id)));
  for (const [index, result] of objects.entries()) {
    if (!Result.isSuccess(result)) continue;
    const object = result.success;
    const kind = kinds.get(requestedIds[index]!);
    const objectId = object.id;
    const content = object.content;
    if (kind === "compositions") {
      const raw = yield* SuiSchema.decode(SuiSchema.bcs(contracts.composition.Composition), content, { objectId });
      out.compositions[objectId] = mapComposition(objectId, raw as Parsed) as unknown as Composition;
    } else if (kind === "recordings") {
      const raw = yield* SuiSchema.decode(SuiSchema.bcs(contracts.recording.Recording), content, { objectId });
      out.recordings[objectId] = mapRecording(objectId, raw as Parsed) as unknown as Recording;
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
): Effect.fn.Return<Record<string, string>, MusicosDeploymentInvalid | GraphQLUnavailable | TransportError, Sui | SuiGraphQL> {
  const ids = [...new Set(recordingIds)];
  if (ids.length === 0) return {};

  const sui = yield* Sui;
  const objects = yield* sui.getObjects(ids.map((id) => ObjectId.make(id)));
  const titles: Record<string, string> = {};
  const compositionShareByRecording: Record<string, string> = {};

  for (const result of objects) {
    if (!Result.isSuccess(result)) continue;
    const object = result.success;
    const [, compositionShareType] = extractTypeParams2(object.type);
    compositionShareByRecording[object.id] = compositionShareType;
  }

  const compositionShareTypes = Object.values(compositionShareByRecording);
  if (compositionShareTypes.length === 0) return titles;
  const addresses = yield* getWorkAddressesByShareTypes(
    { compositions: compositionShareTypes, recordings: [] },
    misoPackageId,
  );
  const compositionIds = Object.values(addresses.compositions).filter((id): id is string => !!id);
  const results = yield* withMusicos(misoPackageId, (musicos) => musicos.getCompositionsByIds(compositionIds.map((id) => ObjectId.make(id))));
  const compositionsById = new Map(
    results.flatMap((result, index) => (Result.isSuccess(result) ? [[compositionIds[index]!, result.success] as const] : [])),
  );
  for (const [recordingId, shareType] of Object.entries(compositionShareByRecording)) {
    const compositionId = addresses.compositions[shareType];
    const title = compositionId ? compositionsById.get(compositionId)?.title : undefined;
    if (title) titles[recordingId] = title;
  }
  return titles;
});
