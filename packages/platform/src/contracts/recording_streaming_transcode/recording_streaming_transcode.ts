/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * A recording administrator's pointer to the complete Walrus Quilt containing the
 * recording's streaming transcodes.
 *
 * The domain-specific `StreamingTranscode` wraps an `ori::data::WalrusQuilt`, not
 * a standalone blob or a single Quilt patch. Clients combine its content-addressed
 * Quilt ID with the package's conventional item identifiers to locate the master
 * HLS playlist, rendition playlists, initialization maps, and media segments.
 *
 * This extension asserts only which Quilt the recording administrator chose. It
 * does not prove storage availability, media conformance, or successful playback.
 * Those checks belong in the publication workflow before attachment.
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as data from './deps/ori/data.ts';
const $moduleName = '@local-pkg/recording_streaming_transcode::recording_streaming_transcode';
export const ExtensionKey = new MoveTuple({ name: `${$moduleName}::ExtensionKey`, fields: [bcs.bool()] });
export const StreamingTranscode = new MoveStruct({ name: `${$moduleName}::StreamingTranscode`, fields: {
        quilt: data.WalrusQuilt
    } });
export const StreamingTranscodeSetEvent = new MoveStruct({ name: `${$moduleName}::StreamingTranscodeSetEvent`, fields: {
        recording_id: bcs.Address,
        transcode: StreamingTranscode
    } });
export const StreamingTranscodeUnsetEvent = new MoveStruct({ name: `${$moduleName}::StreamingTranscodeUnsetEvent`, fields: {
        recording_id: bcs.Address
    } });
export interface NewArguments {
    quilt: TransactionArgument;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        quilt: TransactionArgument
    ];
}
/** Creates a streaming transcode reference from a complete Walrus Quilt. */
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_streaming_transcode';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["quilt"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_streaming_transcode',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface QuiltArguments {
    self: TransactionArgument;
}
export interface QuiltOptions {
    package?: string;
    arguments: QuiltArguments | [
        self: TransactionArgument
    ];
}
/** Returns the complete Walrus Quilt containing the streaming package. */
export function quilt(options: QuiltOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_streaming_transcode';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_streaming_transcode',
        function: 'quilt',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetStreamingTranscodeArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    transcode: TransactionArgument;
}
export interface SetStreamingTranscodeOptions {
    package?: string;
    arguments: SetStreamingTranscodeArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        transcode: TransactionArgument
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Sets or replaces the recording's streaming transcode reference. */
export function setStreamingTranscode(options: SetStreamingTranscodeOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_streaming_transcode';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "transcode"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_streaming_transcode',
        function: 'set_streaming_transcode',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UnsetStreamingTranscodeArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface UnsetStreamingTranscodeOptions {
    package?: string;
    arguments: UnsetStreamingTranscodeArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Removes the recording's streaming transcode reference, if present. Idempotent. */
export function unsetStreamingTranscode(options: UnsetStreamingTranscodeOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_streaming_transcode';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_streaming_transcode',
        function: 'unset_streaming_transcode',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface HasStreamingTranscodeArguments {
    self: RawTransactionArgument<string>;
}
export interface HasStreamingTranscodeOptions {
    package?: string;
    arguments: HasStreamingTranscodeArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Whether a streaming transcode reference is attached to the recording. */
export function hasStreamingTranscode(options: HasStreamingTranscodeOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_streaming_transcode';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_streaming_transcode',
        function: 'has_streaming_transcode',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface StreamingTranscodeArguments {
    self: RawTransactionArgument<string>;
}
export interface StreamingTranscodeOptions {
    package?: string;
    arguments: StreamingTranscodeArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** The recording's streaming transcode reference. Aborts when none is attached. */
export function streamingTranscode(options: StreamingTranscodeOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_streaming_transcode';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_streaming_transcode',
        function: 'streaming_transcode',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}