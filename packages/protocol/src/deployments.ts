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
    miso: "0x95bb43d650fe582caba27d4ead2c3f9939c38125943f8716c5baf5af528bc671",
    compositionCredits: "0x54cac9dde365a08eff983af16d74d798e6c0a14264bf6cc8a24790708498e37b",
    recordingAdvisory: "0x48a16738e6af6548e50d8f76dce9b9de247f365ef2a07c171f732bdc9c88b235",
    recordingCredits: "0x0ca2c727c3eb8d3f889d9b29ce1118bc60518c6990e26e9ab278a7ffe635bf1e",
    recordingLanguage: "0x677cef9c766b17f87fdf9d6623f1adca0d2e244ee228c86d82c23599ad9a828a",
    recordingMasterReference: "0x2b1ca393e8d41eba5b0d3cabf6df1e207a349bba0486ca9ea3a31734d3445971",
    releaseCoverArt: "0xb289dfb58ccf2af3722f7bc93b072426a791d05a401115f2901d130f12d8e4b2",
    releaseCredits: "0x3a05d0c863ca0b5210f90f69cf87da59791b127c9eaaa10633961aee229a3ed5",
    releaseDescription: "0x60a8bc11b7d41d594a2c54c8dee4534dcf94d3be20054100c7774026a543ec6f",
    releaseDspLink: "0xbeffd79f656ce89d3595c9fb36dac42a169b72a5e7090504c48ba6c2425961a6",
    // Predates the ordered-list (`vector<ID>`, add/set-primary/remove) redesign — this id has no `add_genre` and must be replaced by the republished package before use.
    releaseGenre: "0x111dd8bff35a1779067d7c75f8a514691342f91f67d2fcdae392768ba6db26f2",
    releaseKind: "0x90bf2633b45699d424da616869ecb3d824a88d78d8f8d2ccf5b711b18a734bf1",
    royaltyPool: "0xa49e297e4ed8c29ea9bd5941b3ac7d41327f97c85fc35e11bda466f09fce1943",
    routedStake: "0xc920af18421cd11c315fa8d0cdd56056854cf453f1ced1fa1b32d555bca2955a",
    misoParty: "0xc9fc5d918da992b7c6499880fc509635def384d8529948b28f58494daedf8ec8",
    partyCta: "0x25bbdb3dc3fa9482be90294a2b3e328ab4fc2658f1258f1cdf4fe73b13a8d7c5",
    partyGenre: "0xa02cffae5be2820e8cda8ecd4f10ae4149a40800aee1a78c74736a409aa515b9",
    partyMedia: "0xcafdbe4be3dd6bfade79e546f7faf08972ed864fdb1d49157ad420d71f927783",
    partyMusic: "0x76405c486eccde051a621d91a9fd05a911fdc88a3282ef58a3c58eeaad200008",
    partyPlatformLink: "0x1d555a8ed265f4a76119c5c01be3646807b91b2cec588e33db016671bdcc259c",
    partyProLink: "0xbe6f66e75c6f41afcbf88b166e11cf0a849337379e2f12673598ff976c9f327b",
    partyProfile: "0xa5b333defcf07ad3c59feac4b831f4d6775776b1734c9fb1145f590c3028e789",
    partyRoles: "0x7a3ab86bfe19b3d291a18d7c0582a1248cf9d74f981f901e9dc75dce0dc3ced9",
    partySocial: "0xaaa1af3282370b3f1cd376b2e6f1e0c3b457498eae8ba6150b86e7fe56285392",
    partyTags: "0x68a90de97c82f90f22eaa8f2e2b2bfcc3bcfef4847d62e8540474a494f1198d9",
    countryCode: "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
    languageCode: "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36",
    genre: "0x6ae4aefdd9d147db6f04a14e4f6149944c485fc7d87d8201dcdb0dee15f0f296",
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
