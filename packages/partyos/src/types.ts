// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The public domain shape of a Party. `id` and `members` are `ObjectId`,
// branded through the BCS bridge in `./schema.ts` rather than plain strings.

import { Schema } from "effect";
import { ObjectId } from "@unconfirmed/sui-effect";

export const PartyKind = Schema.Literals(["individual", "group"]);
export type PartyKind = typeof PartyKind.Type;

export class Party extends Schema.Class<Party>("@misofm/partyos/Party")({
  id: ObjectId,
  kind: PartyKind,
  /** Human-readable name (not verified). */
  name: Schema.String,
  /** Member party ids — present only when `kind === "group"`. */
  members: Schema.optional(Schema.Array(ObjectId)),
  /** Unix ms when the party was created. */
  createdAtMs: Schema.Number,
}) {}
