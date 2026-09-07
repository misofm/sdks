/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * A recording administrator's pointer to the Miso Engine session file for a
 * recording.
 *
 * The domain-specific `EngineSession` wraps an unencrypted
 * `ori::data::WalrusBlob`. Ori models this as a standalone Walrus data reference
 * with explicit confidentiality metadata; encrypted blobs are rejected when the
 * wrapper is constructed.
 *
 * This extension asserts only which session file the recording administrator
 * chose. It does not prove storage availability, file validity, or that the
 * session describes the attached recording. Publication tooling must perform those
 * checks before attachment.
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as data_1 from './deps/ori/data.ts';
const $moduleName = '@local-pkg/recording_engine_session::recording_engine_session';
export const ExtensionKey = new MoveTuple({ name: `${$moduleName}::ExtensionKey`, fields: [bcs.bool()] });
export const EngineSession = new MoveStruct({ name: `${$moduleName}::EngineSession`, fields: {
        data: data_1.WalrusBlob
    } });
export const EngineSessionSetEvent = new MoveStruct({ name: `${$moduleName}::EngineSessionSetEvent`, fields: {
        recording_id: bcs.Address,
        session: EngineSession
    } });
export const EngineSessionUnsetEvent = new MoveStruct({ name: `${$moduleName}::EngineSessionUnsetEvent`, fields: {
        recording_id: bcs.Address
    } });
export interface NewArguments {
    data: TransactionArgument;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        data: TransactionArgument
    ];
}
/** Creates an engine session reference from an unencrypted Walrus blob. */
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_engine_session';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["data"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_engine_session',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DataArguments {
    self: TransactionArgument;
}
export interface DataOptions {
    package?: string;
    arguments: DataArguments | [
        self: TransactionArgument
    ];
}
/** Returns the unencrypted Walrus blob containing the engine session file. */
export function data(options: DataOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_engine_session';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_engine_session',
        function: 'data',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetEngineSessionArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    session: TransactionArgument;
}
export interface SetEngineSessionOptions {
    package?: string;
    arguments: SetEngineSessionArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        session: TransactionArgument
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Sets or replaces the recording's Miso Engine session file. */
export function setEngineSession(options: SetEngineSessionOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_engine_session';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "session"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_engine_session',
        function: 'set_engine_session',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UnsetEngineSessionArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface UnsetEngineSessionOptions {
    package?: string;
    arguments: UnsetEngineSessionArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Removes the recording's Miso Engine session file, if present. Idempotent. */
export function unsetEngineSession(options: UnsetEngineSessionOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_engine_session';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_engine_session',
        function: 'unset_engine_session',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface HasEngineSessionArguments {
    self: RawTransactionArgument<string>;
}
export interface HasEngineSessionOptions {
    package?: string;
    arguments: HasEngineSessionArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Whether a Miso Engine session file is attached to the recording. */
export function hasEngineSession(options: HasEngineSessionOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_engine_session';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_engine_session',
        function: 'has_engine_session',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface EngineSessionArguments {
    self: RawTransactionArgument<string>;
}
export interface EngineSessionOptions {
    package?: string;
    arguments: EngineSessionArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** The recording's Miso Engine session file. Aborts when none is attached. */
export function engineSession(options: EngineSessionOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_engine_session';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_engine_session',
        function: 'engine_session',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}