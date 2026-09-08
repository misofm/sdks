/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Free-form tags for a party — moods, scenes, and descriptors (e.g. "ambient",
 * "deconstructed club", "leftfield pop").
 *
 * The uncurated sibling to `party_genre`: genres reference a canonical, shared
 * vocabulary; tags are whatever the artist types. The set mechanics — storage,
 * duplicate and capacity checks, field reclamation — live in the shared
 * `typed_set` primitive; this package keeps only what is tag-specific: length
 * validation, the capacity, and the typed events. Duplicate / not-present /
 * over-max aborts come from `typed_set` with its own error codes. Tags are stored
 * as given (exact dedupe); normalization for search/display is a client concern.
 * Gated by the `PartyAdminCap`; views are permissionless.
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/party_tags::party_tags';
export const TagsKey = new MoveTuple({ name: `${$moduleName}::TagsKey`, fields: [bcs.bool()] });
export const TagAddedEvent = new MoveStruct({ name: `${$moduleName}::TagAddedEvent`, fields: {
        party_id: bcs.Address,
        tag: bcs.string()
    } });
export const TagRemovedEvent = new MoveStruct({ name: `${$moduleName}::TagRemovedEvent`, fields: {
        party_id: bcs.Address,
        tag: bcs.string()
    } });
export const TagsClearedEvent = new MoveStruct({ name: `${$moduleName}::TagsClearedEvent`, fields: {
        party_id: bcs.Address
    } });
export interface AddTagArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    tag: RawTransactionArgument<string>;
}
export interface AddTagOptions {
    package?: string;
    arguments: AddTagArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        tag: RawTransactionArgument<string>
    ];
}
/**
 * Adds a tag to the party. Aborts if empty or too long here, and in `typed_set` if
 * already present or the max is reached.
 */
export function addTag(options: AddTagOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_tags';
    const argumentsTypes = [
        null,
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "tag"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_tags',
        function: 'add_tag',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RemoveTagArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    tag: RawTransactionArgument<string>;
}
export interface RemoveTagOptions {
    package?: string;
    arguments: RemoveTagArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        tag: RawTransactionArgument<string>
    ];
}
/**
 * Removes a tag from the party. Aborts in `typed_set` if not present. The whole
 * field is dropped when the last tag leaves, so `has_tags` tracks "carries tags",
 * not "has ever tagged".
 */
export function removeTag(options: RemoveTagOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_tags';
    const argumentsTypes = [
        null,
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "tag"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_tags',
        function: 'remove_tag',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ClearTagsArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface ClearTagsOptions {
    package?: string;
    arguments: ClearTagsArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
}
/** Removes the party's entire tag set. No-op if none is set. */
export function clearTags(options: ClearTagsOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_tags';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_tags',
        function: 'clear_tags',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasTagsArguments {
    self: RawTransactionArgument<string>;
}
export interface HasTagsOptions {
    package?: string;
    arguments: HasTagsArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Whether the party carries any tags. */
export function hasTags(options: HasTagsOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_tags';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_tags',
        function: 'has_tags',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasTagArguments {
    self: RawTransactionArgument<string>;
    tag: RawTransactionArgument<string>;
}
export interface HasTagOptions {
    package?: string;
    arguments: HasTagArguments | [
        self: RawTransactionArgument<string>,
        tag: RawTransactionArgument<string>
    ];
}
/** Whether the party carries the given tag. */
export function hasTag(options: HasTagOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_tags';
    const argumentsTypes = [
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "tag"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_tags',
        function: 'has_tag',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TagsArguments {
    self: RawTransactionArgument<string>;
}
export interface TagsOptions {
    package?: string;
    arguments: TagsArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** The party's tags. */
export function tags(options: TagsOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_tags';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_tags',
        function: 'tags',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}