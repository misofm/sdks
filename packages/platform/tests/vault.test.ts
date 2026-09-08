// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { Transaction } from "@mysten/sui/transactions";
import * as vaultApi from "../src/vault.ts";
import * as releasePluginContract from "../src/contracts/release_revenue_distributor_plugin/release_revenue_distributor_plugin.ts";
import {
  createCompositionRoutedStake, directAdminCap,
  custodyNewAdminCap, deriveVaultAdminCapId, deriveVaultId,
  installCompositionRoyaltyPoolPlugin, installRecordingRoyaltyPoolPlugin,
  installReleaseRevenueDistributorPlugin, invokeWithAdminCap,
  newCompositionRoyaltyPool, receivePartyWalletBalance,
  redeemAndDistributeReleaseRevenue, redeemPartyWalletBalance,
  registerCompositionRoutedStake, restoreVaultCapability,
  restakeCompositionRoutedStake, settleAndDistributeReleaseRevenue,
  shareRoutedStake,
  settleCompositionRoyaltyPool, settleRecordingRoyaltyPool,
  unstakeCompositionRoutedStake, vaultAdminCap, withdrawVaultCapability,
} from "../src/vault.ts";

const A = `0x${"ab".repeat(32)}`;
const B = `0x${"bc".repeat(32)}`;
const C = `0x${"cd".repeat(32)}`;
const VAULT = `0x${"10".repeat(32)}`;
const ACTION = `0x${"20".repeat(32)}`;
const PLUGIN = `0x${"30".repeat(32)}`;
const CAP = `${A}::composition::CompositionAdminCap<${B}::share::Share>`;
const COMPOSITION_SHARE = `${B}::share::Share`;
const RECORDING_SHARE = `${A}::share::Share`;
const SUI = "0x2::sui::SUI";

interface Call { package?: string; module: string; function: string; typeArguments: string[] }
function calls(tx: Transaction): Call[] {
  return (tx.getData().commands as Array<{ $kind: string; MoveCall?: Call }>)
    .filter((command) => command.$kind === "MoveCall")
    .map((command) => command.MoveCall!);
}
const labels = (tx: Transaction) => calls(tx).map((call) => `${call.module}::${call.function}`);
const direct = directAdminCap(A);
const vaulted = (tx: Transaction) => vaultAdminCap({
  vault: tx.object(A), vaultAdminCap: tx.object(B), capType: CAP, vaultPackageId: VAULT,
});

test("invokeWithAdminCap supports direct caps without custody commands", () => {
  const tx = new Transaction();
  const result = invokeWithAdminCap(tx, direct, {
    target: `${ACTION}::sample::act`, arguments: [tx.object(B)], adminCapIndex: 1,
  });
  expect(result.$kind).toBe("Result");
  expect(labels(tx)).toEqual(["sample::act"]);
});

test("borrowed caps are enclosed by exact borrow/action/put-back ordering", () => {
  const tx = new Transaction();
  invokeWithAdminCap(tx, vaulted(tx), {
    target: `${ACTION}::sample::act`, arguments: [tx.object(A)], adminCapIndex: 1,
  });
  expect(labels(tx)).toEqual(["vault::borrow_as_admin", "sample::act", "vault::put_back"]);
  const commands = tx.getData().commands as Array<{ MoveCall?: { arguments: Array<{ NestedResult?: [number, number] }> } }>;
  expect(commands[1]!.MoveCall!.arguments[1]!.NestedResult).toEqual([0, 0]);
  expect(commands[2]!.MoveCall!.arguments[2]!.NestedResult).toEqual([0, 1]);
  expect(calls(tx).map((call) => call.typeArguments)).toEqual([
    [CAP],
    [],
    [CAP],
  ]);
  expect(calls(tx).map((call) => call.package)).toEqual([
    VAULT,
    ACTION,
    VAULT,
  ]);
});

test("Vault and VaultAdminCap derivation match fixed on-chain vectors", () => {
  const vaultId = deriveVaultId({
    vaultRegistryId: `0x${"01".repeat(32)}`,
    capId: `0x${"02".repeat(32)}`,
    vaultPackageId: `0x${"03".repeat(32)}`,
    capType: `0x${"04".repeat(32)}::release::ReleaseAdminCap`,
  });
  expect(vaultId).toBe(
    "0x714b431c13c92bcab68db202a0869e29defad71151221bd17a9ad9e054a0a5b1",
  );
  expect(deriveVaultAdminCapId(vaultId, `0x${"03".repeat(32)}`)).toBe(
    "0x19438d196d205b45b6853a9f90c097e08dcd2350d05d4eecac7f3e9a089011fc",
  );
});

test("new custody configures result 0, shares it, and transfers result 1", () => {
  const tx = new Transaction();
  custodyNewAdminCap(tx, {
    adminCap: tx.object(A),
    vaultRegistry: tx.object(B),
    capType: CAP,
    vaultPackageId: VAULT,
    owner: A,
    configure: (vault, adminCap) =>
      installCompositionRoyaltyPoolPlugin(tx, {
        vault,
        vaultAdminCap: adminCap,
        compositionShareType: COMPOSITION_SHARE,
        pluginPackageId: PLUGIN,
      }),
  });
  expect(labels(tx)).toEqual([
    "vault::new",
    "composition_royalty_pool_plugin::install",
    "vault::share",
  ]);
  const commands = tx.getData().commands;
  expect(commands[1]!.MoveCall.arguments[0]!.NestedResult).toEqual([0, 0]);
  expect(commands[1]!.MoveCall.arguments[1]!.NestedResult).toEqual([0, 1]);
  expect(commands[2]!.MoveCall.arguments[0]!.NestedResult).toEqual([0, 0]);
  expect(commands[3]!.$kind).toBe("TransferObjects");
  expect(commands[3]!.TransferObjects.objects[0]!.NestedResult).toEqual([0, 1]);
});

test("withdraw and restore use the exact Vault package, cap type, and returned cap", () => {
  const tx = new Transaction();
  const cap = withdrawVaultCapability(tx, {
    vault: A,
    vaultAdminCap: B,
    capType: CAP,
    vaultPackageId: VAULT,
  });
  restoreVaultCapability(tx, {
    vault: A,
    vaultAdminCap: B,
    adminCap: cap,
    capType: CAP,
    vaultPackageId: VAULT,
  });
  expect(labels(tx)).toEqual(["vault::withdraw_cap", "vault::restore_cap"]);
  expect(calls(tx).map((call) => call.package)).toEqual([VAULT, VAULT]);
  expect(calls(tx).map((call) => call.typeArguments)).toEqual([[CAP], [CAP]]);
  const restore = tx.getData().commands[1]!.MoveCall;
  expect(restore.arguments[2]!.$kind).toBe("Result");
  expect(restore.arguments[2]!.Result).toBe(0);
});

test("only the three safe automation plugins can be installed", () => {
  const tx = new Transaction();
  const common = { vault: tx.object(A), vaultAdminCap: tx.object(B), pluginPackageId: PLUGIN };
  installCompositionRoyaltyPoolPlugin(tx, { ...common, compositionShareType: COMPOSITION_SHARE });
  installRecordingRoyaltyPoolPlugin(tx, { ...common, recordingShareType: RECORDING_SHARE, compositionShareType: COMPOSITION_SHARE });
  installReleaseRevenueDistributorPlugin(tx, common);
  expect(labels(tx)).toEqual([
    "composition_royalty_pool_plugin::install",
    "recording_royalty_pool_plugin::install",
    "release_revenue_distributor_plugin::install",
  ]);
  expect("installPartyWalletPlugin" in vaultApi).toBe(false);
  expect("installCompositionRoutedStakePlugin" in vaultApi).toBe(false);
  expect("initializeCompositionRoyaltyPool" in vaultApi).toBe(false);
  expect("initializeRecordingRoyaltyPool" in vaultApi).toBe(false);
});

test("pool construction targets the Action and returns an unshared pool", () => {
  const tx = new Transaction();
  const pool = newCompositionRoyaltyPool(tx, {
    authority: vaulted(tx), composition: tx.object(A), compositionShareType: COMPOSITION_SHARE,
    currencyType: SUI, actionPackageId: ACTION,
  });
  tx.moveCall({
    target: `${B}::pool::share`,
    typeArguments: [COMPOSITION_SHARE, SUI],
    arguments: [pool],
  });
  expect(pool.$kind).toBe("Result");
  expect(labels(tx)).toEqual([
    "vault::borrow_as_admin", "composition_royalty_pool::new_pool", "vault::put_back",
    "pool::share",
  ]);
  expect(calls(tx)[1]!.package).toBe(ACTION);
  expect(tx.getData().commands[3]!.MoveCall.arguments[0]!.Result).toBe(1);
});

test("Party receive/redeem Actions return caller-controlled balances", () => {
  const tx = new Transaction();
  const authority = vaulted(tx);
  const received = receivePartyWalletBalance(tx, {
    authority, party: tx.object(A), actionPackageId: ACTION, currencyType: SUI,
    coins: [{ objectId: C, version: "7", digest: "11111111111111111111111111111111" }],
  });
  const redeemed = redeemPartyWalletBalance(tx, {
    authority, party: tx.object(A), actionPackageId: ACTION, currencyType: SUI, value: 7n,
  });
  for (const balance of [received, redeemed]) {
    const coin = tx.moveCall({ target: "0x2::coin::from_balance", typeArguments: [SUI], arguments: [balance] });
    tx.transferObjects([coin], tx.pure.address(A));
  }
  expect(calls(tx).filter((call) => call.module === "party_wallet").map((call) => call.function))
    .toEqual(["receive_balance", "redeem_balance"]);
  expect(calls(tx).filter((call) => call.module === "vault" && call.function === "put_back")).toHaveLength(2);
  expect(calls(tx).filter((call) => call.module === "party_wallet").map((call) => call.typeArguments))
    .toEqual([[SUI], [SUI]]);
  expect(calls(tx).filter((call) => call.module === "coin" && call.function === "from_balance"))
    .toHaveLength(2);
  expect(tx.getData().commands.filter((command) => command.$kind === "TransferObjects"))
    .toHaveLength(2);
  expect(tx.getData().inputs).toContainEqual({
    Object: {
      Receiving: {
        objectId: C,
        version: "7",
        digest: "11111111111111111111111111111111",
      },
      $kind: "Receiving",
    },
    $kind: "Object",
  });
});

test("routed-stake lifecycle targets Actions and returned assets remain composable", () => {
  const tx = new Transaction();
  const common = { authority: direct, actionPackageId: ACTION, compositionShareType: COMPOSITION_SHARE, recordingShareType: RECORDING_SHARE };
  const routed = createCompositionRoutedStake(tx, {
    ...common, composition: tx.object(A), recording: tx.object(B), value: 5n,
  });
  registerCompositionRoutedStake(tx, {
    ...common, composition: tx.object(A), recording: tx.object(B), routedStake: routed,
    royaltyPool: tx.object(B), currencyType: SUI,
  });
  const shares = unstakeCompositionRoutedStake(tx, {
    ...common, composition: tx.object(A), routedStake: routed,
  });
  restakeCompositionRoutedStake(tx, {
    ...common, composition: tx.object(A), routedStake: routed, shares,
  });
  expect(calls(tx).filter((call) => call.module === "composition_routed_stake").map((call) => call.function))
    .toEqual(["create_stake", "register", "unstake", "restake"]);
  expect(calls(tx).filter((call) => call.module === "composition_routed_stake").every((call) => call.package === ACTION)).toBe(true);
});

test("routed-stake sharing consumes the configured value through the routed-stake package", () => {
  const tx = new Transaction();
  const routed = tx.object(A);
  shareRoutedStake(tx, {
    routedStake: routed,
    routedStakePackageId: PLUGIN,
    stakeShareType: RECORDING_SHARE,
    poolShareType: COMPOSITION_SHARE,
  });
  expect(calls(tx)[0]).toMatchObject({
    package: PLUGIN,
    module: "routed_stake",
    function: "share",
    typeArguments: [RECORDING_SHARE, COMPOSITION_SHARE],
  });
});

test("explicit Release amounts remain raw Action composition only", () => {
  const tx = new Transaction();
  redeemAndDistributeReleaseRevenue(tx, {
    authority: vaulted(tx),
    release: tx.object(A),
    currencyType: SUI,
    actionPackageId: ACTION,
    value: 9n,
  });
  expect(labels(tx)).toEqual([
    "vault::borrow_as_admin",
    "release_revenue_distributor::redeem_and_distribute",
    "vault::put_back",
  ]);
  expect(calls(tx)[1]).toMatchObject({
    package: ACTION,
    typeArguments: [SUI],
  });
  expect("redeemAndDistribute" in releasePluginContract).toBe(false);
});

test("settlement cranks use suffixed plugin modules in exact order", () => {
  const tx = new Transaction();
  settleCompositionRoyaltyPool(tx, {
    vault: tx.object(A), compositionId: A, pool: tx.object(B), compositionShareType: COMPOSITION_SHARE,
    currencyType: SUI, pluginPackageId: PLUGIN,
  });
  settleRecordingRoyaltyPool(tx, {
    vault: tx.object(A), recordingId: A, pool: tx.object(B), recordingShareType: RECORDING_SHARE,
    compositionShareType: COMPOSITION_SHARE, currencyType: SUI, pluginPackageId: PLUGIN,
  });
  settleAndDistributeReleaseRevenue(tx, {
    vault: tx.object(A), releaseId: A, currencyType: SUI, pluginPackageId: PLUGIN,
  });
  expect(labels(tx)).toEqual([
    "balance::settled_funds_value", "composition_royalty_pool_plugin::redeem_and_deposit",
    "balance::settled_funds_value", "recording_royalty_pool_plugin::redeem_and_deposit",
    "release_revenue_distributor_plugin::redeem_all_and_distribute",
  ]);
  const releaseCall = tx.getData().commands.find(
    (command) =>
      command.$kind === "MoveCall" &&
      command.MoveCall.module === "release_revenue_distributor_plugin",
  );
  expect(releaseCall?.MoveCall.arguments).toHaveLength(3);
  const rootArgument = releaseCall?.MoveCall.arguments[2];
  expect(rootArgument?.$kind).toBe("Input");
  const rootInput = tx.getData().inputs[rootArgument!.Input];
  expect(rootInput?.UnresolvedObject?.objectId).toBe(
    `0x${"acc".padStart(64, "0")}`,
  );
});
