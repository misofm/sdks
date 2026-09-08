/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * What a release says about itself — the paragraph that runs under the title,
 * written by whoever holds the release's admin cap, and believed.
 *
 * A free string, deliberately. Nothing on-chain reads it and nothing derives from
 * it: this is editorial prose, not a fact the protocol can check. The facts a
 * release carries that _are_ checkable — its tracklist, its splits, its state —
 * live on the core object, and the claims two releases have to agree about to be
 * comparable (genre, credits, languages) each get their own typed extension so
 * they can be queried rather than read. What is left over is what a person wants
 * to say, and the only useful thing to do with it is store it and attribute it to
 * the cap holder.
 *
 * One slot, not a set. A release has one thing to say about itself; per-track
 * notes and per-language translations are different concerns and would be
 * different extensions. Folding either in here would turn a paragraph into a
 * schema, and a schema is exactly what prose is not.
 *
 * The 8 KB ceiling is storage hygiene, not an editorial opinion — a backstop
 * against pathological bloat in a shared object, deliberately set well above any
 * description anyone is expected to write. It is the most generous free-text bound
 * in the stack, and that is the intended asymmetry: this package publishes
 * immutable, so a ceiling that turns out to be too low can never be raised, while
 * one that is too high costs only the gas of the writer who fills it. A
 * description is also edited rarely, so the cost of rewriting the field in full
 * lands on almost nobody.
 *
 * Genuinely long-form writing — an essay, a full set of liner notes — still
 * belongs where the artwork goes, in a Walrus blob referenced by an extension.
 * Nothing here stops someone using the whole 8 KB; the bound is a limit, not a
 * recommendation.
 *
 * Attaching nothing and attaching a description are distinct states: absence means
 * nobody has written one, which is why an empty string is rejected rather than
 * stored. There is no such thing as an empty description.
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/release_description::release_description';
export const ExtensionKey = new MoveTuple({ name: `${$moduleName}::ExtensionKey`, fields: [bcs.bool()] });
export const DescriptionSetEvent = new MoveStruct({ name: `${$moduleName}::DescriptionSetEvent`, fields: {
        release_id: bcs.Address,
        description: bcs.string()
    } });
export const DescriptionClearedEvent = new MoveStruct({ name: `${$moduleName}::DescriptionClearedEvent`, fields: {
        release_id: bcs.Address
    } });
export interface SetDescriptionArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    description: RawTransactionArgument<string>;
}
export interface SetDescriptionOptions {
    package?: string;
    arguments: SetDescriptionArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        description: RawTransactionArgument<string>
    ];
}
/**
 * Sets (or replaces) what the release says about itself.
 *
 * Stored exactly as given — whitespace, line breaks and case included. It is the
 * release's own words, and normalising them here would be the protocol editing
 * prose it has already declined to interpret.
 */
export function setDescription(options: SetDescriptionOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_description';
    const argumentsTypes = [
        null,
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "description"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_description',
        function: 'set_description',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ClearDescriptionArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface ClearDescriptionOptions {
    package?: string;
    arguments: ClearDescriptionArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
}
/**
 * Removes the description, if any. Idempotent. Leaves the release having said
 * nothing about itself, which is where every release starts.
 */
export function clearDescription(options: ClearDescriptionOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_description';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_description',
        function: 'clear_description',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasDescriptionArguments {
    self: RawTransactionArgument<string>;
}
export interface HasDescriptionOptions {
    package?: string;
    arguments: HasDescriptionArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Whether a description is attached to this release. */
export function hasDescription(options: HasDescriptionOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_description';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_description',
        function: 'has_description',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DescriptionArguments {
    self: RawTransactionArgument<string>;
}
export interface DescriptionOptions {
    package?: string;
    arguments: DescriptionArguments | [
        self: RawTransactionArgument<string>
    ];
}
/**
 * What the release says about itself. Aborts if nothing is attached — absence is a
 * distinct state and must not collapse into an empty string.
 */
export function description(options: DescriptionOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_description';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_description',
        function: 'description',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}