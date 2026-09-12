// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The BCS bridge for `party::Party`, built once per deployment because the
// expected type carries the deployment's *type origin* — the package a
// `party::Party` name actually names, which stays fixed across a Move
// upgrade even as `partyos` (the `moveCall`-target package) moves
// (`docs/extensions.md` §3, "Every type-shaped constant is a function of the
// package id"). `mapParty` / `unmapParty` are the total, synchronous field
// mapping `Schema.decodeTo` composes on top of the bridge; see §3, "What the
// bridge takes, and where domain mapping goes".

import { Schema, SchemaTransformation } from "effect";
import { SuiSchema } from "@unconfirmed/sui-effect";
import * as party from "./contracts/partyos/party.ts";
import { partyType } from "./queries.ts";
import { Party } from "./types.ts";

/** The generated, snake_case shape `contracts.party.Party.parse` produces. */
type PartyFields = typeof party.Party.$inferType;

/**
 * The halfway shape the transformation produces: `Party`'s own field names
 * and shape, still unbranded — `Party`'s own schema does the rest (brands
 * `id` and `members` as `ObjectId`), the same two-step `docs/extensions.md`
 * §3 shows for `Settlement`.
 */
interface PartyParts {
  readonly id: string;
  readonly kind: "individual" | "group";
  readonly name: string;
  readonly members?: ReadonlyArray<string>;
  readonly createdAtMs: number;
}

/** `decode`: the generated shape to `Party`'s own field shape. */
function mapParty(fields: PartyFields): PartyParts {
  const kind = fields.kind;
  if (kind.$kind === "Group") {
    return {
      id: fields.id,
      kind: "group",
      name: fields.name,
      members: kind.Group.contents,
      createdAtMs: Number(fields.created_at_ms),
    };
  }
  return {
    id: fields.id,
    kind: "individual",
    name: fields.name,
    createdAtMs: Number(fields.created_at_ms),
  };
}

/** `encode`: the inverse mapper. */
function unmapParty(fields: PartyParts): PartyFields {
  return {
    id: fields.id,
    kind:
      fields.kind === "group"
        ? { $kind: "Group", Group: { contents: [...(fields.members ?? [])] } }
        : { $kind: "Individual", Individual: true },
    name: fields.name,
    created_at_ms: String(fields.createdAtMs),
  };
}

/**
 * The BCS bridge for `${typeOrigin}::party::Party`, composed with `Party`
 * through `Schema.decodeTo` per `docs/extensions.md` §3. Built once per
 * layer, because the expected type carries the deployment's type origin —
 * `deployment.typeOrigin`, defaulting to `deployment.partyos`.
 */
export function partyContent(typeOrigin: string): Schema.Codec<Party, Uint8Array> {
  return SuiSchema.bcs(party.Party, partyType(typeOrigin)).pipe(
    Schema.decodeTo(Party, SchemaTransformation.transform({ decode: mapParty, encode: unmapParty })),
  );
}
