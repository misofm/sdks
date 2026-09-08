// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Barrel for the codegen-generated, ABI-bound bindings (BCS structs + type-safe
// Move calls). Re-exported from the package root as the `contracts` namespace.
//
// The object-model core (`musicos`: Composition, Recording, Release, Track)
// generates into `@misofm/musicos` and is re-exported from ITS `contracts`
// namespace — import it from there rather than mirroring it here. Everything
// else Miso offers on top of the object model — extensions, generic royalty
// primitives, the Party extensions (the Party core is `@misofm/partyos`),
// Record/Record Shop — lives in this barrel.

// Every package here is generated from the current first-party Move source. The
// generated default `@local-pkg/*` identities are source labels only: callers
// must inject exact published addresses through a complete deployment before
// building a transaction. Do not use a historic package ID as a substitute for
// a fresh deployment.

type PublicModule<M extends object, K extends readonly (keyof M)[]> = Omit<M, K[number]>;
function withoutUnsafeCalls<M extends object, K extends readonly (keyof M)[]>(
  module: M,
  keys: K,
): PublicModule<M, K> {
  return Object.fromEntries(Object.entries(module).filter(([key]) => !keys.includes(key as keyof M))) as PublicModule<M, K>;
}

import * as rawCompositionCredits from "./contracts/composition_credits/composition_credits.ts";
import * as rawRecordingCredits from "./contracts/recording_credits/recording_credits.ts";
import * as rawRecordingMasterReference from "./contracts/recording_master_reference/recording_master_reference.ts";
import * as rawReleaseCoverArt from "./contracts/release_cover_art/release_cover_art.ts";
import * as rawReleaseCredits from "./contracts/release_credits/release_credits.ts";
import * as rawReleaseDescription from "./contracts/release_description/release_description.ts";
import * as rawRoyaltyPool from "./contracts/royalty_pool/pool.ts";
import * as rawRoyaltyStake from "./contracts/royalty_pool/stake.ts";
import * as rawRoutedStake from "./contracts/routed_stake/routed_stake.ts";
import * as rawPartyProfile from "./contracts/party_profile/party_profile.ts";

// Record identity/issuance and Record Shop primary-sale mechanics. The
// package-restricted witness constructor is intentionally not exported here.
export * as record from "./contracts/record/record.ts";
export * as pressing from "./contracts/record/pressing.ts";
export * as listing from "./contracts/record_shop/listing.ts";

// Generic royalty-pool primitive, raw-cap Actions, and the three safe crank
// plugins (BCS codecs remain available; PTB-inaccessible references do not).
export const royaltyPool = withoutUnsafeCalls(rawRoyaltyPool, ["balance", "_new"] as const);
export const royaltyPoolStake = withoutUnsafeCalls(rawRoyaltyStake, ["balance", "getRegistration"] as const);
/** The name the retired `@misofm/protocol` barrel used for {@link royaltyPoolStake}. */
export { royaltyPoolStake as royaltyStake };
export * as vault from "./contracts/vault/vault.ts";
export * as compositionRoyaltyPool from "./contracts/composition_royalty_pool/composition_royalty_pool.ts";
export * as recordingRoyaltyPool from "./contracts/recording_royalty_pool/recording_royalty_pool.ts";
export * as partyWallet from "./contracts/party_wallet/party_wallet.ts";
export const routedStake = withoutUnsafeCalls(
  rawRoutedStake,
  ["stake", "_new", "register", "unregister", "unstake", "restake"] as const,
);
export * as compositionRoutedStake from "./contracts/composition_routed_stake/composition_routed_stake.ts";
export * as compositionRoyaltyPoolPlugin from "./contracts/composition_royalty_pool_plugin/composition_royalty_pool_plugin.ts";
export * as recordingRoyaltyPoolPlugin from "./contracts/recording_royalty_pool_plugin/recording_royalty_pool_plugin.ts";
export * as releaseRevenueDistributorPlugin from "./contracts/release_revenue_distributor_plugin/release_revenue_distributor_plugin.ts";

// Cover art (the CoverArt value type + the release attachment extension).
export * as coverArt from "./contracts/cover_art/cover_art.ts";
export const releaseCoverArt = withoutUnsafeCalls(rawReleaseCoverArt, ["cover"] as const);

// Release presentation, discovery, buyer-content, and runtime economics.
export * as genre from "./contracts/genre/genre.ts";
export const releaseDescription = withoutUnsafeCalls(rawReleaseDescription, ["description"] as const);
export * as releaseDspLink from "./contracts/release_dsp_link/release_dsp_link.ts";
export * as releaseGenre from "./contracts/release_genre/release_genre.ts";
export * as releaseKind from "./contracts/release_kind/release_kind.ts";
export * as releaseRevenueDistributor from "./contracts/release_revenue_distributor/release_revenue_distributor.ts";
export * as recordingAdvisory from "./contracts/recording_advisory/recording_advisory.ts";
export * as recordingGenre from "./contracts/recording_genre/recording_genre.ts";
export * as recordingLanguage from "./contracts/recording_language/recording_language.ts";
export const recordingMasterReference = withoutUnsafeCalls(rawRecordingMasterReference, ["masterReference"] as const);
export * as recordingEngineSession from "./contracts/recording_engine_session/recording_engine_session.ts";
export * as recordingStreamingTranscode from "./contracts/recording_streaming_transcode/recording_streaming_transcode.ts";

// Credits extensions (per-work credit stores + their role vocabularies).
export const compositionCredits = withoutUnsafeCalls(rawCompositionCredits, ["credits"] as const);
export * as compositionPartyRole from "./contracts/composition_credits/composition_party_role.ts";
export const recordingCredits = withoutUnsafeCalls(rawRecordingCredits, ["credits", "primaryArtistIds", "featuredArtistIds"] as const);
export * as recordingPartyRole from "./contracts/recording_credits/recording_party_role.ts";
export const releaseCredits = withoutUnsafeCalls(rawReleaseCredits, ["credits"] as const);
export * as releasePartyRole from "./contracts/release_credits/release_party_role.ts";

// Party extensions. The Party core (`party`) is owned by `@misofm/partyos` —
// import it from `@misofm/partyos/contracts` instead of mirroring it here.
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
