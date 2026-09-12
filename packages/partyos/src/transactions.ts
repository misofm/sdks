// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Core PartyOS transaction builders. Every builder returns a `Recipe`
// fragment — `(tx: Transaction) => void`, sui-effect's `docs/extensions.md`
// §4 — that *appends* commands to a caller-owned Transaction, so flows
// compose with other extensions' fragments and submit once. Package ids are
// taken in params (the `Partyos` service binds them under `partyos.tx.*`;
// see ./Partyos.ts). Calls into the party package go through the generated
// typed call fns (party.*).

import type { Recipe } from "@unconfirmed/sui-effect";
import * as party from "./contracts/partyos/party.ts";

/**
 * @deprecated Renamed to `Recipe` (from `sui-effect`). Kept as a type alias
 * for source compatibility with `@misofm/platform` (converted separately,
 * see misofm/sdks#35), which imports the old name.
 */
export type TxThunk = Recipe;

export interface CreatePartyParams {
  /** Human-readable party name (not verified; app-layer verifies). */
  name: string;
  /** Address that receives the PartyAdminCap. */
  recipient: string;
  partyPackageId: string;
}

/** Creates an individual party, shares it, and transfers its admin cap to `recipient`. */
export function createIndividualParty(params: CreatePartyParams): Recipe {
  return (tx) => {
    const kind = tx.add(party.newIndividualKind({ package: params.partyPackageId }));
    const res = tx.add(party._new({ package: params.partyPackageId, arguments: [kind, params.name] }));
    tx.add(party.share({ package: params.partyPackageId, arguments: [res[0]!, res[1]!] }));
    tx.transferObjects([res[1]!], params.recipient);
  };
}

/** Creates a group party (empty member set), shares it, transfers its admin cap. */
export function createGroupParty(params: CreatePartyParams): Recipe {
  return (tx) => {
    const kind = tx.add(party.newGroupKind({ package: params.partyPackageId }));
    const res = tx.add(party._new({ package: params.partyPackageId, arguments: [kind, params.name] }));
    tx.add(party.share({ package: params.partyPackageId, arguments: [res[0]!, res[1]!] }));
    tx.transferObjects([res[1]!], params.recipient);
  };
}

// === Group membership: invite / accept / decline / revoke / leave / evict ===
// Membership is consent-based: the group admin invites, the member accepts with
// its OWN admin cap. `member`/`group`/`*Cap` params are all object ids.

export interface InvitePartyParams {
  groupId: string;
  groupCapId: string;
  /** The individual party (shared object id) to invite. */
  memberId: string;
  partyPackageId: string;
}

/** Invites an individual party to a group (gated by the group's admin cap). */
export function inviteParty(params: InvitePartyParams): Recipe {
  return (tx) => {
    tx.add(party.inviteParty({
      package: params.partyPackageId,
      arguments: [params.groupId, params.memberId, params.groupCapId],
    }));
  };
}

export interface AcceptInviteParams {
  groupId: string;
  memberId: string;
  /** The member party's admin cap id (proves consent). */
  memberCapId: string;
  partyPackageId: string;
}

/** Accepts a pending invite, joining the member to the group (member's cap). */
export function acceptInvite(params: AcceptInviteParams): Recipe {
  return (tx) => {
    tx.add(party.acceptInvite({
      package: params.partyPackageId,
      arguments: [params.groupId, params.memberId, params.memberCapId],
    }));
  };
}

export interface DeclineInviteParams {
  groupId: string;
  /** The invited individual party (shared object id). */
  memberId: string;
  memberCapId: string;
  partyPackageId: string;
}

/** Declines a pending invite (member's cap). */
export function declineInvite(params: DeclineInviteParams): Recipe {
  return (tx) => {
    tx.add(party.declineInvite({
      package: params.partyPackageId,
      arguments: [params.groupId, params.memberId, params.memberCapId],
    }));
  };
}

export interface RevokeInviteParams {
  groupId: string;
  /** The invited individual party (shared object id). */
  memberId: string;
  groupCapId: string;
  partyPackageId: string;
}

/** Revokes a pending invite (group's admin cap). */
export function revokeInvite(params: RevokeInviteParams): Recipe {
  return (tx) => {
    tx.add(party.revokeInvite({
      package: params.partyPackageId,
      arguments: [params.groupId, params.memberId, params.groupCapId],
    }));
  };
}

export interface LeaveGroupParams {
  groupId: string;
  memberId: string;
  memberCapId: string;
  partyPackageId: string;
}

/** Leaves a group, authorized by the member's own admin cap. */
export function leaveGroup(params: LeaveGroupParams): Recipe {
  return (tx) => {
    tx.add(party.leave({
      package: params.partyPackageId,
      arguments: [params.groupId, params.memberId, params.memberCapId],
    }));
  };
}

export interface RemoveMemberParams {
  groupId: string;
  groupCapId: string;
  memberId: string;
  partyPackageId: string;
}

/** Evicts a member from a group (group's admin cap); scrubs the member's record too. */
export function removeMember(params: RemoveMemberParams): Recipe {
  return (tx) => {
    tx.add(party.removeMember({
      package: params.partyPackageId,
      arguments: [params.groupId, params.groupCapId, params.memberId],
    }));
  };
}

export interface SetNameParams {
  partyId: string;
  capId: string;
  name: string;
  partyPackageId: string;
}

/** Sets the party's human-readable name. */
export function setName(params: SetNameParams): Recipe {
  return (tx) => {
    tx.add(party.setName({
      package: params.partyPackageId,
      arguments: [params.partyId, params.capId, params.name],
    }));
  };
}
