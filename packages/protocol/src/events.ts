// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * BCS decoders for all current execution events outside the three legacy core
 * convenience parsers. Each decoder preserves the generated Move field names and
 * nested layouts exactly, which is the safe indexer boundary for independently
 * versioned extension packages.
 */

import * as compositionCredits from "./contracts/composition_credits/composition_credits.ts";
import * as recordingAdvisory from "./contracts/recording_advisory/recording_advisory.ts";
import * as recordingCredits from "./contracts/recording_credits/recording_credits.ts";
import * as recordingLanguage from "./contracts/recording_language/recording_language.ts";
import * as recordingMasterReference from "./contracts/recording_master_reference/recording_master_reference.ts";
import * as releaseCoverArt from "./contracts/release_cover_art/release_cover_art.ts";
import * as releaseCredits from "./contracts/release_credits/release_credits.ts";
import * as releaseDescription from "./contracts/release_description/release_description.ts";
import * as releaseDspLink from "./contracts/release_dsp_link/release_dsp_link.ts";
import * as releaseGenre from "./contracts/release_genre/release_genre.ts";
import * as releaseKind from "./contracts/release_kind/release_kind.ts";
import * as release from "./contracts/miso/release.ts";
import * as royaltyPool from "./contracts/royalty_pool/pool.ts";
import * as royaltyStake from "./contracts/royalty_pool/stake.ts";
import * as routedStake from "./contracts/routed_stake/routed_stake.ts";
import type { BcsParser } from "./queries.ts";

/** Decode raw event BCS with the corresponding generated codec. */
export function decodeEvent<T>(codec: BcsParser<T>, bytes: Uint8Array): T {
  return codec.parse(bytes);
}

function decoder<T>(codec: BcsParser<T>) {
  return (bytes: Uint8Array): T => decodeEvent(codec, bytes);
}

/**
 * Event decoder registry grouped by package responsibility. It contains each
 * event emitted by the current extension/primitive Move sources. Core
 * publication events retain camel-case wrappers in `parsers.ts`.
 */
export const eventParsers = {
  core: {
    releaseRegistryCreated: decoder(release.ReleaseRegistryCreatedEvent),
  },
  extensions: {
    compositionCredits: {
      creditAdded: decoder(compositionCredits.CreditAddedEvent),
      creditRemoved: decoder(compositionCredits.CreditRemovedEvent),
    },
    recordingAdvisory: {
      ratingSet: decoder(recordingAdvisory.AdvisoryRatingSetEvent),
      ratingUnset: decoder(recordingAdvisory.AdvisoryRatingUnsetEvent),
    },
    recordingCredits: {
      creditAdded: decoder(recordingCredits.CreditAddedEvent),
      creditRemoved: decoder(recordingCredits.CreditRemovedEvent),
      primaryArtistAdded: decoder(recordingCredits.PrimaryArtistAddedEvent),
      primaryArtistRemoved: decoder(recordingCredits.PrimaryArtistRemovedEvent),
      featuredArtistAdded: decoder(recordingCredits.FeaturedArtistAddedEvent),
      featuredArtistRemoved: decoder(recordingCredits.FeaturedArtistRemovedEvent),
    },
    recordingLanguage: {
      languagesSet: decoder(recordingLanguage.LanguagesSetEvent),
      languagesUnset: decoder(recordingLanguage.LanguagesUnsetEvent),
    },
    recordingMasterReference: {
      masterReferenceSet: decoder(recordingMasterReference.MasterReferenceSetEvent),
      masterReferenceUnset: decoder(recordingMasterReference.MasterReferenceUnsetEvent),
    },
    releaseCoverArt: {
      coverSet: decoder(releaseCoverArt.CoverSetEvent),
      coverUnset: decoder(releaseCoverArt.CoverUnsetEvent),
      trackCoverSet: decoder(releaseCoverArt.TrackCoverSetEvent),
      trackCoverUnset: decoder(releaseCoverArt.TrackCoverUnsetEvent),
    },
    releaseCredits: {
      creditAdded: decoder(releaseCredits.CreditAddedEvent),
      creditRemoved: decoder(releaseCredits.CreditRemovedEvent),
    },
    releaseDescription: {
      descriptionSet: decoder(releaseDescription.DescriptionSetEvent),
      descriptionCleared: decoder(releaseDescription.DescriptionClearedEvent),
    },
    releaseDspLink: {
      releaseLinkSet: decoder(releaseDspLink.ReleaseLinkSetEvent),
      releaseLinkCleared: decoder(releaseDspLink.ReleaseLinkClearedEvent),
      trackLinkSet: decoder(releaseDspLink.TrackLinkSetEvent),
      trackLinksCleared: decoder(releaseDspLink.TrackLinksClearedEvent),
    },
    releaseGenre: {
      primarySet: decoder(releaseGenre.PrimaryGenreSetEvent),
      secondaryAdded: decoder(releaseGenre.SecondaryGenreAddedEvent),
      secondaryRemoved: decoder(releaseGenre.SecondaryGenreRemovedEvent),
      trackPrimarySet: decoder(releaseGenre.TrackPrimaryGenreSetEvent),
      trackPrimaryUnset: decoder(releaseGenre.TrackPrimaryGenreUnsetEvent),
    },
    releaseKind: {
      kindSet: decoder(releaseKind.KindSetEvent),
      kindUnset: decoder(releaseKind.KindUnsetEvent),
    },
  },
  primitives: {
    royaltyPool: {
      poolCreated: decoder(royaltyPool.RoyaltyPoolCreatedEvent),
      deposited: decoder(royaltyPool.RoyaltyDepositedEvent),
      stakeRegistered: decoder(royaltyPool.StakeRegisteredEvent),
      stakeUnregistered: decoder(royaltyPool.StakeUnregisteredEvent),
      royaltyClaimed: decoder(royaltyPool.RoyaltyClaimedEvent),
      stakeCreated: decoder(royaltyStake.StakeCreatedEvent),
      stakeDestroyed: decoder(royaltyStake.StakeDestroyedEvent),
    },
    routedStake: {
      created: decoder(routedStake.RoutedStakeCreatedEvent),
      swept: decoder(routedStake.RoutedStakeSweptEvent),
      unstaked: decoder(routedStake.RoutedStakeUnstakedEvent),
      restaked: decoder(routedStake.RoutedStakeRestakedEvent),
    },
  },
} as const;
