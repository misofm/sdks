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

import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { Layer } from "effect";
import { Sui, SuiGraphQL, type NetworkMismatch, type TransportError } from "sui-effect";
import { misoConfig, networkFrom, type MisoConfig, type MisoConfigOverrides, type Network } from "./config.ts";

function definedOverrides<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

export interface MisoClient {
  config: MisoConfig;
  /**
   * gRPC data plane. TODO(stage 2/3, WP6 "facade derivation"): the
   * predecessor's `.sui` was `$extend`-registered with `miso()`, giving
   * `sui.miso.*` and `client.party`; those land once `Miso`'s
   * `SuiExtension.fromService` registration and the richer `MisoPartyService`
   * (WP3) exist. Until then this is the bare `SuiGrpcClient` and the
   * standalone `read/*` functions this package exports are the supported
   * path — see `docs/CONVERSION-STATUS.md`.
   */
  sui: SuiGrpcClient;
  /** GraphQL RPC, for `Effect.provide(SuiGraphQL.layer(client.graphql))`. */
  graphql: SuiGraphQLClient;
  /** The raw GraphQL client — identical to `graphql`; both names are kept for
   * source compatibility with callers migrating from the pre-Effect client. */
  graphqlRaw: SuiGraphQLClient;
  /**
   * `Sui | SuiGraphQL`, ready to provide to any of this package's standalone
   * `read/*` functions: `Effect.provide(getReleaseDetail(id, config), client.layer)`.
   * TODO(stage 2/3): widen to `Miso | Sui | SuiCore | SuiGraphQL` once
   * `MisoConfig` carries a complete `MisoPlatformDeployment` (today it only
   * carries the package-id subset `Miso.layer` would need) — the issue's
   * target shape for this helper.
   */
  layer: Layer.Layer<Sui | SuiGraphQL, NetworkMismatch | TransportError>;
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

  const sui = new SuiGrpcClient({ baseUrl: config.grpcUrl, network: config.network });
  const graphqlRaw = new SuiGraphQLClient({ url: config.graphqlUrl, network: config.network });

  const layer = Layer.mergeAll(
    Sui.layer({ network: config.network, baseUrl: config.grpcUrl }),
    SuiGraphQL.layer(graphqlRaw),
  );

  return {
    config,
    sui,
    graphql: graphqlRaw,
    graphqlRaw,
    layer,
  };
}
