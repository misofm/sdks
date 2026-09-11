/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * `PlatformLink<Data>` — a typed link to an entity on one external platform: a
 * streaming service (Spotify, Bandcamp), a social network (X, Instagram), or any
 * other site.
 *
 * A protocol-agnostic primitive: it knows nothing about any specific platform, nor
 * about any consumer object (a `Party`, a `Release`, …). It is a generic wrapper
 * around a `Data` payload plus the machinery to store exactly one such link, by
 * type, as a dynamic field on any object's `UID`.
 *
 * `Data` is the platform-specific native identifier(s) — an Instagram handle, a
 * Spotify artist id, a Bandcamp subdomain, etc. Each platform defines its own
 * `Data` type in its own small package, so adding a platform is a new type, never
 * a change here. URLs are never stored: a client rebuilds the public URL from the
 * `Data` it reads back, so a platform reshaping its URLs needs no on-chain change.
 *
 * Storage is keyed by `PlatformLinkKey<Data>`, whose `phantom Data` makes
 * `PlatformLinkKey<InstagramData>` and `PlatformLinkKey<SpotifyData>` distinct
 * keys — so each platform occupies its own independent field on the same `UID`,
 * and a new platform can be added to a record without touching the others.
 */

import { type BcsType, bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { MoveStruct, MoveTuple, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/platform_link::platform_link';
/**
 * A link to an entity on one platform. `Data` carries that platform's native
 * identifier(s); the public URL is rebuilt from it client-side.
 */
export function PlatformLink<Data extends BcsType<any>>(...typeParameters: [
    Data
]) {
    return new MoveStruct({ name: `${$moduleName}::PlatformLink<${typeParameters[0].name as Data['name']}>`, fields: {
            data: typeParameters[0]
        } });
}
export const PlatformLinkKey = new MoveTuple({ name: `${$moduleName}::PlatformLinkKey<phantom Data>`, fields: [bcs.bool()] });
export const PlatformLinkSetEvent = new MoveStruct({ name: `${$moduleName}::PlatformLinkSetEvent<phantom Data>`, fields: {
        parent_id: bcs.Address,
        data_type: bcs.vector(bcs.u8()),
        existed_before: bcs.bool(),
        exists_after: bcs.bool(),
        previous_bcs_length: bcs.u64(),
        previous_bcs_hash: bcs.vector(bcs.u8()),
        data_bcs_length: bcs.u64(),
        data_bcs_hash: bcs.vector(bcs.u8())
    } });
export const PlatformLinkRemovedEvent = new MoveStruct({ name: `${$moduleName}::PlatformLinkRemovedEvent<phantom Data>`, fields: {
        parent_id: bcs.Address,
        data_type: bcs.vector(bcs.u8()),
        existed_before: bcs.bool(),
        exists_after: bcs.bool(),
        removed_bcs_length: bcs.u64(),
        removed_bcs_hash: bcs.vector(bcs.u8())
    } });
export interface MaxIdentifierLengthOptions {
    package?: string;
    arguments?: [
    ];
}
/**
 * Maximum length of a platform identifier — a handle, username, id, or subdomain —
 * in bytes.
 */
export function maxIdentifierLength(options: MaxIdentifierLengthOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/platform_link';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform_link',
        function: 'max_identifier_length',
    });
}
export interface MaxUrlLengthOptions {
    package?: string;
    arguments?: [
    ];
}
/**
 * Maximum length of a stored URL in bytes, for payloads whose URL is the identity
 * (no reconstructable handle).
 */
export function maxUrlLength(options: MaxUrlLengthOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/platform_link';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform_link',
        function: 'max_url_length',
    });
}
export interface NewArguments<Data extends BcsType<any>> {
    data: RawTransactionArgument<Data>;
}
export interface NewOptions<Data extends BcsType<any>> {
    package?: string;
    arguments: NewArguments<Data> | [
        data: RawTransactionArgument<Data>
    ];
    typeArguments: [
        string
    ];
}
/** Wraps a platform-specific payload into a link. */
export function _new<Data extends BcsType<any>>(options: NewOptions<Data>) {
    const packageAddress = options.package ?? '@local-pkg/platform_link';
    const argumentsTypes = [
        `${options.typeArguments[0]}`
    ] satisfies (string | null)[];
    const parameterNames = ["data"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform_link',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
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
    typeArguments: [
        string
    ];
}
/** The wrapped platform-specific payload. */
export function data(options: DataOptions) {
    const packageAddress = options.package ?? '@local-pkg/platform_link';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform_link',
        function: 'data',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface Exists_Arguments {
    uid: RawTransactionArgument<string>;
}
export interface Exists_Options {
    package?: string;
    arguments: Exists_Arguments | [
        uid: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Whether a `PlatformLink<Data>` is stored under `uid`. */
export function exists_(options: Exists_Options) {
    const packageAddress = options.package ?? '@local-pkg/platform_link';
    const argumentsTypes = [
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["uid"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform_link',
        function: 'exists_',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface SetArguments {
    uid: RawTransactionArgument<string>;
    link: TransactionArgument;
}
export interface SetOptions {
    package?: string;
    arguments: SetArguments | [
        uid: RawTransactionArgument<string>,
        link: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/**
 * Sets the `PlatformLink<Data>` under `uid`, replacing any existing one. Emits
 * `PlatformLinkSetEvent<Data>` with bounded summaries of the previous and new
 * payloads. An equal replacement still emits an event.
 */
export function set(options: SetOptions) {
    const packageAddress = options.package ?? '@local-pkg/platform_link';
    const argumentsTypes = [
        '0x2::object::ID',
        null
    ] satisfies (string | null)[];
    const parameterNames = ["uid", "link"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform_link',
        function: 'set',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface GetArguments {
    uid: RawTransactionArgument<string>;
}
export interface GetOptions {
    package?: string;
    arguments: GetArguments | [
        uid: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** The stored `PlatformLink<Data>`, or `none` if absent. */
export function get(options: GetOptions) {
    const packageAddress = options.package ?? '@local-pkg/platform_link';
    const argumentsTypes = [
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["uid"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform_link',
        function: 'get',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface BorrowArguments {
    uid: RawTransactionArgument<string>;
}
export interface BorrowOptions {
    package?: string;
    arguments: BorrowArguments | [
        uid: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Borrows the stored link. Aborts if none is stored. */
export function borrow(options: BorrowOptions) {
    const packageAddress = options.package ?? '@local-pkg/platform_link';
    const argumentsTypes = [
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["uid"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform_link',
        function: 'borrow',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RemoveArguments {
    uid: RawTransactionArgument<string>;
}
export interface RemoveOptions {
    package?: string;
    arguments: RemoveArguments | [
        uid: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Removes and returns the stored link. Aborts if none is stored. Emits
 * `PlatformLinkRemovedEvent<Data>` for the removed payload.
 */
export function remove(options: RemoveOptions) {
    const packageAddress = options.package ?? '@local-pkg/platform_link';
    const argumentsTypes = [
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["uid"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform_link',
        function: 'remove',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ClearArguments {
    uid: RawTransactionArgument<string>;
}
export interface ClearOptions {
    package?: string;
    arguments: ClearArguments | [
        uid: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Removes the stored link if present, discarding it. No-op if absent. */
export function clear(options: ClearOptions) {
    const packageAddress = options.package ?? '@local-pkg/platform_link';
    const argumentsTypes = [
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["uid"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform_link',
        function: 'clear',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}