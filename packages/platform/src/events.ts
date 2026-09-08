// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * BCS decoders for extension and generic-primitive execution events. Core
 * object-model events (release registry creation, …) decode through
 * `@misofm/musicos`'s own `eventParsers`; this module covers everything Miso
 * layers on top: work extensions, and the royalty-pool / routed-stake
 * primitives. Each decoder preserves the generated Move field names and
 * nested layouts exactly, which is the safe indexer boundary for
 * independently versioned extension packages.
 */

import { decodeEvent } from "@misofm/musicos/events";
import type { BcsParser } from "@misofm/musicos/queries";

import * as compositionCredits from "./contracts/composition_credits/composition_credits.ts";
import * as recordingAdvisory from "./contracts/recording_advisory/recording_advisory.ts";
import * as recordingCredits from "./contracts/recording_credits/recording_credits.ts";
import * as recordingGenre from "./contracts/recording_genre/recording_genre.ts";
import * as recordingLanguage from "./contracts/recording_language/recording_language.ts";
import * as recordingMasterReference from "./contracts/recording_master_reference/recording_master_reference.ts";
import * as releaseCoverArt from "./contracts/release_cover_art/release_cover_art.ts";
import * as releaseCredits from "./contracts/release_credits/release_credits.ts";
import * as releaseDescription from "./contracts/release_description/release_description.ts";
import * as releaseDspLink from "./contracts/release_dsp_link/release_dsp_link.ts";
import * as releaseGenre from "./contracts/release_genre/release_genre.ts";
import * as releaseKind from "./contracts/release_kind/release_kind.ts";
import * as royaltyPool from "./contracts/royalty_pool/pool.ts";
import * as royaltyStake from "./contracts/royalty_pool/stake.ts";
import * as routedStake from "./contracts/routed_stake/routed_stake.ts";

function decoder<T>(codec: BcsParser<T>) {
  return (bytes: Uint8Array): T => decodeEvent(codec, bytes);
}

/**
 * Platform event decoder registry, grouped by package responsibility:
 * `extensions` (work extensions) and `primitives` (royalty pool / routed
 * stake). Merge with `@misofm/musicos`'s `eventParsers.core` at the call site
 * when a single indexer needs both.
 */
export const platformEventParsers = {
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
    recordingGenre: {
      genreAdded: decoder(recordingGenre.GenreAddedEvent),
      genreRemoved: decoder(recordingGenre.GenreRemovedEvent),
      genresCleared: decoder(recordingGenre.GenresClearedEvent),
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
      genreAdded: decoder(releaseGenre.GenreAddedEvent),
      genreRemoved: decoder(releaseGenre.GenreRemovedEvent),
      genresCleared: decoder(releaseGenre.GenresClearedEvent),
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
