// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// This package's own failures, plus the two union aliases the service's
// JSDoc quotes. Every error is a `Schema.TaggedError` and declares `outcome`,
// per `docs/extensions.md` §2 in sui-effect: `SuiError.outcome` and
// `Script.exitCode` read that field, and an error that omits it is
// "unclassified".

import { Schema } from "effect";
import { DecodeError, ObjectId, ObjectUnavailable, TransportError, type Outcome } from "sui-effect";

/**
 * No `Party` object with this id exists for the bound deployment: it was
 * never created, it was deleted, or the id belongs to another package's
 * object entirely (see {@link DecodeError} for "same id, wrong package").
 *
 * Nothing was submitted, so the outcome is `not_applied` and a caller may
 * retry with a different id.
 */
export class PartyNotFound extends Schema.TaggedError<PartyNotFound>()("partyos/PartyNotFound", {
  partyId: ObjectId,
}) {
  readonly outcome: Outcome = "not_applied";
}

/**
 * This release bundles no deployment for the network the client is on, or an
 * explicit manifest passed to {@link Partyos.layer} did not validate.
 *
 * Nothing was submitted — nothing was even built — so the outcome is
 * `not_applied`. This is what the predecessor `@misofm/effect`'s
 * `DeploymentError` becomes: this package's own tag, declaring its outcome.
 */
export class PartyosDeploymentError extends Schema.TaggedError<PartyosDeploymentError>()(
  "partyos/DeploymentError",
  { message: Schema.String },
) {
  readonly outcome: Outcome = "not_applied";
}

/**
 * Everything {@link PartyosService.getPartyById} can fail with, spelled once
 * because the service's JSDoc quotes it: not found (package-scoped), a
 * decode failure (wrong type or bad bytes), or a transport problem.
 */
export type PartyReadError = PartyNotFound | DecodeError | TransportError;

/**
 * Everything one item of {@link PartyosService.getPartiesByIds}'s batch can
 * fail with. `ObjectUnavailable` — the node could not say what happened to
 * the object — is kept distinct from `PartyNotFound`, which means the node
 * *did* answer and there is nothing there.
 */
export type PartyBatchItemError = PartyNotFound | ObjectUnavailable | DecodeError;

/**
 * @deprecated Renamed to {@link PartyNotFound}, whose tag is
 * `"partyos/PartyNotFound"` (this alias's runtime `_tag` is the new one, not
 * the string `"PartyNotFoundError"` a predecessor caller may have matched
 * on). Kept only so `@misofm/platform` — converted separately, see
 * misofm/sdks#35 — keeps typechecking against `@misofm/partyos/errors` until
 * its own conversion lands.
 */
export { PartyNotFound as PartyNotFoundError };
