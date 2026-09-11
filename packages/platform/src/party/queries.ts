// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Typed reads for the Party EXTENSIONS: fetch an on-chain dynamic field via
// `Sui`, BCS-parse its value through the generated struct, and map to the
// public camelCase types. Party core reads (`getPartyById`, group
// membership, …) live in `@misofm/partyos` — this file only covers
// profile/media/roles/tags/genres/ctas/links.
//
// Each field lives under an empty positional key (Move's implicit
// `dummy_field: bool` → one zero byte); `sui.getDynamicFieldOption(parent,
// { type, bcs })` reads the field's VALUE bytes directly, so — unlike the
// predecessor `@misofm/effect`-era version of this file — there is no
// separate `Field<K, V>` wrapper struct to decode per extension: one less
// generated-struct dependency per read, and the wrapper `bcs.struct("Field",
// ...)` definitions are gone entirely.

import { Effect, Option, Stream } from "effect";
import { bcs } from "@mysten/sui/bcs";
import { normalizeStructTag } from "@mysten/sui/utils";
import { ObjectId, Sui, SuiSchema, type DecodeError, type TransportError } from "sui-effect";
import { Profile as ProfileBcs, ProfileKey as ProfileKeyBcs } from "../contracts/party_profile/party_profile.ts";
import { Media as MediaBcs, MediaKey as MediaKeyBcs } from "../contracts/party_media/party_media.ts";
import { ArtistRole as ArtistRoleBcs, RolesKey as RolesKeyBcs } from "../contracts/party_roles/party_roles.ts";
import { TagsKey as TagsKeyBcs } from "../contracts/party_tags/party_tags.ts";
import { GenresKey as GenresKeyBcs } from "../contracts/party_genre/party_genre.ts";
import { Cta as CtaBcs, CtasKey as CtasKeyBcs } from "../contracts/party_cta/party_cta.ts";
import { mapCtas, mapGenres, mapMedia, mapProfile, mapRoles, mapTags } from "./internal.ts";
import { buildLink, platformForDataType } from "./extensions/links.ts";
import { Cta, Media, PlatformLink, Profile } from "./types.ts";

const PROFILE_KEY_BYTES = ProfileKeyBcs.serialize([false]).toBytes();

/** Fetches a party's profile; `Option.none()` if none is set. */
export const getProfile = Effect.fn("getProfile")(function* (
  partyId: string,
  partyProfilePackageId: string,
): Effect.fn.Return<Option.Option<Profile>, DecodeError | TransportError, Sui> {
  const sui = yield* Sui;
  const keyTag = normalizeStructTag(`${partyProfilePackageId}::party_profile::ProfileKey`);
  const field = yield* sui.getDynamicFieldOption(ObjectId.make(partyId), { type: keyTag, bcs: PROFILE_KEY_BYTES });
  if (Option.isNone(field)) return Option.none();
  const valueTag = normalizeStructTag(`${partyProfilePackageId}::party_profile::Profile`);
  const raw = yield* SuiSchema.decode(SuiSchema.bcs(ProfileBcs, valueTag), field.value.value.bcs, {
    objectId: field.value.fieldId,
    actualType: field.value.value.type,
  });
  return Option.some(mapProfile(partyId, raw));
});

const MEDIA_KEY_BYTES = MediaKeyBcs.serialize([false]).toBytes();

/** Fetches a party's media (avatar + header); `Option.none()` if none is set. */
export const getMedia = Effect.fn("getMedia")(function* (
  partyId: string,
  partyMediaPackageId: string,
): Effect.fn.Return<Option.Option<Media>, DecodeError | TransportError, Sui> {
  const sui = yield* Sui;
  const keyTag = normalizeStructTag(`${partyMediaPackageId}::party_media::MediaKey`);
  const field = yield* sui.getDynamicFieldOption(ObjectId.make(partyId), { type: keyTag, bcs: MEDIA_KEY_BYTES });
  if (Option.isNone(field)) return Option.none();
  const valueTag = normalizeStructTag(`${partyMediaPackageId}::party_media::Media`);
  const raw = yield* SuiSchema.decode(SuiSchema.bcs(MediaBcs, valueTag), field.value.value.bcs, {
    objectId: field.value.fieldId,
    actualType: field.value.value.type,
  });
  return Option.some(mapMedia(partyId, raw));
});

// === Collection extension reads (roles / tags / genres / ctas) ===
//
// Each is a single dynamic field on the party UID under an empty positional
// key (same implicit `dummy_field: bool` → one zero byte as the profile
// key). Absence keeps the pre-migration policy: an empty collection, not a
// failure.

const ROLES_KEY_BYTES = RolesKeyBcs.serialize([false]).toBytes();
const RolesValue = bcs.vector(ArtistRoleBcs);

/** The party's artist-type roles (display names), or `[]` if none are set. */
export const getRoles = Effect.fn("getRoles")(function* (
  partyId: string,
  partyRolesPackageId: string,
): Effect.fn.Return<string[], DecodeError | TransportError, Sui> {
  const sui = yield* Sui;
  const keyTag = normalizeStructTag(`${partyRolesPackageId}::party_roles::RolesKey`);
  const field = yield* sui.getDynamicFieldOption(ObjectId.make(partyId), { type: keyTag, bcs: ROLES_KEY_BYTES });
  if (Option.isNone(field)) return [];
  const roles = yield* SuiSchema.decode(SuiSchema.bcs(RolesValue), field.value.value.bcs, { objectId: field.value.fieldId });
  return mapRoles(roles);
});

const TAGS_KEY_BYTES = TagsKeyBcs.serialize([false]).toBytes();
const TagsValue = bcs.vector(bcs.string());

/** The party's free-form tags, or `[]` if none are set. */
export const getTags = Effect.fn("getTags")(function* (
  partyId: string,
  partyTagsPackageId: string,
): Effect.fn.Return<string[], DecodeError | TransportError, Sui> {
  const sui = yield* Sui;
  const keyTag = normalizeStructTag(`${partyTagsPackageId}::party_tags::TagsKey`);
  const field = yield* sui.getDynamicFieldOption(ObjectId.make(partyId), { type: keyTag, bcs: TAGS_KEY_BYTES });
  if (Option.isNone(field)) return [];
  const tags = yield* SuiSchema.decode(SuiSchema.bcs(TagsValue), field.value.value.bcs, { objectId: field.value.fieldId });
  return mapTags(tags);
});

const GENRES_KEY_BYTES = GenresKeyBcs.serialize([false]).toBytes();
const GenresValue = bcs.vector(bcs.Address);

/** The party's genre object ids, or `[]` if none are set. */
export const getGenres = Effect.fn("getGenres")(function* (
  partyId: string,
  partyGenrePackageId: string,
): Effect.fn.Return<string[], DecodeError | TransportError, Sui> {
  const sui = yield* Sui;
  const keyTag = normalizeStructTag(`${partyGenrePackageId}::party_genre::GenresKey`);
  const field = yield* sui.getDynamicFieldOption(ObjectId.make(partyId), { type: keyTag, bcs: GENRES_KEY_BYTES });
  if (Option.isNone(field)) return [];
  const genres = yield* SuiSchema.decode(SuiSchema.bcs(GenresValue), field.value.value.bcs, { objectId: field.value.fieldId });
  return mapGenres(genres);
});

const CTAS_KEY_BYTES = CtasKeyBcs.serialize([false]).toBytes();
// The CTA field's value is a bare `vector<Cta>` (not a wrapper struct).
const CtasValue = bcs.vector(CtaBcs);

/** The party's ordered CTA list (position is priority), or `[]` if none is set. */
export const getCtas = Effect.fn("getCtas")(function* (
  partyId: string,
  partyCtaPackageId: string,
): Effect.fn.Return<Cta[], DecodeError | TransportError, Sui> {
  const sui = yield* Sui;
  const keyTag = normalizeStructTag(`${partyCtaPackageId}::party_cta::CtasKey`);
  const field = yield* sui.getDynamicFieldOption(ObjectId.make(partyId), { type: keyTag, bcs: CTAS_KEY_BYTES });
  if (Option.isNone(field)) return [];
  const ctas = yield* SuiSchema.decode(SuiSchema.bcs(CtasValue), field.value.value.bcs, { objectId: field.value.fieldId });
  return mapCtas(ctas).map((c) => new Cta(c));
});

// === Platform-link reads ===
//
// Each platform is an independent `PlatformLink<Data>` dynamic field keyed by
// `platform_link::PlatformLinkKey<Data>`. There is no single key to derive, so
// enumerate the party's dynamic fields and pick out the platform-link ones,
// identifying the platform from the `Data` type argument. Every payload `Data`
// type is a single-`String` newtype, so `PlatformLink<Data>` serializes exactly
// as one BCS string — decode the field's value as such.
const PlatformLinkValue = bcs.string();
const PLATFORM_LINK_KEY_RE = /::platform_link::PlatformLinkKey<(.+)>$/;

/** All external-platform links attached to a party (social, music, professional). */
export const getLinks = Effect.fn("getLinks")(function* (
  partyId: string,
): Effect.fn.Return<PlatformLink[], DecodeError | TransportError, Sui> {
  const sui = yield* Sui;
  const id = ObjectId.make(partyId);
  // The regex match below drops every entry that is not this platform's own
  // `PlatformLinkKey<Data>` — including a foreign extension's dynamic fields
  // on the same party UID — before a byte is read.
  const entries = yield* Stream.runCollect(sui.streamDynamicFields(id));
  const links: PlatformLink[] = [];
  for (const entry of entries) {
    const match = entry.name.type.match(PLATFORM_LINK_KEY_RE);
    const dataType = match?.[1];
    if (!dataType) continue;
    const platform = platformForDataType(dataType);
    if (!platform) continue;
    const field = yield* sui.getDynamicFieldOption(id, entry.name);
    if (Option.isNone(field)) continue;
    const value = yield* SuiSchema.decode(SuiSchema.bcs(PlatformLinkValue), field.value.value.bcs, {
      objectId: field.value.fieldId,
    });
    links.push(buildLink(platform, value));
  }
  return links;
});
