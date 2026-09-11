// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// `@misofm/musicos`: a sui-effect extension for the Miso object model
// (Composition, Recording, Release, Track). The `Musicos` service, its
// layers, its errors, its PTB fragments, its event decoders, and the derived
// `musicos()` Promise registration — see `docs/extensions.md` in `sui-effect`
// for the contract this package follows.

export {
  Musicos,
  type DeriveTargetReleaseIdParams,
  type MusicosOptions,
  type MusicosService,
  type OwnedReadError,
  type ReadError,
} from "./Musicos.ts";
export { musicos } from "./extension.ts";
export { MusicosDeploymentInvalid, MusicosTreasuryCapNotFound } from "./errors.ts";

// Domain types (unchanged by the conversion) and PTB fragments.
export * from "./types.ts";
export * from "./transactions.ts";
export * from "./numeric.ts";
export * from "./derive.ts";

// Event decoders: the camelCase convenience wrappers, and the raw registry.
export {
  parseCompositionCreatedEvent,
  parseCompositionPublishedEvent,
  parseCompositionSharesGrantedEvent,
  parseRecordingCreatedEvent,
  parseRecordingPublishedEvent,
  parseReleaseCreatedEvent,
  parseReleasePublishedEvent,
  parseReleaseRegistryCreatedEvent,
  type EventDecoder,
} from "./parsers.ts";
export { eventParsers } from "./events.ts";

// Deployment manifest (unchanged except its error class, now `MusicosDeploymentInvalid`).
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
// still imports these names from `@misofm/musicos`. Neither is part of the
// target shape misofm/sdks#34 describes.

import type { Recipe } from "sui-effect";

/** @deprecated Use `Recipe` from `sui-effect`; every builder in `./transactions.ts` is already one. Kept for platform's `packages/platform/src/transactions.ts`. */
export type TxThunk = Recipe;
