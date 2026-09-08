// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// `@misofm/musicos` has no failure modes of its own beyond the shared Sui
// read/write vocabulary — every query is a Core object read, a GraphQL type
// discovery, or a BCS decode, and every one of those is already covered by
// `@misofm/effect`'s tagged errors. Re-exported here so callers can import the
// complete error vocabulary from one place (`@misofm/musicos/errors`) without
// also depending on `@misofm/effect` directly.
import { Schema } from "effect";

export {
  ObjectNotFoundError,
  ObjectTypeMismatchError,
  SuiRpcError,
  BcsDecodeError,
  TransactionFailedError,
  GraphQLUnavailableError,
  DeploymentError,
  type SuiReadError,
} from "@misofm/effect/errors";

/** One object id was requested under two different work kinds in a single batched read. */
export class ConflictingWorkKindError extends Schema.TaggedError<ConflictingWorkKindError>()(
  "ConflictingWorkKindError",
  {
    objectId: Schema.String,
    kinds: Schema.Array(Schema.String),
  },
) {}
