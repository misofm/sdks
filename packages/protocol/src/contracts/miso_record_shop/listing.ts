/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * A fixed-price or minimum-price Record Shop listing for one Pressing.
 *
 * There is no Record Shop singleton. Each `Listing<Currency>` derives directly
 * from its Pressing and is independently shared, so currencies and Pressings
 * remain separate consensus lanes except for their common edition sequence.
 */

import { MoveTuple, MoveEnum, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as type_name from './deps/std/type_name.ts';
const $moduleName = '@local-pkg/miso_record_shop::listing';
export const ListingKey = new MoveTuple({ name: `${$moduleName}::ListingKey<phantom Currency>`, fields: [bcs.bool()] });
/** Payment rule for a Listing. */
export const Pricing = new MoveEnum({ name: `${$moduleName}::Pricing`, fields: {
        /** Require payment to equal the configured price. */
        Fixed: bcs.u64(),
        /** Require payment to be at least the configured price. */
        Floor: bcs.u64()
    } });
/** Whether purchases are accepted. */
export const State = new MoveEnum({ name: `${$moduleName}::State`, fields: {
        Enabled: null,
        Disabled: null
    } });
export const Listing = new MoveStruct({ name: `${$moduleName}::Listing<phantom Currency>`, fields: {
        /** The Listing's derived object identity. */
        id: bcs.Address,
        /** The release that receives payments from this Listing. */
        release_id: bcs.Address,
        /** The Pressing from which this Listing purchases Records. */
        pressing_id: bcs.Address,
        /** The active payment rule. */
        pricing: Pricing,
        /** Whether the Listing currently accepts purchases. */
        state: State
    } });
export const ListingCreatedEvent = new MoveStruct({ name: `${$moduleName}::ListingCreatedEvent<phantom Currency>`, fields: {
        /** The newly created Listing. */
        listing_id: bcs.Address,
        /** The release that receives Listing payments. */
        release_id: bcs.Address,
        /** The Pressing sold by the Listing. */
        pressing_id: bcs.Address,
        /** The Listing's initial payment rule. */
        pricing: Pricing,
        /** The Listing's initial state. */
        state: State
    } });
export const ListingPriceChangedEvent = new MoveStruct({ name: `${$moduleName}::ListingPriceChangedEvent<phantom Currency>`, fields: {
        /** The updated Listing. */
        listing_id: bcs.Address,
        /** The new payment rule. */
        pricing: Pricing
    } });
export const ListingStateChangedEvent = new MoveStruct({ name: `${$moduleName}::ListingStateChangedEvent<phantom Currency>`, fields: {
        /** The updated Listing. */
        listing_id: bcs.Address,
        /** The new Listing state. */
        state: State
    } });
export const RecordSoldEvent = new MoveStruct({ name: `${$moduleName}::RecordSoldEvent<phantom Currency>`, fields: {
        /** The Listing that completed the sale. */
        listing_id: bcs.Address,
        /** The purchased Record. */
        record_id: bcs.Address,
        /** The release that received payment. */
        release_id: bcs.Address,
        /** The Pressing that issued the Record. */
        pressing_id: bcs.Address,
        /** The edition represented by the Pressing. */
        edition: bcs.u16(),
        /** The Record's number within its edition. */
        number: bcs.u32(),
        /** The defining type of the purchase currency. */
        purchase_currency: type_name.TypeName,
        /** The amount paid for the Record. */
        purchase_price: bcs.u64(),
        /** The transaction sender who purchased the Record. */
        purchased_by: bcs.Address,
        /** The purchase time in Unix milliseconds from Sui's Clock. */
        purchased_timestamp_ms: bcs.u64(),
        /** The payment rule accepted for the sale. */
        pricing: Pricing
    } });
export interface FixedArguments {
    price: RawTransactionArgument<number | bigint>;
}
export interface FixedOptions {
    package?: string;
    arguments: FixedArguments | [
        price: RawTransactionArgument<number | bigint>
    ];
}
/** Construct an exact-payment pricing rule. */
export function fixed(options: FixedOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    const argumentsTypes = [
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["price"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'fixed',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FloorArguments {
    price: RawTransactionArgument<number | bigint>;
}
export interface FloorOptions {
    package?: string;
    arguments: FloorArguments | [
        price: RawTransactionArgument<number | bigint>
    ];
}
/** Construct a minimum-payment pricing rule. */
export function floor(options: FloorOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    const argumentsTypes = [
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["price"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'floor',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EnabledOptions {
    package?: string;
    arguments?: [
    ];
}
/** Construct the state that accepts purchases. */
export function enabled(options: EnabledOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'enabled',
    });
}
export interface DisabledOptions {
    package?: string;
    arguments?: [
    ];
}
/** Construct the state that rejects purchases. */
export function disabled(options: DisabledOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'disabled',
    });
}
export interface NewArguments {
    pressing: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    pricing: TransactionArgument;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        pressing: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        pricing: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/**
 * Create the permanent Listing for `Currency` under this Pressing.
 *
 * The Listing starts enabled and is returned unshared so callers can compose
 * further configuration before calling `share`.
 */
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["pressing", "cap", "pricing"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ShareArguments {
    self: RawTransactionArgument<string>;
}
export interface ShareOptions {
    package?: string;
    arguments: ShareArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Share a newly created Listing. */
export function share(options: ShareOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'share',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface SetPriceArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    pricing: TransactionArgument;
}
export interface SetPriceOptions {
    package?: string;
    arguments: SetPriceArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        pricing: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/** Change the payment rule using the capability for the bound Pressing. */
export function setPrice(options: SetPriceOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "pricing"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'set_price',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface SetStateArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    state: TransactionArgument;
}
export interface SetStateOptions {
    package?: string;
    arguments: SetStateArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        state: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/** Enable or disable purchases using the capability for the bound Pressing. */
export function setState(options: SetStateOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "state"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'set_state',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PurchaseArguments {
    self: RawTransactionArgument<string>;
    pressing: RawTransactionArgument<string>;
    payment: TransactionArgument;
    expectedPricing: TransactionArgument;
}
export interface PurchaseOptions {
    package?: string;
    arguments: PurchaseArguments | [
        self: RawTransactionArgument<string>,
        pressing: RawTransactionArgument<string>,
        payment: TransactionArgument,
        expectedPricing: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/**
 * Purchase and return the next Record from the bound Pressing.
 *
 * `expected_pricing` protects the buyer against stale price or pricing-rule
 * changes. The entire payment is deposited into the Release object's funds
 * accumulator; a Floor overpayment is not refunded. The caller decides how to
 * transfer or compose the returned Record.
 */
export function purchase(options: PurchaseOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "pressing", "payment", "expectedPricing"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'purchase',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
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
    typeArguments: [
        string
    ];
}
/** Return the release that receives Listing payments. */
export function releaseId(options: ReleaseIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'release_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
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
    typeArguments: [
        string
    ];
}
/** Return the Pressing sold by this Listing. */
export function pressingId(options: PressingIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'pressing_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PricingArguments {
    self: RawTransactionArgument<string>;
}
export interface PricingOptions {
    package?: string;
    arguments: PricingArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Return this Listing's payment rule. */
export function pricing(options: PricingOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'pricing',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PriceArguments {
    self: RawTransactionArgument<string>;
}
export interface PriceOptions {
    package?: string;
    arguments: PriceArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Return the amount configured by this Listing's payment rule. */
export function price(options: PriceOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'price',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface StateArguments {
    self: RawTransactionArgument<string>;
}
export interface StateOptions {
    package?: string;
    arguments: StateArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Return this Listing's current state. */
export function state(options: StateOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'state',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface IsEnabledArguments {
    self: RawTransactionArgument<string>;
}
export interface IsEnabledOptions {
    package?: string;
    arguments: IsEnabledArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Return whether this Listing currently accepts purchases. */
export function isEnabled(options: IsEnabledOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'is_enabled',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface IsDisabledArguments {
    self: RawTransactionArgument<string>;
}
export interface IsDisabledOptions {
    package?: string;
    arguments: IsDisabledArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Return whether this Listing currently rejects purchases. */
export function isDisabled(options: IsDisabledOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'is_disabled',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface IsFixedArguments {
    pricing: TransactionArgument;
}
export interface IsFixedOptions {
    package?: string;
    arguments: IsFixedArguments | [
        pricing: TransactionArgument
    ];
}
/** Return whether `pricing` requires an exact payment. */
export function isFixed(options: IsFixedOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["pricing"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'is_fixed',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsFloorArguments {
    pricing: TransactionArgument;
}
export interface IsFloorOptions {
    package?: string;
    arguments: IsFloorArguments | [
        pricing: TransactionArgument
    ];
}
/** Return whether `pricing` permits payment above its configured floor. */
export function isFloor(options: IsFloorOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["pricing"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'is_floor',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeriveAddressArguments {
    pressingId: RawTransactionArgument<string>;
}
export interface DeriveAddressOptions {
    package?: string;
    arguments: DeriveAddressArguments | [
        pressingId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Derive the one Listing address for `(pressing_id, Currency)`. */
export function deriveAddress(options: DeriveAddressOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_record_shop';
    const argumentsTypes = [
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["pressingId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'listing',
        function: 'derive_address',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}