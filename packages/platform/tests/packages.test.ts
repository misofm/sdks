// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Covers `MisoPlatformPackageBindings` / `misoPlatformPackages` — the
// extensions/primitives/party package-bound generated calls that used to live
// on the pre-split protocol package's combined `MisoPackageBindings` before the
// musicos/platform split (issue misofm/sdks#26).

import { expect, test } from "bun:test";
import { Transaction } from "@mysten/sui/transactions";
import { misoPlatformPackages } from "../src/packages.ts";
import { getMisoPlatformDeployment } from "../src/deployments.ts";
import type { MisoPlatformDeployment } from "../src/deployments.ts";

const id = (value: number) => `0x${value.toString(16).padStart(64, "0")}`;
const SHARE = `0x${"ab".repeat(32)}::share::Share`;
const A = `0x${"11".repeat(32)}`;

const base = getMisoPlatformDeployment("testnet");

/** A full, canonical, pairwise-distinct platform deployment for binding tests. */
const FULL_DEPLOYMENT: MisoPlatformDeployment = {
  ...base,
  packages: {
    ...base.packages,
    compositionCredits: id(1),
    recordingCredits: id(2),
    recordingMasterReference: id(3),
    releaseCoverArt: id(4),
    releaseCredits: id(5),
    releaseDescription: id(6),
    releaseDspLink: id(7),
    releaseGenre: id(8),
    releaseKind: id(9),
    recordingAdvisory: id(10),
    recordingLanguage: id(11),
    royaltyPool: id(12),
    routedStake: id(13),
    countryCode: id(14),
    languageCode: id(15),
  },
  partyos: {
    ...base.partyos,
    partyos: id(20),
  },
  party: {
    ...base.party,
    partyCta: id(21),
    partyGenre: id(22),
    partyMedia: id(23),
    partyMusic: id(24),
    partyPlatformLink: id(25),
    partyProLink: id(26),
    partyProfile: id(27),
    partyRoles: id(28),
    partySocial: id(29),
    partyTags: id(30),
    // The two shared dependency packages must repeat `packages.*` exactly.
    countryCode: id(14),
    languageCode: id(15),
  },
};

interface Call {
  package?: string;
  module: string;
  function: string;
}
function moveCalls(tx: Transaction): Call[] {
  return (tx.getData().commands as Array<{ $kind: string; MoveCall?: Call }>)
    .filter((command) => command.$kind === "MoveCall")
    .map((command) => command.MoveCall!);
}

test("extension and primitive calls bind to their own fresh package IDs", () => {
  const packages = misoPlatformPackages(FULL_DEPLOYMENT);
  const tx = new Transaction();

  tx.add(
    packages.call.extensions.recordingAdvisory.unsetRating({
      typeArguments: [SHARE, SHARE],
      arguments: [tx.object(A), tx.object(A)],
    }),
  );
  tx.add(
    packages.call.primitives.royaltyPool.pool.sweepAndDeposit({
      typeArguments: [SHARE, "0x2::sui::SUI"],
      arguments: [tx.object(A)],
    }),
  );

  const calls = moveCalls(tx);
  expect(calls.find((call) => call.module === "recording_advisory")).toMatchObject({
    package: FULL_DEPLOYMENT.packages.recordingAdvisory,
    function: "unset_rating",
  });
  expect(calls.find((call) => call.function === "sweep_and_deposit")).toMatchObject({
    package: FULL_DEPLOYMENT.packages.royaltyPool,
    module: "pool",
  });
});

test("party calls bind to the party deployment and omit unsafe reference-returning calls", () => {
  const packages = misoPlatformPackages(FULL_DEPLOYMENT);
  const tx = new Transaction();

  tx.add(
    packages.call.party.core.setName({
      arguments: [tx.object(A), tx.object(A), tx.pure.string("Miso")],
    }),
  );

  expect(moveCalls(tx).find((call) => call.module === "party")).toMatchObject({
    package: FULL_DEPLOYMENT.partyos.partyos,
    function: "set_name",
  });
  expect("uid" in packages.call.party.core).toBeFalse();
  expect("uidMut" in packages.call.party.core).toBeFalse();
  expect("groupMembers" in packages.call.party.core).toBeFalse();
  expect("profile" in packages.call.party.profile).toBeFalse();
});

test("package-bound calls omit reference-returning Move views", () => {
  const packages = misoPlatformPackages(FULL_DEPLOYMENT);

  expect("credits" in packages.call.extensions.compositionCredits.compositionCredits).toBeFalse();
  expect("register" in packages.call.primitives.routedStake).toBeFalse();
  expect("unregister" in packages.call.primitives.routedStake).toBeFalse();
  expect("unstake" in packages.call.primitives.routedStake).toBeFalse();
  expect("restake" in packages.call.primitives.routedStake).toBeFalse();
  expect("_new" in packages.call.primitives.royaltyPool.pool).toBeFalse();
});

test("bcs codecs stay available even where the matching call is filtered out", () => {
  const packages = misoPlatformPackages(FULL_DEPLOYMENT);
  expect(packages.bcs.party.core).toBeDefined();
  expect(packages.bcs.primitives.royaltyPool.pool).toBeDefined();
  expect(packages.bcs.extensions.compositionCredits.compositionCredits).toBeDefined();
});

test("misoPlatformPackages rejects an incomplete deployment", () => {
  const incomplete = {
    ...FULL_DEPLOYMENT,
    packages: { ...FULL_DEPLOYMENT.packages, royaltyPool: undefined },
  } as unknown as MisoPlatformDeployment;
  expect(() => misoPlatformPackages(incomplete)).toThrow();
});
