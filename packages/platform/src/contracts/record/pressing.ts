/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * One edition of a Miso release and the complete lifecycle boundary for its
 * Records.
 *
 * A release may have many Pressings, one at each `PressingKey(edition)`. Each
 * Pressing owns an independent Record sequence, an optional immutable maximum
 * supply, and the set of distributor witness types allowed to mint from that
 * edition. Distributors own delivery mechanics; the Pressing owns issuance.
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs, type BcsType } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction } from '@mysten/sui/transactions';
import * as vec_set from './deps/sui/vec_set.ts';
import * as type_name from './deps/std/type_name.ts';
const $moduleName = '@local-pkg/record::pressing';
export const PressingKey = new MoveTuple({ name: `${$moduleName}::PressingKey`, fields: [bcs.u16()] });
export const PressingAdminCapKey = new MoveTuple({ name: `${$moduleName}::PressingAdminCapKey`, fields: [bcs.bool()] });
export const Pressing = new MoveStruct({ name: `${$moduleName}::Pressing`, fields: {
        /** The Pressing's derived object identity. */
        id: bcs.Address,
        /** The parent release represented by this edition. */
        release_id: bcs.Address,
        /** The edition number. */
        edition: bcs.u16(),
        /** The number of Records issued by this Pressing. */
        supply: bcs.u32(),
        /** The immutable supply ceiling, or `none()` for an uncapped Pressing. */
        max_supply: bcs.option(bcs.u32()),
        /** The defining types of distributors currently permitted to mint. */
        distributors: vec_set.VecSet(type_name.TypeName)
    } });
export const PressingAdminCap = new MoveStruct({ name: `${$moduleName}::PressingAdminCap`, fields: {
        /** The capability's derived object identity. */
        id: bcs.Address,
        /** The Pressing controlled by this capability. */
        pressing_id: bcs.Address
    } });
export const PressingCreatedEvent = new MoveStruct({ name: `${$moduleName}::PressingCreatedEvent`, fields: {
        /** The newly created Pressing. */
        pressing_id: bcs.Address,
        /** The parent release. */
        release_id: bcs.Address,
        /** The Pressing's edition number. */
        edition: bcs.u16(),
        /** The immutable supply ceiling, if one exists. */
        max_supply: bcs.option(bcs.u32())
    } });
export const DistributorAuthorizedEvent = new MoveStruct({ name: `${$moduleName}::DistributorAuthorizedEvent`, fields: {
        /** The configured Pressing. */
        pressing_id: bcs.Address,
        /** The authorized distributor's defining type. */
        distributor: type_name.TypeName
    } });
export const DistributorRevokedEvent = new MoveStruct({ name: `${$moduleName}::DistributorRevokedEvent`, fields: {
        /** The configured Pressing. */
        pressing_id: bcs.Address,
        /** The revoked distributor's defining type. */
        distributor: type_name.TypeName
    } });
export const RecordPurchasedEvent = new MoveStruct({ name: `${$moduleName}::RecordPurchasedEvent`, fields: {
        /** The purchased Record. */
        record_id: bcs.Address,
        /** The release represented by the Record. */
        release_id: bcs.Address,
        /** The Pressing that issued the Record. */
        pressing_id: bcs.Address,
        /** The edition represented by the Pressing. */
        edition: bcs.u16(),
        /** The Record's number within its edition. */
        number: bcs.u32(),
        /** The defining type of the purchase currency. */
        purchase_currency: type_name.TypeName,
        /** The amount paid for the Record. */
        purchase_price: bcs.u64(),
        /** The transaction sender who purchased the Record. */
        purchased_by: bcs.Address,
        /** The purchase time in Unix milliseconds from Sui's Clock. */
        purchased_timestamp_ms: bcs.u64(),
        /** The defining type of the distributor that authorized the mint. */
        distributor: type_name.TypeName
    } });
export interface NewArguments {
    release: RawTransactionArgument<string>;
    releaseCap: RawTransactionArgument<string>;
    edition: RawTransactionArgument<number>;
    maxSupply: RawTransactionArgument<number | null>;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        release: RawTransactionArgument<string>,
        releaseCap: RawTransactionArgument<string>,
        edition: RawTransactionArgument<number>,
        maxSupply: RawTransactionArgument<number | null>
    ];
}
/**
 * Create one edition's Pressing under its Release.
 *
 * `max_supply = none()` creates an uncapped edition; `some(quantity)` creates a
 * permanently capped edition. The Pressing and its admin capability are returned
 * for composition before the caller shares the Pressing and custodies the
 * capability.
 */
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null,
        null,
        'u16',
        '0x1::option::Option<u32>'
    ] satisfies (string | null)[];
    const parameterNames = ["release", "releaseCap", "edition", "maxSupply"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pressing',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ShareArguments {
    self: RawTransactionArgument<string>;
}
export interface ShareOptions {
    package?: string;
    arguments: ShareArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Share a newly created Pressing after configuring its distributors. */
export function share(options: ShareOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pressing',
        function: 'share',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AuthorizeDistributorArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface AuthorizeDistributorOptions {
    package?: string;
    arguments: AuthorizeDistributorArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Authorize distributor witness type `Distributor` for this edition. Reauthorizing
 * an existing distributor is a no-op.
 */
export function authorizeDistributor(options: AuthorizeDistributorOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pressing',
        function: 'authorize_distributor',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RevokeDistributorArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface RevokeDistributorOptions {
    package?: string;
    arguments: RevokeDistributorArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Revoke distributor witness type `Distributor` for this edition. Revoking a
 * missing distributor is a no-op.
 */
export function revokeDistributor(options: RevokeDistributorOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pressing',
        function: 'revoke_distributor',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface MintArguments<Distributor extends BcsType<any>> {
    self: RawTransactionArgument<string>;
    Distributor: RawTransactionArgument<Distributor>;
    purchasePrice: RawTransactionArgument<number | bigint>;
}
export interface MintOptions<Distributor extends BcsType<any>> {
    package?: string;
    arguments: MintArguments<Distributor> | [
        self: RawTransactionArgument<string>,
        Distributor: RawTransactionArgument<Distributor>,
        purchasePrice: RawTransactionArgument<number | bigint>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Purchase the next Record by consuming an authorized distributor witness.
 *
 * The Record number is allocated here and cannot be selected by the caller. The
 * returned Record remains composable: the distributor decides whether to transfer,
 * wrap, freeze, or otherwise deliver it.
 */
export function mint<Distributor extends BcsType<any>>(options: MintOptions<Distributor>) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null,
        `${options.typeArguments[0]}`,
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "Distributor", "purchasePrice"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pressing',
        function: 'mint',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UidArguments {
    self: RawTransactionArgument<string>;
}
export interface UidOptions {
    package?: string;
    arguments: UidArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Borrow the Pressing UID for read-only extensions. */
export function uid(options: UidOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pressing',
        function: 'uid',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface UidMutArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface UidMutOptions {
    package?: string;
    arguments: UidMutArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
}
/**
 * Mutably access the Pressing UID for cap-authorized extensions, including
 * distributor-owned objects derived from this edition.
 */
export function uidMut(options: UidMutOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pressing',
        function: 'uid_mut',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReleaseIdArguments {
    self: RawTransactionArgument<string>;
}
export interface ReleaseIdOptions {
    package?: string;
    arguments: ReleaseIdArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Return the release represented by this Pressing. */
export function releaseId(options: ReleaseIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pressing',
        function: 'release_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EditionArguments {
    self: RawTransactionArgument<string>;
}
export interface EditionOptions {
    package?: string;
    arguments: EditionArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Return this Pressing's edition number. */
export function edition(options: EditionOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pressing',
        function: 'edition',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SupplyArguments {
    self: RawTransactionArgument<string>;
}
export interface SupplyOptions {
    package?: string;
    arguments: SupplyArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Return the number of Records issued by this Pressing. */
export function supply(options: SupplyOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pressing',
        function: 'supply',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface MaxSupplyArguments {
    self: RawTransactionArgument<string>;
}
export interface MaxSupplyOptions {
    package?: string;
    arguments: MaxSupplyArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Return the immutable supply ceiling, if one exists. */
export function maxSupply(options: MaxSupplyOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pressing',
        function: 'max_supply',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DistributorsArguments {
    self: RawTransactionArgument<string>;
}
export interface DistributorsOptions {
    package?: string;
    arguments: DistributorsArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Borrow the defining types of all currently authorized distributors. */
export function distributors(options: DistributorsOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pressing',
        function: 'distributors',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsDistributorAuthorizedArguments {
    self: RawTransactionArgument<string>;
}
export interface IsDistributorAuthorizedOptions {
    package?: string;
    arguments: IsDistributorAuthorizedArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Return whether `Distributor` is currently authorized to mint. */
export function isDistributorAuthorized(options: IsDistributorAuthorizedOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pressing',
        function: 'is_distributor_authorized',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PressingIdArguments {
    cap: RawTransactionArgument<string>;
}
export interface PressingIdOptions {
    package?: string;
    arguments: PressingIdArguments | [
        cap: RawTransactionArgument<string>
    ];
}
/** Return the Pressing controlled by this capability. */
export function pressingId(options: PressingIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pressing',
        function: 'pressing_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeriveAddressArguments {
    releaseId: RawTransactionArgument<string>;
    edition: RawTransactionArgument<number>;
}
export interface DeriveAddressOptions {
    package?: string;
    arguments: DeriveAddressArguments | [
        releaseId: RawTransactionArgument<string>,
        edition: RawTransactionArgument<number>
    ];
}
/** Derive an edition's Pressing address from its Release ID. */
export function deriveAddress(options: DeriveAddressOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        '0x2::object::ID',
        'u16'
    ] satisfies (string | null)[];
    const parameterNames = ["releaseId", "edition"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pressing',
        function: 'derive_address',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeriveAdminCapAddressArguments {
    pressingId: RawTransactionArgument<string>;
}
export interface DeriveAdminCapAddressOptions {
    package?: string;
    arguments: DeriveAdminCapAddressArguments | [
        pressingId: RawTransactionArgument<string>
    ];
}
/** Derive a Pressing's admin capability address. */
export function deriveAdminCapAddress(options: DeriveAdminCapAddressOptions) {
    const packageAddress = options.package ?? '@local-pkg/record';
    const argumentsTypes = [
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["pressingId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pressing',
        function: 'derive_admin_cap_address',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}