/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Social-platform payloads for the `platform_link` primitive. Each network gets
 * its own `…Data` type — a thin wrapper around the account's handle — so a party
 * can carry one independent `PlatformLink<…Data>` per network (they never collide,
 * and adding a network is a new type here, nothing elsewhere).
 *
 * Only the native handle is stored; the public profile URL is rebuilt client-side
 * (e.g. `x.com/{handle}`, `discord.gg/{handle}`), so a platform reshaping its URLs
 * needs no on-chain change. Validation is intentionally minimal — non-empty plus a
 * generous max length as a storage-hygiene backstop; handle _format_ rules change
 * over time and belong in the app layer.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/party_social::party_social';
export const XData = new MoveStruct({ name: `${$moduleName}::XData`, fields: {
        handle: bcs.string()
    } });
export const InstagramData = new MoveStruct({ name: `${$moduleName}::InstagramData`, fields: {
        handle: bcs.string()
    } });
export const ThreadsData = new MoveStruct({ name: `${$moduleName}::ThreadsData`, fields: {
        handle: bcs.string()
    } });
export const TikTokData = new MoveStruct({ name: `${$moduleName}::TikTokData`, fields: {
        handle: bcs.string()
    } });
export const YouTubeData = new MoveStruct({ name: `${$moduleName}::YouTubeData`, fields: {
        handle: bcs.string()
    } });
export const DiscordData = new MoveStruct({ name: `${$moduleName}::DiscordData`, fields: {
        handle: bcs.string()
    } });
export const TelegramData = new MoveStruct({ name: `${$moduleName}::TelegramData`, fields: {
        handle: bcs.string()
    } });
export const RedditData = new MoveStruct({ name: `${$moduleName}::RedditData`, fields: {
        handle: bcs.string()
    } });
export const TwitchData = new MoveStruct({ name: `${$moduleName}::TwitchData`, fields: {
        handle: bcs.string()
    } });
export const FacebookData = new MoveStruct({ name: `${$moduleName}::FacebookData`, fields: {
        handle: bcs.string()
    } });
export interface XArguments {
    handle: RawTransactionArgument<string>;
}
export interface XOptions {
    package?: string;
    arguments: XArguments | [
        handle: RawTransactionArgument<string>
    ];
}
/** Builds an X link from a handle. Aborts if empty. */
export function x(options: XOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["handle"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'x',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface InstagramArguments {
    handle: RawTransactionArgument<string>;
}
export interface InstagramOptions {
    package?: string;
    arguments: InstagramArguments | [
        handle: RawTransactionArgument<string>
    ];
}
/** Builds an Instagram link from a handle. Aborts if empty. */
export function instagram(options: InstagramOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["handle"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'instagram',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ThreadsArguments {
    handle: RawTransactionArgument<string>;
}
export interface ThreadsOptions {
    package?: string;
    arguments: ThreadsArguments | [
        handle: RawTransactionArgument<string>
    ];
}
/** Builds a Threads link from a handle. Aborts if empty. */
export function threads(options: ThreadsOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["handle"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'threads',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TiktokArguments {
    handle: RawTransactionArgument<string>;
}
export interface TiktokOptions {
    package?: string;
    arguments: TiktokArguments | [
        handle: RawTransactionArgument<string>
    ];
}
/** Builds a TikTok link from a handle. Aborts if empty. */
export function tiktok(options: TiktokOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["handle"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'tiktok',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface YoutubeArguments {
    handle: RawTransactionArgument<string>;
}
export interface YoutubeOptions {
    package?: string;
    arguments: YoutubeArguments | [
        handle: RawTransactionArgument<string>
    ];
}
/** Builds a YouTube link from a handle or channel identifier. Aborts if empty. */
export function youtube(options: YoutubeOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["handle"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'youtube',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DiscordArguments {
    handle: RawTransactionArgument<string>;
}
export interface DiscordOptions {
    package?: string;
    arguments: DiscordArguments | [
        handle: RawTransactionArgument<string>
    ];
}
/** Builds a Discord link from a server-invite code. Aborts if empty. */
export function discord(options: DiscordOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["handle"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'discord',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TelegramArguments {
    handle: RawTransactionArgument<string>;
}
export interface TelegramOptions {
    package?: string;
    arguments: TelegramArguments | [
        handle: RawTransactionArgument<string>
    ];
}
/** Builds a Telegram link from a username or channel. Aborts if empty. */
export function telegram(options: TelegramOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["handle"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'telegram',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RedditArguments {
    handle: RawTransactionArgument<string>;
}
export interface RedditOptions {
    package?: string;
    arguments: RedditArguments | [
        handle: RawTransactionArgument<string>
    ];
}
/** Builds a Reddit link from a username. Aborts if empty. */
export function reddit(options: RedditOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["handle"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'reddit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TwitchArguments {
    handle: RawTransactionArgument<string>;
}
export interface TwitchOptions {
    package?: string;
    arguments: TwitchArguments | [
        handle: RawTransactionArgument<string>
    ];
}
/** Builds a Twitch link from a channel name. Aborts if empty. */
export function twitch(options: TwitchOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["handle"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'twitch',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FacebookArguments {
    handle: RawTransactionArgument<string>;
}
export interface FacebookOptions {
    package?: string;
    arguments: FacebookArguments | [
        handle: RawTransactionArgument<string>
    ];
}
/** Builds a Facebook link from a page username or id. Aborts if empty. */
export function facebook(options: FacebookOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["handle"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'facebook',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface XHandleArguments {
    self: TransactionArgument;
}
export interface XHandleOptions {
    package?: string;
    arguments: XHandleArguments | [
        self: TransactionArgument
    ];
}
export function xHandle(options: XHandleOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'x_handle',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface InstagramHandleArguments {
    self: TransactionArgument;
}
export interface InstagramHandleOptions {
    package?: string;
    arguments: InstagramHandleArguments | [
        self: TransactionArgument
    ];
}
export function instagramHandle(options: InstagramHandleOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'instagram_handle',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ThreadsHandleArguments {
    self: TransactionArgument;
}
export interface ThreadsHandleOptions {
    package?: string;
    arguments: ThreadsHandleArguments | [
        self: TransactionArgument
    ];
}
export function threadsHandle(options: ThreadsHandleOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'threads_handle',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TiktokHandleArguments {
    self: TransactionArgument;
}
export interface TiktokHandleOptions {
    package?: string;
    arguments: TiktokHandleArguments | [
        self: TransactionArgument
    ];
}
export function tiktokHandle(options: TiktokHandleOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'tiktok_handle',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface YoutubeHandleArguments {
    self: TransactionArgument;
}
export interface YoutubeHandleOptions {
    package?: string;
    arguments: YoutubeHandleArguments | [
        self: TransactionArgument
    ];
}
export function youtubeHandle(options: YoutubeHandleOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'youtube_handle',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DiscordHandleArguments {
    self: TransactionArgument;
}
export interface DiscordHandleOptions {
    package?: string;
    arguments: DiscordHandleArguments | [
        self: TransactionArgument
    ];
}
export function discordHandle(options: DiscordHandleOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'discord_handle',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TelegramHandleArguments {
    self: TransactionArgument;
}
export interface TelegramHandleOptions {
    package?: string;
    arguments: TelegramHandleArguments | [
        self: TransactionArgument
    ];
}
export function telegramHandle(options: TelegramHandleOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'telegram_handle',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RedditHandleArguments {
    self: TransactionArgument;
}
export interface RedditHandleOptions {
    package?: string;
    arguments: RedditHandleArguments | [
        self: TransactionArgument
    ];
}
export function redditHandle(options: RedditHandleOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'reddit_handle',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TwitchHandleArguments {
    self: TransactionArgument;
}
export interface TwitchHandleOptions {
    package?: string;
    arguments: TwitchHandleArguments | [
        self: TransactionArgument
    ];
}
export function twitchHandle(options: TwitchHandleOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'twitch_handle',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FacebookHandleArguments {
    self: TransactionArgument;
}
export interface FacebookHandleOptions {
    package?: string;
    arguments: FacebookHandleArguments | [
        self: TransactionArgument
    ];
}
export function facebookHandle(options: FacebookHandleOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_social';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_social',
        function: 'facebook_handle',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}