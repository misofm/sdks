// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// `MisoPartyService`: the party surface consumers reach through
// `client.miso.party` (misofm/sdks#35, WP3 "party and protocol composition").
// It is not a `Context.Service` of its own — it is a plain object `Miso`'s
// `make` assembles from the converted `@misofm/partyos` `Partyos` service (7
// core delegations) plus this package's own party EXTENSION reads
// (`party/queries.ts`, already converted in stage 1) and 25 `tx` fragments
// (9 from `Partyos.tx`, 16 first-party extension builders), bound to one
// `PartyExtensionsDeployment`. Per sui-effect's `docs/extensions.md` §12
// ("converting an existing facade", step 3): the service's members are thin —
// they close over the `Sui` the caller already holds and call the standalone
// `party/queries.ts` functions, which keeps those functions independently
// exported and usable without a service.
//
// `PartyPlatformClient` — the predecessor hand-written class this replaces —
// is deleted per the issue's target shape; nothing here holds a client or a
// signer.

import type { Option } from "effect";
import { Effect } from "effect";
import { Sui, type ObjectId, type Recipe, type DecodeError, type SuiService, type TransportError } from "@unconfirmed/sui-effect";
import { contracts, derivePartyAdminCapId, type PartyosService } from "@misofm/partyos";
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
export function bindModulePackage<M extends object, K extends readonly (keyof M)[] = readonly []>(
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

/** The 25 `tx` fragments `MisoPartyService.tx` exposes: 9 delegated from `Partyos.tx`, 16 first-party extensions. */
export type PartyTxBuilders = PartyosService["tx"] & {
  readonly setProfile: (p: Omit<profileExt.SetProfileParams, "partyProfilePackageId" | "countryCodePackageId" | "languageCodePackageId">) => Recipe;
  readonly clearProfile: (p: Omit<profileExt.ClearProfileParams, "partyProfilePackageId">) => Recipe;
  readonly setMedia: (p: Omit<mediaExt.SetMediaParams, "partyMediaPackageId">) => Recipe;
  readonly clearMedia: (p: Omit<mediaExt.ClearMediaParams, "partyMediaPackageId">) => Recipe;
  readonly addRole: (p: Omit<rolesExt.AddRoleParams, "partyRolesPackageId">) => Recipe;
  readonly removeRole: (p: Omit<rolesExt.RemoveRoleParams, "partyRolesPackageId">) => Recipe;
  readonly clearRoles: (p: Omit<rolesExt.ClearRolesParams, "partyRolesPackageId">) => Recipe;
  readonly addTag: (p: Omit<tagsExt.AddTagParams, "partyTagsPackageId">) => Recipe;
  readonly removeTag: (p: Omit<tagsExt.RemoveTagParams, "partyTagsPackageId">) => Recipe;
  readonly clearTags: (p: Omit<tagsExt.ClearTagsParams, "partyTagsPackageId">) => Recipe;
  readonly addGenre: (p: Omit<genresExt.AddGenreParams, "partyGenrePackageId">) => Recipe;
  readonly removeGenre: (p: Omit<genresExt.RemoveGenreParams, "partyGenrePackageId">) => Recipe;
  readonly clearGenres: (p: Omit<genresExt.ClearGenresParams, "partyGenrePackageId">) => Recipe;
  readonly setCtas: (p: Omit<ctasExt.SetCtasParams, "partyCtaPackageId">) => Recipe;
  readonly clearCtas: (p: Omit<ctasExt.ClearCtasParams, "partyCtaPackageId">) => Recipe;
  readonly setLink: (platform: PlatformKey, p: linksExt.BoundSetLinkParams) => Recipe;
  readonly clearLink: (platform: PlatformKey, p: linksExt.BoundClearLinkParams) => Recipe;
} & linksExt.LinkTxBuilders;

/**
 * The party surface at `client.miso.party`: the converted `@misofm/partyos`
 * core (delegated, unchanged) plus this package's own party EXTENSION reads
 * and transaction fragments, bound to one `PartyExtensionsDeployment`.
 */
export interface MisoPartyService {
  // === Core (delegated to `Partyos`) ===
  readonly getPartyById: PartyosService["getPartyById"];
  readonly getPartiesByIds: PartyosService["getPartiesByIds"];
  /** Derives a party's `PartyAdminCap` id (it is a `derived_object` off the party UID). Never fails. */
  readonly derivePartyAdminCapId: (partyId: string) => ObjectId;
  readonly getMemberships: PartyosService["getMemberships"];
  readonly getPendingInvites: PartyosService["getPendingInvites"];
  readonly getPendingMemberships: PartyosService["getPendingMemberships"];
  readonly isMember: PartyosService["isMember"];

  // === Extension queries (this package's own) ===
  /** Fails with: `DecodeError`, `TransportError`. */
  readonly getProfile: (partyId: string) => Effect.Effect<Option.Option<Profile>, DecodeError | TransportError>;
  /** Fails with: `DecodeError`, `TransportError`. */
  readonly getMedia: (partyId: string) => Effect.Effect<Option.Option<Media>, DecodeError | TransportError>;
  /** The party's artist-type roles (display names), or `[]`. Fails with: `DecodeError`, `TransportError`. */
  readonly getRoles: (partyId: string) => Effect.Effect<string[], DecodeError | TransportError>;
  /** The party's free-form tags, or `[]`. Fails with: `DecodeError`, `TransportError`. */
  readonly getTags: (partyId: string) => Effect.Effect<string[], DecodeError | TransportError>;
  /** The party's genre object ids, or `[]`. Fails with: `DecodeError`, `TransportError`. */
  readonly getGenres: (partyId: string) => Effect.Effect<string[], DecodeError | TransportError>;
  /** The party's ordered CTA list (position is priority), or `[]`. Fails with: `DecodeError`, `TransportError`. */
  readonly getCtas: (partyId: string) => Effect.Effect<Cta[], DecodeError | TransportError>;
  /** All external-platform links attached to the party. Fails with: `DecodeError`, `TransportError`. */
  readonly getLinks: (partyId: string) => Effect.Effect<PlatformLink[], DecodeError | TransportError>;

  /**
   * The 25 `tx` fragments (9 delegated from `Partyos.tx`, 16 first-party
   * extension builders) with every package id bound to this deployment.
   * Never fails; a recipe is synchronous and `Tx.build` reports one that
   * throws as a `BuildError`.
   */
  readonly tx: PartyTxBuilders;
  /** Generated type-safe Move calls (for `tx.add`), package-bound. */
  readonly call: {
    readonly party: ReturnType<typeof bindModulePackage<typeof contracts.party>>;
    readonly profile: ReturnType<typeof bindModulePackage<typeof profileMod, readonly ["profile"]>>;
    readonly media: ReturnType<typeof bindModulePackage<typeof mediaMod>>;
    readonly roles: ReturnType<typeof bindModulePackage<typeof rolesMod>>;
    readonly tags: ReturnType<typeof bindModulePackage<typeof tagsMod>>;
    readonly cta: ReturnType<typeof bindModulePackage<typeof ctaMod>>;
    readonly genre: ReturnType<typeof bindModulePackage<typeof genreMod>>;
    readonly platformLink: ReturnType<typeof bindModulePackage<typeof platformLinkMod>>;
    readonly social: ReturnType<typeof bindModulePackage<typeof socialMod>>;
    readonly music: ReturnType<typeof bindModulePackage<typeof musicMod>>;
    readonly proLink: ReturnType<typeof bindModulePackage<typeof proLinkMod>>;
  };
  /** Generated BCS structs (for parsing object/event content). */
  readonly bcs: {
    readonly Profile: typeof profileMod.Profile;
    readonly ProfileSetEvent: typeof profileMod.PartyProfileSetEvent;
    readonly PartyProfileSetEvent: typeof profileMod.PartyProfileSetEvent;
    readonly PartyProfileClearedEvent: typeof profileMod.PartyProfileClearedEvent;
    readonly Media: typeof mediaMod.Media;
    readonly MediaSetEvent: typeof mediaMod.MediaSetEvent;
    readonly MediaClearedEvent: typeof mediaMod.MediaClearedEvent;
    readonly ArtistRole: typeof rolesMod.ArtistRole;
    readonly RoleAddedEvent: typeof rolesMod.RoleAddedEvent;
    readonly RoleRemovedEvent: typeof rolesMod.RoleRemovedEvent;
    readonly RolesClearedEvent: typeof rolesMod.RolesClearedEvent;
    readonly TagAddedEvent: typeof tagsMod.TagAddedEvent;
    readonly TagRemovedEvent: typeof tagsMod.TagRemovedEvent;
    readonly TagsClearedEvent: typeof tagsMod.TagsClearedEvent;
    readonly Cta: typeof ctaMod.Cta;
    readonly CtasSetEvent: typeof ctaMod.CtasSetEvent;
    readonly CtasClearedEvent: typeof ctaMod.CtasClearedEvent;
    readonly GenreAddedEvent: typeof genreMod.GenreAddedEvent;
    readonly GenreRemovedEvent: typeof genreMod.GenreRemovedEvent;
    readonly GenresClearedEvent: typeof genreMod.GenresClearedEvent;
    readonly LinkSetEvent: typeof platformLinkMod.LinkSetEvent;
    readonly LinkClearedEvent: typeof platformLinkMod.LinkClearedEvent;
  };
}

/**
 * Assembles {@link MisoPartyService} from the converted `Partyos` service and
 * `Sui`, bound to `deployment` — called from `Miso`'s own `make` (which
 * already holds both), per `docs/extensions.md` §12 step 3: a thin service
 * layer over standalone functions, closing over the `Sui` the caller already
 * has rather than adding a requirement of its own.
 */
export function makeMisoParty(sui: SuiService, partyos: PartyosService, deployment: PartyExtensionsDeployment): MisoPartyService {
  const withSui = <A, E>(effect: Effect.Effect<A, E, Sui>): Effect.Effect<A, E> =>
    effect.pipe(Effect.provideService(Sui, sui));

  const profilePkg = deployment.partyProfile;
  const cc = deployment.countryCode;
  const lc = deployment.languageCode;
  const mediaPkg = deployment.partyMedia;
  const rolesPkg = deployment.partyRoles;
  const tagsPkg = deployment.partyTags;
  const ctaPkg = deployment.partyCta;
  const partyGenrePkg = deployment.partyGenre;
  const linkIds: linksExt.LinkPackageIds = {
    partyPlatformLinkPackageId: deployment.partyPlatformLink,
    partySocialPackageId: deployment.partySocial,
    partyMusicPackageId: deployment.partyMusic,
    partyProLinkPackageId: deployment.partyProLink,
  };

  const tx: PartyTxBuilders = {
    ...partyos.tx,
    setProfile: (p) => profileExt.setProfile({ ...p, partyProfilePackageId: profilePkg, countryCodePackageId: cc, languageCodePackageId: lc }),
    clearProfile: (p) => profileExt.clearProfile({ ...p, partyProfilePackageId: profilePkg }),
    setMedia: (p) => mediaExt.setMedia({ ...p, partyMediaPackageId: mediaPkg }),
    clearMedia: (p) => mediaExt.clearMedia({ ...p, partyMediaPackageId: mediaPkg }),
    addRole: (p) => rolesExt.addRole({ ...p, partyRolesPackageId: rolesPkg }),
    removeRole: (p) => rolesExt.removeRole({ ...p, partyRolesPackageId: rolesPkg }),
    clearRoles: (p) => rolesExt.clearRoles({ ...p, partyRolesPackageId: rolesPkg }),
    addTag: (p) => tagsExt.addTag({ ...p, partyTagsPackageId: tagsPkg }),
    removeTag: (p) => tagsExt.removeTag({ ...p, partyTagsPackageId: tagsPkg }),
    clearTags: (p) => tagsExt.clearTags({ ...p, partyTagsPackageId: tagsPkg }),
    addGenre: (p) => genresExt.addGenre({ ...p, partyGenrePackageId: partyGenrePkg }),
    removeGenre: (p) => genresExt.removeGenre({ ...p, partyGenrePackageId: partyGenrePkg }),
    clearGenres: (p) => genresExt.clearGenres({ ...p, partyGenrePackageId: partyGenrePkg }),
    setCtas: (p) => ctasExt.setCtas({ ...p, partyCtaPackageId: ctaPkg }),
    clearCtas: (p) => ctasExt.clearCtas({ ...p, partyCtaPackageId: ctaPkg }),
    setLink: (platform, p) => linksExt.setLink(platform, { ...p, ...linkIds }),
    clearLink: (platform, p) => linksExt.clearLink(platform, { ...p, ...linkIds }),
    ...linksExt.linkTxBuilders(linkIds),
  };

  return {
    getPartyById: partyos.getPartyById,
    getPartiesByIds: partyos.getPartiesByIds,
    derivePartyAdminCapId: (partyId) => derivePartyAdminCapId(partyId, partyos.deployment.partyos),
    getMemberships: partyos.getMemberships,
    getPendingInvites: partyos.getPendingInvites,
    getPendingMemberships: partyos.getPendingMemberships,
    isMember: partyos.isMember,

    getProfile: (partyId) => withSui(queries.getProfile(partyId, profilePkg)),
    getMedia: (partyId) => withSui(queries.getMedia(partyId, mediaPkg)),
    getRoles: (partyId) => withSui(queries.getRoles(partyId, rolesPkg)),
    getTags: (partyId) => withSui(queries.getTags(partyId, tagsPkg)),
    getGenres: (partyId) => withSui(queries.getGenres(partyId, partyGenrePkg)),
    getCtas: (partyId) => withSui(queries.getCtas(partyId, ctaPkg)),
    getLinks: (partyId) => withSui(queries.getLinks(partyId)),

    tx,
    call: {
      party: bindModulePackage(contracts.party, partyos.deployment.partyos),
      profile: bindModulePackage(profileMod, profilePkg, ["profile"] as const),
      media: bindModulePackage(mediaMod, mediaPkg),
      roles: bindModulePackage(rolesMod, rolesPkg),
      tags: bindModulePackage(tagsMod, tagsPkg),
      cta: bindModulePackage(ctaMod, ctaPkg),
      genre: bindModulePackage(genreMod, partyGenrePkg),
      platformLink: bindModulePackage(platformLinkMod, linkIds.partyPlatformLinkPackageId),
      social: bindModulePackage(socialMod, linkIds.partySocialPackageId),
      music: bindModulePackage(musicMod, linkIds.partyMusicPackageId),
      proLink: bindModulePackage(proLinkMod, linkIds.partyProLinkPackageId),
    },
    bcs: {
      Profile: profileMod.Profile,
      ProfileSetEvent: profileMod.PartyProfileSetEvent,
      PartyProfileSetEvent: profileMod.PartyProfileSetEvent,
      PartyProfileClearedEvent: profileMod.PartyProfileClearedEvent,
      Media: mediaMod.Media,
      MediaSetEvent: mediaMod.MediaSetEvent,
      MediaClearedEvent: mediaMod.MediaClearedEvent,
      ArtistRole: rolesMod.ArtistRole,
      RoleAddedEvent: rolesMod.RoleAddedEvent,
      RoleRemovedEvent: rolesMod.RoleRemovedEvent,
      RolesClearedEvent: rolesMod.RolesClearedEvent,
      TagAddedEvent: tagsMod.TagAddedEvent,
      TagRemovedEvent: tagsMod.TagRemovedEvent,
      TagsClearedEvent: tagsMod.TagsClearedEvent,
      Cta: ctaMod.Cta,
      CtasSetEvent: ctaMod.CtasSetEvent,
      CtasClearedEvent: ctaMod.CtasClearedEvent,
      GenreAddedEvent: genreMod.GenreAddedEvent,
      GenreRemovedEvent: genreMod.GenreRemovedEvent,
      GenresClearedEvent: genreMod.GenresClearedEvent,
      LinkSetEvent: platformLinkMod.LinkSetEvent,
      LinkClearedEvent: platformLinkMod.LinkClearedEvent,
    },
  };
}
