/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * The parental advisory rating for a recording — whether its lyrics are explicit —
 * stored as a dynamic field on the recording's UID and written through its
 * cap-gated `uid_mut`.
 *
 * This is its own package on purpose. Advisory ratings are set by a different
 * person, at a different time, for entirely different reasons than the other facts
 * about a recording, and the standard that governs them moves on its own schedule.
 * Bundling it into a general "recording metadata" object would mean that revising
 * the advisory standard drags every unrelated field through the migration. Kept
 * separate, a consumer implementing some future metadata profile selects this
 * extension or ignores it, and swapping it touches nothing else.
 *
 * The rating is deliberately not a boolean. Every distributor and storefront
 * distinguishes a _cleaned_ edit — an explicit recording re-issued with the
 * offending content removed — from a recording that was never explicit at all.
 * They are merchandised differently and a boolean cannot express the difference,
 * so `Cleaned` is a first-class variant.
 *
 * Attaching the extension IS the statement. There is no "attached but undeclared"
 * state: if a rating is present it has been asserted by the rights holder, and a
 * recording with nothing attached has simply said nothing.
 */

import { MoveTuple, MoveEnum, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/recording_advisory::recording_advisory';
export const ExtensionKey = new MoveTuple({ name: `${$moduleName}::ExtensionKey`, fields: [bcs.bool()] });
/** A recording's parental advisory rating. */
export const ExplicitRating = new MoveEnum({ name: `${$moduleName}::ExplicitRating`, fields: {
        /** Contains explicit content. */
        Explicit: null,
        /** Contains no explicit content, and never did. */
        NotExplicit: null,
        /** An edited version of a recording that was originally explicit. */
        Cleaned: null
    } });
export const AdvisoryRatingSetEvent = new MoveStruct({ name: `${$moduleName}::AdvisoryRatingSetEvent`, fields: {
        recording_id: bcs.Address,
        rating: ExplicitRating
    } });
export const AdvisoryRatingUnsetEvent = new MoveStruct({ name: `${$moduleName}::AdvisoryRatingUnsetEvent`, fields: {
        recording_id: bcs.Address
    } });
export interface ExplicitOptions {
    package?: string;
    arguments?: [
    ];
}
/** Contains explicit content. */
export function explicit(options: ExplicitOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/recording_advisory';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_advisory',
        function: 'explicit',
    });
}
export interface NotExplicitOptions {
    package?: string;
    arguments?: [
    ];
}
/** Contains no explicit content, and never did. */
export function notExplicit(options: NotExplicitOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/recording_advisory';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_advisory',
        function: 'not_explicit',
    });
}
export interface CleanedOptions {
    package?: string;
    arguments?: [
    ];
}
/** An edited version of a recording that was originally explicit. */
export function cleaned(options: CleanedOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/recording_advisory';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_advisory',
        function: 'cleaned',
    });
}
export interface SetRatingArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    rating: TransactionArgument;
}
export interface SetRatingOptions {
    package?: string;
    arguments: SetRatingArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        rating: TransactionArgument
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Sets (or replaces) the recording's advisory rating. */
export function setRating(options: SetRatingOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_advisory';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "rating"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_advisory',
        function: 'set_rating',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UnsetRatingArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface UnsetRatingOptions {
    package?: string;
    arguments: UnsetRatingArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Removes the rating, if any. Idempotent — the recording is left having said
 * nothing about its content, which is distinct from asserting `NotExplicit`.
 */
export function unsetRating(options: UnsetRatingOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_advisory';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_advisory',
        function: 'unset_rating',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface HasRatingArguments {
    self: RawTransactionArgument<string>;
}
export interface HasRatingOptions {
    package?: string;
    arguments: HasRatingArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Whether an advisory rating is attached to this recording. */
export function hasRating(options: HasRatingOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_advisory';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_advisory',
        function: 'has_rating',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RatingArguments {
    self: RawTransactionArgument<string>;
}
export interface RatingOptions {
    package?: string;
    arguments: RatingArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * The recording's advisory rating. Aborts if none is attached — callers that
 * tolerate an unrated recording should check `has_rating` first, since absence is
 * a meaningful state and must not be silently read as `NotExplicit`.
 */
export function rating(options: RatingOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_advisory';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_advisory',
        function: 'rating',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface IsExplicitArguments {
    self: TransactionArgument;
}
export interface IsExplicitOptions {
    package?: string;
    arguments: IsExplicitArguments | [
        self: TransactionArgument
    ];
}
/** Whether the recording contains explicit content. */
export function isExplicit(options: IsExplicitOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_advisory';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_advisory',
        function: 'is_explicit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsNotExplicitArguments {
    self: TransactionArgument;
}
export interface IsNotExplicitOptions {
    package?: string;
    arguments: IsNotExplicitArguments | [
        self: TransactionArgument
    ];
}
/** Whether the recording contains no explicit content and never did. */
export function isNotExplicit(options: IsNotExplicitOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_advisory';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_advisory',
        function: 'is_not_explicit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsCleanedArguments {
    self: TransactionArgument;
}
export interface IsCleanedOptions {
    package?: string;
    arguments: IsCleanedArguments | [
        self: TransactionArgument
    ];
}
/** Whether the recording is an edited version of an originally explicit one. */
export function isCleaned(options: IsCleanedOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_advisory';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_advisory',
        function: 'is_cleaned',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NameArguments {
    self: TransactionArgument;
}
export interface NameOptions {
    package?: string;
    arguments: NameArguments | [
        self: TransactionArgument
    ];
}
/**
 * The rating's canonical name, for clients and indexers that need a stable string
 * rather than a Move value.
 */
export function name(options: NameOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_advisory';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_advisory',
        function: 'name',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}