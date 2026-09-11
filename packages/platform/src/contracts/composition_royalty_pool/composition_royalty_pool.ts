/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Raw-cap, custody-agnostic royalty-pool actions for musicos Compositions.
 *
 * Every mutating action requires the Composition's own admin capability. The
 * canonical pool remains derived from the Composition, and callers decide when to
 * register stakes and share a newly returned pool.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/composition_royalty_pool::composition_royalty_pool';
export const CompositionRoyaltyPoolCreatedEvent = new MoveStruct({ name: `${$moduleName}::CompositionRoyaltyPoolCreatedEvent<phantom CompositionShare, phantom Currency>`, fields: {
        composition_id: bcs.Address,
        admin_cap_id: bcs.Address,
        pool_id: bcs.Address,
        pool_balance: bcs.u64(),
        staked_shares: bcs.u64(),
        cumulative_reward_per_share: bcs.u256(),
        carry: bcs.u128(),
        cumulative_deposits: bcs.u128()
    } });
export const CompositionCoinsDepositedEvent = new MoveStruct({ name: `${$moduleName}::CompositionCoinsDepositedEvent<phantom CompositionShare, phantom Currency>`, fields: {
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
        coin_ids: bcs.vector(bcs.Address)
    } });
export const CompositionFundsDepositedEvent = new MoveStruct({ name: `${$moduleName}::CompositionFundsDepositedEvent<phantom CompositionShare, phantom Currency>`, fields: {
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
    composition: RawTransactionArgument<string>;
    adminCap: RawTransactionArgument<string>;
}
export interface NewPoolOptions {
    package?: string;
    arguments: NewPoolArguments | [
        composition: RawTransactionArgument<string>,
        adminCap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Create and return the canonical unshared pool derived from `composition`. Emits
 * `CompositionRoyaltyPoolCreatedEvent` after successful creation.
 */
export function newPool(options: NewPoolOptions) {
    const packageAddress = options.package ?? '@local-pkg/composition_royalty_pool';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["composition", "adminCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition_royalty_pool',
        function: 'new_pool',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ReceiveAndDepositArguments {
    composition: RawTransactionArgument<string>;
    adminCap: RawTransactionArgument<string>;
    pool: RawTransactionArgument<string>;
    coins: TransactionArgument;
}
export interface ReceiveAndDepositOptions {
    package?: string;
    arguments: ReceiveAndDepositArguments | [
        composition: RawTransactionArgument<string>,
        adminCap: RawTransactionArgument<string>,
        pool: RawTransactionArgument<string>,
        coins: TransactionArgument
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Receive selected coins sent to the Composition and deposit their balance into
 * the canonical pool derived from that same Composition. Emits
 * `CompositionCoinsDepositedEvent` after successful deposit.
 */
export function receiveAndDeposit(options: ReceiveAndDepositOptions) {
    const packageAddress = options.package ?? '@local-pkg/composition_royalty_pool';
    const argumentsTypes = [
        null,
        null,
        null,
        'vector<null>'
    ] satisfies (string | null)[];
    const parameterNames = ["composition", "adminCap", "pool", "coins"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition_royalty_pool',
        function: 'receive_and_deposit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RedeemAndDepositArguments {
    composition: RawTransactionArgument<string>;
    adminCap: RawTransactionArgument<string>;
    pool: RawTransactionArgument<string>;
    value: RawTransactionArgument<number | bigint>;
}
export interface RedeemAndDepositOptions {
    package?: string;
    arguments: RedeemAndDepositArguments | [
        composition: RawTransactionArgument<string>,
        adminCap: RawTransactionArgument<string>,
        pool: RawTransactionArgument<string>,
        value: RawTransactionArgument<number | bigint>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Redeem `value` from the Composition's funds accumulator and deposit it into the
 * canonical pool derived from that same Composition. Emits
 * `CompositionFundsDepositedEvent` after successful deposit.
 */
export function redeemAndDeposit(options: RedeemAndDepositOptions) {
    const packageAddress = options.package ?? '@local-pkg/composition_royalty_pool';
    const argumentsTypes = [
        null,
        null,
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["composition", "adminCap", "pool", "value"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition_royalty_pool',
        function: 'redeem_and_deposit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PoolAddressArguments {
    composition: RawTransactionArgument<string>;
}
export interface PoolAddressOptions {
    package?: string;
    arguments: PoolAddressArguments | [
        composition: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Canonical pool address for this Composition, share type, and Currency. */
export function poolAddress(options: PoolAddressOptions) {
    const packageAddress = options.package ?? '@local-pkg/composition_royalty_pool';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["composition"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition_royalty_pool',
        function: 'pool_address',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}