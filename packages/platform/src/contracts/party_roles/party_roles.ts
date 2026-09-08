/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Artist-type roles for a party — what kind of act this is (artist, producer, DJ,
 * band, label, …). A party can hold several.
 *
 * `ArtistRole` is a closed enum with a `Custom` escape hatch, mirroring
 * `composition_party_role`: canonical variants give the frontend a fixed,
 * typo-free set to render icons for, while `Custom(name)` covers anything else.
 * The set mechanics — storage, duplicate and capacity checks, field reclamation —
 * live in the shared `typed_set` primitive; this package keeps the role type, name
 * validation, the capacity, and the typed events. Duplicate / not-present /
 * over-max aborts come from `typed_set` with its own error codes. Gated by the
 * `PartyAdminCap`; views are permissionless.
 */

import { MoveTuple, MoveStruct, MoveEnum, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/party_roles::party_roles';
export const RolesKey = new MoveTuple({ name: `${$moduleName}::RolesKey`, fields: [bcs.bool()] });
export const RoleAddedEvent = new MoveStruct({ name: `${$moduleName}::RoleAddedEvent`, fields: {
        party_id: bcs.Address,
        role: bcs.string()
    } });
export const RoleRemovedEvent = new MoveStruct({ name: `${$moduleName}::RoleRemovedEvent`, fields: {
        party_id: bcs.Address,
        role: bcs.string()
    } });
export const RolesClearedEvent = new MoveStruct({ name: `${$moduleName}::RolesClearedEvent`, fields: {
        party_id: bcs.Address
    } });
/** The kind of act a party represents. Closed enum + `Custom` escape hatch. */
export const ArtistRole = new MoveEnum({ name: `${$moduleName}::ArtistRole`, fields: {
        Artist: null,
        Producer: null,
        Dj: null,
        Composer: null,
        Songwriter: null,
        Band: null,
        Label: null,
        Collective: null,
        /**
         * A user-defined role not covered by a canonical variant (validated). Prefer a
         * canonical variant when one fits.
         */
        Custom: bcs.string()
    } });
export interface ArtistOptions {
    package?: string;
    arguments?: [
    ];
}
export function artist(options: ArtistOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/party_roles';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_roles',
        function: 'artist',
    });
}
export interface ProducerOptions {
    package?: string;
    arguments?: [
    ];
}
export function producer(options: ProducerOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/party_roles';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_roles',
        function: 'producer',
    });
}
export interface DjOptions {
    package?: string;
    arguments?: [
    ];
}
export function dj(options: DjOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/party_roles';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_roles',
        function: 'dj',
    });
}
export interface ComposerOptions {
    package?: string;
    arguments?: [
    ];
}
export function composer(options: ComposerOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/party_roles';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_roles',
        function: 'composer',
    });
}
export interface SongwriterOptions {
    package?: string;
    arguments?: [
    ];
}
export function songwriter(options: SongwriterOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/party_roles';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_roles',
        function: 'songwriter',
    });
}
export interface BandOptions {
    package?: string;
    arguments?: [
    ];
}
export function band(options: BandOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/party_roles';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_roles',
        function: 'band',
    });
}
export interface LabelOptions {
    package?: string;
    arguments?: [
    ];
}
export function label(options: LabelOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/party_roles';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_roles',
        function: 'label',
    });
}
export interface CollectiveOptions {
    package?: string;
    arguments?: [
    ];
}
export function collective(options: CollectiveOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/party_roles';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_roles',
        function: 'collective',
    });
}
export interface CustomArguments {
    name: RawTransactionArgument<string>;
}
export interface CustomOptions {
    package?: string;
    arguments: CustomArguments | [
        name: RawTransactionArgument<string>
    ];
}
/** Builds a custom role. Aborts if empty or too long. */
export function custom(options: CustomOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_roles';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["name"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_roles',
        function: 'custom',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RoleNameArguments {
    self: TransactionArgument;
}
export interface RoleNameOptions {
    package?: string;
    arguments: RoleNameArguments | [
        self: TransactionArgument
    ];
}
/** The canonical name of a role (its own string for `Custom`). */
export function roleName(options: RoleNameOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_roles';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_roles',
        function: 'role_name',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AddRoleArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    role: TransactionArgument;
}
export interface AddRoleOptions {
    package?: string;
    arguments: AddRoleArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        role: TransactionArgument
    ];
}
/**
 * Adds a role to the party. Aborts in `typed_set` if already held or the max is
 * reached.
 */
export function addRole(options: AddRoleOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_roles';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "role"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_roles',
        function: 'add_role',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RemoveRoleArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    role: TransactionArgument;
}
export interface RemoveRoleOptions {
    package?: string;
    arguments: RemoveRoleArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        role: TransactionArgument
    ];
}
/**
 * Removes a role from the party. Aborts in `typed_set` if not held. The whole
 * field is dropped when the last role leaves.
 */
export function removeRole(options: RemoveRoleOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_roles';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "role"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_roles',
        function: 'remove_role',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ClearRolesArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface ClearRolesOptions {
    package?: string;
    arguments: ClearRolesArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
}
/** Removes the party's entire role set. No-op if none is set. */
export function clearRoles(options: ClearRolesOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_roles';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_roles',
        function: 'clear_roles',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasRolesArguments {
    self: RawTransactionArgument<string>;
}
export interface HasRolesOptions {
    package?: string;
    arguments: HasRolesArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Whether the party holds any roles. */
export function hasRoles(options: HasRolesOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_roles';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_roles',
        function: 'has_roles',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasRoleArguments {
    self: RawTransactionArgument<string>;
    role: TransactionArgument;
}
export interface HasRoleOptions {
    package?: string;
    arguments: HasRoleArguments | [
        self: RawTransactionArgument<string>,
        role: TransactionArgument
    ];
}
/** Whether the party holds the given role. */
export function hasRole(options: HasRoleOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_roles';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "role"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_roles',
        function: 'has_role',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RolesArguments {
    self: RawTransactionArgument<string>;
}
export interface RolesOptions {
    package?: string;
    arguments: RolesArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** The party's roles. */
export function roles(options: RolesOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_roles';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_roles',
        function: 'roles',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}