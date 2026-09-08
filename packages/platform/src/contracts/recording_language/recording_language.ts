/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * The languages sung or spoken on a recording, stored as a dynamic field on the
 * recording's UID and written through its cap-gated `uid_mut`.
 *
 * Its own package, for the same reason the advisory rating is: language is set by
 * different people, at different times, and governed by a standard (ISO 639) that
 * has nothing to do with any other fact about the recording. A consumer
 * implementing a metadata profile picks this extension up or leaves it, and
 * replacing it never disturbs anything else attached to the work.
 *
 * A `vector`, not a single code — bilingual and code-switching recordings are
 * ordinary, and forcing one language would mean choosing which of them to erase.
 * Order is the caller's: first is conventionally the predominant one.
 *
 * **An empty vector means instrumental** — attached, and asserting there is no
 * sung or spoken content at all. That is a genuine claim about the recording and
 * is deliberately distinct from attaching nothing, which says only that nobody has
 * looked. `set_instrumental` exists so that claim reads as intent at the call site
 * rather than as an empty argument someone might mistake for an oversight.
 *
 * `LanguageCode` is a valid ISO 639-1 code by construction, so this package checks
 * only what construction cannot: how many, and whether any repeat.
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as language_code from './deps/language_code/language_code.ts';
const $moduleName = '@local-pkg/recording_language::recording_language';
export const ExtensionKey = new MoveTuple({ name: `${$moduleName}::ExtensionKey`, fields: [bcs.bool()] });
export const LanguagesSetEvent = new MoveStruct({ name: `${$moduleName}::LanguagesSetEvent`, fields: {
        recording_id: bcs.Address,
        languages: bcs.vector(language_code.LanguageCode)
    } });
export const LanguagesUnsetEvent = new MoveStruct({ name: `${$moduleName}::LanguagesUnsetEvent`, fields: {
        recording_id: bcs.Address
    } });
export interface SetLanguagesArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    languages: TransactionArgument;
}
export interface SetLanguagesOptions {
    package?: string;
    arguments: SetLanguagesArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        languages: TransactionArgument
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Sets (or replaces) the languages sung or spoken on the recording.
 *
 * Passing an empty vector asserts the recording is instrumental; prefer
 * `set_instrumental`, which says so at the call site.
 */
export function setLanguages(options: SetLanguagesOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_language';
    const argumentsTypes = [
        null,
        null,
        'vector<null>'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "languages"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_language',
        function: 'set_languages',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface SetInstrumentalArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface SetInstrumentalOptions {
    package?: string;
    arguments: SetInstrumentalArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Asserts the recording has no sung or spoken content. */
export function setInstrumental(options: SetInstrumentalOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_language';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_language',
        function: 'set_instrumental',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UnsetLanguagesArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface UnsetLanguagesOptions {
    package?: string;
    arguments: UnsetLanguagesArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Removes the language record, if any. Idempotent. Leaves the recording having
 * said nothing — which is not the same as asserting it is instrumental.
 */
export function unsetLanguages(options: UnsetLanguagesOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_language';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_language',
        function: 'unset_languages',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface HasLanguagesArguments {
    self: RawTransactionArgument<string>;
}
export interface HasLanguagesOptions {
    package?: string;
    arguments: HasLanguagesArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Whether a language record is attached to this recording. */
export function hasLanguages(options: HasLanguagesOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_language';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_language',
        function: 'has_languages',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface LanguagesArguments {
    self: RawTransactionArgument<string>;
}
export interface LanguagesOptions {
    package?: string;
    arguments: LanguagesArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * The recording's languages, in the order given. Empty means instrumental. Aborts
 * if nothing is attached — absence is a distinct state from an empty vector and
 * must not collapse into it.
 */
export function languages(options: LanguagesOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_language';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_language',
        function: 'languages',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface IsInstrumentalArguments {
    self: RawTransactionArgument<string>;
}
export interface IsInstrumentalOptions {
    package?: string;
    arguments: IsInstrumentalArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Whether the recording asserts it is instrumental: attached, and empty. False
 * when nothing is attached, because that asserts nothing.
 */
export function isInstrumental(options: IsInstrumentalOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_language';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_language',
        function: 'is_instrumental',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}