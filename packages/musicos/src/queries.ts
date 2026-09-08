// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Object reads. Single-object fetches use the Core API with `include: content`
// and parse the BCS contents through the codegen-generated structs (so parsing
// tracks the on-chain ABI). Generic-type discovery (by share type / by owner)
// uses GraphQL to find object addresses, then reads them through the Core path.
//
// Every read requires the `SuiClient` service (and `SuiGraphQL` for the
// type-discovery reads) instead of taking a client parameter — see
// `@misofm/effect`. Not-found is a typed `ObjectNotFoundError`; a BCS decode
// failure (including a wrong on-chain type, which fails to parse against the
// expected ABI) is a typed `BcsDecodeError`. Extension dynamic-field readers
// return `Option.none()` for "not attached" — extension data is optional by
// design, and absence is a normal, expected state, not a failure.

import { ConflictingWorkKindError } from "./errors.ts";
import { Effect, Option, Schema } from "effect";
import { graphql } from "@mysten/sui/graphql/schema";
import { deriveObjectID, normalizeSuiAddress } from "@mysten/sui/utils";

import {
  type BcsParser,
  BcsDecodeError,
  decodeBcs,
  getObjectContent,
  getObjectsContent,
  ObjectNotFoundError,
  SuiClient,
  SuiGraphQL,
  SuiRpcError,
} from "@misofm/effect";

import { Composition as CompositionBcs } from "./contracts/musicos/composition.ts";
import { Recording as RecordingBcs } from "./contracts/musicos/recording.ts";
import {
  Release as ReleaseBcs,
  ReleaseRegistry as ReleaseRegistryBcs,
} from "./contracts/musicos/release.ts";
import {
  mapComposition,
  mapRecording,
  mapRelease,
} from "./internal.ts";
import {
  Composition,
  CompositionAdminCap,
  Recording,
  RecordingAdminCap,
  Release,
  ReleaseAdminCap,
  ReleaseRegistry,
} from "./types.ts";

export type { BcsParser };

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

/** Key bytes for Move unit structs (single `0x00` for `dummy_field: bool = false`). */
const UNIT_STRUCT_KEY_BYTES = new Uint8Array([0x00]);

/**
 * True when `e` is a "this object/dynamic field does not exist" error from any
 * of the Sui client transports. This mirrors `@misofm/effect`'s internal
 * classifier (not exported, since `getObjectContent` already covers the common
 * case) — needed here for the reads that don't go through it: type-only object
 * reads (no `content`) and dynamic-field reads. Matches, in order of
 * preference:
 *
 *   1. Structured `ObjectError.code` values thrown by the JSON-RPC core client
 *      (`notExists`, `deleted`, `dynamicFieldNotFound`) and the GraphQL core
 *      client (`notFound`).
 *   2. The message shapes those clients (and the gRPC core client, which wraps
 *      the server's per-object status message in a plain `Error`) produce.
 */
function isMissingObjectError(e: unknown): boolean {
  if (typeof e === "object" && e !== null && "code" in e) {
    const code = (e as { code: unknown }).code;
    if (code === "notExists" || code === "deleted" || code === "dynamicFieldNotFound" || code === "notFound") {
      return true;
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  return (
    /\bobject\b[\s\S]*\b(?:not\s?found|does not exist|has been deleted)\b/i.test(msg) ||
    /\bdynamic field\b[\s\S]*\bnot\s?found\b/i.test(msg) ||
    /\bno object\b/i.test(msg)
  );
}

/** Classifies a Core API rejection against `objectId`: missing -> `ObjectNotFoundError`, else `SuiRpcError`. */
function classifyMissing(objectId: string, operation: string, cause: unknown): ObjectNotFoundError | SuiRpcError {
  return isMissingObjectError(cause) ? new ObjectNotFoundError({ objectId }) : new SuiRpcError({ operation, cause });
}

/** Fetches just an object's on-chain `type` (no content) through the Core API. */
const getObjectType = Effect.fn("getObjectType")(function* (
  objectId: string,
): Effect.fn.Return<string, ObjectNotFoundError | SuiRpcError, SuiClient> {
  const client = yield* SuiClient;
  const { object } = yield* Effect.tryPromise({
    try: (signal) => client.core.getObject({ objectId, signal }),
    catch: (cause) => classifyMissing(objectId, "getObject", cause),
  });
  return object.type;
});

/** Fetches one dynamic field's raw BCS value bytes; not-found becomes `ObjectNotFoundError`. */
const getDynamicFieldValue = Effect.fn("getDynamicFieldValue")(function* (
  parentId: string,
  name: { type: string; bcs: Uint8Array },
): Effect.fn.Return<Uint8Array, ObjectNotFoundError | SuiRpcError, SuiClient> {
  const client = yield* SuiClient;
  const { dynamicField } = yield* Effect.tryPromise({
    try: (signal) => client.core.getDynamicField({ parentId, name, signal }),
    catch: (cause) => classifyMissing(parentId, "getDynamicField", cause),
  });
  return dynamicField.value.bcs;
});

/** Exhaust every Core owned-object page; cap discovery must not truncate. */
const listAllOwnedObjects = Effect.fn("listAllOwnedObjects")(function* (
  input: Record<string, unknown>,
): Effect.fn.Return<Array<{ objectId: string; type?: string; json?: unknown }>, SuiRpcError, SuiClient> {
  const client = yield* SuiClient;
  const objects: Array<{ objectId: string; type?: string; json?: unknown }> = [];
  let cursor: string | null | undefined;
  do {
    const page = yield* Effect.tryPromise({
      try: (signal) =>
        (client.core.listOwnedObjects as (args: unknown) => Promise<{
          objects: Array<{ objectId: string; type?: string; json?: unknown }>;
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          hasNextPage?: boolean;
          cursor?: string | null;
        }>)(cursor ? { ...input, cursor, signal } : { ...input, signal }),
      catch: (cause) => new SuiRpcError({ operation: "listOwnedObjects", cause }),
    });
    objects.push(...page.objects);
    cursor = page.pageInfo?.hasNextPage
      ? page.pageInfo.endCursor
      : page.hasNextPage
        ? page.cursor
        : null;
  } while (cursor);
  return objects;
});

/**
 * Fetch and parse an object through the transport-neutral Core API, validating
 * the parsed result against a domain `Schema`. Object content is BCS; never
 * pass the full `objectBcs` envelope to a Move codec.
 */
export const getObjectByBcs = Effect.fn("getObjectByBcs")(function* <P, A>(
  objectId: string,
  codec: BcsParser<P>,
  schema: Schema.Codec<A, any, never, never>,
  typeName: string,
): Effect.fn.Return<A, ObjectNotFoundError | SuiRpcError | BcsDecodeError, SuiClient> {
  const { content } = yield* getObjectContent(objectId);
  return yield* decodeBcs(codec, schema, content, { type: typeName, objectId });
});

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
 * boolean byte. Absence resolves to `Option.none()`; transport errors still fail.
 */
export const getExtensionField = Effect.fn("getExtensionField")(function* <T>(
  parentId: string,
  params: ExtensionFieldParams<T>,
): Effect.fn.Return<Option.Option<T>, SuiRpcError, SuiClient> {
  return yield* getDynamicFieldValue(parentId, {
    type: `${params.packageId}::${params.module}::ExtensionKey`,
    bcs: UNIT_STRUCT_KEY_BYTES,
  }).pipe(
    Effect.map((bytes) => Option.some(params.codec.parse(bytes))),
    Effect.catchTag("ObjectNotFoundError", () => Effect.succeed(Option.none<T>())),
  );
});

export interface ReleaseDspFieldParams<T> {
  /** Freshly published `release_dsp_link` package address. */
  packageId: string;
  /** Numeric DSP discriminator (`DspLinkData::platform()`). */
  platform: number;
  /** Generated codec for `DspLinkData` or `PerTrack<Option<DspLinkData>>`. */
  codec: BcsParser<T>;
}

const getReleaseDspField = Effect.fn("getReleaseDspField")(function* <T>(
  releaseId: string,
  key: "ReleaseLinkKey" | "TrackLinksKey",
  params: ReleaseDspFieldParams<T>,
): Effect.fn.Return<Option.Option<T>, SuiRpcError, SuiClient> {
  if (!Number.isInteger(params.platform) || params.platform < 0 || params.platform > 255) {
    throw new Error("DSP platform must be a u8 discriminator");
  }
  return yield* getDynamicFieldValue(releaseId, {
    type: `${params.packageId}::release_dsp_link::${key}`,
    bcs: Uint8Array.of(params.platform),
  }).pipe(
    Effect.map((bytes) => Option.some(params.codec.parse(bytes))),
    Effect.catchTag("ObjectNotFoundError", () => Effect.succeed(Option.none<T>())),
  );
});

/** Read a release-level DSP link stored under `ReleaseLinkKey(platform)`. */
export function getReleaseDspLink<T>(
  releaseId: string,
  params: ReleaseDspFieldParams<T>,
): Effect.Effect<Option.Option<T>, SuiRpcError, SuiClient> {
  return getReleaseDspField(releaseId, "ReleaseLinkKey", params);
}

/** Read the per-track DSP-link array stored under `TrackLinksKey(platform)`. */
export function getTrackDspLinks<T>(
  releaseId: string,
  params: ReleaseDspFieldParams<T>,
): Effect.Effect<Option.Option<T>, SuiRpcError, SuiClient> {
  return getReleaseDspField(releaseId, "TrackLinksKey", params);
}

// ============================================================================
// Core registry and generic primitive reads
// ============================================================================

/** Parse the shared canonical core `miso::release::ReleaseRegistry` by ID. */
export function getReleaseRegistryById(
  registryId: string,
): Effect.Effect<ReleaseRegistry, ObjectNotFoundError | SuiRpcError | BcsDecodeError, SuiClient> {
  return getObjectByBcs(registryId, ReleaseRegistryBcs, ReleaseRegistry, "ReleaseRegistry");
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
export const getWorkAddressesByShareTypes = Effect.fn("getWorkAddressesByShareTypes")(function* (
  shareTypes: WorkShareTypes,
  misoPackageId: string,
): Effect.fn.Return<WorkAddressesByShareType, SuiRpcError, SuiGraphQL> {
  const compositions = [...new Set(shareTypes.compositions)];
  const recordings = new Set(shareTypes.recordings);
  const out: WorkAddressesByShareType = { compositions: {}, recordings: {} };
  if (compositions.length === 0 && recordings.size === 0) return out;

  const client = yield* SuiGraphQL;

  const declarations: string[] = [];
  const selections: string[] = [];
  const variables: Record<string, string> = {};

  compositions.forEach((shareType, index) => {
    const variable = `compositionType${index}`;
    declarations.push(`$${variable}: String!`);
    selections.push(
      `composition${index}: objects(first: 1, filter: { type: $${variable} }) { nodes { address } }`,
    );
    variables[variable] = `${misoPackageId}::composition::Composition<${shareType}>`;
  });

  if (recordings.size > 0) {
    declarations.push("$recordingType: String!");
    selections.push(`recordings: objects(first: 50, filter: { type: $recordingType }) {
      pageInfo { hasNextPage endCursor }
      nodes { address asMoveObject { contents { type { repr } } } }
    }`);
    variables.recordingType = `${misoPackageId}::recording::Recording`;
  }

  const result = yield* Effect.tryPromise({
    try: () =>
      client.query<Record<string, WorkAddressConnection | null>, Record<string, string>>({
        query: `query WorkAddressesByShareTypes(${declarations.join(", ")}) {
          ${selections.join("\n")}
        }`,
        variables,
      }),
    catch: (cause) => new SuiRpcError({ operation: "workAddressesByShareTypes", cause }),
  });
  if (result.errors?.length) {
    return yield* new SuiRpcError({
      operation: "workAddressesByShareTypes",
      cause: new AggregateError(
        result.errors.map((error) => new Error(error.message)),
        "Work type discovery failed",
      ),
    });
  }

  compositions.forEach((shareType, index) => {
    const address = result.data?.[`composition${index}`]?.nodes[0]?.address;
    if (address) out.compositions[shareType] = address;
  });

  const readRecordingPage = (page: WorkAddressConnection | null | undefined) => {
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
    const cursor: string = recordingPage.pageInfo.endCursor;
    const next = yield* Effect.tryPromise({
      try: () =>
        client.query<{ recordings: WorkAddressConnection | null }, { recordingType: string; cursor: string }>({
          query: `query RecordingWorkAddresses($recordingType: String!, $cursor: String!) {
            recordings: objects(first: 50, after: $cursor, filter: { type: $recordingType }) {
              pageInfo { hasNextPage endCursor }
              nodes { address asMoveObject { contents { type { repr } } } }
            }
          }`,
          variables: { recordingType: variables.recordingType!, cursor },
        }),
      catch: (cause) => new SuiRpcError({ operation: "recordingWorkAddresses", cause }),
    });
    if (next.errors?.length) {
      return yield* new SuiRpcError({
        operation: "recordingWorkAddresses",
        cause: new AggregateError(
          next.errors.map((error) => new Error(error.message)),
          "Recording type discovery failed",
        ),
      });
    }
    recordingPage = next.data?.recordings;
    readRecordingPage(recordingPage);
  }

  return out;
});

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
export const getWorksByIds = Effect.fn("getWorksByIds")(function* (
  ids: WorkIds,
): Effect.fn.Return<WorksById, ConflictingWorkKindError | SuiRpcError | BcsDecodeError, SuiClient> {
  const kinds = new Map<string, keyof WorksById>();
  for (const [kind, objectIds] of Object.entries(ids) as Array<[keyof WorksById, readonly string[]]>) {
    for (const objectId of objectIds) {
      const normalized = normalizeSuiAddress(objectId);
      const previous = kinds.get(normalized);
      if (previous && previous !== kind) {
        return yield* new ConflictingWorkKindError({ objectId: normalized, kinds: [previous, kind] });
      }
      kinds.set(normalized, kind);
    }
  }

  const out: WorksById = { compositions: {}, recordings: {}, releases: {} };
  if (kinds.size === 0) return out;

  const contents = yield* getObjectsContent([...kinds.keys()]);
  yield* Effect.forEach(
    [...contents.entries()],
    ([objectId, { content }]) =>
      Effect.gen(function* () {
        const kind = kinds.get(normalizeSuiAddress(objectId));
        if (kind === "compositions") {
          out.compositions[objectId] = yield* decodeBcs(
            { parse: (bytes) => mapComposition(objectId, CompositionBcs.parse(bytes)) },
            Composition,
            content,
            { type: "Composition", objectId },
          );
        } else if (kind === "recordings") {
          out.recordings[objectId] = yield* decodeBcs(
            { parse: (bytes) => mapRecording(objectId, RecordingBcs.parse(bytes)) },
            Recording,
            content,
            { type: "Recording", objectId },
          );
        } else if (kind === "releases") {
          out.releases[objectId] = yield* decodeBcs(
            { parse: (bytes) => mapRelease(objectId, ReleaseBcs.parse(bytes)) },
            Release,
            content,
            { type: "Release", objectId },
          );
        }
      }),
    { concurrency: "unbounded" },
  );
  return out;
});

// ============================================================================
// Composition
// ============================================================================

/** Fetches multiple compositions by ID in one Core request. */
export const getCompositionsByIds = Effect.fn("getCompositionsByIds")(function* (
  compositionIds: string[],
): Effect.fn.Return<Record<string, Composition>, SuiRpcError | BcsDecodeError, SuiClient> {
  if (compositionIds.length === 0) return {};
  const contents = yield* getObjectsContent(compositionIds);
  const decoded = yield* Effect.forEach(
    [...contents.entries()],
    ([objectId, { content }]) =>
      decodeBcs(
        { parse: (bytes) => mapComposition(objectId, CompositionBcs.parse(bytes)) },
        Composition,
        content,
        { type: "Composition", objectId },
      ).pipe(Effect.map((composition) => [objectId, composition] as const)),
    { concurrency: "unbounded" },
  );
  return Object.fromEntries(decoded);
});

/** Fetches a composition by its object ID. */
export function getCompositionById(
  compositionId: string,
): Effect.Effect<Composition, ObjectNotFoundError | SuiRpcError | BcsDecodeError, SuiClient> {
  return getObjectByBcs(
    compositionId,
    { parse: (bytes) => mapComposition(compositionId, CompositionBcs.parse(bytes)) },
    Composition,
    "Composition",
  );
}

/** Extracts the share type `T` from a `Composition<T>` object. */
export const getCompositionShareType = Effect.fn("getCompositionShareType")(function* (
  compositionId: string,
): Effect.fn.Return<string, ObjectNotFoundError | SuiRpcError, SuiClient> {
  const type = yield* getObjectType(compositionId);
  return extractTypeParam(type);
});

/** Fetches a composition by its share type (GraphQL discovery + Core read). */
export const getCompositionByShareType = Effect.fn("getCompositionByShareType")(function* (
  shareType: string,
  misoPackageId: string,
): Effect.fn.Return<Composition, ObjectNotFoundError | SuiRpcError | BcsDecodeError, SuiClient | SuiGraphQL> {
  const address = yield* getCompositionAddressByShareType(shareType, misoPackageId);
  if (Option.isNone(address)) {
    return yield* new ObjectNotFoundError({ objectId: `composition::Composition<${shareType}>` });
  }
  return yield* getCompositionById(address.value);
});

/**
 * Resolves a composition share type to its object address.
 *
 * This is the lightweight discovery primitive for callers that need the
 * composition's identity but will read extension fields rather than the core
 * Composition contents.
 */
export function getCompositionAddressByShareType(
  shareType: string,
  misoPackageId: string,
): Effect.Effect<Option.Option<string>, SuiRpcError, SuiGraphQL> {
  const type = `${misoPackageId}::composition::Composition<${shareType}>`;
  return firstAddressOfType(type);
}

export const getCompositionAdminCapById = Effect.fn("getCompositionAdminCapById")(function* (
  adminCapId: string,
): Effect.fn.Return<CompositionAdminCap, ObjectNotFoundError | SuiRpcError, SuiClient> {
  const type = yield* getObjectType(adminCapId);
  return new CompositionAdminCap({ id: adminCapId, shareType: extractTypeParam(type) });
});

/**
 * Composition admin caps owned by `owner`.
 *
 * Core API (no GraphQL): `listOwnedObjects` takes a type filter and returns each
 * object's instantiated `type`, so the share type is read straight off
 * `CompositionAdminCap<CompositionShare>` with no second round-trip.
 */
export const getOwnedCompositionAdminCaps = Effect.fn("getOwnedCompositionAdminCaps")(function* (
  owner: string,
  misoPackageId: string,
): Effect.fn.Return<CompositionAdminCap[], SuiRpcError, SuiClient> {
  const capType = `${misoPackageId}::composition::CompositionAdminCap`;
  const objects = yield* listAllOwnedObjects({ owner, type: capType });
  const caps: CompositionAdminCap[] = [];
  for (const obj of objects) {
    const match = obj.type?.match(/<(.+)>$/);
    if (match?.[1]) caps.push(new CompositionAdminCap({ id: obj.objectId, shareType: match[1] }));
  }
  return caps;
});

export function deriveCompositionAdminCapId(compositionId: string, misoPackageId: string): string {
  return deriveObjectID(
    compositionId,
    `${misoPackageId}::composition::CompositionAdminCapKey`,
    UNIT_STRUCT_KEY_BYTES,
  );
}

// ============================================================================
// Recording
// ============================================================================

export const getRecordingsByIds = Effect.fn("getRecordingsByIds")(function* (
  recordingIds: string[],
): Effect.fn.Return<Record<string, Recording>, SuiRpcError | BcsDecodeError, SuiClient> {
  if (recordingIds.length === 0) return {};
  const contents = yield* getObjectsContent(recordingIds);
  const decoded = yield* Effect.forEach(
    [...contents.entries()],
    ([objectId, { content }]) =>
      decodeBcs(
        { parse: (bytes) => mapRecording(objectId, RecordingBcs.parse(bytes)) },
        Recording,
        content,
        { type: "Recording", objectId },
      ).pipe(Effect.map((recording) => [objectId, recording] as const)),
    { concurrency: "unbounded" },
  );
  return Object.fromEntries(decoded);
});

export function getRecordingById(
  recordingId: string,
): Effect.Effect<Recording, ObjectNotFoundError | SuiRpcError | BcsDecodeError, SuiClient> {
  return getObjectByBcs(
    recordingId,
    { parse: (bytes) => mapRecording(recordingId, RecordingBcs.parse(bytes)) },
    Recording,
    "Recording",
  );
}

/**
 * The recording's OWN share type (`RecordingShare`). `Recording` is generic over
 * two phantoms — `Recording<RecordingShare, CompositionShare>` — so this splits
 * them and returns the first; use {@link getRecordingShareTypes} when the
 * parent composition's share type is needed too.
 */
export const getRecordingShareType = Effect.fn("getRecordingShareType")(function* (
  recordingId: string,
): Effect.fn.Return<string, ObjectNotFoundError | SuiRpcError, SuiClient> {
  const [recordingShareType] = yield* getRecordingShareTypes(recordingId);
  return recordingShareType;
});

/**
 * Both of a recording's share types, as `[RecordingShare, CompositionShare]`.
 * Most builders need the pair — `track::new`, `recording::publish`
 * and the recording credit/pool extensions are all generic over both, in this
 * order.
 */
export const getRecordingShareTypes = Effect.fn("getRecordingShareTypes")(function* (
  recordingId: string,
): Effect.fn.Return<[string, string], ObjectNotFoundError | SuiRpcError, SuiClient> {
  const type = yield* getObjectType(recordingId);
  return extractTypeParams2(type);
});

export const getRecordingByShareType = Effect.fn("getRecordingByShareType")(function* (
  shareType: string,
  misoPackageId: string,
): Effect.fn.Return<Recording, ObjectNotFoundError | SuiRpcError | BcsDecodeError, SuiClient | SuiGraphQL> {
  const address = yield* addressOfRecordingWithShareType(misoPackageId, shareType);
  if (Option.isNone(address)) {
    return yield* new ObjectNotFoundError({ objectId: `recording::Recording<${shareType}, ...>` });
  }
  return yield* getRecordingById(address.value);
});

export const getRecordingAdminCapById = Effect.fn("getRecordingAdminCapById")(function* (
  adminCapId: string,
): Effect.fn.Return<RecordingAdminCap, ObjectNotFoundError | SuiRpcError, SuiClient> {
  const type = yield* getObjectType(adminCapId);
  return new RecordingAdminCap({ id: adminCapId, shareType: extractTypeParam(type) });
});

/**
 * Recording admin caps owned by `owner`.
 *
 * Core API (no GraphQL), same shape as {@link getOwnedCompositionAdminCaps}.
 * Note `RecordingAdminCap<phantom RecordingShare>` is deliberately single-param,
 * so this yields only the recording's own share type — its parent composition's
 * share type is not recoverable from the cap alone.
 */
export const getOwnedRecordingAdminCaps = Effect.fn("getOwnedRecordingAdminCaps")(function* (
  owner: string,
  misoPackageId: string,
): Effect.fn.Return<RecordingAdminCap[], SuiRpcError, SuiClient> {
  const capType = `${misoPackageId}::recording::RecordingAdminCap`;
  const objects = yield* listAllOwnedObjects({ owner, type: capType });
  const caps: RecordingAdminCap[] = [];
  for (const obj of objects) {
    const match = obj.type?.match(/<(.+)>$/);
    if (match?.[1]) caps.push(new RecordingAdminCap({ id: obj.objectId, shareType: match[1] }));
  }
  return caps;
});

export function deriveRecordingAdminCapId(recordingId: string, misoPackageId: string): string {
  return deriveObjectID(recordingId, `${misoPackageId}::recording::RecordingAdminCapKey`, UNIT_STRUCT_KEY_BYTES);
}

// ============================================================================
// Release
// ============================================================================

export const getReleasesByIds = Effect.fn("getReleasesByIds")(function* (
  releaseIds: string[],
): Effect.fn.Return<Record<string, Release>, SuiRpcError | BcsDecodeError, SuiClient> {
  if (releaseIds.length === 0) return {};
  const contents = yield* getObjectsContent(releaseIds);
  const decoded = yield* Effect.forEach(
    [...contents.entries()],
    ([objectId, { content }]) =>
      decodeBcs(
        { parse: (bytes) => mapRelease(objectId, ReleaseBcs.parse(bytes)) },
        Release,
        content,
        { type: "Release", objectId },
      ).pipe(Effect.map((release) => [objectId, release] as const)),
    { concurrency: "unbounded" },
  );
  return Object.fromEntries(decoded);
});

export function getReleaseById(
  releaseId: string,
): Effect.Effect<Release, ObjectNotFoundError | SuiRpcError | BcsDecodeError, SuiClient> {
  return getObjectByBcs(
    releaseId,
    { parse: (bytes) => mapRelease(releaseId, ReleaseBcs.parse(bytes)) },
    Release,
    "Release",
  );
}

export const getReleaseAdminCapById = Effect.fn("getReleaseAdminCapById")(function* (
  adminCapId: string,
): Effect.fn.Return<ReleaseAdminCap, ObjectNotFoundError | SuiRpcError, SuiClient> {
  const client = yield* SuiClient;
  const { object } = yield* Effect.tryPromise({
    try: (signal) => client.core.getObject({ objectId: adminCapId, include: { json: true }, signal }),
    catch: (cause) => classifyMissing(adminCapId, "getObject", cause),
  });
  const json = object.json as { release_id: string } | null;
  if (!json?.release_id) {
    return yield* new ObjectNotFoundError({ objectId: adminCapId });
  }
  return new ReleaseAdminCap({ id: adminCapId, releaseId: json.release_id });
});

export const getOwnedReleaseAdminCaps = Effect.fn("getOwnedReleaseAdminCaps")(function* (
  owner: string,
  misoPackageId: string,
): Effect.fn.Return<ReleaseAdminCap[], SuiRpcError, SuiClient> {
  const capType = `${misoPackageId}::release::ReleaseAdminCap`;
  const objects = yield* listAllOwnedObjects({ owner, type: capType, include: { json: true } });
  const caps: ReleaseAdminCap[] = [];
  for (const obj of objects) {
    const json = obj.json as { release_id: string } | null;
    if (json?.release_id) caps.push(new ReleaseAdminCap({ id: obj.objectId, releaseId: json.release_id }));
  }
  return caps;
});

export function deriveReleaseAdminCapId(releaseId: string, misoPackageId: string): string {
  return deriveObjectID(releaseId, `${misoPackageId}::release::ReleaseAdminCapKey`, UNIT_STRUCT_KEY_BYTES);
}

// ============================================================================
// Share Currency
// ============================================================================

/** Extracts the share type `T` from a `Currency<T>` object. */
export const getShareCurrencyType = Effect.fn("getShareCurrencyType")(function* (
  shareCurrencyId: string,
): Effect.fn.Return<string, ObjectNotFoundError | SuiRpcError, SuiClient> {
  const type = yield* getObjectType(shareCurrencyId);
  return extractTypeParam(type);
});

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
 * const shareType = yield* getShareCurrencyType(shareCurrencyId);
 * const capId = yield* getShareCurrencyTreasuryCap(shareType, owner);
 * ```
 */
export const getShareCurrencyTreasuryCap = Effect.fn("getShareCurrencyTreasuryCap")(function* (
  shareType: string,
  owner: string,
): Effect.fn.Return<string, SuiRpcError, SuiClient> {
  const objects = yield* listAllOwnedObjects({ owner, type: `0x2::coin::TreasuryCap<${shareType}>` });
  if (objects.length === 0) {
    throw new Error(`No TreasuryCap found for ${shareType} owned by ${owner}`);
  }
  return objects[0]!.objectId;
});

// ============================================================================
// Private
// ============================================================================

/** Returns the first object address of a fully-qualified type, or `Option.none()`. */
const firstAddressOfType = Effect.fn("firstAddressOfType")(function* (
  type: string,
): Effect.fn.Return<Option.Option<string>, SuiRpcError, SuiGraphQL> {
  const client = yield* SuiGraphQL;
  const result = yield* Effect.tryPromise({
    try: () => client.query({ query: AddressesByTypeQuery, variables: { type } }),
    catch: (cause) => new SuiRpcError({ operation: "addressesByType", cause }),
  });
  return Option.fromNullishOr(result.data?.objects?.nodes?.[0]?.address);
});

/**
 * Address of the `Recording` whose FIRST type parameter is `shareType`, or
 * `Option.none()`.
 *
 * `Recording<RecordingShare, CompositionShare>` takes two parameters and a type
 * filter must supply all of them or none, so filtering by
 * `Recording<${shareType}>` matches nothing. Callers generally know only the
 * recording's own share type — `RecordingAdminCap<phantom RecordingShare>` is
 * deliberately single-param — so this filters by bare type name and matches the
 * first parameter client-side. A recording's share currency is unique to it, so
 * the match is unambiguous.
 */
const addressOfRecordingWithShareType = Effect.fn("addressOfRecordingWithShareType")(function* (
  misoPackageId: string,
  shareType: string,
): Effect.fn.Return<Option.Option<string>, SuiRpcError, SuiGraphQL> {
  const client = yield* SuiGraphQL;
  let cursor: string | null | undefined;
  do {
    const result = yield* Effect.tryPromise({
      try: () =>
        client.query<{ objects?: WorkAddressConnection | null }, { type: string; cursor?: string | null }>({
          query: `query RecordingAddress($type: String!, $cursor: String) {
            objects(first: 50, after: $cursor, filter: { type: $type }) {
              pageInfo { hasNextPage endCursor }
              nodes { address asMoveObject { contents { type { repr } } } }
            }
          }`,
          variables: { type: `${misoPackageId}::recording::Recording`, cursor },
        }),
      catch: (cause) => new SuiRpcError({ operation: "recordingAddress", cause }),
    });
    const page = result.data?.objects;
    for (const node of page?.nodes ?? []) {
      const repr = node?.asMoveObject?.contents?.type?.repr;
      if (!repr || !node.address) continue;
      const [recordingShareType] = extractTypeParams2(repr);
      if (recordingShareType === shareType) return Option.some(node.address);
    }
    cursor = page?.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return Option.none();
});
