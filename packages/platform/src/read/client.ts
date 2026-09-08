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
 * The structural slice of a Sui client the protocol SDK's read helpers want. They
 * declare `ClientWithCoreApi` against their own @mysten/sui; this alias names the
 * same shape from our side so the one cast in `createMisoClient` is explicit
 * rather than an `any` smeared across the codebase.
 */
export type ProtocolClient = Parameters<typeof import("@misofm/musicos").getReleaseById>[0];

/** A GraphQL client in the shape the protocol SDK's type-discovery queries want. */
export type ProtocolGraphQLClient = SuiGraphQLClient;

export interface MisoClient {
  config: MisoConfig;
  /** gRPC data plane (object-model core only; Party is `client.party`). */
  sui: SuiGrpcClient & { miso: MisoProtocolClient };
  /** The same client, typed for the protocol SDK's read helpers. */
  protocol: ProtocolClient;
  /** GraphQL RPC, typed for the protocol SDK's type-discovery queries. */
  graphql: ProtocolGraphQLClient;
  /** The raw GraphQL client, for this SDK's own queries (the pruned-transaction read). */
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
    protocol: sui as unknown as ProtocolClient,
    graphql: graphqlRaw as unknown as ProtocolGraphQLClient,
    graphqlRaw,
    party,
  };
}
