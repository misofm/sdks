// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Streaming transcodes as the platform sees them: the `miso-hls/v1` contract
 * from `@misofm/streaming`, plus where a client reads a track's items from.
 */

import { MASTER_PLAYLIST, quiltItemUrl } from "@misofm/streaming";
import { walrusAggregatorUrl, type WalrusNetwork } from "./walrus.ts";

export * from "@misofm/streaming";

/** The master playlist URL for a track's transcode Quilt on a network's aggregator. */
export function streamUrl(network: WalrusNetwork, quiltId: string): string {
  return quiltItemUrl(walrusAggregatorUrl(network), quiltId, MASTER_PLAYLIST);
}
