// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// `@misofm/musicos`'s own failure modes, plus the sui-effect taxonomy it reads
// and writes through, re-exported so callers can import the complete error
// vocabulary from one place (`@misofm/musicos/errors`) without also depending
// on `sui-effect` directly. Every reason a chain read or write can fail that
// the taxonomy already names — a missing object, a bad decode, an unreachable
// node, a failed simulation — is one of those tags; musicos invents nothing
// for what sui-effect already covers.
import { Schema } from "effect";
import { type Outcome, SuiAddress } from "sui-effect";

export {
  BuildError,
  DecodeError,
  GraphQLUnavailable,
  ObjectDeleted,
  ObjectNotFound,
  ObjectUnavailable,
  SimulationFailed,
  TransportError,
  type BatchItemError,
} from "sui-effect";

/**
 * No `TreasuryCap<shareType>` owned by `owner` was found.
 *
 * Nothing was submitted, so the outcome is `not_applied`.
 */
export class MusicosTreasuryCapNotFound extends Schema.TaggedError<MusicosTreasuryCapNotFound>()(
  "musicos/TreasuryCapNotFound",
  { shareType: Schema.String, owner: SuiAddress },
) {
  readonly outcome: Outcome = "not_applied";
}

/**
 * No composition or recording carries `shareType` — `getCompositionByShareType`
 * / `getRecordingByShareType`'s GraphQL discovery step found no matching work.
 *
 * There is no object id to name (that is exactly what the search was for), so
 * this is its own error rather than `ObjectNotFound`, which always names one.
 * Nothing was submitted, so the outcome is `not_applied`.
 */
export class MusicosWorkNotFound extends Schema.TaggedError<MusicosWorkNotFound>()(
  "musicos/WorkNotFound",
  { kind: Schema.Literals(["composition", "recording"]), shareType: Schema.String },
) {
  readonly outcome: Outcome = "not_applied";
}

/**
 * The deployment `Musicos.layer` was given, or picked from `sui.network`, is
 * not a usable Miso manifest — either it failed validation, or this release
 * bundles no verified deployment for the client's network.
 *
 * Nothing was submitted — nothing was even built — so the outcome is
 * `not_applied`. Replaces the predecessor `@misofm/effect`-era
 * `DeploymentError`.
 */
export class MusicosDeploymentInvalid extends Schema.TaggedError<MusicosDeploymentInvalid>()(
  "musicos/DeploymentInvalid",
  { message: Schema.String },
) {
  readonly outcome: Outcome = "not_applied";
}
