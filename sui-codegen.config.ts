import type { SuiCodegenConfig } from "@mysten/codegen";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The two generated trees, one per npm package. Which tree a Move package
 * lands in is the boundary rule of the SDK split:
 *
 *   `@misofm/musicos` is the object model. Everything Miso offers on top of
 *   it is platform.
 *
 * `musicos` (composition, recording, release, track) is the object model of
 * works and `partyos` is the object model of parties; each is its own npm
 * package. Every extension, Action, primitive, plugin, and Record package is
 * something Miso chose to offer over them, so all of those — including the
 * `party_*` extensions and `party_wallet` — generate into `@misofm/platform`.
 */
export type GeneratedTree = "musicos" | "partyos" | "platform";

export interface MisoPackageConfig {
  /**
   * `@local-pkg/<name>` where `<name>` is the Move package's `name` from its
   * `Move.toml`. @mysten/codegen names the output directory from the package
   * summary — the real Move name — while the prune keep-set is derived from
   * this label, so the two must agree. `bun run codegen` fails when they do
   * not, rather than leaving an orphaned directory behind.
   */
  readonly package: `@local-pkg/${string}`;
  /** Move package source directory (contains `Move.toml`). */
  readonly path: string;
  readonly tree: GeneratedTree;
}

/** `SuiCodegenConfig`, with one output directory per generated tree. */
export interface MisoCodegenConfig extends Omit<SuiCodegenConfig, "packages" | "output"> {
  readonly outputs: Readonly<Record<GeneratedTree, string>>;
  readonly packages: readonly MisoPackageConfig[];
}

/** The generated directory a package config emits: its label without the `@local-pkg/` scope. */
export function generatedDirectoryName(packageConfig: MisoPackageConfig): string {
  return packageConfig.package.slice("@local-pkg/".length);
}

// Package IDs are injected at runtime by each package's `deployments.ts`; no
// source-local address or previously published package ID is treated as live.
//
// `bun run codegen` deliberately writes every `sui move summary` output to a
// temporary directory before generating (see `scripts/codegen.ts`) rather than
// into `package_summaries/` inside these sibling checkouts.
//
// Expected checkout layout — everything resolves against the directory that
// directly contains `misofm/` (defaults to two levels up from this file;
// override with `MISO_SDK_CODEGEN_SOURCE_ROOT` for an isolated worktree). The
// directory names are the GitHub repository names:
//   misofm/{musicos, musicos-extensions, musicos-actions,
//           partyos, partyos-extensions, partyos-actions,
//           royalty-pool, routed-stake, vault, vault-plugins, genre, cover-art,
//           record, record-shop}
const sourceRoot = process.env.MISO_SDK_CODEGEN_SOURCE_ROOT
  ? resolve(process.env.MISO_SDK_CODEGEN_SOURCE_ROOT)
  : fileURLToPath(new URL("../..", import.meta.url));
const source = (path: string) => resolve(sourceRoot, path);

const musicos = (name: string, path: string): MisoPackageConfig => ({
  package: `@local-pkg/${name}`,
  path: source(path),
  tree: "musicos",
});
const partyos = (name: string, path: string): MisoPackageConfig => ({
  package: `@local-pkg/${name}`,
  path: source(path),
  tree: "partyos",
});
const platform = (name: string, path: string): MisoPackageConfig => ({
  package: `@local-pkg/${name}`,
  path: source(path),
  tree: "platform",
});

const config: MisoCodegenConfig = {
  outputs: {
    musicos: "./packages/musicos/src/contracts",
    partyos: "./packages/partyos/src/contracts",
    platform: "./packages/platform/src/contracts",
  },
  importExtension: ".ts",
  generateSummaries: false,
  packages: [
    // The object models: the only package in each of the musicos and partyos trees.
    musicos("musicos", "misofm/musicos"),
    partyos("partyos", "misofm/partyos"),

    // Party data extensions.
    platform("party_cta", "misofm/partyos-extensions/party_cta"),
    platform("party_genre", "misofm/partyos-extensions/party_genre"),
    platform("party_media", "misofm/partyos-extensions/party_media"),
    platform("party_music", "misofm/partyos-extensions/party_music"),
    platform("party_platform_link", "misofm/partyos-extensions/party_platform_link"),
    platform("party_pro_link", "misofm/partyos-extensions/party_pro_link"),
    platform("party_profile", "misofm/partyos-extensions/party_profile"),
    platform("party_roles", "misofm/partyos-extensions/party_roles"),
    platform("party_social", "misofm/partyos-extensions/party_social"),
    platform("party_tags", "misofm/partyos-extensions/party_tags"),
    // Public, custody-agnostic Actions over Party — lives in partyos-actions,
    // not partyos-extensions.
    platform("party_wallet", "misofm/partyos-actions/party_wallet"),

    // Work extensions (persistent data attached to a musicos work).
    platform("composition_credits", "misofm/musicos-extensions/composition_credits"),
    platform("recording_advisory", "misofm/musicos-extensions/recording_advisory"),
    platform("recording_credits", "misofm/musicos-extensions/recording_credits"),
    platform("recording_engine_session", "misofm/musicos-extensions/recording_engine_session"),
    platform("recording_genre", "misofm/musicos-extensions/recording_genre"),
    platform("recording_language", "misofm/musicos-extensions/recording_language"),
    platform("recording_master_reference", "misofm/musicos-extensions/recording_master_reference"),
    platform("recording_streaming_transcode", "misofm/musicos-extensions/recording_streaming_transcode"),
    platform("release_cover_art", "misofm/musicos-extensions/release_cover_art"),
    platform("release_credits", "misofm/musicos-extensions/release_credits"),
    platform("release_description", "misofm/musicos-extensions/release_description"),
    platform("release_dsp_link", "misofm/musicos-extensions/release_dsp_link"),
    platform("release_genre", "misofm/musicos-extensions/release_genre"),
    platform("release_kind", "misofm/musicos-extensions/release_kind"),

    // Primitives.
    platform("royalty_pool", "misofm/royalty-pool"),
    platform("routed_stake", "misofm/routed-stake"),
    platform("vault", "misofm/vault"),
    platform("genre", "misofm/genre"),
    platform("cover_art", "misofm/cover-art"),

    // Actions — public, custody-agnostic business logic over a work.
    platform("composition_royalty_pool", "misofm/musicos-actions/composition_royalty_pool"),
    platform("recording_royalty_pool", "misofm/musicos-actions/recording_royalty_pool"),
    platform("composition_routed_stake", "misofm/musicos-actions/composition_routed_stake"),
    platform("release_revenue_distributor", "misofm/musicos-actions/release_revenue_distributor"),

    // Vault plugins — permissionless automation adapters for the subset of
    // Actions that is safe to crank without an admin.
    platform("composition_royalty_pool_plugin", "misofm/vault-plugins/composition_royalty_pool_plugin"),
    platform("recording_royalty_pool_plugin", "misofm/vault-plugins/recording_royalty_pool_plugin"),
    platform("release_revenue_distributor_plugin", "misofm/vault-plugins/release_revenue_distributor_plugin"),

    // Record identity and edition-scoped Pressings, separate from Record Shop's
    // primary-sale mechanics.
    platform("record", "misofm/record"),
    platform("record_shop", "misofm/record-shop"),
  ],
};

export default config;
