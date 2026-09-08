/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Represents parties (individuals or groups) that participate in on-chain
 * activities. A party is a named entity with capability-based authorization.
 *
 * ### Key Features:
 *
 * - Individual and group party types
 * - Extensible metadata via dynamic fields
 * - Capability-based authorization for modifications
 * - Groups can contain multiple individual parties
 */

import { MoveEnum, MoveStruct, MoveTuple, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as vec_set from './deps/sui/vec_set.ts';
const $moduleName = '@local-pkg/partyos::party';
/** The type of self: individual person or group. */
export const PartyKind = new MoveEnum({ name: `${$moduleName}::PartyKind`, fields: {
        /** A single person (artist, producer, etc.). */
        Individual: null,
        /** A group containing multiple individual parties. */
        Group: vec_set.VecSet(bcs.Address)
    } });
export const Party = new MoveStruct({ name: `${$moduleName}::Party`, fields: {
        /** Unique identifier for this party. */
        id: bcs.Address,
        /** Whether this is an individual or group party. */
        kind: PartyKind,
        /**
         * Human-readable name of the party. Note this name is not "official" or "verified"
         * in any way. Verification should be performed by the application layer.
         */
        name: bcs.string(),
        /** Unix ms when the party was created. Set once at `new`; immutable. */
        created_at_ms: bcs.u64()
    } });
export const PartyAdminCap = new MoveStruct({ name: `${$moduleName}::PartyAdminCap`, fields: {
        /** Unique identifier for this capability. */
        id: bcs.Address,
        /** ID of the party this capability controls. */
        party_id: bcs.Address
    } });
export const PartyAdminCapKey = new MoveTuple({ name: `${$moduleName}::PartyAdminCapKey`, fields: [bcs.Address] });
export const PendingInviteKey = new MoveTuple({ name: `${$moduleName}::PendingInviteKey`, fields: [bcs.Address] });
export const PendingMembershipKey = new MoveTuple({ name: `${$moduleName}::PendingMembershipKey`, fields: [bcs.Address] });
export const MembershipKey = new MoveTuple({ name: `${$moduleName}::MembershipKey`, fields: [bcs.Address] });
export const Membership = new MoveStruct({ name: `${$moduleName}::Membership`, fields: {
        /** Epoch in which the party joined the group. */
        since_epoch: bcs.u64()
    } });
export const PartyCreatedEvent = new MoveStruct({ name: `${$moduleName}::PartyCreatedEvent`, fields: {
        /** ID of the newly created party. */
        party_id: bcs.Address,
        /** Name of the party. */
        name: bcs.string(),
        /** Kind of the party. */
        kind: bcs.string(),
        /** Unix ms when the party was created. */
        created_at_ms: bcs.u64()
    } });
export const PartyNameSetEvent = new MoveStruct({ name: `${$moduleName}::PartyNameSetEvent`, fields: {
        /** ID of the party. */
        party_id: bcs.Address,
        /** Name of the party. */
        name: bcs.string()
    } });
export const PartyInvitedEvent = new MoveStruct({ name: `${$moduleName}::PartyInvitedEvent`, fields: {
        /** ID of the group. */
        group_id: bcs.Address,
        /** ID of the invited member party. */
        member_id: bcs.Address
    } });
export const PartyJoinedGroupEvent = new MoveStruct({ name: `${$moduleName}::PartyJoinedGroupEvent`, fields: {
        /** ID of the group. */
        group_id: bcs.Address,
        /** ID of the party that joined. */
        member_id: bcs.Address
    } });
export const PartyInviteDeclinedEvent = new MoveStruct({ name: `${$moduleName}::PartyInviteDeclinedEvent`, fields: {
        /** ID of the group. */
        group_id: bcs.Address,
        /** ID of the party that declined. */
        member_id: bcs.Address
    } });
export const PartyInviteRevokedEvent = new MoveStruct({ name: `${$moduleName}::PartyInviteRevokedEvent`, fields: {
        /** ID of the group. */
        group_id: bcs.Address,
        /** ID of the party whose invite was revoked. */
        member_id: bcs.Address
    } });
export const PartyRemovedFromGroupEvent = new MoveStruct({ name: `${$moduleName}::PartyRemovedFromGroupEvent`, fields: {
        /** ID of the group. */
        group_id: bcs.Address,
        /** ID of the party removed from the group. */
        member_id: bcs.Address
    } });
export const PartyLeftGroupEvent = new MoveStruct({ name: `${$moduleName}::PartyLeftGroupEvent`, fields: {
        /** ID of the group. */
        group_id: bcs.Address,
        /** ID of the party that left the group. */
        member_id: bcs.Address
    } });
export interface NewArguments {
    kind: TransactionArgument;
    name: RawTransactionArgument<string>;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        kind: TransactionArgument,
        name: RawTransactionArgument<string>
    ];
}
/**
 * Creates a new party with the specified kind and name. Returns the admin
 * capability for managing the party. The party is shared and starts in the Created
 * state.
 */
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null,
        '0x1::string::String',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["kind", "name"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ShareArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface ShareOptions {
    package?: string;
    arguments: ShareArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
}
/**
 * Shares the party object, making it publicly accessible. Requires the admin
 * capability.
 */
export function share(options: ShareOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'share',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetNameArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    name: RawTransactionArgument<string>;
}
export interface SetNameOptions {
    package?: string;
    arguments: SetNameArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        name: RawTransactionArgument<string>
    ];
}
/** Sets the human-readable name of the party. Requires the admin capability. */
export function setName(options: SetNameOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null,
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "name"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'set_name',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface InvitePartyArguments {
    group: RawTransactionArgument<string>;
    member: RawTransactionArgument<string>;
    groupCap: RawTransactionArgument<string>;
}
export interface InvitePartyOptions {
    package?: string;
    arguments: InvitePartyArguments | [
        group: RawTransactionArgument<string>,
        member: RawTransactionArgument<string>,
        groupCap: RawTransactionArgument<string>
    ];
}
/**
 * Invites an individual party to join a group. Requires the group's admin
 * capability. Records matching pending-invite indexes on both parties; the invited
 * party joins only by calling `accept_invite` with its own admin cap — so no party
 * can be made a member without its consent. The party being invited must be an
 * individual (not another group).
 */
export function inviteParty(options: InvitePartyOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["group", "member", "groupCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'invite_party',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AcceptInviteArguments {
    group: RawTransactionArgument<string>;
    member: RawTransactionArgument<string>;
    memberCap: RawTransactionArgument<string>;
}
export interface AcceptInviteOptions {
    package?: string;
    arguments: AcceptInviteArguments | [
        group: RawTransactionArgument<string>,
        member: RawTransactionArgument<string>,
        memberCap: RawTransactionArgument<string>
    ];
}
/**
 * Accepts a pending invite, joining `member` to `group`. Requires the _member's_
 * own admin cap (consent). Consumes the pending invite, inserts the member into
 * the group's set, and writes a `Membership` record onto the member party — both
 * sides in one transaction, so they can't diverge.
 */
export function acceptInvite(options: AcceptInviteOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["group", "member", "memberCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'accept_invite',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeclineInviteArguments {
    group: RawTransactionArgument<string>;
    member: RawTransactionArgument<string>;
    memberCap: RawTransactionArgument<string>;
}
export interface DeclineInviteOptions {
    package?: string;
    arguments: DeclineInviteArguments | [
        group: RawTransactionArgument<string>,
        member: RawTransactionArgument<string>,
        memberCap: RawTransactionArgument<string>
    ];
}
/**
 * Declines a pending invite, authorized by the invited party's own admin cap.
 * Clears the group-side invitation and the member-facing inbox entry together.
 */
export function declineInvite(options: DeclineInviteOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["group", "member", "memberCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'decline_invite',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RevokeInviteArguments {
    group: RawTransactionArgument<string>;
    member: RawTransactionArgument<string>;
    groupCap: RawTransactionArgument<string>;
}
export interface RevokeInviteOptions {
    package?: string;
    arguments: RevokeInviteArguments | [
        group: RawTransactionArgument<string>,
        member: RawTransactionArgument<string>,
        groupCap: RawTransactionArgument<string>
    ];
}
/**
 * Revokes a pending invite, authorized by the group's admin cap. Clears the
 * group-side invitation and the member-facing inbox entry together.
 */
export function revokeInvite(options: RevokeInviteOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["group", "member", "groupCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'revoke_invite',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface LeaveArguments {
    group: RawTransactionArgument<string>;
    member: RawTransactionArgument<string>;
    memberCap: RawTransactionArgument<string>;
}
export interface LeaveOptions {
    package?: string;
    arguments: LeaveArguments | [
        group: RawTransactionArgument<string>,
        member: RawTransactionArgument<string>,
        memberCap: RawTransactionArgument<string>
    ];
}
/**
 * Removes the caller's party from a group, authorized by the _member's_ own admin
 * capability — the member's unconditional exit. Clears both the group's member set
 * and the member's own membership record.
 */
export function leave(options: LeaveOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["group", "member", "memberCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'leave',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RemoveMemberArguments {
    group: RawTransactionArgument<string>;
    groupCap: RawTransactionArgument<string>;
    member: RawTransactionArgument<string>;
}
export interface RemoveMemberOptions {
    package?: string;
    arguments: RemoveMemberArguments | [
        group: RawTransactionArgument<string>,
        groupCap: RawTransactionArgument<string>,
        member: RawTransactionArgument<string>
    ];
}
/**
 * Removes (evicts) a member from a group, authorized by the _group's_ admin
 * capability. Because this module owns `Party`, it can scrub the member's own
 * membership record here even without the member's cap — but only the record for
 * _this_ group, so the admin's reach into the member is scoped to "cancel my
 * group's membership" and nothing else on the member is touchable.
 */
export function removeMember(options: RemoveMemberOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["group", "groupCap", "member"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'remove_member',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewIndividualKindOptions {
    package?: string;
    arguments?: [
    ];
}
/** Creates a new individual party kind. */
export function newIndividualKind(options: NewIndividualKindOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'new_individual_kind',
    });
}
export interface NewGroupKindOptions {
    package?: string;
    arguments?: [
    ];
}
/** Creates a new group party kind with an empty member set. */
export function newGroupKind(options: NewGroupKindOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'new_group_kind',
    });
}
export interface NameArguments {
    self: RawTransactionArgument<string>;
}
export interface NameOptions {
    package?: string;
    arguments: NameArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Returns the human-readable name of this party. */
export function name(options: NameOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'name',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreatedAtMsArguments {
    self: RawTransactionArgument<string>;
}
export interface CreatedAtMsOptions {
    package?: string;
    arguments: CreatedAtMsArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Returns the Unix ms when this party was created. */
export function createdAtMs(options: CreatedAtMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'created_at_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsIndividualKindArguments {
    self: RawTransactionArgument<string>;
}
export interface IsIndividualKindOptions {
    package?: string;
    arguments: IsIndividualKindArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Returns true if this party is an individual. */
export function isIndividualKind(options: IsIndividualKindOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'is_individual_kind',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsGroupKindArguments {
    self: RawTransactionArgument<string>;
}
export interface IsGroupKindOptions {
    package?: string;
    arguments: IsGroupKindArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Returns true if this party is a group. */
export function isGroupKind(options: IsGroupKindOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'is_group_kind',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface GroupMembersArguments {
    self: RawTransactionArgument<string>;
}
export interface GroupMembersOptions {
    package?: string;
    arguments: GroupMembersArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Returns a reference to the group members. Aborts if this party is not a group. */
export function groupMembers(options: GroupMembersOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'group_members',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsMemberArguments {
    member: RawTransactionArgument<string>;
    groupId: RawTransactionArgument<string>;
}
export interface IsMemberOptions {
    package?: string;
    arguments: IsMemberArguments | [
        member: RawTransactionArgument<string>,
        groupId: RawTransactionArgument<string>
    ];
}
/**
 * Whether `member` currently holds a membership record for `group_id`. Reads the
 * member side, so it needs only the member party (no group object) — the primitive
 * extensions use for member-gated authorization.
 */
export function isMember(options: IsMemberOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["member", "groupId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'is_member',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasPendingInviteArguments {
    group: RawTransactionArgument<string>;
    memberId: RawTransactionArgument<string>;
}
export interface HasPendingInviteOptions {
    package?: string;
    arguments: HasPendingInviteArguments | [
        group: RawTransactionArgument<string>,
        memberId: RawTransactionArgument<string>
    ];
}
/** Whether the group has a pending invite outstanding for `member_id`. */
export function hasPendingInvite(options: HasPendingInviteOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["group", "memberId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'has_pending_invite',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasPendingMembershipArguments {
    member: RawTransactionArgument<string>;
    groupId: RawTransactionArgument<string>;
}
export interface HasPendingMembershipOptions {
    package?: string;
    arguments: HasPendingMembershipArguments | [
        member: RawTransactionArgument<string>,
        groupId: RawTransactionArgument<string>
    ];
}
/**
 * Whether an individual party has a pending membership invitation from a group.
 * Reads the member-facing invitation index, so callers can discover invitations by
 * enumerating only the member party's dynamic fields.
 */
export function hasPendingMembership(options: HasPendingMembershipOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["member", "groupId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'has_pending_membership',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PartyKindNameArguments {
    self: TransactionArgument;
}
export interface PartyKindNameOptions {
    package?: string;
    arguments: PartyKindNameArguments | [
        self: TransactionArgument
    ];
}
/** Returns the human-readable name of the party kind. */
export function partyKindName(options: PartyKindNameOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'party_kind_name',
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
/** Verifies that the admin capability matches this party. */
export function authorize(options: AuthorizeOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'authorize',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PartyAdminCapPartyIdArguments {
    cap: RawTransactionArgument<string>;
}
export interface PartyAdminCapPartyIdOptions {
    package?: string;
    arguments: PartyAdminCapPartyIdArguments | [
        cap: RawTransactionArgument<string>
    ];
}
/** Returns the ID of the party associated with the admin capability. */
export function partyAdminCapPartyId(options: PartyAdminCapPartyIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'party_admin_cap_party_id',
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
/** Returns a reference to the party's UID for reading dynamic fields. */
export function uid(options: UidOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
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
 * Returns a mutable reference to the party's UID for dynamic field operations.
 * Requires the admin capability.
 */
export function uidMut(options: UidMutOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'uid_mut',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AssertIsIndividualKindArguments {
    self: RawTransactionArgument<string>;
}
export interface AssertIsIndividualKindOptions {
    package?: string;
    arguments: AssertIsIndividualKindArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Aborts if this party is not an individual. */
export function assertIsIndividualKind(options: AssertIsIndividualKindOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'assert_is_individual_kind',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AssertIsGroupKindArguments {
    self: RawTransactionArgument<string>;
}
export interface AssertIsGroupKindOptions {
    package?: string;
    arguments: AssertIsGroupKindArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Aborts if this party is not a group. */
export function assertIsGroupKind(options: AssertIsGroupKindOptions) {
    const packageAddress = options.package ?? '@local-pkg/partyos';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'party',
        function: 'assert_is_group_kind',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}