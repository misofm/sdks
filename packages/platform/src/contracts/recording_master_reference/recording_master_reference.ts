/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * A pointer to a recording's master audio — nothing more.
 *
 * The value is a bare `ori::data::WalrusBlob` reference. This extension makes no
 * claim about what the blob contains: not its codec, not its sample rate, not its
 * duration, not that it is even audio. The only assertion is that the holder of
 * the recording's admin cap says this blob is the master. Everything else is
 * client-side convention.
 *
 * That thinness is the point. Miso's attested path — the Nautilus-verified master
 * flow (`audio_ingester` producing a `audio::Audio`), deferred — carries channel
 * count, bit depth, sample rate, sample count and a PCM digest, and every one of
 * those is backed by a Nautilus enclave signature over the measured audio. Until
 * that path is running, stating the same fields _unverified_ would dress an
 * assertion up as a measurement. A pointer cannot be mistaken for a measurement.
 *
 * # This extension is a holdover
 *
 * It exists to carry the catalogue until enclave ingestion is ready, and it is
 * meant to be removed rather than grown. When a recording's master is ingested for
 * real, attach the attested master via the ingester's master flow and call
 * `unset_master_reference` here. The two never need to coexist, and this package
 * deliberately holds nothing the attested path cannot restate.
 *
 * Resist adding fields. Anything worth asserting about the audio is worth
 * attesting, and belongs in the ingested `Audio` rather than here.
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/recording_master_reference::recording_master_reference';
export const ExtensionKey = new MoveTuple({ name: `${$moduleName}::ExtensionKey`, fields: [bcs.bool()] });
export const RecordingMasterReferenceSetEvent = new MoveStruct({ name: `${$moduleName}::RecordingMasterReferenceSetEvent<phantom RecordingShare, phantom CompositionShare>`, fields: {
        recording_id: bcs.Address,
        composition_id: bcs.Address,
        had_master_reference: bcs.bool(),
        previous_blob_id: bcs.u256(),
        previous_is_encrypted: bcs.bool(),
        previous_sealed_dek_length: bcs.u64(),
        previous_sealed_dek_digest: bcs.vector(bcs.u8()),
        blob_id: bcs.u256(),
        is_encrypted: bcs.bool(),
        sealed_dek_length: bcs.u64(),
        sealed_dek_digest: bcs.vector(bcs.u8())
    } });
export const RecordingMasterReferenceClearedEvent = new MoveStruct({ name: `${$moduleName}::RecordingMasterReferenceClearedEvent<phantom RecordingShare, phantom CompositionShare>`, fields: {
        recording_id: bcs.Address,
        composition_id: bcs.Address,
        removed_blob_id: bcs.u256(),
        removed_is_encrypted: bcs.bool(),
        removed_sealed_dek_length: bcs.u64(),
        removed_sealed_dek_digest: bcs.vector(bcs.u8())
    } });
export interface SetMasterReferenceArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    reference: TransactionArgument;
}
export interface SetMasterReferenceOptions {
    package?: string;
    arguments: SetMasterReferenceArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        reference: TransactionArgument
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Sets (or replaces) the recording's master reference.
 *
 * The reference is a standalone blob by type. Encrypted blobs are accepted — a
 * sealed master is the expected shape once access control lands, and the reference
 * is the same either way.
 */
export function setMasterReference(options: SetMasterReferenceOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_master_reference';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "reference"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_master_reference',
        function: 'set_master_reference',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UnsetMasterReferenceArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface UnsetMasterReferenceOptions {
    package?: string;
    arguments: UnsetMasterReferenceArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Removes the master reference, if any. Idempotent.
 *
 * The intended use is migration: once an attested master is attached via the
 * Nautilus-verified master flow (deferred), this reference has nothing left to say
 * and should go.
 */
export function unsetMasterReference(options: UnsetMasterReferenceOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_master_reference';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_master_reference',
        function: 'unset_master_reference',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface HasMasterReferenceArguments {
    self: RawTransactionArgument<string>;
}
export interface HasMasterReferenceOptions {
    package?: string;
    arguments: HasMasterReferenceArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Whether a master reference is attached to this recording. */
export function hasMasterReference(options: HasMasterReferenceOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_master_reference';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_master_reference',
        function: 'has_master_reference',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface MasterReferenceArguments {
    self: RawTransactionArgument<string>;
}
export interface MasterReferenceOptions {
    package?: string;
    arguments: MasterReferenceArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** The recording's master reference. Aborts if none is attached. */
export function masterReference(options: MasterReferenceOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_master_reference';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_master_reference',
        function: 'master_reference',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}