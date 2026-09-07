// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Streaming transcodes as the platform sees them: the `miso-hls/1` contract
 * from `@misofm/streaming`, plus the Walrus facts a publisher needs that the
 * contract deliberately does not know.
 */

export * from "@misofm/streaming";

/**
 * Shard count of the Walrus committees Miso publishes to. Blob and Quilt ids
 * depend on it, so `put` and `prepare` derive ids against this constant
 * offline, and `store` must assert the live committee still reports it
 * before uploading. Testnet and mainnet both run 1000 shards.
 */
export const WALRUS_N_SHARDS = 1000;
