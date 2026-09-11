// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * BCS decoders for PartyOS execution events. Each decoder preserves the
 * generated Move field names and wire layout exactly, which is the safe
 * boundary for indexers and other event consumers.
 */

import * as party from "./contracts/partyos/party.ts";

/** A generated codec's `parse`, the only part a raw-BCS event decoder needs. */
export interface BcsParser<T> {
  parse(bytes: Uint8Array): T;
}

/** Decode raw event BCS with the corresponding generated codec. */
export function decodeEvent<T>(codec: BcsParser<T>, bytes: Uint8Array): T {
  return codec.parse(bytes);
}

function decoder<T>(codec: BcsParser<T>) {
  return (bytes: Uint8Array): T => decodeEvent(codec, bytes);
}

/**
 * PartyOS event decoder registry. These codecs describe the current v1 event
 * ABI; callers select a codec after routing the event's on-chain type.
 */
export const partyEventParsers = {
  core: {
    partyCreated: decoder(party.PartyCreatedEvent),
    partyShared: decoder(party.PartySharedEvent),
    partyNameSet: decoder(party.PartyNameSetEvent),
    partyGroupInviteCreated: decoder(party.PartyGroupInviteCreatedEvent),
    partyGroupMembershipAccepted: decoder(party.PartyGroupMembershipAcceptedEvent),
    partyGroupInviteDeclined: decoder(party.PartyGroupInviteDeclinedEvent),
    partyGroupInviteRevoked: decoder(party.PartyGroupInviteRevokedEvent),
    partyGroupMembershipLeft: decoder(party.PartyGroupMembershipLeftEvent),
    partyGroupMembershipRemoved: decoder(party.PartyGroupMembershipRemovedEvent),
  },
} as const;
