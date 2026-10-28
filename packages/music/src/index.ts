// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// `@misofm/music`: a sui-effect extension for the Miso object model
// (Composition, Recording, Release, Track). The `MusicProtocol` service, its
// layers, its errors, its PTB fragments, its event decoders, and the derived
// `musicProtocol()` Promise registration — see `docs/extensions.md` in `sui-effect`
// for the contract this package follows.

export {
  MusicProtocol,
  type DeriveTargetReleaseIdParams,
  type MusicProtocolOptions,
  type MusicProtocolService,
  type OwnedReadError,
  type ReadError,
} from "./MusicProtocol.ts";
export { musicProtocol } from "./extension.ts";
export { MusicProtocolDeploymentInvalid, MusicProtocolTreasuryCapNotFound, MusicProtocolWorkNotFound } from "./errors.ts";

// Domain types (unchanged by the conversion) and PTB fragments.
export * from "./types.ts";
export * from "./transactions.ts";
export * from "./numeric.ts";
export * from "./derive.ts";

// Event decoders: the camelCase convenience wrappers, and the raw registry.
export {
  parseCompositionPublishedEvent,
  parseRecordingPublishedEvent,
  parseReleasePublishedEvent,
  parseReleaseRegistryCreatedEvent,
  type EventDecoder,
} from "./parsers.ts";
export { eventParsers } from "./events.ts";

// Deployment manifest (unchanged except its error class, now `MusicProtocolDeploymentInvalid`).
export * from "./deployments.ts";

// Package-bound generated calls and BCS codecs.
export * from "./packages.ts";

// The three GraphQL type-discovery reads this package keeps on `SuiGraphQL`
// (misofm/sdks#34, amended after scoping), plus the pure type-parameter
// helpers platform composes with them.
export {
  extractTypeParam,
  extractTypeParams2,
  getCompositionByShareType,
  getRecordingByShareType,
  getWorkAddressesByShareTypes,
  type WorkAddressesByShareType,
  type WorkShareTypes,
} from "./queries.ts";

// Generated, ABI-bound bindings (BCS structs + type-safe Move calls).
export * as contracts from "./contracts.ts";

// ============================================================================
// Deprecated compatibility
// ============================================================================
//
// Kept only because packages/platform (converted separately, misofm/sdks#35)
// still imports these names from `@misofm/music`. Neither is part of the
// target shape misofm/sdks#34 describes.

import type { Recipe } from "@unconfirmed/sui-effect";

/** @deprecated Use `Recipe` from `sui-effect`; every builder in `./transactions.ts` is already one. Kept for platform's `packages/platform/src/transactions.ts`. */
export type TxThunk = Recipe;
