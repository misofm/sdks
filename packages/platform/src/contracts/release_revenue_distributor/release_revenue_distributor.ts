/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Raw-cap Release revenue actions.
 *
 * Revenue is split from the immutable Release tracklist and sent to the
 * corresponding Recording addresses. Callers either receive coins already held by
 * the Release or redeem its full settled accumulator snapshot; they cannot select
 * amounts, recipients, or split values.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/release_revenue_distributor::release_revenue_distributor';
export const ReleaseCoinsReceivedEvent = new MoveStruct({ name: `${$moduleName}::ReleaseCoinsReceivedEvent<phantom Currency>`, fields: {
        release_id: bcs.Address,
        admin_cap_id: bcs.Address,
        coin_count: bcs.u64(),
        amount: bcs.u64()
    } });
export const ReleaseFundsRedeemedEvent = new MoveStruct({ name: `${$moduleName}::ReleaseFundsRedeemedEvent<phantom Currency>`, fields: {
        release_id: bcs.Address,
        admin_cap_id: bcs.Address,
        amount: bcs.u64()
    } });
export const ReleaseTrackRevenueDistributedEvent = new MoveStruct({ name: `${$moduleName}::ReleaseTrackRevenueDistributedEvent<phantom Currency>`, fields: {
        release_id: bcs.Address,
        track_index: bcs.u64(),
        composition_id: bcs.Address,
        recording_id: bcs.Address,
        split_bps: bcs.u16(),
        total_input: bcs.u64(),
        amount: bcs.u64()
    } });
export const ReleaseRevenueDistributedEvent = new MoveStruct({ name: `${$moduleName}::ReleaseRevenueDistributedEvent<phantom Currency>`, fields: {
        release_id: bcs.Address,
        track_count: bcs.u64(),
        total_input: bcs.u64(),
        total_distributed: bcs.u64(),
        remainder: bcs.u64()
    } });
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
 * This is the only accumulator redemption path: callers cannot select an amount,
 * so a permissionless crank cannot fragment revenue into dust-sized distributions.
 * The framework snapshot is capped at `u64::MAX`; excess funds, newly sent funds,
 * and per-track flooring remainder settle for a later call. A zero settled
 * snapshot is an authorized no-op that emits no event, so a Release cranked in an
 * earlier consensus commit passes through a batched crank untouched.
 *
 * The snapshot is written only by consensus settlement, so within one commit it is
 * constant: redeeming the same Release twice in one PTB, or from two transactions
 * in the same commit, withdraws the snapshot twice and the network fails that
 * whole transaction with `InsufficientFundsForWithdraw` (a transaction-level
 * failure, not a Move abort). Crankers must include each object at most once per
 * PTB and treat that status as retry next commit.
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