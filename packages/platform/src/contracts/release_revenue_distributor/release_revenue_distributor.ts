/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Raw-cap Release revenue actions.
 *
 * Revenue is split from the immutable Release tracklist and sent to the
 * corresponding Recording addresses. Callers select only funds already held by the
 * Release; they cannot select recipients or alter split amounts.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/release_revenue_distributor::release_revenue_distributor';
export const ReleaseTrackRevenueDistributedEvent = new MoveStruct({ name: `${$moduleName}::ReleaseTrackRevenueDistributedEvent<phantom Currency>`, fields: {
        release_id: bcs.Address,
        track_index: bcs.u64(),
        recording_id: bcs.Address,
        amount: bcs.u64()
    } });
export const ReleaseRevenueDistributedEvent = new MoveStruct({ name: `${$moduleName}::ReleaseRevenueDistributedEvent<phantom Currency>`, fields: {
        release_id: bcs.Address,
        total_input: bcs.u64(),
        total_distributed: bcs.u64(),
        remainder: bcs.u64()
    } });
export interface RedeemAndDistributeArguments {
    release: RawTransactionArgument<string>;
    adminCap: RawTransactionArgument<string>;
    value: RawTransactionArgument<number | bigint>;
}
export interface RedeemAndDistributeOptions {
    package?: string;
    arguments: RedeemAndDistributeArguments | [
        release: RawTransactionArgument<string>,
        adminCap: RawTransactionArgument<string>,
        value: RawTransactionArgument<number | bigint>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Redeem `value` from the Release accumulator and distribute it according to the
 * immutable tracklist.
 */
export function redeemAndDistribute(options: RedeemAndDistributeOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_revenue_distributor';
    const argumentsTypes = [
        null,
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["release", "adminCap", "value"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_revenue_distributor',
        function: 'redeem_and_distribute',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RedeemAllAndDistributeArguments {
    release: RawTransactionArgument<string>;
    adminCap: RawTransactionArgument<string>;
}
export interface RedeemAllAndDistributeOptions {
    package?: string;
    arguments: RedeemAllAndDistributeArguments | [
        release: RawTransactionArgument<string>,
        adminCap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Redeem all Release funds settled at the start of the current consensus commit
 * and distribute them according to the immutable tracklist.
 *
 * The framework snapshot is capped at `u64::MAX`; excess funds, newly sent funds,
 * and per-track flooring remainder settle for a later call. This fixed crank
 * prevents permissionless adapters from selecting dust-sized fragments. A zero
 * settled snapshot is an idempotent no-op.
 */
export function redeemAllAndDistribute(options: RedeemAllAndDistributeOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_revenue_distributor';
    const argumentsTypes = [
        null,
        null,
        '0x2::accumulator::AccumulatorRoot'
    ] satisfies (string | null)[];
    const parameterNames = ["release", "adminCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_revenue_distributor',
        function: 'redeem_all_and_distribute',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ReceiveAndDistributeArguments {
    release: RawTransactionArgument<string>;
    adminCap: RawTransactionArgument<string>;
    coins: TransactionArgument;
}
export interface ReceiveAndDistributeOptions {
    package?: string;
    arguments: ReceiveAndDistributeArguments | [
        release: RawTransactionArgument<string>,
        adminCap: RawTransactionArgument<string>,
        coins: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/**
 * Receive selected coins sent to the Release and distribute their combined value
 * according to the immutable tracklist.
 */
export function receiveAndDistribute(options: ReceiveAndDistributeOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_revenue_distributor';
    const argumentsTypes = [
        null,
        null,
        'vector<null>'
    ] satisfies (string | null)[];
    const parameterNames = ["release", "adminCap", "coins"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_revenue_distributor',
        function: 'receive_and_distribute',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}