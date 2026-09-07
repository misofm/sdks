// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { Transaction } from "@mysten/sui/transactions";
import {
  deriveGenreAddress,
  setReleaseDescription,
  setReleaseDspLinks,
  setReleaseGenres,
  setReleaseKind,
} from "../src/release-extensions.ts";
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
    primaryGenreId: A,
    secondaryGenreIds: [B],
    trackPrimaryGenres: [{ trackIndex: 0, genreId: C }],
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
  expect(labels).toContain("release_genre::set_primary_genre");
  expect(labels).toContain("release_genre::add_secondary_genre");
  expect(labels).toContain("release_genre::set_track_primary_genre");
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

test("genre ids are deterministic and canonical names fail closed", () => {
  expect(deriveGenreAddress(A, PKG, "ELECTRONIC")).toMatch(/^0x[0-9a-f]{64}$/);
  expect(deriveGenreAddress(A, PKG, "ELECTRONIC")).toBe(
    deriveGenreAddress(A, PKG, "ELECTRONIC"),
  );
  expect(() => deriveGenreAddress(A, PKG, "Electronic")).toThrow(
    /uppercase A-Z and underscores/,
  );
});

// Pinned against the on-chain derivation (sui::derived_object::derive_address
// via df::hash_type_and_key with the DerivedObjectKey wrapper), computed by a
// genre unit test on sui 1.77.2: registry 0x3440…, package 0xcbbc…, name
// "ELECTRONIC" → 0xc381…. Guards the off-chain formula byte-for-byte.
test("genre address derivation matches the on-chain test vector", () => {
  expect(
    deriveGenreAddress(
      "0x34401905bebdf8c04f3cd5f04f442a39372c8dc321c29edfb4f9cb30b23ab96",
      "0xcbbce10e8b0781d458e88ce99d08e0c85f1e674c5b7ec975383d74f87a1d76b1",
      "ELECTRONIC",
    ),
  ).toBe("0xc381b7c03d87719d0e1b7b33a08ba8193bfa0af612b05705c4b62a54b18f5ddb");
});
