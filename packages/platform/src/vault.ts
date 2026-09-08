// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Capability custody, raw-cap Action, and safe crank-plugin transaction builders.
 *
 * A direct admin cap remains supported for existing works. New work should give
 * the owner a `VaultAdminCap<AdminCap>` and keep the raw admin cap inside the
 * shared Vault. Every authorized call borrows and returns the raw cap inside
 * one helper; borrowed capabilities are never exposed to application code.
 * Party wallet and routed-stake operations remain Actions because their useful
 * results must stay under the caller's control.
 */

import type { BcsType } from "@mysten/sui/bcs";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type {
  Transaction,
  TransactionArgument,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";
import { deriveObjectID, normalizeStructTag } from "@mysten/sui/utils";
import * as vault from "./contracts/vault/vault.ts";
import * as releaseRevenueDistributor from "./contracts/release_revenue_distributor/release_revenue_distributor.ts";
import * as compositionRoyaltyPoolPlugin from "./contracts/composition_royalty_pool_plugin/composition_royalty_pool_plugin.ts";
import * as recordingRoyaltyPoolPlugin from "./contracts/recording_royalty_pool_plugin/recording_royalty_pool_plugin.ts";
import * as releaseRevenueDistributorPlugin from "./contracts/release_revenue_distributor_plugin/release_revenue_distributor_plugin.ts";
import * as routedStake from "./contracts/routed_stake/routed_stake.ts";

/** A legacy work whose raw protocol admin cap is still address-owned. */
/** An object id resolved lazily when a transaction thunk is applied. */
export type ObjectInput = string | TransactionObjectArgument;

/** The framework singleton read by `balance::settled_funds_value`. */
export const SUI_ACCUMULATOR_ROOT_OBJECT_ID = "0xacc";

function object(tx: Transaction, value: ObjectInput): TransactionObjectArgument {
  return typeof value === "string" ? tx.object(value) : value;
}

export interface DirectAdminCapAuthority {
  readonly kind: "direct";
  readonly adminCap: ObjectInput;
}

/** A work whose protocol admin cap is custodied by a shared Vault. */
export interface VaultAdminCapAuthority {
  readonly kind: "vault";
  readonly vault: ObjectInput;
  readonly vaultAdminCap: ObjectInput;
  /** Fully-qualified protocol cap type, e.g. `0x…::release::ReleaseAdminCap`. */
  readonly capType: string;
  readonly vaultPackageId: string;
}

/** Explicit compatibility boundary for protocol mutations. */
export type AdminCapAuthority =
  | DirectAdminCapAuthority
  | VaultAdminCapAuthority;

export function directAdminCap(
  adminCap: ObjectInput,
): DirectAdminCapAuthority {
  return { kind: "direct", adminCap };
}

function requiredVaultResult<T>(
  result: { readonly [index: number]: T | undefined },
  index: number,
  command: string,
): T {
  const value = result[index];
  if (value === undefined) throw new Error(`${command} did not return result ${index}`);
  return value;
}

export function vaultAdminCap(
  authority: Omit<VaultAdminCapAuthority, "kind">,
): VaultAdminCapAuthority {
  return { kind: "vault", ...authority };
}

/**
 * Lend an authority's raw protocol cap to `use` for the scope of this PTB.
 *
 * The vault branch deliberately encloses `use` between `borrow_as_admin` and
 * `put_back`; callers cannot accidentally leave a non-drop `Borrow` receipt in
 * the transaction. The direct branch preserves compatibility with pre-vault
 * work without silently treating it as protected custody.
 */
/**
 * A Move call whose argument list contains exactly one temporarily lent cap.
 * No callback receives that cap, so it cannot escape past `put_back`.
 */
export interface AdminCapMoveCall {
  readonly target: string;
  readonly typeArguments?: string[];
  readonly arguments: TransactionArgument[];
  readonly adminCapIndex: number;
}

/**
 * Invoke one cap-authorized Move call without exposing a borrowed cap to JS.
 * The returned PTB result belongs to `call.target`, never to the Vault borrow.
 */
export function invokeWithAdminCap(
  tx: Transaction,
  authority: AdminCapAuthority,
  call: AdminCapMoveCall,
): TransactionObjectArgument {
  if (call.adminCapIndex < 0 || call.adminCapIndex > call.arguments.length) {
    throw new Error("admin cap argument index is out of range");
  }

  const invoke = (adminCap: TransactionArgument) => tx.moveCall({
    target: call.target,
    typeArguments: call.typeArguments,
    arguments: [
      ...call.arguments.slice(0, call.adminCapIndex),
      adminCap,
      ...call.arguments.slice(call.adminCapIndex),
    ],
  });
  if (authority.kind === "direct") return invoke(object(tx, authority.adminCap));

  const borrowed = tx.add(
    vault.borrowAsAdmin({
      package: authority.vaultPackageId,
      typeArguments: [authority.capType],
      arguments: [object(tx, authority.vault), object(tx, authority.vaultAdminCap)],
    }),
  );
  const adminCap = borrowed[0];
  const receipt = borrowed[1];
  if (adminCap === undefined || receipt === undefined) {
    throw new Error("vault::borrow_as_admin returned an incomplete result");
  }
  const result = invoke(adminCap);
  tx.add(
    vault.putBack({
      package: authority.vaultPackageId,
      typeArguments: [authority.capType],
      arguments: [authority.vault, adminCap, receipt],
    }),
  );
  return result;
}

export interface CustodyNewAdminCapParams {
  /** The freshly-created raw protocol cap, consumed into the Vault. */
  readonly adminCap: TransactionObjectArgument;
  /** Shared singleton from which canonical Vault IDs are derived. */
  readonly vaultRegistry: ObjectInput;
  readonly capType: string;
  readonly vaultPackageId: string;
  /** Recipient of the only owner-held authority: VaultAdminCap. */
  readonly owner: string | TransactionArgument;
  /** Optional installation/configuration while the new Vault is still owned. */
  readonly configure?: (
    vaultObject: TransactionObjectArgument,
    vaultAdminCapObject: TransactionObjectArgument,
  ) => void;
}

/** Where a newly-created raw protocol cap ends up after its work is published. */
export type AdminCapCustody =
  | { readonly kind: "direct"; readonly owner: string | TransactionArgument }
  | {
      readonly kind: "vault";
      readonly owner: string | TransactionArgument;
      readonly vaultRegistry: ObjectInput;
      readonly capType: string;
      readonly vaultPackageId: string;
      readonly configure?: CustodyNewAdminCapParams["configure"];
    };

/** Explicitly transfer a new cap or custody it before the PTB finishes. */
export function disposeNewAdminCap(
  tx: Transaction,
  adminCap: TransactionObjectArgument,
  custody: AdminCapCustody,
): void {
  if (custody.kind === "direct") {
    tx.transferObjects([adminCap], custody.owner);
    return;
  }
  custodyNewAdminCap(tx, {
    adminCap,
    vaultRegistry: custody.vaultRegistry,
    capType: custody.capType,
    vaultPackageId: custody.vaultPackageId,
    owner: custody.owner,
    configure: custody.configure,
  });
}

/** Withdraw the raw capability while leaving its canonical Vault shell intact. */
export function withdrawVaultCapability(
  tx: Transaction,
  params: {
    readonly vault: ObjectInput;
    readonly vaultAdminCap: ObjectInput;
    readonly capType: string;
    readonly vaultPackageId: string;
  },
): TransactionObjectArgument {
  return tx.add(vault.withdrawCap({
    package: params.vaultPackageId,
    typeArguments: [params.capType],
    arguments: [object(tx, params.vault), object(tx, params.vaultAdminCap)],
  }));
}

/** Restore the one exact capability permanently assigned to a Vault. */
export function restoreVaultCapability(
  tx: Transaction,
  params: {
    readonly vault: ObjectInput;
    readonly vaultAdminCap: ObjectInput;
    readonly adminCap: ObjectInput;
    readonly capType: string;
    readonly vaultPackageId: string;
  },
): void {
  tx.add(vault.restoreCap({
    package: params.vaultPackageId,
    typeArguments: [params.capType],
    arguments: [
      object(tx, params.vault),
      object(tx, params.vaultAdminCap),
      object(tx, params.adminCap),
    ],
  }));
}

/** Transfer the `key + store` VaultAdminCap to its next owner. */
export function transferVaultAdminCap(
  tx: Transaction,
  params: {
    readonly vaultAdminCap: ObjectInput;
    readonly owner: string | TransactionArgument;
    readonly capType: string;
    readonly vaultPackageId: string;
  },
): void {
  tx.transferObjects([object(tx, params.vaultAdminCap)], params.owner);
}

/**
 * Custody a freshly-created raw admin cap, optionally configure it, share the
 * Vault, then transfer only the VaultAdminCap to its owner.
 */
export function custodyNewAdminCap(
  tx: Transaction,
  params: CustodyNewAdminCapParams,
): void {
  const created = tx.add(
    vault._new({
      package: params.vaultPackageId,
      typeArguments: [params.capType],
      arguments: [object(tx, params.vaultRegistry), params.adminCap],
    }),
  );
  const vaultObject = requiredVaultResult(created, 0, "vault::_new");
  const vaultAdminCap = requiredVaultResult(created, 1, "vault::_new");
  params.configure?.(vaultObject, vaultAdminCap);
  tx.add(
    vault.share({
      package: params.vaultPackageId,
      typeArguments: [params.capType],
      arguments: [vaultObject],
    }),
  );
  transferVaultAdminCap(tx, {
    vaultAdminCap,
    owner: params.owner,
    capType: params.capType,
    vaultPackageId: params.vaultPackageId,
  });
}

export interface VaultIdParams {
  readonly vaultRegistryId: string;
  readonly capId: string;
  readonly capType: string;
  readonly vaultPackageId: string;
}

/** Derive the canonical Vault ID without an RPC lookup. */
export function deriveVaultId(params: VaultIdParams): string {
  const keyType = normalizeStructTag(
    `${params.vaultPackageId}::vault::VaultKey<${params.capType}>`,
  );
  return deriveObjectID(
    params.vaultRegistryId,
    keyType,
    vault.VaultKey.serialize([params.capId]).toBytes(),
  );
}

/** Derive the canonical VaultAdminCap ID from its Vault ID. */
export function deriveVaultAdminCapId(
  vaultId: string,
  vaultPackageId: string,
): string {
  return deriveObjectID(
    vaultId,
    `${vaultPackageId}::vault::VaultAdminCapKey`,
    vault.VaultAdminCapKey.serialize([false]).toBytes(),
  );
}

export interface CompositionRoyaltyPoolPluginParams {
  readonly vault: TransactionObjectArgument;
  readonly vaultAdminCap: TransactionObjectArgument;
  readonly compositionShareType: string;
  readonly pluginPackageId: string;
}

/** Install the composition royalty-pool plugin; its witness stays internal. */
export function installCompositionRoyaltyPoolPlugin(
  tx: Transaction,
  params: CompositionRoyaltyPoolPluginParams,
): void {
  tx.add(
    compositionRoyaltyPoolPlugin.install({
      package: params.pluginPackageId,
      typeArguments: [params.compositionShareType],
      arguments: [params.vault, params.vaultAdminCap],
    }),
  );
}

export function uninstallCompositionRoyaltyPoolPlugin(
  tx: Transaction,
  params: CompositionRoyaltyPoolPluginParams,
): void {
  tx.add(
    compositionRoyaltyPoolPlugin.uninstall({
      package: params.pluginPackageId,
      typeArguments: [params.compositionShareType],
      arguments: [params.vault, params.vaultAdminCap],
    }),
  );
}

export interface NewCompositionRoyaltyPoolParams {
  readonly authority: AdminCapAuthority;
  readonly composition: TransactionObjectArgument;
  readonly actionPackageId: string;
  readonly currencyType: string;
  readonly compositionShareType: string;
}

/** Create the canonical pool without sharing it so callers can configure fresh stakes first. */
export function newCompositionRoyaltyPool(
  tx: Transaction,
  params: NewCompositionRoyaltyPoolParams,
): TransactionObjectArgument {
  return invokeWithAdminCap(tx, params.authority, {
    target: `${params.actionPackageId}::composition_royalty_pool::new_pool`,
    typeArguments: [params.compositionShareType, params.currencyType],
    arguments: [params.composition],
    adminCapIndex: 1,
  });
}

export interface CompositionRoyaltyPoolCrankParams {
  readonly vault: TransactionObjectArgument;
  readonly composition: TransactionObjectArgument;
  readonly pool: TransactionObjectArgument;
  readonly compositionShareType: string;
  readonly currencyType: string;
  readonly pluginPackageId: string;
}

/** JSON-safe input for an on-chain u64. Numbers are rejected to prevent rounding. */
export type U64Input = bigint | string | number;

/** An exact scalar or the result of an earlier PTB command returning `u64`. */
export type U64Argument = U64Input | TransactionArgument;

/** Validate an SDK scalar before serializing it as a Move u64. */
export function asU64(name: string, value: U64Input): bigint {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`${name}: number must be a non-negative safe integer; use bigint or decimal string`);
  }
  if (typeof value === "string" && !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${name}: expected an unsigned decimal u64`);
  }
  const parsed = typeof value === "bigint" ? value : BigInt(value);
  if (parsed < 0n || parsed > 18_446_744_073_709_551_615n) {
    throw new Error(`${name}: value is outside u64`);
  }
  return parsed;
}

function asU64Argument(tx: Transaction, name: string, value: U64Argument): TransactionArgument {
  if (
    typeof value === "bigint" ||
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return tx.pure.u64(asU64(name, value));
  }
  return value;
}

/** Read the commit-settled accumulator balance for an address inside this PTB. */
export function settledFundsValue(
  tx: Transaction,
  params: {
    readonly address: string | TransactionArgument;
    readonly currencyType: string;
    readonly accumulatorRoot?: ObjectInput;
  },
): TransactionArgument {
  return tx.moveCall({
    target: "0x2::balance::settled_funds_value",
    typeArguments: [params.currencyType],
    arguments: [
      object(tx, params.accumulatorRoot ?? SUI_ACCUMULATOR_ROOT_OBJECT_ID),
      typeof params.address === "string"
        ? tx.pure.address(params.address)
        : params.address,
    ],
  });
}

/** Permissionless crank: redeem an exact Composition amount into its pool. */
export function redeemAndDepositCompositionRoyaltyPool(
  tx: Transaction,
  params: CompositionRoyaltyPoolCrankParams & {
    readonly value: U64Argument;
  },
): void {
  tx.add(
    compositionRoyaltyPoolPlugin.redeemAndDeposit({
      package: params.pluginPackageId,
      typeArguments: [params.compositionShareType, params.currencyType],
      arguments: [
        params.vault,
        params.composition,
        params.pool,
        asU64Argument(tx, "value", params.value),
      ],
    }),
  );
}

/** Redeem exactly the framework-reported settled Composition funds. */
export function settleCompositionRoyaltyPool(
  tx: Transaction,
  params: Omit<CompositionRoyaltyPoolCrankParams, "composition"> & {
    readonly compositionId: string;
    readonly accumulatorRoot?: ObjectInput;
  },
): void {
  const value = settledFundsValue(tx, {
    address: params.compositionId,
    currencyType: params.currencyType,
    accumulatorRoot: params.accumulatorRoot,
  });
  redeemAndDepositCompositionRoyaltyPool(tx, {
    ...params,
    composition: tx.object(params.compositionId),
    value,
  });
}

/** Permissionless crank: receive selected Composition-owned coins into the pool. */
export function receiveCompositionRoyaltyPool(
  tx: Transaction,
  params: CompositionRoyaltyPoolCrankParams & { readonly coins: readonly ReceivingObjectRef[] },
): void {
  tx.add(
    compositionRoyaltyPoolPlugin.receiveAndDeposit({
      package: params.pluginPackageId,
      typeArguments: [params.compositionShareType, params.currencyType],
      arguments: [
        params.vault,
        params.composition,
        params.pool,
        receivingCoins(tx, params.currencyType, params.coins),
      ],
    }),
  );
}

export interface RecordingRoyaltyPoolPluginParams {
  readonly vault: TransactionObjectArgument;
  readonly vaultAdminCap: TransactionObjectArgument;
  readonly recordingShareType: string;
  readonly compositionShareType: string;
  readonly pluginPackageId: string;
}

export function installRecordingRoyaltyPoolPlugin(
  tx: Transaction,
  params: RecordingRoyaltyPoolPluginParams,
): void {
  tx.add(
    recordingRoyaltyPoolPlugin.install({
      package: params.pluginPackageId,
      typeArguments: [params.recordingShareType],
      arguments: [params.vault, params.vaultAdminCap],
    }),
  );
}

export interface PartyWalletFundsParams {
  readonly authority: AdminCapAuthority;
  readonly party: TransactionObjectArgument;
  readonly currencyType: string;
  readonly actionPackageId: string;
}

/** Receive selected Party-owned coins and return their merged Balance. */
export function receivePartyWalletBalance(
  tx: Transaction,
  params: PartyWalletFundsParams & { readonly coins: readonly ReceivingObjectRef[] },
): TransactionArgument {
  return invokeWithAdminCap(tx, params.authority, {
    target: `${params.actionPackageId}::party_wallet::receive_balance`,
    typeArguments: [params.currencyType],
    arguments: [params.party, receivingCoins(tx, params.currencyType, params.coins)],
    adminCapIndex: 1,
  });
}

/** Redeem an exact Party accumulator amount and return its Balance. */
export function redeemPartyWalletBalance(
  tx: Transaction,
  params: PartyWalletFundsParams & { readonly value: U64Argument },
): TransactionArgument {
  return invokeWithAdminCap(tx, params.authority, {
    target: `${params.actionPackageId}::party_wallet::redeem_balance`,
    typeArguments: [params.currencyType],
    arguments: [params.party, asU64Argument(tx, "value", params.value)],
    adminCapIndex: 1,
  });
}

/** Redeem exactly the framework-reported settled Party funds. */
export function settlePartyWalletBalance(
  tx: Transaction,
  params: Omit<PartyWalletFundsParams, "party"> & {
    readonly partyId: string;
    readonly accumulatorRoot?: ObjectInput;
  },
): TransactionArgument {
  const value = settledFundsValue(tx, {
    address: params.partyId,
    currencyType: params.currencyType,
    accumulatorRoot: params.accumulatorRoot,
  });
  return redeemPartyWalletBalance(tx, {
    ...params,
    party: tx.object(params.partyId),
    value,
  });
}

export function uninstallRecordingRoyaltyPoolPlugin(
  tx: Transaction,
  params: RecordingRoyaltyPoolPluginParams,
): void {
  tx.add(
    recordingRoyaltyPoolPlugin.uninstall({
      package: params.pluginPackageId,
      typeArguments: [params.recordingShareType],
      arguments: [params.vault, params.vaultAdminCap],
    }),
  );
}

export interface NewRecordingRoyaltyPoolParams {
  readonly authority: AdminCapAuthority;
  readonly recording: TransactionObjectArgument;
  readonly actionPackageId: string;
  readonly currencyType: string;
  readonly recordingShareType: string;
  readonly compositionShareType: string;
}

/** Create the canonical pool without sharing it so callers can configure fresh stakes first. */
export function newRecordingRoyaltyPool(
  tx: Transaction,
  params: NewRecordingRoyaltyPoolParams,
): TransactionObjectArgument {
  return invokeWithAdminCap(tx, params.authority, {
    target: `${params.actionPackageId}::recording_royalty_pool::new_pool`,
    typeArguments: [
      params.recordingShareType,
      params.compositionShareType,
      params.currencyType,
    ],
    arguments: [params.recording],
    adminCapIndex: 1,
  });
}

export interface RecordingRoyaltyPoolCrankParams {
  readonly vault: TransactionObjectArgument;
  readonly recording: TransactionObjectArgument;
  readonly pool: TransactionObjectArgument;
  readonly recordingShareType: string;
  readonly compositionShareType: string;
  readonly currencyType: string;
  readonly pluginPackageId: string;
}

/** Permissionless crank: redeem an exact Recording amount into its pool. */
export function redeemAndDepositRecordingRoyaltyPool(
  tx: Transaction,
  params: RecordingRoyaltyPoolCrankParams & {
    readonly value: U64Argument;
  },
): void {
  tx.add(
    recordingRoyaltyPoolPlugin.redeemAndDeposit({
      package: params.pluginPackageId,
      typeArguments: [
        params.recordingShareType,
        params.compositionShareType,
        params.currencyType,
      ],
      arguments: [
        params.vault,
        params.recording,
        params.pool,
        asU64Argument(tx, "value", params.value),
      ],
    }),
  );
}

/** Redeem exactly the framework-reported settled Recording funds. */
export function settleRecordingRoyaltyPool(
  tx: Transaction,
  params: Omit<RecordingRoyaltyPoolCrankParams, "recording"> & {
    readonly recordingId: string;
    readonly accumulatorRoot?: ObjectInput;
  },
): void {
  const value = settledFundsValue(tx, {
    address: params.recordingId,
    currencyType: params.currencyType,
    accumulatorRoot: params.accumulatorRoot,
  });
  redeemAndDepositRecordingRoyaltyPool(tx, {
    ...params,
    recording: tx.object(params.recordingId),
    value,
  });
}

/** Permissionless crank: receive selected Recording-owned coins into the pool. */
export function receiveRecordingRoyaltyPool(
  tx: Transaction,
  params: RecordingRoyaltyPoolCrankParams & { readonly coins: readonly ReceivingObjectRef[] },
): void {
  tx.add(
    recordingRoyaltyPoolPlugin.receiveAndDeposit({
      package: params.pluginPackageId,
      typeArguments: [
        params.recordingShareType,
        params.compositionShareType,
        params.currencyType,
      ],
      arguments: [
        params.vault,
        params.recording,
        params.pool,
        receivingCoins(tx, params.currencyType, params.coins),
      ],
    }),
  );
}

export interface ReleaseRevenueDistributorPluginParams {
  readonly vault: TransactionObjectArgument;
  readonly vaultAdminCap: TransactionObjectArgument;
  readonly pluginPackageId: string;
}

export function installReleaseRevenueDistributorPlugin(
  tx: Transaction,
  params: ReleaseRevenueDistributorPluginParams,
): void {
  tx.add(
    releaseRevenueDistributorPlugin.install({
      package: params.pluginPackageId,
      arguments: [params.vault, params.vaultAdminCap],
    }),
  );
}

export function uninstallReleaseRevenueDistributorPlugin(
  tx: Transaction,
  params: ReleaseRevenueDistributorPluginParams,
): void {
  tx.add(releaseRevenueDistributorPlugin.uninstall({ package: params.pluginPackageId, arguments: [params.vault, params.vaultAdminCap] }));
}

export interface ReleaseRevenueDistributorActionParams {
  readonly authority: AdminCapAuthority;
  readonly release: TransactionObjectArgument;
  readonly currencyType: string;
  readonly actionPackageId: string;
}

/** Raw-admin composition: redeem an explicit amount and route it by track BPS. */
export function redeemAndDistributeReleaseRevenue(
  tx: Transaction,
  params: ReleaseRevenueDistributorActionParams & {
    readonly value: U64Argument;
  },
): void {
  invokeWithAdminCap(tx, params.authority, {
    target: `${params.actionPackageId}::release_revenue_distributor::redeem_and_distribute`,
    typeArguments: [params.currencyType],
    arguments: [params.release, asU64Argument(tx, "value", params.value)],
    adminCapIndex: 1,
  });
}

/** Fixed permissionless crank: redeem the commit-settled Release balance. */
export function redeemAllAndDistributeReleaseRevenue(
  tx: Transaction,
  params: Omit<ReleaseRevenueDistributorPluginParams, "vaultAdminCap"> & {
    readonly release: TransactionObjectArgument;
    readonly currencyType: string;
    readonly accumulatorRoot?: ObjectInput;
  },
): void {
  // The generated binding resolves the chain-wide accumulator root itself, so it
  // no longer accepts one. Call the target directly to keep honoring an explicit
  // `accumulatorRoot` (a test fixture root) while the on-chain shape is unchanged.
  tx.moveCall({
    target: `${params.pluginPackageId}::release_revenue_distributor_plugin::redeem_all_and_distribute`,
    typeArguments: [params.currencyType],
    arguments: [
      object(tx, params.vault),
      params.release,
      object(tx, params.accumulatorRoot ?? SUI_ACCUMULATOR_ROOT_OBJECT_ID),
    ],
  });
}

/** Convenience form of the fixed crank for a known Release object ID. */
export function settleAndDistributeReleaseRevenue(
  tx: Transaction,
  params: Omit<ReleaseRevenueDistributorPluginParams, "vaultAdminCap"> & {
    readonly releaseId: string;
    readonly currencyType: string;
    readonly accumulatorRoot?: ObjectInput;
  },
): void {
  redeemAllAndDistributeReleaseRevenue(tx, {
    ...params,
    release: tx.object(params.releaseId),
  });
}

/** Permissionless crank: receive release-owned coins and route them by track BPS. */
export function receiveAndDistributeReleaseRevenue(
  tx: Transaction,
  params: Omit<ReleaseRevenueDistributorPluginParams, "vaultAdminCap"> & {
    readonly release: TransactionObjectArgument;
    readonly currencyType: string;
    readonly coins: readonly ReceivingObjectRef[];
  },
): void {
  tx.add(
    releaseRevenueDistributorPlugin.receiveAndDistribute({
      package: params.pluginPackageId,
      typeArguments: [params.currencyType],
      arguments: [
        params.vault,
        params.release,
        receivingCoins(tx, params.currencyType, params.coins),
      ],
    }),
  );
}

export interface CompositionRoutedStakeActionParams {
  readonly authority: AdminCapAuthority;
  readonly compositionShareType: string;
  readonly actionPackageId: string;
}

export interface CreateCompositionRoutedStakeParams
  extends CompositionRoutedStakeActionParams {
  readonly recording: TransactionObjectArgument;
  readonly composition: TransactionObjectArgument;
  readonly recordingShareType: string;
  readonly value: U64Input;
}

export function createCompositionRoutedStake(
  tx: Transaction,
  params: CreateCompositionRoutedStakeParams,
): TransactionObjectArgument {
  return invokeWithAdminCap(tx, params.authority, {
    target: `${params.actionPackageId}::composition_routed_stake::create_stake`,
    typeArguments: [params.recordingShareType, params.compositionShareType],
    arguments: [params.composition, params.recording, tx.pure.u64(asU64("value", params.value))],
    adminCapIndex: 1,
  });
}

export interface ManageCompositionRoutedStakeParams
  extends CompositionRoutedStakeActionParams {
  readonly composition: TransactionObjectArgument;
  readonly recording: TransactionObjectArgument;
  readonly routedStake: TransactionObjectArgument;
  readonly royaltyPool: TransactionObjectArgument;
  readonly recordingShareType: string;
  readonly currencyType: string;
}

/** Register the routed stake with the matching Recording royalty pool. */
export function registerCompositionRoutedStake(
  tx: Transaction,
  params: ManageCompositionRoutedStakeParams,
): void {
  invokeWithAdminCap(tx, params.authority, {
    target: `${params.actionPackageId}::composition_routed_stake::register`,
    typeArguments: [params.recordingShareType, params.compositionShareType, params.currencyType],
    arguments: [params.composition, params.recording, params.routedStake, params.royaltyPool],
    adminCapIndex: 1,
  });
}

/** Share a configured routed stake so anyone can sweep its rewards to the parent pool. */
export function shareRoutedStake(
  tx: Transaction,
  params: {
    readonly routedStake: TransactionObjectArgument;
    readonly routedStakePackageId: string;
    readonly stakeShareType: string;
    readonly poolShareType: string;
  },
): void {
  tx.add(routedStake.share({
    package: params.routedStakePackageId,
    typeArguments: [params.stakeShareType, params.poolShareType],
    arguments: [params.routedStake],
  }));
}

/** Unregister a routed stake after pending rewards have been swept. */
export function unregisterCompositionRoutedStake(
  tx: Transaction,
  params: ManageCompositionRoutedStakeParams,
): void {
  invokeWithAdminCap(tx, params.authority, {
    target: `${params.actionPackageId}::composition_routed_stake::unregister`,
    typeArguments: [params.recordingShareType, params.compositionShareType, params.currencyType],
    arguments: [params.composition, params.recording, params.routedStake, params.royaltyPool],
    adminCapIndex: 1,
  });
}

/** Unstake and return the routed principal for caller-selected composition. */
export function unstakeCompositionRoutedStake(
  tx: Transaction,
  params: Omit<ManageCompositionRoutedStakeParams, "recording" | "royaltyPool" | "currencyType">,
): TransactionObjectArgument {
  return invokeWithAdminCap(tx, params.authority, {
    target: `${params.actionPackageId}::composition_routed_stake::unstake`,
    typeArguments: [params.recordingShareType, params.compositionShareType],
    arguments: [params.composition, params.routedStake],
    adminCapIndex: 1,
  });
}

/** Refill an empty routed stake with caller-supplied Recording shares. */
export function restakeCompositionRoutedStake(
  tx: Transaction,
  params: Omit<ManageCompositionRoutedStakeParams, "recording" | "royaltyPool" | "currencyType"> & {
    readonly shares: TransactionArgument;
  },
): void {
  invokeWithAdminCap(tx, params.authority, {
    target: `${params.actionPackageId}::composition_routed_stake::restake`,
    typeArguments: [params.recordingShareType, params.compositionShareType],
    arguments: [params.composition, params.routedStake, params.shares],
    adminCapIndex: 1,
  });
}

/** Permissionlessly sweep a routed stake's accrued rewards into its parent pool. */
export function sweepRoutedStake(
  tx: Transaction,
  params: {
    readonly routedStake: ObjectInput;
    /** The pool where the wrapped stake accrues rewards. */
    readonly stakePool: ObjectInput;
    readonly parentId: string;
    readonly royaltyPool: ObjectInput;
    readonly routedStakePackageId: string;
    readonly stakeShareType: string;
    readonly poolShareType: string;
    readonly currencyType: string;
  },
): void {
  tx.add(routedStake.sweep({
    package: params.routedStakePackageId,
    typeArguments: [params.stakeShareType, params.poolShareType, params.currencyType],
    arguments: [object(tx, params.routedStake), object(tx, params.stakePool), object(tx, params.royaltyPool), params.parentId],
  }));
}

/** Parse a VaultAdminCap whose phantom capability does not affect BCS layout. */
export function parseVaultAdminCap(content: Uint8Array) {
  return vault.VaultAdminCap.parse(content);
}

/** Parse lifecycle events whose phantom type parameters do not affect BCS. */
export function parseVaultCreatedEvent(content: Uint8Array) {
  return vault.VaultCreatedEvent.parse(content);
}

/** Parse the release-distribution summary event into JSON-safe quantities. */
export function parseReleaseRevenueDistributedEvent(content: Uint8Array) {
  const event = releaseRevenueDistributor.ReleaseRevenueDistributedEvent.parse(
    content,
  );
  return {
    releaseId: event.release_id,
    totalInput: event.total_input.toString(),
    totalDistributed: event.total_distributed.toString(),
    remainder: event.remainder.toString(),
  };
}

/** Parse one per-track routing event, retaining its u64 values as strings. */
export function parseReleaseTrackRevenueDistributedEvent(content: Uint8Array) {
  const event = releaseRevenueDistributor.ReleaseTrackRevenueDistributedEvent.parse(content);
  return {
    releaseId: event.release_id,
    trackIndex: event.track_index.toString(),
    recordingId: event.recording_id,
    amount: event.amount.toString(),
  };
}

/** Read and BCS-parse an owner-held VaultAdminCap. */
export async function getVaultAdminCap(
  client: ClientWithCoreApi,
  vaultAdminCapId: string,
  expected: { readonly vaultPackageId: string; readonly capType: string },
) {
  const { object } = await client.core.getObject({
    objectId: vaultAdminCapId,
    include: { content: true },
  });
  if (!object || object instanceof Error || !object.content) return null;
  const expectedType = normalizeStructTag(
    `${expected.vaultPackageId}::vault::VaultAdminCap<${expected.capType}>`,
  );
  if (!object.type || normalizeStructTag(object.type) !== expectedType) {
    throw new Error(
      `getVaultAdminCap: expected ${expectedType}, received ${object.type ?? "unknown"}`,
    );
  }
  return parseVaultAdminCap(object.content);
}

/**
 * Build a `vector<Receiving<Coin<Currency>>>` for receive-and-* plugin calls.
 * The caller supplies only object ids; recipient/ownership checks still happen
 * on chain when `hikida::receive_balance` opens each receiving object.
 */
export interface ReceivingObjectRef {
  readonly objectId: string;
  readonly version: string | number;
  readonly digest: string;
}

/** Resolve owned coins to the exact references required by a Receiving input. */
export async function resolveReceivingCoins(
  client: ClientWithCoreApi,
  coinIds: readonly string[],
): Promise<ReceivingObjectRef[]> {
  const { objects } = await client.core.getObjects({ objectIds: [...coinIds] });
  return objects.map((coin, index) => {
    if (coin instanceof Error || !coin) {
      throw new Error(`resolveReceivingCoins: could not resolve ${coinIds[index]}`);
    }
    return { objectId: coin.objectId, version: coin.version, digest: coin.digest };
  });
}

export function receivingCoins(
  tx: Transaction,
  currencyType: string,
  coins: readonly ReceivingObjectRef[],
): TransactionArgument {
  return tx.makeMoveVec({
    type: `0x2::transfer::Receiving<0x2::coin::Coin<${currencyType}>>`,
    elements: coins.map((coin) => tx.receivingRef(coin)),
  });
}

/** Type-only helper for consumers that supply a generated admin-cap BCS type. */
export type VaultCapBcs<Cap extends BcsType<unknown>> = Cap;
