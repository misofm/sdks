// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import { getMisoPlatformDeployment } from "../../src/deployments.ts";
import { configFromDeployment, misoConfig } from "../../src/read/config.ts";

describe("misoConfig", () => {
  test("derives Testnet read ids from the bundled platform deployment", () => {
    const deployment = getMisoPlatformDeployment("testnet");
    const config = misoConfig("testnet");

    expect(config.deployment).toBe(deployment.protocol);
    expect(config.recordSales).toBe(deployment.recordSales);
    expect(config.protocol).toEqual({
      // The bundled testnet manifest's `operations` is always "available", so
      // the fallback branch never runs here; `?? null` matches
      // `configFromDeployment`'s own "no current or legacy Vault package id"
      // case (B1, misofm/sdks#35 verification — see the dedicated test below).
      vault:
        (deployment.operations.status === "available"
          ? deployment.operations.vault.packageId
          : deployment.operations.legacy?.vaultPackageId) ?? null,
      releaseCoverArt: deployment.packages.releaseCoverArt,
      royaltyPool: deployment.packages.royaltyPool,
      releaseKind: deployment.packages.releaseKind,
      recordingMasterReference: deployment.packages.recordingMasterReference,
      recordingStreamingTranscode: deployment.packages.recordingStreamingTranscode ?? null,
      recordingEngineSession: deployment.packages.recordingEngineSession ?? null,
      compositionCredits: deployment.packages.compositionCredits,
      recordingCredits: deployment.packages.recordingCredits,
      releaseCredits: deployment.packages.releaseCredits,
      credit: deployment.packages.credit,
    });
  });

  test("allows endpoint and shelf overrides without erasing defaults", () => {
    const config = misoConfig("testnet", {
      grpcUrl: "https://example.test",
      graphqlUrl: undefined,
      discoverSales: [
        {
          releaseId: "0x1",
          edition: 1,
          currencyType: "0x2::sui::SUI",
        },
      ],
    });

    expect(config.grpcUrl).toBe("https://example.test");
    expect(config.graphqlUrl).toBe("https://graphql.testnet.sui.io/graphql");
    expect(config.discoverSales).toEqual([
      { releaseId: "0x1", edition: 1, currencyType: "0x2::sui::SUI" },
    ]);
  });

  test("fails closed when the SDK has no deployment for a network", () => {
    expect(() => misoConfig("mainnet")).toThrow(/no bundled Miso platform deployment/);
  });

  // B1, misofm/sdks#35 verification: a deployment with no current or legacy
  // Vault package id must not make `configFromDeployment` throw — it is
  // called unconditionally from `Miso.ts`'s `assemble()` (at layer build
  // time, for every `Miso` construction), so a plain throw there would take
  // down `Miso.layer`/`layerTest` entirely rather than leaving the two
  // `read/wallet.ts` members that actually need this field (`getOwnedWorks`,
  // `getWorkByCap`) to fail typed on their own.
  test("has no current or legacy Vault package id: constructs fine, protocol.vault is null", () => {
    const deployment = getMisoPlatformDeployment("testnet");
    const withoutVault = { ...deployment, operations: { status: "unavailable" as const, reason: "test fixture" } };
    expect(() => configFromDeployment(withoutVault)).not.toThrow();
    expect(configFromDeployment(withoutVault).protocol.vault).toBeNull();
  });
});
