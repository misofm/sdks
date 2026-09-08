// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Artist reads: a `Party` plus every extension attached to its UID.
//
// The artist page is the clearest case for this whole layer. Its data lives in
// separate dynamic fields, each its own package and read — party, profile, ctas,
// genres, links, roles, and tags. Here they are one call, resolved once, cached
// once.
//
// `roles` and `tags` are opt-in via `include`.

import { resolveGenreNames } from "./genres.ts";
import type { MisoClient } from "./client.ts";
import type {
  ArtistProfile,
  PartyMember,
  PartySummary,
} from "./types.ts";

/** Optional sub-resources — read only when asked for. */
export type ArtistInclude = "roles" | "tags";

export interface GetArtistOptions {
  include?: readonly ArtistInclude[];
}

/** Public avatar URL for a party (served from the API's R2 lane; 404 when unset). */
export function partyAvatarUrl(apiBaseUrl: string, partyId: string): string {
  return `${apiBaseUrl.replace(/\/$/, "")}/media/avatar/${partyId}`;
}

/**
 * An artist page, fully resolved. Throws only if the PARTY itself can't be read —
 * every extension is optional by design (a party with no profile set is a new
 * party, not a broken one), so each decoration read falls back to its empty value.
 */
export async function getArtistProfile(
  client: MisoClient,
  partyId: string,
  options: GetArtistOptions = {},
): Promise<ArtistProfile> {
  const include = new Set(options.include ?? []);
  const { party } = client;

  const [profile, ctas, genreIds, links, roles, tags, entity] =
    await Promise.all([
      party.getProfile(partyId).catch(() => null),
      party.getCtas(partyId).catch(() => []),
      party.getGenres(partyId).catch(() => [] as string[]),
      party.getLinks(partyId).catch(() => []),
      include.has("roles")
        ? party.getRoles(partyId).catch(() => [] as string[])
        : Promise.resolve(undefined),
      include.has("tags")
        ? party.getTags(partyId).catch(() => [] as string[])
        : Promise.resolve(undefined),
      party.getPartyById(partyId),
    ]);

  const [genres, members] = await Promise.all([
    resolveGenreNames(client, genreIds),
    resolveMembers(
      client,
      entity.kind === "group" ? (entity.members ?? []) : [],
    ),
  ]);

  return {
    id: entity.id,
    kind: entity.kind,
    name: entity.name,
    createdAtMs: entity.createdAtMs,
    bioShort: profile?.bioShort ?? null,
    bioLong: profile?.bioLong ?? null,
    country: profile?.country ?? null,
    languages: profile?.languages ?? [],
    genres,
    links: links.map((l) => ({
      platform: l.platform,
      value: l.value,
      url: l.url,
    })),
    ctas: ctas.map((c) => ({ label: c.label, url: c.url })),
    members,
    ...(roles !== undefined ? { roles } : {}),
    ...(tags !== undefined ? { tags } : {}),
    avatarUrl: partyAvatarUrl(client.config.apiBaseUrl, entity.id),
  };
}

/** Group members with names resolved. A member that fails to read is dropped. */
async function resolveMembers(
  client: MisoClient,
  memberIds: readonly string[],
): Promise<PartyMember[]> {
  if (memberIds.length === 0) return [];
  const parties = await client.party
    .getPartiesByIds([...memberIds])
    .catch(() => ({}) as Record<string, undefined>);
  return memberIds.flatMap((id) => {
    const p = parties[id];
    return p ? [{ id, name: p.name }] : [];
  });
}

/** Name + kind for many parties at once. Ids that don't resolve are omitted. */
export async function getPartySummaries(
  client: MisoClient,
  ids: readonly string[],
): Promise<PartySummary[]> {
  if (ids.length === 0) return [];
  const parties = await client.party.getPartiesByIds([...ids]);
  return ids.flatMap((id) => {
    const p = parties[id];
    return p ? [{ id, name: p.name, kind: p.kind }] : [];
  });
}
