/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Release cover art: an album-level cover plus optional per-track cover overrides.
 * Stored as a dynamic field on the release's UID, set/cleared via the release's
 * cap-gated `uid_mut`.
 *
 * Cover art is presentation, not objective recording data, so it lives on the
 * release (the consumer object) rather than the recording. A track's effective
 * cover resolves as: its per-track override if set, else the album cover. The
 * overrides are a `PerTrack<Option<CoverArt>>` — one slot per track, aligned to
 * the release's tracklist by construction (sized from `tracks().length()`).
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as cover_art from './deps/cover_art/cover_art.ts';
import * as per_track from './deps/per_track/per_track.ts';
const $moduleName = '@local-pkg/release_cover_art::release_cover_art';
export const ExtensionKey = new MoveTuple({ name: `${$moduleName}::ExtensionKey`, fields: [bcs.bool()] });
export const ReleaseCoverArt = new MoveStruct({ name: `${$moduleName}::ReleaseCoverArt`, fields: {
        cover: bcs.option(cover_art.CoverArt),
        track_covers: per_track.PerTrack(bcs.option(cover_art.CoverArt))
    } });
export const CoverSetEvent = new MoveStruct({ name: `${$moduleName}::CoverSetEvent`, fields: {
        release_id: bcs.Address,
        /** The full cover art record that was written. */
        art: cover_art.CoverArt
    } });
export const CoverUnsetEvent = new MoveStruct({ name: `${$moduleName}::CoverUnsetEvent`, fields: {
        release_id: bcs.Address
    } });
export const TrackCoverSetEvent = new MoveStruct({ name: `${$moduleName}::TrackCoverSetEvent`, fields: {
        release_id: bcs.Address,
        track_index: bcs.u64(),
        /** The full cover art record that was written. */
        art: cover_art.CoverArt
    } });
export const TrackCoverUnsetEvent = new MoveStruct({ name: `${$moduleName}::TrackCoverUnsetEvent`, fields: {
        release_id: bcs.Address,
        track_index: bcs.u64()
    } });
export interface SetCoverArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    art: TransactionArgument;
}
export interface SetCoverOptions {
    package?: string;
    arguments: SetCoverArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        art: TransactionArgument
    ];
}
/** Sets (or replaces) the album-level cover. */
export function setCover(options: SetCoverOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_cover_art';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "art"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_cover_art',
        function: 'set_cover',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface UnsetCoverArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface UnsetCoverOptions {
    package?: string;
    arguments: UnsetCoverArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
}
/**
 * Removes the album-level cover. Per-track overrides are untouched. Aborts with
 * `ENoCoverArt` if no cover art record is attached.
 */
export function unsetCover(options: UnsetCoverOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_cover_art';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_cover_art',
        function: 'unset_cover',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetTrackCoverArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    trackIndex: RawTransactionArgument<number | bigint>;
    art: TransactionArgument;
}
export interface SetTrackCoverOptions {
    package?: string;
    arguments: SetTrackCoverArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        trackIndex: RawTransactionArgument<number | bigint>,
        art: TransactionArgument
    ];
}
/**
 * Sets (or replaces) the cover override for a specific track (by tracklist index).
 * Aborts if the index is out of range for the release.
 */
export function setTrackCover(options: SetTrackCoverOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_cover_art';
    const argumentsTypes = [
        null,
        null,
        'u64',
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "trackIndex", "art"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_cover_art',
        function: 'set_track_cover',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface UnsetTrackCoverArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    trackIndex: RawTransactionArgument<number | bigint>;
}
export interface UnsetTrackCoverOptions {
    package?: string;
    arguments: UnsetTrackCoverArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        trackIndex: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Removes the cover override for a specific track — the track then falls back to
 * the album cover. Aborts if no cover art record is attached, or if the index is
 * out of range for the release.
 */
export function unsetTrackCover(options: UnsetTrackCoverOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_cover_art';
    const argumentsTypes = [
        null,
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "trackIndex"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_cover_art',
        function: 'unset_track_cover',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasCoverArtArguments {
    self: RawTransactionArgument<string>;
}
export interface HasCoverArtOptions {
    package?: string;
    arguments: HasCoverArtArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Returns whether a cover art record is attached to this release. */
export function hasCoverArt(options: HasCoverArtOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_cover_art';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_cover_art',
        function: 'has_cover_art',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CoverArguments {
    self: RawTransactionArgument<string>;
}
export interface CoverOptions {
    package?: string;
    arguments: CoverArguments | [
        self: RawTransactionArgument<string>
    ];
}
/**
 * Returns the album-level cover (none if unset). Aborts if no cover art record is
 * attached at all.
 */
export function cover(options: CoverOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_cover_art';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_cover_art',
        function: 'cover',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TrackCoverArguments {
    self: RawTransactionArgument<string>;
    trackIndex: RawTransactionArgument<number | bigint>;
}
export interface TrackCoverOptions {
    package?: string;
    arguments: TrackCoverArguments | [
        self: RawTransactionArgument<string>,
        trackIndex: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Returns a track's effective cover: its per-track override if set, otherwise the
 * album cover (which may itself be none). Aborts if no cover art record is
 * attached, or if the track index is out of range.
 */
export function trackCover(options: TrackCoverOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_cover_art';
    const argumentsTypes = [
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "trackIndex"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_cover_art',
        function: 'track_cover',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}