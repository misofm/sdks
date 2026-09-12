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

import { Effect, Option, Result } from "effect";
import { ObjectId, Sui, type TransportError } from "@unconfirmed/sui-effect";
import { Partyos, type PartyosDeploymentError, type PartyReadError } from "@misofm/partyos";
import { getCtas, getGenres, getLinks, getProfile, getRoles, getTags } from "../party/queries.ts";
import { resolveGenreNames } from "./genres.ts";
import type { MisoConfig } from "./config.ts";
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
 * Builds the bound `Partyos` for `config.partyos`, provides it, and hands
 * back the effect it wraps — the "converting an existing facade" idiom from
 * sui-effect's `docs/extensions.md`, applied at function granularity: a
 * standalone read composes a sibling extension's own `layer(...)` internally
 * so its own requirement channel stays `Sui`, not `Sui | Partyos`.
 */
function withPartyos<A, E>(
  config: MisoConfig,
  effect: (partyos: Partyos["Service"]) => Effect.Effect<A, E, Sui>,
): Effect.Effect<A, E | PartyosDeploymentError, Sui> {
  return Effect.gen(function* () {
    const partyos = yield* Partyos;
    return yield* effect(partyos);
  }).pipe(Effect.provide(Partyos.layer({ deployment: config.partyos })));
}

/**
 * An artist page, fully resolved. Fails only if the PARTY itself can't be read —
 * every extension is optional by design (a party with no profile set is a new
 * party, not a broken one), so each decoration read falls back to its empty value.
 */
export const getArtistProfile = Effect.fn("getArtistProfile")(function* (
  partyId: string,
  config: MisoConfig,
  options: GetArtistOptions = {},
): Effect.fn.Return<ArtistProfile, PartyReadError | PartyosDeploymentError, Sui> {
  const include = new Set(options.include ?? []);
  const party = config.party;

  const [profileOpt, ctas, genreIds, links, roles, tags, entity] = yield* Effect.all([
    getProfile(partyId, party.partyProfile).pipe(Effect.catch(() => Effect.succeed(Option.none()))),
    getCtas(partyId, party.partyCta).pipe(Effect.catch(() => Effect.succeed([] as { label: string; url: string }[]))),
    getGenres(partyId, party.partyGenre).pipe(Effect.catch(() => Effect.succeed([] as string[]))),
    getLinks(partyId).pipe(Effect.catch(() => Effect.succeed([] as { platform: string; value: string; url: string }[]))),
    include.has("roles")
      ? getRoles(partyId, party.partyRoles).pipe(Effect.catch(() => Effect.succeed([] as string[])))
      : Effect.succeed(undefined),
    include.has("tags")
      ? getTags(partyId, party.partyTags).pipe(Effect.catch(() => Effect.succeed([] as string[])))
      : Effect.succeed(undefined),
    withPartyos(config, (partyos) => partyos.getPartyById(ObjectId.make(partyId))),
  ]);
  const profile = Option.getOrNull(profileOpt);

  const [genres, members] = yield* Effect.all([
    resolveGenreNames(genreIds),
    resolveMembers(entity.kind === "group" ? [...(entity.members ?? [])] : [], config),
  ]);

  return {
    id: entity.id,
    kind: entity.kind,
    name: entity.name,
    createdAtMs: entity.createdAtMs,
    bioShort: profile?.bioShort ?? null,
    bioLong: profile?.bioLong ?? null,
    country: profile?.country ?? null,
    languages: profile?.languages ? [...profile.languages] : [],
    genres,
    links: links.map((l) => ({
      platform: l.platform,
      value: l.value,
      url: l.url,
    })) as ArtistProfile["links"],
    ctas: ctas.map((c) => ({ label: c.label, url: c.url })),
    members,
    ...(roles !== undefined ? { roles } : {}),
    ...(tags !== undefined ? { tags } : {}),
    avatarUrl: partyAvatarUrl(config.apiBaseUrl, entity.id),
  };
});

/** Group members with names resolved. A member that fails to read is dropped. */
const resolveMembers = Effect.fn("resolveMembers")(function* (
  memberIds: readonly string[],
  config: MisoConfig,
): Effect.fn.Return<PartyMember[], never, Sui> {
  if (memberIds.length === 0) return [];
  const results = yield* withPartyos(config, (partyos) => partyos.getPartiesByIds(memberIds.map((id) => ObjectId.make(id)))).pipe(
    Effect.catch(() => Effect.succeed([] as ReadonlyArray<never>)),
  );
  const byId = new Map(
    results.flatMap((result, index) => (Result.isSuccess(result) ? [[memberIds[index]!, result.success] as const] : [])),
  );
  return memberIds.flatMap((id) => {
    const p = byId.get(id);
    return p ? [{ id, name: p.name }] : [];
  });
});

/** Name + kind for many parties at once. Ids that don't resolve are omitted. */
export const getPartySummaries = Effect.fn("getPartySummaries")(function* (
  ids: readonly string[],
  config: MisoConfig,
): Effect.fn.Return<PartySummary[], TransportError | PartyosDeploymentError, Sui> {
  if (ids.length === 0) return [];
  const results = yield* withPartyos(config, (partyos) => partyos.getPartiesByIds(ids.map((id) => ObjectId.make(id))));
  const byId = new Map(
    results.flatMap((result, index) => (Result.isSuccess(result) ? [[ids[index]!, result.success] as const] : [])),
  );
  return ids.flatMap((id) => {
    const p = byId.get(id);
    return p ? [{ id, name: p.name, kind: p.kind }] : [];
  });
});
