/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Represents a musical composition (song, instrumental work) in musicos.
 * Compositions are the underlying written works that recordings are based on. Each
 * composition has its own share token for ownership distribution.
 *
 * ### Key Features:
 *
 * - Share token initialization with fixed supply (10M tokens, 6 decimals)
 * - State machine: Initialized -> Published (embedded fields immutable after
 *   publish; dynamic fields remain extensible via `uid_mut`)
 * - Deterministic addresses via derived object pattern
 *
 * Attribution (credits) is intentionally NOT part of core: it is display-oriented,
 * varies across platforms, and is never read by the economics. It lives in a
 * first-party credits extension attached via `uid_mut`, so core takes no
 * dependency on an identity package and core publish enforces no attribution.
 *
 * ### Lifecycle and trust model
 *
 * A composition is `key`-only with no `drop`: a fresh `Initialized` object cannot
 * be transferred, wrapped, publicly shared, or discarded, and its only by-value
 * consumer is `publish`. Create-and-publish is therefore atomic by construction —
 * an `Initialized` composition cannot outlive its creating transaction, and every
 * composition that exists on-chain is `Published` and shared. There is
 * deliberately no keep function; staged building must fit one transaction.
 *
 * `uid_mut` works in any lifecycle state and is permanent root over ALL dynamic
 * fields on the object — including fields attached by other extensions. "Immutable
 * after publish" covers the embedded fields only; extension-layer data stays
 * admin-mutable in perpetuity. This is the designed extension surface, and it is
 * the one trust assumption that never expires: integrators should model the cap
 * holder as able to mutate or delete any extension data, forever.
 */

import { MoveEnum, MoveStruct, MoveTuple, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction } from '@mysten/sui/transactions';
import * as bps from './deps/bps/bps.ts';
const $moduleName = '@local-pkg/musicos::composition';
/** Lifecycle state of a composition. */
export const CompositionState = new MoveEnum({ name: `${$moduleName}::CompositionState`, fields: {
        /** Composition is initialized but not published. */
        Initialized: null,
        /** Composition is published and immutable. Includes publication timestamp. */
        Published: bcs.u64()
    } });
export const Composition = new MoveStruct({ name: `${$moduleName}::Composition<phantom CompositionShare>`, fields: {
        /** Unique identifier for this composition. */
        id: bcs.Address,
        /** Current lifecycle state. */
        state: CompositionState,
        /** Primary title of the composition. */
        title: bcs.string(),
        /** Royalty rate this composition earns from each recording's revenue. */
        royalty_rate: bps.BPS
    } });
export const CompositionAdminCap = new MoveStruct({ name: `${$moduleName}::CompositionAdminCap<phantom CompositionShare>`, fields: {
        /** Unique identifier for this capability. */
        id: bcs.Address
    } });
export const CompositionAdminCapKey = new MoveTuple({ name: `${$moduleName}::CompositionAdminCapKey`, fields: [bcs.bool()] });
export const CompositionCreatedEvent = new MoveStruct({ name: `${$moduleName}::CompositionCreatedEvent<phantom CompositionShare>`, fields: {
        composition_id: bcs.Address,
        composition_admin_cap_id: bcs.Address,
        share_currency_id: bcs.Address,
        consumed_treasury_cap_id: bcs.Address,
        created_by: bcs.Address,
        title_bytes: bcs.vector(bcs.u8()),
        royalty_rate_bps: bcs.u16(),
        share_supply_before: bcs.u64(),
        share_supply_after: bcs.u64(),
        shares_returned: bcs.u64(),
        share_decimals: bcs.u8(),
        share_supply_fixed_after: bcs.bool()
    } });
export const CompositionPublishedEvent = new MoveStruct({ name: `${$moduleName}::CompositionPublishedEvent<phantom CompositionShare>`, fields: {
        composition_id: bcs.Address,
        composition_admin_cap_id: bcs.Address,
        clock_id: bcs.Address,
        title_bytes: bcs.vector(bcs.u8()),
        royalty_rate_bps: bcs.u16(),
        published_at_ms: bcs.u64(),
        shared_after: bcs.bool()
    } });
export interface NewArguments {
    title: RawTransactionArgument<string>;
    royaltyRateBps: RawTransactionArgument<number>;
    shareCurrency: RawTransactionArgument<string>;
    shareTreasuryCap: RawTransactionArgument<string>;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        title: RawTransactionArgument<string>,
        royaltyRateBps: RawTransactionArgument<number>,
        shareCurrency: RawTransactionArgument<string>,
        shareTreasuryCap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Creates a new composition with the given title and royalty rate.
 *
 * The rate is set once, here, and is immutable for the composition's lifetime: it
 * is a permanent standing offer that recorders and share buyers can price against
 * without trusting the admin. The protocol imposes no opinion on it beyond the
 * arithmetic bound of 100% (10000 bps, enforced by `bps::new`). There is no floor
 * — 0% is permitted (e.g. a generative recording with no authored composition) —
 * and no protocol ceiling: an uncompetitive rate simply attracts no recordings.
 * What rate is reasonable is a client-side concern; per-deal deviations settle as
 * voluntary share transfers after recording creation. Initializes share tokens
 * (10M supply, 6 decimals) and returns:
 *
 * - The composition object
 * - Admin capability for the owner
 * - Initial share token balance
 */
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        '0x1::string::String',
        'u16',
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["title", "royaltyRateBps", "shareCurrency", "shareTreasuryCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PublishArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface PublishOptions {
    package?: string;
    arguments: PublishArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Publishes the composition, making its embedded fields immutable. Required State:
 * Initialized
 *
 * Note: core enforces no attribution requirement — credits live in the credits
 * extension and may be attached before or after publish via `uid_mut`.
 */
export function publish(options: PublishOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition',
        function: 'publish',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface TitleArguments {
    self: RawTransactionArgument<string>;
}
export interface TitleOptions {
    package?: string;
    arguments: TitleArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Returns the primary title. */
export function title(options: TitleOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition',
        function: 'title',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RoyaltyRateArguments {
    self: RawTransactionArgument<string>;
}
export interface RoyaltyRateOptions {
    package?: string;
    arguments: RoyaltyRateArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Returns the royalty rate this composition earns from each recording. Immutable
 * for the composition's lifetime — the value read here is, by construction, the
 * value `recording::new` will apply.
 */
export function royaltyRate(options: RoyaltyRateOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition',
        function: 'royalty_rate',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
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
    typeArguments: [
        string
    ];
}
/** Returns a reference to the composition's UID for reading dynamic fields. */
export function uid(options: UidOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition',
        function: 'uid',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UidMutArguments {
    self: RawTransactionArgument<string>;
    _: RawTransactionArgument<string>;
}
export interface UidMutOptions {
    package?: string;
    arguments: UidMutArguments | [
        self: RawTransactionArgument<string>,
        _: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Returns a mutable reference to the composition's UID. Requires the admin
 * capability. Works in any lifecycle state — dynamic fields are the extension
 * surface and stay admin-mutable after publish; only the embedded fields are
 * frozen. The reference is root over every dynamic field on the object, including
 * fields attached by other extensions.
 */
export function uidMut(options: UidMutOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "_"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition',
        function: 'uid_mut',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}