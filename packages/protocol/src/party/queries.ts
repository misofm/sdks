// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { toPromise, tryPromise } from "@misofm/utils/effect";
import { Effect } from "effect";
import { isNotFound } from "../queries.ts";
import { queryEffect, nextPageCursor } from "../query-effect.ts";

// Typed reads: fetch an on-chain object (or dynamic field) via the Core API, BCS-parse
// it through the generated struct, and map to the public camelCase types.

import type { ClientWithCoreApi, SuiClientTypes } from "@mysten/sui/client";
import { deriveDynamicFieldID, deriveObjectID, normalizeStructTag } from "@mysten/sui/utils";
import { bcs } from "@mysten/sui/bcs";
import { fromBase64 } from "@mysten/sui/utils";
import {
  MembershipKey as MembershipKeyBcs,
  Party as PartyBcs,
  PendingInviteKey as PendingInviteKeyBcs,
  PendingMembershipKey as PendingMembershipKeyBcs,
} from "../contracts/miso_party/party.ts";
import { Profile as ProfileBcs, ProfileKey as ProfileKeyBcs } from "../contracts/party_profile/party_profile.ts";
import { Media as MediaBcs, MediaKey as MediaKeyBcs } from "../contracts/party_media/party_media.ts";
import { ArtistRole as ArtistRoleBcs, RolesKey as RolesKeyBcs } from "../contracts/party_roles/party_roles.ts";
import { TagsKey as TagsKeyBcs } from "../contracts/party_tags/party_tags.ts";
import { GenresKey as GenresKeyBcs } from "../contracts/party_genre/party_genre.ts";
import { Cta as CtaBcs, CtasKey as CtasKeyBcs } from "../contracts/party_cta/party_cta.ts";
import { mapCtas, mapGenres, mapMedia, mapParty, mapProfile, mapRoles, mapTags } from "./internal.ts";
import { buildLink, platformForDataType } from "./extensions/links.ts";
import type { Party, PlatformLink } from "./types.ts";

/** True for the Core API's "object does not exist" error (a missing dynamic field). */

// A missing object (e.g. an unset profile/media dynamic field) surfaces as a
// thrown "not found" from the Core API, not an empty result — treat it as null
// so optional extensions read cleanly.
function getContentEffect(client: ClientWithCoreApi, objectId: string) {
  return queryEffect("getContent", function* () {
      const { object } = (yield* tryPromise("getContent", (signal) => client.core.getObject({ signal, objectId, include: { content: true } })));
      return object?.content ?? null;
  }).pipe(Effect.catch((error) => isNotFound(error.cause) ? Effect.succeed(null) : Effect.fail(error)));
}

/** The `Party` struct tag of one miso_party deployment. */
export function partyType(partyPackageId: string): string {
  return normalizeStructTag(`${partyPackageId}::party::Party`);
}

// A Party from another miso_party package (a previous protocol generation)
// parses identically but no deployed package accepts it, so the object's type
// is checked against the deployment before its content is trusted.
function assertPartyType(objectId: string, type: string | undefined, partyPackageId: string): void {
  const expected = partyType(partyPackageId);
  if (type === undefined || normalizeStructTag(type) !== expected) {
    throw new Error(
      `Object ${objectId} is ${type ?? "of unknown type"}, not a ${expected}` +
        (type?.endsWith("::party::Party") ? " (a Party from a different miso_party deployment)" : ""),
    );
  }
}

/** Fetches and parses a shared `Party` object of this deployment's miso_party package. */
export function getPartyByIdEffect(
  client: ClientWithCoreApi,
  partyId: string,
  partyPackageId: string,
) {
  return queryEffect("getPartyById", function* () {
    const result = yield* tryPromise("getPartyById", (signal) => client.core.getObject({ signal, objectId: partyId, include: { content: true } }))
      .pipe(Effect.catch((error) => isNotFound(error.cause) ? Effect.succeed(null) : Effect.fail(error)));
    const object = result?.object;
    if (!object?.content) throw new Error(`Party not found: ${partyId}`);
    assertPartyType(partyId, object.type, partyPackageId);
    return mapParty(partyId, PartyBcs.parse(object.content));
  });
}

export const getPartyById = toPromise(getPartyByIdEffect);

/**
 * Fetches and parses multiple shared `Party` objects in one Core request.
 * Missing objects are skipped; an object of another type is an error.
 */
export function getPartiesByIdsEffect(
  client: ClientWithCoreApi,
  partyIds: readonly string[],
  partyPackageId: string,
) {
  return queryEffect("getPartiesByIds", function* () {
    if (partyIds.length === 0) return {};
    const { objects } = (yield* tryPromise("getPartiesByIds", (signal) => client.core.getObjects({ signal,
      objectIds: [...new Set(partyIds)],
      include: { content: true },
    })));
    const parties: Partial<Record<string, Party>> = {};
    for (const obj of objects) {
      if (obj instanceof Error) continue;
      assertPartyType(obj.objectId, obj.type, partyPackageId);
      parties[obj.objectId] = mapParty(obj.objectId, PartyBcs.parse(obj.content));
    }
    return parties;
  });
}

export const getPartiesByIds = toPromise(getPartiesByIdsEffect);

/** Derives a party's `PartyAdminCap` id (it is a `derived_object` off the party UID). */
export function derivePartyAdminCapId(partyId: string, partyPackageId: string): string {
  return deriveObjectID(
    partyId,
    `${partyPackageId}::party::PartyAdminCapKey`,
    bcs.Address.serialize(partyId).toBytes(),
  );
}

// The profile is a dynamic field on the party UID under an empty `ProfileKey()`
// (Move's implicit `dummy_field: bool` → one zero byte).
const ProfileField = bcs.struct("Field", { id: bcs.Address, name: ProfileKeyBcs, value: ProfileBcs });
const PROFILE_KEY_BYTES = ProfileKeyBcs.serialize([false]).toBytes();

/** Fetches a party's profile, or null if none is set. */
export function getProfileEffect(
  client: ClientWithCoreApi,
  partyId: string,
  partyProfilePackageId: string,
) {
  return queryEffect("getProfile", function* () {
    const fieldId = deriveDynamicFieldID(
      partyId,
      `${partyProfilePackageId}::party_profile::ProfileKey`,
      PROFILE_KEY_BYTES,
    );
    const content = (yield* getContentEffect(client, fieldId));
    if (!content) return null;
    return mapProfile(partyId, ProfileField.parse(content).value);
  });
}

export const getProfile = toPromise(getProfileEffect);

// Media is a dynamic field on the party UID under an empty `MediaKey()` (same
// implicit `dummy_field: bool` → one zero byte as the profile key).
const MediaField = bcs.struct("Field", { id: bcs.Address, name: MediaKeyBcs, value: MediaBcs });
const MEDIA_KEY_BYTES = MediaKeyBcs.serialize([false]).toBytes();

/** Fetches a party's media (avatar + header), or null if none is set. */
export function getMediaEffect(
  client: ClientWithCoreApi,
  partyId: string,
  partyMediaPackageId: string,
) {
  return queryEffect("getMedia", function* () {
    const fieldId = deriveDynamicFieldID(
      partyId,
      `${partyMediaPackageId}::party_media::MediaKey`,
      MEDIA_KEY_BYTES,
    );
    const content = (yield* getContentEffect(client, fieldId));
    if (!content) return null;
    return mapMedia(partyId, MediaField.parse(content).value);
  });
}

export const getMedia = toPromise(getMediaEffect);

// === Collection extension reads (roles / tags / genres / ctas) ===
//
// Each is a single dynamic field on the party UID under an empty positional key
// (Move's implicit `dummy_field: bool` → one zero byte, same as the profile key).

const ROLES_KEY_BYTES = RolesKeyBcs.serialize([false]).toBytes();
const RolesField = bcs.struct("Field", { id: bcs.Address, name: RolesKeyBcs, value: bcs.vector(ArtistRoleBcs) });

/** The party's artist-type roles (display names), or `[]` if none are set. */
export function getRolesEffect(
  client: ClientWithCoreApi,
  partyId: string,
  partyRolesPackageId: string,
) {
  return queryEffect("getRoles", function* () {
    const fieldId = deriveDynamicFieldID(partyId, `${partyRolesPackageId}::party_roles::RolesKey`, ROLES_KEY_BYTES);
    const content = (yield* getContentEffect(client, fieldId));
    if (!content) return [];
    return mapRoles(RolesField.parse(content).value);
  });
}

export const getRoles = toPromise(getRolesEffect);

const TAGS_KEY_BYTES = TagsKeyBcs.serialize([false]).toBytes();
const TagsField = bcs.struct("Field", { id: bcs.Address, name: TagsKeyBcs, value: bcs.vector(bcs.string()) });

/** The party's free-form tags, or `[]` if none are set. */
export function getTagsEffect(
  client: ClientWithCoreApi,
  partyId: string,
  partyTagsPackageId: string,
) {
  return queryEffect("getTags", function* () {
    const fieldId = deriveDynamicFieldID(partyId, `${partyTagsPackageId}::party_tags::TagsKey`, TAGS_KEY_BYTES);
    const content = (yield* getContentEffect(client, fieldId));
    if (!content) return [];
    return mapTags(TagsField.parse(content).value);
  });
}

export const getTags = toPromise(getTagsEffect);

const GENRES_KEY_BYTES = GenresKeyBcs.serialize([false]).toBytes();
const GenresField = bcs.struct("Field", { id: bcs.Address, name: GenresKeyBcs, value: bcs.vector(bcs.Address) });

/** The party's genre object ids, or `[]` if none are set. */
export function getGenresEffect(
  client: ClientWithCoreApi,
  partyId: string,
  partyGenrePackageId: string,
) {
  return queryEffect("getGenres", function* () {
    const fieldId = deriveDynamicFieldID(partyId, `${partyGenrePackageId}::party_genre::GenresKey`, GENRES_KEY_BYTES);
    const content = (yield* getContentEffect(client, fieldId));
    if (!content) return [];
    return mapGenres(GenresField.parse(content).value);
  });
}

export const getGenres = toPromise(getGenresEffect);

const CTAS_KEY_BYTES = CtasKeyBcs.serialize([false]).toBytes();
// The CTA field's value is a bare `vector<Cta>` (not a wrapper struct).
const CtasField = bcs.struct("Field", { id: bcs.Address, name: CtasKeyBcs, value: bcs.vector(CtaBcs) });

/** The party's ordered CTA list (position is priority), or `[]` if none is set. */
export function getCtasEffect(
  client: ClientWithCoreApi,
  partyId: string,
  partyCtaPackageId: string,
) {
  return queryEffect("getCtas", function* () {
    const fieldId = deriveDynamicFieldID(partyId, `${partyCtaPackageId}::party_cta::CtasKey`, CTAS_KEY_BYTES);
    const content = (yield* getContentEffect(client, fieldId));
    if (!content) return [];
    return mapCtas(CtasField.parse(content).value);
  });
}

export const getCtas = toPromise(getCtasEffect);

// === Platform-link reads ===
//
// Each platform is an independent `PlatformLink<Data>` dynamic field keyed by
// `platform_link::PlatformLinkKey<Data>`. There is no single key to derive, so
// enumerate the party's dynamic fields and pick out the platform-link ones,
// identifying the platform from the `Data` type argument. Every payload `Data`
// type is a single-`String` newtype, so `PlatformLink<Data>` serializes exactly
// as one BCS string — parse the field value as such.
const PlatformLinkField = bcs.struct("Field", { id: bcs.Address, name: bcs.bool(), value: bcs.string() });
const PLATFORM_LINK_KEY_RE = /::platform_link::PlatformLinkKey<(.+)>$/;

/** All external-platform links attached to a party (social, music, professional). */
export function getLinksEffect(client: ClientWithCoreApi, partyId: string) {
  return queryEffect("getLinks", function* () {
    const links: PlatformLink[] = [];
    const fields = yield* listDynamicFieldsEffect(client, partyId);
    for (const f of fields) {
      if (typeof f.name?.type !== "string") continue;
      const match = f.name.type.match(PLATFORM_LINK_KEY_RE);
      const dataType = match?.[1];
      if (!dataType) continue;
      const platform = platformForDataType(dataType);
      if (!platform) continue;
      const content = yield* getContentEffect(client, f.fieldId);
      if (!content) continue;
      links.push(buildLink(platform, PlatformLinkField.parse(content).value));
    }
    return links;
  });
}

export const getLinks = toPromise(getLinksEffect);

// === Group membership reads ===

/** Normalizes a dynamic-field key's BCS bytes (Uint8Array or base64 string). */
function keyBytes(bcs: Uint8Array | string): Uint8Array {
  return typeof bcs === "string" ? fromBase64(bcs) : bcs;
}

function getMembershipKeysEffect(client: ClientWithCoreApi, parentId: string, key: string, codec: { parse(bytes: Uint8Array): [string] }) {
  return queryEffect("getMembershipKeys", function* () {
    const ids: string[] = [];
    const fields = yield* listDynamicFieldsEffect(client, parentId);
    for (const field of fields) {
      if (field.name.type.endsWith(`::party::${key}`)) ids.push(codec.parse(keyBytes(field.name.bcs))[0]);
    }
    return ids;
  });
}

function listDynamicFieldsEffect(client: ClientWithCoreApi, parentId: string) {
  return queryEffect("listDynamicFields", function* () {
    const fields: SuiClientTypes.DynamicFieldEntry[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const page = yield* tryPromise("listDynamicFields", (signal) => client.core.listDynamicFields({ signal, parentId, cursor }));
      fields.push(...page.dynamicFields);
      cursor = nextPageCursor(page.hasNextPage, page.cursor, cursor);
      if (cursor && seen.has(cursor)) throw new Error("Pagination repeated a cursor");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return fields;
  });
}

/**
 * The group ids a party currently belongs to, read from its `MembershipKey`
 * dynamic fields (the member-side record). No indexer required.
 */
export function getMembershipsEffect(client: ClientWithCoreApi, partyId: string) {
  return getMembershipKeysEffect(client, partyId, "MembershipKey", MembershipKeyBcs);
}

export const getMemberships = toPromise(getMembershipsEffect);

/** The member ids invited to a group but not yet accepted (its `PendingInviteKey` fields). */
export function getPendingInvitesEffect(client: ClientWithCoreApi, groupId: string) {
  return getMembershipKeysEffect(client, groupId, "PendingInviteKey", PendingInviteKeyBcs);
}

export const getPendingInvites = toPromise(getPendingInvitesEffect);

/**
 * The group ids that have invited a party but are still awaiting its response.
 * This reads the member-side `PendingMembershipKey` inbox index, so it only
 * enumerates the target party's dynamic fields.
 */
export function getPendingMembershipsEffect(client: ClientWithCoreApi, partyId: string) {
  return getMembershipKeysEffect(client, partyId, "PendingMembershipKey", PendingMembershipKeyBcs);
}

export const getPendingMemberships = toPromise(getPendingMembershipsEffect);

/** Whether `memberId` currently holds a membership record for `groupId`. */
export function isMemberEffect(
  client: ClientWithCoreApi,
  memberId: string,
  groupId: string,
  partyPackageId: string,
) {
  return queryEffect("isMember", function* () {
    const fieldId = deriveDynamicFieldID(
      memberId,
      `${partyPackageId}::party::MembershipKey`,
      MembershipKeyBcs.serialize([groupId]).toBytes(),
    );
    return ((yield* getContentEffect(client, fieldId))) !== null;
  });
}

export const isMember = toPromise(isMemberEffect);
