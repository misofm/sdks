// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The platform-specific error vocabulary, built on the shared foundation
// (`@misofm/effect/errors`). Every failure a caller might need to act on is a
// `Schema.TaggedError` carrying the fields needed to act; `isNotFound`-style
// message sniffing is replaced by `Effect.catchTag` against these tags.

import { Schema } from "effect";

// Re-export the foundation vocabulary so a platform consumer never needs a
// second import for the errors platform reads/executes surface directly.
export {
  BcsDecodeError,
  DeploymentError,
  GraphQLUnavailableError,
  ObjectNotFoundError,
  ObjectTypeMismatchError,
  SuiRpcError,
  TransactionFailedError,
  type SuiReadError,
} from "@misofm/effect/errors";

/** Record sales (Record + Record Shop) are unavailable on this deployment. */
export class RecordSalesUnavailableError extends Schema.TaggedError<RecordSalesUnavailableError>()(
  "RecordSalesUnavailableError",
  {
    reason: Schema.String,
  },
) {
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
) {}

/** The connected client's network does not match the configured deployment's network. */
export class MisoNetworkMismatchError extends Schema.TaggedError<MisoNetworkMismatchError>()(
  "MisoNetworkMismatchError",
  {
    clientNetwork: Schema.String,
    deploymentNetwork: Schema.String,
  },
) {
  override get message(): string {
    return `@misofm/platform: client network "${this.clientNetwork}" does not match deployment network "${this.deploymentNetwork}"`;
  }
}

/** The connected endpoint's chain identifier does not match the configured deployment's. */
export class MisoChainIdentifierMismatchError extends Schema.TaggedError<MisoChainIdentifierMismatchError>()(
  "MisoChainIdentifierMismatchError",
  {
    actual: Schema.String,
    expected: Schema.String,
  },
) {
  override get message(): string {
    return `@misofm/platform: endpoint chain identifier "${this.actual}" does not match deployment chain identifier "${this.expected}"`;
  }
}

/** A method that requires the exact-chain validation lifecycle was called before `ready()`. */
export class MisoClientNotReadyError extends Schema.TaggedError<MisoClientNotReadyError>()(
  "MisoClientNotReadyError",
  {
    operation: Schema.String,
  },
) {
  override get message(): string {
    return `@misofm/platform: ${this.operation} requires an exact-chain validation lifecycle; call and await client.miso.ready() first`;
  }
}

/** An on-chain `RecordSoldEvent` could not be decoded into a `RecordSale`. */
export class MalformedRecordSoldEventError extends Schema.TaggedError<MalformedRecordSoldEventError>()(
  "MalformedRecordSoldEventError",
  {
    digest: Schema.optional(Schema.String),
    reason: Schema.optional(Schema.String),
  },
) {}

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
}) {}

/** The fullnode and the indexer both have no record of this transaction digest. */
export class ReceiptNotFoundError extends Schema.TaggedError<ReceiptNotFoundError>()("ReceiptNotFoundError", {
  digest: Schema.String,
}) {}

/** The transaction exists, but its effects contain no `record_shop::listing::RecordSoldEvent`. */
export class RecordPurchaseNotFoundError extends Schema.TaggedError<RecordPurchaseNotFoundError>()(
  "RecordPurchaseNotFoundError",
  {
    digest: Schema.String,
  },
) {}

/** An object exists at the requested Pressing id, but is not a Pressing from the configured Record package. */
export class ForeignPressingError extends Schema.TaggedError<ForeignPressingError>()("ForeignPressingError", {
  pressingId: Schema.String,
  actualType: Schema.optional(Schema.String),
}) {
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
  override get message(): string {
    return `@misofm/platform: ${this.reason} (transaction ${this.digest}).`;
  }
}
