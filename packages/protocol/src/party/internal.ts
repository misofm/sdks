// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { walrusBlobIdFromU256, walrusBlobIdToU256 } from "@misofm/utils/encoding";
import { Party as PartyBcs } from "../contracts/miso_party/party.ts";
import { Profile as ProfileBcs } from "../contracts/party_profile/party_profile.ts";
import { Media as MediaBcs } from "../contracts/party_media/party_media.ts";
import { ArtistRole } from "../contracts/party_roles/party_roles.ts";
import { Cta as CtaBcs } from "../contracts/party_cta/party_cta.ts";
import type { Cta, Media, Party, Profile } from "./types.ts";

export function u256ToB64Url(value: bigint | string): string {
  return walrusBlobIdFromU256(BigInt(value));
}

/** Requires a canonical unpadded base64url encoding of exactly 32 bytes. */
export function b64UrlToU256(value: string): string {
  return walrusBlobIdToU256(value).toString();
}

export function mapProfile(partyId: string, d: ReturnType<typeof ProfileBcs.parse>): Profile {
  return {
    partyId,
    bioShort: d.bio_short,
    bioLong: d.bio_long ?? undefined,
    country: d.country?.[0],
    languages: d.languages.map((language) => language[0]),
  };
}

export function mapMedia(partyId: string, d: ReturnType<typeof MediaBcs.parse>): Media {
  return { partyId, quiltId: u256ToB64Url(d.quilt) };
}

export function mapRoles(d: ReturnType<typeof ArtistRole.parse>[]): string[] {
  return d.map((role) => role.$kind === "Custom" ? role.Custom : role.$kind === "Dj" ? "DJ" : role.$kind);
}

export function mapTags(d: string[]): string[] { return [...d]; }
export function mapGenres(d: string[]): string[] { return [...d]; }
export function mapCtas(d: ReturnType<typeof CtaBcs.parse>[]): Cta[] {
  return d.map(({ label, url }) => ({ label, url }));
}

export function mapParty(id: string, d: ReturnType<typeof PartyBcs.parse>): Party {
  const createdAtMs = Number(d.created_at_ms);
  return d.kind.$kind === "Group"
    ? { id, kind: "group", name: d.name, members: [...d.kind.Group.contents], createdAtMs }
    : { id, kind: "individual", name: d.name, createdAtMs };
}
