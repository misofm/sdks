// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { eventParsers } from "../src/events.ts";
import { ReleaseRegistryCreatedEvent } from "../src/contracts/miso/release.ts";
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

const A = "0x" + "12".repeat(32);
const B = "0x" + "34".repeat(32);

test("extension event decoders preserve current generated BCS fields", () => {
  const bytes = DescriptionSetEvent.serialize({
    release_id: A,
    description: "Liner notes",
  }).toBytes();

  expect(eventParsers.extensions.releaseDescription.descriptionSet(bytes)).toEqual({
    release_id: A,
    description: "Liner notes",
  });
});

test("release_genre and recording_genre event decoders round-trip the current ABI", () => {
  const releaseAdded = ReleaseGenreAddedEvent.serialize({
    release_id: A,
    genre_id: B,
  }).toBytes();
  const releaseRemoved = ReleaseGenreRemovedEvent.serialize({
    release_id: A,
    genre_id: B,
  }).toBytes();
  const releaseCleared = ReleaseGenresClearedEvent.serialize({
    release_id: A,
  }).toBytes();
  const recordingAdded = RecordingGenreAddedEvent.serialize({
    recording_id: A,
    genre_id: B,
  }).toBytes();
  const recordingRemoved = RecordingGenreRemovedEvent.serialize({
    recording_id: A,
    genre_id: B,
  }).toBytes();
  const recordingCleared = RecordingGenresClearedEvent.serialize({
    recording_id: A,
  }).toBytes();

  expect(eventParsers.extensions.releaseGenre.genreAdded(releaseAdded)).toEqual({
    release_id: A,
    genre_id: B,
  });
  expect(eventParsers.extensions.releaseGenre.genreRemoved(releaseRemoved)).toEqual({
    release_id: A,
    genre_id: B,
  });
  expect(eventParsers.extensions.releaseGenre.genresCleared(releaseCleared)).toEqual({
    release_id: A,
  });
  expect(eventParsers.extensions.recordingGenre.genreAdded(recordingAdded)).toEqual({
    recording_id: A,
    genre_id: B,
  });
  expect(eventParsers.extensions.recordingGenre.genreRemoved(recordingRemoved)).toEqual({
    recording_id: A,
    genre_id: B,
  });
  expect(eventParsers.extensions.recordingGenre.genresCleared(recordingCleared)).toEqual({
    recording_id: A,
  });
});

test("core-registry and primitive event decoders round-trip the current ABI", () => {
  const registry = ReleaseRegistryCreatedEvent.serialize({
    registry_id: A,
    created_by: B,
  }).toBytes();
  const claimed = RoyaltyClaimedEvent.serialize({
    pool_id: A,
    stake_id: B,
    reward_amount: "42",
  }).toBytes();
  const swept = RoutedStakeSweptEvent.serialize({
    routed_stake_id: A,
    parent_id: B,
    value: "99",
  }).toBytes();

  expect(eventParsers.core.releaseRegistryCreated(registry)).toEqual({
    registry_id: A,
    created_by: B,
  });
  expect(eventParsers.primitives.royaltyPool.royaltyClaimed(claimed)).toEqual({
    pool_id: A,
    stake_id: B,
    reward_amount: "42",
  });
  expect(eventParsers.primitives.routedStake.swept(swept)).toEqual({
    routed_stake_id: A,
    parent_id: B,
    value: "99",
  });
});
