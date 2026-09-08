/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Custody-agnostic wallet actions for a Party.
 *
 * A Party ID is both an object ID and an address. Anyone may send transferable
 * objects or accumulator funds to that stable address, while only the matching
 * `PartyAdminCap` can expose the Party UID needed to withdraw them. These raw-cap
 * actions return every withdrawn asset to the caller so direct owners, Vault
 * administrators, and other custody systems can compose the same immutable API.
 *
 * This package stores no Party data and defines no plugin or transfer policy.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/party_wallet::party_wallet';
export const ObjectReceivedEvent = new MoveStruct({ name: `${$moduleName}::ObjectReceivedEvent`, fields: {
        party_id: bcs.Address,
        object_id: bcs.Address
    } });
export const CoinsReceivedEvent = new MoveStruct({ name: `${$moduleName}::CoinsReceivedEvent<phantom Currency>`, fields: {
        party_id: bcs.Address,
        amount: bcs.u64(),
        coins: bcs.u64()
    } });
export const FundsRedeemedEvent = new MoveStruct({ name: `${$moduleName}::FundsRedeemedEvent<phantom Currency>`, fields: {
        party_id: bcs.Address,
        amount: bcs.u64()
    } });
export interface ReceiveArguments {
    party: RawTransactionArgument<string>;
    adminCap: RawTransactionArgument<string>;
    objectToReceive: TransactionArgument;
}
export interface ReceiveOptions {
    package?: string;
    arguments: ReceiveArguments | [
        party: RawTransactionArgument<string>,
        adminCap: RawTransactionArgument<string>,
        objectToReceive: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/**
 * Receive and return one `key + store` object addressed to `party`.
 *
 * Aborts if `admin_cap` belongs to another Party or the receiving ticket does not
 * identify an object addressed to this Party.
 */
export function receive(options: ReceiveOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_wallet';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["party", "adminCap", "objectToReceive"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_wallet',
        function: 'receive',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ReceiveBalanceArguments {
    party: RawTransactionArgument<string>;
    adminCap: RawTransactionArgument<string>;
    coins: TransactionArgument;
}
export interface ReceiveBalanceOptions {
    package?: string;
    arguments: ReceiveBalanceArguments | [
        party: RawTransactionArgument<string>,
        adminCap: RawTransactionArgument<string>,
        coins: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/**
 * Receive a non-empty set of coin objects addressed to `party`, merge them, and
 * return their combined `Balance`.
 *
 * Aborts with `ENothingToReceive` when `coins` is empty, if `admin_cap` belongs to
 * another Party, or if any ticket is invalid for this Party.
 */
export function receiveBalance(options: ReceiveBalanceOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_wallet';
    const argumentsTypes = [
        null,
        null,
        'vector<null>'
    ] satisfies (string | null)[];
    const parameterNames = ["party", "adminCap", "coins"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_wallet',
        function: 'receive_balance',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RedeemBalanceArguments {
    party: RawTransactionArgument<string>;
    adminCap: RawTransactionArgument<string>;
    value: RawTransactionArgument<number | bigint>;
}
export interface RedeemBalanceOptions {
    package?: string;
    arguments: RedeemBalanceArguments | [
        party: RawTransactionArgument<string>,
        adminCap: RawTransactionArgument<string>,
        value: RawTransactionArgument<number | bigint>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Redeem `value` from `party`'s accumulator and return the resulting balance.
 *
 * Aborts if `admin_cap` belongs to another Party. Accumulator semantics remain in
 * `hikida`: zero values abort with code `1`, and unavailable funds abort in the
 * Sui accumulator implementation.
 */
export function redeemBalance(options: RedeemBalanceOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_wallet';
    const argumentsTypes = [
        null,
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["party", "adminCap", "value"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_wallet',
        function: 'redeem_balance',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface InboxAddressArguments {
    party: RawTransactionArgument<string>;
}
export interface InboxAddressOptions {
    package?: string;
    arguments: InboxAddressArguments | [
        party: RawTransactionArgument<string>
    ];
}
/** Return the Party ID as the address to which objects and funds may be sent. */
export function inboxAddress(options: InboxAddressOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_wallet';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["party"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_wallet',
        function: 'inbox_address',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}