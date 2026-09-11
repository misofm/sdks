// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The two synchronous, package-scoped helpers that stay free functions
// rather than service members (`docs/extensions.md` §12, step 2: "an
// existing `Effect<A, E, Sui>` function that is exported and used outside the
// facade stays exported and keeps its signature" — these two are pure and
// never touch `Sui` at all). Everything that reads through the network moved
// to `Partyos` in `./Partyos.ts`.

import { bcs } from "@mysten/sui/bcs";
import { deriveObjectID, normalizeStructTag } from "@mysten/sui/utils";
import { ObjectId } from "sui-effect";

/** The `Party` struct tag of one partyos deployment, normalized. */
export function partyType(partyPackageId: string): string {
  return normalizeStructTag(`${partyPackageId}::party::Party`);
}

/** Derives a party's `PartyAdminCap` id (it is a `derived_object` off the party UID). */
export function derivePartyAdminCapId(partyId: string, partyPackageId: string): ObjectId {
  return ObjectId.make(
    deriveObjectID(partyId, `${partyPackageId}::party::PartyAdminCapKey`, bcs.Address.serialize(partyId).toBytes()),
  );
}
