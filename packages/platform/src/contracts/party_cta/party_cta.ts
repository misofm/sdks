/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Off-Miso call-to-action links for a party — the "what do you want people to do"
 * row (Tickets, Merch, Newsletter, external Listen, …).
 *
 * Deliberately slim: a CTA is just a `{ label, url }`. On-Miso actions (collect /
 * listen-on-Miso / pin) are a different, interactive concern and live in
 * `party_featured`, which references object ids and can render live state — so
 * this package stays a plain, dependency-light external link hub.
 *
 * The CTAs are an ordered list: **position is priority**. The whole list is
 * written at once (`set_ctas`) — the natural fit for a drag-to-reorder editor that
 * saves on submit — so there are no per-entry ids to track. Gated by the
 * `PartyAdminCap`; views are permissionless.
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/party_cta::party_cta';
export const CtasKey = new MoveTuple({ name: `${$moduleName}::CtasKey`, fields: [bcs.bool()] });
export const Cta = new MoveStruct({ name: `${$moduleName}::Cta`, fields: {
        label: bcs.string(),
        url: bcs.string()
    } });
export const CtasSetEvent = new MoveStruct({ name: `${$moduleName}::CtasSetEvent`, fields: {
        party_id: bcs.Address,
        count: bcs.u64()
    } });
export const CtasClearedEvent = new MoveStruct({ name: `${$moduleName}::CtasClearedEvent`, fields: {
        party_id: bcs.Address
    } });
export interface NewCtaArguments {
    label: RawTransactionArgument<string>;
    url: RawTransactionArgument<string>;
}
export interface NewCtaOptions {
    package?: string;
    arguments: NewCtaArguments | [
        label: RawTransactionArgument<string>,
        url: RawTransactionArgument<string>
    ];
}
/**
 * Builds a CTA. Aborts if the label or url is empty or too long. Callers build the
 * ordered `vector<Cta>` client-side and submit it with `set_ctas`.
 */
export function newCta(options: NewCtaOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_cta';
    const argumentsTypes = [
        '0x1::string::String',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["label", "url"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_cta',
        function: 'new_cta',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface LabelArguments {
    self: TransactionArgument;
}
export interface LabelOptions {
    package?: string;
    arguments: LabelArguments | [
        self: TransactionArgument
    ];
}
/** The CTA's display label. */
export function label(options: LabelOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_cta';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_cta',
        function: 'label',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface UrlArguments {
    self: TransactionArgument;
}
export interface UrlOptions {
    package?: string;
    arguments: UrlArguments | [
        self: TransactionArgument
    ];
}
/** The CTA's destination url. */
export function url(options: UrlOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_cta';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_cta',
        function: 'url',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetCtasArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    ctas: TransactionArgument;
}
export interface SetCtasOptions {
    package?: string;
    arguments: SetCtasArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        ctas: TransactionArgument
    ];
}
/** Sets (or replaces) the party's ordered CTA list. Position is priority. */
export function setCtas(options: SetCtasOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_cta';
    const argumentsTypes = [
        null,
        null,
        'vector<null>'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "ctas"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_cta',
        function: 'set_ctas',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ClearCtasArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface ClearCtasOptions {
    package?: string;
    arguments: ClearCtasArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
}
/** Removes the party's CTA list. No-op if none is set. */
export function clearCtas(options: ClearCtasOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_cta';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_cta',
        function: 'clear_ctas',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasCtasArguments {
    self: RawTransactionArgument<string>;
}
export interface HasCtasOptions {
    package?: string;
    arguments: HasCtasArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Whether the party has a CTA list. */
export function hasCtas(options: HasCtasOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_cta';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_cta',
        function: 'has_ctas',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CtasArguments {
    self: RawTransactionArgument<string>;
}
export interface CtasOptions {
    package?: string;
    arguments: CtasArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** The party's ordered CTA list (empty if unset). */
export function ctas(options: CtasOptions) {
    const packageAddress = options.package ?? '@local-pkg/party_cta';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party_cta',
        function: 'ctas',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}