// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Generic royalty-pool / stake / routed-stake reads and PTB builders. These are
// the raw, caller-owned primitives against the bare `royalty_pool` and
// `routed_stake` packages — Vault-gated crank operations (composition/recording
// royalty pool plugins, routed-stake Actions bound to a VaultAdminCap) live in
// `./vault.ts` instead; this module does not duplicate those.

import type { ClientWithCoreApi } from "@mysten/sui/client";
import { Transaction, type TransactionArgument, type TransactionObjectArgument } from "@mysten/sui/transactions";
import { deriveObjectID } from "@mysten/sui/utils";
import { getObjectByBcs } from "@misofm/musicos/queries";

import { RoyaltyPool as RoyaltyPoolBcs } from "./contracts/royalty_pool/pool.ts";
import { Stake as RoyaltyStakeBcs } from "./contracts/royalty_pool/stake.ts";
import { RoutedStake as RoutedStakeBcs } from "./contracts/routed_stake/routed_stake.ts";
import * as royaltyPool from "./contracts/royalty_pool/pool.ts";
import * as royaltyStake from "./contracts/royalty_pool/stake.ts";
import * as routedStake from "./contracts/routed_stake/routed_stake.ts";

/** Key bytes for Move unit structs (single `0x00` for `dummy_field: bool = false`). */
const UNIT_STRUCT_KEY_BYTES = new Uint8Array([0x00]);

// ============================================================================
// Reads
// ============================================================================

/** Parse a royalty pool by object ID. Phantom type arguments do not affect BCS. */
export async function getRoyaltyPoolById(
  client: ClientWithCoreApi,
  poolId: string,
) {
  return getObjectByBcs(client, poolId, RoyaltyPoolBcs);
}

/** Parse an owned `Stake<Share>` by object ID. */
export async function getRoyaltyStakeById(
  client: ClientWithCoreApi,
  stakeId: string,
) {
  return getObjectByBcs(client, stakeId, RoyaltyStakeBcs);
}

/** Parse a shared routed stake by object ID. */
export async function getRoutedStakeById(
  client: ClientWithCoreApi,
  routedStakeId: string,
) {
  return getObjectByBcs(client, routedStakeId, RoutedStakeBcs);
}

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
