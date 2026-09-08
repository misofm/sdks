// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Typed reads for the Party EXTENSIONS: fetch an on-chain dynamic field via the
// Core API, BCS-parse it through the generated struct, and map to the public
// camelCase types. Party core reads (`getPartyById`, group membership, …) live
// in `@misofm/partyos` — this file only covers profile/media/roles/tags/genres/
// ctas/links.

import type { ClientWithCoreApi } from "@mysten/sui/client";
import { deriveDynamicFieldID } from "@mysten/sui/utils";
import { bcs } from "@mysten/sui/bcs";
import { getObjectContent } from "@misofm/partyos";
import { Profile as ProfileBcs, ProfileKey as ProfileKeyBcs } from "../contracts/party_profile/party_profile.ts";
import { Media as MediaBcs, MediaKey as MediaKeyBcs } from "../contracts/party_media/party_media.ts";
import { ArtistRole as ArtistRoleBcs, RolesKey as RolesKeyBcs } from "../contracts/party_roles/party_roles.ts";
import { TagsKey as TagsKeyBcs } from "../contracts/party_tags/party_tags.ts";
import { GenresKey as GenresKeyBcs } from "../contracts/party_genre/party_genre.ts";
import { Cta as CtaBcs, CtasKey as CtasKeyBcs } from "../contracts/party_cta/party_cta.ts";
import { mapCtas, mapGenres, mapMedia, mapProfile, mapRoles, mapTags } from "./internal.ts";
import { buildLink, platformForDataType } from "./extensions/links.ts";
import type { Cta, Media, PlatformLink, Profile } from "./types.ts";

// The profile is a dynamic field on the party UID under an empty `ProfileKey()`
// (Move's implicit `dummy_field: bool` → one zero byte).
const ProfileField = bcs.struct("Field", { id: bcs.Address, name: ProfileKeyBcs, value: ProfileBcs });
const PROFILE_KEY_BYTES = ProfileKeyBcs.serialize([false]).toBytes();

/** Fetches a party's profile, or null if none is set. */
export async function getProfile(
  client: ClientWithCoreApi,
  partyId: string,
  partyProfilePackageId: string,
): Promise<Profile | null> {
  const fieldId = deriveDynamicFieldID(
    partyId,
    `${partyProfilePackageId}::party_profile::ProfileKey`,
    PROFILE_KEY_BYTES,
  );
  const content = await getObjectContent(client, fieldId);
  if (!content) return null;
  return mapProfile(partyId, ProfileField.parse(content).value);
}

// Media is a dynamic field on the party UID under an empty `MediaKey()` (same
// implicit `dummy_field: bool` → one zero byte as the profile key).
const MediaField = bcs.struct("Field", { id: bcs.Address, name: MediaKeyBcs, value: MediaBcs });
const MEDIA_KEY_BYTES = MediaKeyBcs.serialize([false]).toBytes();

/** Fetches a party's media (avatar + header), or null if none is set. */
export async function getMedia(
  client: ClientWithCoreApi,
  partyId: string,
  partyMediaPackageId: string,
): Promise<Media | null> {
  const fieldId = deriveDynamicFieldID(
    partyId,
    `${partyMediaPackageId}::party_media::MediaKey`,
    MEDIA_KEY_BYTES,
  );
  const content = await getObjectContent(client, fieldId);
  if (!content) return null;
  return mapMedia(partyId, MediaField.parse(content).value);
}

// === Collection extension reads (roles / tags / genres / ctas) ===
//
// Each is a single dynamic field on the party UID under an empty positional key
// (Move's implicit `dummy_field: bool` → one zero byte, same as the profile key).

const ROLES_KEY_BYTES = RolesKeyBcs.serialize([false]).toBytes();
const RolesField = bcs.struct("Field", { id: bcs.Address, name: RolesKeyBcs, value: bcs.vector(ArtistRoleBcs) });

/** The party's artist-type roles (display names), or `[]` if none are set. */
export async function getRoles(
  client: ClientWithCoreApi,
  partyId: string,
  partyRolesPackageId: string,
): Promise<string[]> {
  const fieldId = deriveDynamicFieldID(partyId, `${partyRolesPackageId}::party_roles::RolesKey`, ROLES_KEY_BYTES);
  const content = await getObjectContent(client, fieldId);
  if (!content) return [];
  return mapRoles(RolesField.parse(content).value);
}

const TAGS_KEY_BYTES = TagsKeyBcs.serialize([false]).toBytes();
const TagsField = bcs.struct("Field", { id: bcs.Address, name: TagsKeyBcs, value: bcs.vector(bcs.string()) });

/** The party's free-form tags, or `[]` if none are set. */
export async function getTags(
  client: ClientWithCoreApi,
  partyId: string,
  partyTagsPackageId: string,
): Promise<string[]> {
  const fieldId = deriveDynamicFieldID(partyId, `${partyTagsPackageId}::party_tags::TagsKey`, TAGS_KEY_BYTES);
  const content = await getObjectContent(client, fieldId);
  if (!content) return [];
  return mapTags(TagsField.parse(content).value);
}

const GENRES_KEY_BYTES = GenresKeyBcs.serialize([false]).toBytes();
const GenresField = bcs.struct("Field", { id: bcs.Address, name: GenresKeyBcs, value: bcs.vector(bcs.Address) });

/** The party's genre object ids, or `[]` if none are set. */
export async function getGenres(
  client: ClientWithCoreApi,
  partyId: string,
  partyGenrePackageId: string,
): Promise<string[]> {
  const fieldId = deriveDynamicFieldID(partyId, `${partyGenrePackageId}::party_genre::GenresKey`, GENRES_KEY_BYTES);
  const content = await getObjectContent(client, fieldId);
  if (!content) return [];
  return mapGenres(GenresField.parse(content).value);
}

const CTAS_KEY_BYTES = CtasKeyBcs.serialize([false]).toBytes();
// The CTA field's value is a bare `vector<Cta>` (not a wrapper struct).
const CtasField = bcs.struct("Field", { id: bcs.Address, name: CtasKeyBcs, value: bcs.vector(CtaBcs) });

/** The party's ordered CTA list (position is priority), or `[]` if none is set. */
export async function getCtas(
  client: ClientWithCoreApi,
  partyId: string,
  partyCtaPackageId: string,
): Promise<Cta[]> {
  const fieldId = deriveDynamicFieldID(partyId, `${partyCtaPackageId}::party_cta::CtasKey`, CTAS_KEY_BYTES);
  const content = await getObjectContent(client, fieldId);
  if (!content) return [];
  return mapCtas(CtasField.parse(content).value);
}

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
export async function getLinks(client: ClientWithCoreApi, partyId: string): Promise<PlatformLink[]> {
  const links: PlatformLink[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await client.core.listDynamicFields({ parentId: partyId, cursor: cursor ?? undefined });
    for (const f of page.dynamicFields) {
      if (typeof f.name?.type !== "string") continue;
      const match = f.name.type.match(PLATFORM_LINK_KEY_RE);
      const dataType = match?.[1];
      if (!dataType) continue;
      const platform = platformForDataType(dataType);
      if (!platform) continue;
      const content = await getObjectContent(client, f.fieldId);
      if (!content) continue;
      links.push(buildLink(platform, PlatformLinkField.parse(content).value));
    }
    cursor = page.hasNextPage ? page.cursor : null;
  } while (cursor);
  return links;
}
