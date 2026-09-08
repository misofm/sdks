// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { normalizeSuiAddress } from "@mysten/sui/utils";

/** Sui networks for which this SDK may bundle a verified deployment. */
export type MisoNetwork = "mainnet" | "testnet";

/**
 * The single independently published package required by this SDK surface:
 * the `musicos` object-model package (modules composition, recording,
 * release, track).
 *
 * This name is a stable deployment-manifest key, not a Move module name. Its
 * value is never inferred from a source label or a previous publish.
 */
const CANONICAL_MISO_PACKAGE_NAMES = ["musicos"] as const;

/** Public immutable copy; validation always uses the private canonical tuple. */
export const MISO_PACKAGE_NAMES = Object.freeze([
  ...CANONICAL_MISO_PACKAGE_NAMES,
]) as readonly [...typeof CANONICAL_MISO_PACKAGE_NAMES];

export type MisoPackageName = (typeof CANONICAL_MISO_PACKAGE_NAMES)[number];

/**
 * Exact package address from one compatible publish.
 *
 * A complete manifest is intentional: a caller cannot accidentally combine
 * generated bindings for a fresh ABI with a stale package ID. Fill this only
 * from the verified immutable `admin-cli` publish record after the
 * dependency-ordered release is complete.
 */
export type MisoDeployment = Readonly<Record<MisoPackageName, string>>;

/** A minimal core-only deployment, retained for callers that use only `miso()`. */
export interface MisoProtocolDeployment {
  /** The published `musicos` package used for calls, types, and derived IDs. */
  readonly packageId: string;
}

/** Validate and freeze a core-only package binding at a client boundary. */
export function normalizeMisoProtocolDeployment(
  deployment: unknown,
): MisoProtocolDeployment {
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment)) {
    throw new Error("@misofm/musicos: core deployment must be an object with a normalized Miso package ID.");
  }
  const packageId = (deployment as { packageId?: unknown }).packageId;
  if (typeof packageId !== "string") {
    throw new Error("@misofm/musicos: core deployment is missing a Miso package ID.");
  }
  let normalized: string;
  try {
    normalized = normalizeSuiAddress(packageId);
  } catch {
    throw new Error("@misofm/musicos: core deployment package ID is not a valid Sui address.");
  }
  if (packageId !== normalized) {
    throw new Error(
      `@misofm/musicos: core deployment package ID must be normalized (${normalized}).`,
    );
  }
  return Object.freeze({ packageId });
}

/** Verified immutable deployments bundled with this SDK release. */
export const MISO_DEPLOYMENTS = Object.freeze({
  testnet: Object.freeze({
    musicos: "0x2a4f8d83bffa73a13c9cfefdc4376256d4cef4330d5f60233c082cfab9a34e68",
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
      `@misofm/musicos: no verified Miso deployment is bundled for network "${network}". ` +
        "Inject the exact post-publish manifest or pass an explicit deployment; historic package IDs are rejected.",
    );
  }
  return normalizeMisoDeployment(deployment);
}

/** Extract the core package identity from a complete deployment manifest. */
export function protocolDeployment(
  deployment: MisoDeployment,
): MisoProtocolDeployment {
  return normalizeMisoProtocolDeployment({ packageId: normalizeMisoDeployment(deployment).musicos });
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
      `@misofm/musicos: deployment must be an object with exactly ${CANONICAL_MISO_PACKAGE_NAMES.length} Miso package IDs.`,
    );
  }
  const entries = deployment as Record<string, unknown>;
  const keys = Object.keys(entries);
  const unexpected = keys.filter((key) => !CANONICAL_MISO_PACKAGE_NAMES.includes(key as MisoPackageName));
  if (unexpected.length > 0 || keys.length !== CANONICAL_MISO_PACKAGE_NAMES.length) {
    throw new Error(
      `@misofm/musicos: deployment must contain exactly these package IDs: ${CANONICAL_MISO_PACKAGE_NAMES.join(", ")}.`,
    );
  }
  const seenPackageIds = new Set<string>();
  for (const name of CANONICAL_MISO_PACKAGE_NAMES) {
    const packageId = entries[name];
    if (typeof packageId !== "string") {
      throw new Error(
        `@misofm/musicos: deployment is missing package ID for "${name}". ` +
          "Use a complete manifest from the fresh verified immutable admin-cli publish record.",
      );
    }
    let normalized: string;
    try {
      normalized = normalizeSuiAddress(packageId);
    } catch {
      throw new Error(`@misofm/musicos: deployment package ID for "${name}" is not a valid Sui address.`);
    }
    if (packageId !== normalized) {
      throw new Error(
        `@misofm/musicos: deployment package ID for "${name}" must be normalized (${normalized}).`,
      );
    }
    if (seenPackageIds.has(packageId)) {
      throw new Error(
        `@misofm/musicos: deployment package ID for "${name}" duplicates another package. ` +
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
