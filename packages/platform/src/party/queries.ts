// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Typed reads for the Party EXTENSIONS: fetch an on-chain dynamic field via the
// Core API, BCS-parse it through the generated struct, and map to the public
// camelCase types. Party core reads (`getPartyById`, group membership, …) live
// in `@misofm/partyos` — this file only covers profile/media/roles/tags/genres/
// ctas/links.

import { Effect, Option, Stream } from "effect";
import { deriveDynamicFieldID } from "@mysten/sui/utils";
import { bcs } from "@mysten/sui/bcs";
import {
  decodeBcs,
  getOptionalObjectContent,
  listDynamicFields,
  SuiClient,
  type BcsDecodeError,
  type SuiRpcError,
} from "@misofm/effect";
import { Profile as ProfileBcs, ProfileKey as ProfileKeyBcs } from "../contracts/party_profile/party_profile.ts";
import { Media as MediaBcs, MediaKey as MediaKeyBcs } from "../contracts/party_media/party_media.ts";
import { ArtistRole as ArtistRoleBcs, RolesKey as RolesKeyBcs } from "../contracts/party_roles/party_roles.ts";
import { TagsKey as TagsKeyBcs } from "../contracts/party_tags/party_tags.ts";
import { GenresKey as GenresKeyBcs } from "../contracts/party_genre/party_genre.ts";
import { Cta as CtaBcs, CtasKey as CtasKeyBcs } from "../contracts/party_cta/party_cta.ts";
import { mapCtas, mapGenres, mapMedia, mapProfile, mapRoles, mapTags } from "./internal.ts";
import { buildLink, platformForDataType } from "./extensions/links.ts";
import { Cta, Media, PlatformLink, Profile } from "./types.ts";

// The profile is a dynamic field on the party UID under an empty `ProfileKey()`
// (Move's implicit `dummy_field: bool` → one zero byte).
const ProfileField = bcs.struct("Field", { id: bcs.Address, name: ProfileKeyBcs, value: ProfileBcs });
const PROFILE_KEY_BYTES = ProfileKeyBcs.serialize([false]).toBytes();

/** Fetches a party's profile; `Option.none()` if none is set. */
export const getProfile = Effect.fn("getProfile")(function* (
  partyId: string,
  partyProfilePackageId: string,
): Effect.fn.Return<Option.Option<Profile>, BcsDecodeError | SuiRpcError, SuiClient> {
  const fieldId = deriveDynamicFieldID(
    partyId,
    `${partyProfilePackageId}::party_profile::ProfileKey`,
    PROFILE_KEY_BYTES,
  );
  const contentOpt = yield* getOptionalObjectContent(fieldId);
  if (Option.isNone(contentOpt)) return Option.none();
  const profile = yield* decodeBcs(
    { parse: (bytes: Uint8Array) => mapProfile(partyId, ProfileField.parse(bytes).value) },
    Profile,
    contentOpt.value.content,
    { type: "Profile", objectId: fieldId },
  );
  return Option.some(profile);
});

// Media is a dynamic field on the party UID under an empty `MediaKey()` (same
// implicit `dummy_field: bool` → one zero byte as the profile key).
const MediaField = bcs.struct("Field", { id: bcs.Address, name: MediaKeyBcs, value: MediaBcs });
const MEDIA_KEY_BYTES = MediaKeyBcs.serialize([false]).toBytes();

/** Fetches a party's media (avatar + header); `Option.none()` if none is set. */
export const getMedia = Effect.fn("getMedia")(function* (
  partyId: string,
  partyMediaPackageId: string,
): Effect.fn.Return<Option.Option<Media>, BcsDecodeError | SuiRpcError, SuiClient> {
  const fieldId = deriveDynamicFieldID(
    partyId,
    `${partyMediaPackageId}::party_media::MediaKey`,
    MEDIA_KEY_BYTES,
  );
  const contentOpt = yield* getOptionalObjectContent(fieldId);
  if (Option.isNone(contentOpt)) return Option.none();
  const media = yield* decodeBcs(
    { parse: (bytes: Uint8Array) => mapMedia(partyId, MediaField.parse(bytes).value) },
    Media,
    contentOpt.value.content,
    { type: "Media", objectId: fieldId },
  );
  return Option.some(media);
});

// === Collection extension reads (roles / tags / genres / ctas) ===
//
// Each is a single dynamic field on the party UID under an empty positional key
// (Move's implicit `dummy_field: bool` → one zero byte, same as the profile key).
// Absence keeps the pre-migration policy: an empty collection, not a failure.

const ROLES_KEY_BYTES = RolesKeyBcs.serialize([false]).toBytes();
const RolesField = bcs.struct("Field", { id: bcs.Address, name: RolesKeyBcs, value: bcs.vector(ArtistRoleBcs) });

/** The party's artist-type roles (display names), or `[]` if none are set. */
export const getRoles = Effect.fn("getRoles")(function* (
  partyId: string,
  partyRolesPackageId: string,
): Effect.fn.Return<string[], SuiRpcError, SuiClient> {
  const fieldId = deriveDynamicFieldID(partyId, `${partyRolesPackageId}::party_roles::RolesKey`, ROLES_KEY_BYTES);
  const contentOpt = yield* getOptionalObjectContent(fieldId);
  if (Option.isNone(contentOpt)) return [];
  return mapRoles(RolesField.parse(contentOpt.value.content).value);
});

const TAGS_KEY_BYTES = TagsKeyBcs.serialize([false]).toBytes();
const TagsField = bcs.struct("Field", { id: bcs.Address, name: TagsKeyBcs, value: bcs.vector(bcs.string()) });

/** The party's free-form tags, or `[]` if none are set. */
export const getTags = Effect.fn("getTags")(function* (
  partyId: string,
  partyTagsPackageId: string,
): Effect.fn.Return<string[], SuiRpcError, SuiClient> {
  const fieldId = deriveDynamicFieldID(partyId, `${partyTagsPackageId}::party_tags::TagsKey`, TAGS_KEY_BYTES);
  const contentOpt = yield* getOptionalObjectContent(fieldId);
  if (Option.isNone(contentOpt)) return [];
  return mapTags(TagsField.parse(contentOpt.value.content).value);
});

const GENRES_KEY_BYTES = GenresKeyBcs.serialize([false]).toBytes();
const GenresField = bcs.struct("Field", { id: bcs.Address, name: GenresKeyBcs, value: bcs.vector(bcs.Address) });

/** The party's genre object ids, or `[]` if none are set. */
export const getGenres = Effect.fn("getGenres")(function* (
  partyId: string,
  partyGenrePackageId: string,
): Effect.fn.Return<string[], SuiRpcError, SuiClient> {
  const fieldId = deriveDynamicFieldID(partyId, `${partyGenrePackageId}::party_genre::GenresKey`, GENRES_KEY_BYTES);
  const contentOpt = yield* getOptionalObjectContent(fieldId);
  if (Option.isNone(contentOpt)) return [];
  return mapGenres(GenresField.parse(contentOpt.value.content).value);
});

const CTAS_KEY_BYTES = CtasKeyBcs.serialize([false]).toBytes();
// The CTA field's value is a bare `vector<Cta>` (not a wrapper struct).
const CtasField = bcs.struct("Field", { id: bcs.Address, name: CtasKeyBcs, value: bcs.vector(CtaBcs) });

/** The party's ordered CTA list (position is priority), or `[]` if none is set. */
export const getCtas = Effect.fn("getCtas")(function* (
  partyId: string,
  partyCtaPackageId: string,
): Effect.fn.Return<Cta[], SuiRpcError, SuiClient> {
  const fieldId = deriveDynamicFieldID(partyId, `${partyCtaPackageId}::party_cta::CtasKey`, CTAS_KEY_BYTES);
  const contentOpt = yield* getOptionalObjectContent(fieldId);
  if (Option.isNone(contentOpt)) return [];
  return mapCtas(CtasField.parse(contentOpt.value.content).value).map((c) => new Cta(c));
});

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
export const getLinks = Effect.fn("getLinks")(function* (
  partyId: string,
): Effect.fn.Return<PlatformLink[], SuiRpcError, SuiClient> {
  const fields = Array.from(yield* Stream.runCollect(listDynamicFields(partyId)));
  const links: PlatformLink[] = [];
  for (const f of fields) {
    if (typeof f.name?.type !== "string") continue;
    const match = f.name.type.match(PLATFORM_LINK_KEY_RE);
    const dataType = match?.[1];
    if (!dataType) continue;
    const platform = platformForDataType(dataType);
    if (!platform) continue;
    const contentOpt = yield* getOptionalObjectContent(f.fieldId);
    if (Option.isNone(contentOpt)) continue;
    links.push(buildLink(platform, PlatformLinkField.parse(contentOpt.value.content).value));
  }
  return links;
});
