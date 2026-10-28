// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Effect } from "effect";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { PartyProtocolDeploymentError } from "./errors.ts";

/** Sui networks for which this SDK may bundle a verified deployment. */
export type PartyProtocolNetwork = "mainnet" | "testnet";

/**
 * The single independently published package required by this SDK surface:
 * the party-protocol object-model package (module `party`).
 *
 * This name is a stable deployment-manifest key, not a Move module name. Its
 * value is never inferred from a source label or a previous publish.
 */
const CANONICAL_PARTY_PROTOCOL_PACKAGE_NAMES = ["partyos"] as const;

export type PartyProtocolPackageName = (typeof CANONICAL_PARTY_PROTOCOL_PACKAGE_NAMES)[number];

/**
 * Exact package address from one compatible publish. Fill this only from the
 * verified immutable publish record.
 */
export type PartyDeployment = Readonly<Record<PartyProtocolPackageName, string>> & {
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
export const PARTY_PROTOCOL_DEPLOYMENTS = Object.freeze({
  mainnet: Object.freeze({
    partyos: "0x8625400639b03bcb16478721d1d6992a719f230000bfcee426f5c760e082b173",
  } as const),
  testnet: Object.freeze({
    partyos: "0x4193ae54fa991730b97cc322aa210ce6e7096fe2e5d6ab717a267e1791803ee7",
  } as const),
} as const) satisfies Partial<Record<PartyProtocolNetwork, PartyDeployment>>;

/** Resolve a verified manifest, failing closed for unbundled networks. */
export function getPartyDeployment(network: string): PartyDeployment {
  const deployment = (PARTY_PROTOCOL_DEPLOYMENTS as Partial<Record<string, PartyDeployment>>)[network];
  if (!deployment) {
    throw new Error(
      `@misofm/party: no verified party-protocol deployment is bundled for network "${network}". ` +
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
    throw new Error(`@misofm/party: ${label} is not a valid Sui address.`);
  }
  if (value !== normalized) {
    throw new Error(`@misofm/party: ${label} must be normalized (${normalized}).`);
  }
}

export function assertPartyDeployment(deployment: unknown): asserts deployment is PartyDeployment {
  const allowedKeys: readonly string[] = [...CANONICAL_PARTY_PROTOCOL_PACKAGE_NAMES, ...OPTIONAL_DEPLOYMENT_KEYS];
  const shapeError = () =>
    new Error(
      `@misofm/party: deployment must be an object with exactly these package IDs: ${CANONICAL_PARTY_PROTOCOL_PACKAGE_NAMES.join(", ")}, and may optionally carry "typeOrigin".`,
    );
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment)) {
    throw shapeError();
  }
  const entries = deployment as Record<string, unknown>;
  const keys = Object.keys(entries);
  const unexpected = keys.filter((key) => !allowedKeys.includes(key));
  const missing = CANONICAL_PARTY_PROTOCOL_PACKAGE_NAMES.filter((name) => !keys.includes(name));
  if (unexpected.length > 0 || missing.length > 0) {
    throw shapeError();
  }
  for (const name of CANONICAL_PARTY_PROTOCOL_PACKAGE_NAMES) {
    const packageId = entries[name];
    if (typeof packageId !== "string") {
      throw new Error(`@misofm/party: deployment is missing package ID for "${name}".`);
    }
    assertNormalizedAddress(packageId, `deployment package ID for "${name}"`);
  }
  if (entries["typeOrigin"] !== undefined) {
    if (typeof entries["typeOrigin"] !== "string") {
      throw new Error('@misofm/party: deployment\'s "typeOrigin" must be a string.');
    }
    assertNormalizedAddress(entries["typeOrigin"], 'deployment\'s "typeOrigin"');
  }
}

/** Validate and snapshot an untrusted manifest so later caller mutation is inert. */
export function normalizePartyDeployment(deployment: unknown): PartyDeployment {
  assertPartyDeployment(deployment);
  const typeOrigin = deployment.typeOrigin;
  return Object.freeze({
    ...Object.fromEntries(CANONICAL_PARTY_PROTOCOL_PACKAGE_NAMES.map((name) => [name, deployment[name]])),
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
): Effect.fn.Return<PartyDeployment, PartyProtocolDeploymentError> {
  return yield* Effect.try({
    try: () => normalizePartyDeployment(input),
    catch: (cause) =>
      new PartyProtocolDeploymentError({ message: cause instanceof Error ? cause.message : String(cause) }),
  });
});
