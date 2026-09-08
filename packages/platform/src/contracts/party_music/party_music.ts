/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Music-platform payloads for the `platform_link` primitive — a party's links to
 * its own artist/profile pages on streaming and music sites.
 *
 * These are _artist-level_ identifiers (an artist's Spotify id, a Bandcamp
 * subdomain), distinct from the release-level (album/track) payloads the
 * protocol's DSP-link extension uses. Only the native id is stored; the public URL
 * is rebuilt client-side, so a platform reshaping its URLs needs no on-chain
 * change. Validation is intentionally minimal — non-empty plus the shared
 * max-length backstop (`platform_link::max_identifier_length()`).
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/party_music::party_music';
export const SpotifyData = new MoveStruct({ name: `${$moduleName}::SpotifyData`, fields: {
        artist_id: bcs.string()
    } });
export const BandcampData = new MoveStruct({ name: `${$moduleName}::BandcampData`, fields: {
        subdomain: bcs.string()
    } });
export const SoundCloudData = new MoveStruct({ name: `${$moduleName}::SoundCloudData`, fields: {
        username: bcs.string()
    } });
export const AppleMusicData = new MoveStruct({ name: `${$moduleName}::AppleMusicData`, fields: {
        artist_id: bcs.string()
    } });
export const DeezerData = new MoveStruct({ name: `${$moduleName}::DeezerData`, fields: {
        artist_id: bcs.string()
    } });
export const TidalData = new MoveStruct({ name: `${$moduleName}::TidalData`, fields: {
        artist_id: bcs.string()
    } });
export const AmazonMusicData = new MoveStruct({ name: `${$moduleName}::AmazonMusicData`, fields: {
        artist_id: bcs.string()
    } });
export const AudiomackData = new MoveStruct({ name: `${$moduleName}::AudiomackData`, fields: {
        username: bcs.string()
    } });
export interface SpotifyArguments {
    artistId: RawTransactionArgument<string>;
}
export interface SpotifyOptions {
    package?: string;
    arguments: SpotifyArguments | [
        artistId: RawTransactionArgument<string>
    ];
}
/** Builds a Spotify artist link. Aborts if empty. */
export function spotify(options: SpotifyOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_music';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["artistId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_music',
        function: 'spotify',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface BandcampArguments {
    subdomain: RawTransactionArgument<string>;
}
export interface BandcampOptions {
    package?: string;
    arguments: BandcampArguments | [
        subdomain: RawTransactionArgument<string>
    ];
}
/** Builds a Bandcamp link from an artist subdomain. Aborts if empty. */
export function bandcamp(options: BandcampOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_music';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["subdomain"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_music',
        function: 'bandcamp',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SoundcloudArguments {
    username: RawTransactionArgument<string>;
}
export interface SoundcloudOptions {
    package?: string;
    arguments: SoundcloudArguments | [
        username: RawTransactionArgument<string>
    ];
}
/** Builds a SoundCloud link from a username. Aborts if empty. */
export function soundcloud(options: SoundcloudOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_music';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["username"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_music',
        function: 'soundcloud',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AppleMusicArguments {
    artistId: RawTransactionArgument<string>;
}
export interface AppleMusicOptions {
    package?: string;
    arguments: AppleMusicArguments | [
        artistId: RawTransactionArgument<string>
    ];
}
/** Builds an Apple Music artist link. Aborts if empty. */
export function appleMusic(options: AppleMusicOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_music';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["artistId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_music',
        function: 'apple_music',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeezerArguments {
    artistId: RawTransactionArgument<string>;
}
export interface DeezerOptions {
    package?: string;
    arguments: DeezerArguments | [
        artistId: RawTransactionArgument<string>
    ];
}
/** Builds a Deezer artist link. Aborts if empty. */
export function deezer(options: DeezerOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_music';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["artistId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_music',
        function: 'deezer',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TidalArguments {
    artistId: RawTransactionArgument<string>;
}
export interface TidalOptions {
    package?: string;
    arguments: TidalArguments | [
        artistId: RawTransactionArgument<string>
    ];
}
/** Builds a Tidal artist link. Aborts if empty. */
export function tidal(options: TidalOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_music';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["artistId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_music',
        function: 'tidal',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AmazonMusicArguments {
    artistId: RawTransactionArgument<string>;
}
export interface AmazonMusicOptions {
    package?: string;
    arguments: AmazonMusicArguments | [
        artistId: RawTransactionArgument<string>
    ];
}
/** Builds an Amazon Music artist link. Aborts if empty. */
export function amazonMusic(options: AmazonMusicOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_music';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["artistId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_music',
        function: 'amazon_music',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AudiomackArguments {
    username: RawTransactionArgument<string>;
}
export interface AudiomackOptions {
    package?: string;
    arguments: AudiomackArguments | [
        username: RawTransactionArgument<string>
    ];
}
/** Builds an Audiomack link from a username. Aborts if empty. */
export function audiomack(options: AudiomackOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_music';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["username"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_music',
        function: 'audiomack',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SpotifyArtistIdArguments {
    self: TransactionArgument;
}
export interface SpotifyArtistIdOptions {
    package?: string;
    arguments: SpotifyArtistIdArguments | [
        self: TransactionArgument
    ];
}
export function spotifyArtistId(options: SpotifyArtistIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_music';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_music',
        function: 'spotify_artist_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface BandcampSubdomainArguments {
    self: TransactionArgument;
}
export interface BandcampSubdomainOptions {
    package?: string;
    arguments: BandcampSubdomainArguments | [
        self: TransactionArgument
    ];
}
export function bandcampSubdomain(options: BandcampSubdomainOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_music';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_music',
        function: 'bandcamp_subdomain',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SoundcloudUsernameArguments {
    self: TransactionArgument;
}
export interface SoundcloudUsernameOptions {
    package?: string;
    arguments: SoundcloudUsernameArguments | [
        self: TransactionArgument
    ];
}
export function soundcloudUsername(options: SoundcloudUsernameOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_music';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_music',
        function: 'soundcloud_username',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AppleMusicArtistIdArguments {
    self: TransactionArgument;
}
export interface AppleMusicArtistIdOptions {
    package?: string;
    arguments: AppleMusicArtistIdArguments | [
        self: TransactionArgument
    ];
}
export function appleMusicArtistId(options: AppleMusicArtistIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_music';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_music',
        function: 'apple_music_artist_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeezerArtistIdArguments {
    self: TransactionArgument;
}
export interface DeezerArtistIdOptions {
    package?: string;
    arguments: DeezerArtistIdArguments | [
        self: TransactionArgument
    ];
}
export function deezerArtistId(options: DeezerArtistIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_music';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_music',
        function: 'deezer_artist_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TidalArtistIdArguments {
    self: TransactionArgument;
}
export interface TidalArtistIdOptions {
    package?: string;
    arguments: TidalArtistIdArguments | [
        self: TransactionArgument
    ];
}
export function tidalArtistId(options: TidalArtistIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_music';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_music',
        function: 'tidal_artist_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AmazonMusicArtistIdArguments {
    self: TransactionArgument;
}
export interface AmazonMusicArtistIdOptions {
    package?: string;
    arguments: AmazonMusicArtistIdArguments | [
        self: TransactionArgument
    ];
}
export function amazonMusicArtistId(options: AmazonMusicArtistIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_music';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_music',
        function: 'amazon_music_artist_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AudiomackUsernameArguments {
    self: TransactionArgument;
}
export interface AudiomackUsernameOptions {
    package?: string;
    arguments: AudiomackUsernameArguments | [
        self: TransactionArgument
    ];
}
export function audiomackUsername(options: AudiomackUsernameOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_music';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_music',
        function: 'audiomack_username',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}