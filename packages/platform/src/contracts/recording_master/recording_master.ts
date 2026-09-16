/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * A recording's self-attested master audio, stored as a single `Audio` value.
 * Writes require its matching admin cap; reads are permissionless. Metadata is
 * structurally validated by `audio::new`, not externally verified.
 * Nautilus-attested audio belongs in a separate future package.
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as audio from './deps/audio/audio.ts';
const $moduleName = '@local-pkg/recording_master::recording_master';
export const ExtensionKey = new MoveTuple({ name: `${$moduleName}::ExtensionKey`, fields: [bcs.bool()] });
export const MasterSetEvent = new MoveStruct({ name: `${$moduleName}::MasterSetEvent<phantom RecordingShare, phantom CompositionShare>`, fields: {
        recording_id: bcs.Address,
        master: audio.Audio
    } });
export const MasterUnsetEvent = new MoveStruct({ name: `${$moduleName}::MasterUnsetEvent<phantom RecordingShare, phantom CompositionShare>`, fields: {
        recording_id: bcs.Address
    } });
export interface SetMasterArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    master: TransactionArgument;
}
export interface SetMasterOptions {
    package?: string;
    arguments: SetMasterArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        master: TransactionArgument
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Sets or replaces the entire master, including all audio metadata and its blob
 * ID.
 */
export function setMaster(options: SetMasterOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_master';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "master"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_master',
        function: 'set_master',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UnsetMasterArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface UnsetMasterOptions {
    package?: string;
    arguments: UnsetMasterArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Removes the master, if any. Idempotent; emits only when a value was removed. */
export function unsetMaster(options: UnsetMasterOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_master';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_master',
        function: 'unset_master',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface HasMasterArguments {
    self: RawTransactionArgument<string>;
}
export interface HasMasterOptions {
    package?: string;
    arguments: HasMasterArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Whether a master is attached to this recording. */
export function hasMaster(options: HasMasterOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_master';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_master',
        function: 'has_master',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface MasterArguments {
    self: RawTransactionArgument<string>;
}
export interface MasterOptions {
    package?: string;
    arguments: MasterArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** The recording's master audio. Aborts if none is attached. */
export function master(options: MasterOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_master';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_master',
        function: 'master',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}