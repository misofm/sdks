// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { moduleBinder } from "./module-binding.ts";

/**
 * Package-bound generated APIs.
 *
 * `@mysten/codegen` intentionally emits `@local-pkg/*` source labels. This
 * adapter replaces those labels with the exact addresses from a complete Miso
 * deployment manifest, so applications never have to hand-write a Move target.
 */

import { normalizeMisoDeployment, type MisoDeployment } from "./deployments.ts";

import * as composition from "./contracts/miso/composition.ts";
import * as recording from "./contracts/miso/recording.ts";
import * as release from "./contracts/miso/release.ts";
import * as track from "./contracts/miso/track.ts";

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

import * as party from "./contracts/miso_party/party.ts";
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

/** Pin generated calls to the deployment and omit unavailable functions. */
export const bindModulePackage = moduleBinder("pin");

/**
 * Public Move functions that return references. A PTB can borrow internally,
 * but a Move-call command result cannot carry a reference to a later command.
 * Keep them out of `call`; use object/dynamic-field BCS queries instead.
 */
export const REF_RETURNING_CALLS = {
  composition: ["title", "uid", "uidMut"],
  recording: ["uid", "uidMut"],
  release: ["title", "tracks", "uid", "uidMut"],
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
 * All generated functions and BCS codecs bound to one full, verified deployment.
 *
 * The `call` namespaces construct only caller-owned PTB commands. They neither
 * set gas nor sign/execute. Query dynamic fields directly rather than using a
 * Move function whose return type is a reference: PTB command outputs cannot
 * carry references.
 */
export class MisoPackageBindings {
  readonly deployment: MisoDeployment;

  constructor(deployment: MisoDeployment) {
    this.deployment = normalizeMisoDeployment(deployment);
  }

  get call() {
    const d = this.deployment;
    return {
      core: {
        composition: bindModulePackage(composition, d.miso, REF_RETURNING_CALLS.composition),
        recording: bindModulePackage(recording, d.miso, REF_RETURNING_CALLS.recording),
        release: bindModulePackage(release, d.miso, REF_RETURNING_CALLS.release),
        track: bindModulePackage(track, d.miso),
      },
      extensions: {
        compositionCredits: {
          compositionCredits: bindModulePackage(
            compositionCredits,
            d.compositionCredits,
            REF_RETURNING_CALLS.compositionCredits,
          ),
          compositionPartyRole: bindModulePackage(
            compositionPartyRole,
            d.compositionCredits,
          ),
        },
        recordingAdvisory: bindModulePackage(recordingAdvisory, d.recordingAdvisory),
        recordingCredits: {
          recordingCredits: bindModulePackage(
            recordingCredits,
            d.recordingCredits,
            REF_RETURNING_CALLS.recordingCredits,
          ),
          recordingPartyRole: bindModulePackage(
            recordingPartyRole,
            d.recordingCredits,
          ),
        },
        recordingLanguage: bindModulePackage(recordingLanguage, d.recordingLanguage),
        recordingMasterReference: bindModulePackage(
          recordingMasterReference,
          d.recordingMasterReference,
          REF_RETURNING_CALLS.recordingMasterReference,
        ),
        releaseCoverArt: bindModulePackage(
          releaseCoverArt,
          d.releaseCoverArt,
          REF_RETURNING_CALLS.releaseCoverArt,
        ),
        releaseCredits: {
          releaseCredits: bindModulePackage(
            releaseCredits,
            d.releaseCredits,
            REF_RETURNING_CALLS.releaseCredits,
          ),
          releasePartyRole: bindModulePackage(releasePartyRole, d.releaseCredits),
        },
        releaseDescription: bindModulePackage(
          releaseDescription,
          d.releaseDescription,
          REF_RETURNING_CALLS.releaseDescription,
        ),
        releaseDspLink: bindModulePackage(releaseDspLink, d.releaseDspLink),
        releaseGenre: bindModulePackage(releaseGenre, d.releaseGenre),
        releaseKind: bindModulePackage(releaseKind, d.releaseKind),
      },
      primitives: {
        royaltyPool: {
          pool: bindModulePackage(royaltyPool, d.royaltyPool, REF_RETURNING_CALLS.royaltyPool),
          stake: bindModulePackage(royaltyStake, d.royaltyPool, REF_RETURNING_CALLS.royaltyStake),
        },
        routedStake: bindModulePackage(routedStake, d.routedStake, REF_RETURNING_CALLS.routedStake),
      },
      party: {
        core: bindModulePackage(party, d.misoParty, REF_RETURNING_CALLS.party),
        cta: bindModulePackage(partyCta, d.partyCta),
        genre: bindModulePackage(partyGenre, d.partyGenre),
        media: bindModulePackage(partyMedia, d.partyMedia),
        music: bindModulePackage(partyMusic, d.partyMusic),
        platformLink: bindModulePackage(partyPlatformLink, d.partyPlatformLink),
        proLink: bindModulePackage(partyProLink, d.partyProLink),
        profile: bindModulePackage(partyProfile, d.partyProfile, REF_RETURNING_CALLS.partyProfile),
        roles: bindModulePackage(partyRoles, d.partyRoles),
        social: bindModulePackage(partySocial, d.partySocial),
        tags: bindModulePackage(partyTags, d.partyTags),
      },
    };
  }

  /** Generated BCS codecs, grouped with the same ownership boundary as `call`. */
  get bcs() {
    return {
      core: {
        composition: codecsOnly(composition),
        recording: codecsOnly(recording),
        release: codecsOnly(release),
        track: codecsOnly(track),
      },
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
        core: codecsOnly(party),
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

/** Construct complete package bindings from an explicit verified manifest. */
export function misoPackages(deployment: MisoDeployment): MisoPackageBindings {
  return new MisoPackageBindings(deployment);
}
