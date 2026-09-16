// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import { getMisoPlatformDeployment } from "../../src/deployments.ts";
import { configFromDeployment, misoConfig } from "../../src/read/config.ts";
import { partyAvatarUrl } from "../../src/read/artist.ts";

describe("misoConfig", () => {
  test("derives Testnet read ids from the bundled platform deployment", () => {
    const deployment = getMisoPlatformDeployment("testnet");
    const config = misoConfig("testnet");

    expect(config.deployment).toBe(deployment.protocol);
    expect(config.recordSales).toBe(deployment.recordSales);
    expect(config.apiBaseUrl).toBe("https://api.testnet.miso.fm/v1");
    expect(config.protocol).toEqual({
      vault: null,
      releaseCoverArt: deployment.packages.releaseCoverArt,
      royaltyPool: deployment.packages.royaltyPool,
      releaseKind: deployment.packages.releaseKind,
      releaseDescription: deployment.packages.releaseDescription,
      genre: deployment.packages.genre,
      releaseGenre: deployment.packages.releaseGenre,
      recordingMaster: deployment.packages.recordingMaster,
      recordingStreamingTranscode: deployment.packages.recordingStreamingTranscode ?? null,
      recordingEngineSession: deployment.packages.recordingEngineSession ?? null,
      compositionCredits: deployment.packages.compositionCredits,
      recordingCredits: deployment.packages.recordingCredits,
      releaseCredits: deployment.packages.releaseCredits,
      credit: deployment.packages.credit,
    });
  });

  test("builds canonical versioned party avatar URLs and confines the id to one segment", () => {
    expect(partyAvatarUrl("https://api.testnet.miso.fm/v1/", "0xabc/../../health?x=1"))
      .toBe("https://api.testnet.miso.fm/v1/parties/0xabc%2F..%2F..%2Fhealth%3Fx%3D1/avatar");
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

  test("derives Mainnet reads from the verified generation", () => {
    const deployment = getMisoPlatformDeployment("mainnet");
    const config = misoConfig("mainnet");
    expect(config.deployment).toBe(deployment.protocol);
    expect(config.protocol.vault).toBe(deployment.operations.status === "available" ? deployment.operations.vault.packageId : null);
    expect(config.recordSales.status).toBe("available");
    expect(config.grpcUrl).toContain("mainnet");
    expect(config.graphqlUrl).toContain("mainnet");
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

test("historical Vault metadata cannot select the current object codec", () => {
  const deployment = getMisoPlatformDeployment("testnet");
  const legacy = { ...deployment, operations: {
    status: "unavailable" as const,
    reason: "old Vault ABI",
    legacy: { vaultPackageId: `0x${"12".repeat(32)}` },
  } };
  expect(configFromDeployment(legacy).protocol.vault).toBeNull();
});
