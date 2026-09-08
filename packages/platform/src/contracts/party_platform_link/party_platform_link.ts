/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Attaches `PlatformLink<Data>` records to a `Party` — one independent link per
 * platform type (`set_link<XData>`, `set_link<SpotifyData>`, …), each in its own
 * dynamic field keyed by `Data`. Adding one platform never rewrites another's, and
 * a new platform needs no change here.
 *
 * This one module serves every platform (social, music, anything) because it is
 * generic over `Data`; the payload types live in their own small packages
 * (`party_social`, `party_music`, …). All writes are gated by the `PartyAdminCap`
 * via `uid_mut`; views are permissionless. Events are phantom-typed per platform
 * so an indexer can see which platform changed — dynamic-field mutations are not
 * otherwise observable. These events carry no payload by convention: they are
 * change signals, and the indexer re-reads the field. (Small, stable payloads are
 * the exception elsewhere — `party_media`'s quilt id or a role or tag string.)
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/party_platform_link::party_platform_link';
export const LinkSetEvent = new MoveStruct({ name: `${$moduleName}::LinkSetEvent<phantom Data>`, fields: {
        party_id: bcs.Address
    } });
export const LinkClearedEvent = new MoveStruct({ name: `${$moduleName}::LinkClearedEvent<phantom Data>`, fields: {
        party_id: bcs.Address
    } });
export interface SetLinkArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    link: TransactionArgument;
}
export interface SetLinkOptions {
    package?: string;
    arguments: SetLinkArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        link: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/** Sets (or replaces) a platform's link on the party. */
export function setLink(options: SetLinkOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_platform_link';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "link"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_platform_link',
        function: 'set_link',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ClearLinkArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface ClearLinkOptions {
    package?: string;
    arguments: ClearLinkArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Clears a platform's link from the party. No-op if unset. */
export function clearLink(options: ClearLinkOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_platform_link';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_platform_link',
        function: 'clear_link',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface HasLinkArguments {
    self: RawTransactionArgument<string>;
}
export interface HasLinkOptions {
    package?: string;
    arguments: HasLinkArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Whether the party has a link for this platform. */
export function hasLink(options: HasLinkOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_platform_link';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_platform_link',
        function: 'has_link',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface LinkArguments {
    self: RawTransactionArgument<string>;
}
export interface LinkOptions {
    package?: string;
    arguments: LinkArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** The party's link for this platform, if set. */
export function link(options: LinkOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_platform_link';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_platform_link',
        function: 'link',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}