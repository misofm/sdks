// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// `src/royalty.ts`'s three BCS reads (getRoyaltyPoolById/getRoyaltyStakeById/
// getRoutedStakeById): converted in stage 2 (misofm/sdks#35) but left with
// zero test coverage (flagged in docs/CONVERSION.md's stage 2/3 deviations —
// their test file only ever covered the pure PTB builders). B4, misofm/sdks#35
// verification: this file closes that gap.

import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import type { Sui } from "@unconfirmed/sui-effect";
import { layerTest, type FakeObject } from "@unconfirmed/sui-effect/testing";
import * as royaltyPoolContract from "../src/contracts/royalty_pool/pool.ts";
import * as royaltyStakeContract from "../src/contracts/royalty_pool/stake.ts";
import * as routedStakeContract from "../src/contracts/routed_stake/routed_stake.ts";
import { getRoyaltyPoolById, getRoyaltyStakeById, getRoutedStakeById } from "../src/royalty.ts";

const POOL_ID = `0x${"11".repeat(32)}`;
const STAKE_ID = `0x${"22".repeat(32)}`;
const ROUTED_STAKE_ID = `0x${"33".repeat(32)}`;
const SHARE_TYPE = `0x${"bb".repeat(32)}::share::Share`;
const POOL_TYPE = `0x${"aa".repeat(32)}::pool::RoyaltyPool<${SHARE_TYPE}, 0x2::sui::SUI>`;
const STAKE_TYPE = `0x${"aa".repeat(32)}::stake::Stake<${SHARE_TYPE}>`;
const ROUTED_STAKE_TYPE = `0x${"aa".repeat(32)}::routed_stake::RoutedStake<${SHARE_TYPE}, ${SHARE_TYPE}>`;

function run<A, E>(objects: FakeObject[], effect: Effect.Effect<A, E, Sui>): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, layerTest({ objects }), { local: true }));
}

describe("getRoyaltyPoolById", () => {
  test("decodes balance, staked shares, and reward index", async () => {
    const content = royaltyPoolContract.RoyaltyPool.serialize({
      id: POOL_ID,
      balance: { value: "1000000" },
      staked_shares: "500",
      cumulative_reward_per_share: "42",
      carry: "7",
      cumulative_deposits: "2000000",
    }).toBytes();
    const pool = await run(
      [{ objectId: POOL_ID, type: POOL_TYPE, version: 1n, content }],
      getRoyaltyPoolById(POOL_ID),
    );
    expect(pool).toMatchObject({
      id: POOL_ID,
      balance: "1000000",
      stakedShares: "500",
      cumulativeRewardPerShare: "42",
      carry: "7",
      cumulativeDeposits: "2000000",
    });
  });

  test("is null when no such object exists", async () => {
    const pool = await run([], getRoyaltyPoolById(POOL_ID));
    expect(pool).toBeNull();
  });
});

describe("getRoyaltyStakeById", () => {
  test("decodes balance and every currency registration", async () => {
    const content = royaltyStakeContract.Stake.serialize({
      id: STAKE_ID,
      balance: { value: "300" },
      registrations: {
        contents: [
          { key: { name: "0x2::sui::SUI" }, value: { pool_id: POOL_ID, debt: "99" } },
        ],
      },
    }).toBytes();
    const stake = await run(
      [{ objectId: STAKE_ID, type: STAKE_TYPE, version: 1n, content }],
      getRoyaltyStakeById(STAKE_ID),
    );
    expect(stake?.id).toBe(STAKE_ID);
    expect(stake?.balance).toBe("300");
    expect(stake?.registrations).toHaveLength(1);
    expect(stake?.registrations[0]).toMatchObject({ poolId: POOL_ID, debt: "99" });
  });

  test("is null when no such object exists", async () => {
    const stake = await run([], getRoyaltyStakeById(STAKE_ID));
    expect(stake).toBeNull();
  });
});

describe("getRoutedStakeById", () => {
  test("decodes the wrapped stake when present", async () => {
    const content = routedStakeContract.RoutedStake.serialize({
      id: ROUTED_STAKE_ID,
      stake: {
        id: STAKE_ID,
        balance: { value: "300" },
        registrations: { contents: [] },
      },
    }).toBytes();
    const routed = await run(
      [{ objectId: ROUTED_STAKE_ID, type: ROUTED_STAKE_TYPE, version: 1n, content }],
      getRoutedStakeById(ROUTED_STAKE_ID),
    );
    expect(routed?.id).toBe(ROUTED_STAKE_ID);
    // The wrapped `Stake`'s id is the RoutedStake's own — it is unwrapped in
    // place, not a separate object at the embedded `stake.id` bytes.
    expect(routed?.stake).toMatchObject({ id: ROUTED_STAKE_ID, balance: "300" });
  });

  test("stake is null between unstake and restake", async () => {
    const content = routedStakeContract.RoutedStake.serialize({
      id: ROUTED_STAKE_ID,
      stake: null,
    }).toBytes();
    const routed = await run(
      [{ objectId: ROUTED_STAKE_ID, type: ROUTED_STAKE_TYPE, version: 1n, content }],
      getRoutedStakeById(ROUTED_STAKE_ID),
    );
    expect(routed?.stake).toBeNull();
  });

  test("is null when no such object exists", async () => {
    const routed = await run([], getRoutedStakeById(ROUTED_STAKE_ID));
    expect(routed).toBeNull();
  });
});
