/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/** Typed payment receipts for any live Sui object. */

import { type BcsType, bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as type_name from './deps/std/type_name.ts';
const $moduleName = '@local-pkg/miso_pay::pay';
/** Emitted after a payment has been deposited to the target object's address. */
export function PaymentSentEvent<Metadata extends BcsType<any>>(...typeParameters: [
    Metadata
]) {
    return new MoveStruct({ name: `${$moduleName}::PaymentSentEvent<phantom Target, phantom Currency, ${typeParameters[0].name as Metadata['name']}>`, fields: {
            target_id: bcs.Address,
            target_type: type_name.TypeName,
            payer: bcs.Address,
            value: bcs.u64(),
            metadata: typeParameters[0],
            paid_at_ms: bcs.u64()
        } });
}
export interface TargetIdArguments {
    receipt: TransactionArgument;
}
export interface TargetIdOptions {
    package?: string;
    arguments: TargetIdArguments | [
        receipt: TransactionArgument
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
/** Object ID whose address received the deposited funds. */
export function targetId(options: TargetIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_pay';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["receipt"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pay',
        function: 'target_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface TargetTypeArguments {
    receipt: TransactionArgument;
}
export interface TargetTypeOptions {
    package?: string;
    arguments: TargetTypeArguments | [
        receipt: TransactionArgument
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
/** Defining type of the object that received the payment. */
export function targetType(options: TargetTypeOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_pay';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["receipt"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pay',
        function: 'target_type',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PayerArguments {
    receipt: TransactionArgument;
}
export interface PayerOptions {
    package?: string;
    arguments: PayerArguments | [
        receipt: TransactionArgument
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
/** Transaction sender authenticated by the Sui runtime. */
export function payer(options: PayerOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_pay';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["receipt"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pay',
        function: 'payer',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ValueArguments {
    receipt: TransactionArgument;
}
export interface ValueOptions {
    package?: string;
    arguments: ValueArguments | [
        receipt: TransactionArgument
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
/** Deposited amount in the currency's smallest unit. */
export function value(options: ValueOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_pay';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["receipt"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pay',
        function: 'value',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface MetadataArguments {
    receipt: TransactionArgument;
}
export interface MetadataOptions {
    package?: string;
    arguments: MetadataArguments | [
        receipt: TransactionArgument
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
/** Caller-defined typed payment metadata. */
export function metadata(options: MetadataOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_pay';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["receipt"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pay',
        function: 'metadata',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PaidAtMsArguments {
    receipt: TransactionArgument;
}
export interface PaidAtMsOptions {
    package?: string;
    arguments: PaidAtMsArguments | [
        receipt: TransactionArgument
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
/** Clock timestamp captured when the payment was deposited. */
export function paidAtMs(options: PaidAtMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/miso_pay';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["receipt"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pay',
        function: 'paid_at_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PayArguments<Target extends BcsType<any>, Metadata extends BcsType<any>> {
    target: RawTransactionArgument<Target>;
    payment: TransactionArgument;
    metadata: RawTransactionArgument<Metadata>;
}
export interface PayOptions<Target extends BcsType<any>, Metadata extends BcsType<any>> {
    package?: string;
    arguments: PayArguments<Target, Metadata> | [
        target: RawTransactionArgument<Target>,
        payment: TransactionArgument,
        metadata: RawTransactionArgument<Metadata>
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
/**
 * Deposits a non-zero balance at a live object's funds accumulator and emits a
 * self-contained, typed receipt. It intentionally performs no distribution.
 * Callers decompose a `Coin` into a `Balance` with `coin::into_balance` in the
 * enclosing PTB.
 *
 * Integrator warning: funds land at the target object's address accumulator. If
 * the target type has no withdrawal path (or the object is later deleted), the
 * payment is stranded permanently — only pay targets with a known withdrawal
 * route. Receipts are events: off-chain consumers must filter on the emitting
 * package ID before trusting a `PaymentSentEvent`, and `metadata` is
 * caller-controlled, not payee-attested.
 */
export function pay<Target extends BcsType<any>, Metadata extends BcsType<any>>(options: PayOptions<Target, Metadata>) {
    const packageAddress = options.package ?? '@local-pkg/miso_pay';
    const argumentsTypes = [
        `${options.typeArguments[0]}`,
        null,
        `${options.typeArguments[2]}`,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["target", "payment", "metadata"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pay',
        function: 'pay',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PayCompositionArguments<Metadata extends BcsType<any>> {
    self: RawTransactionArgument<string>;
    payment: TransactionArgument;
    metadata: RawTransactionArgument<Metadata>;
}
export interface PayCompositionOptions<Metadata extends BcsType<any>> {
    package?: string;
    arguments: PayCompositionArguments<Metadata> | [
        self: RawTransactionArgument<string>,
        payment: TransactionArgument,
        metadata: RawTransactionArgument<Metadata>
    ];
    typeArguments: [
        string,
        string,
        string
    ];
}
/** Ergonomic typed form for a composition payment. */
export function payComposition<Metadata extends BcsType<any>>(options: PayCompositionOptions<Metadata>) {
    const packageAddress = options.package ?? '@local-pkg/miso_pay';
    const argumentsTypes = [
        null,
        null,
        `${options.typeArguments[2]}`,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "payment", "metadata"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pay',
        function: 'pay_composition',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PayRecordingArguments<Metadata extends BcsType<any>> {
    self: RawTransactionArgument<string>;
    payment: TransactionArgument;
    metadata: RawTransactionArgument<Metadata>;
}
export interface PayRecordingOptions<Metadata extends BcsType<any>> {
    package?: string;
    arguments: PayRecordingArguments<Metadata> | [
        self: RawTransactionArgument<string>,
        payment: TransactionArgument,
        metadata: RawTransactionArgument<Metadata>
    ];
    typeArguments: [
        string,
        string,
        string,
        string
    ];
}
/** Ergonomic typed form for a recording payment. */
export function payRecording<Metadata extends BcsType<any>>(options: PayRecordingOptions<Metadata>) {
    const packageAddress = options.package ?? '@local-pkg/miso_pay';
    const argumentsTypes = [
        null,
        null,
        `${options.typeArguments[3]}`,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "payment", "metadata"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pay',
        function: 'pay_recording',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PayReleaseArguments<Metadata extends BcsType<any>> {
    self: RawTransactionArgument<string>;
    payment: TransactionArgument;
    metadata: RawTransactionArgument<Metadata>;
}
export interface PayReleaseOptions<Metadata extends BcsType<any>> {
    package?: string;
    arguments: PayReleaseArguments<Metadata> | [
        self: RawTransactionArgument<string>,
        payment: TransactionArgument,
        metadata: RawTransactionArgument<Metadata>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Ergonomic typed form for a release payment. */
export function payRelease<Metadata extends BcsType<any>>(options: PayReleaseOptions<Metadata>) {
    const packageAddress = options.package ?? '@local-pkg/miso_pay';
    const argumentsTypes = [
        null,
        null,
        `${options.typeArguments[1]}`,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "payment", "metadata"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pay',
        function: 'pay_release',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}