// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Effect } from "effect";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { DeploymentError } from "@misofm/effect";

/** Sui networks for which this SDK may bundle a verified deployment. */
export type PartyosNetwork = "mainnet" | "testnet";

/**
 * The single independently published package required by this SDK surface:
 * the `partyos` object-model package (module `party`).
 *
 * This name is a stable deployment-manifest key, not a Move module name. Its
 * value is never inferred from a source label or a previous publish.
 */
const CANONICAL_PARTYOS_PACKAGE_NAMES = ["partyos"] as const;

export type PartyosPackageName = (typeof CANONICAL_PARTYOS_PACKAGE_NAMES)[number];

/**
 * Exact package address from one compatible publish. Fill this only from the
 * verified immutable publish record.
 */
export type PartyDeployment = Readonly<Record<PartyosPackageName, string>>;

/** Verified immutable deployments bundled with this SDK release. */
export const PARTYOS_DEPLOYMENTS = Object.freeze({
  testnet: Object.freeze({
    partyos: "0x342425da86c4389c1f5558013251f18017ead98414db5644569890ba3a4a434c",
  } as const),
} as const) satisfies Partial<Record<PartyosNetwork, PartyDeployment>>;

/** Resolve a verified manifest, failing closed for unbundled networks. */
export function getPartyDeployment(network: string): PartyDeployment {
  const deployment = (PARTYOS_DEPLOYMENTS as Partial<Record<string, PartyDeployment>>)[network];
  if (!deployment) {
    throw new Error(
      `@misofm/partyos: no verified PartyOS deployment is bundled for network "${network}". ` +
        "Inject the exact post-publish manifest or pass an explicit deployment; historic package IDs are rejected.",
    );
  }
  return normalizePartyDeployment(deployment);
}

/**
 * Validates an explicit manifest before any Move target is constructed. This is
 * useful at configuration boundaries such as environment-file loading.
 */
export function assertPartyDeployment(deployment: unknown): asserts deployment is PartyDeployment {
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment)) {
    throw new Error(
      `@misofm/partyos: deployment must be an object with exactly these package IDs: ${CANONICAL_PARTYOS_PACKAGE_NAMES.join(", ")}.`,
    );
  }
  const entries = deployment as Record<string, unknown>;
  const keys = Object.keys(entries);
  const unexpected = keys.filter(
    (key) => !CANONICAL_PARTYOS_PACKAGE_NAMES.includes(key as PartyosPackageName),
  );
  if (unexpected.length > 0 || keys.length !== CANONICAL_PARTYOS_PACKAGE_NAMES.length) {
    throw new Error(
      `@misofm/partyos: deployment must contain exactly these package IDs: ${CANONICAL_PARTYOS_PACKAGE_NAMES.join(", ")}.`,
    );
  }
  for (const name of CANONICAL_PARTYOS_PACKAGE_NAMES) {
    const packageId = entries[name];
    if (typeof packageId !== "string") {
      throw new Error(`@misofm/partyos: deployment is missing package ID for "${name}".`);
    }
    let normalized: string;
    try {
      normalized = normalizeSuiAddress(packageId);
    } catch {
      throw new Error(`@misofm/partyos: deployment package ID for "${name}" is not a valid Sui address.`);
    }
    if (packageId !== normalized) {
      throw new Error(
        `@misofm/partyos: deployment package ID for "${name}" must be normalized (${normalized}).`,
      );
    }
  }
}

/** Validate and snapshot an untrusted manifest so later caller mutation is inert. */
export function normalizePartyDeployment(deployment: unknown): PartyDeployment {
  assertPartyDeployment(deployment);
  return Object.freeze(
    Object.fromEntries(CANONICAL_PARTYOS_PACKAGE_NAMES.map((name) => [name, deployment[name]])),
  ) as PartyDeployment;
}

/**
 * Effect counterpart to {@link normalizePartyDeployment}: validation is pure and
 * synchronous, so this exists only for callers composing a config-loading
 * pipeline out of Effects rather than throwing at a configuration boundary.
 */
export const validatePartyDeployment = Effect.fn("validatePartyDeployment")(function* (
  input: unknown,
): Effect.fn.Return<PartyDeployment, DeploymentError> {
  return yield* Effect.try({
    try: () => normalizePartyDeployment(input),
    catch: (cause) => new DeploymentError({ message: cause instanceof Error ? cause.message : String(cause) }),
  });
});
