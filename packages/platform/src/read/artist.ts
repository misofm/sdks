// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { toPromise, tryPromise, workflow, type SdkError } from "@misofm/utils/effect";
import { Effect } from "effect";
//
// Artist reads: a `Party` plus every extension attached to its UID.
//
// The artist page is the clearest case for this whole layer. Its data lives in
// separate dynamic fields, each its own package and read — party, profile, ctas,
// genres, links, roles, and tags. Here they are one call, resolved once, cached
// once.
//
// `roles` and `tags` are opt-in via `include`.

import type { MisoClient } from "./client.ts";
import { resolveGenreNamesEffect } from "./genres.ts";
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
export function getArtistProfileEffect(
  client: MisoClient,
  partyId: string,
  options: GetArtistOptions = {},
): Effect.Effect<ArtistProfile, SdkError> {
  return workflow("getArtistProfile", function* () {
    const include = new Set(options.include ?? []);
    const { party } = client.sui.miso;

    const [profile, ctas, genreIds, links, roles, tags, entity] = yield* Effect.all(
      [
        Effect.catch(
          party.getProfileEffect?.(partyId) ?? tryPromise("getArtistProfile", () => party.getProfile(partyId)),
          () => Effect.succeed(null),
        ),
        Effect.catch(
          party.getCtasEffect?.(partyId) ?? tryPromise("getArtistProfile", () => party.getCtas(partyId)),
          () => Effect.succeed([]),
        ),
        Effect.catch(
          party.getGenresEffect?.(partyId) ?? tryPromise("getArtistProfile", () => party.getGenres(partyId)),
          () => Effect.succeed([] as string[]),
        ),
        Effect.catch(
          party.getLinksEffect?.(partyId) ?? tryPromise("getArtistProfile", () => party.getLinks(partyId)),
          () => Effect.succeed([]),
        ),
        include.has("roles")
          ? Effect.catch(
              party.getRolesEffect?.(partyId) ?? tryPromise("getArtistProfile", () => party.getRoles(partyId)),
              () => Effect.succeed([] as string[]),
            )
          : Effect.succeed(undefined),
        include.has("tags")
          ? Effect.catch(
              party.getTagsEffect?.(partyId) ?? tryPromise("getArtistProfile", () => party.getTags(partyId)),
              () => Effect.succeed([] as string[]),
            )
          : Effect.succeed(undefined),
        party.getPartyByIdEffect?.(partyId) ?? tryPromise("getArtistProfile", () => party.getPartyById(partyId)),
      ],
      { concurrency: 8 },
    );

    const [genres, members] = yield* Effect.all(
      [
        resolveGenreNamesEffect(client, genreIds),
        resolveMembersEffect(client, entity.kind === "group" ? (entity.members ?? []) : []),
      ],
      { concurrency: 8 },
    );

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
  });
}

export const getArtistProfile = toPromise(getArtistProfileEffect);

/** Group members with names resolved. A member that fails to read is dropped. */
function resolveMembersEffect(
  client: MisoClient,
  memberIds: readonly string[],
): Effect.Effect<PartyMember[], SdkError> {
  return workflow("resolveMembers", function* () {
    if (memberIds.length === 0) return [];
    const parties = yield* Effect.catch(
      client.sui.miso.party.getPartiesByIdsEffect?.([...memberIds]) ??
        tryPromise("resolveMembers", () => client.sui.miso.party.getPartiesByIds([...memberIds])),
      () => Effect.succeed({} as Record<string, undefined>),
    );
    return memberIds.flatMap((id) => {
      const p = parties[id];
      return p ? [{ id, name: p.name }] : [];
    });
  });
}

/** Name + kind for many parties at once. Ids that don't resolve are omitted. */
export function getPartySummariesEffect(
  client: MisoClient,
  ids: readonly string[],
): Effect.Effect<PartySummary[], SdkError> {
  return workflow("getPartySummaries", function* () {
    if (ids.length === 0) return [];
    const parties = yield* client.sui.miso.party.getPartiesByIdsEffect?.([...ids]) ??
      tryPromise("getPartySummaries", () => client.sui.miso.party.getPartiesByIds([...ids]));
    return ids.flatMap((id) => {
      const p = parties[id];
      return p ? [{ id, name: p.name, kind: p.kind }] : [];
    });
  });
}

export const getPartySummaries = toPromise(getPartySummariesEffect);
