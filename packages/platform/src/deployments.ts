// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MisoDeployment, MisoNetwork } from "@misofm/protocol/deployments";
import { MISO_DEPLOYMENTS } from "@misofm/protocol/deployments";
import { normalizeSuiObjectId } from "@mysten/sui/utils";
import { immutableSnapshot } from "./internal.ts";

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
      "the Vault registry object and all nine package IDs must be distinct",
    );
  }
  return deployment;
}

/** Complete on-chain identity used by the Miso platform SDK on one network. */
export interface MisoPlatformDeployment {
  /** Network name this immutable deployment set belongs to. */
  readonly network: MisoNetwork;
  /** Full ledger genesis digest used to reject a mislabeled RPC endpoint. */
  readonly chainIdentifier: string;
  /** The complete protocol and Party deployment this platform build targets. */
  readonly protocol: MisoDeployment;
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
    // Predates the ordered-list (`vector<ID>`, add/set-primary/remove) redesign —
    // this id has no `add_genre` and must be replaced by the republished package
    // before use. See the no-upgrades policy: misofm never upgrades in place.
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
    recordSales: {
      status: "available",
      recordPackageId:
        "0x0ad1ad504c63f8e14f74f0535600eb965217bc9ef3305d6d4bd3dad077bb832f",
      recordShopPackageId:
        "0x6f075182093837a6b9ea00be706c94d896a3cf62567e05a74d902716a7ac8730",
    },
    operations: {
      status: "available",
      vault: {
        packageId:
          "0x994699b7df4963aa3ad4ca3253d26e7271b8f8e76b50108f00eb69e7aca4637a",
        registryId:
          "0xeaad77ce26cc610340c32c55f8fe0ae6f63639431c4608c7466703dee8450c7a",
      },
      actions: {
        compositionRoyaltyPool:
          "0x8a55e02198a9ab7997abf2815e7f4b587d976570128741dfed2e152b7c0e9cab",
        recordingRoyaltyPool:
          "0x404089e5da21fe26dd6b9b346f457b3cbe34977bb12c503036e6b625fa34ba41",
        partyWallet:
          "0x0bdd7e78d46834546b54d6c02697cf67b37d36a2c6fdbb19e290729529fdb3a9",
        compositionRoutedStake:
          "0xf5138fd64c16a43bead17e56fe7ac6900c214cd55233c069f47b13174d0a9ff8",
        releaseRevenueDistributor:
          "0x24656bb1feafc1a3d0ec30b8f10b364983c7a9c12febb5b7f6acd007f013a54b",
      },
      plugins: {
        compositionRoyaltyPool:
          "0x8934a96dd9cbdc64040d74810556deef0a39d28ea7033f633d76d7b560e9191c",
        recordingRoyaltyPool:
          "0x92b8b21483241e39ddab66a67fb1fc99f553eef9b53f47747cb59515540c8dec",
        releaseRevenueDistributor:
          "0xbebed662371093a75c0d24a2c34a161339a2e4ab981594de8aa7157c555c620e",
      },
    },
    packages: {
      minato:
        "0xcdf58ed7e4580118a6a3f2a8077abffe633c551b2f19e95ce01685d42f90b8d9",
      credit:
        "0xdcbe495da81859e16540e2df44e86123217930ac9066a8aecebf479cbe73006f",
      compositionCredits:
        "0x54cac9dde365a08eff983af16d74d798e6c0a14264bf6cc8a24790708498e37b",
      recordingCredits:
        "0x0ca2c727c3eb8d3f889d9b29ce1118bc60518c6990e26e9ab278a7ffe635bf1e",
      releaseCredits:
        "0x3a05d0c863ca0b5210f90f69cf87da59791b127c9eaaa10633961aee229a3ed5",
      royaltyPool:
        "0xa49e297e4ed8c29ea9bd5941b3ac7d41327f97c85fc35e11bda466f09fce1943",
      routedStake:
        "0xc920af18421cd11c315fa8d0cdd56056854cf453f1ced1fa1b32d555bca2955a",
      coverArt:
        "0xb7c82b0435e6f577cdc334a9b2d8940b869dacb846d72ddb3ee566b5e8c63b52",
      releaseCoverArt:
        "0xb289dfb58ccf2af3722f7bc93b072426a791d05a401115f2901d130f12d8e4b2",
      genre:
        "0x6ae4aefdd9d147db6f04a14e4f6149944c485fc7d87d8201dcdb0dee15f0f296",
      releaseDescription:
        "0x60a8bc11b7d41d594a2c54c8dee4534dcf94d3be20054100c7774026a543ec6f",
      releaseDspLink:
        "0xbeffd79f656ce89d3595c9fb36dac42a169b72a5e7090504c48ba6c2425961a6",
      // Predates the ordered-list (`vector<ID>`, add/set-primary/remove) redesign
      // of release_genre — this id has no `add_genre` and must be replaced by
      // the republished package before use.
      releaseGenre:
        "0x111dd8bff35a1779067d7c75f8a514691342f91f67d2fcdae392768ba6db26f2",
      releaseKind:
        "0x90bf2633b45699d424da616869ecb3d824a88d78d8f8d2ccf5b711b18a734bf1",
      recordingAdvisory:
        "0x48a16738e6af6548e50d8f76dce9b9de247f365ef2a07c171f732bdc9c88b235",
      recordingLanguage:
        "0x677cef9c766b17f87fdf9d6623f1adca0d2e244ee228c86d82c23599ad9a828a",
      recordingMasterReference:
        "0x2b1ca393e8d41eba5b0d3cabf6df1e207a349bba0486ca9ea3a31734d3445971",
      // Stems generation (Session V1 blob + Stem { digest, data } vector).
      // 0x2fcb9ab9… was the retired single-blob generation.
      recordingEngineSession:
        "0x55ca06d2ac044247e55165a9cb661219d47cee94789cc289a6e1e91ac8159a76",
      recordingStreamingTranscode:
        "0x45ee95108ddc6f90c1f4c73fb8aff5f0b7047d4982e6f997e2c9afe02f908a05",
      recordSealPolicy:
        "0x3af51d7c48b32d37a1a3bd31f06cdd873032fca8663cb3f9d9cf516bc4ee08ba",
      ori: "0x51792b9adb9a5d05d7c4d74d7d0cb5aefc5639afa80c0089399cab8b99752e60",
    },
    objects: {
      releaseRegistry:
        "0xbb947ba51420df59a726487e008adaf352b7c58c1dbfe1e5e6b19131a98cc43c",
      genreRegistry:
        "0x63cfb245a15871b7a4c33b66487a3f4de0a7bd6431e3f0434cad4176c25e6eb5",
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
