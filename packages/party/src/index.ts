// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// `@misofm/party` — the party-protocol object model: Party identity, its admin cap,
// and consent-based group membership. Everything Miso offers on top of a Party
// (profiles, media, roles, tags, genres, CTAs, platform links, the party
// wallet) is an extension and ships from `@misofm/platform`.
//
// The service, its layers, its errors and the derived Promise registration:
export { PartyProtocol, PARTY_PROTOCOL_TEST_DEPLOYMENT, type BoundBuilders, type PartyProtocolService } from "./PartyProtocol.ts";
export { partyProtocol, type PartyProtocolOptions } from "./extension.ts";
export {
  PartyNotFound,
  PartyNotFoundError,
  PartyProtocolDeploymentError,
  type PartyBatchItemError,
  type PartyReadError,
} from "./errors.ts";
export * from "./types.ts";
export * from "./transactions.ts";
export * from "./queries.ts";
export * from "./deployments.ts";
export * from "./events.ts";

// Generated, ABI-bound bindings (BCS structs + type-safe Move calls).
export * as contracts from "./contracts.ts";
