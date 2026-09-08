import type { SuiCodegenConfig } from "@mysten/codegen";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A package entry with no Move source to generate from. The runner retains its
 * existing generated directory (see `scripts/codegen-output.ts`) without ever
 * regenerating it — for a deployed, canonical binding whose source has since
 * been removed upstream.
 */
export interface FrozenPackageConfig {
  readonly package: string;
  readonly frozen: true;
}

export type MisoPackageConfig = SuiCodegenConfig["packages"][number] | FrozenPackageConfig;

/** `SuiCodegenConfig`, widened to allow `frozen` package entries. */
export interface MisoCodegenConfig extends Omit<SuiCodegenConfig, "packages"> {
  packages: readonly MisoPackageConfig[];
}

export function isFrozenPackageConfig(
  packageConfig: MisoPackageConfig,
): packageConfig is FrozenPackageConfig {
  return "frozen" in packageConfig && packageConfig.frozen === true;
}

// The single, unified codegen config for the SDK monorepo. It generates the
// ABI-bound BCS structs and Move-call builders for every deployed Miso package
// into `packages/protocol/src/contracts` — the one canonical generated tree.
// `packages/platform` still generates its own (Phase 6 rewires it onto this one).
//
// Package IDs are injected at runtime by `deployments.ts`; no source-local
// address or previously published package ID is treated as live.
//
// `bun run codegen` deliberately writes every `sui move summary` output to a
// temporary directory before generating (see `scripts/codegen.ts`) rather than
// into `package_summaries/` inside these sibling checkouts.
//
// Expected checkout layout — everything resolves against the directory that
// directly contains `misofm/` (defaults to two levels up from this file, i.e.
// `~/Documents/GitHub`; override with `MISO_SDK_CODEGEN_SOURCE_ROOT` for an
// isolated worktree):
//   misofm/{protocol, party, party-extensions, party-actions,
//           protocol-extensions, protocol-actions, royalty-pool, routed-stake,
//           vault, vault-plugins, genre, cover-art, record, record-shop}
const sourceRoot = process.env.MISO_SDK_CODEGEN_SOURCE_ROOT
  ? resolve(process.env.MISO_SDK_CODEGEN_SOURCE_ROOT)
  : fileURLToPath(new URL("../..", import.meta.url));
const source = (path: string) => resolve(sourceRoot, path);

const config: MisoCodegenConfig = {
  output: "./packages/protocol/src/contracts",
  importExtension: ".ts",
  generateSummaries: false,
  packages: [
    // Protocol core.
    { package: "@local-pkg/miso", path: source("misofm/protocol") },

    // Party identity + its data extensions.
    { package: "@local-pkg/miso_party", path: source("misofm/party") },
    { package: "@local-pkg/party_cta", path: source("misofm/party-extensions/party_cta") },
    { package: "@local-pkg/party_genre", path: source("misofm/party-extensions/party_genre") },
    { package: "@local-pkg/party_media", path: source("misofm/party-extensions/party_media") },
    { package: "@local-pkg/party_music", path: source("misofm/party-extensions/party_music") },
    { package: "@local-pkg/party_platform_link", path: source("misofm/party-extensions/party_platform_link") },
    { package: "@local-pkg/party_pro_link", path: source("misofm/party-extensions/party_pro_link") },
    { package: "@local-pkg/party_profile", path: source("misofm/party-extensions/party_profile") },
    { package: "@local-pkg/party_roles", path: source("misofm/party-extensions/party_roles") },
    { package: "@local-pkg/party_social", path: source("misofm/party-extensions/party_social") },
    { package: "@local-pkg/party_tags", path: source("misofm/party-extensions/party_tags") },
    // Public, custody-agnostic Actions over Party — lives in party-actions, not
    // party-extensions (the latter has no Move.toml for party_wallet).
    { package: "@local-pkg/party_wallet", path: source("misofm/party-actions/party_wallet") },

    // Protocol-extension packages (persistent data attached to a protocol work).
    { package: "@local-pkg/composition_credits", path: source("misofm/protocol-extensions/composition_credits") },
    { package: "@local-pkg/recording_advisory", path: source("misofm/protocol-extensions/recording_advisory") },
    { package: "@local-pkg/recording_credits", path: source("misofm/protocol-extensions/recording_credits") },
    { package: "@local-pkg/recording_genre", path: source("misofm/protocol-extensions/recording_genre") },
    { package: "@local-pkg/recording_language", path: source("misofm/protocol-extensions/recording_language") },

    { package: "@local-pkg/recording_master_reference", path: source("misofm/protocol-extensions/recording_master_reference") },

    { package: "@local-pkg/recording_engine_session", path: source("misofm/protocol-extensions/recording_engine_session") },
    { package: "@local-pkg/recording_streaming_transcode", path: source("misofm/protocol-extensions/recording_streaming_transcode") },
    { package: "@local-pkg/release_cover_art", path: source("misofm/protocol-extensions/release_cover_art") },
    { package: "@local-pkg/release_credits", path: source("misofm/protocol-extensions/release_credits") },
    { package: "@local-pkg/release_description", path: source("misofm/protocol-extensions/release_description") },
    { package: "@local-pkg/release_dsp_link", path: source("misofm/protocol-extensions/release_dsp_link") },
    { package: "@local-pkg/release_genre", path: source("misofm/protocol-extensions/release_genre") },
    { package: "@local-pkg/release_kind", path: source("misofm/protocol-extensions/release_kind") },


    // Primitives.
    { package: "@local-pkg/royalty_pool", path: source("misofm/royalty-pool") },
    { package: "@local-pkg/routed_stake", path: source("misofm/routed-stake") },
    { package: "@local-pkg/vault", path: source("misofm/vault") },
    { package: "@local-pkg/genre", path: source("misofm/genre") },
    { package: "@local-pkg/cover_art", path: source("misofm/cover-art") },

    // Actions — public, custody-agnostic business logic over a work.
    { package: "@local-pkg/composition_royalty_pool", path: source("misofm/protocol-actions/composition_royalty_pool") },
    { package: "@local-pkg/recording_royalty_pool", path: source("misofm/protocol-actions/recording_royalty_pool") },
    { package: "@local-pkg/composition_routed_stake", path: source("misofm/protocol-actions/composition_routed_stake") },
    { package: "@local-pkg/release_revenue_distributor", path: source("misofm/protocol-actions/release_revenue_distributor") },

    // Vault plugins — permissionless automation adapters for the subset of
    // Actions that is safe to crank without an admin.
    //
    { package: "@local-pkg/composition_royalty_pool_plugin", path: source("misofm/vault-plugins/composition_royalty_pool_plugin") },
    { package: "@local-pkg/recording_royalty_pool_plugin", path: source("misofm/vault-plugins/recording_royalty_pool_plugin") },
    { package: "@local-pkg/release_revenue_distributor_plugin", path: source("misofm/vault-plugins/release_revenue_distributor_plugin") },

    // Record identity and edition-scoped Pressings, separate from Record Shop's
    // primary-sale mechanics.
    { package: "@local-pkg/miso_record", path: source("misofm/record") },
    { package: "@local-pkg/miso_record_shop", path: source("misofm/record-shop") },
  ],
};

export default config;
