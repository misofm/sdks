// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import {
  contracts,
  extractTypeParams2,
  getCompositionsByIds,
  type Composition,
  type Recording,
  type Release,
  type TrackState,
} from "@misofm/musicos";

export interface WorkShareTypes {
  compositions: readonly string[];
  recordings: readonly string[];
}

export interface WorkAddressesByShareType {
  compositions: Partial<Record<string, string>>;
  recordings: Partial<Record<string, string>>;
}

interface WorkAddressConnection {
  nodes: Array<{
    address: string;
    asMoveObject?: {
      contents?: { type?: { repr?: string } | null } | null;
    } | null;
  }>;
  pageInfo?: { hasNextPage: boolean; endCursor: string | null };
}

/** Resolve all work share types in one aliased GraphQL request. */
export async function getWorkAddressesByShareTypes(
  client: SuiGraphQLClient,
  shareTypes: WorkShareTypes,
  misoPackageId: string,
): Promise<WorkAddressesByShareType> {
  const compositions = [...new Set(shareTypes.compositions)];
  const recordings = new Set(shareTypes.recordings);
  const out: WorkAddressesByShareType = { compositions: {}, recordings: {} };
  if (compositions.length === 0 && recordings.size === 0) return out;

  const declarations: string[] = [];
  const selections: string[] = [];
  const variables: Record<string, string> = {};
  compositions.forEach((shareType, index) => {
    const variable = `compositionType${index}`;
    declarations.push(`$${variable}: String!`);
    selections.push(
      `composition${index}: objects(first: 1, filter: { type: $${variable} }) { nodes { address } }`,
    );
    variables[variable] =
      `${misoPackageId}::composition::Composition<${shareType}>`;
  });
  if (recordings.size > 0) {
    declarations.push("$recordingType: String!");
    selections.push(`recordings: objects(first: 50, filter: { type: $recordingType }) {
      pageInfo { hasNextPage endCursor }
      nodes { address asMoveObject { contents { type { repr } } } }
    }`);
    variables.recordingType = `${misoPackageId}::recording::Recording`;
  }

  const result = await client.query<
    Record<string, WorkAddressConnection | null>,
    Record<string, string>
  >({
    query: `query WorkAddressesByShareTypes(${declarations.join(", ")}) {
      ${selections.join("\n")}
    }`,
    variables,
  });
  if (result.errors?.length) {
    throw new AggregateError(
      result.errors.map((error) => new Error(error.message)),
      "Work type discovery failed",
    );
  }
  compositions.forEach((shareType, index) => {
    const address = result.data?.[`composition${index}`]?.nodes[0]?.address;
    if (address) out.compositions[shareType] = address;
  });

  const readRecordingPage = (
    page: WorkAddressConnection | null | undefined,
  ) => {
    for (const node of page?.nodes ?? []) {
      const repr = node.asMoveObject?.contents?.type?.repr;
      if (!repr) continue;
      try {
        const [shareType] = extractTypeParams2(repr);
        if (recordings.has(shareType)) out.recordings[shareType] = node.address;
      } catch {
        // Ignore objects whose deployed type does not match the Recording ABI.
      }
    }
  };

  let page = result.data?.recordings;
  readRecordingPage(page);
  while (
    page?.pageInfo?.hasNextPage &&
    page.pageInfo.endCursor &&
    Object.keys(out.recordings).length < recordings.size
  ) {
    const next = await client.query<
      { recordings: WorkAddressConnection | null },
      { recordingType: string; cursor: string }
    >({
      query: `query RecordingWorkAddresses($recordingType: String!, $cursor: String!) {
        recordings: objects(first: 50, after: $cursor, filter: { type: $recordingType }) {
          pageInfo { hasNextPage endCursor }
          nodes { address asMoveObject { contents { type { repr } } } }
        }
      }`,
      variables: {
        recordingType: variables.recordingType!,
        cursor: page.pageInfo.endCursor,
      },
    });
    if (next.errors?.length) {
      throw new AggregateError(
        next.errors.map((error) => new Error(error.message)),
        "Recording type discovery failed",
      );
    }
    page = next.data?.recordings;
    readRecordingPage(page);
  }
  return out;
}

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

type Parsed = Record<string, any>;

function workState(value: Parsed): Composition["state"] {
  return value?.$kind === "Published"
    ? { type: "Published", timestampMs: Number(value.Published) }
    : { type: "Initialized" };
}

function parseComposition(id: string, content: Uint8Array): Composition {
  const value = contracts.composition.Composition.parse(content) as Parsed;
  return {
    id,
    state: workState(value.state),
    title: String(value.title),
    royaltyRate: {
      value: Number(
        Array.isArray(value.royalty_rate)
          ? value.royalty_rate[0]
          : value.royalty_rate,
      ),
    },
  };
}

function parseRecording(id: string, content: Uint8Array): Recording {
  const value = contracts.recording.Recording.parse(content) as Parsed;
  return {
    id,
    state: workState(value.state),
    compositionId: String(value.composition_id),
  };
}

export function parseReleaseObject(
  id: string,
  content: Uint8Array,
): Release {
  const value = contracts.release.Release.parse(content) as Parsed;
  return {
    id,
    state: workState(value.state),
    title: String(value.title),
    tracks: (value.tracks ?? []).map((track: Parsed) => ({
      state: (track.state?.$kind ?? "Unassigned") as TrackState,
      compositionId: String(track.composition_id),
      recordingId: String(track.recording_id),
      splitBps: {
        value: Number(
          Array.isArray(track.split_bps) ? track.split_bps[0] : track.split_bps,
        ),
      },
    })),
  };
}

/** Fetch and parse heterogeneous works through one Core bulk request. */
export async function getWorksByIds(
  client: ClientWithCoreApi,
  ids: WorkIds,
): Promise<WorksById> {
  const kinds = new Map<string, keyof WorksById>();
  for (const [kind, objectIds] of Object.entries(ids) as Array<
    [keyof WorksById, readonly string[]]
  >) {
    for (const objectId of objectIds) {
      const normalized = normalizeSuiAddress(objectId);
      const previous = kinds.get(normalized);
      if (previous && previous !== kind) {
        throw new Error(
          `Work ${normalized} was requested as both ${previous} and ${kind}`,
        );
      }
      kinds.set(normalized, kind);
    }
  }
  const out: WorksById = { compositions: {}, recordings: {}, releases: {} };
  if (kinds.size === 0) return out;
  const { objects } = await client.core.getObjects({
    objectIds: [...kinds.keys()],
    include: { content: true },
  });
  for (const object of objects) {
    if (object instanceof Error || !object.content) continue;
    const kind = kinds.get(normalizeSuiAddress(object.objectId));
    if (kind === "compositions")
      out.compositions[object.objectId] = parseComposition(
        object.objectId,
        object.content,
      );
    else if (kind === "recordings")
      out.recordings[object.objectId] = parseRecording(
        object.objectId,
        object.content,
      );
    else if (kind === "releases")
      out.releases[object.objectId] = parseReleaseObject(
        object.objectId,
        object.content,
      );
  }
  return out;
}

/** Resolve recording titles through each recording's canonical composition type. */
export async function getRecordingTitles(
  client: ClientWithCoreApi,
  graphql: SuiGraphQLClient,
  recordingIds: readonly string[],
  misoPackageId: string,
): Promise<Record<string, string>> {
  const ids = [...new Set(recordingIds)];
  if (ids.length === 0) return {};

  const { objects } = await client.core.getObjects({
    objectIds: ids,
    include: {},
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
  const addresses = await getWorkAddressesByShareTypes(
    graphql,
    { compositions: compositionShareTypes, recordings: [] },
    misoPackageId,
  );
  const compositions = await getCompositionsByIds(
    client,
    Object.values(addresses.compositions).filter((id): id is string => !!id),
  );
  for (const [recordingId, shareType] of Object.entries(
    compositionShareByRecording,
  )) {
    const compositionId = addresses.compositions[shareType];
    const title = compositionId
      ? compositions[compositionId]?.title
      : undefined;
    if (title) titles[recordingId] = title;
  }
  return titles;
}
