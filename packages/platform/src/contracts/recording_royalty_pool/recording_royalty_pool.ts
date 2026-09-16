/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Raw-cap, custody-agnostic royalty-pool actions for musicos Recordings.
 *
 * Every mutating action requires the Recording's own admin capability. The
 * canonical pool remains derived from the Recording and is returned unshared.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/recording_royalty_pool::recording_royalty_pool';
export const RecordingRoyaltyPoolCreatedEvent = new MoveStruct({ name: `${$moduleName}::RecordingRoyaltyPoolCreatedEvent<phantom RecordingShare, phantom CompositionShare, phantom Currency>`, fields: {
        recording_id: bcs.Address,
        composition_id: bcs.Address,
        admin_cap_id: bcs.Address,
        pool_id: bcs.Address,
        pool_balance: bcs.u64(),
        staked_shares: bcs.u64(),
        cumulative_reward_per_share: bcs.u256(),
        carry: bcs.u128(),
        cumulative_deposits: bcs.u128()
    } });
export const RecordingCoinsDepositedEvent = new MoveStruct({ name: `${$moduleName}::RecordingCoinsDepositedEvent<phantom RecordingShare, phantom CompositionShare, phantom Currency>`, fields: {
        recording_id: bcs.Address,
        composition_id: bcs.Address,
        admin_cap_id: bcs.Address,
        pool_id: bcs.Address,
        amount: bcs.u64(),
        pool_balance_before: bcs.u64(),
        pool_balance_after: bcs.u64(),
        staked_shares: bcs.u64(),
        reward_per_share_before: bcs.u256(),
        reward_per_share_after: bcs.u256(),
        carry_before: bcs.u128(),
        carry_after: bcs.u128(),
        cumulative_deposits_before: bcs.u128(),
        cumulative_deposits_after: bcs.u128(),
        coin_count: bcs.u64()
    } });
export const RecordingFundsDepositedEvent = new MoveStruct({ name: `${$moduleName}::RecordingFundsDepositedEvent<phantom RecordingShare, phantom CompositionShare, phantom Currency>`, fields: {
        recording_id: bcs.Address,
        composition_id: bcs.Address,
        admin_cap_id: bcs.Address,
        pool_id: bcs.Address,
        amount: bcs.u64(),
        pool_balance_before: bcs.u64(),
        pool_balance_after: bcs.u64(),
        staked_shares: bcs.u64(),
        reward_per_share_before: bcs.u256(),
        reward_per_share_after: bcs.u256(),
        carry_before: bcs.u128(),
        carry_after: bcs.u128(),
        cumulative_deposits_before: bcs.u128(),
        cumulative_deposits_after: bcs.u128()
    } });
export interface NewPoolArguments {
    recording: RawTransactionArgument<string>;
    adminCap: RawTransactionArgument<string>;
    shareCurrency: RawTransactionArgument<string>;
}
export interface NewPoolOptions {
    package?: string;
    arguments: NewPoolArguments | [
        recording: RawTransactionArgument<string>,
        adminCap: RawTransactionArgument<string>,
        shareCurrency: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
/**
 * Create and return the canonical unshared pool derived from `recording`. Emits
 * `RecordingRoyaltyPoolCreatedEvent` after successful creation.
 */
export function newPool(options: NewPoolOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_royalty_pool';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["recording", "adminCap", "shareCurrency"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_royalty_pool',
        function: 'new_pool',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ReceiveAndDepositArguments {
    recording: RawTransactionArgument<string>;
    adminCap: RawTransactionArgument<string>;
    pool: RawTransactionArgument<string>;
    coins: TransactionArgument;
}
export interface ReceiveAndDepositOptions {
    package?: string;
    arguments: ReceiveAndDepositArguments | [
        recording: RawTransactionArgument<string>,
        adminCap: RawTransactionArgument<string>,
        pool: RawTransactionArgument<string>,
        coins: TransactionArgument
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
/**
 * Receive selected coins sent to the Recording and deposit their balance into the
 * canonical pool derived from that same Recording. Emits
 * `RecordingCoinsDepositedEvent` after successful deposit.
 */
export function receiveAndDeposit(options: ReceiveAndDepositOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_royalty_pool';
    const argumentsTypes = [
        null,
        null,
        null,
        'vector<null>'
    ] satisfies (string | null)[];
    const parameterNames = ["recording", "adminCap", "pool", "coins"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_royalty_pool',
        function: 'receive_and_deposit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RedeemAllAndDepositArguments {
    recording: RawTransactionArgument<string>;
    adminCap: RawTransactionArgument<string>;
    pool: RawTransactionArgument<string>;
}
export interface RedeemAllAndDepositOptions {
    package?: string;
    arguments: RedeemAllAndDepositArguments | [
        recording: RawTransactionArgument<string>,
        adminCap: RawTransactionArgument<string>,
        pool: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
/**
 * Redeem all funds settled at the Recording's address at the start of the current
 * consensus commit and deposit them into the canonical pool derived from that same
 * Recording.
 *
 * This is the only accumulator redemption path: callers cannot select an amount,
 * so a permissionless crank cannot fragment revenue. The call is an authorized
 * no-op that emits no event when the settled snapshot is zero or when the pool has
 * no registered stake. With no stakers nothing is redeemed: the funds stay in the
 * Recording's accumulator until a stake registers, rather than being folded into a
 * pool nobody can claim from. Either no-op lets an item cranked in an earlier
 * consensus commit, or an unstaked item, pass through a batched crank untouched.
 * The framework snapshot is capped at `u64::MAX`; excess and newly sent funds
 * settle for a later call.
 *
 * The snapshot is written only by consensus settlement, so within one commit it is
 * constant: redeeming the same Recording twice in one PTB, or from two
 * transactions in the same commit, withdraws the snapshot twice and the network
 * fails that whole transaction with `InsufficientFundsForWithdraw` (a
 * transaction-level failure, not a Move abort). Crankers must include each object
 * at most once per PTB and treat that status as retry next commit. Emits
 * `RecordingFundsDepositedEvent` after a successful deposit.
 */
export function redeemAllAndDeposit(options: RedeemAllAndDepositOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_royalty_pool';
    const argumentsTypes = [
        null,
        null,
        null,
        '0x2::accumulator::AccumulatorRoot'
    ] satisfies (string | null)[];
    const parameterNames = ["recording", "adminCap", "pool"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_royalty_pool',
        function: 'redeem_all_and_deposit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PoolAddressArguments {
    recording: RawTransactionArgument<string>;
}
export interface PoolAddressOptions {
    package?: string;
    arguments: PoolAddressArguments | [
        recording: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
/** Canonical pool address for this Recording, share type, and Currency. */
export function poolAddress(options: PoolAddressOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_royalty_pool';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["recording"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_royalty_pool',
        function: 'pool_address',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}