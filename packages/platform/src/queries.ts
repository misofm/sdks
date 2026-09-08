// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Shared read plumbing for the platform reads.
//
// Not-found is a typed `ObjectNotFoundError` (see `@misofm/effect/errors`),
// matched with `Effect.catchTag("ObjectNotFoundError", ...)` — there is no
// `isNotFound` predicate to re-export anymore.
export {};
