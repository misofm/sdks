// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The shared error vocabulary for every `@misofm/*` SDK. Every failure a caller
// might need to act on is a `Schema.TaggedError`, carrying the fields needed to
// act (object id, type, package, cause) rather than a bare message. Foreign
// failures (RPC rejections, thrown parsers) are wrapped with `cause: Schema.Defect()`
// so the original error is preserved but not part of the typed contract.

import { Schema } from "effect";
import type { SuiClientTypes } from "@mysten/sui/client";

/**
 * The requested object does not exist on-chain (never existed, was deleted, or has no such dynamic field).
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `ObjectNotFound` (plus `ObjectDeleted` /
 * `ObjectUnavailable`) instead — see the migration table in this package's README.
 */
export class ObjectNotFoundError extends Schema.TaggedError<ObjectNotFoundError>()("ObjectNotFoundError", {
  objectId: Schema.String,
}) {}

/**
 * An object's on-chain type does not match the type the caller expected.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `DecodeError { objectId, expectedType, issue }`
 * instead — see the migration table in this package's README.
 */
export class ObjectTypeMismatchError extends Schema.TaggedError<ObjectTypeMismatchError>()(
  "ObjectTypeMismatchError",
  {
    objectId: Schema.String,
    expected: Schema.String,
    actual: Schema.String,
  },
) {}

/**
 * A Core API call threw or rejected for a reason other than a missing object.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `TransportError { method, retryable, status?, cause }`
 * instead — see the migration table in this package's README.
 */
export class SuiRpcError extends Schema.TaggedError<SuiRpcError>()("SuiRpcError", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A generated BCS codec's `.parse` threw, or the parsed value failed `Schema.decodeUnknown` into the domain type.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `DecodeError` instead — see the migration table in
 * this package's README.
 */
export class BcsDecodeError extends Schema.TaggedError<BcsDecodeError>()("BcsDecodeError", {
  type: Schema.String,
  objectId: Schema.optional(Schema.String),
  cause: Schema.Defect(),
}) {}

/**
 * A submitted transaction executed but its on-chain effects reported failure.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `ExecutionFailed { digest, reason, command?, effects }`
 * instead — see the migration table in this package's README.
 */
export class TransactionFailedError extends Schema.TaggedError<TransactionFailedError>()("TransactionFailedError", {
  digest: Schema.String,
  status: Schema.declare((u): u is SuiClientTypes.ExecutionStatus => true),
}) {}

/**
 * A `SuiGraphQL` read was requested but no GraphQL client is configured for this context.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. sui-effect has no GraphQL layer; this stays a
 * platform-owned concern — see the migration table in this package's README.
 */
export class GraphQLUnavailableError extends Schema.TaggedError<GraphQLUnavailableError>()(
  "GraphQLUnavailableError",
  {},
) {}

/**
 * A deployment manifest failed validation (wrong shape, missing package id, unverified network, ...).
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Define an equivalent tag-prefixed
 * `Schema.TaggedError` (with `outcome: "not_applied"`) in each consuming package's own `errors.ts` instead —
 * see the migration table in this package's README.
 */
export class DeploymentError extends Schema.TaggedError<DeploymentError>()("DeploymentError", {
  message: Schema.String,
}) {}

/**
 * The error union every `reads.ts` primitive can fail with.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `GetObjectError` instead — see the migration
 * table in this package's README.
 */
export type SuiReadError = ObjectNotFoundError | ObjectTypeMismatchError | SuiRpcError | BcsDecodeError;
