// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Barrel for the codegen-generated, ABI-bound bindings (BCS structs + type-safe
// Move calls). Re-exported from the package root as the `contracts` namespace.
//
// PLATFORM + EXTENSION packages. The protocol core (`miso`: Composition,
// Recording, Release, Track) generates into `@misofm/protocol` and is
// re-exported from ITS `contracts` namespace — import it from there rather than
// mirroring it here.

// Record identity/issuance and Record Shop primary-sale mechanics. The
// package-restricted witness constructor is intentionally not exported here.
export * as record from "@misofm/protocol/contracts/miso_record/record";
export * as pressing from "@misofm/protocol/contracts/miso_record/pressing";
export * as listing from "@misofm/protocol/contracts/miso_record_shop/listing";

// Generic royalty-pool primitive, raw-cap Actions, and the three safe crank plugins.
export * as royaltyPool from "@misofm/protocol/contracts/royalty_pool/pool";
export * as royaltyPoolStake from "@misofm/protocol/contracts/royalty_pool/stake";
export * as vault from "@misofm/protocol/contracts/vault/vault";
export * as compositionRoyaltyPool from "@misofm/protocol/contracts/composition_royalty_pool/composition_royalty_pool";
export * as recordingRoyaltyPool from "@misofm/protocol/contracts/recording_royalty_pool/recording_royalty_pool";
export * as partyWallet from "@misofm/protocol/contracts/party_wallet/party_wallet";
export * as routedStake from "@misofm/protocol/contracts/routed_stake/routed_stake";
export * as compositionRoutedStake from "@misofm/protocol/contracts/composition_routed_stake/composition_routed_stake";
export * as compositionRoyaltyPoolPlugin from "@misofm/protocol/contracts/composition_royalty_pool_plugin/composition_royalty_pool_plugin";
export * as recordingRoyaltyPoolPlugin from "@misofm/protocol/contracts/recording_royalty_pool_plugin/recording_royalty_pool_plugin";
export * as releaseRevenueDistributorPlugin from "@misofm/protocol/contracts/release_revenue_distributor_plugin/release_revenue_distributor_plugin";

// Cover art (the CoverArt value type + the release attachment extension).
export * as coverArt from "@misofm/protocol/contracts/cover_art/cover_art";
export * as releaseCoverArt from "@misofm/protocol/contracts/release_cover_art/release_cover_art";

// Release presentation, discovery, buyer-content, and runtime economics.
export * as genre from "@misofm/protocol/contracts/genre/genre";
export * as releaseDescription from "@misofm/protocol/contracts/release_description/release_description";
export * as releaseDspLink from "@misofm/protocol/contracts/release_dsp_link/release_dsp_link";
export * as releaseGenre from "@misofm/protocol/contracts/release_genre/release_genre";
export * as releaseKind from "@misofm/protocol/contracts/release_kind/release_kind";
export * as releaseRevenueDistributor from "@misofm/protocol/contracts/release_revenue_distributor/release_revenue_distributor";
export * as recordingAdvisory from "@misofm/protocol/contracts/recording_advisory/recording_advisory";
export * as recordingLanguage from "@misofm/protocol/contracts/recording_language/recording_language";
export * as recordingMasterReference from "@misofm/protocol/contracts/recording_master_reference/recording_master_reference";
export * as recordingEngineSession from "@misofm/protocol/contracts/recording_engine_session/recording_engine_session";
export * as recordingStreamingTranscode from "@misofm/protocol/contracts/recording_streaming_transcode/recording_streaming_transcode";

// Credits extensions (per-work credit stores + their role vocabularies).
export * as compositionCredits from "@misofm/protocol/contracts/composition_credits/composition_credits";
export * as compositionPartyRole from "@misofm/protocol/contracts/composition_credits/composition_party_role";
export * as recordingCredits from "@misofm/protocol/contracts/recording_credits/recording_credits";
export * as recordingPartyRole from "@misofm/protocol/contracts/recording_credits/recording_party_role";
export * as releaseCredits from "@misofm/protocol/contracts/release_credits/release_credits";
export * as releasePartyRole from "@misofm/protocol/contracts/release_credits/release_party_role";
