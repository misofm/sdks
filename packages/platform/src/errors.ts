// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The platform-specific error vocabulary, now built on sui-effect's own
// taxonomy instead of the deprecated `@misofm/effect/errors` foundation
// (misofm/sdks#35, WP1). Every failure a caller might need to act on is a
// `Schema.TaggedError` carrying the fields needed to act, and every one of
// THIS package's own classes declares `outcome` per sui-effect's
// `docs/extensions.md` §2 — `SuiError.outcome` and `Script.exitCode` read
// that field, and an error that omits it is "unclassified". Tags keep their
// exact predecessor strings so a consumer's existing `catchTag`/`Effect.catch`
// keeps matching.

import { Schema } from "effect";
import type { Outcome } from "@unconfirmed/sui-effect";

// Re-export sui-effect's own taxonomy so a platform consumer never needs a
// second import for the errors platform reads/writes surface directly. This
// package no longer maintains its own copies of these — see the migration
// table in sui-effect's `docs/extensions.md` ("Migrating from
// `@misofm/effect`"): `BcsDecodeError`/`ObjectTypeMismatchError` merge into
// `DecodeError`; `ObjectNotFoundError` becomes `ObjectNotFound` (plus
// `ObjectDeleted`/`ObjectUnavailable`); `SuiRpcError` becomes `TransportError`;
// `TransactionFailedError` becomes `ExecutionFailed`; `GraphQLUnavailableError`
// becomes sui-effect's own `GraphQLUnavailable`, produced by the bare
// `SuiGraphQL` tag this package now reads through directly (the same one
// `@misofm/musicos` reads through — no second, platform-owned GraphQL tag).
export {
  DecodeError,
  ExecutionFailed,
  GraphQLUnavailable,
  ObjectDeleted,
  ObjectNotFound,
  ObjectUnavailable,
  TransportError,
  type BatchItemError,
  type GetObjectError,
} from "@unconfirmed/sui-effect";

/** Record sales (Record + Record Shop) are unavailable on this deployment. */
export class RecordSalesUnavailableError extends Schema.TaggedError<RecordSalesUnavailableError>()(
  "RecordSalesUnavailableError",
  {
    reason: Schema.String,
  },
) {
  /** Nothing was submitted — the deployment was rejected before any Move target was built. */
  readonly outcome: Outcome = "not_applied";
  override get message(): string {
    return `@misofm/platform: Record sales are unavailable: ${this.reason}`;
  }
}

/** Vault/Action/plugin operations are unavailable on this deployment. */
export class OperationsUnavailableError extends Schema.TaggedError<OperationsUnavailableError>()(
  "OperationsUnavailableError",
  {
    reason: Schema.String,
  },
) {
  /** Nothing was submitted — the deployment was rejected before any Move target was built. */
  readonly outcome: Outcome = "not_applied";
  override get message(): string {
    return `@misofm/platform: Vault operations are unavailable: ${this.reason}`;
  }
}

/** A caller-supplied `MisoPlatformDeployment` manifest failed structural validation. */
export class MisoPlatformDeploymentInvalidError extends Schema.TaggedError<MisoPlatformDeploymentInvalidError>()(
  "MisoPlatformDeploymentInvalidError",
  {
    message: Schema.String,
  },
) {
  /** Nothing was submitted — nothing was even built. Replaces the predecessor `@misofm/effect`-era `DeploymentError`. */
  readonly outcome: Outcome = "not_applied";
}

/** The connected client's network does not match the configured deployment's network. */
export class MisoNetworkMismatchError extends Schema.TaggedError<MisoNetworkMismatchError>()(
  "MisoNetworkMismatchError",
  {
    clientNetwork: Schema.String,
    deploymentNetwork: Schema.String,
  },
) {
  readonly outcome: Outcome = "not_applied";
  override get message(): string {
    return `@misofm/platform: client network "${this.clientNetwork}" does not match deployment network "${this.deploymentNetwork}"`;
  }
}

/**
 * The connected endpoint's chain identifier does not match the configured
 * deployment's. Raised at `Miso.layer` build (the same exact-ledger check
 * the predecessor `MisoPlatformClient#ready()` performed at first use),
 * per misofm/sdks#35's target shape.
 */
export class MisoChainIdentifierMismatchError extends Schema.TaggedError<MisoChainIdentifierMismatchError>()(
  "MisoChainIdentifierMismatchError",
  {
    actual: Schema.String,
    expected: Schema.String,
  },
) {
  readonly outcome: Outcome = "not_applied";
  override get message(): string {
    return `@misofm/platform: endpoint chain identifier "${this.actual}" does not match deployment chain identifier "${this.expected}"`;
  }
}

/** An on-chain `RecordSoldEvent` could not be decoded into a `RecordSale`. */
export class MalformedRecordSoldEventError extends Schema.TaggedError<MalformedRecordSoldEventError>()(
  "MalformedRecordSoldEventError",
  {
    digest: Schema.optional(Schema.String),
    reason: Schema.optional(Schema.String),
  },
) {
  readonly outcome: Outcome = "not_applied";
}

/** Authenticated-fetch / API-authorization signing or verification failure. */
export const MisoAuthErrorCode = Schema.Literals([
  "invalid_target",
  "challenge_rejected",
  "invalid_challenge",
  "signing_failed",
]);
export type MisoAuthErrorCode = typeof MisoAuthErrorCode.Type;

export class MisoAuthError extends Schema.TaggedError<MisoAuthError>()("MisoAuthError", {
  code: MisoAuthErrorCode,
  reason: Schema.String,
  status: Schema.optional(Schema.Number),
  cause: Schema.optional(Schema.Defect()),
}) {
  /** An HTTP authorization failure never submits a transaction. */
  readonly outcome: Outcome = "not_applied";
  override get message(): string {
    return this.reason;
  }
}

// ── Domain not-found wrappers ───────────────────────────────────────────────
//
// Added where a caller benefits from a typed tag instead of message-sniffing —
// concretely, `misofm/api`'s read service hand-rolls exactly this bridge today
// (`services/miso-read-service/src/routes.ts`: `isMissingRelease`,
// `isMissingReceipt`). These let that bridge use `Effect.catchTag` instead.

/** No Release exists at the requested id (or it is not a Release from the configured deployment). */
export class ReleaseNotFoundError extends Schema.TaggedError<ReleaseNotFoundError>()("ReleaseNotFoundError", {
  releaseId: Schema.String,
}) {
  readonly outcome: Outcome = "not_applied";
}

/** The fullnode and the indexer both have no record of this transaction digest. */
export class ReceiptNotFoundError extends Schema.TaggedError<ReceiptNotFoundError>()("ReceiptNotFoundError", {
  digest: Schema.String,
}) {
  readonly outcome: Outcome = "not_applied";
}

/** The transaction exists, but its effects contain no `record_shop::listing::RecordSoldEvent`. */
export class RecordPurchaseNotFoundError extends Schema.TaggedError<RecordPurchaseNotFoundError>()(
  "RecordPurchaseNotFoundError",
  {
    digest: Schema.String,
  },
) {
  readonly outcome: Outcome = "not_applied";
}

/** An object exists at the requested Pressing id, but is not a Pressing from the configured Record package. */
export class ForeignPressingError extends Schema.TaggedError<ForeignPressingError>()("ForeignPressingError", {
  pressingId: Schema.String,
  actualType: Schema.optional(Schema.String),
}) {
  readonly outcome: Outcome = "not_applied";
  override get message(): string {
    return `@misofm/platform: object ${this.pressingId} is not a Pressing from the configured Record package.`;
  }
}

/** A `royalty_pool::pool::RoyaltyClaimedEvent` the indexer returned does not carry the fields this package expects. */
export class MalformedRoyaltyClaimedEventError extends Schema.TaggedError<MalformedRoyaltyClaimedEventError>()(
  "MalformedRoyaltyClaimedEventError",
  {
    digest: Schema.String,
    reason: Schema.String,
  },
) {
  readonly outcome: Outcome = "not_applied";
  override get message(): string {
    return `@misofm/platform: ${this.reason} (transaction ${this.digest}).`;
  }
}
