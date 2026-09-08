// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Typed reads: fetch an on-chain object (or dynamic field) via the Core API, BCS-parse
// it through the generated struct, and map to the public camelCase types.

import type { ClientWithCoreApi } from "@mysten/sui/client";
import { deriveDynamicFieldID, deriveObjectID, normalizeStructTag } from "@mysten/sui/utils";
import { bcs } from "@mysten/sui/bcs";
import {
  MembershipKey as MembershipKeyBcs,
  Party as PartyBcs,
  PendingInviteKey as PendingInviteKeyBcs,
  PendingMembershipKey as PendingMembershipKeyBcs,
} from "./contracts/partyos/party.ts";
import { keyBytes, mapParty } from "./internal.ts";
import type { Party } from "./types.ts";

/** True for the Core API's "object does not exist" error (a missing dynamic field). */
export function isNotFound(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /not\s*found|does not exist|no object/i.test(msg);
}

/**
 * Reads an object's BCS content, or null when it does not exist. A missing
 * object (e.g. an unset dynamic field) surfaces as a thrown "not found" from the
 * Core API, not an empty result, so optional reads can treat it as absence.
 */
export async function getObjectContent(client: ClientWithCoreApi, objectId: string): Promise<Uint8Array | null> {
  try {
    const { object } = await client.core.getObject({ objectId, include: { content: true } });
    return object?.content ?? null;
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

/** The `Party` struct tag of one partyos deployment. */
export function partyType(partyPackageId: string): string {
  return normalizeStructTag(`${partyPackageId}::party::Party`);
}

// A Party from another partyos package (a previous generation) parses
// identically but no deployed package accepts it, so the object's type is
// checked against the deployment before its content is trusted.
function assertPartyType(objectId: string, type: string | undefined, partyPackageId: string): void {
  const expected = partyType(partyPackageId);
  if (type === undefined || normalizeStructTag(type) !== expected) {
    throw new Error(
      `Object ${objectId} is ${type ?? "of unknown type"}, not a ${expected}` +
        (type?.endsWith("::party::Party") ? " (a Party from a different partyos deployment)" : ""),
    );
  }
}

/** Fetches and parses a shared `Party` object of this deployment's partyos package. */
export async function getPartyById(
  client: ClientWithCoreApi,
  partyId: string,
  partyPackageId: string,
): Promise<Party> {
  let object;
  try {
    ({ object } = await client.core.getObject({ objectId: partyId, include: { content: true } }));
  } catch (e) {
    if (isNotFound(e)) throw new Error(`Party not found: ${partyId}`);
    throw e;
  }
  if (!object?.content) throw new Error(`Party not found: ${partyId}`);
  assertPartyType(partyId, object.type, partyPackageId);
  return mapParty(partyId, PartyBcs.parse(object.content));
}

/**
 * Fetches and parses multiple shared `Party` objects in one Core request.
 * Missing objects are skipped; an object of another type is an error.
 */
export async function getPartiesByIds(
  client: ClientWithCoreApi,
  partyIds: readonly string[],
  partyPackageId: string,
): Promise<Partial<Record<string, Party>>> {
  if (partyIds.length === 0) return {};
  const { objects } = await client.core.getObjects({
    objectIds: [...new Set(partyIds)],
    include: { content: true },
  });
  const parties: Partial<Record<string, Party>> = {};
  for (const obj of objects) {
    if (obj instanceof Error) continue;
    assertPartyType(obj.objectId, obj.type, partyPackageId);
    parties[obj.objectId] = mapParty(obj.objectId, PartyBcs.parse(obj.content));
  }
  return parties;
}

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
async function collectKeyIds(
  client: ClientWithCoreApi,
  parentId: string,
  keySuffix: string,
  codec: { parse(bytes: Uint8Array): readonly unknown[] },
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await client.core.listDynamicFields({ parentId, cursor: cursor ?? undefined });
    for (const f of page.dynamicFields) {
      if (typeof f.name?.type === "string" && f.name.type.endsWith(keySuffix) && f.name.bcs != null) {
        const [id] = codec.parse(keyBytes(f.name.bcs));
        ids.push(String(id));
      }
    }
    cursor = page.hasNextPage ? page.cursor : null;
  } while (cursor);
  return ids;
}

/**
 * The group ids a party currently belongs to, read from its `MembershipKey`
 * dynamic fields (the member-side record). No indexer required.
 */
export async function getMemberships(client: ClientWithCoreApi, partyId: string): Promise<string[]> {
  return collectKeyIds(client, partyId, "::party::MembershipKey", MembershipKeyBcs);
}

/** The member ids invited to a group but not yet accepted (its `PendingInviteKey` fields). */
export async function getPendingInvites(client: ClientWithCoreApi, groupId: string): Promise<string[]> {
  return collectKeyIds(client, groupId, "::party::PendingInviteKey", PendingInviteKeyBcs);
}

/**
 * The group ids that have invited a party but are still awaiting its response.
 * This reads the member-side `PendingMembershipKey` inbox index, so it only
 * enumerates the target party's dynamic fields.
 */
export async function getPendingMemberships(client: ClientWithCoreApi, partyId: string): Promise<string[]> {
  return collectKeyIds(client, partyId, "::party::PendingMembershipKey", PendingMembershipKeyBcs);
}

/** Whether `memberId` currently holds a membership record for `groupId`. */
export async function isMember(
  client: ClientWithCoreApi,
  memberId: string,
  groupId: string,
  partyPackageId: string,
): Promise<boolean> {
  const fieldId = deriveDynamicFieldID(
    memberId,
    `${partyPackageId}::party::MembershipKey`,
    MembershipKeyBcs.serialize([groupId]).toBytes(),
  );
  return (await getObjectContent(client, fieldId)) !== null;
}
