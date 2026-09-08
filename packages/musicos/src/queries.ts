// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Object reads. Single-object fetches use the Core API with `include: content`
// and parse the BCS contents through the codegen-generated structs (so parsing
// tracks the on-chain ABI). Generic-type discovery (by share type / by owner)
// uses GraphQL to find object addresses, then reads them through the Core path.
//
// Missing-object convention (null vs throw):
//   - Core-object getters in this module (`getCompositionById`,
//     `get*AdminCapById`, …) THROW when the object is missing. Callers pass ids
//     they obtained from the chain, so a miss means a broken reference — an
//     exceptional state, not a normal one.
//   - Extension dynamic-field readers return `null` — extension data is optional
//     by design, and "not attached" is a normal, expected state. Use
//     `getExtensionField` with the generated BCS codec for the extension.
// All null-returning readers use {@link isNotFound} to distinguish a missing
// object from a transport failure (which still throws).

import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { graphql } from "@mysten/sui/graphql/schema";
import { deriveObjectID, normalizeSuiAddress } from "@mysten/sui/utils";

import { Composition as CompositionBcs } from "./contracts/musicos/composition.ts";
import { Recording as RecordingBcs } from "./contracts/musicos/recording.ts";
import {
  Release as ReleaseBcs,
  ReleaseRegistry as ReleaseRegistryBcs,
} from "./contracts/musicos/release.ts";
import {
  mapBps,
  mapComposition,
  mapRecording,
  mapRelease,
} from "./internal.ts";
import type {
  Composition,
  CompositionAdminCap,
  Recording,
  RecordingAdminCap,
  Release,
  ReleaseAdminCap,
} from "./types.ts";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extracts the type parameter `T` from `package::module::Type<T>`. For multi-
 * parameter types this returns everything between the outer angle brackets —
 * use {@link extractTypeParams2} to split two top-level parameters.
 */
export function extractTypeParam(objectType: string): string {
  const match = objectType.match(/<(.+)>$/);
  if (!match?.[1])
    throw new Error(`Could not extract type parameter from: ${objectType}`);
  return match[1];
}

/** Splits the two top-level type parameters of `pkg::mod::Type<A, B>`. */
export function extractTypeParams2(objectType: string): [string, string] {
  const inner = extractTypeParam(objectType);
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "<") depth++;
    else if (ch === ">") depth--;
    else if (ch === "," && depth === 0)
      return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
  }
  throw new Error(`Expected two type parameters in: ${objectType}`);
}

/**
 * True when `e` is a "this object does not exist" error from any of the Sui
 * client transports, so null-returning readers can distinguish absence from
 * transport failure. Matches, in order of preference:
 *
 *   1. Structured `ObjectError.code` values thrown by the JSON-RPC core client
 *      (`notExists`, `deleted`, `dynamicFieldNotFound`) and the GraphQL core
 *      client (`notFound`). The class itself is not exported by `@mysten/sui`,
 *      so we duck-type on `code`.
 *   2. The message shapes those clients (and the gRPC core client, which wraps
 *      the server's per-object status message in a plain `Error`) produce:
 *      "Object 0x… does not exist" / "Object 0x… not found" / "Object 0x… has
 *      been deleted" / "Dynamic field not found for object 0x…" / "No object
 *      found for id 0x…".
 *
 * Transport/protocol errors must NOT match: every message pattern requires
 * object-ish context ("object" / "dynamic field"), so e.g. a JSON-RPC
 * "Method not found" or a gRPC "peer not found" is never treated as a missing
 * object and propagates to the caller.
 */
export function isNotFound(e: unknown): boolean {
  if (typeof e === "object" && e !== null && "code" in e) {
    const code = (e as { code: unknown }).code;
    if (
      code === "notExists" ||
      code === "deleted" ||
      code === "dynamicFieldNotFound" ||
      code === "notFound"
    ) {
      return true;
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  return (
    /\bobject\b[\s\S]*\b(?:not\s?found|does not exist|has been deleted)\b/i.test(
      msg,
    ) ||
    /\bdynamic field\b[\s\S]*\bnot\s?found\b/i.test(msg) ||
    /\bno object\b/i.test(msg)
  );
}

/** Key bytes for Move unit structs (single `0x00` for `dummy_field: bool = false`). */
const UNIT_STRUCT_KEY_BYTES = new Uint8Array([0x00]);

/** Any generated BCS codec with a `parse` method. */
export interface BcsParser<T> {
  parse(bytes: Uint8Array): T;
}

/** Exhaust every Core owned-object page; cap discovery must not truncate. */
async function listAllOwnedObjects(
  client: ClientWithCoreApi,
  input: Record<string, unknown>,
): Promise<Array<{ objectId: string; type?: string; json?: unknown }>> {
  const objects: Array<{ objectId: string; type?: string; json?: unknown }> = [];
  let cursor: string | null | undefined;
  do {
    const page = await (client.core.listOwnedObjects as (args: unknown) => Promise<{
      objects: Array<{ objectId: string; type?: string; json?: unknown }>;
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      hasNextPage?: boolean;
      cursor?: string | null;
    }>)(cursor ? { ...input, cursor } : input);
    objects.push(...page.objects);
    cursor = page.pageInfo?.hasNextPage
      ? page.pageInfo.endCursor
      : page.hasNextPage
        ? page.cursor
        : null;
  } while (cursor);
  return objects;
}

/** Fetches one object's BCS content bytes (or null if absent). */
async function getContent(
  client: ClientWithCoreApi,
  objectId: string,
): Promise<Uint8Array | null> {
  const { object } = await client.core.getObject({
    objectId,
    include: { content: true },
  });
  return object.content ?? null;
}

/**
 * Fetch and parse an object through the transport-neutral Core API. Object
 * content is BCS; never pass the full `objectBcs` envelope to a Move codec.
 */
export async function getObjectByBcs<T>(
  client: ClientWithCoreApi,
  objectId: string,
  codec: BcsParser<T>,
): Promise<T> {
  const content = await getContent(client, objectId);
  if (!content) throw new Error(`Object not found: ${objectId}`);
  return codec.parse(content);
}

export interface ExtensionFieldParams<T> {
  /** Freshly published package address for the extension. */
  packageId: string;
  /** Move module declaring the fieldless `ExtensionKey`. */
  module: string;
  /** Generated codec for the dynamic-field value. */
  codec: BcsParser<T>;
}

/**
 * Read an optional first-party extension field from a core object's UID. Every
 * current extension uses a fieldless `ExtensionKey`, whose BCS is one false
 * boolean byte. Absence returns `null`; transport errors still propagate.
 */
export async function getExtensionField<T>(
  client: ClientWithCoreApi,
  parentId: string,
  params: ExtensionFieldParams<T>,
): Promise<T | null> {
  try {
    const { dynamicField } = await client.core.getDynamicField({
      parentId,
      name: {
        type: `${params.packageId}::${params.module}::ExtensionKey`,
        bcs: UNIT_STRUCT_KEY_BYTES,
      },
    });
    return params.codec.parse(dynamicField.value.bcs);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export interface ReleaseDspFieldParams<T> {
  /** Freshly published `release_dsp_link` package address. */
  packageId: string;
  /** Numeric DSP discriminator (`DspLinkData::platform()`). */
  platform: number;
  /** Generated codec for `DspLinkData` or `PerTrack<Option<DspLinkData>>`. */
  codec: BcsParser<T>;
}

async function getReleaseDspField<T>(
  client: ClientWithCoreApi,
  releaseId: string,
  key: "ReleaseLinkKey" | "TrackLinksKey",
  params: ReleaseDspFieldParams<T>,
): Promise<T | null> {
  if (!Number.isInteger(params.platform) || params.platform < 0 || params.platform > 255) {
    throw new Error("DSP platform must be a u8 discriminator");
  }
  try {
    const { dynamicField } = await client.core.getDynamicField({
      parentId: releaseId,
      name: {
        type: `${params.packageId}::release_dsp_link::${key}`,
        bcs: Uint8Array.of(params.platform),
      },
    });
    return params.codec.parse(dynamicField.value.bcs);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** Read a release-level DSP link stored under `ReleaseLinkKey(platform)`. */
export function getReleaseDspLink<T>(
  client: ClientWithCoreApi,
  releaseId: string,
  params: ReleaseDspFieldParams<T>,
): Promise<T | null> {
  return getReleaseDspField(client, releaseId, "ReleaseLinkKey", params);
}

/** Read the per-track DSP-link array stored under `TrackLinksKey(platform)`. */
export function getTrackDspLinks<T>(
  client: ClientWithCoreApi,
  releaseId: string,
  params: ReleaseDspFieldParams<T>,
): Promise<T | null> {
  return getReleaseDspField(client, releaseId, "TrackLinksKey", params);
}

// ============================================================================
// Core registry and generic primitive reads
// ============================================================================

/** Parse the shared canonical core `miso::release::ReleaseRegistry` by ID. */
export async function getReleaseRegistryById(
  client: ClientWithCoreApi,
  registryId: string,
) {
  return getObjectByBcs(client, registryId, ReleaseRegistryBcs);
}

// ============================================================================
// GraphQL discovery queries
// ============================================================================

/** Object addresses matching a fully-qualified type. */
const AddressesByTypeQuery = graphql(`
  query AddressesByType($type: String!) {
    objects(filter: { type: $type }) {
      nodes {
        address
      }
    }
  }
`);

/**
 * Object addresses AND their instantiated types, for a type filter.
 *
 * Needed where the filter cannot be fully qualified: a type filter must supply
 * either ALL of a type's parameters or none, so a two-parameter type that is
 * only known by its first parameter (`Recording<RecordingShare, ?>`) has to be
 * filtered by bare type name and disambiguated client-side on the returned
 * `repr`.
 */
const AddressesAndTypesByTypeQuery = graphql(`
  query AddressesAndTypesByType($type: String!) {
    objects(filter: { type: $type }) {
      nodes {
        address
        asMoveObject {
          contents {
            type {
              repr
            }
          }
        }
      }
    }
  }
`);

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

/**
 * Resolve many work share types in one GraphQL request.
 *
 * Compositions can be queried by their exact one-parameter type. Recordings
 * carry both RecordingShare and CompositionShare, while an admin cap only
 * exposes the first, so one bare Recording scan is shared by every requested
 * recording type and filtered client-side.
 */
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
        const [recordingShareType] = extractTypeParams2(repr);
        if (recordings.has(recordingShareType)) {
          out.recordings[recordingShareType] = node.address;
        }
      } catch {
        // Ignore a live object whose type does not match the deployed Recording ABI.
      }
    }
  };

  let recordingPage = result.data?.recordings;
  readRecordingPage(recordingPage);
  while (
    recordingPage?.pageInfo?.hasNextPage &&
    recordingPage.pageInfo.endCursor &&
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
        cursor: recordingPage.pageInfo.endCursor,
      },
    });
    if (next.errors?.length) {
      throw new AggregateError(
        next.errors.map((error) => new Error(error.message)),
        "Recording type discovery failed",
      );
    }
    recordingPage = next.data?.recordings;
    readRecordingPage(recordingPage);
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

/** Fetch and parse heterogeneous work objects through one Core bulk request. */
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
  for (const obj of objects) {
    if (obj instanceof Error || !obj.content) continue;
    const kind = kinds.get(normalizeSuiAddress(obj.objectId));
    if (kind === "compositions") {
      out.compositions[obj.objectId] = mapComposition(
        obj.objectId,
        CompositionBcs.parse(obj.content),
      );
    } else if (kind === "recordings") {
      out.recordings[obj.objectId] = mapRecording(
        obj.objectId,
        RecordingBcs.parse(obj.content),
      );
    } else if (kind === "releases") {
      out.releases[obj.objectId] = mapRelease(
        obj.objectId,
        ReleaseBcs.parse(obj.content),
      );
    }
  }
  return out;
}

// ============================================================================
// Composition
// ============================================================================

/** Fetches multiple compositions by ID in one Core request. */
export async function getCompositionsByIds(
  client: ClientWithCoreApi,
  compositionIds: string[],
): Promise<Record<string, Composition>> {
  if (compositionIds.length === 0) return {};
  const { objects } = await client.core.getObjects({
    objectIds: compositionIds,
    include: { content: true },
  });
  const out: Record<string, Composition> = {};
  for (const obj of objects) {
    if (obj instanceof Error || !obj.content) continue;
    out[obj.objectId] = mapComposition(
      obj.objectId,
      CompositionBcs.parse(obj.content),
    );
  }
  return out;
}

/** Fetches a composition by its object ID. */
export async function getCompositionById(
  client: ClientWithCoreApi,
  compositionId: string,
): Promise<Composition> {
  const content = await getContent(client, compositionId);
  if (!content) throw new Error(`Composition not found: ${compositionId}`);
  return mapComposition(compositionId, CompositionBcs.parse(content));
}

/** Extracts the share type `T` from a `Composition<T>` object. */
export async function getCompositionShareType(
  client: ClientWithCoreApi,
  compositionId: string,
): Promise<string> {
  const { object } = await client.core.getObject({ objectId: compositionId });
  return extractTypeParam(object.type);
}

/** Fetches a composition by its share type (GraphQL discovery + Core read). */
export async function getCompositionByShareType(
  client: ClientWithCoreApi,
  graphqlClient: SuiGraphQLClient,
  shareType: string,
  misoPackageId: string,
): Promise<Composition> {
  const address = await getCompositionAddressByShareType(
    graphqlClient,
    shareType,
    misoPackageId,
  );
  if (!address)
    throw new Error(`Composition not found for share type: ${shareType}`);
  return getCompositionById(client, address);
}

/**
 * Resolves a composition share type to its object address.
 *
 * This is the lightweight discovery primitive for callers that need the
 * composition's identity but will read extension fields rather than the core
 * Composition contents.
 */
export async function getCompositionAddressByShareType(
  graphqlClient: SuiGraphQLClient,
  shareType: string,
  misoPackageId: string,
): Promise<string | null> {
  const type = `${misoPackageId}::composition::Composition<${shareType}>`;
  return firstAddressOfType(graphqlClient, type);
}

export async function getCompositionAdminCapById(
  client: ClientWithCoreApi,
  adminCapId: string,
): Promise<CompositionAdminCap> {
  const { object } = await client.core.getObject({ objectId: adminCapId });
  return { id: adminCapId, shareType: extractTypeParam(object.type) };
}

/**
 * Composition admin caps owned by `owner`.
 *
 * Core API (no GraphQL): `listOwnedObjects` takes a type filter and returns each
 * object's instantiated `type`, so the share type is read straight off
 * `CompositionAdminCap<CompositionShare>` with no second round-trip.
 */
export async function getOwnedCompositionAdminCaps(
  client: ClientWithCoreApi,
  owner: string,
  misoPackageId: string,
): Promise<CompositionAdminCap[]> {
  const capType = `${misoPackageId}::composition::CompositionAdminCap`;
  const objects = await listAllOwnedObjects(client, { owner, type: capType });
  const caps: CompositionAdminCap[] = [];
  for (const obj of objects) {
    const match = obj.type?.match(/<(.+)>$/);
    if (match?.[1]) caps.push({ id: obj.objectId, shareType: match[1] });
  }
  return caps;
}

export function deriveCompositionAdminCapId(
  compositionId: string,
  misoPackageId: string,
): string {
  return deriveObjectID(
    compositionId,
    `${misoPackageId}::composition::CompositionAdminCapKey`,
    UNIT_STRUCT_KEY_BYTES,
  );
}

// ============================================================================
// Recording
// ============================================================================

export async function getRecordingsByIds(
  client: ClientWithCoreApi,
  recordingIds: string[],
): Promise<Record<string, Recording>> {
  if (recordingIds.length === 0) return {};
  const { objects } = await client.core.getObjects({
    objectIds: recordingIds,
    include: { content: true },
  });
  const out: Record<string, Recording> = {};
  for (const obj of objects) {
    if (obj instanceof Error || !obj.content) continue;
    out[obj.objectId] = mapRecording(
      obj.objectId,
      RecordingBcs.parse(obj.content),
    );
  }
  return out;
}

export async function getRecordingById(
  client: ClientWithCoreApi,
  recordingId: string,
): Promise<Recording> {
  const content = await getContent(client, recordingId);
  if (!content) throw new Error(`Recording not found: ${recordingId}`);
  return mapRecording(recordingId, RecordingBcs.parse(content));
}

/**
 * The recording's OWN share type (`RecordingShare`). `Recording` is generic over
 * two phantoms — `Recording<RecordingShare, CompositionShare>` — so this splits
 * them and returns the first; use {@link getRecordingShareTypes} when the
 * parent composition's share type is needed too.
 */
export async function getRecordingShareType(
  client: ClientWithCoreApi,
  recordingId: string,
): Promise<string> {
  const [recordingShareType] = await getRecordingShareTypes(
    client,
    recordingId,
  );
  return recordingShareType;
}

/**
 * Both of a recording's share types, as `[RecordingShare, CompositionShare]`.
 * Most builders need the pair — `track::new`, `recording::publish`
 * and the recording credit/pool extensions are all generic over both, in this
 * order.
 */
export async function getRecordingShareTypes(
  client: ClientWithCoreApi,
  recordingId: string,
): Promise<[string, string]> {
  const { object } = await client.core.getObject({ objectId: recordingId });
  return extractTypeParams2(object.type);
}

export async function getRecordingByShareType(
  client: ClientWithCoreApi,
  graphqlClient: SuiGraphQLClient,
  shareType: string,
  misoPackageId: string,
): Promise<Recording> {
  const address = await addressOfRecordingWithShareType(
    graphqlClient,
    misoPackageId,
    shareType,
  );
  if (!address)
    throw new Error(`Recording not found for share type: ${shareType}`);
  return getRecordingById(client, address);
}

export async function getRecordingAdminCapById(
  client: ClientWithCoreApi,
  adminCapId: string,
): Promise<RecordingAdminCap> {
  const { object } = await client.core.getObject({ objectId: adminCapId });
  return { id: adminCapId, shareType: extractTypeParam(object.type) };
}

/**
 * Recording admin caps owned by `owner`.
 *
 * Core API (no GraphQL), same shape as {@link getOwnedCompositionAdminCaps}.
 * Note `RecordingAdminCap<phantom RecordingShare>` is deliberately single-param,
 * so this yields only the recording's own share type — its parent composition's
 * share type is not recoverable from the cap alone.
 */
export async function getOwnedRecordingAdminCaps(
  client: ClientWithCoreApi,
  owner: string,
  misoPackageId: string,
): Promise<RecordingAdminCap[]> {
  const capType = `${misoPackageId}::recording::RecordingAdminCap`;
  const objects = await listAllOwnedObjects(client, { owner, type: capType });
  const caps: RecordingAdminCap[] = [];
  for (const obj of objects) {
    const match = obj.type?.match(/<(.+)>$/);
    if (match?.[1]) caps.push({ id: obj.objectId, shareType: match[1] });
  }
  return caps;
}

export function deriveRecordingAdminCapId(
  recordingId: string,
  misoPackageId: string,
): string {
  return deriveObjectID(
    recordingId,
    `${misoPackageId}::recording::RecordingAdminCapKey`,
    UNIT_STRUCT_KEY_BYTES,
  );
}

// ============================================================================
// Release
// ============================================================================

export async function getReleasesByIds(
  client: ClientWithCoreApi,
  releaseIds: string[],
): Promise<Record<string, Release>> {
  if (releaseIds.length === 0) return {};
  const { objects } = await client.core.getObjects({
    objectIds: releaseIds,
    include: { content: true },
  });
  const out: Record<string, Release> = {};
  for (const obj of objects) {
    if (obj instanceof Error || !obj.content) continue;
    out[obj.objectId] = mapRelease(obj.objectId, ReleaseBcs.parse(obj.content));
  }
  return out;
}

export async function getReleaseById(
  client: ClientWithCoreApi,
  releaseId: string,
): Promise<Release> {
  const { object } = await client.core.getObject({
    objectId: releaseId,
    include: { content: true },
  });
  if (!object.content) throw new Error(`Release not found: ${releaseId}`);
  return mapRelease(releaseId, ReleaseBcs.parse(object.content));
}

export async function getReleaseAdminCapById(
  client: ClientWithCoreApi,
  adminCapId: string,
): Promise<ReleaseAdminCap> {
  const { object } = await client.core.getObject({
    objectId: adminCapId,
    include: { json: true },
  });
  const json = object.json as { release_id: string } | null;
  if (!json?.release_id)
    throw new Error(`ReleaseAdminCap not found: ${adminCapId}`);
  return { id: adminCapId, releaseId: json.release_id };
}

export async function getOwnedReleaseAdminCaps(
  client: ClientWithCoreApi,
  owner: string,
  misoPackageId: string,
): Promise<ReleaseAdminCap[]> {
  const capType = `${misoPackageId}::release::ReleaseAdminCap`;
  const objects = await listAllOwnedObjects(client, {
    owner,
    type: capType,
    include: { json: true },
  });
  const caps: ReleaseAdminCap[] = [];
  for (const obj of objects) {
    const json = obj.json as { release_id: string } | null;
    if (json?.release_id)
      caps.push({ id: obj.objectId, releaseId: json.release_id });
  }
  return caps;
}

export function deriveReleaseAdminCapId(
  releaseId: string,
  misoPackageId: string,
): string {
  return deriveObjectID(
    releaseId,
    `${misoPackageId}::release::ReleaseAdminCapKey`,
    UNIT_STRUCT_KEY_BYTES,
  );
}

// ============================================================================
// Share Currency
// ============================================================================

/** Extracts the share type `T` from a `Currency<T>` object. */
export async function getShareCurrencyType(
  client: ClientWithCoreApi,
  shareCurrencyId: string,
): Promise<string> {
  const { object } = await client.core.getObject({ objectId: shareCurrencyId });
  return extractTypeParam(object.type);
}

/**
 * Finds the `TreasuryCap<ShareType>` owned by `owner`. One Core API call.
 *
 * Takes the share TYPE, not the `Currency` object id, because callers almost
 * always have it already — it is {@link ShareCurrencyBinding.shareType},
 * threaded through every builder. Taking the object id instead would force a
 * `getObject` purely to read the type parameter back off the tag, a round trip
 * the caller already paid for. If you genuinely hold only the currency id,
 * compose the two:
 *
 * ```ts
 * const shareType = await getShareCurrencyType(client, shareCurrencyId);
 * const capId = await getShareCurrencyTreasuryCap(client, shareType, owner);
 * ```
 */
export async function getShareCurrencyTreasuryCap(
  client: ClientWithCoreApi,
  shareType: string,
  owner: string,
): Promise<string> {
  const objects = await listAllOwnedObjects(client, {
    owner,
    type: `0x2::coin::TreasuryCap<${shareType}>`,
  });
  if (objects.length === 0) {
    throw new Error(`No TreasuryCap found for ${shareType} owned by ${owner}`);
  }
  return objects[0]!.objectId;
}

// ============================================================================
// Private
// ============================================================================

/** Returns the first object address of a fully-qualified type, or null. */
async function firstAddressOfType(
  client: SuiGraphQLClient,
  type: string,
): Promise<string | null> {
  const result = await client.query({
    query: AddressesByTypeQuery,
    variables: { type },
  });
  return result.data?.objects?.nodes?.[0]?.address ?? null;
}

/**
 * Address of the `Recording` whose FIRST type parameter is `shareType`, or null.
 *
 * `Recording<RecordingShare, CompositionShare>` takes two parameters and a type
 * filter must supply all of them or none, so filtering by
 * `Recording<${shareType}>` matches nothing. Callers generally know only the
 * recording's own share type — `RecordingAdminCap<phantom RecordingShare>` is
 * deliberately single-param — so this filters by bare type name and matches the
 * first parameter client-side. A recording's share currency is unique to it, so
 * the match is unambiguous.
 */
async function addressOfRecordingWithShareType(
  client: SuiGraphQLClient,
  misoPackageId: string,
  shareType: string,
): Promise<string | null> {
  let cursor: string | null | undefined;
  do {
    const result = await client.query<
      { objects?: WorkAddressConnection | null },
      { type: string; cursor?: string | null }
    >({
      query: `query RecordingAddress($type: String!, $cursor: String) {
        objects(first: 50, after: $cursor, filter: { type: $type }) {
          pageInfo { hasNextPage endCursor }
          nodes { address asMoveObject { contents { type { repr } } } }
        }
      }`,
      variables: { type: `${misoPackageId}::recording::Recording`, cursor },
    });
    const page = result.data?.objects;
    for (const node of page?.nodes ?? []) {
      const repr = node?.asMoveObject?.contents?.type?.repr;
      if (!repr || !node.address) continue;
      const [recordingShareType] = extractTypeParams2(repr);
      if (recordingShareType === shareType) return node.address;
    }
    cursor = page?.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return null;
}
