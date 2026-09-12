// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Shared read plumbing for the platform reads.
//
// Not-found is a typed `ObjectNotFound`/`ObjectDeleted` (see
// `@unconfirmed/sui-effect`), matched with `Effect.catchTag("ObjectNotFound", ...)`
// — there is no `isNotFound` predicate to re-export anymore.
export {};
