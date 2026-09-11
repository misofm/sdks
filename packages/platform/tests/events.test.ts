// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Covers `platformEventParsers` — the extension and generic-primitive event
// decoders that used to live on the pre-split protocol package's combined `eventParsers`
// before the musicos/platform split (issue misofm/sdks#26). Core object-model
// event decoding (`eventParsers.core`) is tested in `@misofm/musicos` itself.

import { expect, test } from "bun:test";
import { bcs } from "@mysten/sui/bcs";
import { platformEventParsers } from "../src/events.ts";
import { ReleaseDescriptionSetEvent } from "../src/contracts/release_description/release_description.ts";
import { RoyaltyClaimedEvent } from "../src/contracts/royalty_pool/pool.ts";
import { RoutedStakeSweptEvent } from "../src/contracts/routed_stake/routed_stake.ts";
import {
  ReleaseGenreAddedEvent,
  ReleaseGenreRemovedEvent,
  ReleaseGenresClearedEvent,
} from "../src/contracts/release_genre/release_genre.ts";
import {
  RecordingGenreAddedEvent,
  RecordingGenreRemovedEvent,
  RecordingGenresClearedEvent,
} from "../src/contracts/recording_genre/recording_genre.ts";

const EVENTS_A = "0x" + "12".repeat(32);
const EVENTS_B = "0x" + "34".repeat(32);

test("extension event decoders preserve current generated BCS fields", () => {
  const value = {
    release_id: EVENTS_A,
    release_admin_cap_id: EVENTS_B,
    description_existed_before: false,
    description_before: [],
    description_after: Array.from(new TextEncoder().encode("Liner notes")),
  };
  const bytes = ReleaseDescriptionSetEvent.serialize(value).toBytes();

  expect(platformEventParsers.extensions.releaseDescription.descriptionSet(bytes)).toEqual(value);
});

test("release_genre and recording_genre event decoders round-trip the current ABI", () => {
  const releaseAdded = ReleaseGenreAddedEvent.serialize({
    release_id: EVENTS_A,
    admin_cap_id: EVENTS_B,
    genre_id: EVENTS_B,
    genre_name: [74, 97, 122, 122],
    genre_index: "0",
    genres_before: [],
    genres_after: [EVENTS_B],
    genre_count_before: "0",
    genre_count_after: "1",
    field_existed_before: false,
    field_exists_after: true,
    had_primary_before: false,
    has_primary_after: true,
    primary_genre_id_before: "0x0",
    primary_genre_id_after: EVENTS_B,
    primary_changed: true,
  }).toBytes();
  const releaseRemoved = ReleaseGenreRemovedEvent.serialize({
    release_id: EVENTS_A,
    admin_cap_id: EVENTS_B,
    genre_id: EVENTS_B,
    genre_index: "0",
    genres_before: [EVENTS_B],
    genres_after: [],
    genre_count_before: "1",
    genre_count_after: "0",
    field_existed_before: true,
    field_exists_after: false,
    had_primary_before: true,
    has_primary_after: false,
    primary_genre_id_before: EVENTS_B,
    primary_genre_id_after: "0x0",
    primary_changed: true,
  }).toBytes();
  const releaseCleared = ReleaseGenresClearedEvent.serialize({
    release_id: EVENTS_A,
    admin_cap_id: EVENTS_B,
    clear_cause: 1,
    trigger_genre_id: EVENTS_B,
    genres_before: [EVENTS_B],
    genres_after: [],
    genre_count_before: "1",
    genre_count_after: "0",
    field_existed_before: true,
    field_exists_after: false,
    had_primary_before: true,
    has_primary_after: false,
    primary_genre_id_before: EVENTS_B,
    primary_genre_id_after: "0x0",
    primary_changed: true,
  }).toBytes();
  const recordingAdded = RecordingGenreAddedEvent.serialize({
    recording_id: EVENTS_A,
    composition_id: EVENTS_B,
    admin_cap_id: EVENTS_B,
    genre_id: EVENTS_B,
    genre_name: [74, 97, 122, 122],
    genre_index: "0",
    genres_before: [],
    genres_after: [EVENTS_B],
    genre_count_before: "0",
    genre_count_after: "1",
    field_existed_before: false,
    field_exists_after: true,
    had_primary_before: false,
    has_primary_after: true,
    primary_genre_id_before: "0x0",
    primary_genre_id_after: EVENTS_B,
    primary_changed: true,
  }).toBytes();
  const recordingRemoved = RecordingGenreRemovedEvent.serialize({
    recording_id: EVENTS_A,
    composition_id: EVENTS_B,
    admin_cap_id: EVENTS_B,
    genre_id: EVENTS_B,
    genre_index: "0",
    genres_before: [EVENTS_B],
    genres_after: [],
    genre_count_before: "1",
    genre_count_after: "0",
    field_existed_before: true,
    field_exists_after: false,
    had_primary_before: true,
    has_primary_after: false,
    primary_genre_id_before: EVENTS_B,
    primary_genre_id_after: "0x0",
    primary_changed: true,
  }).toBytes();
  const recordingCleared = RecordingGenresClearedEvent.serialize({
    recording_id: EVENTS_A,
    composition_id: EVENTS_B,
    admin_cap_id: EVENTS_B,
    clear_cause: 2,
    trigger_genre_id: EVENTS_B,
    genres_before: [EVENTS_B],
    genres_after: [],
    genre_count_before: "1",
    genre_count_after: "0",
    field_existed_before: true,
    field_exists_after: false,
    had_primary_before: true,
    has_primary_after: false,
    primary_genre_id_before: EVENTS_B,
    primary_genre_id_after: "0x0",
    primary_changed: true,
  }).toBytes();

  expect(platformEventParsers.extensions.releaseGenre.genreAdded(releaseAdded).genre_name).toEqual([74, 97, 122, 122]);
  expect(platformEventParsers.extensions.releaseGenre.genreRemoved(releaseRemoved).field_exists_after).toBeFalse();
  expect(platformEventParsers.extensions.releaseGenre.genresCleared(releaseCleared).clear_cause).toBe(1);
  expect(platformEventParsers.extensions.recordingGenre.genreAdded(recordingAdded).composition_id).toBe(EVENTS_B);
  expect(platformEventParsers.extensions.recordingGenre.genreRemoved(recordingRemoved).field_exists_after).toBeFalse();
  expect(platformEventParsers.extensions.recordingGenre.genresCleared(recordingCleared).clear_cause).toBe(2);
});

test("royalty pool and routed stake primitive event decoders round-trip the current ABI", () => {
  const claimed = RoyaltyClaimedEvent.serialize({
    pool_id: EVENTS_A,
    stake_id: EVENTS_B,
    staked_amount: "42",
    reward_amount: "9007199254740993",
    registration_debt_before: "340282366920938463463374607431768211456",
    registration_debt_after: "340282366920938463463374607431768211457",
    reward_residue_after: "2",
    stake_registration_count_after: "3",
    pool_balance_after: "100",
    staked_shares_after: "4",
    cumulative_reward_per_share_after: "5",
    carry_after: "6",
    cumulative_deposits_after: "7",
  }).toBytes();
  const swept = RoutedStakeSweptEvent.serialize({
    routed_stake_id: EVENTS_A,
    parent_id: EVENTS_B,
    stake_id: EVENTS_A,
    stake_pool_id: EVENTS_B,
    routed_pool_id: EVENTS_A,
    value: "99",
    parked: false,
    staked_value: "10",
    source_balance_before: "100",
    source_balance_after: "1",
    source_staked_shares: "2",
    source_index: "3",
    source_carry: "4",
    source_cumulative_deposits: "5",
    registration_debt_before: "6",
    registration_debt_after: "7",
    destination_balance_before: "8",
    destination_balance_after: "9",
    destination_staked_shares: "10",
    destination_index_before: "11",
    destination_index_after: "12",
    destination_carry_before: "13",
    destination_carry_after: "14",
    destination_cumulative_deposits_before: "15",
    destination_cumulative_deposits_after: "16",
  }).toBytes();

  expect(platformEventParsers.primitives.royaltyPool.royaltyClaimed(claimed).reward_amount).toBe("9007199254740993");
  expect(platformEventParsers.primitives.routedStake.swept(swept).destination_cumulative_deposits_after).toBe("16");
});

test("description parser accepts an independently declared wire layout", () => {
  const independent = bcs.struct("ReleaseDescriptionSetEvent", {
    release_id: bcs.Address,
    release_admin_cap_id: bcs.Address,
    description_existed_before: bcs.bool(),
    description_before: bcs.vector(bcs.u8()),
    description_after: bcs.vector(bcs.u8()),
  });
  const bytes = independent.serialize({
    release_id: EVENTS_A,
    release_admin_cap_id: EVENTS_B,
    description_existed_before: true,
    description_before: [1, 2, 3],
    description_after: [4, 5, 6],
  }).toBytes();
  expect(platformEventParsers.extensions.releaseDescription.descriptionSet(bytes)).toEqual({
    release_id: EVENTS_A,
    release_admin_cap_id: EVENTS_B,
    description_existed_before: true,
    description_before: [1, 2, 3],
    description_after: [4, 5, 6],
  });
});

test("registry exposes every current platform event family", () => {
  const paths = [
    ["extensions", "compositionCredits", "creditAdded"],
    ["extensions", "compositionCredits", "creditRemoved"],
    ["extensions", "recordingAdvisory", "ratingSet"],
    ["extensions", "recordingAdvisory", "ratingUnset"],
    ["extensions", "recordingCredits", "creditAdded"],
    ["extensions", "recordingCredits", "creditRemoved"],
    ["extensions", "recordingCredits", "primaryArtistAdded"],
    ["extensions", "recordingCredits", "primaryArtistRemoved"],
    ["extensions", "recordingCredits", "featuredArtistAdded"],
    ["extensions", "recordingCredits", "featuredArtistRemoved"],
    ["extensions", "recordingEngineSession", "set"],
    ["extensions", "recordingEngineSession", "unset"],
    ["extensions", "recordingGenre", "genreAdded"],
    ["extensions", "recordingGenre", "genreRemoved"],
    ["extensions", "recordingGenre", "genresCleared"],
    ["extensions", "recordingLanguage", "languagesSet"],
    ["extensions", "recordingLanguage", "languagesUnset"],
    ["extensions", "recordingMasterReference", "masterReferenceSet"],
    ["extensions", "recordingMasterReference", "masterReferenceUnset"],
    ["extensions", "recordingStreamingTranscode", "set"],
    ["extensions", "recordingStreamingTranscode", "cleared"],
    ["extensions", "releaseCoverArt", "coverSet"],
    ["extensions", "releaseCoverArt", "coverUnset"],
    ["extensions", "releaseCoverArt", "trackCoverSet"],
    ["extensions", "releaseCoverArt", "trackCoverUnset"],
    ["extensions", "releaseCredits", "creditAdded"],
    ["extensions", "releaseCredits", "creditRemoved"],
    ["extensions", "releaseDescription", "descriptionSet"],
    ["extensions", "releaseDescription", "descriptionCleared"],
    ["extensions", "releaseDspLink", "releaseLinkSet"],
    ["extensions", "releaseDspLink", "releaseLinkCleared"],
    ["extensions", "releaseDspLink", "trackLinkSet"],
    ["extensions", "releaseDspLink", "trackLinkCleared"],
    ["extensions", "releaseDspLink", "trackLinksCleared"],
    ["extensions", "releaseGenre", "genreAdded"],
    ["extensions", "releaseGenre", "genreRemoved"],
    ["extensions", "releaseGenre", "genresCleared"],
    ["extensions", "releaseKind", "kindSet"],
    ["extensions", "releaseKind", "kindUnset"],
    ["extensions", "partyCta", "set"],
    ["extensions", "partyCta", "cleared"],
    ["extensions", "partyGenre", "added"],
    ["extensions", "partyGenre", "removed"],
    ["extensions", "partyGenre", "cleared"],
    ["extensions", "partyMedia", "set"],
    ["extensions", "partyMedia", "cleared"],
    ["extensions", "partyPlatformLink", "legacySet"],
    ["extensions", "partyPlatformLink", "legacyCleared"],
    ["extensions", "partyProfile", "set"],
    ["extensions", "partyProfile", "cleared"],
    ["extensions", "partyRoles", "added"],
    ["extensions", "partyRoles", "removed"],
    ["extensions", "partyRoles", "cleared"],
    ["extensions", "partyTags", "added"],
    ["extensions", "partyTags", "removed"],
    ["extensions", "partyTags", "cleared"],
    ["primitives", "royaltyPool", "poolShared"],
    ["primitives", "royaltyPool", "fundsSettled"],
    ["primitives", "royaltyPool", "coinsRecovered"],
    ["primitives", "routedStake", "shared"],
    ["primitives", "routedStake", "registered"],
    ["primitives", "routedStake", "unregistered"],
    ["primitives", "vault", "created"],
    ["primitives", "vault", "capabilityReturned"],
    ["primitives", "genre", "created"],
    ["primitives", "platformLink", "set"],
    ["primitives", "platformLink", "removed"],
    ["primitives", "share", "initialized"],
    ["actions", "compositionRoyaltyPool", "coinsDeposited"],
    ["actions", "compositionRoyaltyPool", "fundsDeposited"],
    ["actions", "recordingRoyaltyPool", "coinsDeposited"],
    ["actions", "recordingRoyaltyPool", "fundsDeposited"],
    ["actions", "compositionRoutedStake", "registered"],
    ["actions", "compositionRoutedStake", "unregistered"],
    ["actions", "releaseRevenueDistributor", "coinsReceived"],
    ["actions", "releaseRevenueDistributor", "fundsRedeemed"],
    ["actions", "releaseRevenueDistributor", "trackRevenueDistributed"],
    ["actions", "releaseRevenueDistributor", "revenueDistributed"],
    ["actions", "partyWallet", "objectReceived"],
    ["actions", "partyWallet", "coinsReceived"],
    ["actions", "partyWallet", "fundsRedeemed"],
    ["plugins", "compositionRoyaltyPool", "installed"],
    ["plugins", "compositionRoyaltyPool", "uninstalled"],
    ["plugins", "recordingRoyaltyPool", "installed"],
    ["plugins", "recordingRoyaltyPool", "uninstalled"],
    ["plugins", "releaseRevenueDistributor", "installed"],
    ["plugins", "releaseRevenueDistributor", "uninstalled"],
    ["products", "record", "destroyed"],
    ["products", "pressing", "created"],
    ["products", "pressing", "purchased"],
    ["products", "pressing", "shared"],
    ["products", "pressing", "distributorAuthorized"],
    ["products", "pressing", "distributorRevoked"],
    ["products", "listing", "created"],
    ["products", "listing", "shared"],
    ["products", "listing", "priceChanged"],
    ["products", "listing", "stateChanged"],
    ["products", "listing", "sold"],
  ] as const;
  for (const [family, group, operation] of paths) {
    const value = (platformEventParsers as Record<string, any>)[family]?.[group]?.[operation];
    expect(typeof value).toBe("function");
  }
  expect(typeof platformEventParsers.products.record.legacy.created).toBe("function");
  expect(typeof platformEventParsers.products.pressing.legacy.distributorAuthorized).toBe("function");
  expect(typeof platformEventParsers.products.pressing.legacy.distributorRevoked).toBe("function");
  expect(typeof platformEventParsers.actions.pay.paymentSent).toBe("function");
});
