// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { moduleBinder } from "../module-binding.ts";

// Party queries and transaction builders bound to the same complete deployment
// as `MisoProtocolClient`. Consumers reach this through `client.miso.party`.

import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { MisoDeployment } from "../deployments.ts";
import type { TxThunk } from "./transactions.ts";
import * as queries from "./queries.ts";
import * as transactions from "./transactions.ts";
import * as profileExt from "./extensions/profile.ts";
import * as mediaExt from "./extensions/media.ts";
import * as rolesExt from "./extensions/roles.ts";
import * as tagsExt from "./extensions/tags.ts";
import * as genresExt from "./extensions/genres.ts";
import * as ctasExt from "./extensions/ctas.ts";
import * as linksExt from "./extensions/links.ts";
import type { Cta, Media, Party, PlatformKey, PlatformLink, Profile } from "./types.ts";
import * as partyMod from "../contracts/miso_party/party.ts";
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


// Preserve the legacy Party caller-override policy.
const bindModulePackage = moduleBinder("default");

/** Package-bound Party client exposed at `client.miso.party`. */
export class PartyProtocolClient {
  #client: ClientWithCoreApi;
  readonly #deployment: Readonly<MisoDeployment>;

  constructor(client: ClientWithCoreApi, o: MisoDeployment) {
    this.#client = client;
    this.#deployment = { ...o };
  }

  /**
   * The `genre` vocabulary package id. Callers resolve `Genre` objects from it to
   * pass to `tx.addGenre` (which takes a genre object id, not this package).
   */
  get genrePackageId(): string {
    return this.#deployment.genre;
  }

  // === Queries ===

  getPartyById(partyId: string): Promise<Party> {
    return queries.getPartyById(this.#client, partyId, this.#deployment.misoParty);
  }
  getPartyByIdEffect(partyId: string) {
    return queries.getPartyByIdEffect(this.#client, partyId, this.#deployment.misoParty);
  }
  getPartiesByIds(
    partyIds: readonly string[],
  ): Promise<Partial<Record<string, Party>>> {
    return queries.getPartiesByIds(this.#client, partyIds, this.#deployment.misoParty);
  }
  getPartiesByIdsEffect(
    partyIds: readonly string[],
  ) {
    return queries.getPartiesByIdsEffect(this.#client, partyIds, this.#deployment.misoParty);
  }
  derivePartyAdminCapId(partyId: string): string {
    return queries.derivePartyAdminCapId(partyId, this.#deployment.misoParty);
  }
  getProfile(partyId: string): Promise<Profile | null> {
    return queries.getProfile(this.#client, partyId, this.#deployment.partyProfile);
  }
  getProfileEffect(partyId: string) {
    return queries.getProfileEffect(this.#client, partyId, this.#deployment.partyProfile);
  }
  getMedia(partyId: string): Promise<Media | null> {
    return queries.getMedia(this.#client, partyId, this.#deployment.partyMedia);
  }
  getMediaEffect(partyId: string) {
    return queries.getMediaEffect(this.#client, partyId, this.#deployment.partyMedia);
  }
  /** The party's artist-type roles (display names). */
  getRoles(partyId: string): Promise<string[]> {
    return queries.getRoles(this.#client, partyId, this.#deployment.partyRoles);
  }
  getRolesEffect(partyId: string) {
    return queries.getRolesEffect(this.#client, partyId, this.#deployment.partyRoles);
  }
  /** The party's free-form tags. */
  getTags(partyId: string): Promise<string[]> {
    return queries.getTags(this.#client, partyId, this.#deployment.partyTags);
  }
  getTagsEffect(partyId: string) {
    return queries.getTagsEffect(this.#client, partyId, this.#deployment.partyTags);
  }
  /** The party's genre object ids. */
  getGenres(partyId: string): Promise<string[]> {
    return queries.getGenres(this.#client, partyId, this.#deployment.partyGenre);
  }
  getGenresEffect(partyId: string) {
    return queries.getGenresEffect(this.#client, partyId, this.#deployment.partyGenre);
  }
  /** The party's ordered CTA list (position is priority). */
  getCtas(partyId: string): Promise<Cta[]> {
    return queries.getCtas(this.#client, partyId, this.#deployment.partyCta);
  }
  getCtasEffect(partyId: string) {
    return queries.getCtasEffect(this.#client, partyId, this.#deployment.partyCta);
  }
  /** All external-platform links attached to the party (social, music, professional). */
  getLinks(partyId: string): Promise<PlatformLink[]> {
    return queries.getLinks(this.#client, partyId);
  }
  getLinksEffect(partyId: string) {
    return queries.getLinksEffect(this.#client, partyId);
  }
  /** Group ids a party belongs to (member-side membership records). */
  getMemberships(partyId: string): Promise<string[]> {
    return queries.getMemberships(this.#client, partyId);
  }
  getMembershipsEffect(partyId: string) {
    return queries.getMembershipsEffect(this.#client, partyId);
  }
  /** Member ids invited to a group but not yet accepted. */
  getPendingInvites(groupId: string): Promise<string[]> {
    return queries.getPendingInvites(this.#client, groupId);
  }
  getPendingInvitesEffect(groupId: string) {
    return queries.getPendingInvitesEffect(this.#client, groupId);
  }
  /** Group ids that have invited this party but are awaiting its response. */
  getPendingMemberships(partyId: string): Promise<string[]> {
    return queries.getPendingMemberships(this.#client, partyId);
  }
  getPendingMembershipsEffect(partyId: string) {
    return queries.getPendingMembershipsEffect(this.#client, partyId);
  }
  /** Whether a party is a member of a group. */
  isMember(memberId: string, groupId: string): Promise<boolean> {
    return queries.isMember(this.#client, memberId, groupId, this.#deployment.misoParty);
  }
  isMemberEffect(memberId: string, groupId: string) {
    return queries.isMemberEffect(this.#client, memberId, groupId, this.#deployment.misoParty);
  }

  // === Transaction builders (thunks; package ids bound from the client) ===

  get tx() {
    const pkg = this.#deployment.misoParty;
    const profilePkg = this.#deployment.partyProfile;
    const cc = this.#deployment.countryCode;
    const lc = this.#deployment.languageCode;
    const mediaPkg = this.#deployment.partyMedia;
    const rolesPkg = this.#deployment.partyRoles;
    const tagsPkg = this.#deployment.partyTags;
    const ctaPkg = this.#deployment.partyCta;
    const partyGenrePkg = this.#deployment.partyGenre;
    const linkIds: linksExt.LinkPackageIds = {
      partyPlatformLinkPackageId: this.#deployment.partyPlatformLink,
      partySocialPackageId: this.#deployment.partySocial,
      partyMusicPackageId: this.#deployment.partyMusic,
      partyProLinkPackageId: this.#deployment.partyProLink,
    };
    return {
      createIndividualParty: (p: Omit<transactions.CreatePartyParams, "partyPackageId">): TxThunk =>
        transactions.createIndividualParty({ ...p, partyPackageId: pkg }),
      createGroupParty: (p: Omit<transactions.CreatePartyParams, "partyPackageId">): TxThunk =>
        transactions.createGroupParty({ ...p, partyPackageId: pkg }),
      setName: (p: Omit<transactions.SetNameParams, "partyPackageId">): TxThunk =>
        transactions.setName({ ...p, partyPackageId: pkg }),
      inviteParty: (p: Omit<transactions.InvitePartyParams, "partyPackageId">): TxThunk =>
        transactions.inviteParty({ ...p, partyPackageId: pkg }),
      acceptInvite: (p: Omit<transactions.AcceptInviteParams, "partyPackageId">): TxThunk =>
        transactions.acceptInvite({ ...p, partyPackageId: pkg }),
      declineInvite: (p: Omit<transactions.DeclineInviteParams, "partyPackageId">): TxThunk =>
        transactions.declineInvite({ ...p, partyPackageId: pkg }),
      revokeInvite: (p: Omit<transactions.RevokeInviteParams, "partyPackageId">): TxThunk =>
        transactions.revokeInvite({ ...p, partyPackageId: pkg }),
      leaveGroup: (p: Omit<transactions.LeaveGroupParams, "partyPackageId">): TxThunk =>
        transactions.leaveGroup({ ...p, partyPackageId: pkg }),
      removeMember: (p: Omit<transactions.RemoveMemberParams, "partyPackageId">): TxThunk =>
        transactions.removeMember({ ...p, partyPackageId: pkg }),
      setProfile: (
        p: Omit<profileExt.SetProfileParams, "partyProfilePackageId" | "countryCodePackageId" | "languageCodePackageId">,
      ): TxThunk =>
        profileExt.setProfile({
          ...p,
          partyProfilePackageId: profilePkg,
          countryCodePackageId: cc,
          languageCodePackageId: lc,
        }),
      clearProfile: (p: Omit<profileExt.ClearProfileParams, "partyProfilePackageId">): TxThunk =>
        profileExt.clearProfile({ ...p, partyProfilePackageId: profilePkg }),
      setMedia: (p: Omit<mediaExt.SetMediaParams, "partyMediaPackageId">): TxThunk =>
        mediaExt.setMedia({ ...p, partyMediaPackageId: mediaPkg }),
      clearMedia: (p: Omit<mediaExt.ClearMediaParams, "partyMediaPackageId">): TxThunk =>
        mediaExt.clearMedia({ ...p, partyMediaPackageId: mediaPkg }),
      // Roles
      addRole: (p: Omit<rolesExt.AddRoleParams, "partyRolesPackageId">): TxThunk =>
        rolesExt.addRole({ ...p, partyRolesPackageId: rolesPkg }),
      removeRole: (p: Omit<rolesExt.RemoveRoleParams, "partyRolesPackageId">): TxThunk =>
        rolesExt.removeRole({ ...p, partyRolesPackageId: rolesPkg }),
      clearRoles: (p: Omit<rolesExt.ClearRolesParams, "partyRolesPackageId">): TxThunk =>
        rolesExt.clearRoles({ ...p, partyRolesPackageId: rolesPkg }),
      // Tags
      addTag: (p: Omit<tagsExt.AddTagParams, "partyTagsPackageId">): TxThunk =>
        tagsExt.addTag({ ...p, partyTagsPackageId: tagsPkg }),
      removeTag: (p: Omit<tagsExt.RemoveTagParams, "partyTagsPackageId">): TxThunk =>
        tagsExt.removeTag({ ...p, partyTagsPackageId: tagsPkg }),
      clearTags: (p: Omit<tagsExt.ClearTagsParams, "partyTagsPackageId">): TxThunk =>
        tagsExt.clearTags({ ...p, partyTagsPackageId: tagsPkg }),
      // Genres
      addGenre: (p: Omit<genresExt.AddGenreParams, "partyGenrePackageId">): TxThunk =>
        genresExt.addGenre({ ...p, partyGenrePackageId: partyGenrePkg }),
      removeGenre: (p: Omit<genresExt.RemoveGenreParams, "partyGenrePackageId">): TxThunk =>
        genresExt.removeGenre({ ...p, partyGenrePackageId: partyGenrePkg }),
      clearGenres: (p: Omit<genresExt.ClearGenresParams, "partyGenrePackageId">): TxThunk =>
        genresExt.clearGenres({ ...p, partyGenrePackageId: partyGenrePkg }),
      // CTAs
      setCtas: (p: Omit<ctasExt.SetCtasParams, "partyCtaPackageId">): TxThunk =>
        ctasExt.setCtas({ ...p, partyCtaPackageId: ctaPkg }),
      clearCtas: (p: Omit<ctasExt.ClearCtasParams, "partyCtaPackageId">): TxThunk =>
        ctasExt.clearCtas({ ...p, partyCtaPackageId: ctaPkg }),
      // Platform links — generic (any platform) plus per-platform `set…`/`clear…`.
      setLink: (platform: PlatformKey, p: linksExt.BoundSetLinkParams): TxThunk =>
        linksExt.setLink(platform, { ...p, ...linkIds }),
      clearLink: (platform: PlatformKey, p: linksExt.BoundClearLinkParams): TxThunk =>
        linksExt.clearLink(platform, { ...p, ...linkIds }),
      ...linksExt.linkTxBuilders(linkIds),
    };
  }

  // === Generated type-safe Move calls (for tx.add) ===

  get call() {
    return {
      party: bindModulePackage(partyMod, this.#deployment.misoParty, ["groupMembers", "uid", "uidMut"] as const),
      profile: bindModulePackage(profileMod, this.#deployment.partyProfile, ["profile"] as const),
      media: bindModulePackage(mediaMod, this.#deployment.partyMedia),
      roles: bindModulePackage(rolesMod, this.#deployment.partyRoles),
      tags: bindModulePackage(tagsMod, this.#deployment.partyTags),
      cta: bindModulePackage(ctaMod, this.#deployment.partyCta),
      genre: bindModulePackage(genreMod, this.#deployment.partyGenre),
      platformLink: bindModulePackage(platformLinkMod, this.#deployment.partyPlatformLink),
      social: bindModulePackage(socialMod, this.#deployment.partySocial),
      music: bindModulePackage(musicMod, this.#deployment.partyMusic),
      proLink: bindModulePackage(proLinkMod, this.#deployment.partyProLink),
    };
  }

  // === Generated BCS structs (for parsing object/event content) ===

  get bcs() {
    return {
      Party: partyMod.Party,
      PartyAdminCap: partyMod.PartyAdminCap,
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
