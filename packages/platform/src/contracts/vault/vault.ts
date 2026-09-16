/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Generic capability custody and plugin authorization.
 *
 * `Vault<Cap>` is a permanent, deterministically addressed shell that can hold one
 * exact capability in a Sui `Referent`. An authorized plugin receives the whole
 * capability temporarily, paired with a hot-potato `Borrow` receipt that forces
 * the same capability back into the same vault before the transaction can finish.
 * Plugin authorization is represented by a typed dynamic field in the vault's
 * `Bag`.
 */

import { MoveStruct, MoveTuple, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs, type BcsType } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as borrow from './deps/sui/borrow.ts';
import * as bag from './deps/sui/bag.ts';
const $moduleName = '@local-pkg/vault::vault';
export const VaultRegistry = new MoveStruct({ name: `${$moduleName}::VaultRegistry`, fields: {
        id: bcs.Address
    } });
/**
 * Custodies one capability and the typed authorization records for plugins.
 *
 * `Vault` intentionally lacks `store`: only this module can share it, and no
 * production API can delete it. `vaulted_cap_id` permanently binds the shell to
 * the exact capability from which its ID was derived. An empty Vault can only be
 * restored with that same capability object.
 */
export function Vault<Cap extends BcsType<any>>(...typeParameters: [
    Cap
]) {
    return new MoveStruct({ name: `${$moduleName}::Vault<${typeParameters[0].name as Cap['name']}>`, fields: {
            id: bcs.Address,
            vaulted_cap_id: bcs.Address,
            vaulted_cap: bcs.option(borrow.Referent(typeParameters[0])),
            authorized_plugins: bag.Bag
        } });
}
export const VaultAdminCap = new MoveStruct({ name: `${$moduleName}::VaultAdminCap<phantom Cap>`, fields: {
        id: bcs.Address,
        vault_id: bcs.Address
    } });
export const VaultKey = new MoveTuple({ name: `${$moduleName}::VaultKey<phantom Cap>`, fields: [bcs.Address] });
export const VaultAdminCapKey = new MoveTuple({ name: `${$moduleName}::VaultAdminCapKey`, fields: [bcs.bool()] });
export const AuthorizedPluginKey = new MoveTuple({ name: `${$moduleName}::AuthorizedPluginKey<phantom Witness>`, fields: [bcs.bool()] });
export const VaultRegistryCreatedEvent = new MoveStruct({ name: `${$moduleName}::VaultRegistryCreatedEvent`, fields: {
        registry_id: bcs.Address,
        shared: bcs.bool()
    } });
export const VaultCreatedEvent = new MoveStruct({ name: `${$moduleName}::VaultCreatedEvent<phantom Cap>`, fields: {
        registry_id: bcs.Address,
        vault_id: bcs.Address,
        vaulted_cap_id: bcs.Address,
        cap_id: bcs.Address,
        authorized_plugins_id: bcs.Address,
        authorized_plugin_count: bcs.u64(),
        active: bcs.bool(),
        capability_available: bcs.bool()
    } });
export const PluginAuthorizedEvent = new MoveStruct({ name: `${$moduleName}::PluginAuthorizedEvent<phantom Cap, phantom Witness>`, fields: {
        vault_id: bcs.Address,
        vaulted_cap_id: bcs.Address,
        cap_id: bcs.Address,
        authorized_plugins_id: bcs.Address,
        authorized_plugin_count: bcs.u64(),
        authorized: bcs.bool()
    } });
export const PluginRevokedEvent = new MoveStruct({ name: `${$moduleName}::PluginRevokedEvent<phantom Cap, phantom Witness>`, fields: {
        vault_id: bcs.Address,
        vaulted_cap_id: bcs.Address,
        cap_id: bcs.Address,
        authorized_plugins_id: bcs.Address,
        authorized_plugin_count: bcs.u64(),
        authorized: bcs.bool()
    } });
export const VaultCapabilityWithdrawnEvent = new MoveStruct({ name: `${$moduleName}::VaultCapabilityWithdrawnEvent<phantom Cap>`, fields: {
        vault_id: bcs.Address,
        vaulted_cap_id: bcs.Address,
        cap_id: bcs.Address,
        active: bcs.bool(),
        capability_available: bcs.bool()
    } });
export const VaultCapabilityRestoredEvent = new MoveStruct({ name: `${$moduleName}::VaultCapabilityRestoredEvent<phantom Cap>`, fields: {
        vault_id: bcs.Address,
        vaulted_cap_id: bcs.Address,
        cap_id: bcs.Address,
        active: bcs.bool(),
        capability_available: bcs.bool()
    } });
export interface NewArguments<Cap extends BcsType<any>> {
    registry: RawTransactionArgument<string>;
    vaultedCap: RawTransactionArgument<Cap>;
}
export interface NewOptions<Cap extends BcsType<any>> {
    package?: string;
    arguments: NewArguments<Cap> | [
        registry: RawTransactionArgument<string>,
        vaultedCap: RawTransactionArgument<Cap>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Custody `vaulted_cap` in its canonical permanent Vault and create the canonical
 * vault-specific administrator capability.
 */
export function _new<Cap extends BcsType<any>>(options: NewOptions<Cap>) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null,
        `${options.typeArguments[0]}`
    ] satisfies (string | null)[];
    const parameterNames = ["registry", "vaultedCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ShareArguments {
    vault: RawTransactionArgument<string>;
}
export interface ShareOptions {
    package?: string;
    arguments: ShareArguments | [
        vault: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Share a newly-created vault. */
export function share(options: ShareOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'share',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface WithdrawVaultedCapArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface WithdrawVaultedCapOptions {
    package?: string;
    arguments: WithdrawVaultedCapArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Withdraw the exact capability while leaving its canonical Vault and
 * VaultAdminCap intact. Every plugin must be revoked first.
 */
export function withdrawVaultedCap(options: WithdrawVaultedCapOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'withdraw_vaulted_cap',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RestoreVaultedCapArguments<Cap extends BcsType<any>> {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    vaultedCap: RawTransactionArgument<Cap>;
}
export interface RestoreVaultedCapOptions<Cap extends BcsType<any>> {
    package?: string;
    arguments: RestoreVaultedCapArguments<Cap> | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        vaultedCap: RawTransactionArgument<Cap>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Restore the exact capability used to derive this permanent Vault. Restoring
 * always starts from a clean plugin-authorization slate.
 */
export function restoreVaultedCap<Cap extends BcsType<any>>(options: RestoreVaultedCapOptions<Cap>) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null,
        null,
        `${options.typeArguments[0]}`
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "vaultedCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'restore_vaulted_cap',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface AuthorizePluginArguments<Witness extends BcsType<any>> {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    _: RawTransactionArgument<Witness>;
}
export interface AuthorizePluginOptions<Witness extends BcsType<any>> {
    package?: string;
    arguments: AuthorizePluginArguments<Witness> | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        _: RawTransactionArgument<Witness>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Authorize the plugin identified by this witness type. */
export function authorizePlugin<Witness extends BcsType<any>>(options: AuthorizePluginOptions<Witness>) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null,
        null,
        `${options.typeArguments[1]}`
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "_"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'authorize_plugin',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RevokePluginArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface RevokePluginOptions {
    package?: string;
    arguments: RevokePluginArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Revoke a plugin authorization without requiring cooperation from the plugin. */
export function revokePlugin(options: RevokePluginOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'revoke_plugin',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface BorrowAsPluginArguments<Witness extends BcsType<any>> {
    self: RawTransactionArgument<string>;
    _: RawTransactionArgument<Witness>;
}
export interface BorrowAsPluginOptions<Witness extends BcsType<any>> {
    package?: string;
    arguments: BorrowAsPluginArguments<Witness> | [
        self: RawTransactionArgument<string>,
        _: RawTransactionArgument<Witness>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Temporarily lend the full custodied capability to an authorized plugin.
 *
 * `Borrow` has no abilities, so the exact capability must be returned through
 * `put_back` in this transaction.
 */
export function borrowAsPlugin<Witness extends BcsType<any>>(options: BorrowAsPluginOptions<Witness>) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null,
        `${options.typeArguments[1]}`
    ] satisfies (string | null)[];
    const parameterNames = ["self", "_"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'borrow_as_plugin',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface BorrowAsAdminArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface BorrowAsAdminOptions {
    package?: string;
    arguments: BorrowAsAdminArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Temporarily lend the full custodied capability to the vault administrator. */
export function borrowAsAdmin(options: BorrowAsAdminOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'borrow_as_admin',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PutBackArguments<Cap extends BcsType<any>> {
    self: RawTransactionArgument<string>;
    vaultedCap: RawTransactionArgument<Cap>;
    receipt: TransactionArgument;
}
export interface PutBackOptions<Cap extends BcsType<any>> {
    package?: string;
    arguments: PutBackArguments<Cap> | [
        self: RawTransactionArgument<string>,
        vaultedCap: RawTransactionArgument<Cap>,
        receipt: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/**
 * Return the exact capability borrowed from this vault.
 *
 * No additional authorization is required: `Borrow` proves the originating
 * referent and capability object ID, and blocking return would harm liveness.
 */
export function putBack<Cap extends BcsType<any>>(options: PutBackOptions<Cap>) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null,
        `${options.typeArguments[0]}`,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "vaultedCap", "receipt"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'put_back',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface DerivedAddressArguments {
    registry: RawTransactionArgument<string>;
    vaultedCapId: RawTransactionArgument<string>;
}
export interface DerivedAddressOptions {
    package?: string;
    arguments: DerivedAddressArguments | [
        registry: RawTransactionArgument<string>,
        vaultedCapId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Derive the canonical Vault address for `vaulted_cap_id` in this registry. */
export function derivedAddress(options: DerivedAddressOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["registry", "vaultedCapId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'derived_address',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface VaultedCapIdArguments {
    self: RawTransactionArgument<string>;
}
export interface VaultedCapIdOptions {
    package?: string;
    arguments: VaultedCapIdArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** The exact capability object permanently assigned to this Vault. */
export function vaultedCapId(options: VaultedCapIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'vaulted_cap_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface IsActiveArguments {
    self: RawTransactionArgument<string>;
}
export interface IsActiveOptions {
    package?: string;
    arguments: IsActiveArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Whether this Vault is active.
 *
 * An active Vault has an outer Referent. It remains active during a
 * transaction-local lease even though that Referent is temporarily empty.
 */
export function isActive(options: IsActiveOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'is_active',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface AuthorizedPluginsArguments {
    self: RawTransactionArgument<string>;
}
export interface AuthorizedPluginsOptions {
    package?: string;
    arguments: AuthorizedPluginsArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** The immutable Bag containing typed plugin-authorization records. */
export function authorizedPlugins(options: AuthorizedPluginsOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'authorized_plugins',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface IsPluginAuthorizedArguments {
    self: RawTransactionArgument<string>;
}
export interface IsPluginAuthorizedOptions {
    package?: string;
    arguments: IsPluginAuthorizedArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Returns whether this witness type has an authorization record. */
export function isPluginAuthorized(options: IsPluginAuthorizedOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'is_plugin_authorized',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}