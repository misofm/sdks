// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Covers `platformEventParsers` — the extension and generic-primitive event
// decoders that used to live on the pre-split protocol package's combined `eventParsers`
// before the musicos/platform split (issue misofm/sdks#26). Core object-model
// event decoding (`eventParsers.core`) is tested in `@misofm/musicos` itself.

import { expect, test } from "bun:test";
import { platformEventParsers } from "../src/events.ts";
import { DescriptionSetEvent } from "../src/contracts/release_description/release_description.ts";
import { RoyaltyClaimedEvent } from "../src/contracts/royalty_pool/pool.ts";
import { RoutedStakeSweptEvent } from "../src/contracts/routed_stake/routed_stake.ts";
import {
  GenreAddedEvent as ReleaseGenreAddedEvent,
  GenreRemovedEvent as ReleaseGenreRemovedEvent,
  GenresClearedEvent as ReleaseGenresClearedEvent,
} from "../src/contracts/release_genre/release_genre.ts";
import {
  GenreAddedEvent as RecordingGenreAddedEvent,
  GenreRemovedEvent as RecordingGenreRemovedEvent,
  GenresClearedEvent as RecordingGenresClearedEvent,
} from "../src/contracts/recording_genre/recording_genre.ts";

const EVENTS_A = "0x" + "12".repeat(32);
const EVENTS_B = "0x" + "34".repeat(32);

test("extension event decoders preserve current generated BCS fields", () => {
  const bytes = DescriptionSetEvent.serialize({
    release_id: EVENTS_A,
    description: "Liner notes",
  }).toBytes();

  expect(platformEventParsers.extensions.releaseDescription.descriptionSet(bytes)).toEqual({
    release_id: EVENTS_A,
    description: "Liner notes",
  });
});

test("release_genre and recording_genre event decoders round-trip the current ABI", () => {
  const releaseAdded = ReleaseGenreAddedEvent.serialize({
    release_id: EVENTS_A,
    genre_id: EVENTS_B,
  }).toBytes();
  const releaseRemoved = ReleaseGenreRemovedEvent.serialize({
    release_id: EVENTS_A,
    genre_id: EVENTS_B,
  }).toBytes();
  const releaseCleared = ReleaseGenresClearedEvent.serialize({
    release_id: EVENTS_A,
  }).toBytes();
  const recordingAdded = RecordingGenreAddedEvent.serialize({
    recording_id: EVENTS_A,
    genre_id: EVENTS_B,
  }).toBytes();
  const recordingRemoved = RecordingGenreRemovedEvent.serialize({
    recording_id: EVENTS_A,
    genre_id: EVENTS_B,
  }).toBytes();
  const recordingCleared = RecordingGenresClearedEvent.serialize({
    recording_id: EVENTS_A,
  }).toBytes();

  expect(platformEventParsers.extensions.releaseGenre.genreAdded(releaseAdded)).toEqual({
    release_id: EVENTS_A,
    genre_id: EVENTS_B,
  });
  expect(platformEventParsers.extensions.releaseGenre.genreRemoved(releaseRemoved)).toEqual({
    release_id: EVENTS_A,
    genre_id: EVENTS_B,
  });
  expect(platformEventParsers.extensions.releaseGenre.genresCleared(releaseCleared)).toEqual({
    release_id: EVENTS_A,
  });
  expect(platformEventParsers.extensions.recordingGenre.genreAdded(recordingAdded)).toEqual({
    recording_id: EVENTS_A,
    genre_id: EVENTS_B,
  });
  expect(platformEventParsers.extensions.recordingGenre.genreRemoved(recordingRemoved)).toEqual({
    recording_id: EVENTS_A,
    genre_id: EVENTS_B,
  });
  expect(platformEventParsers.extensions.recordingGenre.genresCleared(recordingCleared)).toEqual({
    recording_id: EVENTS_A,
  });
});

test("royalty pool and routed stake primitive event decoders round-trip the current ABI", () => {
  const claimed = RoyaltyClaimedEvent.serialize({
    pool_id: EVENTS_A,
    stake_id: EVENTS_B,
    reward_amount: "42",
  }).toBytes();
  const swept = RoutedStakeSweptEvent.serialize({
    routed_stake_id: EVENTS_A,
    parent_id: EVENTS_B,
    value: "99",
  }).toBytes();

  expect(platformEventParsers.primitives.royaltyPool.royaltyClaimed(claimed)).toEqual({
    pool_id: EVENTS_A,
    stake_id: EVENTS_B,
    reward_amount: "42",
  });
  expect(platformEventParsers.primitives.routedStake.swept(swept)).toEqual({
    routed_stake_id: EVENTS_A,
    parent_id: EVENTS_B,
    value: "99",
  });
});
