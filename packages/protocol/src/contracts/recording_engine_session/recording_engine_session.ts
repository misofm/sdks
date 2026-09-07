/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * A recording administrator's pointer to the Miso Engine session for a recording:
 * the canonical Session V1 document plus every stem it plays.
 *
 * The Session V1 document references each source by the SHA-256 digest of its
 * canonical PCM (engine `STEM_IDENTITY_V1`) and carries no locator. Walrus serves
 * blobs by blob ID. `EngineSession` therefore records, next to the session blob,
 * one `Stem` per source pairing that digest with the standalone Walrus blob
 * holding its FLAC delivery object. A client reads one value and can resolve every
 * source the session names.
 *
 * Session and stems are one value and are replaced together: adding a source
 * changes the document, so a new document and a new stem set land in a single
 * `set_engine_session`. Stems are sorted by digest and unique, so the value has
 * exactly one canonical form for a given session.
 *
 * Every referenced blob is unencrypted; the constructors reject encrypted
 * confidentiality. This extension asserts only which blobs the recording
 * administrator chose. It does not prove storage availability, document validity,
 * that a stem decodes to its digest, or that the digests match the document's
 * sources. Publication tooling must perform those checks before attachment.
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as data_1 from './deps/ori/data.ts';
const $moduleName = '@local-pkg/recording_engine_session::recording_engine_session';
export const ExtensionKey = new MoveTuple({ name: `${$moduleName}::ExtensionKey`, fields: [bcs.bool()] });
export const Stem = new MoveStruct({ name: `${$moduleName}::Stem`, fields: {
        /**
           * SHA-256 digest of the stem's canonical PCM serialization (engine
           * `STEM_IDENTITY_V1`), 32 raw bytes in natural order. Equals the source's
           * `content` identity in the Session V1 document without its `sha256:` prefix.
           */
        digest: bcs.vector(bcs.u8()),
        /**
         * Unencrypted standalone Walrus blob holding the stem's FLAC delivery object,
         * which decodes to the PCM the digest commits to.
         */
        data: data_1.WalrusBlob
    } });
export const EngineSession = new MoveStruct({ name: `${$moduleName}::EngineSession`, fields: {
        /**
           * Unencrypted standalone Walrus blob holding the canonical Session V1 JSON
           * document, byte for byte as the engine emitted it.
           */
        data: data_1.WalrusBlob,
        /** Every stem the document's sources reference, sorted by digest, unique. */
        stems: bcs.vector(Stem)
    } });
export const EngineSessionSetEvent = new MoveStruct({ name: `${$moduleName}::EngineSessionSetEvent`, fields: {
        recording_id: bcs.Address,
        session: EngineSession
    } });
export const EngineSessionUnsetEvent = new MoveStruct({ name: `${$moduleName}::EngineSessionUnsetEvent`, fields: {
        recording_id: bcs.Address
    } });
export interface NewStemArguments {
    digest: RawTransactionArgument<Array<number>>;
    data: TransactionArgument;
}
export interface NewStemOptions {
    package?: string;
    arguments: NewStemArguments | [
        digest: RawTransactionArgument<Array<number>>,
        data: TransactionArgument
    ];
}
/** Creates a stem reference from a 32-byte PCM digest and an unencrypted blob. */
export function newStem(options: NewStemOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_engine_session';
    const argumentsTypes = [
        'vector<u8>',
        null
    ] satisfies (string | null)[];
    const parameterNames = ["digest", "data"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_engine_session',
        function: 'new_stem',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewArguments {
    data: TransactionArgument;
    stems: TransactionArgument;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        data: TransactionArgument,
        stems: TransactionArgument
    ];
}
/**
 * Creates an engine session from an unencrypted session blob and its stems.
 *
 * `stems` must be in strictly increasing digest order, which also forbids
 * duplicates. An empty vector is valid: a Session V1 document may declare no
 * sources.
 */
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_engine_session';
    const argumentsTypes = [
        null,
        'vector<null>'
    ] satisfies (string | null)[];
    const parameterNames = ["data", "stems"];
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
/** Returns the unencrypted Walrus blob containing the Session V1 document. */
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
export interface StemsArguments {
    self: TransactionArgument;
}
export interface StemsOptions {
    package?: string;
    arguments: StemsArguments | [
        self: TransactionArgument
    ];
}
/** Returns the session's stems, sorted by digest. */
export function stems(options: StemsOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_engine_session';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_engine_session',
        function: 'stems',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface StemDigestArguments {
    self: TransactionArgument;
}
export interface StemDigestOptions {
    package?: string;
    arguments: StemDigestArguments | [
        self: TransactionArgument
    ];
}
/** Returns a stem's 32-byte canonical PCM digest. */
export function stemDigest(options: StemDigestOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_engine_session';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_engine_session',
        function: 'stem_digest',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface StemDataArguments {
    self: TransactionArgument;
}
export interface StemDataOptions {
    package?: string;
    arguments: StemDataArguments | [
        self: TransactionArgument
    ];
}
/** Returns the unencrypted Walrus blob holding a stem's FLAC delivery object. */
export function stemData(options: StemDataOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_engine_session';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_engine_session',
        function: 'stem_data',
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
/** Sets or replaces the recording's Miso Engine session. */
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
/** Removes the recording's Miso Engine session, if present. Idempotent. */
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
/** Whether a Miso Engine session is attached to the recording. */
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
/** The recording's Miso Engine session. Aborts when none is attached. */
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