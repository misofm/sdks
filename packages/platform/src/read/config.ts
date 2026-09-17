// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Per-network on-chain identity: which packages the reads address, which objects
// they read, and which endpoints they read through. Every id that used to be a
// hard-coded constant inside miso-app (`lib/party.ts`, `lib/release.ts`,
// `lib/money.ts`, `lib/pressing.ts`) lives here instead, so a redeploy is a change
// in ONE file that every surface picks up.
//
// Network values derive from the verified deployment bundled by the platform SDK.

import type { MisoDeployment } from "@misofm/musicos/deployments";
import type { PartyDeployment } from "@misofm/partyos/deployments";
import { getMisoPlatformDeployment, type MisoPlatformDeployment, type PartyExtensionsDeployment, type RecordSalesDeployment } from "../deployments.ts";
import { walrusAggregatorUrl } from "../walrus.ts";

export type Network = "testnet" | "mainnet";

/** Missing defaults to Testnet for local development; invalid values fail closed. */
export function networkFrom(value: string | undefined): Network {
  if (value === undefined || value === "testnet") return "testnet";
  if (value === "mainnet") return "mainnet";
  throw new Error(`@misofm/platform/read: unsupported network "${value}".`);
}

/** Package ids for the miso protocol core and the extensions the read layer touches. */
export interface ProtocolIds {
  /** Current Vault package ID, or null until its custody layout/API is deployed.
   * Historical IDs are metadata only and cannot select current-schema readers.
   */
  vault: string | null;
  /** `release_cover_art` — the release cover extension. */
  releaseCoverArt: string;
  /** `release_kind` — the Release's optional self-declared kind. */
  releaseKind: string;
  /** `release_description` — optional editorial description. */
  releaseDescription: string;
  /** `genre` vocabulary and `release_genre` assignment extension. */
  genre: string;
  releaseGenre: string;
  /** `recording_master` — optional self-attested Audio masters. */
  recordingMaster?: string;
  /** `recording_streaming_transcode` — the `miso-hls/v1` Quilt a track streams from, or null when the generation lacks it. */
  recordingStreamingTranscode: string | null;
  /** `recording_engine_session` — the Session V1 blob ID and stems a track mixes from, or null when the generation lacks it. */
  recordingEngineSession: string | null;
  /** `composition_credits` / `recording_credits` / `release_credits` extensions. */
  compositionCredits: string;
  recordingCredits: string;
  releaseCredits: string;
  /** `miso_credit` — the shared `Credit<Role>` value type credits are built from. */
  credit: string;
  /** `royalty_pool` — the pool package royalty deposits and claims go through. */
  royaltyPool: string;
}

/** The currency the app prices records in, and where test dollars come from. */
export interface MoneyIds {
  /** Coin type balances, listings, and purchases are denominated in. */
  usdCoinType: string;
  usdDecimals: number;
}

export interface MisoConfig {
  network: Network;
  /** Complete package set used by the integrated `client.miso` SDK. */
  deployment: MisoDeployment;
  protocol: ProtocolIds;
  /** The Party object model deployment (`@misofm/partyos`). */
  partyos: PartyDeployment;
  /** First-party Party extension package ids. */
  party: PartyExtensionsDeployment;
  /** Final Record/Record Shop deployment, or an explicit unavailable legacy state. */
  recordSales: RecordSalesDeployment;
  money: MoneyIds;
  /** Sui gRPC-web endpoint the data plane reads through. */
  grpcUrl: string;
  /**
   * Sui GraphQL RPC endpoint. Needed for the two things gRPC cannot answer:
   * "which object has type X" (share type → work id) and reading a transaction
   * the fullnode has already pruned.
   */
  graphqlUrl: string;
  /** Walrus aggregator serving cover art and party media for this network. */
  walrusAggregatorUrl: string;
  /**
   * Public versioned API base, used to build avatar URLs
   * (`/v1/parties/:partyId/avatar`). Avatars are an R2-backed API lane, not
   * on-chain data, so the SDK needs the public base to hand back a URL a
   * browser can actually fetch.
   */
  apiBaseUrl: string;
  /** Explicit currency offers on the Discover shelf, in display order. */
  discoverSales: readonly DiscoverSale[];
}

/** One release/currency pair to resolve by Pressing and Listing derived address. */
export interface DiscoverSale {
  releaseId: string;
  edition: number;
  currencyType: string;
}

/** Fields a deployment may override without forking the whole config (endpoints, shelf). */
export type MisoConfigOverrides = Partial<
  Pick<MisoConfig, "grpcUrl" | "graphqlUrl" | "walrusAggregatorUrl" | "apiBaseUrl" | "discoverSales">
>;

/**
 * The config for a complete `MisoPlatformDeployment` — the same manifest
 * `Miso.layer(deployment)` builds the service from — so `Miso`'s bound
 * `read.*` namespace (misofm/sdks#35, WP6) and `misoConfig` share one
 * derivation instead of two.
 *
 */
export function configFromDeployment(deployment: MisoPlatformDeployment, overrides: MisoConfigOverrides = {}): MisoConfig {
  // Old Vault identities cannot select the current stored-field layout.
  // Keep this config constructible; only Vault-dependent reads fail typed.
  const vaultPackageId = deployment.operations.status === "available"
    ? deployment.operations.vault.packageId
    : null;
  const config: MisoConfig = {
    network: deployment.network,
    deployment: deployment.protocol,
    partyos: deployment.partyos,
    party: deployment.party,
    recordSales: deployment.recordSales,
    protocol: {
      vault: vaultPackageId,
      releaseCoverArt: deployment.packages.releaseCoverArt,
      releaseKind: deployment.packages.releaseKind,
      releaseDescription: deployment.packages.releaseDescription,
      genre: deployment.packages.genre,
      releaseGenre: deployment.packages.releaseGenre,
      recordingMaster: deployment.packages.recordingMaster,
      recordingStreamingTranscode: deployment.packages.recordingStreamingTranscode ?? null,
      recordingEngineSession: deployment.packages.recordingEngineSession ?? null,
      compositionCredits: deployment.packages.compositionCredits,
      recordingCredits: deployment.packages.recordingCredits,
      releaseCredits: deployment.packages.releaseCredits,
      credit: deployment.packages.credit,
      royaltyPool: deployment.packages.royaltyPool,
    },
    money: {
      // Native Sui USDC: https://www.circle.com/blog/now-available-native-usdc-on-sui
      usdCoinType: deployment.network === "mainnet"
        ? "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"
        : "0x77774cb7b8cb5622b4ef2658101bf5f1e965418297fe874b683df8f760b6e749::fakeusd::FakeUsd",
      usdDecimals: 6,
    },
    grpcUrl: `https://fullnode.${deployment.network}.sui.io`,
    graphqlUrl: `https://graphql.${deployment.network}.sui.io/graphql`,
    walrusAggregatorUrl: walrusAggregatorUrl(deployment.network),
    apiBaseUrl: `https://api.${deployment.network}.miso.fm/v1`,
    discoverSales: [],
  };
  return { ...config, ...stripUndefined(overrides) };
}

/** The config for `network`, derived from this SDK's verified deployment map. */
export function misoConfig(network: Network, overrides: MisoConfigOverrides = {}): MisoConfig {
  return configFromDeployment(getMisoPlatformDeployment(network), overrides);
}

/** `{ a: undefined }` must not clobber a real default when spread. */
function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
