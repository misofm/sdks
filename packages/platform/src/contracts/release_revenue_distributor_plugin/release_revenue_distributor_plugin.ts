/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/** Vault adapter for Release revenue-distribution Actions. */

import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import { normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
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