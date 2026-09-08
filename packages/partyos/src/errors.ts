// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Party-specific tagged errors, plus the shared vocabulary re-exported so
// callers never need to reach into `@misofm/effect` directly. `getPartyById`
// and `getPartiesByIds` fail with the foundation's `ObjectNotFoundError` /
// `ObjectTypeMismatchError` — `PartyNotFoundError` below is offered for
// callers that want a party-scoped tag instead of pattern-matching the
// generic object vocabulary.

import { Schema } from "effect";

export * from "@misofm/effect/errors";

/** A party object does not exist (never existed, was deleted, or the id is not a party). */
export class PartyNotFoundError extends Schema.TaggedError<PartyNotFoundError>()("PartyNotFoundError", {
  partyId: Schema.String,
}) {}
