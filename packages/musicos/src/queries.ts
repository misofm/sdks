// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// GraphQL type-discovery reads: resolving a share type to the work object
// that carries it, which the Core API cannot express (a type filter needs
// either every type parameter or none — see the comments below). Kept on
// `sui-effect`'s bare `SuiGraphQL` tag rather than folded into the `Musicos`
// service, per the amendment to misofm/sdks#34 after scoping: `Musicos.layer`
// requires only `Sui`, and these three reads are the package's only callers
// of GraphQL, so they stay standalone `Effect<A, E, Sui | SuiGraphQL>`
// functions a consumer composes in.
//
// Everything else this module used to hold — the single-object Core reads —
// is now `Musicos` service members (`src/Musicos.ts`). `extractTypeParam(s2)`
// stays here re-exported from `./type-params.ts`, because platform still
// imports it from this subpath.

import { graphql } from "@mysten/sui/graphql/schema";
import { Effect, Option } from "effect";
import {
  GraphQLUnavailable,
  ObjectId,
  Sui,
  SuiGraphQL,
  TransportError,
  type DecodeError,
  type ObjectDeleted,
  type ObjectNotFound,
  type ObjectUnavailable,
} from "sui-effect";
import { MusicosWorkNotFound } from "./errors.ts";
import * as schema from "./schema.ts";
import { Composition, Recording } from "./types.ts";
import { extractTypeParams2 } from "./type-params.ts";

export { extractTypeParam, extractTypeParams2 } from "./type-params.ts";
/** @deprecated Kept for platform's own event codecs; see `./events.ts`. */
export type { BcsParser } from "./events.ts";

/**
 * `GraphQLUnavailable` lets through, not folded into `TransportError`: under
 * `SuiGraphQL.layerUnavailable` every call rejects with the same
 * `GraphQLUnavailable` instance, and a caller that wants to tell "no endpoint
 * configured" apart from "the endpoint answered badly" needs to see the
 * real tag rather than have it stand behind `cause`.
 */
const graphqlError = (method: string) => (cause: unknown): GraphQLUnavailable | TransportError =>
  cause instanceof GraphQLUnavailable ? cause : TransportError.fromUnknown(method, cause);

/**
 * `extractTypeParams2` throws on a repr with only one top-level type
 * parameter. A live object whose type does not match the deployed Recording
 * ABI is not this read's problem to fail on — skip it — but skip it the same
 * way everywhere this file does the skipping, rather than one call site
 * swallowing the throw and another letting it become a defect.
 */
function tryRecordingShareType(repr: string): string | undefined {
  try {
    return extractTypeParams2(repr)[0];
  } catch {
    return undefined;
  }
}

// ============================================================================
// GraphQL discovery queries
// ============================================================================

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
 *
 * Fails with: `GraphQLUnavailable`, `TransportError`.
 */
export const getWorkAddressesByShareTypes = Effect.fn("Musicos.getWorkAddressesByShareTypes")(function* (
  shareTypes: WorkShareTypes,
  packageId: string,
): Effect.fn.Return<WorkAddressesByShareType, GraphQLUnavailable | TransportError, SuiGraphQL> {
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
    selections.push(`composition${index}: objects(first: 1, filter: { type: $${variable} }) { nodes { address } }`);
    variables[variable] = `${packageId}::composition::Composition<${shareType}>`;
  });

  if (recordings.size > 0) {
    declarations.push("$recordingType: String!");
    selections.push(`recordings: objects(first: 50, filter: { type: $recordingType }) {
      pageInfo { hasNextPage endCursor }
      nodes { address asMoveObject { contents { type { repr } } } }
    }`);
    variables.recordingType = `${packageId}::recording::Recording`;
  }

  const result = yield* Effect.tryPromise({
    try: () =>
      client.query<Record<string, WorkAddressConnection | null>, Record<string, string>>({
        query: `query WorkAddressesByShareTypes(${declarations.join(", ")}) {
          ${selections.join("\n")}
        }`,
        variables,
      }),
    catch: graphqlError("musicos.getWorkAddressesByShareTypes"),
  });
  if (result.errors?.length) {
    return yield* TransportError.fromUnknown(
      "musicos.getWorkAddressesByShareTypes",
      new AggregateError(result.errors.map((error) => new Error(error.message)), "Work type discovery failed"),
    );
  }

  compositions.forEach((shareType, index) => {
    const address = result.data?.[`composition${index}`]?.nodes[0]?.address;
    if (address) out.compositions[shareType] = address;
  });

  const skippedReprs: string[] = [];
  const readRecordingPage = (page: WorkAddressConnection | null | undefined) => {
    for (const node of page?.nodes ?? []) {
      const repr = node.asMoveObject?.contents?.type?.repr;
      if (!repr) continue;
      const recordingShareType = tryRecordingShareType(repr);
      if (recordingShareType === undefined) {
        skippedReprs.push(repr);
        continue;
      }
      if (recordings.has(recordingShareType)) {
        out.recordings[recordingShareType] = node.address;
      }
    }
  };

  let recordingPage = result.data?.recordings;
  readRecordingPage(recordingPage);
  while (recordingPage?.pageInfo?.hasNextPage && recordingPage.pageInfo.endCursor && Object.keys(out.recordings).length < recordings.size) {
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
      catch: graphqlError("musicos.getWorkAddressesByShareTypes"),
    });
    if (next.errors?.length) {
      return yield* TransportError.fromUnknown(
        "musicos.getWorkAddressesByShareTypes",
        new AggregateError(next.errors.map((error) => new Error(error.message)), "Recording type discovery failed"),
      );
    }
    recordingPage = next.data?.recordings;
    readRecordingPage(recordingPage);
  }

  if (skippedReprs.length > 0) {
    yield* Effect.logDebug(
      `musicos.getWorkAddressesByShareTypes: skipped ${skippedReprs.length} Recording object(s) whose type did not match the deployed ABI`,
      { reprs: skippedReprs },
    );
  }

  return out;
});

/** Returns the first object address of a fully-qualified type, or `Option.none()`. Fails with: `GraphQLUnavailable`, `TransportError`. */
const firstAddressOfType = Effect.fn("Musicos.firstAddressOfType")(function* (
  type: string,
): Effect.fn.Return<Option.Option<string>, GraphQLUnavailable | TransportError, SuiGraphQL> {
  const client = yield* SuiGraphQL;
  const result = yield* Effect.tryPromise({
    try: () => client.query({ query: AddressesByTypeQuery, variables: { type } }),
    catch: graphqlError("musicos.firstAddressOfType"),
  });
  return Option.fromNullishOr(result.data?.objects?.nodes?.[0]?.address);
});

/**
 * Address of the `Recording` whose FIRST type parameter is `shareType`, or
 * `Option.none()`. Fails with: `GraphQLUnavailable`, `TransportError`.
 *
 * `Recording<RecordingShare, CompositionShare>` takes two parameters and a
 * type filter must supply all of them or none, so filtering by
 * `Recording<${shareType}>` matches nothing. Callers generally know only the
 * recording's own share type, so this filters by bare type name and matches
 * the first parameter client-side. A recording's share currency is unique to
 * it, so the match is unambiguous.
 */
const addressOfRecordingWithShareType = Effect.fn("Musicos.addressOfRecordingWithShareType")(function* (
  packageId: string,
  shareType: string,
): Effect.fn.Return<Option.Option<string>, GraphQLUnavailable | TransportError, SuiGraphQL> {
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
          variables: { type: `${packageId}::recording::Recording`, cursor },
        }),
      catch: graphqlError("musicos.addressOfRecordingWithShareType"),
    });
    const page = result.data?.objects;
    for (const node of page?.nodes ?? []) {
      const repr = node?.asMoveObject?.contents?.type?.repr;
      if (!repr || !node.address) continue;
      const recordingShareType = tryRecordingShareType(repr);
      if (recordingShareType === undefined) {
        yield* Effect.logDebug(
          "musicos.addressOfRecordingWithShareType: skipped a Recording object whose type did not match the deployed ABI",
          { repr },
        );
        continue;
      }
      if (recordingShareType === shareType) return Option.some(node.address);
    }
    cursor = page?.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return Option.none();
});

/** Fetches a composition by its share type (GraphQL discovery + `Sui` read). Fails with: `musicos/WorkNotFound` (no composition carries `shareType`), `GraphQLUnavailable`, `TransportError` (also `ObjectNotFound`, `ObjectDeleted`, `ObjectUnavailable`, `DecodeError` from the follow-up read). */
export const getCompositionByShareType = Effect.fn("Musicos.getCompositionByShareType")(function* (
  shareType: string,
  packageId: string,
): Effect.fn.Return<
  Composition,
  MusicosWorkNotFound | GraphQLUnavailable | ObjectNotFound | ObjectDeleted | ObjectUnavailable | DecodeError | TransportError,
  Sui | SuiGraphQL
> {
  const address = yield* firstAddressOfType(`${packageId}::composition::Composition<${shareType}>`);
  if (Option.isNone(address)) {
    return yield* new MusicosWorkNotFound({ kind: "composition", shareType });
  }
  const sui = yield* Sui;
  const object = yield* sui.getObject(ObjectId.make(address.value), { schema: schema.compositionContent(packageId) });
  return object.content;
});

/** Fetches a recording by its own (`RecordingShare`) share type. Fails with: `musicos/WorkNotFound` (no recording carries `shareType`), `GraphQLUnavailable`, `TransportError` (also `ObjectNotFound`, `ObjectDeleted`, `ObjectUnavailable`, `DecodeError` from the follow-up read). */
export const getRecordingByShareType = Effect.fn("Musicos.getRecordingByShareType")(function* (
  shareType: string,
  packageId: string,
): Effect.fn.Return<
  Recording,
  MusicosWorkNotFound | GraphQLUnavailable | ObjectNotFound | ObjectDeleted | ObjectUnavailable | DecodeError | TransportError,
  Sui | SuiGraphQL
> {
  const address = yield* addressOfRecordingWithShareType(packageId, shareType);
  if (Option.isNone(address)) {
    return yield* new MusicosWorkNotFound({ kind: "recording", shareType });
  }
  const sui = yield* Sui;
  const object = yield* sui.getObject(ObjectId.make(address.value), { schema: schema.recordingContent(packageId) });
  return object.content;
});
