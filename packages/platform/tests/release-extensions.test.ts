// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { Transaction } from "@mysten/sui/transactions";
import {
  setReleaseDescription,
  setReleaseDspLinks,
  setReleaseKind,
} from "../src/release-extensions.ts";
import { setReleaseGenres } from "../src/genre.ts";
import { setReleaseTrackCover } from "../src/cover.ts";

const PKG = "0x" + "cd".repeat(32);
const A = "0x" + "ab".repeat(32);
const B = "0x" + "bc".repeat(32);
const C = "0x" + "de".repeat(32);

interface Call {
  package?: string;
  module: string;
  function: string;
}

function calls(tx: Transaction): Call[] {
  const data = tx.getData() as {
    commands: { $kind: string; MoveCall?: Call }[];
  };
  return data.commands
    .filter((command) => command.$kind === "MoveCall" && command.MoveCall)
    .map((command) => command.MoveCall!);
}

test("release metadata builders cover every attach-at-publish extension", () => {
  const tx = new Transaction();
  setReleaseKind({
    releaseId: A,
    releaseAdminCapId: A,
    kind: "EP",
    releaseKindPackageId: PKG,
  })(tx);
  setReleaseDescription({
    releaseId: A,
    releaseAdminCapId: A,
    description: "A release.",
    releaseDescriptionPackageId: PKG,
  })(tx);
  setReleaseGenres({
    releaseId: A,
    releaseAdminCapId: A,
    genreIds: [A, B, C],
    releaseGenrePackageId: PKG,
  })(tx);
  setReleaseDspLinks({
    releaseId: A,
    releaseAdminCapId: A,
    releaseLinks: [{ platform: "Spotify", id: "123" }],
    trackLinks: [
      {
        trackIndex: 0,
        link: {
          platform: "AppleMusic",
          storefront: "us",
          albumId: "1",
          trackId: "2",
        },
      },
    ],
    releaseDspLinkPackageId: PKG,
  })(tx);
  setReleaseTrackCover({
    releaseId: A,
    releaseAdminCapId: A,
    trackIndex: 0,
    stillBlobId: 2n,
    coverArtPackageId: PKG,
    releaseCoverArtPackageId: PKG,
    oriPackageId: PKG,
  })(tx);

  const labels = calls(tx).map((call) => `${call.module}::${call.function}`);
  expect(labels).toContain("release_kind::set_kind");
  expect(labels).toContain("release_description::set_description");
  expect(labels.filter((label) => label === "release_genre::add_genre")).toHaveLength(3);
  expect(labels.filter((label) => label === "release_genre::clear_genres")).toHaveLength(1);
  expect(labels.filter((label) => label.startsWith("release_genre::"))).toHaveLength(4);
  expect(labels).toContain("release_dsp_link::set_release_link");
  expect(labels).toContain("release_dsp_link::set_track_link");
  expect(labels).toContain("release_cover_art::set_track_cover");
  expect(
    calls(tx)
      .filter((call) =>
        [
          "release_kind",
          "release_description",
          "release_genre",
          "release_dsp_link",
          "release_cover_art",
          "cover_art",
          "confidentiality",
          "data",
        ].includes(call.module),
      )
      .every((call) => call.package === PKG),
  ).toBe(true);
});

test("release kind and description mirror Move byte limits", () => {
  expect(() =>
    setReleaseKind({
      releaseId: A,
      releaseAdminCapId: A,
      kind: "",
      releaseKindPackageId: PKG,
    }),
  ).toThrow(/must not be empty/);
  expect(() =>
    setReleaseKind({
      releaseId: A,
      releaseAdminCapId: A,
      kind: "あ".repeat(11),
      releaseKindPackageId: PKG,
    }),
  ).toThrow(/32 UTF-8 bytes/);
  expect(() =>
    setReleaseDescription({
      releaseId: A,
      releaseAdminCapId: A,
      description: "x".repeat(8193),
      releaseDescriptionPackageId: PKG,
    }),
  ).toThrow(/8192 UTF-8 bytes/);
});
