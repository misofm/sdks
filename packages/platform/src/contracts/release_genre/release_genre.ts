/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * The genre(s) a musicos `Release` is classified under, stored as a dynamic field
 * on the release's UID and written through its cap-gated `uid_mut`.
 *
 * Genre is intrinsic to a recording — a fact about the master, not about any one
 * product it appears on — so a recording's own genre lives in the sibling package
 * `recording_genre`, on the recording itself. This package carries the different
 * claim: what a release, as a released product, is classified as. A compilation
 * can be "Jazz" on the shelf even when half its tracks are Blues or Funk on their
 * own terms; that classification belongs to nobody but the release, and no amount
 * of inspecting its recordings derives it. The intended read order for a track's
 * genre is the recording's own (`recording_genre`), falling back to this release's
 * primary when the recording has none — the release is the product-level default,
 * not a per-track override, because a `Recording` carries no back-reference to any
 * release and one recording can appear on many.
 *
 * Its own package, for the same reason genre is separated from every other release
 * fact: it is set by different people, at different times, under a vocabulary (the
 * shared `genre` registry) that evolves on its own schedule. A consumer building a
 * metadata profile picks this extension up or ignores it, and revising it never
 * disturbs anything else the release carries.
 *
 * Genres are kept as one ordered list, primary first, rather than a primary field
 * plus a separate secondary set. A release either has a primary genre or it has no
 * genre assignment at all — there is no state where secondaries exist without a
 * primary, or where the primary and a secondary are the same entry needing to be
 * kept disjoint — so the two structures collapse to one without losing anything
 * the list needs to say. Reordering — including promoting an existing entry to
 * primary — is `clear_genres` followed by `add_genre` in the desired order,
 * atomically within one programmable transaction block. That is preferable to a
 * dedicated set-primary function: one fewer function to review and keep in sync
 * with `recording_genre`, no conditional-capacity branch (insert-new-at-front vs.
 * move-existing-to- front), and the client expresses its intended final order
 * directly instead of encoding it as a sequence of promotions. Order beyond index
 * 0 is the caller's, in the same convention `recording_language` uses for its
 * language vector: first is authoritative, the rest are unranked.
 *
 * The stored value is a bare `vector<ID>` under the package's own key, with no
 * wrapper struct — the same shape `party_genre` uses for its `VecSet<ID>` and
 * `recording_language` for its `vector<LanguageCode>`. The list is non-empty by
 * construction: `remove_genre` drops the field the moment the last entry leaves,
 * so "the field exists" and "there is a primary" are the same fact and no reader
 * has to handle an attached-but-empty case. Every add takes `&Genre`, so only an
 * id that the shared vocabulary actually minted can ever enter the list; removal
 * takes a bare `ID` because nothing about proving membership is needed to take an
 * entry back out.
 *
 * This module exposes no function derivable by composing the others. This package
 * is never upgraded — every publish is a fresh identity at a fresh address — so
 * every public function is permanent surface: once live, it must be carried,
 * re-published, and re-audited for as long as the package is in use. A predicate
 * or accessor a caller can compute from `genres()` earns nothing by also living
 * on-chain. Concretely: emptiness is `genres(release).is_empty()`, and the primary
 * is `genres(release)[0]` (valid whenever the vector is non-empty, by the
 * non-empty-by-construction invariant above).
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/release_genre::release_genre';
export const ExtensionKey = new MoveTuple({ name: `${$moduleName}::ExtensionKey`, fields: [bcs.bool()] });
export const ReleaseGenreAddedEvent = new MoveStruct({ name: `${$moduleName}::ReleaseGenreAddedEvent`, fields: {
        release_id: bcs.Address,
        admin_cap_id: bcs.Address,
        genre_id: bcs.Address,
        genre_name: bcs.vector(bcs.u8()),
        genre_index: bcs.u64(),
        genres_before: bcs.vector(bcs.Address),
        genres_after: bcs.vector(bcs.Address),
        genre_count_before: bcs.u64(),
        genre_count_after: bcs.u64(),
        field_existed_before: bcs.bool(),
        field_exists_after: bcs.bool(),
        had_primary_before: bcs.bool(),
        has_primary_after: bcs.bool(),
        primary_genre_id_before: bcs.Address,
        primary_genre_id_after: bcs.Address,
        primary_changed: bcs.bool()
    } });
export const ReleaseGenreRemovedEvent = new MoveStruct({ name: `${$moduleName}::ReleaseGenreRemovedEvent`, fields: {
        release_id: bcs.Address,
        admin_cap_id: bcs.Address,
        genre_id: bcs.Address,
        genre_index: bcs.u64(),
        genres_before: bcs.vector(bcs.Address),
        genres_after: bcs.vector(bcs.Address),
        genre_count_before: bcs.u64(),
        genre_count_after: bcs.u64(),
        field_existed_before: bcs.bool(),
        field_exists_after: bcs.bool(),
        had_primary_before: bcs.bool(),
        has_primary_after: bcs.bool(),
        primary_genre_id_before: bcs.Address,
        primary_genre_id_after: bcs.Address,
        primary_changed: bcs.bool()
    } });
export const ReleaseGenresClearedEvent = new MoveStruct({ name: `${$moduleName}::ReleaseGenresClearedEvent`, fields: {
        release_id: bcs.Address,
        admin_cap_id: bcs.Address,
        clear_cause: bcs.u8(),
        trigger_genre_id: bcs.Address,
        genres_before: bcs.vector(bcs.Address),
        genres_after: bcs.vector(bcs.Address),
        genre_count_before: bcs.u64(),
        genre_count_after: bcs.u64(),
        field_existed_before: bcs.bool(),
        field_exists_after: bcs.bool(),
        had_primary_before: bcs.bool(),
        has_primary_after: bcs.bool(),
        primary_genre_id_before: bcs.Address,
        primary_genre_id_after: bcs.Address,
        primary_changed: bcs.bool()
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
 * Appends a genre to the release's list. Creates the field on first use, in which
 * case that genre becomes the primary by being the only entry. Aborts
 * `EDuplicateGenre` if the genre is already present, `EMaxGenres` if the release
 * is already at capacity.
 */
export function addGenre(options: AddGenreOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_genre';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "genre"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_genre',
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
 * Removes a genre from the release by id. If it was the primary, the next entry
 * (if any) becomes primary by virtue of now sitting at index 0. Removing the last
 * genre drops the field entirely and additionally emits
 * `ReleaseGenresClearedEvent`. Aborts `EGenreNotPresent` if the genre is not
 * currently assigned, including when the release has no genres at all.
 */
export function removeGenre(options: RemoveGenreOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_genre';
    const argumentsTypes = [
        null,
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "genreId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_genre',
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
/**
 * Removes the release's entire genre list. A no-op when nothing is attached. Emits
 * `ReleaseGenresClearedEvent` only when a list was actually removed.
 */
export function clearGenres(options: ClearGenresOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_genre';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_genre',
        function: 'clear_genres',
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
/**
 * The release's genre ids, in order, primary first. Empty when nothing is
 * attached.
 */
export function genres(options: GenresOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_genre';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_genre',
        function: 'genres',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}