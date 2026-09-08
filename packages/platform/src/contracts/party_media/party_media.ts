/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Profile imagery for a party, stored as a single Walrus quilt.
 *
 * All of a party's images (avatar, header/cover, …) live together in one Walrus
 * quilt — batching them under a single storage reservation is markedly cheaper
 * than one blob each, which matters when the platform sponsors storage. Only the
 * quilt's blob id is held on-chain, as a `Media` dynamic field on the party's UID,
 * gated by the `PartyAdminCap`; views are permissionless.
 *
 * The chain is deliberately role-agnostic: which patch is the avatar vs the header
 * is a client convention (quilt patch _identifiers_, e.g. "avatar" / "header"),
 * derived off-chain — never stored here. Updating any image means re-storing the
 * quilt and calling `set_media` with the new id.
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/party_media::party_media';
export const MediaKey = new MoveTuple({ name: `${$moduleName}::MediaKey`, fields: [bcs.bool()] });
export const Media = new MoveStruct({ name: `${$moduleName}::Media`, fields: {
        /**
           * Walrus quilt blob id holding all of the party's images. Individual images are
           * quilt patches addressed by identifier ("avatar", "header", …); those roles are a
           * client convention, derived off-chain, not stored here.
           */
        quilt: bcs.u256()
    } });
export const MediaSetEvent = new MoveStruct({ name: `${$moduleName}::MediaSetEvent`, fields: {
        party_id: bcs.Address,
        quilt: bcs.u256()
    } });
export const MediaClearedEvent = new MoveStruct({ name: `${$moduleName}::MediaClearedEvent`, fields: {
        party_id: bcs.Address
    } });
export interface SetMediaArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    quilt: RawTransactionArgument<number | bigint>;
}
export interface SetMediaOptions {
    package?: string;
    arguments: SetMediaArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        quilt: RawTransactionArgument<number | bigint>
    ];
}
/** Sets (or replaces) the party's media quilt. Aborts on a zero id. */
export function setMedia(options: SetMediaOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_media';
    const argumentsTypes = [
        null,
        null,
        'u256'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "quilt"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_media',
        function: 'set_media',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ClearMediaArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface ClearMediaOptions {
    package?: string;
    arguments: ClearMediaArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
}
/** Removes the party's media. No-op if none is set. */
export function clearMedia(options: ClearMediaOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_media';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_media',
        function: 'clear_media',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasMediaArguments {
    self: RawTransactionArgument<string>;
}
export interface HasMediaOptions {
    package?: string;
    arguments: HasMediaArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Whether the party has media set. */
export function hasMedia(options: HasMediaOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_media';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_media',
        function: 'has_media',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface QuiltArguments {
    self: RawTransactionArgument<string>;
}
export interface QuiltOptions {
    package?: string;
    arguments: QuiltArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** The party's media quilt id, if set. */
export function quilt(options: QuiltOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_media';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_media',
        function: 'quilt',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}