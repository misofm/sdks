/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/** Vault adapter for Release revenue-distribution Actions. */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/release_revenue_distributor_plugin::release_revenue_distributor_plugin';
export const ReleaseRevenueDistributorPluginInstalledEvent = new MoveStruct({ name: `${$moduleName}::ReleaseRevenueDistributorPluginInstalledEvent<phantom Cap, phantom Plugin>`, fields: {
        vault_id: bcs.Address,
        vault_admin_cap_id: bcs.Address,
        release_admin_cap_id: bcs.Address,
        vault_active: bcs.bool(),
        authorized_before: bcs.bool(),
        authorized_after: bcs.bool(),
        authorized_plugin_count_before: bcs.u64(),
        authorized_plugin_count_after: bcs.u64()
    } });
export const ReleaseRevenueDistributorPluginUninstalledEvent = new MoveStruct({ name: `${$moduleName}::ReleaseRevenueDistributorPluginUninstalledEvent<phantom Cap, phantom Plugin>`, fields: {
        vault_id: bcs.Address,
        vault_admin_cap_id: bcs.Address,
        release_admin_cap_id: bcs.Address,
        vault_active: bcs.bool(),
        authorized_before: bcs.bool(),
        authorized_after: bcs.bool(),
        authorized_plugin_count_before: bcs.u64(),
        authorized_plugin_count_after: bcs.u64()
    } });
export const ReleaseRevenueCoinsDistributedEvent = new MoveStruct({ name: `${$moduleName}::ReleaseRevenueCoinsDistributedEvent<phantom Currency, phantom Cap, phantom Plugin>`, fields: {
        vault_id: bcs.Address,
        release_admin_cap_id: bcs.Address,
        release_id: bcs.Address,
        input_coin_count: bcs.u64(),
        input_coin_ids: bcs.vector(bcs.Address)
    } });
export const ReleaseRevenueFundsDistributedEvent = new MoveStruct({ name: `${$moduleName}::ReleaseRevenueFundsDistributedEvent<phantom Currency, phantom Cap, phantom Plugin>`, fields: {
        vault_id: bcs.Address,
        release_admin_cap_id: bcs.Address,
        release_id: bcs.Address,
        accumulator_root_id: bcs.Address,
        settled_input: bcs.u64()
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
}
export function install(options: InstallOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_revenue_distributor_plugin';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "vaultAdminCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_revenue_distributor_plugin',
        function: 'install',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
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
}
export function uninstall(options: UninstallOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_revenue_distributor_plugin';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "vaultAdminCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_revenue_distributor_plugin',
        function: 'uninstall',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
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
}
export function isInstalled(options: IsInstalledOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_revenue_distributor_plugin';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_revenue_distributor_plugin',
        function: 'is_installed',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReceiveAndDistributeArguments {
    vault: RawTransactionArgument<string>;
    release: RawTransactionArgument<string>;
    coins: TransactionArgument;
}
export interface ReceiveAndDistributeOptions {
    package?: string;
    arguments: ReceiveAndDistributeArguments | [
        vault: RawTransactionArgument<string>,
        release: RawTransactionArgument<string>,
        coins: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
export function receiveAndDistribute(options: ReceiveAndDistributeOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_revenue_distributor_plugin';
    const argumentsTypes = [
        null,
        null,
        'vector<null>'
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "release", "coins"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_revenue_distributor_plugin',
        function: 'receive_and_distribute',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RedeemAllAndDistributeArguments {
    vault: RawTransactionArgument<string>;
    release: RawTransactionArgument<string>;
}
export interface RedeemAllAndDistributeOptions {
    package?: string;
    arguments: RedeemAllAndDistributeArguments | [
        vault: RawTransactionArgument<string>,
        release: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
export function redeemAllAndDistribute(options: RedeemAllAndDistributeOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_revenue_distributor_plugin';
    const argumentsTypes = [
        null,
        null,
        '0x2::accumulator::AccumulatorRoot'
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "release"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_revenue_distributor_plugin',
        function: 'redeem_all_and_distribute',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}