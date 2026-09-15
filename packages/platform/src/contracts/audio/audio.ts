/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * An audio file with self-attested technical metadata — a standalone, wrapped
 * primitive that any protocol can embed (e.g. as a recording's master).
 *
 * ### Key Features:
 *
 * - Format (codec/container, e.g. `flac`) and PCM parameters (channels, bit depth,
 *   sample rate, samples)
 * - Walrus blob ID for storage reference
 * - Permissionless creation from caller-supplied metadata via `new`. Metadata is
 *   structurally validated; blob contents and PCM digests are not verified.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as data_1 from './deps/ori/data.ts';
const $moduleName = '@local-pkg/audio::audio';
export const Audio = new MoveStruct({ name: `${$moduleName}::Audio`, fields: {
        /**
           * Codec/container of the stored blob, as a bare lowercase short name (e.g. `flac`,
           * `wav`, `opus`). No `audio/` prefix — the type is already audio.
           */
        format: bcs.string(),
        /** Number of audio channels (1 = mono, 2 = stereo). */
        channels: bcs.u8(),
        /** Bits per sample (8, 16, 24, or 32). */
        bit_depth: bcs.u8(),
        /**
         * Supported integer PCM sample rate in hertz (44.1/48 kHz families through 384
         * kHz).
         */
        sample_rate_hz: bcs.u32(),
        /** Total number of PCM samples in the audio. */
        samples: bcs.u64(),
        /**
         * Unkeyed BLAKE3 digest of the canonical decoded PCM (codec-independent content
         * fingerprint), using the default 32-byte output.
         */
        pcm_digest: bcs.vector(bcs.u8()),
        /** Standalone Walrus blob reference for the audio. */
        data: data_1.WalrusBlob
    } });
export interface NewArguments {
    format: RawTransactionArgument<string>;
    channels: RawTransactionArgument<number>;
    bitDepth: RawTransactionArgument<number>;
    sampleRateHz: RawTransactionArgument<number>;
    samples: RawTransactionArgument<number | bigint>;
    pcmDigest: RawTransactionArgument<Array<number>>;
    data: TransactionArgument;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        format: RawTransactionArgument<string>,
        channels: RawTransactionArgument<number>,
        bitDepth: RawTransactionArgument<number>,
        sampleRateHz: RawTransactionArgument<number>,
        samples: RawTransactionArgument<number | bigint>,
        pcmDigest: RawTransactionArgument<Array<number>>,
        data: TransactionArgument
    ];
}
/**
 * Creates audio from the caller's self-attested metadata. Validates metadata shape
 * and numeric bounds, without verifying the underlying bytes.
 */
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/audio';
    const argumentsTypes = [
        '0x1::string::String',
        'u8',
        'u8',
        'u32',
        'u64',
        'vector<u8>',
        null
    ] satisfies (string | null)[];
    const parameterNames = ["format", "channels", "bitDepth", "sampleRateHz", "samples", "pcmDigest", "data"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'audio',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ChannelsArguments {
    self: TransactionArgument;
}
export interface ChannelsOptions {
    package?: string;
    arguments: ChannelsArguments | [
        self: TransactionArgument
    ];
}
/** Returns the number of audio channels (1 = mono, 2 = stereo). */
export function channels(options: ChannelsOptions) {
    const packageAddress = options.package ?? '@local-pkg/audio';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'audio',
        function: 'channels',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface BitDepthArguments {
    self: TransactionArgument;
}
export interface BitDepthOptions {
    package?: string;
    arguments: BitDepthArguments | [
        self: TransactionArgument
    ];
}
/** Returns the bit depth of the audio (8, 16, 24, or 32 bits). */
export function bitDepth(options: BitDepthOptions) {
    const packageAddress = options.package ?? '@local-pkg/audio';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'audio',
        function: 'bit_depth',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SampleRateHzArguments {
    self: TransactionArgument;
}
export interface SampleRateHzOptions {
    package?: string;
    arguments: SampleRateHzArguments | [
        self: TransactionArgument
    ];
}
/** Returns the sample rate in Hz. */
export function sampleRateHz(options: SampleRateHzOptions) {
    const packageAddress = options.package ?? '@local-pkg/audio';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'audio',
        function: 'sample_rate_hz',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SamplesArguments {
    self: TransactionArgument;
}
export interface SamplesOptions {
    package?: string;
    arguments: SamplesArguments | [
        self: TransactionArgument
    ];
}
/** Returns the total number of samples in the audio. */
export function samples(options: SamplesOptions) {
    const packageAddress = options.package ?? '@local-pkg/audio';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'audio',
        function: 'samples',
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
/** Returns a reference to the standalone Walrus blob. */
export function data(options: DataOptions) {
    const packageAddress = options.package ?? '@local-pkg/audio';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'audio',
        function: 'data',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DurationMsArguments {
    self: TransactionArgument;
}
export interface DurationMsOptions {
    package?: string;
    arguments: DurationMsArguments | [
        self: TransactionArgument
    ];
}
/**
 * Returns the duration of the audio in milliseconds (truncated). Uses a u128
 * intermediate product to avoid overflow, rounding down. All supported sample
 * rates keep the result within u64 for any sample count.
 */
export function durationMs(options: DurationMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/audio';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'audio',
        function: 'duration_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FormatArguments {
    self: TransactionArgument;
}
export interface FormatOptions {
    package?: string;
    arguments: FormatArguments | [
        self: TransactionArgument
    ];
}
/** Returns the codec/container format of the stored blob (e.g. `flac`). */
export function format(options: FormatOptions) {
    const packageAddress = options.package ?? '@local-pkg/audio';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'audio',
        function: 'format',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PcmDigestArguments {
    self: TransactionArgument;
}
export interface PcmDigestOptions {
    package?: string;
    arguments: PcmDigestArguments | [
        self: TransactionArgument
    ];
}
/** Returns the `BLAKE3` digest of the canonical decoded PCM (32 bytes). */
export function pcmDigest(options: PcmDigestOptions) {
    const packageAddress = options.package ?? '@local-pkg/audio';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'audio',
        function: 'pcm_digest',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}