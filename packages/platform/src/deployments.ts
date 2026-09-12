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
  testnet: {
    network: "testnet",
    chainIdentifier: "69WiPg3DAQiwdxfncX6wYQ2siKwAe6L9BZthQea3JNMD",
    protocol: MISO_DEPLOYMENTS.testnet,
    partyos: PARTYOS_DEPLOYMENTS.testnet,
    recordSales: {
      status: "available",
      recordPackageId:
        "0x2b13f706f5c8ad8c07950299c8620251cc84044ec2e40fed327262fb164a2e50",
      recordShopPackageId:
        "0xeaee1a75ff9900cc76b4fd27f3fb697c75119ac54ba4114a379d93a3fd5627ac",
    },
    operations: {
      status: "available",
      vault: {
        packageId:
          "0x69d23319e33b7df88e1e3e31afa29c5f3f14aa2f686f7a594d9a0d1bf0a2c3ea",
        registryId:
          "0x4b03bdbbb8bb52c00d70a14c0e429652cf5c910ea9b37f7058738cb8ac1383cf",
      },
      actions: {
        compositionRoyaltyPool:
          "0x4f20726607f9f9ee65176b69d32c2ec08a759a811a4d94b0ac6c8e01a704de3a",
        recordingRoyaltyPool:
          "0x2e0c8cd5f2e3c7ae307af038e5f20e4d5b16e9963bac97f513bccb7827c9b7f2",
        partyWallet:
          "0xf3fb5a33e2da39f55f416790be488f0218e68cef105b8339a1b005d1e0177705",
        compositionRoutedStake:
          "0xe0006d7e7b5115a364b2b0fb25fc660680287a32e44aaf1c801d63fc5f87933f",
        releaseRevenueDistributor:
          "0x1066a008a026a08d547d3622499eee068573e41051df870dd8959de512e57f59",
      },
      plugins: {
        compositionRoyaltyPool:
          "0xd56aa84888a242eac12ec7943e114a268dff116d9bd978a933a3436d83bc07d8",
        recordingRoyaltyPool:
          "0x63cd7ad32a9a94f846f81bb94202ce4612f466fb885e6b0748bc1bcfdaeb712e",
        releaseRevenueDistributor:
          "0xe0240522156316e0bfeeb14e6f2a18e178f8f15c55a49995fd980d9be3d89185",
      },
    },
    packages: {
      minato:
        "0xcdf58ed7e4580118a6a3f2a8077abffe633c551b2f19e95ce01685d42f90b8d9",
      credit:
        "0x2f7d0c3a5cbe2931331897eb19746c31a200956d74f76d0cca0a39ddf2687e7a",
      compositionCredits:
        "0xce41fd80e3d7258512e0ccc15f4580c8bc473c128aebdcc8c919418345ec460f",
      recordingCredits:
        "0x30d8fa4e05aec5e6d030b217fc03f213d3d1d434df7c8b0912be7f71deaa4f0f",
      releaseCredits:
        "0xd7fccca9d5245463089661ee56091685fa1dad3ff8816fe54ceed21ba6b75234",
      royaltyPool:
        "0xf121fe75a59e7a9a9aab54c43e1b9207570d454f9029e148d5bce1aa09d6693c",
      routedStake:
        "0x0ccc1ad150f0d3d06e650c65c631fa08790407ab50e43d4db709eded0528bca3",
      coverArt:
        "0x29b500b08b05c2fcca1f48e5484bbb658dd29a9cf19dbd6593d2eda5954ab12b",
      releaseCoverArt:
        "0xb76b4f3d23bc381376c73195268c454a22ce6f16ca0c45680d3a79601a20ae59",
      genre:
        "0xb5a3534a863759f026c5d63124298e132da59286184de82fd92daf683356d73a",
      releaseDescription:
        "0xc28721399a570d8df7bf6632a554cecc49e57157b24e6fa332fee96bea241650",
      releaseDspLink:
        "0x3da99cd6b97ffc57cec4c6262fda95a3312ce05fe9bae7235951b522c6316ca4",
      releaseGenre:
        "0xc81bdefb7a787ca29767df388234301c3e8cdcc569c9a3278b4a213aa8aaba1a",
      releaseKind:
        "0x666d42cd8541345ab9039c2fe8896caf33a9e3fe46ecad2d15de4f6ec4c47cf1",
      recordingAdvisory:
        "0x35f3b50e5e1d224821516ff3c12d95fed253cce919bc38c801a6005efb8a2c79",
      recordingLanguage:
        "0x00b2f10f149feae80ccea23e0db32c1ad68aacc90f626e9fc4a8b5a6bd9b9c23",
      recordingGenre:
        "0xd55fa9d6596a215c44e544941d276243b09362ad93e97d797e268532d2fe9a9f",
      recordingMasterReference:
        "0xc9d7717a4fa018cf7a1e85a657523e740981d1000221be0a789ae467eb864ce2",
      // Stems generation (Session V1 blob + Stem { digest, data } vector).
      // 0x2fcb9ab9… was the retired single-blob generation.
      recordingEngineSession:
        "0x8b3ed264e4b2c0d3cbaa3086db8f8b22e4095e415a9d4912ce3886c767e31197",
      recordingStreamingTranscode:
        "0x1b4be5273a23b71478e574b59990a3bce6f7bd18f1dd58656959987d35c932b2",
      recordSealPolicy:
        "0xcf462d00f85b6b94e04d7cdc2c2ea5d6fda6c5b2fe022bd0df8d55fe8a45d1a6",
      ori: "0x51792b9adb9a5d05d7c4d74d7d0cb5aefc5639afa80c0089399cab8b99752e60",
      countryCode:
        "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
      languageCode:
        "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36",
    },
    party: {
      partyCta:
        "0xf107dfc9ca185af74ffb31208db433e95f5edb159a355de1fe16d65e20ce593c",
      partyGenre:
        "0x366e4d8ff0c3ec0b85fed79f8124bea7a1b04bbff7e718613a46e5d6ad3dc35d",
      partyMedia:
        "0x930b615b1c6e80067c8a1872974e754d7fb1484b5af02ffe937c329ee178aa1a",
      partyMusic:
        "0x38fc3972c66708adc4aefba96a85b2ebf16ead8e10e5d23424ff76fd8238e5df",
      partyPlatformLink:
        "0x395cc7fbe05ecbc152bd370dacfac78197c6411218a81b8972309c93083f0f3a",
      partyProLink:
        "0x165eecf72665f763a3e7e394cfee19976e5254c1f0a86ddbb24686fc7091e161",
      partyProfile:
        "0xf1ab0011e4ce756edf0b715f2717c313f52b9b60fd40902db9ba70847f236856",
      partyRoles:
        "0xd37c8666b196768f57eb2a2f3c211fdc2e0105eadd99a528fb99b75dd56f8e7f",
      partySocial:
        "0xd7bd2d7e1bf1a35ef699c93416529b2e1d4144351e11545b504b142eb3706f47",
      partyTags:
        "0x0001237f7802d0adb21f40428189bb12dc35f20904aa406a779f3ef9ccb7baea",
      countryCode:
        "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
      languageCode:
        "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36",
    },
    objects: {
      releaseRegistry:
        "0xda8d553fbd0295558310c73a4bf763d9d0ecea04b87db22466b537e4d75864d8",
      genreRegistry:
        "0xab0dab8b35eb4a00c518744689dee599629a286e1547f71d8c193f9e633e58b7",
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
