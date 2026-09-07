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
    // composition_routed_stake has live Move source, but `sui move summary`
    // currently refuses to build it (reproduces on sui 1.66.2 through 1.78.1,
    // against the clean, committed Move.toml — not an artifact of this SDK
    // checkout): it depends on `royalty_pool` both directly and transitively
    // through `routed_stake`, at the SAME git rev, and the Move package
    // resolver still reports "depends on multiple versions of the package
    // with ID 0x80...91ed", demanding an explicit
    //   [dependencies]
    //   _royalty_pool = { ..., override = true }
    // in protocol-actions/composition_routed_stake/Move.toml. That's a fix
    // for the protocol-actions repo, out of scope (and out of permissions)
    // for this SDK change. Frozen on the existing, already-deployed binding
    // (carried forward from packages/platform/src/contracts) until that
    // override lands upstream:
    { package: "@local-pkg/composition_routed_stake", frozen: true },
    { package: "@local-pkg/release_revenue_distributor", path: source("misofm/protocol-actions/release_revenue_distributor") },

    // Vault plugins — permissionless automation adapters for the subset of
    // Actions that is safe to crank without an admin.
    //
    // composition_royalty_pool_plugin and recording_royalty_pool_plugin hit the
    // same "depends on multiple versions of the package with ID 0x80...91ed"
    // resolver error as composition_routed_stake above, for the identical
    // reason: each redundantly depends on `royalty_pool` directly AND
    // transitively (through composition_royalty_pool / recording_royalty_pool).
    // Frozen on the existing bindings pending the same upstream
    // `override = true` fix:
    { package: "@local-pkg/composition_royalty_pool_plugin", frozen: true },
    { package: "@local-pkg/recording_royalty_pool_plugin", frozen: true },
    //
    // release_revenue_distributor_plugin hits the identical resolver error,
    // this time over `miso` (direct + transitive through
    // release_revenue_distributor). Same fix needed; frozen the same way:
    { package: "@local-pkg/release_revenue_distributor_plugin", frozen: true },

    // Record identity and edition-scoped Pressings, separate from Record Shop's
    // primary-sale mechanics.
    { package: "@local-pkg/miso_record", path: source("misofm/record") },
    // miso_record_shop hits the same resolver error as the packages above, but
    // for a more serious reason than a redundant-yet-identical diamond: its
    // direct `miso` pin (rev 6de5f988) and `miso_record`'s own `miso` pin (rev
    // 22e24774) are DIFFERENT revisions of protocol core — a genuine version
    // drift between record-shop and record, not just a missing override.
    // Forcing this through risks baking in a binding built against whichever
    // revision the resolver happens to pick, which may not match either
    // package's actual on-chain ABI. Frozen on the existing binding until the
    // record/record-shop pins are reconciled upstream:
    { package: "@local-pkg/miso_record_shop", frozen: true },
  ],
};

export default config;
