import type { SuiCodegenConfig } from "@mysten/codegen";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Generates type-safe BCS structs + Move-call bindings from the live Move source,
// so the generated layer is always in lockstep with the on-chain ABI.
//
// PLATFORM + DATA-EXTENSION packages. The protocol CORE (`miso` — Composition,
// Recording, Release, Track) generates into `@misofm/protocol` instead, and
// this package depends on it for those bindings; adding the core here to save an
// import is how the split this package exists to enforce gets undone.
//
// Extensions add persistent data to a protocol work. Actions are public,
// custody-agnostic business logic. Vault plugins are permissionless automation
// adapters for the subset of Actions that is safe to crank without an admin.
//
// Paths resolve against sibling checkouts. For an isolated SDK worktree, set
// MISO_SDK_CODEGEN_SOURCE_ROOT to a copied checkout root containing both
// `misofm/` and `misonetwork/`; codegen then never writes summaries or locks into
// a developer's live sibling sources. Regenerating requires:
//   ~/Documents/GitHub/misofm/{sdk, record, record-shop, vault, vault-plugins,
//     protocol-extensions}
//   ~/Documents/GitHub/misonetwork/{party-actions,protocol,protocol-actions,
//     protocol-extensions,royalty-pool,routed-stake,share}
const sourceRoot =
  process.env.MISO_SDK_CODEGEN_SOURCE_ROOT ??
  fileURLToPath(new URL("../../../..", import.meta.url));
const source = (path: string) => resolve(sourceRoot, path);

const config: SuiCodegenConfig = {
  output: "./src/contracts",
  packages: [
    // Record identity and edition-scoped Pressings are separate from the
    // primary-sale mechanics supplied by Record Shop.
    { package: "@local-pkg/miso_record", path: source("misofm/record") },
    {
      package: "@local-pkg/miso_record_shop",
      path: source("misofm/record-shop"),
    },

    // Royalty pools — accumulator-based distribution bound to a work.
    {
      package: "@local-pkg/royalty_pool",
      path: source("misonetwork/royalty-pool"),
    },

    // Capability custody plus raw-cap Actions.
    { package: "@local-pkg/vault", path: source("misofm/vault") },
    {
      package: "@local-pkg/composition_royalty_pool",
      path: source("misonetwork/protocol-actions/composition_royalty_pool"),
    },
    {
      package: "@local-pkg/recording_royalty_pool",
      path: source("misonetwork/protocol-actions/recording_royalty_pool"),
    },
    {
      package: "@local-pkg/party_wallet",
      path: source("misonetwork/party-actions/party_wallet"),
    },
    {
      package: "@local-pkg/composition_routed_stake",
      path: source("misonetwork/protocol-actions/composition_routed_stake"),
    },
    {
      package: "@local-pkg/release_revenue_distributor",
      path: source("misonetwork/protocol-actions/release_revenue_distributor"),
    },
    {
      package: "@local-pkg/routed_stake",
      path: source("misonetwork/routed-stake"),
    },

    // The deployed cover_art binding remains frozen under src/contracts until
    // its current source ABI is published and selected in deployments.ts.
    {
      package: "@local-pkg/release_cover_art",
      path: source("misonetwork/protocol-extensions/release_cover_art"),
    },

    // Release presentation + discovery metadata. These are independent
    // cap-gated extensions over the core Release; the publish intent aggregates
    // them, but each package stays separately deployable.
    { package: "@local-pkg/genre", path: source("misonetwork/genre") },
    {
      package: "@local-pkg/release_description",
      path: source("misonetwork/protocol-extensions/release_description"),
    },
    {
      package: "@local-pkg/release_dsp_link",
      path: source("misofm/protocol-extensions/release_dsp_link"),
    },
    {
      package: "@local-pkg/release_genre",
      path: source("misonetwork/protocol-extensions/release_genre"),
    },
    {
      package: "@local-pkg/release_kind",
      path: source("misonetwork/protocol-extensions/release_kind"),
    },

    // Recording metadata is data-only; its cap-gated writers work with either a
    // legacy direct cap or a Vault loan through the SDK authority helpers.
    {
      package: "@local-pkg/recording_advisory",
      path: source("misonetwork/protocol-extensions/recording_advisory"),
    },
    {
      package: "@local-pkg/recording_language",
      path: source("misonetwork/protocol-extensions/recording_language"),
    },
    // The deployed recording_master_reference binding likewise remains frozen
    // until a deployment explicitly replaces it.
    {
      package: "@local-pkg/recording_streaming_transcode",
      path: source("misofm/protocol-extensions/recording_streaming_transcode"),
    },

    // Permissionless automation adapters. Party wallet and routed stake have no
    // plugin because their useful operations return caller-controlled assets.
    {
      package: "@local-pkg/composition_royalty_pool_plugin",
      path: source("misofm/vault-plugins/composition_royalty_pool_plugin"),
    },
    {
      package: "@local-pkg/recording_royalty_pool_plugin",
      path: source("misofm/vault-plugins/recording_royalty_pool_plugin"),
    },
    {
      package: "@local-pkg/release_revenue_distributor_plugin",
      path: source("misofm/vault-plugins/release_revenue_distributor_plugin"),
    },

    // Credits — contributor attribution (display name + roles) attached to a
    // work via a dynamic field, gated by the work's admin cap. The shared
    // `miso_credit::credit::Credit<Role>` type is pulled in as a dep. Drives the
    // credits CLI flow and the app's contributor render.
    {
      package: "@local-pkg/composition_credits",
      path: source("misonetwork/protocol-extensions/composition_credits"),
    },
    {
      package: "@local-pkg/recording_credits",
      path: source("misonetwork/protocol-extensions/recording_credits"),
    },
    {
      package: "@local-pkg/release_credits",
      path: source("misonetwork/protocol-extensions/release_credits"),
    },
  ],
};

export default config;
