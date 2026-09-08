/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * The genres that classify a recording, in order with the primary first, stored as
 * a dynamic field on the recording's UID and written through its cap-gated
 * `uid_mut`.
 *
 * This is its own package on purpose. Genre is classified by different people, at
 * different times, against a vocabulary that evolves on its own schedule — exactly
 * the split behind `recording_advisory` and `recording_language`. A consumer
 * implementing some future classification profile picks this extension up or
 * ignores it, and replacing it never disturbs anything else attached to the
 * recording.
 *
 * **Why the recording, and not the release.** `musicos::track`'s module doc is
 * explicit that a `Track` embeds only facts "genuinely release-specific and not
 * derivable from the recording" — title and cover art were excluded for exactly
 * this reason. Genre is not release-specific: it is a fact about the audio itself,
 * and `track::new` can be called repeatedly against one published `Recording` with
 * different target releases, so one master can be a track on many releases at
 * once. `Recording` holds no back-reference to any release. A per-track genre
 * override written from the release side is therefore N independent
 * classifications of one master, made by whichever compilation curator happens to
 * hold that release's cap — someone who does not own the master and has no
 * standing to assert what genre it is. The recording's own admin is the party
 * entitled to classify it, and does so once, here.
 *
 * **Division of labour with `release_genre`.** Release-level genre is a separate,
 * legitimate claim: a compilation is "Jazz" _as a product_ even when the
 * recordings inside it are not, individually, jazz. `release_genre` keeps that
 * product-level classification. A client resolving a track's genre should read
 * this package first — the recording's own classification — and fall back to the
 * release's primary genre only when the recording has none.
 *
 * **Shape.** One ordered `vector<ID>` of `genre::Genre` object ids, index 0 the
 * primary, capped at `MAX_GENRES` — the house precedent is `recording_language`:
 * "Order is the caller's: first is conventionally the predominant one." The old
 * release-side design split a single ordered concept into `primary: ID` plus
 * `secondary: vector<ID>`, and three of its six error codes existed only to police
 * the boundary between the two halves — states that cannot exist in a single list.
 * Reordering — including promoting an existing entry to primary — is
 * `clear_genres` followed by `add_genre` in the desired order, atomically within
 * one programmable transaction block: one fewer function to keep in lockstep with
 * `release_genre`, no conditional-capacity branch (insert-new-at-front vs.
 * move-existing-to-front), and the client states its intended final order directly
 * instead of encoding it as a sequence of promotions.
 *
 * The stored value is a bare `vector<ID>` under the package's own key, no wrapper
 * struct — the same choice `party_genre` makes for its `VecSet<ID>` and
 * `recording_language` makes for its `vector<LanguageCode>`. `vector<ID>` has
 * `drop`, so removing the field is `let _: vector<ID> = df::remove(...)` with no
 * destructuring required.
 *
 * Non-empty by construction: removing the last genre drops the field, so "the
 * field is attached" always implies "there is a primary" — there is no
 * attached-but-empty state to special-case.
 *
 * Every write takes `&Genre` — a real, name-derived object from the shared
 * vocabulary — so only ids that resolve to a genuine vocabulary entry can ever
 * enter the list. Removal takes a bare `ID`, since the object itself is not needed
 * to drop a reference to it.
 *
 * This module exposes no function derivable by composing the others. This package
 * is never upgraded — every publish is a fresh identity at a fresh address — so
 * every public function is permanent surface: once live, it must be carried,
 * re-published, and re-audited for as long as the package is in use. A predicate
 * or accessor a caller can compute from `genres()` earns nothing by also living
 * on-chain. Concretely: emptiness is `genres(recording).is_empty()`, and the
 * primary is `genres(recording)[0]` (valid whenever the vector is non-empty, by
 * the non-empty-by-construction invariant above).
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/recording_genre::recording_genre';
export const ExtensionKey = new MoveTuple({ name: `${$moduleName}::ExtensionKey`, fields: [bcs.bool()] });
export const GenreAddedEvent = new MoveStruct({ name: `${$moduleName}::GenreAddedEvent`, fields: {
        recording_id: bcs.Address,
        genre_id: bcs.Address
    } });
export const GenreRemovedEvent = new MoveStruct({ name: `${$moduleName}::GenreRemovedEvent`, fields: {
        recording_id: bcs.Address,
        genre_id: bcs.Address
    } });
export const GenresClearedEvent = new MoveStruct({ name: `${$moduleName}::GenresClearedEvent`, fields: {
        recording_id: bcs.Address
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
    typeArguments: [
        string,
        string
    ];
}
/**
 * Appends a genre to the recording's list. Creates the field on first use, in
 * which case the appended genre becomes the primary. Aborts `EDuplicateGenre` if
 * the genre is already present, `EMaxGenres` if the recording is already at
 * capacity.
 */
export function addGenre(options: AddGenreOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_genre';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "genre"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_genre',
        function: 'add_genre',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
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
    typeArguments: [
        string,
        string
    ];
}
/**
 * Removes a genre by id. If it was the primary, the next genre in the list becomes
 * primary. Removing the last remaining genre drops the field entirely and
 * additionally emits `GenresClearedEvent`. Aborts `EGenreNotPresent` if the genre
 * is not assigned — including when nothing is attached at all.
 */
export function removeGenre(options: RemoveGenreOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_genre';
    const argumentsTypes = [
        null,
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "genreId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_genre',
        function: 'remove_genre',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
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
    typeArguments: [
        string,
        string
    ];
}
/**
 * Removes the recording's entire genre list. A no-op when nothing is attached.
 * Emits `GenresClearedEvent` only when a list was actually removed.
 */
export function clearGenres(options: ClearGenresOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_genre';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_genre',
        function: 'clear_genres',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
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
    typeArguments: [
        string,
        string
    ];
}
/**
 * The recording's genre ids in order, primary first. Empty when nothing is
 * attached.
 */
export function genres(options: GenresOptions) {
    const packageAddress = options.package ?? '@local-pkg/recording_genre';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording_genre',
        function: 'genres',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}