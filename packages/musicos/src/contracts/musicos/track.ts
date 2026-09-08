/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Represents a track on a release, linking a recording to its position in the
 * tracklist.
 *
 * A `Track` is the minimal positioned (recording, revenue-share) pair:
 *
 * - `recording_id` — the routing target for the track's revenue, and the handle
 *   through which all other metadata (title, cover art, and the
 *   recording/composition share-type identities) is reached.
 * - `composition_id` — the identity of the recording's underlying work, so the
 *   composition–recording–release graph is walkable on-chain from the release
 *   alone. Move cannot chase an ID to an object, so this edge is unreachable in a
 *   track loop unless embedded here.
 * - `split_bps` — this track's share of the release's revenue; genuinely
 *   release-specific and not derivable from the recording.
 * - `state` — the assign-once lifecycle that carries (then sheds) the recording
 *   admin's target release commitment, made at creation; see `TrackState`.
 *
 * `Track` is intentionally monomorphic: a `Release` holds a `vector<Track>` of
 * tracks from many different recordings/compositions, so it cannot be generic over
 * their share types. It stores no title, cover art, or share-type — those are
 * consumed off-chain and derived from the recording via `recording_id`; a `Track`
 * embeds exactly the facts on-chain consumers cannot reach any other way.
 */

import { MoveEnum, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as bps from './deps/bps/bps.ts';
const $moduleName = '@local-pkg/musicos::track';
/**
 * Lifecycle state of a track within a release. A track is born `Unassigned`,
 * carrying the target release id the consent committed to at creation (the release
 * id is a digest of the whole tracklist, so this is the recording owner's consent
 * to the exact release configuration). At publish the release verifies the match
 * and transitions the track to `Assigned`, which carries no id — shedding the
 * 32-byte commitment once it has served its purpose.
 */
export const TrackState = new MoveEnum({ name: `${$moduleName}::TrackState`, fields: {
        /**
          * Track has been created but not yet assigned to a release. Carries the target
          * release id the consent committed to at creation.
          */
        Unassigned: bcs.Address,
        /** Track has been assigned to its target release. */
        Assigned: null
    } });
export const Track = new MoveStruct({ name: `${$moduleName}::Track`, fields: {
        /** Current state of the track. */
        state: TrackState,
        /**
         * ID of the composition underlying this track's recording. An identity and
         * membership handle — NOT a revenue routing target: the composition is paid
         * through its recording-share ownership (settled at `recording::new`), so a track
         * routes its full split to the recording. Immutable and safe to denormalize: the
         * recording↔composition pairing is fixed at recording creation.
         */
        composition_id: bcs.Address,
        /**
         * ID of the recording on this track. The routing target for the track's revenue;
         * also the handle a consumer uses to fetch the recording (whose type carries the
         * recording and composition share-type identities).
         */
        recording_id: bcs.Address,
        /**
         * This track's share of the release's revenue, in basis points. All tracks in a
         * release sum to 100%. The composition's cut is settled as recording-share
         * ownership at recording creation, so it is not split out here — a track routes
         * its full share to the recording.
         */
        split_bps: bps.BPS
    } });
export interface NewArguments {
    _: RawTransactionArgument<string>;
    recording: RawTransactionArgument<string>;
    targetReleaseId: RawTransactionArgument<string>;
    trackSplitBpsValue: RawTransactionArgument<number>;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        _: RawTransactionArgument<string>,
        recording: RawTransactionArgument<string>,
        targetReleaseId: RawTransactionArgument<string>,
        trackSplitBpsValue: RawTransactionArgument<number>
    ];
    typeArguments: [
        string,
        string
    ];
}
/**
 * Creates a new track: the recording admin's consent to that recording's inclusion
 * in a specific future release with an agreed split. Requires the recording admin
 * capability. No event: a `Track` has `drop` and is not an object, so a creation
 * event could announce a consent that is then silently discarded, and indexers
 * would be unable to distinguish pending from dead. Pre-publish observability is
 * the responsibility of whatever wraps the track (see below).
 *
 * The recording↔composition pairing is compile-time enforced by the recording's
 * `CompositionShare` phantom, and its address-level counterpart is embedded on the
 * recording at creation — so the composition id is copied from the `&Recording`
 * argument with no `Composition` argument and no runtime check needed.
 *
 * ### What creating a track consents to
 *
 * `target_release_id` is derived from the release digest, so targeting it consents
 * to that release's exact economics and membership: the ordered list of
 * `(recording, split)` pairs and the creator's nonce, nothing more. The release's
 * title, artwork, credits, and display grouping are chosen by the release creator
 * — before or after this track is created — and are not bound by the digest.
 * Presentation is trusted and publicly attributable, not cryptographically
 * committed.
 *
 * The recording need not be `Published`: its admin can create tracks inside the
 * recording's own creating transaction (an `Initialized` recording cannot escape
 * that transaction, so across transactions tracks always reference `Published`,
 * shared recordings).
 *
 * A `Track` has `store`, not `key`: it carries no identity of its own, so it may
 * be exercised synchronously in the same transaction that creates it, or handed to
 * an offer extension that wraps it in a real object with its own identity.
 * Withdrawal, expiry, and rejection are then whatever that wrapping extension
 * encodes — visible in its type, not in core.
 *
 * `recording` compile-time-binds the `RecordingShare`/`CompositionShare` phantom
 * pairing, and is read for its own id and its embedded composition id: the
 * monomorphic `Track` must store both _addresses_ — the recording's for revenue
 * routing, the composition's for graph reachability — and an address cannot come
 * from a phantom.
 */
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null,
        null,
        '0x2::object::ID',
        'u16'
    ] satisfies (string | null)[];
    const parameterNames = ["_", "recording", "targetReleaseId", "trackSplitBpsValue"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'track',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RecordingIdArguments {
    self: TransactionArgument;
}
export interface RecordingIdOptions {
    package?: string;
    arguments: RecordingIdArguments | [
        self: TransactionArgument
    ];
}
/** Returns the ID of the recording. */
export function recordingId(options: RecordingIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'track',
        function: 'recording_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CompositionIdArguments {
    self: TransactionArgument;
}
export interface CompositionIdOptions {
    package?: string;
    arguments: CompositionIdArguments | [
        self: TransactionArgument
    ];
}
/**
 * Returns the ID of the composition underlying this track's recording. An
 * identity/membership handle (e.g. "is this composition on this release?") — not a
 * revenue routing target: the composition is paid via its recording-share
 * ownership, and a track routes its full split to the recording.
 */
export function compositionId(options: CompositionIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'track',
        function: 'composition_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SplitBpsArguments {
    self: TransactionArgument;
}
export interface SplitBpsOptions {
    package?: string;
    arguments: SplitBpsArguments | [
        self: TransactionArgument
    ];
}
/** Returns this track's share of the release's revenue (in basis points). */
export function splitBps(options: SplitBpsOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'track',
        function: 'split_bps',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TargetReleaseIdArguments {
    self: TransactionArgument;
}
export interface TargetReleaseIdOptions {
    package?: string;
    arguments: TargetReleaseIdArguments | [
        self: TransactionArgument
    ];
}
/**
 * Returns the target release id this track's creator consented to. Aborts if the
 * track is `Assigned`: an assigned track only exists inside a published release,
 * so its release is the object you fetched it from.
 */
export function targetReleaseId(options: TargetReleaseIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/musicos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'track',
        function: 'target_release_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}