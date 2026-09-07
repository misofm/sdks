// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { runPromise, toPromise, tryPromise } from "@misofm/utils/effect";
import { Effect } from "effect";
import { queryEffect, nextPageCursor } from "./query-effect.ts";

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

import type { ClientWithCoreApi, SuiClientTypes } from "@mysten/sui/client";
import { splitGenericParameters } from "@mysten/bcs";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { graphql } from "@mysten/sui/graphql/schema";
import { deriveObjectID, normalizeSuiAddress } from "@mysten/sui/utils";

import {
  ReleaseRegistry as ReleaseRegistryBcs,
} from "./contracts/miso/release.ts";
import { RoyaltyPool as RoyaltyPoolBcs } from "./contracts/royalty_pool/pool.ts";
import { Stake as RoyaltyStakeBcs } from "./contracts/royalty_pool/stake.ts";
import { RoutedStake as RoutedStakeBcs } from "./contracts/routed_stake/routed_stake.ts";
import { parseCompositionObject, parseRecordingObject, parseReleaseObject } from "./parsers.ts";
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
  const parts = splitGenericParameters(inner);
  if (parts.length === 2 && parts[0] && parts[1]) return [parts[0].trim(), parts[1].trim()];
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

function getManyByBcsEffect<T>(client: ClientWithCoreApi, objectIds: string[], parse: (id: string, bytes: Uint8Array) => T) {
  return queryEffect("getManyByBcs", function* () {
    const out: Record<string, T> = {};
    if (objectIds.length === 0) return out;
    const { objects } = yield* tryPromise("getManyByBcs", (signal) => client.core.getObjects({ signal, objectIds, include: { content: true } }));
    for (const object of objects) {
      if (object instanceof Error || !object.content) continue;
      out[object.objectId] = parse(object.objectId, object.content);
    }
    return out;
  });
}

/** Exhaust every Core owned-object page; cap discovery must not truncate. */
function listAllOwnedObjectsEffect(
  client: ClientWithCoreApi,
  input: SuiClientTypes.ListOwnedObjectsOptions<{ json: true }>,
) {
  return queryEffect("listAllOwnedObjects", function* () {
    const objects: Array<{ objectId: string; type?: string; json?: unknown }> = [];
    let cursor: string | null | undefined;
    const seen = new Set<string>();
    do {
      const page = (yield* tryPromise("listAllOwnedObjects", (signal) => client.core.listOwnedObjects({ ...input, cursor, signal })));
      objects.push(...page.objects);
      cursor = nextPageCursor(page.hasNextPage, page.cursor, cursor);
      if (cursor && seen.has(cursor)) throw new Error("Pagination repeated a cursor");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return objects;
  });
}

/** Fetches one object's BCS content bytes (or null if absent). */
function getContentEffect(
  client: ClientWithCoreApi,
  objectId: string,
) {
  return queryEffect("getContent", function* () {
    const { object } = (yield* tryPromise("getContent", (signal) => client.core.getObject({ signal,
      objectId,
      include: { content: true },
    })));
    return object.content ?? null;
  });
}

/**
 * Fetch and parse an object through the transport-neutral Core API. Object
 * content is BCS; never pass the full `objectBcs` envelope to a Move codec.
 */
export function getObjectByBcsEffect<T>(
  client: ClientWithCoreApi,
  objectId: string,
  codec: BcsParser<T>,
) {
  return queryEffect("getObjectByBcs", function* () {
    const content = (yield* getContentEffect(client, objectId));
    if (!content) throw new Error(`Object not found: ${objectId}`);
    return codec.parse(content);
  });
}

export function getObjectByBcs<T>(
  client: ClientWithCoreApi,
  objectId: string,
  codec: BcsParser<T>,
): Promise<T> {
  return runPromise(getObjectByBcsEffect(client, objectId, codec));
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
export function getExtensionFieldEffect<T>(
  client: ClientWithCoreApi,
  parentId: string,
  params: ExtensionFieldParams<T>,
) {
  return queryEffect("getExtensionField", function* () {
      const { dynamicField } = (yield* tryPromise("getExtensionField", (signal) => client.core.getDynamicField({ signal,
        parentId,
        name: {
          type: `${params.packageId}::${params.module}::ExtensionKey`,
          bcs: UNIT_STRUCT_KEY_BYTES,
        },
      })));
      return params.codec.parse(dynamicField.value.bcs);
  }).pipe(Effect.catch((error) => isNotFound(error.cause) ? Effect.succeed(null) : Effect.fail(error)));
}

export function getExtensionField<T>(
  client: ClientWithCoreApi,
  parentId: string,
  params: ExtensionFieldParams<T>,
): Promise<T | null> {
  return runPromise(getExtensionFieldEffect(client, parentId, params));
}

export interface ReleaseDspFieldParams<T> {
  /** Freshly published `release_dsp_link` package address. */
  packageId: string;
  /** Numeric DSP discriminator (`DspLinkData::platform()`). */
  platform: number;
  /** Generated codec for `DspLinkData` or `PerTrack<Option<DspLinkData>>`. */
  codec: BcsParser<T>;
}

function getReleaseDspFieldEffect<T>(
  client: ClientWithCoreApi,
  releaseId: string,
  key: "ReleaseLinkKey" | "TrackLinksKey",
  params: ReleaseDspFieldParams<T>,
) {
  return queryEffect("getReleaseDspField", function* () {
    if (!Number.isInteger(params.platform) || params.platform < 0 || params.platform > 255) {
      throw new Error("DSP platform must be a u8 discriminator");
    }
      const { dynamicField } = (yield* tryPromise("getReleaseDspField", (signal) => client.core.getDynamicField({ signal,
        parentId: releaseId,
        name: {
          type: `${params.packageId}::release_dsp_link::${key}`,
          bcs: Uint8Array.of(params.platform),
        },
      })));
      return params.codec.parse(dynamicField.value.bcs);
  }).pipe(Effect.catch((error) => isNotFound(error.cause) ? Effect.succeed(null) : Effect.fail(error)));
}

/** Read a release-level DSP link stored under `ReleaseLinkKey(platform)`. */
export function getReleaseDspLink<T>(
  client: ClientWithCoreApi,
  releaseId: string,
  params: ReleaseDspFieldParams<T>,
): Promise<T | null> {
  return runPromise(getReleaseDspLinkEffect(client, releaseId, params));
}

export function getReleaseDspLinkEffect<T>(client: ClientWithCoreApi, releaseId: string, params: ReleaseDspFieldParams<T>) {
  return getReleaseDspFieldEffect(client, releaseId, "ReleaseLinkKey", params);
}

/** Read the per-track DSP-link array stored under `TrackLinksKey(platform)`. */
export function getTrackDspLinks<T>(
  client: ClientWithCoreApi,
  releaseId: string,
  params: ReleaseDspFieldParams<T>,
): Promise<T | null> {
  return runPromise(getTrackDspLinksEffect(client, releaseId, params));
}

export function getTrackDspLinksEffect<T>(client: ClientWithCoreApi, releaseId: string, params: ReleaseDspFieldParams<T>) {
  return getReleaseDspFieldEffect(client, releaseId, "TrackLinksKey", params);
}

// ============================================================================
// Core registry and generic primitive reads
// ============================================================================

/** Parse the shared canonical core `miso::release::ReleaseRegistry` by ID. */
export function getReleaseRegistryByIdEffect(
  client: ClientWithCoreApi,
  registryId: string,
) {
  return getObjectByBcsEffect(client, registryId, ReleaseRegistryBcs);
}

export const getReleaseRegistryById = toPromise(getReleaseRegistryByIdEffect);

/** Parse a royalty pool by object ID. Phantom type arguments do not affect BCS. */
export function getRoyaltyPoolByIdEffect(
  client: ClientWithCoreApi,
  poolId: string,
) {
  return getObjectByBcsEffect(client, poolId, RoyaltyPoolBcs);
}

export const getRoyaltyPoolById = toPromise(getRoyaltyPoolByIdEffect);

/** Parse an owned `Stake<Share>` by object ID. */
export function getRoyaltyStakeByIdEffect(
  client: ClientWithCoreApi,
  stakeId: string,
) {
  return getObjectByBcsEffect(client, stakeId, RoyaltyStakeBcs);
}

export const getRoyaltyStakeById = toPromise(getRoyaltyStakeByIdEffect);

/** Parse a shared routed stake by object ID. */
export function getRoutedStakeByIdEffect(
  client: ClientWithCoreApi,
  routedStakeId: string,
) {
  return getObjectByBcsEffect(client, routedStakeId, RoutedStakeBcs);
}

export const getRoutedStakeById = toPromise(getRoutedStakeByIdEffect);

/** Deterministically derive the royalty-pool ID for a parent and type pair. */
export function deriveRoyaltyPoolId(
  parentId: string,
  shareType: string,
  currencyType: string,
  royaltyPoolPackageId: string,
): string {
  return deriveObjectID(
    parentId,
    `${royaltyPoolPackageId}::pool::RoyaltyPoolKey<${shareType}, ${currencyType}>`,
    UNIT_STRUCT_KEY_BYTES,
  );
}

/** Deterministically derive the routed-stake ID for a parent and stake share. */
export function deriveRoutedStakeId(
  parentId: string,
  stakeShareType: string,
  routedStakePackageId: string,
): string {
  return deriveObjectID(
    parentId,
    `${routedStakePackageId}::routed_stake::RoutedStakeKey<${stakeShareType}>`,
    UNIT_STRUCT_KEY_BYTES,
  );
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
export function getWorkAddressesByShareTypesEffect(
  client: SuiGraphQLClient,
  shareTypes: WorkShareTypes,
  misoPackageId: string,
) {
  return queryEffect("getWorkAddressesByShareTypes", function* () {
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

    const result = (yield* tryPromise("getWorkAddressesByShareTypes", (signal) => client.query<
      Record<string, WorkAddressConnection | null>,
      Record<string, string>
    >({ signal,
      query: `query WorkAddressesByShareTypes(${declarations.join(", ")}) {
        ${selections.join("\n")}
      }`,
      variables,
    })));
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
    let cursor: string | null = null;
    const seen = new Set<string>();
    readRecordingPage(recordingPage);
    while (
      recordingPage?.pageInfo?.hasNextPage &&
      Object.keys(out.recordings).length < recordings.size
    ) {
      cursor = nextPageCursor(true, recordingPage.pageInfo.endCursor, cursor);
      if (seen.has(cursor!)) throw new Error("Pagination repeated a cursor");
      seen.add(cursor!);
      const nextCursor = cursor!;
      const next = (yield* tryPromise("getWorkAddressesByShareTypes", (signal) => client.query<
        { recordings: WorkAddressConnection | null },
        { recordingType: string; cursor: string }
      >({ signal,
        query: `query RecordingWorkAddresses($recordingType: String!, $cursor: String!) {
          recordings: objects(first: 50, after: $cursor, filter: { type: $recordingType }) {
            pageInfo { hasNextPage endCursor }
            nodes { address asMoveObject { contents { type { repr } } } }
          }
        }`,
        variables: {
          recordingType: variables.recordingType!,
          cursor: nextCursor,
        },
      })));
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
  });
}

export const getWorkAddressesByShareTypes = toPromise(getWorkAddressesByShareTypesEffect);

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
export function getWorksByIdsEffect(
  client: ClientWithCoreApi,
  ids: WorkIds,
) {
  return queryEffect("getWorksByIds", function* () {
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

    const { objects } = (yield* tryPromise("getWorksByIds", (signal) => client.core.getObjects({ signal,
      objectIds: [...kinds.keys()],
      include: { content: true },
    })));
    for (const obj of objects) {
      if (obj instanceof Error || !obj.content) continue;
      const kind = kinds.get(normalizeSuiAddress(obj.objectId));
      if (kind === "compositions") {
        out.compositions[obj.objectId] = parseCompositionObject(obj.objectId, obj.content);
      } else if (kind === "recordings") {
        out.recordings[obj.objectId] = parseRecordingObject(obj.objectId, obj.content);
      } else if (kind === "releases") {
        out.releases[obj.objectId] = parseReleaseObject(obj.objectId, obj.content);
      }
    }
    return out;
  });
}

export const getWorksByIds = toPromise(getWorksByIdsEffect);

// ============================================================================
// Composition
// ============================================================================

/** Fetches multiple compositions by ID in one Core request. */
export function getCompositionsByIdsEffect(client: ClientWithCoreApi, compositionIds: string[]) {
  return getManyByBcsEffect(client, compositionIds, parseCompositionObject);
}

export const getCompositionsByIds = toPromise(getCompositionsByIdsEffect);

/** Fetches a composition by its object ID. */
export function getCompositionByIdEffect(
  client: ClientWithCoreApi,
  compositionId: string,
) {
  return queryEffect("getCompositionById", function* () {
    const content = (yield* getContentEffect(client, compositionId));
    if (!content) throw new Error(`Composition not found: ${compositionId}`);
    return parseCompositionObject(compositionId, content);
  });
}

export const getCompositionById = toPromise(getCompositionByIdEffect);

/** Extracts the share type `T` from a `Composition<T>` object. */
export function getCompositionShareTypeEffect(
  client: ClientWithCoreApi,
  compositionId: string,
) {
  return queryEffect("getCompositionShareType", function* () {
    const { object } = (yield* tryPromise("getCompositionShareType", (signal) => client.core.getObject({ signal, objectId: compositionId })));
    return extractTypeParam(object.type);
  });
}

export const getCompositionShareType = toPromise(getCompositionShareTypeEffect);

/** Fetches a composition by its share type (GraphQL discovery + Core read). */
export function getCompositionByShareTypeEffect(
  client: ClientWithCoreApi,
  graphqlClient: SuiGraphQLClient,
  shareType: string,
  misoPackageId: string,
) {
  return queryEffect("getCompositionByShareType", function* () {
    const address = (yield* getCompositionAddressByShareTypeEffect(
      graphqlClient,
      shareType,
      misoPackageId,
    ));
    if (!address)
      throw new Error(`Composition not found for share type: ${shareType}`);
    return yield* getCompositionByIdEffect(client, address);
  });
}

export const getCompositionByShareType = toPromise(getCompositionByShareTypeEffect);

/**
 * Resolves a composition share type to its object address.
 *
 * This is the lightweight discovery primitive for callers that need the
 * composition's identity but will read extension fields rather than the core
 * Composition contents.
 */
export function getCompositionAddressByShareTypeEffect(
  graphqlClient: SuiGraphQLClient,
  shareType: string,
  misoPackageId: string,
) {
  return queryEffect("getCompositionAddressByShareType", function* () {
    const type = `${misoPackageId}::composition::Composition<${shareType}>`;
    return yield* firstAddressOfTypeEffect(graphqlClient, type);
  });
}

export const getCompositionAddressByShareType = toPromise(getCompositionAddressByShareTypeEffect);

export function getCompositionAdminCapByIdEffect(
  client: ClientWithCoreApi,
  adminCapId: string,
) {
  return queryEffect("getCompositionAdminCapById", function* () {
    const { object } = (yield* tryPromise("getCompositionAdminCapById", (signal) => client.core.getObject({ signal, objectId: adminCapId })));
    return { id: adminCapId, shareType: extractTypeParam(object.type) };
  });
}

export const getCompositionAdminCapById = toPromise(getCompositionAdminCapByIdEffect);

/**
 * Composition admin caps owned by `owner`.
 *
 * Core API (no GraphQL): `listOwnedObjects` takes a type filter and returns each
 * object's instantiated `type`, so the share type is read straight off
 * `CompositionAdminCap<CompositionShare>` with no second round-trip.
 */
export function getOwnedCompositionAdminCapsEffect(
  client: ClientWithCoreApi,
  owner: string,
  misoPackageId: string,
) {
  return queryEffect("getOwnedCompositionAdminCaps", function* () {
    const capType = `${misoPackageId}::composition::CompositionAdminCap`;
    const objects = (yield* listAllOwnedObjectsEffect(client, { owner, type: capType }));
    const caps: CompositionAdminCap[] = [];
    for (const obj of objects) {
      const match = obj.type?.match(/<(.+)>$/);
      if (match?.[1]) caps.push({ id: obj.objectId, shareType: match[1] });
    }
    return caps;
  });
}

export const getOwnedCompositionAdminCaps = toPromise(getOwnedCompositionAdminCapsEffect);

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

export function getRecordingsByIdsEffect(client: ClientWithCoreApi, recordingIds: string[]) {
  return getManyByBcsEffect(client, recordingIds, parseRecordingObject);
}

export const getRecordingsByIds = toPromise(getRecordingsByIdsEffect);

export function getRecordingByIdEffect(
  client: ClientWithCoreApi,
  recordingId: string,
) {
  return queryEffect("getRecordingById", function* () {
    const content = (yield* getContentEffect(client, recordingId));
    if (!content) throw new Error(`Recording not found: ${recordingId}`);
    return parseRecordingObject(recordingId, content);
  });
}

export const getRecordingById = toPromise(getRecordingByIdEffect);

/**
 * The recording's OWN share type (`RecordingShare`). `Recording` is generic over
 * two phantoms — `Recording<RecordingShare, CompositionShare>` — so this splits
 * them and returns the first; use {@link getRecordingShareTypes} when the
 * parent composition's share type is needed too.
 */
export function getRecordingShareTypeEffect(
  client: ClientWithCoreApi,
  recordingId: string,
) {
  return queryEffect("getRecordingShareType", function* () {
    const [recordingShareType] = (yield* getRecordingShareTypesEffect(
      client,
      recordingId,
    ));
    return recordingShareType;
  });
}

export const getRecordingShareType = toPromise(getRecordingShareTypeEffect);

/**
 * Both of a recording's share types, as `[RecordingShare, CompositionShare]`.
 * Most builders need the pair — `track::new`, `recording::publish`
 * and the recording credit/pool extensions are all generic over both, in this
 * order.
 */
export function getRecordingShareTypesEffect(
  client: ClientWithCoreApi,
  recordingId: string,
) {
  return queryEffect("getRecordingShareTypes", function* () {
    const { object } = (yield* tryPromise("getRecordingShareTypes", (signal) => client.core.getObject({ signal, objectId: recordingId })));
    return extractTypeParams2(object.type);
  });
}

export const getRecordingShareTypes = toPromise(getRecordingShareTypesEffect);

export function getRecordingByShareTypeEffect(
  client: ClientWithCoreApi,
  graphqlClient: SuiGraphQLClient,
  shareType: string,
  misoPackageId: string,
) {
  return queryEffect("getRecordingByShareType", function* () {
    const address = (yield* addressOfRecordingWithShareTypeEffect(
      graphqlClient,
      misoPackageId,
      shareType,
    ));
    if (!address)
      throw new Error(`Recording not found for share type: ${shareType}`);
    return yield* getRecordingByIdEffect(client, address);
  });
}

export const getRecordingByShareType = toPromise(getRecordingByShareTypeEffect);

export function getRecordingAdminCapByIdEffect(
  client: ClientWithCoreApi,
  adminCapId: string,
) {
  return queryEffect("getRecordingAdminCapById", function* () {
    const { object } = (yield* tryPromise("getRecordingAdminCapById", (signal) => client.core.getObject({ signal, objectId: adminCapId })));
    return { id: adminCapId, shareType: extractTypeParam(object.type) };
  });
}

export const getRecordingAdminCapById = toPromise(getRecordingAdminCapByIdEffect);

/**
 * Recording admin caps owned by `owner`.
 *
 * Core API (no GraphQL), same shape as {@link getOwnedCompositionAdminCaps}.
 * Note `RecordingAdminCap<phantom RecordingShare>` is deliberately single-param,
 * so this yields only the recording's own share type — its parent composition's
 * share type is not recoverable from the cap alone.
 */
export function getOwnedRecordingAdminCapsEffect(
  client: ClientWithCoreApi,
  owner: string,
  misoPackageId: string,
) {
  return queryEffect("getOwnedRecordingAdminCaps", function* () {
    const capType = `${misoPackageId}::recording::RecordingAdminCap`;
    const objects = (yield* listAllOwnedObjectsEffect(client, { owner, type: capType }));
    const caps: RecordingAdminCap[] = [];
    for (const obj of objects) {
      const match = obj.type?.match(/<(.+)>$/);
      if (match?.[1]) caps.push({ id: obj.objectId, shareType: match[1] });
    }
    return caps;
  });
}

export const getOwnedRecordingAdminCaps = toPromise(getOwnedRecordingAdminCapsEffect);

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

export function getReleasesByIdsEffect(client: ClientWithCoreApi, releaseIds: string[]) {
  return getManyByBcsEffect(client, releaseIds, parseReleaseObject);
}

export const getReleasesByIds = toPromise(getReleasesByIdsEffect);

export function getReleaseByIdEffect(
  client: ClientWithCoreApi,
  releaseId: string,
) {
  return queryEffect("getReleaseById", function* () {
    const { object } = (yield* tryPromise("getReleaseById", (signal) => client.core.getObject({ signal,
      objectId: releaseId,
      include: { content: true },
    })));
    if (!object.content) throw new Error(`Release not found: ${releaseId}`);
    return parseReleaseObject(releaseId, object.content);
  });
}

export const getReleaseById = toPromise(getReleaseByIdEffect);

export function getReleaseAdminCapByIdEffect(
  client: ClientWithCoreApi,
  adminCapId: string,
) {
  return queryEffect("getReleaseAdminCapById", function* () {
    const { object } = (yield* tryPromise("getReleaseAdminCapById", (signal) => client.core.getObject({ signal,
      objectId: adminCapId,
      include: { json: true },
    })));
    const json = object.json as { release_id: string } | null;
    if (!json?.release_id)
      throw new Error(`ReleaseAdminCap not found: ${adminCapId}`);
    return { id: adminCapId, releaseId: json.release_id };
  });
}

export const getReleaseAdminCapById = toPromise(getReleaseAdminCapByIdEffect);

export function getOwnedReleaseAdminCapsEffect(
  client: ClientWithCoreApi,
  owner: string,
  misoPackageId: string,
) {
  return queryEffect("getOwnedReleaseAdminCaps", function* () {
    const capType = `${misoPackageId}::release::ReleaseAdminCap`;
    const objects = (yield* listAllOwnedObjectsEffect(client, {
      owner,
      type: capType,
      include: { json: true },
    }));
    const caps: ReleaseAdminCap[] = [];
    for (const obj of objects) {
      const json = obj.json as { release_id: string } | null;
      if (json?.release_id)
        caps.push({ id: obj.objectId, releaseId: json.release_id });
    }
    return caps;
  });
}

export const getOwnedReleaseAdminCaps = toPromise(getOwnedReleaseAdminCapsEffect);

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
export function getShareCurrencyTypeEffect(
  client: ClientWithCoreApi,
  shareCurrencyId: string,
) {
  return queryEffect("getShareCurrencyType", function* () {
    const { object } = (yield* tryPromise("getShareCurrencyType", (signal) => client.core.getObject({ signal, objectId: shareCurrencyId })));
    return extractTypeParam(object.type);
  });
}

export const getShareCurrencyType = toPromise(getShareCurrencyTypeEffect);

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
export function getShareCurrencyTreasuryCapEffect(
  client: ClientWithCoreApi,
  shareType: string,
  owner: string,
) {
  return queryEffect("getShareCurrencyTreasuryCap", function* () {
    const objects = (yield* listAllOwnedObjectsEffect(client, {
      owner,
      type: `0x2::coin::TreasuryCap<${shareType}>`,
    }));
    if (objects.length === 0) {
      throw new Error(`No TreasuryCap found for ${shareType} owned by ${owner}`);
    }
    return objects[0]!.objectId;
  });
}

export const getShareCurrencyTreasuryCap = toPromise(getShareCurrencyTreasuryCapEffect);

// ============================================================================
// Private
// ============================================================================

/** Returns the first object address of a fully-qualified type, or null. */
function firstAddressOfTypeEffect(
  client: SuiGraphQLClient,
  type: string,
) {
  return queryEffect("firstAddressOfType", function* () {
    const result = (yield* tryPromise("firstAddressOfType", (signal) => client.query({ signal,
      query: AddressesByTypeQuery,
      variables: { type },
    })));
    if (result.errors?.length) throw new AggregateError(result.errors.map((error) => new Error(error.message)), "Work type discovery failed");
    return result.data?.objects?.nodes?.[0]?.address ?? null;
  });
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
function addressOfRecordingWithShareTypeEffect(
  client: SuiGraphQLClient,
  misoPackageId: string,
  shareType: string,
) {
  return queryEffect("addressOfRecordingWithShareType", function* () {
    let cursor: string | null | undefined;
    const seen = new Set<string>();
    do {
      const result = (yield* tryPromise("addressOfRecordingWithShareType", (signal) => client.query<
        { objects?: WorkAddressConnection | null },
        { type: string; cursor?: string | null }
      >({ signal,
        query: `query RecordingAddress($type: String!, $cursor: String) {
          objects(first: 50, after: $cursor, filter: { type: $type }) {
            pageInfo { hasNextPage endCursor }
            nodes { address asMoveObject { contents { type { repr } } } }
          }
        }`,
        variables: { type: `${misoPackageId}::recording::Recording`, cursor },
      })));
      if (result.errors?.length) throw new AggregateError(result.errors.map((error) => new Error(error.message)), "Recording type discovery failed");
      const page = result.data?.objects;
      for (const node of page?.nodes ?? []) {
        const repr = node?.asMoveObject?.contents?.type?.repr;
        if (!repr || !node.address) continue;
        const [recordingShareType] = extractTypeParams2(repr);
        if (recordingShareType === shareType) return node.address;
      }
      cursor = nextPageCursor(page?.pageInfo?.hasNextPage, page?.pageInfo?.endCursor, cursor);
      if (cursor && seen.has(cursor)) throw new Error("Pagination repeated a cursor");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return null;
  });
}
