// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Per-network on-chain identity: which packages the reads address, which objects
// they read, and which endpoints they read through. Every id that used to be a
// hard-coded constant inside miso-app (`lib/party.ts`, `lib/release.ts`,
// `lib/money.ts`, `lib/pressing.ts`) lives here instead, so a redeploy is a change
// in ONE file that every surface picks up.
//
// Testnet values are derived from the same verified deployment record exported
// by the platform SDK. Mainnet remains deliberately unavailable until a complete
// deployment is bundled for it.

import type { MisoDeployment } from "@misofm/protocol/deployments";
import { getMisoPlatformDeployment, type RecordSalesDeployment } from "../deployments.ts";
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
  /** `vault` — shared custody for protocol admin capabilities. */
  vault: string;
  /** `release_cover_art` — the release cover extension. */
  releaseCoverArt: string;
  /** `release_kind` — the Release's optional self-declared kind. */
  releaseKind: string;
  /** `recording_master_reference` — optional Walrus master pointers. */
  recordingMasterReference: string;
  /** `recording_streaming_transcode` — the `miso-hls/v1` Quilt a track streams from, or null when the generation lacks it. */
  recordingStreamingTranscode: string | null;
  /** `recording_engine_session` — the Session V1 blob and stems a track mixes from, or null when the generation lacks it. */
  recordingEngineSession: string | null;
  /** `composition_credits` / `recording_credits` / `release_credits` extensions. */
  compositionCredits: string;
  recordingCredits: string;
  releaseCredits: string;
  /** `miso_credit` — the shared `Credit<Role>` value type credits are built from. */
  credit: string;
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
   * Public origin of the Miso API, used to build avatar URLs (`/media/avatar/…`).
   * Avatars are an R2-backed API lane, not on-chain data, so the SDK needs the
   * public host to hand back a URL a browser can actually fetch.
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

/** The config for `network`, derived from this SDK's verified deployment map. */
export function misoConfig(network: Network, overrides: MisoConfigOverrides = {}): MisoConfig {
  const platform = getMisoPlatformDeployment(network);
  const vaultPackageId =
    platform.operations.status === "available"
      ? platform.operations.vault.packageId
      : platform.operations.legacy?.vaultPackageId;
  if (!vaultPackageId) {
    throw new Error(
      `@misofm/platform/read: no current or legacy Vault type metadata for "${network}".`,
    );
  }
  const config: MisoConfig = {
    network,
    deployment: platform.protocol,
    recordSales: platform.recordSales,
    protocol: {
      // Read-only legacy type discovery does not make this package an
      // executable operations ABI; client call surfaces remain fail closed.
      vault: vaultPackageId,
      releaseCoverArt: platform.packages.releaseCoverArt,
      releaseKind: platform.packages.releaseKind,
      recordingMasterReference: platform.packages.recordingMasterReference,
      recordingStreamingTranscode: platform.packages.recordingStreamingTranscode ?? null,
      recordingEngineSession: platform.packages.recordingEngineSession ?? null,
      compositionCredits: platform.packages.compositionCredits,
      recordingCredits: platform.packages.recordingCredits,
      releaseCredits: platform.packages.releaseCredits,
      credit: platform.packages.credit,
    },
    money: {
      usdCoinType:
        "0x77774cb7b8cb5622b4ef2658101bf5f1e965418297fe874b683df8f760b6e749::fakeusd::FakeUsd",
      usdDecimals: 6,
    },
    grpcUrl: "https://fullnode.testnet.sui.io",
    graphqlUrl: "https://graphql.testnet.sui.io/graphql",
    walrusAggregatorUrl: walrusAggregatorUrl(network),
    apiBaseUrl: "https://api.testnet.miso.fm",
    discoverSales: [],
  };
  return { ...config, ...stripUndefined(overrides) };
}

/** `{ a: undefined }` must not clobber a real default when spread. */
function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
