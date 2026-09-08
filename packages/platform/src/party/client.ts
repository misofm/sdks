// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Party EXTENSIONS bound to one `PartyExtensionsDeployment`, wrapping a
// `PartyosClient` for the Party core. Consumers reach this through
// `client.miso.party`.

import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { Party, PartyosClient } from "@misofm/partyos";
import type { PartyExtensionsDeployment } from "../deployments.ts";
import * as queries from "./queries.ts";
import * as profileExt from "./extensions/profile.ts";
import * as mediaExt from "./extensions/media.ts";
import * as rolesExt from "./extensions/roles.ts";
import * as tagsExt from "./extensions/tags.ts";
import * as genresExt from "./extensions/genres.ts";
import * as ctasExt from "./extensions/ctas.ts";
import * as linksExt from "./extensions/links.ts";
import type { Cta, Media, PlatformKey, PlatformLink, Profile } from "./types.ts";
import * as profileMod from "../contracts/party_profile/party_profile.ts";
import * as mediaMod from "../contracts/party_media/party_media.ts";
import * as rolesMod from "../contracts/party_roles/party_roles.ts";
import * as tagsMod from "../contracts/party_tags/party_tags.ts";
import * as ctaMod from "../contracts/party_cta/party_cta.ts";
import * as genreMod from "../contracts/party_genre/party_genre.ts";
import * as platformLinkMod from "../contracts/party_platform_link/party_platform_link.ts";
import * as socialMod from "../contracts/party_social/party_social.ts";
import * as musicMod from "../contracts/party_music/party_music.ts";
import * as proLinkMod from "../contracts/party_pro_link/party_pro_link.ts";

type BoundMoveFunction<F> = F extends (options: infer Options) => infer Result
  ? Options extends { package?: unknown }
    ? (options: Omit<Options, "package">) => Result
    : F
  : F;
type BoundModule<M extends object, Removed extends PropertyKey> = {
  [Key in Exclude<keyof M, Removed>]: BoundMoveFunction<M[Key]>;
};

/** Defaults generated calls to one package and removes reference-returning calls. */
function bindModulePackage<M extends object, K extends readonly (keyof M)[]>(
  mod: M,
  pkg: string,
  unavailable: K = [] as unknown as K,
): BoundModule<M, K[number]> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries({ ...mod })) {
    if ((unavailable as readonly string[]).includes(key)) continue;
    out[key] =
      typeof value === "function"
        ? (options: { package?: string }) => (value as (o: unknown) => unknown)({ package: pkg, ...options })
        : value;
  }
  return out as BoundModule<M, K[number]>;
}

/**
 * Package-bound Party client exposed at `client.miso.party`. Wraps a
 * `PartyosClient` for the Party core (identity, admin caps, group membership)
 * and adds the first-party extensions (profile, media, roles, tags, genres,
 * CTAs, platform links) this package owns.
 */
export class PartyPlatformClient {
  #client: ClientWithCoreApi;
  #core: PartyosClient;
  #profilePkg: string;
  #countryCodePkg: string;
  #languageCodePkg: string;
  #mediaPkg: string;
  #rolesPkg: string;
  #tagsPkg: string;
  #partyGenrePkg: string;
  #ctaPkg: string;
  #platformLinkPkg: string;
  #socialPkg: string;
  #musicPkg: string;
  #proLinkPkg: string;

  constructor(client: ClientWithCoreApi, core: PartyosClient, extensions: PartyExtensionsDeployment) {
    this.#client = client;
    this.#core = core;
    this.#profilePkg = extensions.partyProfile;
    this.#countryCodePkg = extensions.countryCode;
    this.#languageCodePkg = extensions.languageCode;
    this.#mediaPkg = extensions.partyMedia;
    this.#rolesPkg = extensions.partyRoles;
    this.#tagsPkg = extensions.partyTags;
    this.#partyGenrePkg = extensions.partyGenre;
    this.#ctaPkg = extensions.partyCta;
    this.#platformLinkPkg = extensions.partyPlatformLink;
    this.#socialPkg = extensions.partySocial;
    this.#musicPkg = extensions.partyMusic;
    this.#proLinkPkg = extensions.partyProLink;
  }

  /** The wrapped Party-core client (identity, admin caps, group membership). */
  get core(): PartyosClient {
    return this.#core;
  }

  // === Core (delegated to `PartyosClient`) ===

  async getPartyById(partyId: string): Promise<Party> {
    return this.#core.getPartyById(partyId);
  }
  async getPartiesByIds(partyIds: readonly string[]): Promise<Partial<Record<string, Party>>> {
    return this.#core.getPartiesByIds(partyIds);
  }
  derivePartyAdminCapId(partyId: string): string {
    return this.#core.derivePartyAdminCapId(partyId);
  }
  /** Group ids a party belongs to (member-side membership records). */
  async getMemberships(partyId: string): Promise<string[]> {
    return this.#core.getMemberships(partyId);
  }
  /** Member ids invited to a group but not yet accepted. */
  async getPendingInvites(groupId: string): Promise<string[]> {
    return this.#core.getPendingInvites(groupId);
  }
  /** Group ids that have invited this party but are awaiting its response. */
  async getPendingMemberships(partyId: string): Promise<string[]> {
    return this.#core.getPendingMemberships(partyId);
  }
  /** Whether a party is a member of a group. */
  async isMember(memberId: string, groupId: string): Promise<boolean> {
    return this.#core.isMember(memberId, groupId);
  }

  // === Extension queries ===

  async getProfile(partyId: string): Promise<Profile | null> {
    return queries.getProfile(this.#client, partyId, this.#profilePkg);
  }
  async getMedia(partyId: string): Promise<Media | null> {
    return queries.getMedia(this.#client, partyId, this.#mediaPkg);
  }
  /** The party's artist-type roles (display names). */
  async getRoles(partyId: string): Promise<string[]> {
    return queries.getRoles(this.#client, partyId, this.#rolesPkg);
  }
  /** The party's free-form tags. */
  async getTags(partyId: string): Promise<string[]> {
    return queries.getTags(this.#client, partyId, this.#tagsPkg);
  }
  /** The party's genre object ids. */
  async getGenres(partyId: string): Promise<string[]> {
    return queries.getGenres(this.#client, partyId, this.#partyGenrePkg);
  }
  /** The party's ordered CTA list (position is priority). */
  async getCtas(partyId: string): Promise<Cta[]> {
    return queries.getCtas(this.#client, partyId, this.#ctaPkg);
  }
  /** All external-platform links attached to the party (social, music, professional). */
  async getLinks(partyId: string): Promise<PlatformLink[]> {
    return queries.getLinks(this.#client, partyId);
  }

  // === Transaction builders (thunks; package ids bound from the client) ===

  get tx() {
    const profilePkg = this.#profilePkg;
    const cc = this.#countryCodePkg;
    const lc = this.#languageCodePkg;
    const mediaPkg = this.#mediaPkg;
    const rolesPkg = this.#rolesPkg;
    const tagsPkg = this.#tagsPkg;
    const ctaPkg = this.#ctaPkg;
    const partyGenrePkg = this.#partyGenrePkg;
    const linkIds: linksExt.LinkPackageIds = {
      partyPlatformLinkPackageId: this.#platformLinkPkg,
      partySocialPackageId: this.#socialPkg,
      partyMusicPackageId: this.#musicPkg,
      partyProLinkPackageId: this.#proLinkPkg,
    };
    return {
      // Party core builders — delegated straight from `PartyosClient`.
      ...this.#core.tx,
      setProfile: (
        p: Omit<profileExt.SetProfileParams, "partyProfilePackageId" | "countryCodePackageId" | "languageCodePackageId">,
      ) =>
        profileExt.setProfile({
          ...p,
          partyProfilePackageId: profilePkg,
          countryCodePackageId: cc,
          languageCodePackageId: lc,
        }),
      clearProfile: (p: Omit<profileExt.ClearProfileParams, "partyProfilePackageId">) =>
        profileExt.clearProfile({ ...p, partyProfilePackageId: profilePkg }),
      setMedia: (p: Omit<mediaExt.SetMediaParams, "partyMediaPackageId">) =>
        mediaExt.setMedia({ ...p, partyMediaPackageId: mediaPkg }),
      clearMedia: (p: Omit<mediaExt.ClearMediaParams, "partyMediaPackageId">) =>
        mediaExt.clearMedia({ ...p, partyMediaPackageId: mediaPkg }),
      // Roles
      addRole: (p: Omit<rolesExt.AddRoleParams, "partyRolesPackageId">) =>
        rolesExt.addRole({ ...p, partyRolesPackageId: rolesPkg }),
      removeRole: (p: Omit<rolesExt.RemoveRoleParams, "partyRolesPackageId">) =>
        rolesExt.removeRole({ ...p, partyRolesPackageId: rolesPkg }),
      clearRoles: (p: Omit<rolesExt.ClearRolesParams, "partyRolesPackageId">) =>
        rolesExt.clearRoles({ ...p, partyRolesPackageId: rolesPkg }),
      // Tags
      addTag: (p: Omit<tagsExt.AddTagParams, "partyTagsPackageId">) =>
        tagsExt.addTag({ ...p, partyTagsPackageId: tagsPkg }),
      removeTag: (p: Omit<tagsExt.RemoveTagParams, "partyTagsPackageId">) =>
        tagsExt.removeTag({ ...p, partyTagsPackageId: tagsPkg }),
      clearTags: (p: Omit<tagsExt.ClearTagsParams, "partyTagsPackageId">) =>
        tagsExt.clearTags({ ...p, partyTagsPackageId: tagsPkg }),
      // Genres
      addGenre: (p: Omit<genresExt.AddGenreParams, "partyGenrePackageId">) =>
        genresExt.addGenre({ ...p, partyGenrePackageId: partyGenrePkg }),
      removeGenre: (p: Omit<genresExt.RemoveGenreParams, "partyGenrePackageId">) =>
        genresExt.removeGenre({ ...p, partyGenrePackageId: partyGenrePkg }),
      clearGenres: (p: Omit<genresExt.ClearGenresParams, "partyGenrePackageId">) =>
        genresExt.clearGenres({ ...p, partyGenrePackageId: partyGenrePkg }),
      // CTAs
      setCtas: (p: Omit<ctasExt.SetCtasParams, "partyCtaPackageId">) =>
        ctasExt.setCtas({ ...p, partyCtaPackageId: ctaPkg }),
      clearCtas: (p: Omit<ctasExt.ClearCtasParams, "partyCtaPackageId">) =>
        ctasExt.clearCtas({ ...p, partyCtaPackageId: ctaPkg }),
      // Platform links — generic (any platform) plus per-platform `set…`/`clear…`.
      setLink: (platform: PlatformKey, p: linksExt.BoundSetLinkParams) =>
        linksExt.setLink(platform, { ...p, ...linkIds }),
      clearLink: (platform: PlatformKey, p: linksExt.BoundClearLinkParams) =>
        linksExt.clearLink(platform, { ...p, ...linkIds }),
      ...linksExt.linkTxBuilders(linkIds),
    };
  }

  // === Generated type-safe Move calls (for tx.add) ===

  get call() {
    return {
      party: this.#core.call.party,
      profile: bindModulePackage(profileMod, this.#profilePkg, ["profile"] as const),
      media: bindModulePackage(mediaMod, this.#mediaPkg),
      roles: bindModulePackage(rolesMod, this.#rolesPkg),
      tags: bindModulePackage(tagsMod, this.#tagsPkg),
      cta: bindModulePackage(ctaMod, this.#ctaPkg),
      genre: bindModulePackage(genreMod, this.#partyGenrePkg),
      platformLink: bindModulePackage(platformLinkMod, this.#platformLinkPkg),
      social: bindModulePackage(socialMod, this.#socialPkg),
      music: bindModulePackage(musicMod, this.#musicPkg),
      proLink: bindModulePackage(proLinkMod, this.#proLinkPkg),
    };
  }

  // === Generated BCS structs (for parsing object/event content) ===

  get bcs() {
    return {
      ...this.#core.bcs,
      Profile: profileMod.Profile,
      ProfileSetEvent: profileMod.ProfileSetEvent,
      Media: mediaMod.Media,
      MediaSetEvent: mediaMod.MediaSetEvent,
      ArtistRole: rolesMod.ArtistRole,
      RoleAddedEvent: rolesMod.RoleAddedEvent,
      TagAddedEvent: tagsMod.TagAddedEvent,
      Cta: ctaMod.Cta,
      CtasSetEvent: ctaMod.CtasSetEvent,
      GenreAddedEvent: genreMod.GenreAddedEvent,
      LinkSetEvent: platformLinkMod.LinkSetEvent,
      LinkClearedEvent: platformLinkMod.LinkClearedEvent,
    };
  }
}

/** @deprecated Use `PartyPlatformClient`. Retained for callers migrating from the pre-split class. */
export { PartyPlatformClient as PartyProtocolClient };
