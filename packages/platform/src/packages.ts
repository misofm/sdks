// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Package-bound generated APIs for the platform layer: extensions, generic
 * royalty/routed-stake primitives, and Party. The object-model core (composition,
 * recording, release, track) has its own `MisoPackageBindings` in
 * `@misofm/musicos/packages` — this class covers everything else.
 *
 * `@mysten/codegen` intentionally emits `@local-pkg/*` source labels. This
 * adapter replaces those labels with the exact addresses from a complete
 * platform deployment manifest, so applications never have to hand-write a
 * Move target.
 */

import { bindModulePackage } from "@misofm/musicos/packages";
// The Party core's generated bindings live in `@misofm/partyos` now (this
// package's own generated `partyos` tree is gone). Binding `call.party.core`/
// `bcs.party.core` from partyos's curated barrel — rather than dropping them —
// keeps this package's single `MisoPlatformPackageBindings` facade covering
// every package a platform deployment addresses, core included, which is what
// `packages.test.ts` exercises.
import { party as partyCoreContracts } from "@misofm/partyos/contracts";
import {
  normalizeMisoPlatformDeployment,
  type MisoPlatformDeployment,
} from "./deployments.ts";

import * as compositionCredits from "./contracts/composition_credits/composition_credits.ts";
import * as compositionPartyRole from "./contracts/composition_credits/composition_party_role.ts";
import * as recordingAdvisory from "./contracts/recording_advisory/recording_advisory.ts";
import * as recordingCredits from "./contracts/recording_credits/recording_credits.ts";
import * as recordingPartyRole from "./contracts/recording_credits/recording_party_role.ts";
import * as recordingLanguage from "./contracts/recording_language/recording_language.ts";
import * as recordingMasterReference from "./contracts/recording_master_reference/recording_master_reference.ts";
import * as releaseCoverArt from "./contracts/release_cover_art/release_cover_art.ts";
import * as releaseCredits from "./contracts/release_credits/release_credits.ts";
import * as releasePartyRole from "./contracts/release_credits/release_party_role.ts";
import * as releaseDescription from "./contracts/release_description/release_description.ts";
import * as releaseDspLink from "./contracts/release_dsp_link/release_dsp_link.ts";
import * as releaseGenre from "./contracts/release_genre/release_genre.ts";
import * as releaseKind from "./contracts/release_kind/release_kind.ts";

import * as royaltyPool from "./contracts/royalty_pool/pool.ts";
import * as royaltyStake from "./contracts/royalty_pool/stake.ts";
import * as routedStake from "./contracts/routed_stake/routed_stake.ts";

import * as partyCta from "./contracts/party_cta/party_cta.ts";
import * as partyGenre from "./contracts/party_genre/party_genre.ts";
import * as partyMedia from "./contracts/party_media/party_media.ts";
import * as partyMusic from "./contracts/party_music/party_music.ts";
import * as partyPlatformLink from "./contracts/party_platform_link/party_platform_link.ts";
import * as partyProLink from "./contracts/party_pro_link/party_pro_link.ts";
import * as partyProfile from "./contracts/party_profile/party_profile.ts";
import * as partyRoles from "./contracts/party_roles/party_roles.ts";
import * as partySocial from "./contracts/party_social/party_social.ts";
import * as partyTags from "./contracts/party_tags/party_tags.ts";

/** Generated modules mix BCS constants with transaction-builder functions. */
type CodecModule<M extends object> = {
  [Key in keyof M as M[Key] extends (...args: never[]) => unknown ? never : Key]: M[Key];
};

/** BCS-only projection: never leak Move-call builders into the `bcs` namespace. */
function codecsOnly<M extends object>(mod: M): CodecModule<M> {
  return Object.fromEntries(
    Object.entries(mod).filter(([, value]) => typeof value !== "function"),
  ) as CodecModule<M>;
}

/**
 * Public Move functions that return references. A PTB can borrow internally,
 * but a Move-call command result cannot carry a reference to a later command.
 * Keep them out of `call`; use object/dynamic-field BCS queries instead.
 */
export const REF_RETURNING_CALLS = {
  compositionCredits: ["credits"],
  recordingCredits: ["credits", "primaryArtistIds", "featuredArtistIds"],
  recordingMasterReference: ["masterReference"],
  releaseCoverArt: ["cover"],
  releaseCredits: ["credits"],
  releaseDescription: ["description"],
  // `new` is emitted as `_new`; its `&mut UID` parent credential cannot be
  // constructed by a caller-side PTB, so only authority-package code may use it.
  royaltyPool: ["balance", "_new"],
  royaltyStake: ["balance", "getRegistration"],
  // These lifecycle functions require a parent `&mut UID`, which cannot be a
  // caller-provided PTB input. Only `share`, `sweep`, scalar reads and derives
  // remain usable at this layer.
  routedStake: ["stake", "_new", "register", "unregister", "unstake", "restake"],
  party: ["groupMembers", "uid", "uidMut"],
  partyProfile: ["profile"],
} as const;

/**
 * All platform generated functions and BCS codecs bound to one full, verified
 * deployment. The `call` namespaces construct only caller-owned PTB commands.
 * They neither set gas nor sign/execute. Query dynamic fields directly rather
 * than using a Move function whose return type is a reference: PTB command
 * outputs cannot carry references.
 */
export class MisoPlatformPackageBindings {
  readonly deployment: MisoPlatformDeployment;

  constructor(deployment: MisoPlatformDeployment) {
    this.deployment = normalizeMisoPlatformDeployment(deployment);
  }

  get call() {
    const p = this.deployment.packages;
    const party_ = this.deployment.party;
    const partyosPkg = this.deployment.partyos.partyos;
    return {
      extensions: {
        compositionCredits: {
          compositionCredits: bindModulePackage(
            compositionCredits,
            p.compositionCredits,
            REF_RETURNING_CALLS.compositionCredits,
          ),
          compositionPartyRole: bindModulePackage(
            compositionPartyRole,
            p.compositionCredits,
          ),
        },
        recordingAdvisory: bindModulePackage(recordingAdvisory, p.recordingAdvisory),
        recordingCredits: {
          recordingCredits: bindModulePackage(
            recordingCredits,
            p.recordingCredits,
            REF_RETURNING_CALLS.recordingCredits,
          ),
          recordingPartyRole: bindModulePackage(
            recordingPartyRole,
            p.recordingCredits,
          ),
        },
        recordingLanguage: bindModulePackage(recordingLanguage, p.recordingLanguage),
        recordingMasterReference: bindModulePackage(
          recordingMasterReference,
          p.recordingMasterReference,
          REF_RETURNING_CALLS.recordingMasterReference,
        ),
        releaseCoverArt: bindModulePackage(
          releaseCoverArt,
          p.releaseCoverArt,
          REF_RETURNING_CALLS.releaseCoverArt,
        ),
        releaseCredits: {
          releaseCredits: bindModulePackage(
            releaseCredits,
            p.releaseCredits,
            REF_RETURNING_CALLS.releaseCredits,
          ),
          releasePartyRole: bindModulePackage(releasePartyRole, p.releaseCredits),
        },
        releaseDescription: bindModulePackage(
          releaseDescription,
          p.releaseDescription,
          REF_RETURNING_CALLS.releaseDescription,
        ),
        releaseDspLink: bindModulePackage(releaseDspLink, p.releaseDspLink),
        releaseGenre: bindModulePackage(releaseGenre, p.releaseGenre),
        releaseKind: bindModulePackage(releaseKind, p.releaseKind),
      },
      primitives: {
        royaltyPool: {
          pool: bindModulePackage(royaltyPool, p.royaltyPool, REF_RETURNING_CALLS.royaltyPool),
          stake: bindModulePackage(royaltyStake, p.royaltyPool, REF_RETURNING_CALLS.royaltyStake),
        },
        routedStake: bindModulePackage(routedStake, p.routedStake, REF_RETURNING_CALLS.routedStake),
      },
      party: {
        // Party core: `@misofm/partyos`'s curated `contracts.party` barrel is
        // already stripped of reference-returning calls (its own
        // PARTY_REF_RETURNING_CALLS, the same set as REF_RETURNING_CALLS.party
        // below), so no `unavailable` list is passed here.
        core: bindModulePackage(partyCoreContracts, partyosPkg),
        cta: bindModulePackage(partyCta, party_.partyCta),
        genre: bindModulePackage(partyGenre, party_.partyGenre),
        media: bindModulePackage(partyMedia, party_.partyMedia),
        music: bindModulePackage(partyMusic, party_.partyMusic),
        platformLink: bindModulePackage(partyPlatformLink, party_.partyPlatformLink),
        proLink: bindModulePackage(partyProLink, party_.partyProLink),
        profile: bindModulePackage(partyProfile, party_.partyProfile, REF_RETURNING_CALLS.partyProfile),
        roles: bindModulePackage(partyRoles, party_.partyRoles),
        social: bindModulePackage(partySocial, party_.partySocial),
        tags: bindModulePackage(partyTags, party_.partyTags),
      },
    };
  }

  /** Generated BCS codecs, grouped with the same ownership boundary as `call`. */
  get bcs() {
    return {
      extensions: {
        compositionCredits: {
          compositionCredits: codecsOnly(compositionCredits),
          compositionPartyRole: codecsOnly(compositionPartyRole),
        },
        recordingAdvisory: codecsOnly(recordingAdvisory),
        recordingCredits: {
          recordingCredits: codecsOnly(recordingCredits),
          recordingPartyRole: codecsOnly(recordingPartyRole),
        },
        recordingLanguage: codecsOnly(recordingLanguage),
        recordingMasterReference: codecsOnly(recordingMasterReference),
        releaseCoverArt: codecsOnly(releaseCoverArt),
        releaseCredits: {
          releaseCredits: codecsOnly(releaseCredits),
          releasePartyRole: codecsOnly(releasePartyRole),
        },
        releaseDescription: codecsOnly(releaseDescription),
        releaseDspLink: codecsOnly(releaseDspLink),
        releaseGenre: codecsOnly(releaseGenre),
        releaseKind: codecsOnly(releaseKind),
      },
      primitives: {
        royaltyPool: { pool: codecsOnly(royaltyPool), stake: codecsOnly(royaltyStake) },
        routedStake: codecsOnly(routedStake),
      },
      party: {
        core: codecsOnly(partyCoreContracts),
        cta: codecsOnly(partyCta),
        genre: codecsOnly(partyGenre),
        media: codecsOnly(partyMedia),
        music: codecsOnly(partyMusic),
        platformLink: codecsOnly(partyPlatformLink),
        proLink: codecsOnly(partyProLink),
        profile: codecsOnly(partyProfile),
        roles: codecsOnly(partyRoles),
        social: codecsOnly(partySocial),
        tags: codecsOnly(partyTags),
      },
    };
  }
}

/** Construct complete platform package bindings from an explicit verified manifest. */
export function misoPlatformPackages(
  deployment: MisoPlatformDeployment,
): MisoPlatformPackageBindings {
  return new MisoPlatformPackageBindings(deployment);
}
