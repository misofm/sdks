// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import { getMisoPlatformDeployment } from "../../src/deployments.ts";
import { misoConfig } from "../../src/read/config.ts";

describe("misoConfig", () => {
  test("derives Testnet read ids from the bundled platform deployment", () => {
    const deployment = getMisoPlatformDeployment("testnet");
    const config = misoConfig("testnet");

    expect(config.deployment).toBe(deployment.protocol);
    expect(config.recordSales).toBe(deployment.recordSales);
    expect(config.protocol).toEqual({
      vault:
        deployment.operations.status === "available"
          ? deployment.operations.vault.packageId
          : deployment.operations.legacy?.vaultPackageId,
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
});
