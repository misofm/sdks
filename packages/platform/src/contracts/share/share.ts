/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Fixed-supply currency issuance for representing equity-like ownership stakes.
 *
 * ### Usage:
 *
 * 1.  Create a package with a `share` module containing a `Share` type
 * 2.  Create a currency with `sui::coin_registry::new_currency`
 * 3.  Delete the metadata cap via `finalize_and_delete_metadata_cap`
 * 4.  Call `share::share::initialize` with the currency and its canonical treasury
 *     cap (the one created together with the currency)
 * 5.  Distribute the returned balance to shareholders
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/share::share';
export const ShareInitializedEvent = new MoveStruct({ name: `${$moduleName}::ShareInitializedEvent<phantom ShareType>`, fields: {
        currency_id: bcs.Address,
        treasury_cap_id: bcs.Address,
        decimals: bcs.u8(),
        supply: bcs.u64(),
        fixed_supply: bcs.bool(),
        metadata_cap_deleted: bcs.bool(),
        regulated: bcs.bool(),
        name: bcs.vector(bcs.u8()),
        symbol: bcs.vector(bcs.u8()),
        description: bcs.vector(bcs.u8()),
        icon_url: bcs.vector(bcs.u8())
    } });
export interface InitializeArguments {
    currency: RawTransactionArgument<string>;
    treasuryCap: RawTransactionArgument<string>;
}
export interface InitializeOptions {
    package?: string;
    arguments: InitializeArguments | [
        currency: RawTransactionArgument<string>,
        treasuryCap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Initializes a fixed-supply share token with 10,000,000.000000 supply. Validates
 * the currency configuration, mints the fixed supply, and makes the supply
 * immutable. Returns the full token balance.
 *
 * The type parameter must be a `Share` type defined in a `share` module (i.e.
 * `<address>::share::Share`).
 */
export function initialize(options: InitializeOptions) {
    const packageAddress = options.package ?? '@local-pkg/share';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["currency", "treasuryCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'share',
        function: 'initialize',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface IsShareArguments {
    currency: RawTransactionArgument<string>;
}
export interface IsShareOptions {
    package?: string;
    arguments: IsShareArguments | [
        currency: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Returns whether `currency` is a valid share: its type is
 * `<address>::share::Share`, its metadata cap is deleted, it is not regulated, it
 * has 6 decimals, and its supply is permanently fixed at 10,000,000.000000 tokens.
 * This is the complete property set `initialize` establishes, read back from the
 * currency, so downstream packages can gate on it. It returns `true` for any
 * currency with that shape, including one that reached it without `initialize`;
 * such a currency is economically identical (only the `ShareInitializedEvent` is
 * missing). The canonical treasury-cap check `initialize` performs needs no
 * counterpart here: a fixed supply means the treasury cap was consumed, and a
 * fixed supply cannot burn.
 */
export function isShare(options: IsShareOptions) {
    const packageAddress = options.package ?? '@local-pkg/share';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["currency"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'share',
        function: 'is_share',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}