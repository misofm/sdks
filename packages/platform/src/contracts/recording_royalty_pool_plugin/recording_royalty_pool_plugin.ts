/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/** Vault adapter for Recording royalty-pool Actions. */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/recording_royalty_pool_plugin::recording_royalty_pool_plugin';
export const RecordingRoyaltyPoolPluginInstalledEvent = new MoveStruct({ name: `${$moduleName}::RecordingRoyaltyPoolPluginInstalledEvent<phantom RecordingShare>`, fields: {
        vault_id: bcs.Address,
        cap_id: bcs.Address,
        vault_admin_cap_id: bcs.Address,
        authorized_plugins_id: bcs.Address,
        authorized_plugin_count: bcs.u64(),
        installed: bcs.bool()
    } });
export const RecordingRoyaltyPoolPluginUninstalledEvent = new MoveStruct({ name: `${$moduleName}::RecordingRoyaltyPoolPluginUninstalledEvent<phantom RecordingShare>`, fields: {
        vault_id: bcs.Address,
        cap_id: bcs.Address,
        vault_admin_cap_id: bcs.Address,
        authorized_plugins_id: bcs.Address,
        authorized_plugin_count: bcs.u64(),
        installed: bcs.bool()
    } });
export const RecordingVaultCapabilityBorrowedEvent = new MoveStruct({ name: `${$moduleName}::RecordingVaultCapabilityBorrowedEvent<phantom RecordingShare, phantom CompositionShare, phantom Currency>`, fields: {
        vault_id: bcs.Address,
        cap_id: bcs.Address,
        recording_id: bcs.Address,
        composition_id: bcs.Address,
        pool_id: bcs.Address,
        active: bcs.bool(),
        capability_available: bcs.bool()
    } });
export const RecordingCoinsDepositedEvent = new MoveStruct({ name: `${$moduleName}::RecordingCoinsDepositedEvent<phantom RecordingShare, phantom CompositionShare, phantom Currency>`, fields: {
        vault_id: bcs.Address,
        cap_id: bcs.Address,
        recording_id: bcs.Address,
        composition_id: bcs.Address,
        pool_id: bcs.Address,
        pool_balance_before: bcs.u64(),
        pool_balance_after: bcs.u64(),
        staked_shares: bcs.u64(),
        reward_per_share_before: bcs.u256(),
        reward_per_share_after: bcs.u256(),
        carry_before: bcs.u128(),
        carry_after: bcs.u128(),
        cumulative_deposits_before: bcs.u128(),
        cumulative_deposits_after: bcs.u128(),
        active: bcs.bool(),
        capability_available: bcs.bool(),
        coin_ids: bcs.vector(bcs.Address)
    } });
export const RecordingFundsDepositedEvent = new MoveStruct({ name: `${$moduleName}::RecordingFundsDepositedEvent<phantom RecordingShare, phantom CompositionShare, phantom Currency>`, fields: {
        vault_id: bcs.Address,
        cap_id: bcs.Address,
        recording_id: bcs.Address,
        composition_id: bcs.Address,
        pool_id: bcs.Address,
        pool_balance_before: bcs.u64(),
        pool_balance_after: bcs.u64(),
        staked_shares: bcs.u64(),
        reward_per_share_before: bcs.u256(),
        reward_per_share_after: bcs.u256(),
        carry_before: bcs.u128(),
        carry_after: bcs.u128(),
        cumulative_deposits_before: bcs.u128(),
        cumulative_deposits_after: bcs.u128(),
        active: bcs.bool(),
        capability_available: bcs.bool(),
        amount: bcs.u64()
    } });
export interface InstallArguments {
    vault: RawTransactionArgument<string>;
    vaultAdminCap: RawTransactionArgument<string>;
}
export interface InstallOptions {
    package?: string;
    arguments: InstallArguments | [
        vault: RawTransactionArgument<string>,
        vaultAdminCap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
export function install(options: InstallOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_royalty_pool_plugin';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "vaultAdminCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_royalty_pool_plugin',
        function: 'install',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UninstallArguments {
    vault: RawTransactionArgument<string>;
    vaultAdminCap: RawTransactionArgument<string>;
}
export interface UninstallOptions {
    package?: string;
    arguments: UninstallArguments | [
        vault: RawTransactionArgument<string>,
        vaultAdminCap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
export function uninstall(options: UninstallOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_royalty_pool_plugin';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "vaultAdminCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_royalty_pool_plugin',
        function: 'uninstall',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface IsInstalledArguments {
    vault: RawTransactionArgument<string>;
}
export interface IsInstalledOptions {
    package?: string;
    arguments: IsInstalledArguments | [
        vault: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
export function isInstalled(options: IsInstalledOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_royalty_pool_plugin';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_royalty_pool_plugin',
        function: 'is_installed',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ReceiveAndDepositArguments {
    vault: RawTransactionArgument<string>;
    recording: RawTransactionArgument<string>;
    pool: RawTransactionArgument<string>;
    coins: TransactionArgument;
}
export interface ReceiveAndDepositOptions {
    package?: string;
    arguments: ReceiveAndDepositArguments | [
        vault: RawTransactionArgument<string>,
        recording: RawTransactionArgument<string>,
        pool: RawTransactionArgument<string>,
        coins: TransactionArgument
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
export function receiveAndDeposit(options: ReceiveAndDepositOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_royalty_pool_plugin';
    const argumentsTypes = [
        null,
        null,
        null,
        'vector<null>'
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "recording", "pool", "coins"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_royalty_pool_plugin',
        function: 'receive_and_deposit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RedeemAndDepositArguments {
    vault: RawTransactionArgument<string>;
    recording: RawTransactionArgument<string>;
    pool: RawTransactionArgument<string>;
    value: RawTransactionArgument<number | bigint>;
}
export interface RedeemAndDepositOptions {
    package?: string;
    arguments: RedeemAndDepositArguments | [
        vault: RawTransactionArgument<string>,
        recording: RawTransactionArgument<string>,
        pool: RawTransactionArgument<string>,
        value: RawTransactionArgument<number | bigint>
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
export function redeemAndDeposit(options: RedeemAndDepositOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_royalty_pool_plugin';
    const argumentsTypes = [
        null,
        null,
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "recording", "pool", "value"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_royalty_pool_plugin',
        function: 'redeem_and_deposit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}