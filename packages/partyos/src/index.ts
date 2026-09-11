// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// `@misofm/partyos` — the PartyOS object model: Party identity, its admin cap,
// and consent-based group membership. Everything Miso offers on top of a Party
// (profiles, media, roles, tags, genres, CTAs, platform links, the party
// wallet) is an extension and ships from `@misofm/platform`.
//
// The service, its layers, its errors and the derived Promise registration:
export { Partyos, PARTYOS_TEST_DEPLOYMENT, type BoundBuilders, type PartyosService } from "./Partyos.ts";
export { partyos, type PartyosOptions } from "./extension.ts";
export {
  PartyNotFound,
  PartyNotFoundError,
  PartyosDeploymentError,
  type PartyBatchItemError,
  type PartyReadError,
} from "./errors.ts";
export * from "./types.ts";
export * from "./transactions.ts";
export * from "./queries.ts";
export * from "./deployments.ts";
export * from "./events.ts";

// Deprecated compatibility surface — see `./legacy-client.ts` / `./legacy-queries.ts` for why it is kept.
export { bindModulePackage, PartyosClient, PartyProtocolClient } from "./legacy-client.ts";
export { getPartiesByIds, getPartyById, getPendingMemberships } from "./legacy-queries.ts";

// Generated, ABI-bound bindings (BCS structs + type-safe Move calls).
export * as contracts from "./contracts.ts";
