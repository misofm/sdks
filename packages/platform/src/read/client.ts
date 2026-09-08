// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// The one client every read in this SDK goes through.
//
// Two transports, because Sui splits the job:
//   core (gRPC)  the data plane — objects by id, objects by owner, balances,
//                transactions. Everything cheap and current.
//   graphql      the two questions gRPC cannot answer: "which object has type X"
//                (share type → work id, for the studio catalog and the receipt's
//                royalty hop) and "what did this pruned transaction do".
//
// It also carries the resolved `MisoConfig`, so a read function takes ONE argument
// and never has a package id threaded through its signature.
//
// Party now shares the same network SDK registration and deployment as protocol
// core, so every read hangs off one `sui.miso` namespace.

import type { ClientWithCoreApi } from "@mysten/sui/client";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { miso, type MisoProtocolClient } from "@misofm/musicos/client";
import { PartyosClient } from "@misofm/partyos";
import { PartyPlatformClient } from "../party/index.ts";
import { misoConfig, networkFrom, type MisoConfig, type MisoConfigOverrides, type Network } from "./config.ts";

function definedOverrides<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

/**
 * The transport slice every `@misofm/platform/read` function needs to run its
 * `Effect`: `Effect.provide(SuiClient.layer(client.protocol))`. `sui` (below)
 * satisfies this structurally, since it is a real `ClientWithCoreApi`.
 */
export type ProtocolClient = ClientWithCoreApi;

/** A GraphQL client in the shape `@misofm/effect`'s `SuiGraphQL` service wants. */
export type ProtocolGraphQLClient = SuiGraphQLClient;

export interface MisoClient {
  config: MisoConfig;
  /** gRPC data plane (object-model core only; Party is `client.party`). */
  sui: SuiGrpcClient & { miso: MisoProtocolClient };
  /** The same client, for `Effect.provide(SuiClient.layer(client.protocol))`. */
  protocol: ProtocolClient;
  /** GraphQL RPC, for `Effect.provide(SuiGraphQL.layer(client.graphql))`. */
  graphql: ProtocolGraphQLClient;
  /** The raw GraphQL client — identical to `graphql`; both names are kept for
   * source compatibility with callers migrating from the pre-Effect client. */
  graphqlRaw: SuiGraphQLClient;
  /** Party identity and profile reads/builders, bound to `config.partyos`/`config.party`. */
  party: PartyPlatformClient;
}

export interface CreateMisoClientOptions extends MisoConfigOverrides {
  /** "testnet" | "mainnet". A bare string (e.g. a Worker's `NETWORK` var) is accepted. */
  network?: Network | string;
  /** Complete verified configuration for a custom or unbundled deployment. */
  config?: MisoConfig;
}

/**
 * Build the client from a bundled network or a complete verified custom config.
 */
export function createMisoClient(options: CreateMisoClientOptions = {}): MisoClient {
  const { network, config: providedConfig, ...overrides } = options;
  const requestedNetwork = networkFrom(network);
  // A caller-supplied verified deployment may still override transport URLs or
  // the discover shelf; undefined fields never erase verified config values.
  const config = providedConfig
    ? { ...providedConfig, ...definedOverrides(overrides) }
    : misoConfig(requestedNetwork, overrides);
  if (network !== undefined && config.network !== requestedNetwork) {
    throw new Error(
      `@misofm/platform/read: provided config is for ${config.network}, not ${requestedNetwork}.`,
    );
  }

  const grpc = new SuiGrpcClient({ baseUrl: config.grpcUrl, network: config.network });
  const graphqlRaw = new SuiGraphQLClient({ url: config.graphqlUrl, network: config.network });

  const sui = grpc.$extend(miso({ deployment: config.deployment }));
  const party = new PartyPlatformClient(sui, new PartyosClient(sui, config.partyos), config.party);

  return {
    config,
    sui,
    protocol: sui,
    graphql: graphqlRaw,
    graphqlRaw,
    party,
  };
}
