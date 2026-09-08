// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Typed reads: fetch an on-chain object (or dynamic field) via the Core API, BCS-parse
// it through the generated struct, and map to the public camelCase types. Every read
// requires the `SuiClient` service (see `@misofm/effect`) instead of taking a client
// parameter; not-found and type-mismatch paths are typed failures, not thrown errors.

import { Effect, Option, Stream } from "effect";
import { deriveDynamicFieldID, deriveObjectID, normalizeStructTag } from "@mysten/sui/utils";
import { bcs } from "@mysten/sui/bcs";
import {
  assertObjectType,
  decodeBcs,
  getObjectContent,
  getObjectsContent,
  getOptionalObjectContent,
  listDynamicFields,
  type SuiClient,
} from "@misofm/effect";
import type { BcsDecodeError, ObjectNotFoundError, ObjectTypeMismatchError, SuiRpcError } from "@misofm/effect";
import {
  MembershipKey as MembershipKeyBcs,
  Party as PartyBcs,
  PendingInviteKey as PendingInviteKeyBcs,
  PendingMembershipKey as PendingMembershipKeyBcs,
} from "./contracts/partyos/party.ts";
import { keyBytes, mapParty } from "./internal.ts";
import { Party } from "./types.ts";

/** The `Party` struct tag of one partyos deployment. */
export function partyType(partyPackageId: string): string {
  return normalizeStructTag(`${partyPackageId}::party::Party`);
}

/** Decodes one object's BCS content into a `Party`, mapping the generated parse output first. */
function decodeParty(objectId: string, content: Uint8Array, expectedType: string) {
  return decodeBcs(
    { parse: (bytes) => mapParty(objectId, PartyBcs.parse(bytes)) },
    Party,
    content,
    { type: expectedType, objectId },
  );
}

/** Fetches and parses a shared `Party` object of this deployment's partyos package. */
export const getPartyById = Effect.fn("getPartyById")(function* (
  partyId: string,
  partyPackageId: string,
): Effect.fn.Return<
  Party,
  ObjectNotFoundError | ObjectTypeMismatchError | BcsDecodeError | SuiRpcError,
  SuiClient
> {
  const expected = partyType(partyPackageId);
  const object = yield* getObjectContent(partyId);
  // A Party from another partyos package (a previous generation) parses
  // identically but no deployed package accepts it, so the object's type is
  // checked against the deployment before its content is trusted.
  yield* assertObjectType(partyId, normalizeStructTag(object.type), expected);
  return yield* decodeParty(partyId, object.content, expected);
});

/**
 * Fetches and parses multiple shared `Party` objects in one Core request.
 * Missing objects are skipped; an object of another type is an error.
 */
export const getPartiesByIds = Effect.fn("getPartiesByIds")(function* (
  partyIds: readonly string[],
  partyPackageId: string,
): Effect.fn.Return<
  Partial<Record<string, Party>>,
  ObjectTypeMismatchError | BcsDecodeError | SuiRpcError,
  SuiClient
> {
  if (partyIds.length === 0) return {};
  const expected = partyType(partyPackageId);
  const contentById = yield* getObjectsContent([...new Set(partyIds)]);
  const parties: Partial<Record<string, Party>> = {};
  for (const [objectId, { content, type }] of contentById) {
    yield* assertObjectType(objectId, normalizeStructTag(type), expected);
    parties[objectId] = yield* decodeParty(objectId, content, expected);
  }
  return parties;
});

/** Derives a party's `PartyAdminCap` id (it is a `derived_object` off the party UID). */
export function derivePartyAdminCapId(partyId: string, partyPackageId: string): string {
  return deriveObjectID(
    partyId,
    `${partyPackageId}::party::PartyAdminCapKey`,
    bcs.Address.serialize(partyId).toBytes(),
  );
}

// === Group membership reads ===

/** Collects the ids stored in every dynamic-field key of `parentId` whose type ends with `keySuffix`. */
function collectKeyIds(
  parentId: string,
  keySuffix: string,
  codec: { parse(bytes: Uint8Array): readonly unknown[] },
): Effect.Effect<string[], SuiRpcError, SuiClient> {
  return listDynamicFields(parentId).pipe(
    Stream.filter((f) => typeof f.name?.type === "string" && f.name.type.endsWith(keySuffix) && f.name.bcs != null),
    Stream.map((f) => {
      const [id] = codec.parse(keyBytes(f.name!.bcs));
      return String(id);
    }),
    Stream.runCollect,
    Effect.map((chunk) => Array.from(chunk)),
  );
}

/**
 * The group ids a party currently belongs to, read from its `MembershipKey`
 * dynamic fields (the member-side record). No indexer required.
 */
export function getMemberships(partyId: string): Effect.Effect<string[], SuiRpcError, SuiClient> {
  return collectKeyIds(partyId, "::party::MembershipKey", MembershipKeyBcs);
}

/** The member ids invited to a group but not yet accepted (its `PendingInviteKey` fields). */
export function getPendingInvites(groupId: string): Effect.Effect<string[], SuiRpcError, SuiClient> {
  return collectKeyIds(groupId, "::party::PendingInviteKey", PendingInviteKeyBcs);
}

/**
 * The group ids that have invited a party but are still awaiting its response.
 * This reads the member-side `PendingMembershipKey` inbox index, so it only
 * enumerates the target party's dynamic fields.
 */
export function getPendingMemberships(partyId: string): Effect.Effect<string[], SuiRpcError, SuiClient> {
  return collectKeyIds(partyId, "::party::PendingMembershipKey", PendingMembershipKeyBcs);
}

/** Whether `memberId` currently holds a membership record for `groupId`. */
export const isMember = Effect.fn("isMember")(function* (
  memberId: string,
  groupId: string,
  partyPackageId: string,
): Effect.fn.Return<boolean, SuiRpcError, SuiClient> {
  const fieldId = deriveDynamicFieldID(
    memberId,
    `${partyPackageId}::party::MembershipKey`,
    MembershipKeyBcs.serialize([groupId]).toBytes(),
  );
  const content = yield* getOptionalObjectContent(fieldId);
  return Option.isSome(content);
});
