/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Raw-cap lifecycle actions for Recording shares owned by a Composition.
 *
 * The returned routed stake is unshared so callers can register it before sharing.
 * Reward sweeping remains the permissionless operation provided by `routed_stake`;
 * this package adds only protocol-specific parent checks.
 */

import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import { normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
export interface CreateStakeArguments {
    composition: RawTransactionArgument<string>;
    adminCap: RawTransactionArgument<string>;
    recording: RawTransactionArgument<string>;
    value: RawTransactionArgument<number | bigint>;
}
export interface CreateStakeOptions {
    package?: string;
    arguments: CreateStakeArguments | [
        composition: RawTransactionArgument<string>,
        adminCap: RawTransactionArgument<string>,
        recording: RawTransactionArgument<string>,
        value: RawTransactionArgument<number | bigint>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Redeem Composition-owned Recording shares and return a new unshared routed stake
 * derived from the Composition.
 */
export function createStake(options: CreateStakeOptions) {
    const packageAddress = options.package ?? '@local-pkg/composition_routed_stake';
    const argumentsTypes = [
        null,
        null,
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["composition", "adminCap", "recording", "value"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition_routed_stake',
        function: 'create_stake',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RegisterArguments {
    composition: RawTransactionArgument<string>;
    adminCap: RawTransactionArgument<string>;
    recording: RawTransactionArgument<string>;
    routed: RawTransactionArgument<string>;
    pool: RawTransactionArgument<string>;
}
export interface RegisterOptions {
    package?: string;
    arguments: RegisterArguments | [
        composition: RawTransactionArgument<string>,
        adminCap: RawTransactionArgument<string>,
        recording: RawTransactionArgument<string>,
        routed: RawTransactionArgument<string>,
        pool: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
/** Register the routed stake with the canonical pool derived from `recording`. */
export function register(options: RegisterOptions) {
    const packageAddress = options.package ?? '@local-pkg/composition_routed_stake';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["composition", "adminCap", "recording", "routed", "pool"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition_routed_stake',
        function: 'register',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UnregisterArguments {
    composition: RawTransactionArgument<string>;
    adminCap: RawTransactionArgument<string>;
    recording: RawTransactionArgument<string>;
    routed: RawTransactionArgument<string>;
    pool: RawTransactionArgument<string>;
}
export interface UnregisterOptions {
    package?: string;
    arguments: UnregisterArguments | [
        composition: RawTransactionArgument<string>,
        adminCap: RawTransactionArgument<string>,
        recording: RawTransactionArgument<string>,
        routed: RawTransactionArgument<string>,
        pool: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
/**
 * Unregister the routed stake from the canonical Recording pool after all
 * claimable rewards have been swept.
 */
export function unregister(options: UnregisterOptions) {
    const packageAddress = options.package ?? '@local-pkg/composition_routed_stake';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["composition", "adminCap", "recording", "routed", "pool"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition_routed_stake',
        function: 'unregister',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UnstakeArguments {
    composition: RawTransactionArgument<string>;
    adminCap: RawTransactionArgument<string>;
    routed: RawTransactionArgument<string>;
}
export interface UnstakeOptions {
    package?: string;
    arguments: UnstakeArguments | [
        composition: RawTransactionArgument<string>,
        adminCap: RawTransactionArgument<string>,
        routed: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Remove the routed position and return its Recording-share principal. */
export function unstake(options: UnstakeOptions) {
    const packageAddress = options.package ?? '@local-pkg/composition_routed_stake';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["composition", "adminCap", "routed"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition_routed_stake',
        function: 'unstake',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RestakeArguments {
    composition: RawTransactionArgument<string>;
    adminCap: RawTransactionArgument<string>;
    routed: RawTransactionArgument<string>;
    shares: TransactionArgument;
}
export interface RestakeOptions {
    package?: string;
    arguments: RestakeArguments | [
        composition: RawTransactionArgument<string>,
        adminCap: RawTransactionArgument<string>,
        routed: RawTransactionArgument<string>,
        shares: TransactionArgument
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Refill an empty routed stake with caller-supplied Recording-share principal. */
export function restake(options: RestakeOptions) {
    const packageAddress = options.package ?? '@local-pkg/composition_routed_stake';
    const argumentsTypes = [
        null,
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["composition", "adminCap", "routed", "shares"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition_routed_stake',
        function: 'restake',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface StakeAddressArguments {
    composition: RawTransactionArgument<string>;
}
export interface StakeAddressOptions {
    package?: string;
    arguments: StakeAddressArguments | [
        composition: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Canonical routed-stake address for this Composition and RecordingShare. */
export function stakeAddress(options: StakeAddressOptions) {
    const packageAddress = options.package ?? '@local-pkg/composition_routed_stake';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["composition"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition_routed_stake',
        function: 'stake_address',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}