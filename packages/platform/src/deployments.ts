// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MisoDeployment, MisoNetwork } from "@misofm/musicos/deployments";
import { MISO_DEPLOYMENTS } from "@misofm/musicos/deployments";
import type { PartyDeployment } from "@misofm/partyos/deployments";
import { PARTYOS_DEPLOYMENTS } from "@misofm/partyos/deployments";
import { normalizeSuiAddress, normalizeSuiObjectId } from "@mysten/sui/utils";
import { immutableSnapshot } from "./internal.ts";

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
  "recordingMasterReference",
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
        readonly pressingPackageId: string;
      };
    }
  | {
      readonly status: "available";
      readonly recordPackageId: string;
      readonly recordShopPackageId: string;
    };

export class RecordSalesUnavailableError extends Error {
  override readonly name = "RecordSalesUnavailableError";
  constructor(readonly reason: string) {
    super(`@misofm/platform: Record sales are unavailable: ${reason}`);
  }
}

export function requireRecordSalesDeployment(
  deployment: RecordSalesDeployment | undefined,
): Extract<RecordSalesDeployment, { status: "available" }> {
  if (!deployment || deployment.status === "unavailable") {
    throw new RecordSalesUnavailableError(
      deployment?.reason ?? "no Record sales deployment was configured",
    );
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
    throw new RecordSalesUnavailableError(
      "Record and Record Shop package IDs must be canonical 32-byte Sui object IDs",
    );
  }
  if (deployment.recordPackageId === deployment.recordShopPackageId) {
    throw new RecordSalesUnavailableError(
      "Record and Record Shop package IDs must be distinct",
    );
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

export class OperationsUnavailableError extends Error {
  override readonly name = "OperationsUnavailableError";
  constructor(readonly reason: string) {
    super(`@misofm/platform: Vault operations are unavailable: ${reason}`);
  }
}

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
    throw new OperationsUnavailableError(
      deployment?.reason ?? "no Vault operations deployment was configured",
    );
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
      throw new OperationsUnavailableError(
        `${field} must be a canonical 32-byte Sui package ID`,
      );
    }
  }
  if (!canonicalObjectId(vault?.registryId)) {
    throw new OperationsUnavailableError(
      "vault.registryId must be a canonical 32-byte Sui object ID",
    );
  }

  const identities = [
    ...packageEntries.map(([, id]) => id as string),
    vault.registryId,
  ];
  if (new Set(identities).size !== identities.length) {
    throw new OperationsUnavailableError(
      `the Vault registry object and all ${packageEntries.length} package IDs must be distinct`,
    );
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
    readonly recordingMasterReference: string;
    /** Complete Walrus Quilt containing the Recording's streaming transcodes. */
    readonly recordingStreamingTranscode?: string;
    /**
     * Miso Engine session: the Session V1 blob plus each stem's PCM digest and
     * blob. Optional so a deployment without the stems generation fails closed
     * before signing rather than calling a retired single-blob package.
     */
    readonly recordingEngineSession?: string;
    /** Original immutable Record-gated Seal policy; absent before publication. */
    readonly recordSealPolicy?: string;
    /** External `ori` package (`data::WalrusBlob`, `data::WalrusQuilt`) used by Walrus-backed extensions. */
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
    /** Frozen namespace object embedded in Recording-session Seal identities. */
    readonly recordGate?: string;
  };
  readonly legacy: {
    readonly releaseCoverArtPackages: readonly string[];
  };
}

export class MisoPlatformDeploymentInvalidError extends Error {
  override readonly name = "MisoPlatformDeploymentInvalidError";
}

/**
 * Validates the `packages` and `party` package-id sets before any Move target
 * is constructed from them: every required id must be a canonical 32-byte Sui
 * package ID, and no two of them (nor the core `musicos` package) may collide.
 * Optional generation fields (`recordingGenre`, `recordingStreamingTranscode`,
 * `recordingEngineSession`, `recordSealPolicy`) are validated only when present.
 */
export function assertMisoPlatformDeployment(
  deployment: unknown,
): asserts deployment is MisoPlatformDeployment {
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment)) {
    throw new MisoPlatformDeploymentInvalidError(
      "@misofm/platform: deployment must be a complete MisoPlatformDeployment object.",
    );
  }
  const candidate = deployment as Partial<MisoPlatformDeployment>;
  const packages = candidate.packages as Partial<MisoPlatformDeployment["packages"]> | undefined;
  const party = candidate.party as Partial<PartyExtensionsDeployment> | undefined;
  const partyos = candidate.partyos as Partial<PartyDeployment> | undefined;
  if (!packages || typeof packages !== "object") {
    throw new MisoPlatformDeploymentInvalidError(
      "@misofm/platform: deployment is missing its `packages` section.",
    );
  }
  if (!party || typeof party !== "object") {
    throw new MisoPlatformDeploymentInvalidError(
      "@misofm/platform: deployment is missing its `party` section.",
    );
  }
  if (!partyos || typeof partyos !== "object") {
    throw new MisoPlatformDeploymentInvalidError(
      "@misofm/platform: deployment is missing its `partyos` section.",
    );
  }

  const seenPackageIds = new Set<string>();
  /** `dedupeOk` lets `party.countryCode`/`party.languageCode` intentionally
   * repeat `packages.countryCode`/`packages.languageCode` — both sections
   * point the same shared dependency package at their own consumers — without
   * tripping the distinctness check meant to catch a genuinely misconfigured
   * manifest. */
  const checkCanonical = (field: string, packageId: unknown, dedupeOk = false) => {
    if (typeof packageId !== "string") {
      throw new MisoPlatformDeploymentInvalidError(
        `@misofm/platform: deployment is missing package ID for "${field}".`,
      );
    }
    let normalized: string;
    try {
      normalized = normalizeSuiAddress(packageId);
    } catch {
      throw new MisoPlatformDeploymentInvalidError(
        `@misofm/platform: deployment package ID for "${field}" is not a valid Sui address.`,
      );
    }
    if (packageId !== normalized) {
      throw new MisoPlatformDeploymentInvalidError(
        `@misofm/platform: deployment package ID for "${field}" must be normalized (${normalized}).`,
      );
    }
    if (!dedupeOk) {
      if (seenPackageIds.has(packageId)) {
        throw new MisoPlatformDeploymentInvalidError(
          `@misofm/platform: deployment package ID for "${field}" duplicates another package. ` +
            "Every package in a deployment manifest must have its own address.",
        );
      }
      seenPackageIds.add(packageId);
    }
  };

  for (const key of REQUIRED_PLATFORM_PACKAGE_KEYS) {
    checkCanonical(`packages.${key}`, packages[key]);
  }
  checkCanonical("partyos.partyos", partyos.partyos);
  for (const key of REQUIRED_PARTY_PACKAGE_KEYS) {
    // `country_code`/`language_code` are shared dependency packages, deliberately
    // repeated from `packages.*` above rather than distinct party-only ids.
    checkCanonical(`party.${key}`, party[key], key === "countryCode" || key === "languageCode");
  }
  if (party.countryCode !== packages.countryCode) {
    throw new MisoPlatformDeploymentInvalidError(
      "@misofm/platform: party.countryCode must match packages.countryCode (the same shared dependency package).",
    );
  }
  if (party.languageCode !== packages.languageCode) {
    throw new MisoPlatformDeploymentInvalidError(
      "@misofm/platform: party.languageCode must match packages.languageCode (the same shared dependency package).",
    );
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
  testnet: {
    network: "testnet",
    chainIdentifier: "69WiPg3DAQiwdxfncX6wYQ2siKwAe6L9BZthQea3JNMD",
    protocol: MISO_DEPLOYMENTS.testnet,
    partyos: PARTYOS_DEPLOYMENTS.testnet,
    recordSales: {
      status: "available",
      recordPackageId:
        "0x8562a4c266b1229871551cec69c1a331f682920b9cad7685e42e7c6a5eba61d5",
      recordShopPackageId:
        "0x5d1b79c312b5d2a2bc9aa0ce7ea6d41ecedd4a5d8698bc007000ca0c8a3459f9",
    },
    operations: {
      status: "available",
      vault: {
        packageId:
          "0xe7a5d1f895d7ca2571c2329a13a5703905d8903433b379db3aa987c7594a0198",
        registryId:
          "0xebd40980edb30e425b80f7d65378246254cc5787e07d23faa46e6b9a2b9dd14d",
      },
      actions: {
        compositionRoyaltyPool:
          "0xa4655e8c1319655cbc0ad5da0d8bccbd528372fea2cb767235e89f2be6eb403c",
        recordingRoyaltyPool:
          "0xff510b24ddba7755dafeb3ceae65204ed6be058a83b482f98da92b3d19eefcd2",
        partyWallet:
          "0x493fa265fd7c8066cd80f644d22086fe36b2c8e26bd160d8a6f6f44743c42acc",
        compositionRoutedStake:
          "0xff5b7a4e1791210c36f2ea071a87e2e6212ddbe2acc922d324cf5436f8ca0b47",
        releaseRevenueDistributor:
          "0x72b175f79cdb1df5d597cdb07007ac309994e6c3f99823b04400a48565dd3989",
      },
      plugins: {
        compositionRoyaltyPool:
          "0x57b58eb53ade40a7e1e6e4be4bdd0fecdd57f709efe8021830b2e3519e800254",
        recordingRoyaltyPool:
          "0x69c859aba359ca8fbeb1df4cff3de53cca3b4ce5ffaa1a7516bc9eb3e016cf71",
        releaseRevenueDistributor:
          "0x875a764569360ec7f4e676bcf5e30a50037229f33f2bae6d2acd205c0570e8b2",
      },
    },
    packages: {
      minato:
        "0xcdf58ed7e4580118a6a3f2a8077abffe633c551b2f19e95ce01685d42f90b8d9",
      credit:
        "0xd77981b6872d975ccebeac1c639eebbcd1f7916f468df0242d4b26d9bf7293c1",
      compositionCredits:
        "0x924a5e87230cf1218be23484e4914d9c5515528c8ef032b1796ebdc71dd3830c",
      recordingCredits:
        "0x982d946a34bb342913c81441be1c702b29f2a83bc801c4fce9ed4f9d7833b8b1",
      releaseCredits:
        "0xdc854106cb76733bb012db2369e0a39319fb79b0587e2a887814c7cb67134d77",
      royaltyPool:
        "0xf7be632d74f71574c2aa5ac2790a51e770b2cfbcf80233b875bdbe24ffe0b3b9",
      routedStake:
        "0xfe3f0c0008823330d2e465a300b34eec50ab3c7444e655602ed2efc517c91824",
      coverArt:
        "0xc0b1421b32e287559ec29f6d7c71dd83778234cb62d4fe9d296577710411f6d4",
      releaseCoverArt:
        "0x74c1708ff6016b5244f8d31559210ae6e5a2b5e52cb3c7996e1f630a7d4a87b2",
      genre:
        "0xeea93dd140ee2133d1baeeb71281846658b104d53403d4f89e75f65ade38f931",
      releaseDescription:
        "0x8d59667b5e9476df33125153494246107a1384ecbea8862fa1b5c256588789fa",
      releaseDspLink:
        "0xebcf0515a35c765ca89208162510bdddd2a9225866b9c66f33dc3cfa1e07bf8a",
      releaseGenre:
        "0xc7269a52efa400b80009f8c9f7e31591a26c50c0ae925be31edaef8889e91c83",
      releaseKind:
        "0x48f1651e00572525fb2e59ebb37c5367d45258d62486984825c972a8ab2d0ce3",
      recordingAdvisory:
        "0x4149faba212e3aca5440e5ea15bde535dca453f2701125a996d89188b0000ed0",
      recordingLanguage:
        "0x78e48de29be0b9dca4921dd0740cc12c88cb02599ee8554854b4e423a689fd19",
      recordingGenre:
        "0x3c017256c66c7d48f4c23ae40dd6d5a0470a4f85a750aadef388ef9ac8e71b36",
      recordingMasterReference:
        "0x2638edd3c9fec5650eda561e77fb390add0110088ad54c470e83ea079108bb1a",
      // Stems generation (Session V1 blob + Stem { digest, data } vector).
      // 0x2fcb9ab9… was the retired single-blob generation.
      recordingEngineSession:
        "0xa3057f47e31683c1eba0afba56aa38af6734f6b9fc3fb679c2681a21ccfe3c24",
      recordingStreamingTranscode:
        "0x67bde09257865521b221aebf83bc95e5a9ae9d38f2c77223772436bc9c70e8ec",
      recordSealPolicy:
        "0x7e1921715dbda4fbb73227d0764f4c0de55fdcf3892ddadc4ef1bf895453b2a2",
      ori: "0x51792b9adb9a5d05d7c4d74d7d0cb5aefc5639afa80c0089399cab8b99752e60",
      countryCode:
        "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
      languageCode:
        "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36",
    },
    party: {
      partyCta:
        "0x310bd64b4d32b547ad52128df9839702a3b74e144e920d04d00bb2bd488b2036",
      partyGenre:
        "0x6b66b793a13c899e41d812a3feccafc9078184f0bd74c4af474d23ef7fd35ec5",
      partyMedia:
        "0xb4479afae1f14c4cf7064908c29ccf698b5e10f2e48a31d63f861131476594c5",
      partyMusic:
        "0xe583826d1610a252769eddb4fa81e81040d40468fc99eec4bf72c52456ff7f79",
      partyPlatformLink:
        "0xe0990445758d27732928759a33e73bcddd2b06604dc0c552b958b6b0220b060b",
      partyProLink:
        "0xdbf8f3d1d12cf15e435d74bfb910e88eae7094064176661a85bc79a76e6ce674",
      partyProfile:
        "0x0cb11099892f9a583077408369a1d838ec888660ed31af7f7bd52a3794f147a6",
      partyRoles:
        "0x53227d2c8c36b6bae17e2cdfaff50cf7e52261c40cbda65a11fe9f9486cc6104",
      partySocial:
        "0xb691711983ad484e8caecc3091872a163a4cf6f93bfab3d3974ad94bb4b63d2f",
      partyTags:
        "0xcc0a53bfa1310758c02607a9ee95fa1553ef3d9431e3df25f38a16e09c3466c5",
      countryCode:
        "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
      languageCode:
        "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36",
    },
    objects: {
      releaseRegistry:
        "0xb0506d287b50a134a2773a5d4e0c9c4e3ef4aa3806cad6ff93d8b28be063c6df",
      genreRegistry:
        "0x9a5a7ce36906a0581e6e38a0dd6abc24093acc6ffd7c0d6a7f419c57b069d00e",
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
