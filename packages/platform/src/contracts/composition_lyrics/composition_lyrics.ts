/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Language-specific lyrics attached to a composition. The payload convention is
 * UTF-8 text compressed into one self-contained Zstandard frame without an
 * external dictionary. Move stores opaque bytes: it does not decode, inspect frame
 * headers, validate text, or attest to the lyrics or their language. Writes
 * require the composition's matching admin cap; reads are permissionless.
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as language_code from './deps/language_code/language_code.ts';
const $moduleName = '@local-pkg/composition_lyrics::composition_lyrics';
export const ExtensionKey = new MoveTuple({ name: `${$moduleName}::ExtensionKey`, fields: [language_code.LanguageCode] });
export const CompositionLyricsSetEvent = new MoveStruct({ name: `${$moduleName}::CompositionLyricsSetEvent<phantom CompositionShare>`, fields: {
        composition_id: bcs.Address,
        composition_admin_cap_id: bcs.Address,
        language: bcs.vector(bcs.u8()),
        lyrics_existed_before: bcs.bool()
    } });
export const CompositionLyricsClearedEvent = new MoveStruct({ name: `${$moduleName}::CompositionLyricsClearedEvent<phantom CompositionShare>`, fields: {
        composition_id: bcs.Address,
        composition_admin_cap_id: bcs.Address,
        language: bcs.vector(bcs.u8())
    } });
export interface SetLyricsArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    language: TransactionArgument;
    lyrics: RawTransactionArgument<Array<number>>;
}
export interface SetLyricsOptions {
    package?: string;
    arguments: SetLyricsArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        language: TransactionArgument,
        lyrics: RawTransactionArgument<Array<number>>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Adds or replaces one language, preserving the supplied bytes exactly.
 * Authorization precedes storage validation. Empty and malformed frames are left
 * for clients to interpret. Equal replacements still write the value but do not
 * emit a change event.
 */
export function setLyrics(options: SetLyricsOptions) {
    const packageAddress = options.package ?? '@local-pkg/composition_lyrics';
    const argumentsTypes = [
        null,
        null,
        null,
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "language", "lyrics"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition_lyrics',
        function: 'set_lyrics',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ClearLyricsArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    language: TransactionArgument;
}
export interface ClearLyricsOptions {
    package?: string;
    arguments: ClearLyricsArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        language: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/** Removes only this language. An absent entry is an authorized, silent no-op. */
export function clearLyrics(options: ClearLyricsOptions) {
    const packageAddress = options.package ?? '@local-pkg/composition_lyrics';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "language"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition_lyrics',
        function: 'clear_lyrics',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface HasLyricsArguments {
    self: RawTransactionArgument<string>;
    language: TransactionArgument;
}
export interface HasLyricsOptions {
    package?: string;
    arguments: HasLyricsArguments | [
        self: RawTransactionArgument<string>,
        language: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
export function hasLyrics(options: HasLyricsOptions) {
    const packageAddress = options.package ?? '@local-pkg/composition_lyrics';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "language"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition_lyrics',
        function: 'has_lyrics',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface LyricsArguments {
    self: RawTransactionArgument<string>;
    language: TransactionArgument;
}
export interface LyricsOptions {
    package?: string;
    arguments: LyricsArguments | [
        self: RawTransactionArgument<string>,
        language: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/** Borrows the compressed bytes. Aborts when this language has no entry. */
export function lyrics(options: LyricsOptions) {
    const packageAddress = options.package ?? '@local-pkg/composition_lyrics';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "language"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition_lyrics',
        function: 'lyrics',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface MaxLyricsLengthOptions {
    package?: string;
    arguments?: [
    ];
}
/** Maximum stored payload size per language, in bytes. */
export function maxLyricsLength(options: MaxLyricsLengthOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/composition_lyrics';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'composition_lyrics',
        function: 'max_lyrics_length',
    });
}