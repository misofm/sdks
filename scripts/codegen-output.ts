// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * The complete, closed-world directory set emitted by the current codegen config —
 * one entry per `packages[].package` output plus `utils`, which `@mysten/codegen`
 * writes on every run without a corresponding config entry, and the `frozen`
 * package entries (see `sui-codegen.config.ts`): retained here so each survives
 * pruning even though the runner never regenerates them.
 */
export const GENERATED_CONTRACT_DIRECTORIES = new Set([
  "miso",
  "miso_party",
  "party_cta",
  "party_genre",
  "party_media",
  "party_music",
  "party_platform_link",
  "party_pro_link",
  "party_profile",
  "party_roles",
  "party_social",
  "party_tags",
  "party_wallet",
  "composition_credits",
  "recording_advisory",
  "recording_credits",
  "recording_language",
  "recording_streaming_transcode",
  "release_cover_art",
  "release_credits",
  "release_description",
  "release_dsp_link",
  "release_genre",
  "release_kind",
  "royalty_pool",
  "routed_stake",
  "vault",
  "genre",
  "cover_art",
  "composition_royalty_pool",
  "recording_royalty_pool",
  "release_revenue_distributor",
  "miso_record",
  "utils",
  // Frozen — see the corresponding `frozen` package entry in
  // sui-codegen.config.ts for why each is un-generatable upstream.
  "recording_master_reference",
  "composition_routed_stake",
  "composition_royalty_pool_plugin",
  "recording_royalty_pool_plugin",
  "release_revenue_distributor_plugin",
  "miso_record_shop",
]);

/**
 * Enforce codegen as a closed-world operation. A removed Move package must not
 * leave a stale generated namespace that can be accidentally imported.
 */
export function pruneRemovedPackageDirectories(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !GENERATED_CONTRACT_DIRECTORIES.has(entry.name)) {
      rmSync(join(directory, entry.name), { recursive: true, force: true });
    }
  }
}
