// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Barrel for the codegen-generated, ABI-bound bindings (BCS structs + type-safe
// Move calls). Re-exported from the package root as the `contracts` namespace.

// Every package here is generated from the current first-party Move source. The
// generated default `@local-pkg/*` identities are source labels only: callers
// must inject exact published addresses through `MisoDeployment` before building
// a transaction. Do not use a historic package ID as a substitute for a fresh
// deployment.

type PublicModule<M extends object, K extends readonly (keyof M)[]> = Omit<M, K[number]>;
function withoutUnsafeCalls<M extends object, K extends readonly (keyof M)[]>(
  module: M,
  keys: K,
): PublicModule<M, K> {
  return Object.fromEntries(Object.entries(module).filter(([key]) => !keys.includes(key as keyof M))) as PublicModule<M, K>;
}

import * as rawComposition from "./contracts/miso/composition.ts";
import * as rawRecording from "./contracts/miso/recording.ts";
import * as rawRelease from "./contracts/miso/release.ts";
import * as rawCompositionCredits from "./contracts/composition_credits/composition_credits.ts";
import * as rawRecordingCredits from "./contracts/recording_credits/recording_credits.ts";
import * as rawRecordingMasterReference from "./contracts/recording_master_reference/recording_master_reference.ts";
import * as rawReleaseCoverArt from "./contracts/release_cover_art/release_cover_art.ts";
import * as rawReleaseCredits from "./contracts/release_credits/release_credits.ts";
import * as rawReleaseDescription from "./contracts/release_description/release_description.ts";
import * as rawRoyaltyPool from "./contracts/royalty_pool/pool.ts";
import * as rawRoyaltyStake from "./contracts/royalty_pool/stake.ts";
import * as rawRoutedStake from "./contracts/routed_stake/routed_stake.ts";
import * as rawParty from "./contracts/miso_party/party.ts";
import * as rawPartyProfile from "./contracts/party_profile/party_profile.ts";

// Protocol core (BCS codecs remain available; PTB-inaccessible references do not).
export const composition = withoutUnsafeCalls(rawComposition, ["title", "uid", "uidMut"] as const);
export const recording = withoutUnsafeCalls(rawRecording, ["uid", "uidMut"] as const);
export const release = withoutUnsafeCalls(rawRelease, ["title", "tracks", "uid", "uidMut"] as const);
export * as track from "./contracts/miso/track.ts";

// Protocol extensions.
export const compositionCredits = withoutUnsafeCalls(rawCompositionCredits, ["credits"] as const);
export * as compositionPartyRole from "./contracts/composition_credits/composition_party_role.ts";
export * as recordingAdvisory from "./contracts/recording_advisory/recording_advisory.ts";
export const recordingCredits = withoutUnsafeCalls(rawRecordingCredits, ["credits", "primaryArtistIds", "featuredArtistIds"] as const);
export * as recordingPartyRole from "./contracts/recording_credits/recording_party_role.ts";
export * as recordingLanguage from "./contracts/recording_language/recording_language.ts";
export const recordingMasterReference = withoutUnsafeCalls(rawRecordingMasterReference, ["masterReference"] as const);
export const releaseCoverArt = withoutUnsafeCalls(rawReleaseCoverArt, ["cover"] as const);
export const releaseCredits = withoutUnsafeCalls(rawReleaseCredits, ["credits"] as const);
export * as releasePartyRole from "./contracts/release_credits/release_party_role.ts";
export const releaseDescription = withoutUnsafeCalls(rawReleaseDescription, ["description"] as const);
export * as releaseDspLink from "./contracts/release_dsp_link/release_dsp_link.ts";
export * as releaseGenre from "./contracts/release_genre/release_genre.ts";
export * as releaseKind from "./contracts/release_kind/release_kind.ts";

// First-party generic primitives.
export const royaltyPool = withoutUnsafeCalls(rawRoyaltyPool, ["balance", "_new"] as const);
export const royaltyStake = withoutUnsafeCalls(rawRoyaltyStake, ["balance", "getRegistration"] as const);
export const routedStake = withoutUnsafeCalls(
  rawRoutedStake,
  ["stake", "_new", "register", "unregister", "unstake", "restake"] as const,
);

// Party core and extensions.
export const party = withoutUnsafeCalls(rawParty, ["groupMembers", "uid", "uidMut"] as const);
export * as partyCta from "./contracts/party_cta/party_cta.ts";
export * as partyGenre from "./contracts/party_genre/party_genre.ts";
export * as partyMedia from "./contracts/party_media/party_media.ts";
export * as partyMusic from "./contracts/party_music/party_music.ts";
export * as partyPlatformLink from "./contracts/party_platform_link/party_platform_link.ts";
export * as partyProLink from "./contracts/party_pro_link/party_pro_link.ts";
export const partyProfile = withoutUnsafeCalls(rawPartyProfile, ["profile"] as const);
export * as partyRoles from "./contracts/party_roles/party_roles.ts";
export * as partySocial from "./contracts/party_social/party_social.ts";
export * as partyTags from "./contracts/party_tags/party_tags.ts";
