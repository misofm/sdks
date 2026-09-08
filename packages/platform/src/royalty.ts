// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Generic royalty-pool / stake / routed-stake reads and PTB builders. These are
// the raw, caller-owned primitives against the bare `royalty_pool` and
// `routed_stake` packages — Vault-gated crank operations (composition/recording
// royalty pool plugins, routed-stake Actions bound to a VaultAdminCap) live in
// `./vault.ts` instead; this module does not duplicate those.

import { Transaction, type TransactionArgument, type TransactionObjectArgument } from "@mysten/sui/transactions";
import { deriveObjectID, normalizeStructTag } from "@mysten/sui/utils";
import { Effect, Schema } from "effect";
import { decodeBcs, getOptionalObjectContent, type BcsDecodeError, type SuiClient, type SuiRpcError } from "@misofm/effect";

import { RoyaltyPool as RoyaltyPoolBcs } from "./contracts/royalty_pool/pool.ts";
import { Stake as RoyaltyStakeBcs } from "./contracts/royalty_pool/stake.ts";
import { RoutedStake as RoutedStakeBcs } from "./contracts/routed_stake/routed_stake.ts";
import * as royaltyPool from "./contracts/royalty_pool/pool.ts";
import * as royaltyStake from "./contracts/royalty_pool/stake.ts";
import * as routedStake from "./contracts/routed_stake/routed_stake.ts";

/** Key bytes for Move unit structs (single `0x00` for `dummy_field: bool = false`). */
const UNIT_STRUCT_KEY_BYTES = new Uint8Array([0x00]);

// ============================================================================
// Domain types
// ============================================================================

/** A stake's active registration against one royalty pool, keyed by currency type. */
export class RoyaltyStakeRegistration extends Schema.Class<RoyaltyStakeRegistration>(
  "@misofm/platform/RoyaltyStakeRegistration",
)({
  currencyType: Schema.String,
  poolId: Schema.String,
  /** Reward debt in `shares · index` units (u256, decimal string). */
  debt: Schema.String,
}) {}

/** A bare `royalty_pool::pool::RoyaltyPool<Share, Currency>` object. Phantom type arguments do not affect BCS. */
export class RoyaltyPool extends Schema.Class<RoyaltyPool>("@misofm/platform/RoyaltyPool")({
  id: Schema.String,
  /** Currency balance held by the pool (u64, decimal string). */
  balance: Schema.String,
  /** Sum of every registered stake's shares (u64, decimal string). */
  stakedShares: Schema.String,
  /** Cumulative reward-per-share index (u256, decimal string). */
  cumulativeRewardPerShare: Schema.String,
  /** Deposit remainder not yet folded into the index (u128, decimal string). */
  carry: Schema.String,
  /** Lifetime sum of every deposited value; analytics only (u128, decimal string). */
  cumulativeDeposits: Schema.String,
}) {}

/** A bare `royalty_pool::stake::Stake<Share>` object. */
export class RoyaltyStake extends Schema.Class<RoyaltyStake>("@misofm/platform/RoyaltyStake")({
  id: Schema.String,
  /** The staked balance (u64, decimal string). Immutable after creation. */
  balance: Schema.String,
  registrations: Schema.Array(RoyaltyStakeRegistration),
}) {}

/** A bare `routed_stake::routed_stake::RoutedStake<StakeShare, PoolShare>` object. */
export class RoutedStake extends Schema.Class<RoutedStake>("@misofm/platform/RoutedStake")({
  id: Schema.String,
  /** The wrapped position; `null` between `unstake` and `restake`. */
  stake: Schema.NullOr(RoyaltyStake),
}) {}

// ============================================================================
// Reads
// ============================================================================

function mapRegistration(currencyType: string, poolId: string, debt: string): typeof RoyaltyStakeRegistration.Encoded {
  return { currencyType: normalizeStructTag(currencyType), poolId, debt };
}

function mapRoyaltyPool(poolId: string, parsed: ReturnType<typeof RoyaltyPoolBcs.parse>): typeof RoyaltyPool.Encoded {
  return {
    id: poolId,
    balance: String(parsed.balance.value),
    stakedShares: String(parsed.staked_shares),
    cumulativeRewardPerShare: String(parsed.cumulative_reward_per_share),
    carry: String(parsed.carry),
    cumulativeDeposits: String(parsed.cumulative_deposits),
  };
}

function mapRoyaltyStake(stakeId: string, parsed: ReturnType<typeof RoyaltyStakeBcs.parse>): typeof RoyaltyStake.Encoded {
  return {
    id: stakeId,
    balance: String(parsed.balance.value),
    registrations: parsed.registrations.contents.map((entry) =>
      mapRegistration(entry.key.name, entry.value.pool_id, String(entry.value.debt)),
    ),
  };
}

function mapRoutedStake(
  routedStakeId: string,
  parsed: ReturnType<typeof RoutedStakeBcs.parse>,
): typeof RoutedStake.Encoded {
  return {
    id: routedStakeId,
    stake: parsed.stake ? mapRoyaltyStake(routedStakeId, parsed.stake) : null,
  };
}

/** One royalty pool by object ID, or `null` when no such object exists. */
export const getRoyaltyPoolById = Effect.fn("getRoyaltyPoolById")(function* (
  poolId: string,
): Effect.fn.Return<RoyaltyPool | null, BcsDecodeError | SuiRpcError, SuiClient> {
  const found = yield* getOptionalObjectContent(poolId);
  if (found._tag === "None") return null;
  return yield* decodeBcs(
    { parse: (bytes) => mapRoyaltyPool(poolId, RoyaltyPoolBcs.parse(bytes)) },
    RoyaltyPool,
    found.value.content,
    { type: "RoyaltyPool", objectId: poolId },
  );
});

/** One owned `Stake<Share>` by object ID, or `null` when no such object exists. */
export const getRoyaltyStakeById = Effect.fn("getRoyaltyStakeById")(function* (
  stakeId: string,
): Effect.fn.Return<RoyaltyStake | null, BcsDecodeError | SuiRpcError, SuiClient> {
  const found = yield* getOptionalObjectContent(stakeId);
  if (found._tag === "None") return null;
  return yield* decodeBcs(
    { parse: (bytes) => mapRoyaltyStake(stakeId, RoyaltyStakeBcs.parse(bytes)) },
    RoyaltyStake,
    found.value.content,
    { type: "RoyaltyStake", objectId: stakeId },
  );
});

/** One shared routed stake by object ID, or `null` when no such object exists. */
export const getRoutedStakeById = Effect.fn("getRoutedStakeById")(function* (
  routedStakeId: string,
): Effect.fn.Return<RoutedStake | null, BcsDecodeError | SuiRpcError, SuiClient> {
  const found = yield* getOptionalObjectContent(routedStakeId);
  if (found._tag === "None") return null;
  return yield* decodeBcs(
    { parse: (bytes) => mapRoutedStake(routedStakeId, RoutedStakeBcs.parse(bytes)) },
    RoutedStake,
    found.value.content,
    { type: "RoutedStake", objectId: routedStakeId },
  );
});

/** Deterministically derive the royalty-pool ID for a parent and type pair. */
export function deriveRoyaltyPoolId(
  parentId: string,
  shareType: string,
  currencyType: string,
  royaltyPoolPackageId: string,
): string {
  return deriveObjectID(
    parentId,
    `${royaltyPoolPackageId}::pool::RoyaltyPoolKey<${shareType}, ${currencyType}>`,
    UNIT_STRUCT_KEY_BYTES,
  );
}

/** Deterministically derive the routed-stake ID for a parent and stake share. */
export function deriveRoutedStakeId(
  parentId: string,
  stakeShareType: string,
  routedStakePackageId: string,
): string {
  return deriveObjectID(
    parentId,
    `${routedStakePackageId}::routed_stake::RoutedStakeKey<${stakeShareType}>`,
    UNIT_STRUCT_KEY_BYTES,
  );
}

// ============================================================================
// Generic royalty primitives (PTB builders)
// ============================================================================

/** Create an owned `Stake<Share>` from a by-value `Balance<Share>`. */
export function createRoyaltyStake(
  tx: Transaction,
  params: {
    balance: TransactionArgument;
    shareType: string;
    royaltyPoolPackageId: string;
  },
): TransactionObjectArgument {
  return tx.add(
    royaltyStake._new({
      package: params.royaltyPoolPackageId,
      typeArguments: [params.shareType],
      arguments: [params.balance],
    }),
  );
}

/** Destroy an unregistered stake and return its principal `Balance<Share>`. */
export function destroyRoyaltyStake(
  tx: Transaction,
  params: {
    stake: TransactionObjectArgument;
    shareType: string;
    royaltyPoolPackageId: string;
  },
): TransactionObjectArgument {
  return tx.add(
    royaltyStake.destroy({
      package: params.royaltyPoolPackageId,
      typeArguments: [params.shareType],
      arguments: [params.stake],
    }),
  );
}

/** Register an owned stake against a shared royalty pool. */
export function registerRoyaltyStake(
  tx: Transaction,
  params: {
    poolId: string;
    stakeId?: string;
    /** A `Stake` created earlier in this same PTB. */
    stake?: TransactionObjectArgument;
    shareType: string;
    currencyType: string;
    royaltyPoolPackageId: string;
  },
): void {
  if (!params.stake && !params.stakeId) {
    throw new Error("registerRoyaltyStake: stakeId or stake required");
  }
  tx.add(
    royaltyPool.registerStake({
      package: params.royaltyPoolPackageId,
      typeArguments: [params.shareType, params.currencyType],
      arguments: [tx.object(params.poolId), params.stake ?? tx.object(params.stakeId!)],
    }),
  );
}

/** Claim rewards. The returned `Balance<Currency>` must be consumed in this PTB. */
export function claimRoyaltyRewards(
  tx: Transaction,
  params: {
    poolId: string;
    stakeId: string;
    shareType: string;
    currencyType: string;
    royaltyPoolPackageId: string;
  },
): TransactionObjectArgument {
  return tx.add(
    royaltyPool.claimRewards({
      package: params.royaltyPoolPackageId,
      typeArguments: [params.shareType, params.currencyType],
      arguments: [tx.object(params.poolId), tx.object(params.stakeId)],
    }),
  );
}

// `sweepRoutedStake` — the permissionless routed-stake reward sweep — already
// lives in `./vault.ts` and is exported from the package root from there; this
// module does not duplicate it.
