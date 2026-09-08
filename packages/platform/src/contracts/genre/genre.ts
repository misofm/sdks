/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Genre vocabulary for Miso — a canonical, deduplicated set of `Genre` objects.
 *
 * Genre is a classification, not protocol-verifiable state, so it lives in an
 * extension rather than core. This module owns the **vocabulary**: `Genre` objects
 * are created permissionlessly and derived by canonical name, so the set stays
 * deduplicated and canonical (no "hip-hop" vs "Hip Hop" forks).
 *
 * Genre _assignment_ — classifying a release and its individual tracks — lives in
 * the `release_genre` module. How a recording is presented and classified is a
 * property of the release (the consumer object), not of the recording's objective
 * sound data, so nothing here touches `Recording`.
 */

import { MoveStruct, MoveTuple, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/genre::genre';
export const GenreRegistry = new MoveStruct({ name: `${$moduleName}::GenreRegistry`, fields: {
        id: bcs.Address
    } });
export const Genre = new MoveStruct({ name: `${$moduleName}::Genre`, fields: {
        id: bcs.Address,
        /** Canonical genre name (e.g. "HIP_HOP"). */
        name: bcs.string()
    } });
export const GenreKey = new MoveTuple({ name: `${$moduleName}::GenreKey`, fields: [bcs.string()] });
export const GenreCreatedEvent = new MoveStruct({ name: `${$moduleName}::GenreCreatedEvent`, fields: {
        genre_id: bcs.Address,
        name: bcs.string()
    } });
export interface NewArguments {
    registry: RawTransactionArgument<string>;
    name: RawTransactionArgument<string>;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        registry: RawTransactionArgument<string>,
        name: RawTransactionArgument<string>
    ];
}
/**
 * Creates a genre in the canonical vocabulary. Creation is permissionless; the
 * validated canonical name fully determines the derived object, so caller identity
 * cannot change its id or contents. Creating the same name twice aborts (dedup is
 * automatic). The `Genre` is frozen — immutable and globally readable by
 * reference.
 */
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/genre';
    const argumentsTypes = [
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["registry", "name"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'genre',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeriveAddressArguments {
    self: RawTransactionArgument<string>;
    name: RawTransactionArgument<string>;
}
export interface DeriveAddressOptions {
    package?: string;
    arguments: DeriveAddressArguments | [
        self: RawTransactionArgument<string>,
        name: RawTransactionArgument<string>
    ];
}
/**
 * Derives the address a `Genre` with the given name would have, without creating
 * it. Lets clients resolve/check a genre address offline.
 */
export function deriveAddress(options: DeriveAddressOptions) {
    const packageAddress = options.package ?? '@local-pkg/genre';
    const argumentsTypes = [
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "name"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'genre',
        function: 'derive_address',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NameArguments {
    self: RawTransactionArgument<string>;
}
export interface NameOptions {
    package?: string;
    arguments: NameArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Returns the genre's canonical name. */
export function name(options: NameOptions) {
    const packageAddress = options.package ?? '@local-pkg/genre';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'genre',
        function: 'name',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}