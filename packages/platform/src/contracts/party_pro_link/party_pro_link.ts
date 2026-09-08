/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Professional / industry payloads for the `platform_link` primitive: an artist's
 * own website, booking/management/publisher/label pages, EPK, and creator-support
 * platforms (Patreon, Substack, Ko-fi).
 *
 * Two shapes here. A website / booking page / EPK has **no reconstructable
 * handle** — the URL _is_ the identity — so those store a full `url`. The creator
 * platforms have a handle like the social/music payloads and store just that, with
 * the URL rebuilt client-side. All validated non-empty plus the shared max-length
 * backstops (`platform_link::max_identifier_length()` / `max_url_length()`).
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/party_pro_link::party_pro_link';
export const WebsiteData = new MoveStruct({ name: `${$moduleName}::WebsiteData`, fields: {
        url: bcs.string()
    } });
export const BookingPageData = new MoveStruct({ name: `${$moduleName}::BookingPageData`, fields: {
        url: bcs.string()
    } });
export const ManagementPageData = new MoveStruct({ name: `${$moduleName}::ManagementPageData`, fields: {
        url: bcs.string()
    } });
export const PublisherPageData = new MoveStruct({ name: `${$moduleName}::PublisherPageData`, fields: {
        url: bcs.string()
    } });
export const LabelPageData = new MoveStruct({ name: `${$moduleName}::LabelPageData`, fields: {
        url: bcs.string()
    } });
export const EpkData = new MoveStruct({ name: `${$moduleName}::EpkData`, fields: {
        url: bcs.string()
    } });
export const PatreonData = new MoveStruct({ name: `${$moduleName}::PatreonData`, fields: {
        handle: bcs.string()
    } });
export const SubstackData = new MoveStruct({ name: `${$moduleName}::SubstackData`, fields: {
        subdomain: bcs.string()
    } });
export const KofiData = new MoveStruct({ name: `${$moduleName}::KofiData`, fields: {
        handle: bcs.string()
    } });
export interface WebsiteArguments {
    url: RawTransactionArgument<string>;
}
export interface WebsiteOptions {
    package?: string;
    arguments: WebsiteArguments | [
        url: RawTransactionArgument<string>
    ];
}
/** Builds a website link from a full URL. Aborts if empty. */
export function website(options: WebsiteOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["url"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'website',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface BookingPageArguments {
    url: RawTransactionArgument<string>;
}
export interface BookingPageOptions {
    package?: string;
    arguments: BookingPageArguments | [
        url: RawTransactionArgument<string>
    ];
}
/** Builds a booking-page link from a full URL. Aborts if empty. */
export function bookingPage(options: BookingPageOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["url"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'booking_page',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ManagementPageArguments {
    url: RawTransactionArgument<string>;
}
export interface ManagementPageOptions {
    package?: string;
    arguments: ManagementPageArguments | [
        url: RawTransactionArgument<string>
    ];
}
/** Builds a management-page link from a full URL. Aborts if empty. */
export function managementPage(options: ManagementPageOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["url"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'management_page',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PublisherPageArguments {
    url: RawTransactionArgument<string>;
}
export interface PublisherPageOptions {
    package?: string;
    arguments: PublisherPageArguments | [
        url: RawTransactionArgument<string>
    ];
}
/** Builds a publisher-page link from a full URL. Aborts if empty. */
export function publisherPage(options: PublisherPageOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["url"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'publisher_page',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface LabelPageArguments {
    url: RawTransactionArgument<string>;
}
export interface LabelPageOptions {
    package?: string;
    arguments: LabelPageArguments | [
        url: RawTransactionArgument<string>
    ];
}
/** Builds a label-page link from a full URL. Aborts if empty. */
export function labelPage(options: LabelPageOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["url"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'label_page',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EpkArguments {
    url: RawTransactionArgument<string>;
}
export interface EpkOptions {
    package?: string;
    arguments: EpkArguments | [
        url: RawTransactionArgument<string>
    ];
}
/** Builds an EPK link from a full URL. Aborts if empty. */
export function epk(options: EpkOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["url"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'epk',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PatreonArguments {
    handle: RawTransactionArgument<string>;
}
export interface PatreonOptions {
    package?: string;
    arguments: PatreonArguments | [
        handle: RawTransactionArgument<string>
    ];
}
/** Builds a Patreon link from a handle. Aborts if empty. */
export function patreon(options: PatreonOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["handle"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'patreon',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubstackArguments {
    subdomain: RawTransactionArgument<string>;
}
export interface SubstackOptions {
    package?: string;
    arguments: SubstackArguments | [
        subdomain: RawTransactionArgument<string>
    ];
}
/** Builds a Substack link from a subdomain. Aborts if empty. */
export function substack(options: SubstackOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["subdomain"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'substack',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface KofiArguments {
    handle: RawTransactionArgument<string>;
}
export interface KofiOptions {
    package?: string;
    arguments: KofiArguments | [
        handle: RawTransactionArgument<string>
    ];
}
/** Builds a Ko-fi link from a handle. Aborts if empty. */
export function kofi(options: KofiOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["handle"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'kofi',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WebsiteUrlArguments {
    self: TransactionArgument;
}
export interface WebsiteUrlOptions {
    package?: string;
    arguments: WebsiteUrlArguments | [
        self: TransactionArgument
    ];
}
export function websiteUrl(options: WebsiteUrlOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'website_url',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface BookingUrlArguments {
    self: TransactionArgument;
}
export interface BookingUrlOptions {
    package?: string;
    arguments: BookingUrlArguments | [
        self: TransactionArgument
    ];
}
export function bookingUrl(options: BookingUrlOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'booking_url',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ManagementUrlArguments {
    self: TransactionArgument;
}
export interface ManagementUrlOptions {
    package?: string;
    arguments: ManagementUrlArguments | [
        self: TransactionArgument
    ];
}
export function managementUrl(options: ManagementUrlOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'management_url',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PublisherUrlArguments {
    self: TransactionArgument;
}
export interface PublisherUrlOptions {
    package?: string;
    arguments: PublisherUrlArguments | [
        self: TransactionArgument
    ];
}
export function publisherUrl(options: PublisherUrlOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'publisher_url',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface LabelUrlArguments {
    self: TransactionArgument;
}
export interface LabelUrlOptions {
    package?: string;
    arguments: LabelUrlArguments | [
        self: TransactionArgument
    ];
}
export function labelUrl(options: LabelUrlOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'label_url',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EpkUrlArguments {
    self: TransactionArgument;
}
export interface EpkUrlOptions {
    package?: string;
    arguments: EpkUrlArguments | [
        self: TransactionArgument
    ];
}
export function epkUrl(options: EpkUrlOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'epk_url',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PatreonHandleArguments {
    self: TransactionArgument;
}
export interface PatreonHandleOptions {
    package?: string;
    arguments: PatreonHandleArguments | [
        self: TransactionArgument
    ];
}
export function patreonHandle(options: PatreonHandleOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'patreon_handle',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubstackSubdomainArguments {
    self: TransactionArgument;
}
export interface SubstackSubdomainOptions {
    package?: string;
    arguments: SubstackSubdomainArguments | [
        self: TransactionArgument
    ];
}
export function substackSubdomain(options: SubstackSubdomainOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'substack_subdomain',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface KofiHandleArguments {
    self: TransactionArgument;
}
export interface KofiHandleOptions {
    package?: string;
    arguments: KofiHandleArguments | [
        self: TransactionArgument
    ];
}
export function kofiHandle(options: KofiHandleOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_pro_link';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_pro_link',
        function: 'kofi_handle',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}