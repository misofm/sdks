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
import { Sui, SuiCore, SuiGraphQL, type NetworkMismatch, type TransportError } from "sui-effect";
import { miso, type MisoClient as MisoExtensionClient } from "../client.ts";
import { Miso, type MisoLayerError } from "../Miso.ts";
import { getMisoPlatformDeployment, type MisoPlatformDeployment } from "../deployments.ts";
import { misoConfig, networkFrom, type MisoConfig, type MisoConfigOverrides, type Network } from "./config.ts";

function definedOverrides<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

export interface MisoClient {
  config: MisoConfig;
  /** gRPC data plane. */
  sui: SuiGrpcClient;
  /** GraphQL RPC, for `Effect.provide(SuiGraphQL.layer(client.graphql))`. */
  graphql: SuiGraphQLClient;
  /** The raw GraphQL client — identical to `graphql`; both names are kept for
   * source compatibility with callers migrating from the pre-Effect client. */
  graphqlRaw: SuiGraphQLClient;
  /**
   * The `client.$extend(miso({ deployment, graphqlClient }))` face — the
   * documented app-edge entry point for a Promise consumer: `client.miso.*`.
   */
  client: SuiGrpcClient & { readonly miso: MisoExtensionClient };
  /**
   * `Miso | Sui | SuiCore | SuiGraphQL`, ready to provide to an Effect
   * consumer that wants `yield* Miso` directly (the read service) instead of
   * going through the Promise face — or to any of this package's standalone
   * `read/*` functions, which only ever need the narrower `Sui | SuiGraphQL`
   * a superset layer still satisfies:
   * `Effect.provide(getReleaseDetail(id, config), client.layer)`.
   */
  layer: Layer.Layer<Miso | Sui | SuiCore | SuiGraphQL, MisoLayerError | NetworkMismatch | TransportError>;
}

export interface CreateMisoClientOptions extends MisoConfigOverrides {
  /** "testnet" | "mainnet". A bare string (e.g. a Worker's `NETWORK` var) is accepted. */
  network?: Network | string;
  /** Complete verified configuration for a custom or unbundled deployment. */
  config?: MisoConfig;
  /**
   * The complete deployment `Miso`/`client.miso` build from. Defaults to the
   * bundled manifest for `network` — required alongside a custom `config` on
   * a network with no bundled entry, since `MisoConfig` alone (a package-id
   * subset) cannot reconstruct the `operations`/`packages` sections
   * `Miso.layer` needs.
   */
  deployment?: MisoPlatformDeployment;
}

/**
 * Build the client from a bundled network or a complete verified custom config.
 */
export function createMisoClient(options: CreateMisoClientOptions = {}): MisoClient {
  const { network, config: providedConfig, deployment: providedDeployment, ...overrides } = options;
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
  const deployment = providedDeployment ?? getMisoPlatformDeployment(requestedNetwork);

  const sui = new SuiGrpcClient({ baseUrl: config.grpcUrl, network: config.network });
  const graphqlRaw = new SuiGraphQLClient({ url: config.graphqlUrl, network: config.network });

  const suiPlusCore = Sui.layerNoDeps.pipe(Layer.provideMerge(SuiCore.layerGrpc({ network: config.network, baseUrl: config.grpcUrl })));
  const base = Layer.merge(suiPlusCore, SuiGraphQL.layer(graphqlRaw));
  const layer = Miso.layer(deployment).pipe(Layer.provideMerge(base));

  const client = sui.$extend(miso({ deployment, graphqlClient: graphqlRaw }));

  return {
    config,
    sui,
    graphql: graphqlRaw,
    graphqlRaw,
    client,
    layer,
  };
}
