// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { normalizeSuiAddress } from "@mysten/sui/utils";

/** Sui networks for which this SDK may bundle a verified deployment. */
export type MisoNetwork = "mainnet" | "testnet";

/**
 * Every independently published package required by this SDK surface.
 *
 * These names are stable deployment-manifest keys, not Move module names. Their
 * values are never inferred from source labels or a previous publish.
 */
const CANONICAL_MISO_PACKAGE_NAMES = [
  "miso",
  "compositionCredits",
  "recordingAdvisory",
  "recordingCredits",
  "recordingLanguage",
  "recordingMasterReference",
  "releaseCoverArt",
  "releaseCredits",
  "releaseDescription",
  "releaseDspLink",
  "releaseGenre",
  "releaseKind",
  "royaltyPool",
  "routedStake",
  "misoParty",
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
  "genre",
] as const;

/** Public immutable copy; validation always uses the private canonical tuple. */
export const MISO_PACKAGE_NAMES = Object.freeze([
  ...CANONICAL_MISO_PACKAGE_NAMES,
]) as readonly [...typeof CANONICAL_MISO_PACKAGE_NAMES];

export type MisoPackageName = (typeof CANONICAL_MISO_PACKAGE_NAMES)[number];

/**
 * Exact package addresses from one compatible publish set.
 *
 * A complete manifest is intentional: a caller cannot accidentally combine
 * generated bindings for a fresh ABI with stale package IDs. Fill this only from
 * the verified immutable `admin-cli` publish record after the dependency-ordered
 * releases are complete.
 */
export type MisoDeployment = Readonly<Record<MisoPackageName, string>>;

/** A minimal core-only deployment, retained for callers that use only `miso()`. */
export interface MisoProtocolDeployment {
  /** The published `miso` package used for calls, types, and derived IDs. */
  readonly packageId: string;
}

/** Validate and freeze a core-only package binding at a client boundary. */
export function normalizeMisoProtocolDeployment(
  deployment: unknown,
): MisoProtocolDeployment {
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment)) {
    throw new Error("@misonetwork/sdk: core deployment must be an object with a normalized Miso package ID.");
  }
  const packageId = (deployment as { packageId?: unknown }).packageId;
  if (typeof packageId !== "string") {
    throw new Error("@misonetwork/sdk: core deployment is missing a Miso package ID.");
  }
  let normalized: string;
  try {
    normalized = normalizeSuiAddress(packageId);
  } catch {
    throw new Error("@misonetwork/sdk: core deployment package ID is not a valid Sui address.");
  }
  if (packageId !== normalized) {
    throw new Error(
      `@misonetwork/sdk: core deployment package ID must be normalized (${normalized}).`,
    );
  }
  return Object.freeze({ packageId });
}

/** Verified immutable deployments bundled with this SDK release. */
export const MISO_DEPLOYMENTS = Object.freeze({
  testnet: Object.freeze({
    miso: "0xe5a8e0531b92f3ea1d46604f41ed9e6c1b55a46aed6ac86c5f22c1590f08579b",
    compositionCredits: "0x09434b8b65fb25a703b9c762abbb9075b5bfde6baffc923baac9353ab2191a65",
    recordingAdvisory: "0x8f745dac70fef5327e686b31acbe3f3504dc7eeb63da5f31a4660bb5aea5ee4b",
    recordingCredits: "0x598303437c97ab1ec232be884d041587f18647b71fb36f4cf76cbbcc3c276dd2",
    recordingLanguage: "0xd6b7f206f838018a28d33b77bade2b8476ccafab5fe526345c375d3b47bb892f",
    recordingMasterReference: "0x65309bf315f3e035b0f10c706eb5c327af5038be1637a0cee74f4ae62872f6ce",
    releaseCoverArt: "0xfb1dc55719142fb575c6242f338447fa87bf4618f6903c7a6e30489f4e810fb3",
    releaseCredits: "0xd6e9f090d581779099cc4beaf6c8843f1d569dea85fdde004748c8f03aadafcb",
    releaseDescription: "0x957b633fd186f65f953e17caaeec2e3385431c6f55914cb31dfb775368f89d9e",
    releaseDspLink: "0x7bce4d548314d9cff3145732f19ad7e67b3c00e2cf4d6f295f8af6d02108884e",
    releaseGenre: "0x9770bc7cf9d9b2fa35af194d14f0c36320fbf6541c5ee12b884f0db44d1b5a4f",
    releaseKind: "0x187f6f881623cc843d2c6dc98fe23203598fd3992b6a78c1b5990f3fd60a0f5b",
    royaltyPool: "0xce4a1415255ac043301f3057b1dbd1095ad4959fcbe5bfceb9dbb7cf1144def1",
    routedStake: "0xaa37871d4ba3ce4a465c13c79d1a701941efbf33491633c744ad4b7035f7f894",
    misoParty: "0xd21ad9fa5b79d7b22efb18fa6adc283dfbc2a68ea54104bb1f2630746d1bfd6a",
    partyCta: "0xd2e73bbf2b43a85df1c34acb09a709ce13ffa1741c64fd97a34c34623e65f0e6",
    partyGenre: "0xbb013ec8f590f174c9532fd11d5c6540d9caa53a8407ece46517d4ed678ddffe",
    partyMedia: "0x2a69fdab031a4e8b56b47292b59e589831edf30663e1408a433163a01756f430",
    partyMusic: "0xd3f9a7a98d17ba332cffcb311124dfdb8cb8a970d1261da202a9943a9006148d",
    partyPlatformLink: "0x42983d7b9c8a7f5e32bb529ca0e33913c56b1f1debe0f2d8ed15ddd586f838ae",
    partyProLink: "0x233a163a5bfa9b32caa82bfed52625281e1b0f44dbfea5b34a0d38b918d32db0",
    partyProfile: "0x2ab0ed2b8e29a0c3f6a9bf9ec8ad4ab8f286c29f6f1b6de3f208b0d451fb5510",
    partyRoles: "0xc6be21ffbe6ace09a9029c97ff12d7962cc7cc0411c13c64fb5708f005e1f906",
    partySocial: "0x7302f9e5026445602cab14ea91d55765d19144fb1381023d98d7c542e6f6c80a",
    partyTags: "0x77464ee05b64facc38674a67dfef5310c2d7295dc757d400c4c95d9524b4de0e",
    countryCode: "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
    languageCode: "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36",
    genre: "0x095c412a9e9846b091b8f93d9bd50bca5d98a2e65063cb6c20265dc307c4b319",
  } as const),
} as const) satisfies Partial<
  Record<MisoNetwork, MisoDeployment>
>;

/**
 * @deprecated Use `MISO_DEPLOYMENTS`. This alias preserves source compatibility
 * for callers that still use the former protocol-only constant name.
 */
export const MISO_PROTOCOL_DEPLOYMENTS = MISO_DEPLOYMENTS;

/** Resolve a verified full manifest, failing closed for unbundled networks. */
export function getMisoDeployment(network: string): MisoDeployment {
  const deployment = (
    MISO_DEPLOYMENTS as Partial<Record<string, MisoDeployment>>
  )[network];
  if (!deployment) {
    throw new Error(
      `@misonetwork/sdk: no verified Miso deployment is bundled for network "${network}". ` +
        "Inject the exact post-publish manifest or pass an explicit deployment; historic package IDs are rejected.",
    );
  }
  return normalizeMisoDeployment(deployment);
}

/** Extract the core package identity from a complete deployment manifest. */
export function protocolDeployment(
  deployment: MisoDeployment,
): MisoProtocolDeployment {
  return normalizeMisoProtocolDeployment({ packageId: normalizeMisoDeployment(deployment).miso });
}

/** Resolve the core package only, preserving the established `miso()` default API. */
export function getMisoProtocolDeployment(
  network: string,
): MisoProtocolDeployment {
  return protocolDeployment(getMisoDeployment(network));
}

/**
 * Validates an explicit manifest before any Move target is constructed. This is
 * useful at configuration boundaries such as environment-file loading.
 */
export function assertMisoDeployment(
  deployment: unknown,
): asserts deployment is MisoDeployment {
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment)) {
    throw new Error(
      `@misonetwork/sdk: deployment must be an object with exactly ${CANONICAL_MISO_PACKAGE_NAMES.length} Miso package IDs.`,
    );
  }
  const entries = deployment as Record<string, unknown>;
  const keys = Object.keys(entries);
  const unexpected = keys.filter((key) => !CANONICAL_MISO_PACKAGE_NAMES.includes(key as MisoPackageName));
  if (unexpected.length > 0 || keys.length !== CANONICAL_MISO_PACKAGE_NAMES.length) {
    throw new Error(
      `@misonetwork/sdk: deployment must contain exactly these package IDs: ${CANONICAL_MISO_PACKAGE_NAMES.join(", ")}.`,
    );
  }
  const seenPackageIds = new Set<string>();
  for (const name of CANONICAL_MISO_PACKAGE_NAMES) {
    const packageId = entries[name];
    if (typeof packageId !== "string") {
      throw new Error(
        `@misonetwork/sdk: deployment is missing package ID for "${name}". ` +
          "Use a complete manifest from the fresh verified immutable admin-cli publish record.",
      );
    }
    let normalized: string;
    try {
      normalized = normalizeSuiAddress(packageId);
    } catch {
      throw new Error(`@misonetwork/sdk: deployment package ID for "${name}" is not a valid Sui address.`);
    }
    if (packageId !== normalized) {
      throw new Error(
        `@misonetwork/sdk: deployment package ID for "${name}" must be normalized (${normalized}).`,
      );
    }
    if (seenPackageIds.has(packageId)) {
      throw new Error(
        `@misonetwork/sdk: deployment package ID for "${name}" duplicates another package. ` +
          "A publish manifest must bind every package to its own address.",
      );
    }
    seenPackageIds.add(packageId);
  }
}

/** Validate and snapshot an untrusted manifest so later caller mutation is inert. */
export function normalizeMisoDeployment(deployment: unknown): MisoDeployment {
  assertMisoDeployment(deployment);
  return Object.freeze(
    Object.fromEntries(CANONICAL_MISO_PACKAGE_NAMES.map((name) => [name, deployment[name]])),
  ) as MisoDeployment;
}
