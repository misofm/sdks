// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Public, camelCase result types. The mapper in ./internal.ts turns the generated
// (snake_case, Move-shaped) parse output into the plain shape `Party` decodes from.

import { Schema } from "effect";

export const PartyKind = Schema.Literals(["individual", "group"]);
export type PartyKind = typeof PartyKind.Type;

export class Party extends Schema.Class<Party>("@misofm/partyos/Party")({
  id: Schema.String,
  kind: PartyKind,
  /** Human-readable name (not verified). */
  name: Schema.String,
  /** Member party ids — present only when `kind === "group"`. */
  members: Schema.optional(Schema.Array(Schema.String)),
  /** Unix ms when the party was created. */
  createdAtMs: Schema.Number,
}) {}
