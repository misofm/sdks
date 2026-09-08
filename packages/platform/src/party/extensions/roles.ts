// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The `party_roles` extension: the artist-type roles a party holds (artist,
// producer, DJ, …), a `VecSet<ArtistRole>` on the party. Roles are a closed enum
// with a `Custom(String)` escape hatch; the builders construct the right
// `ArtistRole` value via its constructor move-call, then add/remove it.

import * as rolesMod from "../../contracts/party_roles/party_roles.ts";
import type { TxThunk } from "@misofm/partyos";

/** The canonical role variants (a fixed, typo-free set the frontend can render). */
export type CanonicalRole =
  | "artist"
  | "producer"
  | "dj"
  | "composer"
  | "songwriter"
  | "band"
  | "label"
  | "collective";

/**
 * A role to add/remove: a canonical variant, or a user-defined `custom` name.
 * Prefer a canonical variant when one fits.
 */
export type Role = { kind: CanonicalRole } | { kind: "custom"; name: string };

// Canonical `kind` → the generated constructor function name (all take no args).
const CANONICAL_CTORS = {
  artist: rolesMod.artist,
  producer: rolesMod.producer,
  dj: rolesMod.dj,
  composer: rolesMod.composer,
  songwriter: rolesMod.songwriter,
  band: rolesMod.band,
  label: rolesMod.label,
  collective: rolesMod.collective,
} as const;

/** Builds the `ArtistRole` value for a role via its constructor move-call. */
function buildRole(tx: Parameters<TxThunk>[0], role: Role, pkg: string) {
  if (role.kind === "custom") {
    return tx.add(rolesMod.custom({ package: pkg, arguments: [role.name] }));
  }
  return tx.add(CANONICAL_CTORS[role.kind]({ package: pkg }));
}

export interface AddRoleParams {
  partyId: string;
  capId: string;
  role: Role;
  partyRolesPackageId: string;
}

/** Adds a role to the party. Aborts on-chain if already held or the max is reached. */
export function addRole(params: AddRoleParams): TxThunk {
  return (tx) => {
    const role = buildRole(tx, params.role, params.partyRolesPackageId);
    tx.add(
      rolesMod.addRole({ package: params.partyRolesPackageId, arguments: [params.partyId, params.capId, role] }),
    );
  };
}

export interface RemoveRoleParams {
  partyId: string;
  capId: string;
  role: Role;
  partyRolesPackageId: string;
}

/** Removes a role from the party. Aborts on-chain if not held. */
export function removeRole(params: RemoveRoleParams): TxThunk {
  return (tx) => {
    const role = buildRole(tx, params.role, params.partyRolesPackageId);
    tx.add(
      rolesMod.removeRole({ package: params.partyRolesPackageId, arguments: [params.partyId, params.capId, role] }),
    );
  };
}

export interface ClearRolesParams {
  partyId: string;
  capId: string;
  partyRolesPackageId: string;
}

/** Removes the party's entire role set. No-op on-chain if none is set. */
export function clearRoles(params: ClearRolesParams): TxThunk {
  return (tx) => {
    tx.add(rolesMod.clearRoles({ package: params.partyRolesPackageId, arguments: [params.partyId, params.capId] }));
  };
}
