// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The `Miso` service skeleton (misofm/sdks#35, WP1): the exact-chain startup
// check `layer`/`layerConfig` perform, `layerTest` skipping it, and
// `protocol`/`party` bound to the real converted `Musicos`/`Partyos`
// services over the in-memory `SuiCore` fake — no network, per
// sui-effect/docs/extensions.md §10.

import { describe, expect, test } from "bun:test";
import { ConfigProvider, Effect, Exit, Layer, Cause, Option } from "effect";
import { KNOWN_CHAIN_IDS, SuiGraphQL } from "@unconfirmed/sui-effect";
import { layerTest } from "@unconfirmed/sui-effect/testing";
import { derivePartyAdminCapId } from "@misofm/partyos";
import { MISO_PLATFORM_DEPLOYMENTS } from "../src/deployments.ts";
import { MisoChainIdentifierMismatchError, MisoNetworkMismatchError, MisoPlatformDeploymentInvalidError } from "../src/errors.ts";
import { Miso } from "../src/Miso.ts";

const TESTNET = MISO_PLATFORM_DEPLOYMENTS.testnet;
const REAL_TESTNET_CHAIN_ID = KNOWN_CHAIN_IDS["testnet"]!;
const SOME_PARTY_ID = `0x${"11".repeat(32)}`;

/** `Sui` fake plus `SuiGraphQL.layerUnavailable` — no test in this file reaches a GraphQL-backed member. */
const fakeEnv = (state: Parameters<typeof layerTest>[0]) => Layer.merge(layerTest(state), SuiGraphQL.layerUnavailable);

const errorOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? Option.getOrUndefined(Cause.findErrorOption(exit.cause)) : undefined;

describe("Miso.layer: the exact-chain startup check", () => {
  test("succeeds and binds protocol/party when network and chainId match the deployment", async () => {
    const { network, chainId, protocolPackageId, partyAdminCapId } = await Effect.runPromise(
      Effect.provide(
        Effect.map(Miso, (m) => ({
          network: m.network,
          chainId: m.chainId,
          protocolPackageId: m.protocol.packageId,
          // `MisoPartyService` has no `.deployment` of its own (WP3); prove it
          // is bound to this deployment's `partyos` package the same way
          // `party/client.ts` does — via a synchronous derivation.
          partyAdminCapId: m.party.derivePartyAdminCapId(SOME_PARTY_ID),
        })),
        Layer.provide(Miso.layer(TESTNET), fakeEnv({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
        { local: true },
      ),
    );
    expect(network).toBe("testnet");
    expect(chainId).toBe(REAL_TESTNET_CHAIN_ID);
    expect(String(protocolPackageId)).toBe(TESTNET.protocol.musicos);
    expect(String(partyAdminCapId)).toBe(String(derivePartyAdminCapId(SOME_PARTY_ID, TESTNET.partyos.partyos)));
  });

  test("fails with MisoNetworkMismatchError when the client's network differs from the deployment's", async () => {
    const exit = await Effect.runPromise(
      Effect.exit(
        Effect.provide(
          Effect.asVoid(Miso),
          Layer.provide(Miso.layer(TESTNET), fakeEnv({ network: "mainnet", chainId: KNOWN_CHAIN_IDS["mainnet"]! })),
          { local: true },
        ),
      ),
    );
    expect(exit._tag).toBe("Failure");
    const error = errorOf(exit);
    expect(error).toBeInstanceOf(MisoNetworkMismatchError);
    if (error instanceof MisoNetworkMismatchError) {
      expect(error.clientNetwork).toBe("mainnet");
      expect(error.deploymentNetwork).toBe("testnet");
      expect(error.outcome).toBe("not_applied");
    }
  });

  test("fails with MisoChainIdentifierMismatchError when the network matches but the chain identifier does not", async () => {
    // Same network as the live node reports (so sui-effect's own
    // Sui.layerNoDeps chain-id assertion for a known network — testnet —
    // passes), but this platform deployment's OWN `chainIdentifier` field is
    // wrong: exactly the scenario Miso.layer's check exists to catch.
    const misconfigured = { ...TESTNET, chainIdentifier: "not-the-real-testnet-digest" };
    const exit = await Effect.runPromise(
      Effect.exit(
        Effect.provide(
          Effect.asVoid(Miso),
          Layer.provide(Miso.layer(misconfigured), fakeEnv({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
          { local: true },
        ),
      ),
    );
    expect(exit._tag).toBe("Failure");
    const error = errorOf(exit);
    expect(error).toBeInstanceOf(MisoChainIdentifierMismatchError);
    if (error instanceof MisoChainIdentifierMismatchError) {
      expect(error.actual).toBe(REAL_TESTNET_CHAIN_ID);
      expect(error.expected).toBe("not-the-real-testnet-digest");
      expect(error.outcome).toBe("not_applied");
    }
  });
});

describe("Miso.layerConfig", () => {
  const withConfig = (config: Record<string, unknown>) =>
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(config));

  test("MISO_NETWORK picks the bundled deployment for that network", async () => {
    const network = await Effect.runPromise(
      Effect.provide(
        Effect.map(Miso, (m) => m.network),
        Layer.provide(Miso.layerConfig, fakeEnv({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
        { local: true },
      ).pipe(withConfig({ MISO_NETWORK: "testnet" })),
    );
    expect(network).toBe("testnet");
  });

  test("an unset MISO_NETWORK falls back to the client's own network", async () => {
    const network = await Effect.runPromise(
      Effect.provide(
        Effect.map(Miso, (m) => m.network),
        Layer.provide(Miso.layerConfig, fakeEnv({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
        { local: true },
      ).pipe(withConfig({})),
    );
    expect(network).toBe("testnet");
  });

  test("an unbundled MISO_NETWORK is a typed MisoPlatformDeploymentInvalidError, not a defect", async () => {
    const exit = await Effect.runPromise(
      Effect.exit(
        Effect.provide(
          Effect.asVoid(Miso),
          Layer.provide(Miso.layerConfig, fakeEnv({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
          { local: true },
        ).pipe(withConfig({ MISO_NETWORK: "devnet" })),
      ),
    );
    expect(exit._tag).toBe("Failure");
    expect(errorOf(exit)).toBeInstanceOf(MisoPlatformDeploymentInvalidError);
  });
});

describe("Miso.layerTest", () => {
  test("builds without the exact-chain check, over any Sui fake", async () => {
    const { deployment } = await Effect.runPromise(
      Effect.provide(
        Effect.map(Miso, (m) => ({ deployment: m.deployment })),
        // Deliberately a network/chainId that does NOT match the bundled
        // testnet deployment layerTest defaults to — proving the check
        // layer/layerConfig perform is skipped here.
        Layer.provide(Miso.layerTest(), fakeEnv({ network: "mainnet", chainId: KNOWN_CHAIN_IDS["mainnet"]! })),
        { local: true },
      ),
    );
    expect(deployment.network).toBe("testnet");
  });

  test("protocol and party are the real converted services, not stubs", async () => {
    const { hasProtocolRead, hasPartyRead } = await Effect.runPromise(
      Effect.provide(
        Effect.map(Miso, (m) => ({
          hasProtocolRead: typeof m.protocol.getReleaseById === "function",
          hasPartyRead: typeof m.party.getPartyById === "function",
        })),
        Layer.provide(Miso.layerTest(), fakeEnv({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
        { local: true },
      ),
    );
    expect(hasProtocolRead).toBe(true);
    expect(hasPartyRead).toBe(true);
  });

  test("accepts a custom deployment override", async () => {
    const custom = { ...TESTNET, chainIdentifier: "anything-layerTest-does-not-check" };
    const { deployment } = await Effect.runPromise(
      Effect.provide(
        Effect.map(Miso, (m) => ({ deployment: m.deployment })),
        Layer.provide(Miso.layerTest({ deployment: custom }), fakeEnv({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
        { local: true },
      ),
    );
    expect(deployment.chainIdentifier).toBe("anything-layerTest-does-not-check");
  });

  // B1, misofm/sdks#35 verification: `assemble()` calls `configFromDeployment`
  // unconditionally to bind `read.*` — before the fix, a deployment with no
  // current or legacy Vault package id made that call throw, which took down
  // the whole `Miso` construction (protocol/party/vault/tx included, not
  // just the two `read.*` members that actually need the missing field).
  test("builds fine with operations unavailable and no legacy Vault package id", async () => {
    const withoutVault = { ...TESTNET, operations: { status: "unavailable" as const, reason: "test fixture" } };
    const { hasVaultNamespace, readIsBound } = await Effect.runPromise(
      Effect.provide(
        Effect.map(Miso, (m) => ({
          hasVaultNamespace: typeof m.vault === "object",
          readIsBound: typeof m.read.getReleaseDetail === "function",
        })),
        Layer.provide(Miso.layerTest({ deployment: withoutVault }), fakeEnv({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
        { local: true },
      ),
    );
    expect(hasVaultNamespace).toBe(true);
    expect(readIsBound).toBe(true);
  });
});
