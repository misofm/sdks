// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * BCS decoders for platform events. The registry intentionally preserves the
 * generated Move field names and nested layouts: this is the lossless event
 * boundary for indexers and consumers that may not share the SDK's domain
 * models. Core object-model events remain in `@misofm/musicos/events` and
 * `@misofm/partyos/events`.
 *
 * Phantom type arguments are represented by the generated codecs' structural
 * layouts and therefore require no BCS type arguments. As with every BCS
 * parser, callers must still filter by the full on-chain event type because a
 * byte decoder cannot validate a Move type identity.
 */

import { decodeEvent } from "@misofm/musicos/events";
import type { BcsParser } from "@misofm/musicos/queries";
import type { BcsType } from "@mysten/sui/bcs";

import * as compositionCredits from "./contracts/composition_credits/composition_credits.ts";
import * as compositionRoutedStake from "./contracts/composition_routed_stake/composition_routed_stake.ts";
import * as compositionRoyaltyPool from "./contracts/composition_royalty_pool/composition_royalty_pool.ts";
import * as compositionRoyaltyPoolPlugin from "./contracts/composition_royalty_pool_plugin/composition_royalty_pool_plugin.ts";
import * as genre from "./contracts/genre/genre.ts";
import * as misoPay from "./contracts/miso_pay/pay.ts";
import * as partyCta from "./contracts/party_cta/party_cta.ts";
import * as partyGenre from "./contracts/party_genre/party_genre.ts";
import * as partyMedia from "./contracts/party_media/party_media.ts";
import * as partyPlatformLink from "./contracts/party_platform_link/party_platform_link.ts";
import * as partyProfile from "./contracts/party_profile/party_profile.ts";
import * as partyRoles from "./contracts/party_roles/party_roles.ts";
import * as partyTags from "./contracts/party_tags/party_tags.ts";
import * as partyWallet from "./contracts/party_wallet/party_wallet.ts";
import * as pressing from "./contracts/record/pressing.ts";
import * as record from "./contracts/record/record.ts";
import * as listing from "./contracts/record_shop/listing.ts";
import * as recordingAdvisory from "./contracts/recording_advisory/recording_advisory.ts";
import * as recordingCredits from "./contracts/recording_credits/recording_credits.ts";
import * as recordingEngineSession from "./contracts/recording_engine_session/recording_engine_session.ts";
import * as recordingGenre from "./contracts/recording_genre/recording_genre.ts";
import * as recordingLanguage from "./contracts/recording_language/recording_language.ts";
import * as recordingMasterReference from "./contracts/recording_master_reference/recording_master_reference.ts";
import * as recordingRoyaltyPool from "./contracts/recording_royalty_pool/recording_royalty_pool.ts";
import * as recordingRoyaltyPoolPlugin from "./contracts/recording_royalty_pool_plugin/recording_royalty_pool_plugin.ts";
import * as recordingStreamingTranscode from "./contracts/recording_streaming_transcode/recording_streaming_transcode.ts";
import * as releaseCoverArt from "./contracts/release_cover_art/release_cover_art.ts";
import * as releaseCredits from "./contracts/release_credits/release_credits.ts";
import * as releaseDescription from "./contracts/release_description/release_description.ts";
import * as releaseDspLink from "./contracts/release_dsp_link/release_dsp_link.ts";
import * as releaseGenre from "./contracts/release_genre/release_genre.ts";
import * as releaseKind from "./contracts/release_kind/release_kind.ts";
import * as releaseRevenueDistributor from "./contracts/release_revenue_distributor/release_revenue_distributor.ts";
import * as releaseRevenueDistributorPlugin from "./contracts/release_revenue_distributor_plugin/release_revenue_distributor_plugin.ts";
import * as royaltyPool from "./contracts/royalty_pool/pool.ts";
import * as royaltyStake from "./contracts/royalty_pool/stake.ts";
import * as routedStake from "./contracts/routed_stake/routed_stake.ts";
import * as share from "./contracts/share/share.ts";
import * as platformLink from "./contracts/platform_link/platform_link.ts";
import * as vault from "./contracts/vault/vault.ts";

function decoder<T>(codec: BcsParser<T>) {
  return (bytes: Uint8Array): T => decodeEvent(codec, bytes);
}

/**
 * Public decoder registry, grouped by package responsibility. Work and Party
 * extensions belong to platform because they are Miso's product choices; the
 * object model's own event registry is kept in its owning package.
 */
export const platformEventParsers = {
  extensions: {
    compositionCredits: {
      creditAdded: decoder(compositionCredits.CompositionCreditAddedEvent),
      creditRemoved: decoder(compositionCredits.CompositionCreditRemovedEvent),
    },
    recordingAdvisory: {
      ratingSet: decoder(recordingAdvisory.RecordingAdvisoryRatingSetEvent),
      ratingUnset: decoder(recordingAdvisory.RecordingAdvisoryRatingClearedEvent),
      ratingCleared: decoder(recordingAdvisory.RecordingAdvisoryRatingClearedEvent),
    },
    recordingCredits: {
      creditAdded: decoder(recordingCredits.CreditAddedEvent),
      creditRemoved: decoder(recordingCredits.CreditRemovedEvent),
      primaryArtistAdded: decoder(recordingCredits.PrimaryArtistAddedEvent),
      primaryArtistRemoved: decoder(recordingCredits.PrimaryArtistRemovedEvent),
      featuredArtistAdded: decoder(recordingCredits.FeaturedArtistAddedEvent),
      featuredArtistRemoved: decoder(recordingCredits.FeaturedArtistRemovedEvent),
    },
    recordingEngineSession: {
      set: decoder(recordingEngineSession.EngineSessionSetEvent),
      unset: decoder(recordingEngineSession.EngineSessionUnsetEvent),
    },
    recordingGenre: {
      genreAdded: decoder(recordingGenre.RecordingGenreAddedEvent),
      genreRemoved: decoder(recordingGenre.RecordingGenreRemovedEvent),
      genresCleared: decoder(recordingGenre.RecordingGenresClearedEvent),
    },
    recordingLanguage: {
      languagesSet: decoder(recordingLanguage.RecordingLanguagesSetEvent),
      languagesUnset: decoder(recordingLanguage.RecordingLanguagesClearedEvent),
      languagesCleared: decoder(recordingLanguage.RecordingLanguagesClearedEvent),
    },
    recordingMasterReference: {
      masterReferenceSet: decoder(recordingMasterReference.RecordingMasterReferenceSetEvent),
      masterReferenceUnset: decoder(recordingMasterReference.RecordingMasterReferenceClearedEvent),
      masterReferenceCleared: decoder(recordingMasterReference.RecordingMasterReferenceClearedEvent),
    },
    recordingStreamingTranscode: {
      set: decoder(recordingStreamingTranscode.RecordingStreamingTranscodeSetEvent),
      cleared: decoder(recordingStreamingTranscode.RecordingStreamingTranscodeClearedEvent),
    },
    releaseCoverArt: {
      coverSet: decoder(releaseCoverArt.ReleaseCoverArtSetEvent),
      coverUnset: decoder(releaseCoverArt.ReleaseCoverArtUnsetEvent),
      coverCleared: decoder(releaseCoverArt.ReleaseCoverArtUnsetEvent),
      trackCoverSet: decoder(releaseCoverArt.ReleaseTrackCoverArtSetEvent),
      trackCoverUnset: decoder(releaseCoverArt.ReleaseTrackCoverArtUnsetEvent),
      trackCoverCleared: decoder(releaseCoverArt.ReleaseTrackCoverArtUnsetEvent),
    },
    releaseCredits: {
      creditAdded: decoder(releaseCredits.ReleaseCreditAddedEvent),
      creditRemoved: decoder(releaseCredits.ReleaseCreditRemovedEvent),
    },
    releaseDescription: {
      descriptionSet: decoder(releaseDescription.ReleaseDescriptionSetEvent),
      descriptionCleared: decoder(releaseDescription.ReleaseDescriptionClearedEvent),
    },
    releaseDspLink: {
      releaseLinkSet: decoder(releaseDspLink.ReleaseDspLinkSetEvent),
      releaseLinkCleared: decoder(releaseDspLink.ReleaseDspLinkClearedEvent),
      trackLinkSet: decoder(releaseDspLink.ReleaseTrackDspLinkSetEvent),
      trackLinkCleared: decoder(releaseDspLink.ReleaseTrackDspLinkClearedEvent),
      trackLinksCleared: decoder(releaseDspLink.ReleaseTrackDspLinksClearedEvent),
    },
    releaseGenre: {
      genreAdded: decoder(releaseGenre.ReleaseGenreAddedEvent),
      genreRemoved: decoder(releaseGenre.ReleaseGenreRemovedEvent),
      genresCleared: decoder(releaseGenre.ReleaseGenresClearedEvent),
    },
    releaseKind: {
      kindSet: decoder(releaseKind.ReleaseKindSetEvent),
      kindUnset: decoder(releaseKind.ReleaseKindUnsetEvent),
      kindCleared: decoder(releaseKind.ReleaseKindUnsetEvent),
    },
    partyCta: {
      set: decoder(partyCta.CtasSetEvent),
      cleared: decoder(partyCta.CtasClearedEvent),
      ctasSet: decoder(partyCta.CtasSetEvent),
      ctasCleared: decoder(partyCta.CtasClearedEvent),
    },
    partyGenre: {
      added: decoder(partyGenre.GenreAddedEvent),
      removed: decoder(partyGenre.GenreRemovedEvent),
      cleared: decoder(partyGenre.GenresClearedEvent),
      genreAdded: decoder(partyGenre.GenreAddedEvent),
      genreRemoved: decoder(partyGenre.GenreRemovedEvent),
      genresCleared: decoder(partyGenre.GenresClearedEvent),
    },
    partyMedia: {
      set: decoder(partyMedia.MediaSetEvent),
      cleared: decoder(partyMedia.MediaClearedEvent),
      mediaSet: decoder(partyMedia.MediaSetEvent),
      mediaCleared: decoder(partyMedia.MediaClearedEvent),
    },
    partyPlatformLink: {
      // The platform_link primitive is authoritative for party_music,
      // party_social, and party_pro_link. These wrapper declarations remain
      // exposed for bytes from historical releases and are marked legacy.
      legacy: {
        set: decoder(partyPlatformLink.LinkSetEvent),
        cleared: decoder(partyPlatformLink.LinkClearedEvent),
        linkSet: decoder(partyPlatformLink.LinkSetEvent),
        linkCleared: decoder(partyPlatformLink.LinkClearedEvent),
      },
      legacySet: decoder(partyPlatformLink.LinkSetEvent),
      legacyCleared: decoder(partyPlatformLink.LinkClearedEvent),
    },
    partyProfile: {
      set: decoder(partyProfile.PartyProfileSetEvent),
      cleared: decoder(partyProfile.PartyProfileClearedEvent),
      profileSet: decoder(partyProfile.PartyProfileSetEvent),
      profileCleared: decoder(partyProfile.PartyProfileClearedEvent),
    },
    partyRoles: {
      added: decoder(partyRoles.RoleAddedEvent),
      removed: decoder(partyRoles.RoleRemovedEvent),
      cleared: decoder(partyRoles.RolesClearedEvent),
      roleAdded: decoder(partyRoles.RoleAddedEvent),
      roleRemoved: decoder(partyRoles.RoleRemovedEvent),
      rolesCleared: decoder(partyRoles.RolesClearedEvent),
    },
    partyTags: {
      added: decoder(partyTags.TagAddedEvent),
      removed: decoder(partyTags.TagRemovedEvent),
      cleared: decoder(partyTags.TagsClearedEvent),
      tagAdded: decoder(partyTags.TagAddedEvent),
      tagRemoved: decoder(partyTags.TagRemovedEvent),
      tagsCleared: decoder(partyTags.TagsClearedEvent),
    },
  },
  primitives: {
    royaltyPool: {
      poolCreated: decoder(royaltyPool.RoyaltyPoolCreatedEvent),
      poolShared: decoder(royaltyPool.RoyaltyPoolSharedEvent),
      deposited: decoder(royaltyPool.RoyaltyDepositedEvent),
      fundsSettled: decoder(royaltyPool.RoyaltyPoolFundsSettledEvent),
      coinsRecovered: decoder(royaltyPool.RoyaltyPoolCoinsRecoveredEvent),
      stakeRegistered: decoder(royaltyPool.StakeRegisteredEvent),
      stakeUnregistered: decoder(royaltyPool.StakeUnregisteredEvent),
      royaltyClaimed: decoder(royaltyPool.RoyaltyClaimedEvent),
      stakeCreated: decoder(royaltyStake.StakeCreatedEvent),
      stakeDestroyed: decoder(royaltyStake.StakeDestroyedEvent),
    },
    routedStake: {
      created: decoder(routedStake.RoutedStakeCreatedEvent),
      shared: decoder(routedStake.RoutedStakeSharedEvent),
      registered: decoder(routedStake.RoutedStakeRegisteredEvent),
      unregistered: decoder(routedStake.RoutedStakeUnregisteredEvent),
      swept: decoder(routedStake.RoutedStakeSweptEvent),
      unstaked: decoder(routedStake.RoutedStakeUnstakedEvent),
      restaked: decoder(routedStake.RoutedStakeRestakedEvent),
    },
    vault: {
      registryCreated: decoder(vault.VaultRegistryCreatedEvent),
      created: decoder(vault.VaultCreatedEvent),
      shared: decoder(vault.VaultSharedEvent),
      pluginAuthorized: decoder(vault.PluginAuthorizedEvent),
      pluginRevoked: decoder(vault.PluginRevokedEvent),
      capabilityWithdrawn: decoder(vault.VaultCapabilityWithdrawnEvent),
      capabilityRestored: decoder(vault.VaultCapabilityRestoredEvent),
      capabilityBorrowedByPlugin: decoder(vault.VaultCapabilityBorrowedByPluginEvent),
      capabilityBorrowedByAdmin: decoder(vault.VaultCapabilityBorrowedByAdminEvent),
      capabilityReturned: decoder(vault.VaultCapabilityReturnedEvent),
      vaultRegistryCreated: decoder(vault.VaultRegistryCreatedEvent),
      vaultCreated: decoder(vault.VaultCreatedEvent),
      vaultShared: decoder(vault.VaultSharedEvent),
    },
    genre: {
      registryCreated: decoder(genre.GenreRegistryCreatedEvent),
      created: decoder(genre.GenreCreatedEvent),
      genreRegistryCreated: decoder(genre.GenreRegistryCreatedEvent),
      genreCreated: decoder(genre.GenreCreatedEvent),
    },
    platformLink: {
      set: decoder(platformLink.PlatformLinkSetEvent),
      removed: decoder(platformLink.PlatformLinkRemovedEvent),
      linkSet: decoder(platformLink.PlatformLinkSetEvent),
      linkRemoved: decoder(platformLink.PlatformLinkRemovedEvent),
      platformLinkSet: decoder(platformLink.PlatformLinkSetEvent),
      platformLinkRemoved: decoder(platformLink.PlatformLinkRemovedEvent),
    },
    share: {
      initialized: decoder(share.ShareInitializedEvent),
      shareInitialized: decoder(share.ShareInitializedEvent),
    },
  },
  actions: {
    compositionRoyaltyPool: {
      poolCreated: decoder(compositionRoyaltyPool.CompositionRoyaltyPoolCreatedEvent),
      coinsDeposited: decoder(compositionRoyaltyPool.CompositionCoinsDepositedEvent),
      fundsDeposited: decoder(compositionRoyaltyPool.CompositionFundsDepositedEvent),
    },
    recordingRoyaltyPool: {
      poolCreated: decoder(recordingRoyaltyPool.RecordingRoyaltyPoolCreatedEvent),
      coinsDeposited: decoder(recordingRoyaltyPool.RecordingCoinsDepositedEvent),
      fundsDeposited: decoder(recordingRoyaltyPool.RecordingFundsDepositedEvent),
    },
    compositionRoutedStake: {
      created: decoder(compositionRoutedStake.CompositionRoutedStakeCreatedEvent),
      registered: decoder(compositionRoutedStake.CompositionRoutedStakeRegisteredEvent),
      unregistered: decoder(compositionRoutedStake.CompositionRoutedStakeUnregisteredEvent),
      unstaked: decoder(compositionRoutedStake.CompositionRoutedStakeUnstakedEvent),
      restaked: decoder(compositionRoutedStake.CompositionRoutedStakeRestakedEvent),
    },
    releaseRevenueDistributor: {
      coinsReceived: decoder(releaseRevenueDistributor.ReleaseCoinsReceivedEvent),
      fundsRedeemed: decoder(releaseRevenueDistributor.ReleaseFundsRedeemedEvent),
      trackRevenueDistributed: decoder(releaseRevenueDistributor.ReleaseTrackRevenueDistributedEvent),
      revenueDistributed: decoder(releaseRevenueDistributor.ReleaseRevenueDistributedEvent),
    },
    partyWallet: {
      objectReceived: decoder(partyWallet.ObjectReceivedEvent),
      coinsReceived: decoder(partyWallet.CoinsReceivedEvent),
      fundsRedeemed: decoder(partyWallet.FundsRedeemedEvent),
    },
    pay: {
      // Metadata is a real (non-phantom) generic in Move, so its BCS layout
      // must be supplied by the caller. Target and Currency remain phantom.
      paymentSent: <Metadata extends BcsType<any>>(metadata: Metadata) =>
        decoder(misoPay.PaymentSentEvent(metadata)),
    },
  },
  plugins: {
    compositionRoyaltyPool: {
      installed: decoder(compositionRoyaltyPoolPlugin.CompositionRoyaltyPoolPluginInstalledEvent),
      uninstalled: decoder(compositionRoyaltyPoolPlugin.CompositionRoyaltyPoolPluginUninstalledEvent),
      capabilityBorrowed: decoder(compositionRoyaltyPoolPlugin.CompositionVaultCapabilityBorrowedEvent),
      coinsDeposited: decoder(compositionRoyaltyPoolPlugin.CompositionCoinsDepositedEvent),
      fundsDeposited: decoder(compositionRoyaltyPoolPlugin.CompositionFundsDepositedEvent),
    },
    recordingRoyaltyPool: {
      installed: decoder(recordingRoyaltyPoolPlugin.RecordingRoyaltyPoolPluginInstalledEvent),
      uninstalled: decoder(recordingRoyaltyPoolPlugin.RecordingRoyaltyPoolPluginUninstalledEvent),
      capabilityBorrowed: decoder(recordingRoyaltyPoolPlugin.RecordingVaultCapabilityBorrowedEvent),
      coinsDeposited: decoder(recordingRoyaltyPoolPlugin.RecordingCoinsDepositedEvent),
      fundsDeposited: decoder(recordingRoyaltyPoolPlugin.RecordingFundsDepositedEvent),
    },
    releaseRevenueDistributor: {
      installed: decoder(releaseRevenueDistributorPlugin.ReleaseRevenueDistributorPluginInstalledEvent),
      uninstalled: decoder(releaseRevenueDistributorPlugin.ReleaseRevenueDistributorPluginUninstalledEvent),
      coinsDistributed: decoder(releaseRevenueDistributorPlugin.ReleaseRevenueCoinsDistributedEvent),
      fundsDistributed: decoder(releaseRevenueDistributorPlugin.ReleaseRevenueFundsDistributedEvent),
    },
  },
  products: {
    record: {
      destroyed: decoder(record.RecordDestroyedEvent),
      legacy: {
        created: decoder(record.RecordCreatedEvent),
      },
    },
    pressing: {
      created: decoder(pressing.PressingCreatedEvent),
      purchased: decoder(pressing.RecordPurchasedEvent),
      shared: decoder(pressing.PressingSharedEvent),
      distributorAuthorized: decoder(pressing.PressingDistributorAuthorizedEvent),
      distributorRevoked: decoder(pressing.PressingDistributorRevokedEvent),
      legacy: {
        distributorAuthorized: decoder(pressing.DistributorAuthorizedEvent),
        distributorRevoked: decoder(pressing.DistributorRevokedEvent),
      },
    },
    listing: {
      created: decoder(listing.ListingCreatedEvent),
      shared: decoder(listing.ListingSharedEvent),
      priceChanged: decoder(listing.ListingPriceChangedEvent),
      stateChanged: decoder(listing.ListingStateChangedEvent),
      sold: decoder(listing.RecordSoldEvent),
    },
  },
} as const;
