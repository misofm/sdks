// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// `@misofm/platform` — the PLATFORM layer.
//
// Miso's own product sits on top of the permissionless protocol, and the two
// ship as separate packages because they have different promises:
//
//   @misofm/musicos  PROTOCOL — Composition, Recording, Release. The open layer
//                     anyone can build on, and nobody needs Miso's permission to use.
//   @misofm/platform  PLATFORM — Pressing, Listing, Record, and the first-party
//                     EXTENSIONS. How MISO sells copies of a release, and the
//                     opinions it attaches to a work along the way.
//
// A release is protocol. Pressing a record off it and selling that record is
// platform. Keeping the split at the package boundary is what stops the protocol
// from quietly growing a storefront. Core `release::new` uses its shared
// `ReleaseRegistry` as the PTB-callable derivation parent.
//
// Extensions live on this side of the line for the same reason. An extension is
// not part of what a Composition or Recording IS — it is a choice Miso makes
// about how to describe one (who gets credited and in what vocabulary, what the
// cover looks like, whether royalties accumulate in a pool). The protocol gives
// extensions a `&mut UID` hook and stops there; every opinion about what to hang
// off it is business logic, and business logic ships from the platform package.

// The `Miso` sui-effect service (misofm/sdks#35). WP1 skeleton only — see
// docs/CONVERSION-STATUS.md for what stage 2/3 still adds before this
// replaces the class-based `miso()`/`MisoPlatformClient` below as the
// recommended entry point.
export { Miso, type MisoLayerError, type MisoService } from "./Miso.ts";

// The recommended entry point is the client extension (see ./client.ts); the bare
// builders and readers stay exported for callers that hold ids themselves.
export {
  miso,
  misoPlatform,
  MisoChainIdentifierMismatchError,
  MisoClientNotReadyError,
  MisoClient,
  MisoNetworkMismatchError,
  MisoPlatformClient,
} from "./client.ts";
export type {
  ConfiguredReleaseGraphParams,
  MisoOptions,
  MisoPlatformConfig,
} from "./client.ts";
export * from "./deployments.ts";
export * from "./pressing.ts";
export * from "./transactions.ts";
export * from "./share.ts";
export * from "./share-template.ts";
export * from "./release-graph.ts";
export * from "./publication.ts";
export * from "./catalog.ts";
export * from "./walrus-ids.ts";
export * from "./streaming.ts";
export * from "./walrus.ts";

// Re-homed from the pre-split protocol package: extension/primitive package
// bindings, event decoders, and the generic royalty-pool / routed-stake
// queries and PTB builders (see the boundary rule above — these are all
// things Miso offers on top of the object model, not the model itself).
export * from "./packages.ts";
export { platformEventParsers } from "./events.ts";
export * from "./royalty.ts";

// High-level, JSON-safe platform projections used directly by clients and by
// the thin HTTP read service. Namespaced because these composed view types are
// intentionally distinct from the lower-level contract views above.
export * as read from "./read/index.ts";

// First-party extensions — attached to a protocol work via its cap-gated
// `uid_mut` hook.
export * from "./credits.ts";
export * from "./cover.ts";
export * from "./release-extensions.ts";
export * from "./genre.ts";
export * from "./recording-extensions.ts";
export * from "./vault.ts";

// Generated, ABI-bound bindings (BCS structs + type-safe Move calls).
export * as contracts from "./contracts.ts";
