// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Covers `src/royalty.ts` — the generic royalty-pool / stake / routed-stake
// derive helpers and PTB builders that used to live on the pre-split protocol package
// before the musicos/platform split (issue misofm/sdks#26). Vault-gated crank
// operations (composition/recording royalty pool plugins, routed-stake
// Actions) are covered by `vault.test.ts`.

import { expect, test } from "bun:test";
import { Transaction } from "@mysten/sui/transactions";
import {
  claimRoyaltyRewards,
  createRoyaltyStake,
  destroyRoyaltyStake,
  deriveRoutedStakeId,
  deriveRoyaltyPoolId,
  registerRoyaltyStake,
} from "../src/royalty.ts";

const PKG = "0x" + "cd".repeat(32);
const A = "0x" + "ab".repeat(32);
const CS = `${PKG}::cs::CS`;
const RS = `${PKG}::rs::RS`;

interface MoveCallInfo {
  module: string;
  function: string;
  typeArguments: string[];
  argCount: number;
}

function moveCalls(tx: Transaction): MoveCallInfo[] {
  const data = tx.getData() as {
    commands: { $kind: string; MoveCall?: { module: string; function: string; typeArguments: string[]; arguments: unknown[] } }[];
  };
  return data.commands
    .filter((c) => c.$kind === "MoveCall" && c.MoveCall)
    .map((c) => ({
      module: c.MoveCall!.module,
      function: c.MoveCall!.function,
      typeArguments: c.MoveCall!.typeArguments,
      argCount: c.MoveCall!.arguments.length,
    }));
}

test("derived royalty-pool and routed-stake ids are deterministic", () => {
  const firstPool = deriveRoyaltyPoolId(A, CS, RS, PKG);
  const secondPool = deriveRoyaltyPoolId(A, CS, RS, PKG);
  const differentCurrency = deriveRoyaltyPoolId(A, CS, `${PKG}::rs::Other`, PKG);
  expect(firstPool).toBe(secondPool);
  expect(firstPool).not.toBe(differentCurrency);

  const firstStake = deriveRoutedStakeId(PKG, CS, `${PKG}::routed_stake`);
  const secondStake = deriveRoutedStakeId(PKG, CS, `${PKG}::routed_stake`);
  const differentShare = deriveRoutedStakeId(PKG, RS, `${PKG}::routed_stake`);
  expect(firstStake).toBe(secondStake);
  expect(firstStake).not.toBe(differentShare);
});

test("royalty stake and claim helpers compose in one PTB, preserving by-value results", () => {
  const tx = new Transaction();
  const stake = createRoyaltyStake(tx, {
    balance: tx.object(A),
    shareType: CS,
    royaltyPoolPackageId: PKG,
  });
  registerRoyaltyStake(tx, {
    poolId: A,
    stake,
    shareType: CS,
    currencyType: RS,
    royaltyPoolPackageId: PKG,
  });
  const reward = claimRoyaltyRewards(tx, {
    poolId: A,
    stakeId: A,
    shareType: CS,
    currencyType: RS,
    royaltyPoolPackageId: PKG,
  });

  expect(moveCalls(tx).map((call) => `${call.module}::${call.function}`)).toEqual([
    "stake::new",
    "pool::register_stake",
    "pool::claim_rewards",
  ]);
  expect(reward).toEqual({ $kind: "Result", Result: 2 });
  // `stake::new` returns exactly one `Stake`; its Result is borrowed by the
  // registration call in the same PTB, leaving no address round-trip.
  const registerCall = moveCalls(tx)[1]!;
  expect(registerCall.argCount).toBe(2);
});

test("registerRoyaltyStake requires a stake or a stakeId", () => {
  const tx = new Transaction();
  expect(() =>
    registerRoyaltyStake(tx, {
      poolId: A,
      shareType: CS,
      currencyType: RS,
      royaltyPoolPackageId: PKG,
    }),
  ).toThrow(/stakeId or stake required/);
});

test("destroyRoyaltyStake returns the principal balance", () => {
  const tx = new Transaction();
  const stake = createRoyaltyStake(tx, {
    balance: tx.object(A),
    shareType: CS,
    royaltyPoolPackageId: PKG,
  });
  destroyRoyaltyStake(tx, { stake, shareType: CS, royaltyPoolPackageId: PKG });

  expect(moveCalls(tx).map((call) => `${call.module}::${call.function}`)).toEqual([
    "stake::new",
    "stake::destroy",
  ]);
});
