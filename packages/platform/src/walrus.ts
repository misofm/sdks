// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Walrus facts the platform depends on that no contract module should know:
 * the shard configuration ids are derived against, how long Miso stores
 * published blobs, and where clients read them from.
 */

/**
 * Shard count of the Walrus committees Miso publishes to. Blob and Quilt ids
 * depend on it, so `put` and `prepare` derive ids against this constant
 * offline, and `store` must assert the live committee still reports it
 * before uploading. Testnet and mainnet both run 1000 shards.
 */
export const WALRUS_N_SHARDS = 1000;

/**
 * Initial storage duration for every blob Miso publishes. A mainnet Walrus
 * epoch is two weeks, so four epochs is eight weeks; blobs are shared and
 * permanent, so anyone can extend them. Not a release.json field: publication
 * policy is the platform's, not the release owner's.
 */
export const WALRUS_STORAGE_EPOCHS = 4;

/**
 * Published blobs are permanent (not deletable) and wrapped as shared blob
 * objects, so anyone, not only the publisher, can fund an extension when the
 * storage period nears its end.
 */
export const WALRUS_BLOBS_DELETABLE = false;
export const WALRUS_BLOBS_SHARED = true;

export type WalrusNetwork = "testnet" | "mainnet";

/**
 * Where clients read published blobs and Quilt items. A Miso CDN
 * (`cdn.miso.fm`) will front this later; the URL shape stays the same.
 */
export function walrusAggregatorUrl(network: WalrusNetwork): string {
  return `https://aggregator.${network}.walrus.mirai.cloud`;
}
