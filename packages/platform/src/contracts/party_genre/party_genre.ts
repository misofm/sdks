/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Musical-genre tags for a party, piggybacking the Miso genre vocabulary.
 *
 * Stores a set of `genre::Genre` object ids — the same canonical, name-derived
 * genres the shared vocabulary primitive mints, so a party's genres reference
 * exactly the ids releases (and anything else) use. Adding a genre takes a
 * `&Genre`, proving the id is a real vocabulary entry; removal is by id. Genre is
 * presentation, not protocol-verifiable state, so a party's genres are a
 * lightweight display tag list — no primary/secondary ranking, no anti-churn
 * locks. The set mechanics — storage, duplicate and capacity checks, field
 * reclamation — live in the shared `typed_set` primitive; this package keeps the
 * vocabulary proof, the capacity, and the typed events. Duplicate / not-present /
 * over-max aborts come from `typed_set` with its own error codes. All writes are
 * gated by the `PartyAdminCap`; views are permissionless.
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/party_genre::party_genre';
export const GenresKey = new MoveTuple({ name: `${$moduleName}::GenresKey`, fields: [bcs.bool()] });
export const GenreAddedEvent = new MoveStruct({ name: `${$moduleName}::GenreAddedEvent`, fields: {
        party_id: bcs.Address,
        genre_id: bcs.Address
    } });
export const GenreRemovedEvent = new MoveStruct({ name: `${$moduleName}::GenreRemovedEvent`, fields: {
        party_id: bcs.Address,
        genre_id: bcs.Address
    } });
export const GenresClearedEvent = new MoveStruct({ name: `${$moduleName}::GenresClearedEvent`, fields: {
        party_id: bcs.Address
    } });
export interface AddGenreArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    genre: RawTransactionArgument<string>;
}
export interface AddGenreOptions {
    package?: string;
    arguments: AddGenreArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        genre: RawTransactionArgument<string>
    ];
}
/**
 * Adds a genre to the party. Takes `&Genre` so only a real vocabulary entry can be
 * tagged. Aborts in `typed_set` if already present or the max is reached.
 */
export function addGenre(options: AddGenreOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_genre';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "genre"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_genre',
        function: 'add_genre',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RemoveGenreArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    genreId: RawTransactionArgument<string>;
}
export interface RemoveGenreOptions {
    package?: string;
    arguments: RemoveGenreArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        genreId: RawTransactionArgument<string>
    ];
}
/**
 * Removes a genre from the party. Aborts in `typed_set` if not present. The whole
 * field is dropped when the last genre leaves.
 */
export function removeGenre(options: RemoveGenreOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_genre';
    const argumentsTypes = [
        null,
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "genreId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_genre',
        function: 'remove_genre',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ClearGenresArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface ClearGenresOptions {
    package?: string;
    arguments: ClearGenresArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
}
/** Removes the party's entire genre set. No-op if none is set. */
export function clearGenres(options: ClearGenresOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_genre';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_genre',
        function: 'clear_genres',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasGenresArguments {
    self: RawTransactionArgument<string>;
}
export interface HasGenresOptions {
    package?: string;
    arguments: HasGenresArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Whether the party carries any genres. */
export function hasGenres(options: HasGenresOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_genre';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_genre',
        function: 'has_genres',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasGenreArguments {
    self: RawTransactionArgument<string>;
    genreId: RawTransactionArgument<string>;
}
export interface HasGenreOptions {
    package?: string;
    arguments: HasGenreArguments | [
        self: RawTransactionArgument<string>,
        genreId: RawTransactionArgument<string>
    ];
}
/** Whether the party carries the given genre. */
export function hasGenre(options: HasGenreOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_genre';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "genreId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_genre',
        function: 'has_genre',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface GenresArguments {
    self: RawTransactionArgument<string>;
}
export interface GenresOptions {
    package?: string;
    arguments: GenresArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** The party's genre ids. */
export function genres(options: GenresOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_genre';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_genre',
        function: 'genres',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}