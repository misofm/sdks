// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { bcs } from "@mysten/sui/bcs";

import * as root from "../src/index.ts";
import { partyEventParsers, decodeEvent } from "../src/events.ts";
import { party as partyContracts } from "../src/contracts.ts";

const address = (byte: string) => `0x${byte.repeat(32)}`;
const PARTY_ID = address("01");
const GROUP_ID = address("02");
const MEMBER_A = address("03");
const MEMBER_B = address("04");
const ADMIN_CAP_ID = address("05");
const GROUP_ADMIN_CAP_ID = address("06");
const MEMBER_ADMIN_CAP_ID = address("07");
const CREATOR = address("08");
const ACCEPTED_BY = address("09");

// These schemas intentionally duplicate the Move field lists locally. They
// are the wire-layout oracle for the generated PartyOS codecs under test.
const partyCreatedWire = bcs.struct("PartyCreatedEventFixture", {
  party_id: bcs.Address,
  admin_cap_id: bcs.Address,
  name: bcs.string(),
  kind: bcs.u8(),
  member_ids: bcs.vector(bcs.Address),
  creator: bcs.Address,
  created_at_ms: bcs.u64(),
  created_epoch: bcs.u64(),
});

const partySharedWire = bcs.struct("PartySharedEventFixture", {
  party_id: bcs.Address,
  admin_cap_id: bcs.Address,
  name: bcs.string(),
  kind: bcs.u8(),
  member_ids: bcs.vector(bcs.Address),
  created_at_ms: bcs.u64(),
  is_shared: bcs.bool(),
});

const partyNameSetWire = bcs.struct("PartyNameSetEventFixture", {
  party_id: bcs.Address,
  admin_cap_id: bcs.Address,
  old_name: bcs.string(),
  name: bcs.string(),
});

const partyGroupInviteCreatedWire = bcs.struct("PartyGroupInviteCreatedEventFixture", {
  group_id: bcs.Address,
  member_id: bcs.Address,
  group_admin_cap_id: bcs.Address,
  group_member_count: bcs.u64(),
  pending_invite: bcs.bool(),
  pending_membership: bcs.bool(),
});

const partyGroupMembershipAcceptedWire = bcs.struct("PartyGroupMembershipAcceptedEventFixture", {
  group_id: bcs.Address,
  member_id: bcs.Address,
  member_admin_cap_id: bcs.Address,
  group_member_count: bcs.u64(),
  pending_invite: bcs.bool(),
  pending_membership: bcs.bool(),
  group_contains_member: bcs.bool(),
  membership_present: bcs.bool(),
  since_epoch: bcs.u64(),
  accepted_by: bcs.Address,
});

const partyGroupInviteDeclinedWire = bcs.struct("PartyGroupInviteDeclinedEventFixture", {
  group_id: bcs.Address,
  member_id: bcs.Address,
  member_admin_cap_id: bcs.Address,
  pending_invite: bcs.bool(),
  pending_membership: bcs.bool(),
});

const partyGroupInviteRevokedWire = bcs.struct("PartyGroupInviteRevokedEventFixture", {
  group_id: bcs.Address,
  member_id: bcs.Address,
  group_admin_cap_id: bcs.Address,
  pending_invite: bcs.bool(),
  pending_membership: bcs.bool(),
});

const partyGroupMembershipLeftWire = bcs.struct("PartyGroupMembershipLeftEventFixture", {
  group_id: bcs.Address,
  member_id: bcs.Address,
  member_admin_cap_id: bcs.Address,
  group_member_count: bcs.u64(),
  group_contains_member: bcs.bool(),
  membership_present: bcs.bool(),
  removed_since_epoch: bcs.option(bcs.u64()),
});

const partyGroupMembershipRemovedWire = bcs.struct("PartyGroupMembershipRemovedEventFixture", {
  group_id: bcs.Address,
  member_id: bcs.Address,
  group_admin_cap_id: bcs.Address,
  group_member_count: bcs.u64(),
  group_contains_member: bcs.bool(),
  membership_present: bcs.bool(),
  removed_since_epoch: bcs.option(bcs.u64()),
});

test("registers exactly the current PartyOS event names and codecs", () => {
  expect(Object.keys(partyEventParsers.core)).toEqual([
    "partyCreated",
    "partyShared",
    "partyNameSet",
    "partyGroupInviteCreated",
    "partyGroupMembershipAccepted",
    "partyGroupInviteDeclined",
    "partyGroupInviteRevoked",
    "partyGroupMembershipLeft",
    "partyGroupMembershipRemoved",
  ]);

  for (const codec of [
    "PartyCreatedEvent",
    "PartySharedEvent",
    "PartyNameSetEvent",
    "PartyGroupInviteCreatedEvent",
    "PartyGroupMembershipAcceptedEvent",
    "PartyGroupInviteDeclinedEvent",
    "PartyGroupInviteRevokedEvent",
    "PartyGroupMembershipLeftEvent",
    "PartyGroupMembershipRemovedEvent",
  ]) {
    expect(codec in partyContracts).toBe(true);
  }
  for (const legacyCodec of [
    "PartyInvitedEvent",
    "PartyJoinedGroupEvent",
    "PartyInviteDeclinedEvent",
    "PartyInviteRevokedEvent",
    "PartyLeftGroupEvent",
    "PartyRemovedFromGroupEvent",
  ]) {
    expect(legacyCodec in partyContracts).toBe(false);
  }
});

test("decodes individual and group creation fixtures with numeric kind and precise u64s", () => {
  const individualBytes = partyCreatedWire.serialize({
    party_id: PARTY_ID,
    admin_cap_id: ADMIN_CAP_ID,
    name: "Ada",
    kind: 0,
    member_ids: [],
    creator: CREATOR,
    created_at_ms: "9007199254740993",
    created_epoch: "18446744073709551615",
  }).toBytes();
  const groupBytes = partyCreatedWire.serialize({
    party_id: GROUP_ID,
    admin_cap_id: GROUP_ADMIN_CAP_ID,
    name: "The Group",
    kind: 1,
    member_ids: [MEMBER_A, MEMBER_B],
    creator: CREATOR,
    created_at_ms: "12345678901234567890",
    created_epoch: "42",
  }).toBytes();

  const individual = partyEventParsers.core.partyCreated(individualBytes);
  const group = partyEventParsers.core.partyCreated(groupBytes);

  expect(individual).toEqual({
    party_id: PARTY_ID,
    admin_cap_id: ADMIN_CAP_ID,
    name: "Ada",
    kind: 0,
    member_ids: [],
    creator: CREATOR,
    created_at_ms: "9007199254740993",
    created_epoch: "18446744073709551615",
  });
  expect(group).toEqual({
    party_id: GROUP_ID,
    admin_cap_id: GROUP_ADMIN_CAP_ID,
    name: "The Group",
    kind: 1,
    member_ids: [MEMBER_A, MEMBER_B],
    creator: CREATOR,
    created_at_ms: "12345678901234567890",
    created_epoch: "42",
  });

  const kind: number = individual.kind;
  const createdAt: string = individual.created_at_ms;
  const createdEpoch: string = individual.created_epoch;
  const memberIds: string[] = group.member_ids;
  void kind;
  void createdAt;
  void createdEpoch;
  void memberIds;
});

test("decodes sharing and name changes without domain remapping", () => {
  const sharedBytes = partySharedWire.serialize({
    party_id: GROUP_ID,
    admin_cap_id: GROUP_ADMIN_CAP_ID,
    name: "The Group",
    kind: 1,
    member_ids: [MEMBER_A, MEMBER_B],
    created_at_ms: "12345678901234567890",
    is_shared: true,
  }).toBytes();
  const nameBytes = partyNameSetWire.serialize({
    party_id: PARTY_ID,
    admin_cap_id: ADMIN_CAP_ID,
    old_name: "旧名",
    name: "新しい名前",
  }).toBytes();

  expect(partyEventParsers.core.partyShared(sharedBytes)).toEqual({
    party_id: GROUP_ID,
    admin_cap_id: GROUP_ADMIN_CAP_ID,
    name: "The Group",
    kind: 1,
    member_ids: [MEMBER_A, MEMBER_B],
    created_at_ms: "12345678901234567890",
    is_shared: true,
  });
  expect(partyEventParsers.core.partyNameSet(nameBytes)).toEqual({
    party_id: PARTY_ID,
    admin_cap_id: ADMIN_CAP_ID,
    old_name: "旧名",
    name: "新しい名前",
  });

  const shared: ReturnType<typeof partyEventParsers.core.partyShared> =
    partyEventParsers.core.partyShared(sharedBytes);
  const sharedState: boolean = shared.is_shared;
  void sharedState;
});

test("decodes invitation lifecycle events with their distinct capability fields", () => {
  const createdBytes = partyGroupInviteCreatedWire.serialize({
    group_id: GROUP_ID,
    member_id: MEMBER_A,
    group_admin_cap_id: GROUP_ADMIN_CAP_ID,
    group_member_count: "9007199254740993",
    pending_invite: true,
    pending_membership: true,
  }).toBytes();
  const acceptedBytes = partyGroupMembershipAcceptedWire.serialize({
    group_id: GROUP_ID,
    member_id: MEMBER_A,
    member_admin_cap_id: MEMBER_ADMIN_CAP_ID,
    group_member_count: "2",
    pending_invite: false,
    pending_membership: false,
    group_contains_member: true,
    membership_present: true,
    since_epoch: "18446744073709551615",
    accepted_by: ACCEPTED_BY,
  }).toBytes();
  const declinedBytes = partyGroupInviteDeclinedWire.serialize({
    group_id: GROUP_ID,
    member_id: MEMBER_A,
    member_admin_cap_id: MEMBER_ADMIN_CAP_ID,
    pending_invite: false,
    pending_membership: false,
  }).toBytes();
  const revokedBytes = partyGroupInviteRevokedWire.serialize({
    group_id: GROUP_ID,
    member_id: MEMBER_B,
    group_admin_cap_id: GROUP_ADMIN_CAP_ID,
    pending_invite: false,
    pending_membership: false,
  }).toBytes();

  expect(partyEventParsers.core.partyGroupInviteCreated(createdBytes)).toEqual({
    group_id: GROUP_ID,
    member_id: MEMBER_A,
    group_admin_cap_id: GROUP_ADMIN_CAP_ID,
    group_member_count: "9007199254740993",
    pending_invite: true,
    pending_membership: true,
  });
  expect(partyEventParsers.core.partyGroupMembershipAccepted(acceptedBytes)).toEqual({
    group_id: GROUP_ID,
    member_id: MEMBER_A,
    member_admin_cap_id: MEMBER_ADMIN_CAP_ID,
    group_member_count: "2",
    pending_invite: false,
    pending_membership: false,
    group_contains_member: true,
    membership_present: true,
    since_epoch: "18446744073709551615",
    accepted_by: ACCEPTED_BY,
  });
  expect(partyEventParsers.core.partyGroupInviteDeclined(declinedBytes)).toEqual({
    group_id: GROUP_ID,
    member_id: MEMBER_A,
    member_admin_cap_id: MEMBER_ADMIN_CAP_ID,
    pending_invite: false,
    pending_membership: false,
  });
  expect(partyEventParsers.core.partyGroupInviteRevoked(revokedBytes)).toEqual({
    group_id: GROUP_ID,
    member_id: MEMBER_B,
    group_admin_cap_id: GROUP_ADMIN_CAP_ID,
    pending_invite: false,
    pending_membership: false,
  });

  const accepted: ReturnType<typeof partyEventParsers.core.partyGroupMembershipAccepted> =
    partyEventParsers.core.partyGroupMembershipAccepted(acceptedBytes);
  const acceptedBy: string = accepted.accepted_by;
  const pendingInvite: boolean = accepted.pending_invite;
  const sinceEpoch: string = accepted.since_epoch;
  void acceptedBy;
  void pendingInvite;
  void sinceEpoch;
});

test("preserves nullable removal epochs for leave and removal events", () => {
  const leftAbsentBytes = partyGroupMembershipLeftWire.serialize({
    group_id: GROUP_ID,
    member_id: MEMBER_A,
    member_admin_cap_id: MEMBER_ADMIN_CAP_ID,
    group_member_count: "1",
    group_contains_member: false,
    membership_present: false,
    removed_since_epoch: null,
  }).toBytes();
  const leftZeroBytes = partyGroupMembershipLeftWire.serialize({
    group_id: GROUP_ID,
    member_id: MEMBER_A,
    member_admin_cap_id: MEMBER_ADMIN_CAP_ID,
    group_member_count: "0",
    group_contains_member: false,
    membership_present: true,
    removed_since_epoch: "0",
  }).toBytes();
  const removedBytes = partyGroupMembershipRemovedWire.serialize({
    group_id: GROUP_ID,
    member_id: MEMBER_B,
    group_admin_cap_id: GROUP_ADMIN_CAP_ID,
    group_member_count: "9007199254740993",
    group_contains_member: false,
    membership_present: false,
    removed_since_epoch: "18446744073709551615",
  }).toBytes();

  expect(partyEventParsers.core.partyGroupMembershipLeft(leftAbsentBytes)).toEqual({
    group_id: GROUP_ID,
    member_id: MEMBER_A,
    member_admin_cap_id: MEMBER_ADMIN_CAP_ID,
    group_member_count: "1",
    group_contains_member: false,
    membership_present: false,
    removed_since_epoch: null,
  });
  expect(partyEventParsers.core.partyGroupMembershipLeft(leftZeroBytes)).toEqual({
    group_id: GROUP_ID,
    member_id: MEMBER_A,
    member_admin_cap_id: MEMBER_ADMIN_CAP_ID,
    group_member_count: "0",
    group_contains_member: false,
    membership_present: true,
    removed_since_epoch: "0",
  });
  expect(partyEventParsers.core.partyGroupMembershipRemoved(removedBytes)).toEqual({
    group_id: GROUP_ID,
    member_id: MEMBER_B,
    group_admin_cap_id: GROUP_ADMIN_CAP_ID,
    group_member_count: "9007199254740993",
    group_contains_member: false,
    membership_present: false,
    removed_since_epoch: "18446744073709551615",
  });

  const removed: ReturnType<typeof partyEventParsers.core.partyGroupMembershipRemoved> =
    partyEventParsers.core.partyGroupMembershipRemoved(removedBytes);
  const removalEpoch: string | null = removed.removed_since_epoch;
  void removalEpoch;
});

test("exports the same registry and decodeEvent from the package root", () => {
  expect(root.partyEventParsers).toBe(partyEventParsers);
  expect(root.decodeEvent).toBe(decodeEvent);

  const bytes = partyNameSetWire.serialize({
    party_id: PARTY_ID,
    admin_cap_id: ADMIN_CAP_ID,
    old_name: "before",
    name: "after",
  }).toBytes();
  expect(root.decodeEvent(partyContracts.PartyNameSetEvent, bytes)).toEqual(
    partyEventParsers.core.partyNameSet(bytes),
  );
});

test("propagates parse failures for truncated event payloads", () => {
  expect(() => partyEventParsers.core.partyCreated(new Uint8Array())).toThrow();
});
