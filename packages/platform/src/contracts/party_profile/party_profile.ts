/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * A party's editable profile card — the free-form identity fields a profile page
 * renders.
 *
 * Stored as a single `Profile` dynamic field on the party's UID, gated by the
 * `PartyAdminCap`; views are permissionless. Deliberately holds only cohesive
 * identity fields — typed or collection-shaped concerns (roles, tags, genres,
 * media, links) each live in their own extension. `country` and `languages` use
 * validated code primitives (`country_code`, `language_code`), so a stored value
 * is always a real code. The party's `name` is NOT duplicated here — it lives on
 * the core `Party` (`party::set_name`) — and the join date comes from the party's
 * creation event (the indexer has it for free). Every successful set emits a
 * complete before/after byte snapshot and the authorizing cap address; a clear
 * emits the complete removed snapshot only when a profile exists. All writes are
 * cap-gated through `party::uid_mut`, and views are permissionless.
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as country_code from './deps/country_code/country_code.ts';
import * as language_code from './deps/language_code/language_code.ts';
const $moduleName = '@local-pkg/party_profile::party_profile';
export const ProfileKey = new MoveTuple({ name: `${$moduleName}::ProfileKey`, fields: [bcs.bool()] });
export const Profile = new MoveStruct({ name: `${$moduleName}::Profile`, fields: {
        bio_short: bcs.string(),
        bio_long: bcs.option(bcs.string()),
        country: bcs.option(country_code.CountryCode),
        languages: bcs.vector(language_code.LanguageCode)
    } });
export const PartyProfileSetEvent = new MoveStruct({ name: `${$moduleName}::PartyProfileSetEvent`, fields: {
        party_id: bcs.Address,
        admin_cap_id: bcs.Address,
        had_profile: bcs.bool(),
        previous_bio_short: bcs.vector(bcs.u8()),
        previous_bio_long: bcs.option(bcs.vector(bcs.u8())),
        previous_country: bcs.option(bcs.vector(bcs.u8())),
        previous_languages: bcs.vector(bcs.vector(bcs.u8())),
        bio_short: bcs.vector(bcs.u8()),
        bio_long: bcs.option(bcs.vector(bcs.u8())),
        country: bcs.option(bcs.vector(bcs.u8())),
        languages: bcs.vector(bcs.vector(bcs.u8()))
    } });
export const PartyProfileClearedEvent = new MoveStruct({ name: `${$moduleName}::PartyProfileClearedEvent`, fields: {
        party_id: bcs.Address,
        admin_cap_id: bcs.Address,
        previous_bio_short: bcs.vector(bcs.u8()),
        previous_bio_long: bcs.option(bcs.vector(bcs.u8())),
        previous_country: bcs.option(bcs.vector(bcs.u8())),
        previous_languages: bcs.vector(bcs.vector(bcs.u8()))
    } });
export interface SetProfileArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    bioShort: RawTransactionArgument<string>;
    bioLong: RawTransactionArgument<string | null>;
    country: TransactionArgument;
    languages: TransactionArgument;
}
export interface SetProfileOptions {
    package?: string;
    arguments: SetProfileArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        bioShort: RawTransactionArgument<string>,
        bioLong: RawTransactionArgument<string | null>,
        country: TransactionArgument,
        languages: TransactionArgument
    ];
}
/**
 * Sets (creates or replaces) the party's whole profile. Validation and profile
 * construction happen before authorization, preserving validation precedence;
 * authorization happens before any dynamic-field snapshot or mutation. Every
 * successful call, including an identical replacement, emits exactly one event
 * containing complete prior and resulting raw-byte snapshots.
 */
export function setProfile(options: SetProfileOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_profile';
    const argumentsTypes = [
        null,
        null,
        '0x1::string::String',
        '0x1::option::Option<0x1::string::String>',
        null,
        'vector<null>'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "bioShort", "bioLong", "country", "languages"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_profile',
        function: 'set_profile',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ClearProfileArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface ClearProfileOptions {
    package?: string;
    arguments: ClearProfileArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
}
/**
 * Removes the party's profile. Authorization happens before checking existence; an
 * absent field is a silent no-op, while an existing field is removed and emits
 * exactly one complete snapshot event.
 */
export function clearProfile(options: ClearProfileOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_profile';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_profile',
        function: 'clear_profile',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasProfileArguments {
    self: RawTransactionArgument<string>;
}
export interface HasProfileOptions {
    package?: string;
    arguments: HasProfileArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Whether the party has a profile. */
export function hasProfile(options: HasProfileOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_profile';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_profile',
        function: 'has_profile',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ProfileArguments {
    self: RawTransactionArgument<string>;
}
export interface ProfileOptions {
    package?: string;
    arguments: ProfileArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Borrows the party's profile. Aborts if none is set. */
export function profile(options: ProfileOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_profile';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_profile',
        function: 'profile',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface BioShortArguments {
    self: TransactionArgument;
}
export interface BioShortOptions {
    package?: string;
    arguments: BioShortArguments | [
        self: TransactionArgument
    ];
}
export function bioShort(options: BioShortOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_profile';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_profile',
        function: 'bio_short',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface BioLongArguments {
    self: TransactionArgument;
}
export interface BioLongOptions {
    package?: string;
    arguments: BioLongArguments | [
        self: TransactionArgument
    ];
}
export function bioLong(options: BioLongOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_profile';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_profile',
        function: 'bio_long',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CountryArguments {
    self: TransactionArgument;
}
export interface CountryOptions {
    package?: string;
    arguments: CountryArguments | [
        self: TransactionArgument
    ];
}
export function country(options: CountryOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_profile';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_profile',
        function: 'country',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface LanguagesArguments {
    self: TransactionArgument;
}
export interface LanguagesOptions {
    package?: string;
    arguments: LanguagesArguments | [
        self: TransactionArgument
    ];
}
export function languages(options: LanguagesOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_profile';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_profile',
        function: 'languages',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}