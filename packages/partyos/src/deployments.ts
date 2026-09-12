// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Effect } from "effect";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { PartyosDeploymentError } from "./errors.ts";

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
export type PartyDeployment = Readonly<Record<PartyosPackageName, string>> & {
  /**
   * The package the `party` module's **types** were first published in —
   * what appears inside `pkg::party::Party`, `pkg::party::MembershipKey`,
   * etc. Optional; defaults to `partyos` (the `moveCall`-target package),
   * which is correct until the package is upgraded. An upgrade gives
   * `partyos` a new id for calls and leaves every type name pointing at the
   * original, so codecs, dynamic-field key tags and expected types must
   * keep using the type origin — sui-effect's `docs/extensions.md` §3,
   * "Every type-shaped constant is a function of the package id".
   */
  readonly typeOrigin?: string;
};

/** Verified immutable deployments bundled with this SDK release. */
export const PARTYOS_DEPLOYMENTS = Object.freeze({
  testnet: Object.freeze({
    partyos: "0xcb475c6338c060dc9e403f83e5d9f37a665bc8e8ff1b493ddcc3aadac50a6246",
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
const OPTIONAL_DEPLOYMENT_KEYS = ["typeOrigin"] as const;

function assertNormalizedAddress(value: string, label: string): void {
  let normalized: string;
  try {
    normalized = normalizeSuiAddress(value);
  } catch {
    throw new Error(`@misofm/partyos: ${label} is not a valid Sui address.`);
  }
  if (value !== normalized) {
    throw new Error(`@misofm/partyos: ${label} must be normalized (${normalized}).`);
  }
}

export function assertPartyDeployment(deployment: unknown): asserts deployment is PartyDeployment {
  const allowedKeys: readonly string[] = [...CANONICAL_PARTYOS_PACKAGE_NAMES, ...OPTIONAL_DEPLOYMENT_KEYS];
  const shapeError = () =>
    new Error(
      `@misofm/partyos: deployment must be an object with exactly these package IDs: ${CANONICAL_PARTYOS_PACKAGE_NAMES.join(", ")}, and may optionally carry "typeOrigin".`,
    );
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment)) {
    throw shapeError();
  }
  const entries = deployment as Record<string, unknown>;
  const keys = Object.keys(entries);
  const unexpected = keys.filter((key) => !allowedKeys.includes(key));
  const missing = CANONICAL_PARTYOS_PACKAGE_NAMES.filter((name) => !keys.includes(name));
  if (unexpected.length > 0 || missing.length > 0) {
    throw shapeError();
  }
  for (const name of CANONICAL_PARTYOS_PACKAGE_NAMES) {
    const packageId = entries[name];
    if (typeof packageId !== "string") {
      throw new Error(`@misofm/partyos: deployment is missing package ID for "${name}".`);
    }
    assertNormalizedAddress(packageId, `deployment package ID for "${name}"`);
  }
  if (entries["typeOrigin"] !== undefined) {
    if (typeof entries["typeOrigin"] !== "string") {
      throw new Error('@misofm/partyos: deployment\'s "typeOrigin" must be a string.');
    }
    assertNormalizedAddress(entries["typeOrigin"], 'deployment\'s "typeOrigin"');
  }
}

/** Validate and snapshot an untrusted manifest so later caller mutation is inert. */
export function normalizePartyDeployment(deployment: unknown): PartyDeployment {
  assertPartyDeployment(deployment);
  const typeOrigin = deployment.typeOrigin;
  return Object.freeze({
    ...Object.fromEntries(CANONICAL_PARTYOS_PACKAGE_NAMES.map((name) => [name, deployment[name]])),
    ...(typeOrigin === undefined ? {} : { typeOrigin }),
  }) as PartyDeployment;
}

/**
 * Effect counterpart to {@link normalizePartyDeployment}: validation is pure and
 * synchronous, so this exists only for callers composing a config-loading
 * pipeline out of Effects rather than throwing at a configuration boundary.
 */
export const validatePartyDeployment = Effect.fn("validatePartyDeployment")(function* (
  input: unknown,
): Effect.fn.Return<PartyDeployment, PartyosDeploymentError> {
  return yield* Effect.try({
    try: () => normalizePartyDeployment(input),
    catch: (cause) =>
      new PartyosDeploymentError({ message: cause instanceof Error ? cause.message : String(cause) }),
  });
});
