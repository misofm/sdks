// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The `Miso` service skeleton (misofm/sdks#35, WP1): the exact-chain startup
// check `layer`/`layerConfig` perform, `layerTest` skipping it, and
// `protocol`/`party` bound to the real converted `Musicos`/`Partyos`
// services over the in-memory `SuiCore` fake — no network, per
// sui-effect/docs/extensions.md §10.

import { describe, expect, test } from "bun:test";
import { ConfigProvider, Effect, Exit, Layer, Cause, Option } from "effect";
import { KNOWN_CHAIN_IDS } from "sui-effect";
import { layerTest } from "sui-effect/testing";
import { MISO_PLATFORM_DEPLOYMENTS } from "../src/deployments.ts";
import { MisoChainIdentifierMismatchError, MisoNetworkMismatchError, MisoPlatformDeploymentInvalidError } from "../src/errors.ts";
import { Miso } from "../src/Miso.ts";

const TESTNET = MISO_PLATFORM_DEPLOYMENTS.testnet;
const REAL_TESTNET_CHAIN_ID = KNOWN_CHAIN_IDS["testnet"]!;

const errorOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? Option.getOrUndefined(Cause.findErrorOption(exit.cause)) : undefined;

describe("Miso.layer: the exact-chain startup check", () => {
  test("succeeds and binds protocol/party when network and chainId match the deployment", async () => {
    const { network, chainId, protocolPackageId, partyId } = await Effect.runPromise(
      Effect.provide(
        Effect.map(Miso, (m) => ({
          network: m.network,
          chainId: m.chainId,
          protocolPackageId: m.protocol.packageId,
          partyId: m.party.deployment.partyos,
        })),
        Layer.provide(Miso.layer(TESTNET), layerTest({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
        { local: true },
      ),
    );
    expect(network).toBe("testnet");
    expect(chainId).toBe(REAL_TESTNET_CHAIN_ID);
    expect(String(protocolPackageId)).toBe(TESTNET.protocol.musicos);
    expect(partyId).toBe(TESTNET.partyos.partyos);
  });

  test("fails with MisoNetworkMismatchError when the client's network differs from the deployment's", async () => {
    const exit = await Effect.runPromise(
      Effect.exit(
        Effect.provide(
          Effect.asVoid(Miso),
          Layer.provide(Miso.layer(TESTNET), layerTest({ network: "mainnet", chainId: KNOWN_CHAIN_IDS["mainnet"]! })),
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
          Layer.provide(Miso.layer(misconfigured), layerTest({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
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
        Layer.provide(Miso.layerConfig, layerTest({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
        { local: true },
      ).pipe(withConfig({ MISO_NETWORK: "testnet" })),
    );
    expect(network).toBe("testnet");
  });

  test("an unset MISO_NETWORK falls back to the client's own network", async () => {
    const network = await Effect.runPromise(
      Effect.provide(
        Effect.map(Miso, (m) => m.network),
        Layer.provide(Miso.layerConfig, layerTest({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
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
          Layer.provide(Miso.layerConfig, layerTest({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
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
        Layer.provide(Miso.layerTest(), layerTest({ network: "mainnet", chainId: KNOWN_CHAIN_IDS["mainnet"]! })),
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
        Layer.provide(Miso.layerTest(), layerTest({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
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
        Layer.provide(Miso.layerTest({ deployment: custom }), layerTest({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
        { local: true },
      ),
    );
    expect(deployment.chainIdentifier).toBe("anything-layerTest-does-not-check");
  });
});
