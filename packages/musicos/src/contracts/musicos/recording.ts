/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Represents an audio recording of a composition in musicos. Recordings are the
 * audio performances that are distributed and played. Each recording has its own
 * share token for ownership distribution.
 *
 * ### Key Features:
 *
 * - Share token initialization with fixed supply (10M tokens, 6 decimals)
 * - State machine: Initialized -> Published (embedded fields immutable after
 *   publish; dynamic fields remain extensible via `uid_mut`, e.g. masters, and
 *   credits/attribution attached by the credits extension)
 * - Deterministic addresses via derived object pattern
 *
 * Attribution (credits, primary/featured artists) is intentionally NOT part of
 * core: it is display-oriented, varies across platforms, and is never read by the
 * economics. It lives in a first-party credits extension attached via `uid_mut`,
 * so core takes no dependency on an identity package and core publish enforces no
 * attribution.
 *
 * A recording carries no name of its own. Its display title is its composition's
 * title, read by reference — composition titles are immutable, so an embedded copy
 * would carry no information. Anything that names this particular take — "(Live)",
 * "Radio Edit", a translated title — has more than one correct rendering, which
 * makes it presentation, and presentation lives in the metadata extension, never
 * in the frozen core. Core stores what a recording _is_; extensions describe it.
 *
 * ### Lifecycle and trust model
 *
 * A recording is `key`-only with no `drop`: a fresh `Initialized` object cannot be
 * transferred, wrapped, publicly shared, or discarded, and its only by-value
 * consumer is `publish`. Create-and-publish is therefore atomic by construction —
 * an `Initialized` recording cannot outlive its creating transaction, and every
 * recording that exists on-chain is `Published` and shared. There is deliberately
 * no keep function; staged building must fit one transaction.
 *
 * `uid_mut` works in any lifecycle state and is permanent root over ALL dynamic
 * fields on the object — including fields attached by other extensions. "Immutable
 * after publish" covers the embedded fields only; extension-layer data stays
 * admin-mutable in perpetuity. This is the designed extension surface, and it is
 * the one trust assumption that never expires: integrators should model the cap
 * holder as able to mutate or delete any extension data, forever.
 *
 * The recording carries its parent composition's identity two ways. The
 * `CompositionShare` phantom type parameter is the durable identity (a share
 * currency is published independently of musicos and survives a fresh republish,
 * whereas an object ID does not) and makes the recording↔composition lineage
 * compile-time enforced wherever the two meet. The embedded `composition_id` is
 * the address-level handle: Move cannot chase a type (or an ID) to an object, so
 * on-chain consumers holding only `&Recording` — or a bare `Track` — could not
 * otherwise reach the composition at all. Both are set at creation and immutable,
 * so they cannot diverge.
 *
 * A recording is its own freshly-created object (`object::new`), not a derived
 * child of its composition: `recording::new` takes a read-only `&Composition`
 * (only to read its royalty rate and id), so publishing recordings under a
 * composition neither contends on the composition's shared-object version nor
 * collides on a per-composition index.
 */

import { MoveEnum, MoveStruct, MoveTuple, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/musicos::recording';
/** Lifecycle state of a recording. */
export const RecordingState = new MoveEnum({ name: `${$moduleName}::RecordingState`, fields: {
        /** Recording is being set up and can be modified. */
        Initialized: null,
        /** Recording is published and immutable. Includes publication timestamp. */
        Published: bcs.u64()
    } });
export const Recording = new MoveStruct({ name: `${$moduleName}::Recording<phantom RecordingShare, phantom CompositionShare>`, fields: {
        /** Unique identifier for this recording. */
        id: bcs.Address,
        /** Current lifecycle state. */
        state: RecordingState,
        /**
         * Object ID of the parent composition. The address-level counterpart of the
         * `CompositionShare` phantom, set from the `&Composition` passed to `new` (the
         * shared phantom proves the pairing). An identity handle — not a revenue routing
         * target: the composition is paid through its recording-share ownership, settled
         * at creation.
         */
        composition_id: bcs.Address
    } });
export const RecordingAdminCap = new MoveStruct({ name: `${$moduleName}::RecordingAdminCap<phantom RecordingShare>`, fields: {
        /** Unique identifier for this capability. */
        id: bcs.Address
    } });
export const RecordingAdminCapKey = new MoveTuple({ name: `${$moduleName}::RecordingAdminCapKey`, fields: [bcs.bool()] });
export const RecordingPublishedEvent = new MoveStruct({ name: `${$moduleName}::RecordingPublishedEvent<phantom RecordingShare, phantom CompositionShare>`, fields: {
        recording_id: bcs.Address
    } });
export const CompositionSharesGrantedEvent = new MoveStruct({ name: `${$moduleName}::CompositionSharesGrantedEvent<phantom RecordingShare, phantom CompositionShare>`, fields: {
        recording_id: bcs.Address,
        composition_id: bcs.Address,
        /** Recording-share base units granted to the composition. */
        value: bcs.u64(),
        /** The composition royalty rate applied at creation, in basis points. */
        rate_bps: bcs.u16(),
        granted_by: bcs.Address
    } });
export interface NewArguments {
    composition: RawTransactionArgument<string>;
    shareCurrency: RawTransactionArgument<string>;
    shareTreasuryCap: RawTransactionArgument<string>;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        composition: RawTransactionArgument<string>,
        shareCurrency: RawTransactionArgument<string>,
        shareTreasuryCap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Creates a new recording for a composition.
 *
 * Initializes share tokens (10M supply, 6 decimals), then splits the composition's
 * royalty-rate worth of those shares off the freshly minted supply and
 * `send_funds`es them to the composition's address. This settles the composition's
 * cut as cap-table ownership: the composition literally owns its share of the
 * recording, so its claim on recording revenue is enforced by share ownership
 * rather than by any revenue distributor choosing to honor a rate. What the
 * composition owner then does with the shares (hold, stake, sell) is outside the
 * protocol's scope.
 *
 * The composition's royalty rate is immutable, so the rate a recorder's client
 * displayed is exactly the rate applied here — no slippage protection is needed or
 * possible. Whether that rate is acceptable is the recorder's decision to make
 * before calling; per-deal deviations settle as voluntary share transfers after
 * creation.
 *
 * The composition need not be `Published`: within the composition's own creating
 * transaction its creator can already mint recordings against it. Third parties
 * only ever see `Published`, shared compositions (an `Initialized` one cannot
 * escape its creating transaction), so indexers may observe a recording created
 * "against an unpublished composition" only as an intra-transaction ordering,
 * never across transactions.
 *
 * Returns:
 *
 * - The recording object (typed to its parent composition's `CompositionShare`)
 * - Admin capability for the owner
 * - The creator's remaining share balance (full supply minus the composition's
 *   cut)
 */
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["composition", "shareCurrency", "shareTreasuryCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PublishArguments {
    self: RawTransactionArgument<string>;
    _: RawTransactionArgument<string>;
}
export interface PublishOptions {
    package?: string;
    arguments: PublishArguments | [
        self: RawTransactionArgument<string>,
        _: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Publishes the recording, making its embedded fields immutable. Required State:
 * Initialized
 *
 * Note: core enforces no attribution requirement — credits live in the credits
 * extension and may be attached before or after publish via `uid_mut`.
 */
export function publish(options: PublishOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "_"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording',
        function: 'publish',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface CompositionIdArguments {
    self: RawTransactionArgument<string>;
}
export interface CompositionIdOptions {
    package?: string;
    arguments: CompositionIdArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Returns the object ID of the parent composition. An identity/membership handle
 * (the address-level counterpart of the `CompositionShare` phantom) — not a
 * revenue routing target: the composition is paid via its recording-share
 * ownership.
 */
export function compositionId(options: CompositionIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording',
        function: 'composition_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UidArguments {
    self: RawTransactionArgument<string>;
}
export interface UidOptions {
    package?: string;
    arguments: UidArguments | [
        self: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/** Returns a reference to the recording's UID for reading dynamic fields. */
export function uid(options: UidOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording',
        function: 'uid',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UidMutArguments {
    self: RawTransactionArgument<string>;
    _: RawTransactionArgument<string>;
}
export interface UidMutOptions {
    package?: string;
    arguments: UidMutArguments | [
        self: RawTransactionArgument<string>,
        _: RawTransactionArgument<string>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Returns a mutable reference to the recording's UID. Requires the admin
 * capability. Works in any lifecycle state — dynamic fields are the extension
 * surface (e.g. masters, credits) and stay admin-mutable after publish; only the
 * embedded fields are frozen. The reference is root over every dynamic field on
 * the object, including fields attached by other extensions.
 */
export function uidMut(options: UidMutOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "_"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recording',
        function: 'uid_mut',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}