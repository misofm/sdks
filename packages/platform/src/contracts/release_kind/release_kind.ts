/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * What a release calls itself — "Album", "EP", "Mixtape", "Split" — asserted by
 * whoever holds the release's admin cap, and believed.
 *
 * Deliberately a free string rather than an enum. An enum would not decide the
 * classification (the admin still picks) but it would decide the _menu_, and
 * deciding which self-descriptions are legitimate is not the protocol's job.
 * Artists release beat tapes and splits and things nobody has named yet; a closed
 * set would make each of those a package swap, and in the meantime would quietly
 * push releases into whichever official-looking box fit worst.
 *
 * Nothing here derives the value or checks it for plausibility. A four-track
 * release may call itself an Album and a twelve-track one an EP; both happen, and
 * the artist's intent is the fact worth recording. The only checks are structural
 * — non-empty and bounded — so the field stays storable.
 *
 * This is the opposite call from `release_genre`, on purpose. Genre is a curated
 * vocabulary because discovery and reward-eligibility depend on releases agreeing
 * with each other about what a genre _is_. Nothing depends on two releases
 * agreeing about what an EP is.
 *
 * The cost of that freedom lands on readers: "EP", "ep" and "Extended Play" are
 * three distinct values here. Clients that group or facet by kind should normalise
 * (case-fold at minimum) rather than expect canonical strings.
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/release_kind::release_kind';
export const ExtensionKey = new MoveTuple({ name: `${$moduleName}::ExtensionKey`, fields: [bcs.bool()] });
export const KindSetEvent = new MoveStruct({ name: `${$moduleName}::KindSetEvent`, fields: {
        release_id: bcs.Address,
        kind: bcs.string()
    } });
export const KindUnsetEvent = new MoveStruct({ name: `${$moduleName}::KindUnsetEvent`, fields: {
        release_id: bcs.Address
    } });
export interface SetKindArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    kind: RawTransactionArgument<string>;
}
export interface SetKindOptions {
    package?: string;
    arguments: SetKindArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        kind: RawTransactionArgument<string>
    ];
}
/**
 * Sets (or replaces) what the release calls itself.
 *
 * The string is stored exactly as given, including case — it is the release's own
 * word for itself, and normalising it here would be the protocol having an opinion
 * after all.
 */
export function setKind(options: SetKindOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_kind';
    const argumentsTypes = [
        null,
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "kind"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_kind',
        function: 'set_kind',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface UnsetKindArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface UnsetKindOptions {
    package?: string;
    arguments: UnsetKindArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
}
/**
 * Removes the kind, if any. Idempotent. Leaves the release having said nothing
 * about what it is, which is a different state from calling itself anything.
 */
export function unsetKind(options: UnsetKindOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_kind';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_kind',
        function: 'unset_kind',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasKindArguments {
    self: RawTransactionArgument<string>;
}
export interface HasKindOptions {
    package?: string;
    arguments: HasKindArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Whether a kind is attached to this release. */
export function hasKind(options: HasKindOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_kind';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_kind',
        function: 'has_kind',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface KindArguments {
    self: RawTransactionArgument<string>;
}
export interface KindOptions {
    package?: string;
    arguments: KindArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** What the release calls itself. Aborts if nothing is attached. */
export function kind(options: KindOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_kind';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_kind',
        function: 'kind',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}