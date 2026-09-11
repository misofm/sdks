/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * An owned purchase minted from one edition of a Miso release.
 *
 * `Pressing` owns issuance. This module owns only the Record asset and its
 * deterministic identity within that Pressing. Distribution mechanics such as
 * pricing and payment validation live in authorized distributor packages.
 */

import { MoveStruct, MoveTuple, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction } from '@mysten/sui/transactions';
import * as type_name from './deps/std/type_name.ts';
const $moduleName = '@local-pkg/record::record';
export const Record = new MoveStruct({ name: `${$moduleName}::Record`, fields: {
        id: bcs.Address,
        /** The release this Record is a copy of. */
        release_id: bcs.Address,
        /** The edition-scoped Pressing that minted this Record. */
        pressing_id: bcs.Address,
        /** The edition represented by `pressing_id`. */
        edition: bcs.u16(),
        /** This Record's number within its edition. */
        number: bcs.u32(),
        /** The defining type of the currency used for this purchase. */
        purchase_currency: type_name.TypeName,
        /** The actual amount paid, including any accepted overpayment. */
        purchase_price: bcs.u64(),
        /** The transaction sender who purchased this Record. */
        purchased_by: bcs.Address,
        /** When this Record was purchased, in Unix milliseconds from Sui's Clock. */
        purchased_timestamp_ms: bcs.u64()
    } });
export const RecordKey = new MoveTuple({ name: `${$moduleName}::RecordKey`, fields: [bcs.u32()] });
export const RecordCreatedEvent = new MoveStruct({ name: `${$moduleName}::RecordCreatedEvent`, fields: {
        /** The newly created Record. */
        record_id: bcs.Address,
        /** The release represented by the Record. */
        release_id: bcs.Address,
        /** The Pressing that issued the Record. */
        pressing_id: bcs.Address,
        /** The edition represented by the Pressing. */
        edition: bcs.u16(),
        /** The Record's number within the edition. */
        number: bcs.u32()
    } });
export const RecordDestroyedEvent = new MoveStruct({ name: `${$moduleName}::RecordDestroyedEvent`, fields: {
        /** The destroyed Record. */
        record_id: bcs.Address,
        /** The release represented by the Record. */
        release_id: bcs.Address,
        /** The Pressing that issued the Record. */
        pressing_id: bcs.Address,
        /** The edition represented by the Pressing. */
        edition: bcs.u16(),
        /** The Record's number within its edition. */
        number: bcs.u32(),
        /** The defining type of the purchase currency. */
        purchase_currency: bcs.string(),
        /** The amount paid for the Record. */
        purchase_price: bcs.u64(),
        /** The transaction sender who purchased the Record. */
        purchased_by: bcs.Address,
        /** When this Record was purchased, in Unix milliseconds from Sui's Clock. */
        purchased_timestamp_ms: bcs.u64()
    } });
export interface DestroyArguments {
    self: RawTransactionArgument<string>;
}
export interface DestroyOptions {
    package?: string;
    arguments: DestroyArguments | [
        self: RawTransactionArgument<string>
    ];
}
/**
 * Destroy a Record. Detach any dynamic-field extensions first or they become
 * inaccessible.
 */
export function destroy(options: DestroyOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'record',
        function: 'destroy',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface UidArguments {
    self: RawTransactionArgument<string>;
}
export interface UidOptions {
    package?: string;
    arguments: UidArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Borrow the Record UID for read-only extensions. */
export function uid(options: UidOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'record',
        function: 'uid',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface UidMutArguments {
    self: RawTransactionArgument<string>;
}
export interface UidMutOptions {
    package?: string;
    arguments: UidMutArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Mutably borrow the Record UID for owner-authorized extensions. */
export function uidMut(options: UidMutOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'record',
        function: 'uid_mut',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReleaseIdArguments {
    self: RawTransactionArgument<string>;
}
export interface ReleaseIdOptions {
    package?: string;
    arguments: ReleaseIdArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Return the release represented by this Record. */
export function releaseId(options: ReleaseIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'record',
        function: 'release_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PressingIdArguments {
    self: RawTransactionArgument<string>;
}
export interface PressingIdOptions {
    package?: string;
    arguments: PressingIdArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Return the Pressing that issued this Record. */
export function pressingId(options: PressingIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'record',
        function: 'pressing_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EditionArguments {
    self: RawTransactionArgument<string>;
}
export interface EditionOptions {
    package?: string;
    arguments: EditionArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Return this Record's edition number. */
export function edition(options: EditionOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'record',
        function: 'edition',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NumberArguments {
    self: RawTransactionArgument<string>;
}
export interface NumberOptions {
    package?: string;
    arguments: NumberArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Return this Record's number within its edition. */
export function number(options: NumberOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'record',
        function: 'number',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PurchaseCurrencyArguments {
    self: RawTransactionArgument<string>;
}
export interface PurchaseCurrencyOptions {
    package?: string;
    arguments: PurchaseCurrencyArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Return the defining type of the purchase currency. */
export function purchaseCurrency(options: PurchaseCurrencyOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'record',
        function: 'purchase_currency',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PurchasePriceArguments {
    self: RawTransactionArgument<string>;
}
export interface PurchasePriceOptions {
    package?: string;
    arguments: PurchasePriceArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Return the amount paid for this Record. */
export function purchasePrice(options: PurchasePriceOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'record',
        function: 'purchase_price',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PurchasedByArguments {
    self: RawTransactionArgument<string>;
}
export interface PurchasedByOptions {
    package?: string;
    arguments: PurchasedByArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Return the transaction sender who purchased this Record. */
export function purchasedBy(options: PurchasedByOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'record',
        function: 'purchased_by',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PurchasedTimestampMsArguments {
    self: RawTransactionArgument<string>;
}
export interface PurchasedTimestampMsOptions {
    package?: string;
    arguments: PurchasedTimestampMsArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Return the purchase time in Unix milliseconds from Sui's Clock. */
export function purchasedTimestampMs(options: PurchasedTimestampMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'record',
        function: 'purchased_timestamp_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeriveAddressArguments {
    pressingId: RawTransactionArgument<string>;
    number: RawTransactionArgument<number>;
}
export interface DeriveAddressOptions {
    package?: string;
    arguments: DeriveAddressArguments | [
        pressingId: RawTransactionArgument<string>,
        number: RawTransactionArgument<number>
    ];
}
/** Derive the Record address for `number` in `pressing_id`'s edition. */
export function deriveAddress(options: DeriveAddressOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        '0x2::object::ID',
        'u32'
    ] satisfies (string | null)[];
    const parameterNames = ["pressingId", "number"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'record',
        function: 'derive_address',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}