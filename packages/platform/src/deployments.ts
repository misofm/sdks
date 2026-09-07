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
    /** Curated Genre vocabulary package used by release_genre. */
    readonly genre: string;
    readonly releaseDescription: string;
    readonly releaseDspLink: string;
    readonly releaseGenre: string;
    readonly releaseKind: string;
    readonly recordingAdvisory: string;
    readonly recordingLanguage: string;
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
        "0xc9411d3e2cb9600081544572036bec049624db1707f9354c342090f440b6e1a2",
      recordShopPackageId:
        "0xc6d49266080b8f165b6c1fc48e1aa4a6d719183d78a8d1043bfe0f2d6c744ed1",
    },
    operations: {
      status: "available",
      vault: {
        packageId:
          "0x77b74e9221874b9e29f6743a277810480bf89d71b5cb71741cd52dfcd83035d2",
        registryId:
          "0x0fcfe3bb47f0ee2fbf0dcb65b48741efd06b4d746f1df14fe6ac3c00e9e35287",
      },
      actions: {
        compositionRoyaltyPool:
          "0x26c574e0aa01f504833b4f01dad44e2cd17b8718630e025d85ce05b843092085",
        recordingRoyaltyPool:
          "0x84b3cc36907112da74c88c78d1ac20e17010a30e206dfa4322a300c87032d405",
        partyWallet:
          "0xa3d6016f2da63b53546e3f9922e8f0c12c27ca532509ef8c0e778f3e7cd56ee6",
        compositionRoutedStake:
          "0x8e32cdb08953afe0b72f46fde2b0fe1ab0ab3c12885c1e41883ccb5d8703e144",
        releaseRevenueDistributor:
          "0x5ab255ed56c601c5d3c79502e81cfd4fd534c166fa731c2275a65d5fd2b34615",
      },
      plugins: {
        compositionRoyaltyPool:
          "0x6969b98c0322a8a7ba2478d900fc88e1c9ba17903c310c7fdb133c0789bd5ba8",
        recordingRoyaltyPool:
          "0x4ac310583eda99e148207f99618ce5d21d7e7680e7c92b58422113b155a97455",
        releaseRevenueDistributor:
          "0xf13e254b32cee1315d9c0af3c4ef6e3bb770c293eee90afe30a009cde30bb381",
      },
    },
    packages: {
      minato:
        "0xcdf58ed7e4580118a6a3f2a8077abffe633c551b2f19e95ce01685d42f90b8d9",
      credit:
        "0xb82c6c2524ede481cfa3c1066c70c1e43b1a5f6f11e40d5633153c2c3150bba7",
      compositionCredits:
        "0x09434b8b65fb25a703b9c762abbb9075b5bfde6baffc923baac9353ab2191a65",
      recordingCredits:
        "0x598303437c97ab1ec232be884d041587f18647b71fb36f4cf76cbbcc3c276dd2",
      releaseCredits:
        "0xd6e9f090d581779099cc4beaf6c8843f1d569dea85fdde004748c8f03aadafcb",
      royaltyPool:
        "0xce4a1415255ac043301f3057b1dbd1095ad4959fcbe5bfceb9dbb7cf1144def1",
      routedStake:
        "0xaa37871d4ba3ce4a465c13c79d1a701941efbf33491633c744ad4b7035f7f894",
      coverArt:
        "0x711f7041fc9e12d045b278c07ff9cf5047b69002e91e9dd881ad51c09ec389f6",
      releaseCoverArt:
        "0xfb1dc55719142fb575c6242f338447fa87bf4618f6903c7a6e30489f4e810fb3",
      genre:
        "0x095c412a9e9846b091b8f93d9bd50bca5d98a2e65063cb6c20265dc307c4b319",
      releaseDescription:
        "0x957b633fd186f65f953e17caaeec2e3385431c6f55914cb31dfb775368f89d9e",
      releaseDspLink:
        "0x7bce4d548314d9cff3145732f19ad7e67b3c00e2cf4d6f295f8af6d02108884e",
      releaseGenre:
        "0x9770bc7cf9d9b2fa35af194d14f0c36320fbf6541c5ee12b884f0db44d1b5a4f",
      releaseKind:
        "0x187f6f881623cc843d2c6dc98fe23203598fd3992b6a78c1b5990f3fd60a0f5b",
      recordingAdvisory:
        "0x8f745dac70fef5327e686b31acbe3f3504dc7eeb63da5f31a4660bb5aea5ee4b",
      recordingLanguage:
        "0xd6b7f206f838018a28d33b77bade2b8476ccafab5fe526345c375d3b47bb892f",
      recordingMasterReference:
        "0x65309bf315f3e035b0f10c706eb5c327af5038be1637a0cee74f4ae62872f6ce",
      // Stems generation (Session V1 blob + Stem { digest, data } vector).
      // 0x2fcb9ab9… was the retired single-blob generation.
      recordingEngineSession:
        "0x0ec0227854f418a6accfbdcca5d41fd22b6906f5034c8ea1545dfe42a2a7f020",
      recordingStreamingTranscode:
        "0x622cd2a9e49ee2639f5c1d922d2fc75e89e810e80da8dd6d4a843bcefa0aacb0",
      recordSealPolicy:
        "0x2b806033f31ed0af5a9118429111dd5c91f44d9229c41aa9d5cbaec7e3910c0a",
      ori: "0x51792b9adb9a5d05d7c4d74d7d0cb5aefc5639afa80c0089399cab8b99752e60",
    },
    objects: {
      releaseRegistry:
        "0x40700d8fd9de26392d10c4a3c0759b08f60be43e2f80681650e87a4efdac5cf1",
      genreRegistry:
        "0x479a1f43c8118b24d10cba62d64ad782c19fad974cdbc5020c909ea943c857a8",
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
