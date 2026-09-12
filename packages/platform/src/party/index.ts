// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export * from "./types.ts";
export * from "./queries.ts";
export * from "./client.ts";
export * from "./extensions/profile.ts";
export * from "./extensions/media.ts";
export * from "./extensions/roles.ts";
export * from "./extensions/tags.ts";
export * from "./extensions/genres.ts";
export * from "./extensions/ctas.ts";
export * from "./extensions/links.ts";

// === Party core — owned by `@misofm/partyos` ===
// Re-exported here so `@misofm/platform/party` remains a one-stop import for
// Party work. The Party object model (identity, admin caps, group membership)
// itself lives in `@misofm/partyos`; this package only owns the extensions.
export {
  createIndividualParty,
  createGroupParty,
  setName,
  inviteParty,
  acceptInvite,
  declineInvite,
  revokeInvite,
  leaveGroup,
  removeMember,
  type Party,
  type PartyKind,
  type CreatePartyParams,
  type SetNameParams,
  type InvitePartyParams,
  type AcceptInviteParams,
  type DeclineInviteParams,
  type RevokeInviteParams,
  type LeaveGroupParams,
  type RemoveMemberParams,
} from "@misofm/partyos";
