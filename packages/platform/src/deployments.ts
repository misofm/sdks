// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MisoDeployment, MisoNetwork } from "@misofm/musicos/deployments";
import { MISO_DEPLOYMENTS } from "@misofm/musicos/deployments";
import type { PartyDeployment } from "@misofm/partyos/deployments";
import { PARTYOS_DEPLOYMENTS } from "@misofm/partyos/deployments";
import { normalizeSuiAddress, normalizeSuiObjectId } from "@mysten/sui/utils";
import { Context, Effect, Layer } from "effect";
import { immutableSnapshot } from "./internal.ts";
import {
  MisoPlatformDeploymentInvalidError,
  OperationsUnavailableError,
  RecordSalesUnavailableError,
} from "./errors.ts";

export {
  MisoPlatformDeploymentInvalidError,
  OperationsUnavailableError,
  RecordSalesUnavailableError,
} from "./errors.ts";

/** Every package address a platform deployment must supply, for canonical-id
 * and pairwise-distinctness validation in {@link assertMisoPlatformDeployment}. */
const REQUIRED_PLATFORM_PACKAGE_KEYS = [
  "minato",
  "credit",
  "compositionCredits",
  "recordingCredits",
  "releaseCredits",
  "royaltyPool",
  "routedStake",
  "coverArt",
  "releaseCoverArt",
  "genre",
  "releaseDescription",
  "releaseDspLink",
  "releaseGenre",
  "releaseKind",
  "recordingAdvisory",
  "recordingLanguage",
  "ori",
  "countryCode",
  "languageCode",
] as const;

/** Every first-party Party extension package (the PartyOS core lives in `@misofm/partyos`). */
const REQUIRED_PARTY_PACKAGE_KEYS = [
  "partyCta",
  "partyGenre",
  "partyMedia",
  "partyMusic",
  "partyPlatformLink",
  "partyProLink",
  "partyProfile",
  "partyRoles",
  "partySocial",
  "partyTags",
  "countryCode",
  "languageCode",
] as const;

/** Primary Record sales are unavailable on legacy deployments until both new
 * immutable packages have been freshly published and verified. */
export type RecordSalesDeployment =
  | {
      readonly status: "unavailable";
      readonly reason: string;
      readonly legacy?: {
        readonly recordPackageId: string;
        readonly recordShopPackageId: string;
      };
    }
  | {
      readonly status: "available";
      readonly recordPackageId: string;
      readonly recordShopPackageId: string;
    };

export function requireRecordSalesDeployment(
  deployment: RecordSalesDeployment | undefined,
): Extract<RecordSalesDeployment, { status: "available" }> {
  if (!deployment || deployment.status === "unavailable") {
    throw new RecordSalesUnavailableError({
      reason: deployment?.reason ?? "no Record sales deployment was configured",
    });
  }
  const canonicalPackageId = (value: string): boolean => {
    if (!/^0x[0-9a-f]{64}$/.test(value)) return false;
    try {
      return normalizeSuiObjectId(value) === value;
    } catch {
      return false;
    }
  };
  if (
    !canonicalPackageId(deployment.recordPackageId) ||
    !canonicalPackageId(deployment.recordShopPackageId)
  ) {
    throw new RecordSalesUnavailableError({
      reason: "Record and Record Shop package IDs must be canonical 32-byte Sui object IDs",
    });
  }
  if (deployment.recordPackageId === deployment.recordShopPackageId) {
    throw new RecordSalesUnavailableError({
      reason: "Record and Record Shop package IDs must be distinct",
    });
  }
  return deployment;
}

/** Vault custody and the exact Action/plugin ABI deployed alongside it. */
export type OperationsDeployment =
  | {
      readonly status: "unavailable";
      readonly reason: string;
      /** Historical identities are metadata only and are never executable ABIs. */
      readonly legacy?: {
        readonly vaultPackageId?: string;
        readonly vaultRegistryId?: string;
        readonly packageIds?: Readonly<Record<string, string>>;
      };
    }
  | {
      readonly status: "available";
      readonly vault: {
        readonly packageId: string;
        readonly registryId: string;
      };
      readonly actions: {
        readonly compositionRoyaltyPool: string;
        readonly recordingRoyaltyPool: string;
        readonly partyWallet: string;
        readonly compositionRoutedStake: string;
        readonly releaseRevenueDistributor: string;
      };
      readonly plugins: {
        readonly compositionRoyaltyPool: string;
        readonly recordingRoyaltyPool: string;
        readonly releaseRevenueDistributor: string;
      };
    };

export type AvailableOperationsDeployment = Extract<
  OperationsDeployment,
  { status: "available" }
>;

function canonicalObjectId(value: unknown): value is string {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/.test(value)) {
    return false;
  }
  try {
    return normalizeSuiObjectId(value) === value;
  } catch {
    return false;
  }
}

/**
 * Require one complete, non-aliased operations deployment.
 *
 * This validates only a complete canonical, pairwise-distinct structural set.
 * It cannot establish provenance for arbitrary caller-supplied custom IDs; the
 * caller owns that provenance. The bundled frozen map below is generated from
 * one verified immutable admin export.
 */
export function requireOperationsDeployment(
  deployment: OperationsDeployment | undefined,
): AvailableOperationsDeployment {
  if (!deployment || deployment.status !== "available") {
    throw new OperationsUnavailableError({
      reason: deployment?.reason ?? "no Vault operations deployment was configured",
    });
  }

  const candidate = deployment as Partial<AvailableOperationsDeployment>;
  const vault = candidate.vault as
    | Partial<AvailableOperationsDeployment["vault"]>
    | undefined;
  const actions = candidate.actions as
    | Partial<AvailableOperationsDeployment["actions"]>
    | undefined;
  const plugins = candidate.plugins as
    | Partial<AvailableOperationsDeployment["plugins"]>
    | undefined;
  const packageEntries = [
    ["vault.packageId", vault?.packageId],
    ["actions.compositionRoyaltyPool", actions?.compositionRoyaltyPool],
    ["actions.recordingRoyaltyPool", actions?.recordingRoyaltyPool],
    ["actions.partyWallet", actions?.partyWallet],
    ["actions.compositionRoutedStake", actions?.compositionRoutedStake],
    ["actions.releaseRevenueDistributor", actions?.releaseRevenueDistributor],
    ["plugins.compositionRoyaltyPool", plugins?.compositionRoyaltyPool],
    ["plugins.recordingRoyaltyPool", plugins?.recordingRoyaltyPool],
    ["plugins.releaseRevenueDistributor", plugins?.releaseRevenueDistributor],
  ] as const;

  for (const [field, id] of packageEntries) {
    if (!canonicalObjectId(id)) {
      throw new OperationsUnavailableError({
        reason: `${field} must be a canonical 32-byte Sui package ID`,
      });
    }
  }
  if (!canonicalObjectId(vault?.registryId)) {
    throw new OperationsUnavailableError({
      reason: "vault.registryId must be a canonical 32-byte Sui object ID",
    });
  }

  const identities = [
    ...packageEntries.map(([, id]) => id as string),
    vault.registryId,
  ];
  if (new Set(identities).size !== identities.length) {
    throw new OperationsUnavailableError({
      reason: `the Vault registry object and all ${packageEntries.length} package IDs must be distinct`,
    });
  }
  return deployment;
}

/**
 * The first-party Party EXTENSION packages (profile, media, roles, tags,
 * genres, CTAs, platform links). The Party object model core (`partyos`) is
 * owned by `@misofm/partyos` — see {@link MisoPlatformDeployment.partyos}.
 * Platform-internal: not re-exported by `@misofm/musicos`, which only ever
 * knew the object-model core.
 */
export interface PartyExtensionsDeployment {
  readonly partyCta: string;
  readonly partyGenre: string;
  readonly partyMedia: string;
  readonly partyMusic: string;
  readonly partyPlatformLink: string;
  readonly partyProLink: string;
  readonly partyProfile: string;
  readonly partyRoles: string;
  readonly partySocial: string;
  readonly partyTags: string;
  /** `country_code` — dependency of `party_profile`. */
  readonly countryCode: string;
  /** `language_code` — dependency of `party_profile` (and, via `packages`, `recording_language`). */
  readonly languageCode: string;
}

/** Complete on-chain identity used by the Miso platform SDK on one network. */
export interface MisoPlatformDeployment {
  /** Network name this immutable deployment set belongs to. */
  readonly network: MisoNetwork;
  /** Full ledger genesis digest used to reject a mislabeled RPC endpoint. */
  readonly chainIdentifier: string;
  /** The object-model deployment (`@misofm/musicos`) this platform build targets. */
  readonly protocol: MisoDeployment;
  /** The Party object model deployment (`@misofm/partyos`) this platform build targets. */
  readonly partyos: PartyDeployment;
  /** The first-party Party extension packages. */
  readonly party: PartyExtensionsDeployment;
  readonly recordSales: RecordSalesDeployment;
  /** Fail-closed, structurally complete Vault/Action/plugin identity set. */
  readonly operations: OperationsDeployment;
  readonly packages: {
    /** Self-attested audio metadata and bare Walrus blob ID, when published. */
    readonly audio?: string;
    readonly minato: string;
    readonly credit: string;
    readonly compositionCredits: string;
    readonly recordingCredits: string;
    readonly releaseCredits: string;
    /** Base royalty-pool value library. */
    readonly royaltyPool: string;
    /** Generic stake wrapper used by composition routed-stake operations. */
    readonly routedStake: string;
    /** Cover-art value type used by the release cover extension. */
    readonly coverArt: string;
    readonly releaseCoverArt: string;
    /** Curated Genre vocabulary package used by release_genre and recording_genre. */
    readonly genre: string;
    readonly releaseDescription: string;
    readonly releaseDspLink: string;
    readonly releaseGenre: string;
    readonly releaseKind: string;
    readonly recordingAdvisory: string;
    readonly recordingLanguage: string;
    /** Ordered recording genre list (primary first). Optional until first published. */
    readonly recordingGenre?: string;
    /** Compressed lyrics keyed by language. */
    readonly compositionLyrics?: string;
    /** Self-attested Audio master extension (`recording_master`). */
    readonly recordingMaster?: string;
    /** Exact Audio dependency of recordingMaster (a distinct immutable type identity). */
    readonly recordingMasterAudio?: string;
    /** Complete Walrus Quilt containing the Recording's streaming transcodes. */
    readonly recordingStreamingTranscode?: string;
    /**
     * Miso Engine session: the Session V1 blob plus each stem's PCM digest and
     * blob IDs. Optional so a deployment without the stems generation fails
     * closed before signing.
     */
    readonly recordingEngineSession?: string;
    /** External `ori` package used by cover-art and streaming-transcode Walrus values. */
    readonly ori: string;
    /** `country_code` — dependency of `party_profile`. */
    readonly countryCode: string;
    /** `language_code` — dependency of `recording_language` (and, via `party`, `party_profile`). */
    readonly languageCode: string;
  };
  readonly objects: {
    readonly releaseRegistry: string;
    /** Shared parent used to derive canonical Genre object ids. */
    readonly genreRegistry: string;
  };
  readonly legacy: {
    readonly releaseCoverArtPackages: readonly string[];
  };
}

/**
 * Validates the `packages` and `party` package-id sets before any Move target
 * is constructed from them: every required id must be a canonical 32-byte Sui
 * package ID, and no two of them (nor the core `musicos` package) may collide.
 * Optional generation fields (`recordingGenre`, `recordingStreamingTranscode`,
 * `recordingEngineSession`) are validated only when present.
 */
export function assertMisoPlatformDeployment(
  deployment: unknown,
): asserts deployment is MisoPlatformDeployment {
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment)) {
    throw new MisoPlatformDeploymentInvalidError({
      message: "@misofm/platform: deployment must be a complete MisoPlatformDeployment object.",
    });
  }
  const candidate = deployment as Partial<MisoPlatformDeployment>;
  const packages = candidate.packages as Partial<MisoPlatformDeployment["packages"]> | undefined;
  const party = candidate.party as Partial<PartyExtensionsDeployment> | undefined;
  const partyos = candidate.partyos as Partial<PartyDeployment> | undefined;
  if (!packages || typeof packages !== "object") {
    throw new MisoPlatformDeploymentInvalidError({
      message: "@misofm/platform: deployment is missing its `packages` section.",
    });
  }
  if (!party || typeof party !== "object") {
    throw new MisoPlatformDeploymentInvalidError({
      message: "@misofm/platform: deployment is missing its `party` section.",
    });
  }
  if (!partyos || typeof partyos !== "object") {
    throw new MisoPlatformDeploymentInvalidError({
      message: "@misofm/platform: deployment is missing its `partyos` section.",
    });
  }

  const seenPackageIds = new Set<string>();
  /** `dedupeOk` lets `party.countryCode`/`party.languageCode` intentionally
   * repeat `packages.countryCode`/`packages.languageCode` — both sections
   * point the same shared dependency package at their own consumers — without
   * tripping the distinctness check meant to catch a genuinely misconfigured
   * manifest. */
  const checkCanonical = (field: string, packageId: unknown, dedupeOk = false) => {
    if (typeof packageId !== "string") {
      throw new MisoPlatformDeploymentInvalidError({
        message: `@misofm/platform: deployment is missing package ID for "${field}".`,
      });
    }
    let normalized: string;
    try {
      normalized = normalizeSuiAddress(packageId);
    } catch {
      throw new MisoPlatformDeploymentInvalidError({
        message: `@misofm/platform: deployment package ID for "${field}" is not a valid Sui address.`,
      });
    }
    if (packageId !== normalized) {
      throw new MisoPlatformDeploymentInvalidError({
        message: `@misofm/platform: deployment package ID for "${field}" must be normalized (${normalized}).`,
      });
    }
    if (!dedupeOk) {
      if (seenPackageIds.has(packageId)) {
        throw new MisoPlatformDeploymentInvalidError({
          message:
            `@misofm/platform: deployment package ID for "${field}" duplicates another package. ` +
            "Every package in a deployment manifest must have its own address.",
        });
      }
      seenPackageIds.add(packageId);
    }
  };

  for (const key of REQUIRED_PLATFORM_PACKAGE_KEYS) {
    checkCanonical(`packages.${key}`, packages[key]);
  }
  if (packages.audio !== undefined) checkCanonical("packages.audio", packages.audio);
  checkCanonical("partyos.partyos", partyos.partyos);
  for (const key of REQUIRED_PARTY_PACKAGE_KEYS) {
    // `country_code`/`language_code` are shared dependency packages, deliberately
    // repeated from `packages.*` above rather than distinct party-only ids.
    checkCanonical(`party.${key}`, party[key], key === "countryCode" || key === "languageCode");
  }
  if (party.countryCode !== packages.countryCode) {
    throw new MisoPlatformDeploymentInvalidError({
      message:
        "@misofm/platform: party.countryCode must match packages.countryCode (the same shared dependency package).",
    });
  }
  if (party.languageCode !== packages.languageCode) {
    throw new MisoPlatformDeploymentInvalidError({
      message:
        "@misofm/platform: party.languageCode must match packages.languageCode (the same shared dependency package).",
    });
  }
}

/** Validate and snapshot an untrusted manifest so later caller mutation is inert. */
export function normalizeMisoPlatformDeployment(
  deployment: unknown,
): MisoPlatformDeployment {
  assertMisoPlatformDeployment(deployment);
  return immutableSnapshot(deployment);
}

/**
 * Platform deployments bundled with this SDK release.
 *
 * IDs come only from verified immutable deployment output.
 * Consumers may still pass an explicit complete deployment for custom networks.
 */
export const MISO_PLATFORM_DEPLOYMENTS = immutableSnapshot({
  mainnet: {
    "network": "mainnet",
    "chainIdentifier": "4btiuiMPvEENsttpZC7CZ53DruC3MAgfznDbASZ7DR6S",
    protocol: MISO_DEPLOYMENTS.mainnet,
    partyos: PARTYOS_DEPLOYMENTS.mainnet,
    "recordSales": {
      "status": "available",
      "recordPackageId": "0xbc8fc491364d1bafe6602a2c0ff0a60ee7c5fe776d0e5849363c7c35d30197db",
      "recordShopPackageId": "0x375b296ed49b461b2fae471ab6d6a4a5acedfb6fe64e022e8140791babeb7b40"
    },
    "operations": {
      "status": "available",
      "vault": {
        "packageId": "0xea1a77e23e794ac834b3de1f1c3a885120a1fb742976ed2e32754f9e851ed055",
        "registryId": "0x7712726eacde3149ffd4903b5c64e409492e91a098899f2373a0066cd2fd758e"
      },
      "actions": {
        "compositionRoyaltyPool": "0xa0650377763e4d1f355e88399c4542a2c8891207f94af38f03a006b22051287b",
        "recordingRoyaltyPool": "0x2154a6cc26787e3c044a948000a899c0b06baa9cf20fdd366841078271e036b1",
        "partyWallet": "0xcb1ea037a76d996656bbb2095f6deb5b10a8ee0f9662a93f0f93e026f7d263c4",
        "compositionRoutedStake": "0x3f7f2613a3e2375366431ba76f85eab35c1c5752036ee6abcbb09000b1158537",
        "releaseRevenueDistributor": "0x6ef20e184e16d91b8cc123b06e779cb89028dfa6b89d79ce7df3b3f7aca0217f"
      },
      "plugins": {
        "compositionRoyaltyPool": "0x0d0c23da1e75b96eb8e9159ea6b038b7954850ead0188704297ba8c1009b03a1",
        "recordingRoyaltyPool": "0xabf0ceecdcd85580460761aba30c66e05c26fb5d30c4e365c95f797cef8d1874",
        "releaseRevenueDistributor": "0xe9e3480ff1a9ac008fd105bfb9af0904d472c0ba77da59865d9da6685faa722d"
      }
    },
    "packages": {
      "audio": "0x73a989640258bd5d82e0ae23bcb6f874fae65c78aecc1781b9a702801a043d7e",
      "credit": "0x63f2fb16fffa0f09ce7525ccd4d1331710b82aae194338ff49fd15f389016ebf",
      "compositionCredits": "0x19f8a00526c6a0cfd108e96459c2f84c5bb0613b60d05cf0d32d790e2c96b553",
      "compositionLyrics": "0x474e09611863b2a15b1676f0fe3939e9f324069a7fd73780e5a370a5ca545918",
      "recordingCredits": "0x7960e75b049b2ef2c079d50e7b423ada405e4e7bcd7ad9e632c08adf238ca207",
      "releaseCredits": "0x859b699dfbc572d78aef8d97c3bea65fb4036ea8f1b09c10dfd303ef3b20d788",
      "royaltyPool": "0x17fa0d812bb8fe5251c736ebcf2be403f8537d66013bfef28b8a945a89d3f711",
      "routedStake": "0xfe37af88c89e117d7e2e76ed84b78d71ab95d30db994110f20167cb8bf8632e2",
      "coverArt": "0x76e1460bcd2bc95cc0a8a40914511c27e5a2425e6d8055caf08161eb59514c67",
      "releaseCoverArt": "0x1694864f974f978372b8e4c6672b9a791a69aafca4ec908d87d412baa7bc964f",
      "genre": "0x793da2359ac24b204174ea37440b2cbb42c34f989320a84e48a504ec8a0e3dcc",
      "releaseDescription": "0x67f3fef318658544d61083c78cc2602fea9bf80d3c1ac791e91c6c58fbad1426",
      "releaseDspLink": "0x96c029ab47897bced2a181df6257c3113208f1b01f63d394cfa545669f2dd8de",
      "releaseGenre": "0xf2a8232a41cf45b722afe162889217ff21836173fbc5a8d2872fedb35305a022",
      "releaseKind": "0xdd333001cee3473b41e501a13897aaedd93ee7d369bacdf195402c6cb7610bf4",
      "recordingAdvisory": "0x873331a75993ffbc1ee70fe94c12c552d1509e935e8296b17724eef8f1ae3b60",
      "recordingLanguage": "0x0c181bd3e3f45051fd9dcfc133f211e378fb0ac5d8f1af36a462a3bfd4083659",
      "recordingGenre": "0x3e1aa58d39be752878aacf5a48e32b11627a89095bd56a9d374ef8eacff36505",
      "recordingMaster": "0x3c85625e6b0d571e694a76b6be5f61c0634bd7007862ad0f0cca28f08b4e5f55",
      "recordingStreamingTranscode": "0xe3e9192999b22c045007637d73b670781ceba682092e2388f8fd753b51b9e333",
      "recordingEngineSession": "0x696c83fbd6515dab7e2f77a034e8ffcf2bc9ecc0bf65cbf7fff2896fa7125b1b",
      "recordingMasterAudio": "0x73a989640258bd5d82e0ae23bcb6f874fae65c78aecc1781b9a702801a043d7e",
      "minato": "0x7357ccb584396940dd6749cccf7d00896ecd5185a60bf9dc202a62992b30164c",
      "ori": "0xadefbe1aeb900807ed03144bddd80dc6478030c28ede3b2990f8e792606f317a",
      "countryCode": "0x6fada7a2d6c13805380cdff622298b7fff0c8e16d2ce6c3768bcd3f9a6a5e611",
      "languageCode": "0x69f2d3ee6b5ca1779749b5444d2e42dc7b85a1627d880985fad28f028dd154ea"
    },
    "party": {
      "partyMusic": "0x37724a2ee9f642afe6aefdfe9aa9bf620e3e9251ca47174e4f530edcfa756a62",
      "partyProLink": "0x2f7f87143391ee2f7be544d6e63234a9e0587485056628d91b6fa7fd321f1fed",
      "partyMedia": "0x44b97b2976f15b41537218ca63254b5ed647c484ab18e7cc199fe30d4a3bbbad",
      "partyCta": "0x5117c61d19bc1076bedd89249558902856b75b27340ddc6449fbbed55dc72178",
      "partyProfile": "0x330e01ca853460e42bfb49724ab28c39183a8919bd3c9f245b0aa06ca2cc13f9",
      "partyTags": "0xa9827654aee8031055646137cc896afb9d6516bd6bc8cc37e1f2e4c9cc7e418e",
      "partyPlatformLink": "0xbd84dc8b419f380ec4f3cb82a8f27b6a88bdfd5d7578dd868a6aea9bdf88bcfd",
      "partyRoles": "0xbfe33852ec52e5c2df2712f0ed1bacd2c87eda1137ac72e4da909d7933212fd0",
      "partyGenre": "0x5e3256d47b6444a0399159b9b95fbf5e77da35e417bcdfd156ccb6fcefe0130a",
      "partySocial": "0xb3badfae45854071b863784e61d03f44da07e4f6d07faa7ab55e04948254a215",
      "countryCode": "0x6fada7a2d6c13805380cdff622298b7fff0c8e16d2ce6c3768bcd3f9a6a5e611",
      "languageCode": "0x69f2d3ee6b5ca1779749b5444d2e42dc7b85a1627d880985fad28f028dd154ea"
    },
    "objects": {
      "releaseRegistry": "0xb3c65b63cb7ab262d6dc0b29db39b5628b920d13364727e36963ee5081e2e893",
      "genreRegistry": "0x0950f099c6894e29e707db9df538be79708a71fdf060be3ac7ba2e7bc00b79ef"
    },
    "legacy": {
      "releaseCoverArtPackages": []
    }
  },
  testnet: {
    network: "testnet",
    chainIdentifier: "69WiPg3DAQiwdxfncX6wYQ2siKwAe6L9BZthQea3JNMD",
    protocol: MISO_DEPLOYMENTS.testnet,
    partyos: PARTYOS_DEPLOYMENTS.testnet,
    recordSales: {
      status: "unavailable",
      reason: "the published Record sales packages use the previous optional-cap ABI; publish and verify the mandatory-cap packages before enabling writes or current-schema reads",
      legacy: {
        recordPackageId:
          "0x39144c9cd87f1cedb33cfeee041db853548d3b1697b82fb429d289b47b42cfa3",
        recordShopPackageId:
          "0xbaeb00b56f6294d4bc81690f1b1ddcdf43439dad9342040c9c9bd1dc3c6f55ca",
      },
    },
    operations: {
      status: "unavailable",
      reason: "the published Vault uses the previous custody layout and API; publish and verify the renamed Vault and dependent plugins before enabling operations or current-schema reads",
      legacy: {
        vaultPackageId: "0xd4343e031e0b81de18e0227e437b3a186fbb5632ee3b77220409db7740a7db95",
        vaultRegistryId: "0xc188228aac4915834e36874842d3baaaab7a570925ef068f3f24211633422b51",
        packageIds: {
          compositionRoyaltyPoolAction: "0x142af88648b6d24948014b0faed6b1220eb87a633e4a8b3a0034780775d9615b",
          recordingRoyaltyPoolAction: "0x544efe4646ef55c9bcd5378e56909fba4d3933306e227a4b6d8685e3a5ae73a7",
          partyWalletAction: "0x507045549941be7517e21678ab2932c21355a787ffc634a690d5f984be8c3a3a",
          compositionRoutedStakeAction: "0x10785cc55af8a7b2bb6fd3864b2278129cfa40cef623da7b318019e4ea32a2ab",
          releaseRevenueDistributorAction: "0xe83039e607d109ad9aa0030e357cfe2025d949de04c4147c479cc4e7056c37d4",
          compositionRoyaltyPoolPlugin: "0x569b306d2aac2f927e2d0ce39704b533b1b053aa1b95e1d432ce545c1cfc4760",
          recordingRoyaltyPoolPlugin: "0x27a4354849bdb4049838d836b0e82d8ec9f183c583eebea97b0f67593ca02195",
          releaseRevenueDistributorPlugin: "0x4ef01180df90882411ea74575086e51f1957aeda97e4f81e22055d23c98ca5bf",
        },
      },
    },
    packages: {
      audio:
        "0xdc7d00d565b6157acaecbbe07b1d95b66a9247bde400bd520e17810eb464993a",
      minato:
        "0xcdf58ed7e4580118a6a3f2a8077abffe633c551b2f19e95ce01685d42f90b8d9",
      credit:
        "0x5a283f1289c31cf5f4aa2ac998cceeac819ce8aad22d8a75786444b060c56acd",
      compositionCredits:
        "0xbb5d04fe7f81d6b01099716d312aba34ba9817875bc95494bcf0a4c819d7cc94",
      recordingCredits:
        "0x26eecf81819248d6ebefc6c7d3dc959a7039881f605a245e7fdae4d0ed2cc8b9",
      releaseCredits:
        "0xbd84fae836fe3dc519f3ba9ee239cbb474f37b2b1599131a8ae4f0749788fefb",
      royaltyPool:
        "0x4871a97fa5336978bf8a08139f1bc9edfed9f5c83e1ec9a2eee437b19072874f",
      routedStake:
        "0x1f196e1e3a028b4d351aa0590c57db39c52846c30552fb4a0740cf2e71d14729",
      coverArt:
        "0xf27b9cca73518cadfe436616ffaea2722154f317dad5484a9d0e94a4d4e1802c",
      releaseCoverArt:
        "0x96d092f74cb9742848926529529a214b6dcede046ac2a22e52d1825a04a2784b",
      genre:
        "0xd457e0b7e042295231e0ae98634579dd148b78850b208d3730c7c400dcc0f6d8",
      releaseDescription:
        "0x8d5a75afeca744a6b30a12cacc6bf483bb9d931d3f86a0095e1401299c0392f7",
      releaseDspLink:
        "0xd557ef0b169d6262720a58570e6721a80528d914b926a9b1ba5d074c946ea950",
      releaseGenre:
        "0x34b74ee1f9b6f80cc4d96e5dafd5a55fa2c1feaf23366094d9f943d1f682c0c9",
      releaseKind:
        "0x2d7fdb6bedc67a9ca5351de00cb600b8aae4a2171dcbf6988fbbe47c6e0672b9",
      recordingAdvisory:
        "0x5f06d603fc2067f8ebe3d98d25c0dab7acbf84f41b01dada1c9f5bd6254dc344",
      recordingLanguage:
        "0xd01d9fcfdde98d0aada3fa8fa237d6a753176d9f656590012eb2cb45cee5ec07",
      recordingGenre:
        "0x6df226240ab9bfb7a828f9aaf5fa7cae32987e0a6f57f50d8030520a1075f30e",
      recordingMaster:
        "0xa42ff0bc709c7ee69847ba6ee6a2f9084b8763f271f53bf63f100abc6dfd1300",
      recordingMasterAudio:
        "0x5b5fd443fc953bae224d995fcfefdd8c15aeff866323dbe49e43df8243c8e074",
      // Stems generation (Session V1 blob ID + Stem { digest, blob_id } vector).
      // 0x2fcb9ab9… was the retired single-blob generation.
      recordingEngineSession:
        "0xc1bd01a68b39081267b8b089d74e4e6fddb39637b3b165c8186542a2dd826845",
      recordingStreamingTranscode:
        "0x04c2dd271e782d5d5e43656e378c78a97d6c75c7d7fa2267f1ac388d2e495afe",
      ori: "0x51792b9adb9a5d05d7c4d74d7d0cb5aefc5639afa80c0089399cab8b99752e60",
      countryCode:
        "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
      languageCode:
        "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36",
    },
    party: {
      partyCta:
        "0x5a8d375265c811aff63ed1b1213b308f71a50094de15e9b70e012e8a8d91929f",
      partyGenre:
        "0xe4fb7e3591fceba8c04775fd6509d99d7bf82e964f747a9bd6e8f97e5202fbd6",
      partyMedia:
        "0x250599884202c32a5878f8535c5856d49aa61cb95ef46a1b044c3857d548bc3f",
      partyMusic:
        "0x43d4cccfc1b85eb37066b6fa4672a2237b252f84bd6a57a4bbe33b3cbd989fd0",
      partyPlatformLink:
        "0x74f671feaa8304eec8181c9aacc9f18d23b45bd1862ad57a7b1cb66257501a27",
      partyProLink:
        "0x05099a977bdff9339e436735f94a6cebba75512c67f2f0eadaed76f91c5d85d8",
      partyProfile:
        "0xd3c64dde8ec97046ae81985f135ace83bf8920e804e21172581fba81255db9e3",
      partyRoles:
        "0xe1673aee8206c97887820fe26a58883531838f4edd928500a1b841f9f6d1e4f1",
      partySocial:
        "0xb2891df368c7508100013d2125d4c202fa3ddcae93c23bc1445ba5c9a52e9415",
      partyTags:
        "0xa65ca58a766eb49b0120fefcf03c2aecf3c179621b40929cb79f3ca3a4d68eca",
      countryCode:
        "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
      languageCode:
        "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36",
    },
    objects: {
      releaseRegistry:
        "0xd94e71bd6f38ae5bf69bdd76940e78ce3ff6679d946b5258845378cf2eb4ad0a",
      genreRegistry:
        "0x5aa477101309cfc890e0a737917ce7f39afb247827cf027e59ce2e6e9924b6ab",
    },
    legacy: {
      releaseCoverArtPackages: [],
    },
  },
} as const) satisfies Partial<Record<MisoNetwork, MisoPlatformDeployment>>;

/** Resolve a bundled platform deployment, failing closed when it is unavailable. */
export function getMisoPlatformDeployment(
  network: string,
): MisoPlatformDeployment {
  const deployment = (
    MISO_PLATFORM_DEPLOYMENTS as Partial<Record<string, MisoPlatformDeployment>>
  )[network];
  if (!deployment) {
    throw new Error(
      `@misofm/platform: no bundled Miso platform deployment for network "${network}". ` +
        "Pass an explicit deployment to miso() for custom networks.",
    );
  }
  return deployment;
}

/** Effect-returning `assertMisoPlatformDeployment`: validation failure becomes a typed `MisoPlatformDeploymentInvalidError`. */
export function validateMisoPlatformDeployment(
  deployment: unknown,
): Effect.Effect<MisoPlatformDeployment, MisoPlatformDeploymentInvalidError> {
  return Effect.try({
    try: () => normalizeMisoPlatformDeployment(deployment),
    catch: (cause) =>
      new MisoPlatformDeploymentInvalidError({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });
}

/**
 * The platform deployment manifest as a service, so the deployment-aware
 * platform reads and PTB builders (notably {@link Genre.derive}, which needs
 * the genre registry + package ids) can declare it in `R` instead of taking it
 * as an explicit parameter. `MisoPlatformClient`/`misoPlatform()` provide this
 * layer internally; a bare read composed from `queries.ts` functions must
 * provide it explicitly, e.g.
 * `program.pipe(Effect.provide(PlatformDeployment.layer(deployment)))`.
 */
export class PlatformDeployment extends Context.Service<PlatformDeployment, MisoPlatformDeployment>()(
  "@misofm/platform/PlatformDeployment",
) {
  /** Provides a concrete, already-validated `MisoPlatformDeployment` as the service. */
  static layer(deployment: MisoPlatformDeployment): Layer.Layer<PlatformDeployment> {
    return Layer.succeed(PlatformDeployment, deployment);
  }

  /** Resolves a bundled deployment for `network` and provides it as the service; fails closed for unknown networks. */
  static fromNetwork(network: string): Layer.Layer<PlatformDeployment> {
    return PlatformDeployment.layer(getMisoPlatformDeployment(network));
  }
}
