/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Represents a music release in musicos. A release is an ordered tracklist with
 * per-track revenue distribution configuration. Cover art lives in the `cover_art`
 * extension, not in core.
 *
 * The tracklist is deliberately FLAT — a `vector<Track>` with no disc structure.
 * Grouping a sequence into discs, vinyl sides, acts, or movements is a property of
 * a distribution medium, not of the release: it has more than one correct
 * rendering, which makes it presentation, and presentation lives in the metadata
 * extension. A consequence worth stating: the stored tracklist and the digest
 * pre-image have the same shape, so what signers consented to is exactly what is
 * stored — nothing structural is chosen after consent except the title.
 *
 * ### Key Features:
 *
 * - Ordered flat tracklist (grouping is presentation, in the metadata extension)
 * - Configurable per-track revenue splits
 * - State machine: Initialized -> Published
 *
 * Attribution (credits, primary/featured artists) is intentionally NOT part of
 * core: it is display-oriented, varies across platforms, and is never read by the
 * economics. It lives in a first-party credits extension attached via `uid_mut`,
 * so core takes no dependency on an identity package and core publish enforces no
 * attribution.
 *
 * The same rule governs naming. Core stores what a thing _is_ — identity and
 * everything the economics read; extensions describe it. The release's `title` is
 * the one embedded name: it is constitutive (naming the package is part of
 * creating it) and freezing it at publish is a buyer-facing guarantee. Edition
 * naming ("Deluxe Edition"), disc titles, localized titles, and DSP-shaped slots
 * all have more than one correct rendering — presentation — and live in the
 * metadata extension.
 *
 * ### Consent scope
 *
 * The release digest — and therefore the derived release id every `Track` commits
 * to at creation — binds the economics and membership of the release: the ordered
 * list of `(recording, split)` pairs and the creator's nonce. It deliberately
 * binds nothing else. The title — the one embedded field outside the digest — and
 * everything in the extension layer (artwork, credits, display grouping) are
 * chosen by the release creator, before or after tracks are created, and are
 * trusted and publicly attributable rather than cryptographically committed. See
 * `track::new` for the signer-side statement of this boundary.
 *
 * The derived id commits to the canonical registry's UID and the digest, not the
 * digest alone — so targeting an id also consents to that namespace's liveness. If
 * that parent were deleted, or its `&mut UID` became permanently unreachable, the
 * release could never exist and every track or offer targeting it would be
 * stranded — the same blast-radius class as a release that simply never publishes.
 * `ReleaseRegistry` is therefore created and shared exactly once at package
 * initialization, and exposes neither a constructor, deletion path, nor mutable
 * UID accessor.
 *
 * ### Lifecycle and trust model
 *
 * A release is `key`-only with no `drop`: a fresh `Initialized` object cannot be
 * transferred, wrapped, publicly shared, or discarded, and its only by-value
 * consumer is `publish`. Create-and-publish is therefore atomic by construction —
 * an `Initialized` release cannot outlive its creating transaction, and every
 * release that exists on-chain is `Published` and shared. There is deliberately no
 * keep function; assembling tracks, discs, and the release must fit one
 * transaction.
 *
 * `uid_mut` works in any lifecycle state and is permanent root over ALL dynamic
 * fields on the object — including fields attached by other extensions. "Immutable
 * after publish" covers the embedded fields only; extension-layer data stays
 * admin-mutable in perpetuity. This is the designed extension surface, and it is
 * the one trust assumption that never expires: integrators should model the cap
 * holder as able to mutate or delete any extension data, forever.
 */

import { MoveEnum, MoveStruct, MoveTuple, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as track from './track.ts';
const $moduleName = '@local-pkg/musicos::release';
/** Lifecycle state of a release. */
export const ReleaseState = new MoveEnum({ name: `${$moduleName}::ReleaseState`, fields: {
        /** Release is initialized but not yet published. */
        Initialized: null,
        /** Release is published and immutable. Includes publication timestamp. */
        Published: bcs.u64()
    } });
export const Release = new MoveStruct({ name: `${$moduleName}::Release`, fields: {
        /** Unique identifier for this release. */
        id: bcs.Address,
        /** Current lifecycle state. */
        state: ReleaseState,
        /** Title of the release. */
        title: bcs.string(),
        /**
         * The ordered tracklist. Same shape as the digest pre-image every track's creator
         * consented to; display grouping lives in the metadata extension.
         */
        tracks: bcs.vector(track.Track)
    } });
export const ReleaseRegistry = new MoveStruct({ name: `${$moduleName}::ReleaseRegistry`, fields: {
        id: bcs.Address
    } });
export const ReleaseKey = new MoveTuple({ name: `${$moduleName}::ReleaseKey`, fields: [bcs.vector(bcs.u8())] });
export const ReleaseAdminCap = new MoveStruct({ name: `${$moduleName}::ReleaseAdminCap`, fields: {
        /** Unique identifier for this capability. */
        id: bcs.Address,
        /** ID of the release this capability controls. */
        release_id: bcs.Address
    } });
export const ReleaseAdminCapKey = new MoveTuple({ name: `${$moduleName}::ReleaseAdminCapKey`, fields: [bcs.bool()] });
export const ReleaseCreatedEvent = new MoveStruct({ name: `${$moduleName}::ReleaseCreatedEvent`, fields: {
        registry_id: bcs.Address,
        release_id: bcs.Address,
        release_admin_cap_id: bcs.Address,
        title_bytes: bcs.vector(bcs.u8()),
        release_digest: bcs.vector(bcs.u8()),
        nonce: bcs.u256(),
        composition_ids: bcs.vector(bcs.Address),
        recording_ids: bcs.vector(bcs.Address),
        track_split_bps: bcs.vector(bcs.u64()),
        track_count: bcs.u64()
    } });
export const ReleasePublishedEvent = new MoveStruct({ name: `${$moduleName}::ReleasePublishedEvent`, fields: {
        release_id: bcs.Address,
        release_admin_cap_id: bcs.Address,
        clock_id: bcs.Address,
        title_bytes: bcs.vector(bcs.u8()),
        published_at_ms: bcs.u64(),
        composition_ids: bcs.vector(bcs.Address),
        recording_ids: bcs.vector(bcs.Address),
        track_split_bps: bcs.vector(bcs.u64()),
        assigned_track_count: bcs.u64(),
        shared_after: bcs.bool()
    } });
export const ReleaseRegistryCreatedEvent = new MoveStruct({ name: `${$moduleName}::ReleaseRegistryCreatedEvent`, fields: {
        registry_id: bcs.Address,
        created_by: bcs.Address,
        shared_after: bcs.bool()
    } });
export interface NewArguments {
    self: RawTransactionArgument<string>;
    title: RawTransactionArgument<string>;
    tracks: TransactionArgument;
    nonce: RawTransactionArgument<number | bigint>;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        self: RawTransactionArgument<string>,
        title: RawTransactionArgument<string>,
        tracks: TransactionArgument,
        nonce: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Assembles a release under the canonical registry namespace. This is
 * permissionless: consent is carried by the supplied tracks, each of which was
 * created for the exact derived release id. Returns the release and admin
 * capability by value so the caller can compose `publish` and custody in the same
 * PTB.
 */
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null,
        '0x1::string::String',
        'vector<null>',
        'u256'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "title", "tracks", "nonce"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeriveTargetReleaseIdArguments {
    self: RawTransactionArgument<string>;
    recordingIds: RawTransactionArgument<Array<string>>;
    trackSplitValues: RawTransactionArgument<Array<number | bigint>>;
    nonce: RawTransactionArgument<number | bigint>;
}
export interface DeriveTargetReleaseIdOptions {
    package?: string;
    arguments: DeriveTargetReleaseIdArguments | [
        self: RawTransactionArgument<string>,
        recordingIds: RawTransactionArgument<Array<string>>,
        trackSplitValues: RawTransactionArgument<Array<number | bigint>>,
        nonce: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Derives the release id that `new` would claim under this registry, without
 * creating a release. This immutable shared-object access remains parallelizable
 * for clients preparing tracks.
 */
export function deriveTargetReleaseId(options: DeriveTargetReleaseIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null,
        'vector<0x2::object::ID>',
        'vector<u64>',
        'u256'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "recordingIds", "trackSplitValues", "nonce"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release',
        function: 'derive_target_release_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReleaseRegistryIdArguments {
    self: RawTransactionArgument<string>;
}
export interface ReleaseRegistryIdOptions {
    package?: string;
    arguments: ReleaseRegistryIdArguments | [
        self: RawTransactionArgument<string>
    ];
}
/**
 * Returns the canonical registry's object ID, which is the derivation parent
 * committed to by `new` and `derive_target_release_id`. Exported as the
 * `ReleaseRegistry.id()` method to avoid colliding with the existing
 * `release::id(&Release)` ABI function.
 */
export function releaseRegistryId(options: ReleaseRegistryIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release',
        function: 'release_registry_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PublishArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface PublishOptions {
    package?: string;
    arguments: PublishArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
}
/**
 * Publishes the release, making it immutable. Track splits must be set and sum to
 * 100% before publishing. Required State: Initialized
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
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release',
        function: 'publish',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AuthorizeArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface AuthorizeOptions {
    package?: string;
    arguments: AuthorizeArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
}
/** Verifies that the admin capability matches this release. */
export function authorize(options: AuthorizeOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release',
        function: 'authorize',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TitleArguments {
    self: RawTransactionArgument<string>;
}
export interface TitleOptions {
    package?: string;
    arguments: TitleArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Returns the release title. */
export function title(options: TitleOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release',
        function: 'title',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TracksArguments {
    self: RawTransactionArgument<string>;
}
export interface TracksOptions {
    package?: string;
    arguments: TracksArguments | [
        self: RawTransactionArgument<string>
    ];
}
/**
 * Returns a reference to the ordered tracklist. The single tracklist accessor —
 * consumers derive length, membership, and per-track data from it
 * (`tracks().length()`, `tracks().any!(..)`, indexing).
 */
export function tracks(options: TracksOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release',
        function: 'tracks',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReleaseAdminCapReleaseIdArguments {
    cap: RawTransactionArgument<string>;
}
export interface ReleaseAdminCapReleaseIdOptions {
    package?: string;
    arguments: ReleaseAdminCapReleaseIdArguments | [
        cap: RawTransactionArgument<string>
    ];
}
/** Returns the release ID associated with the admin capability. */
export function releaseAdminCapReleaseId(options: ReleaseAdminCapReleaseIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release',
        function: 'release_admin_cap_release_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
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
}
/** Returns a reference to the release's UID for reading dynamic fields. */
export function uid(options: UidOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release',
        function: 'uid',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface UidMutArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface UidMutOptions {
    package?: string;
    arguments: UidMutArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
}
/**
 * Returns a mutable reference to the release's UID. Requires the admin capability.
 * Works in any lifecycle state — dynamic fields are the extension surface (e.g.
 * credits) and stay admin-mutable after publish; only the embedded fields are
 * frozen. The reference is root over every dynamic field on the object, including
 * fields attached by other extensions.
 */
export function uidMut(options: UidMutOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release',
        function: 'uid_mut',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}