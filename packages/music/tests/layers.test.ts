// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// MusicProtocol's own layer-selection logic: `layerConfig` reading a real
// `ConfigProvider`, and `layer()`'s default (no `options.deployment`) branch
// failing typed when the client's network has no bundled manifest. No
// network — `layerTest` (real `Sui` over the in-memory `SuiCore`) is the
// `Sui` these layers build over.

import { describe, expect, test } from "bun:test";
import { ConfigProvider, Effect, Exit, Layer, Option, Cause } from "effect";
import { KNOWN_CHAIN_IDS } from "@unconfirmed/sui-effect";
import { layerTest } from "@unconfirmed/sui-effect/testing";
import { MusicProtocolDeploymentInvalid } from "../src/errors.ts";
import { MusicProtocol } from "../src/MusicProtocol.ts";

const padded = (suffix: string) => `0x${"0".repeat(64 - suffix.length)}${suffix}`;
const CUSTOM_PACKAGE_ID = padded("c0ffee1");

describe("MusicProtocol.layerConfig", () => {
  test("reads MUSIC_PROTOCOL_PACKAGE_ID from a ConfigProvider, overriding the bundled manifest", async () => {
    const provider = ConfigProvider.fromEnvRecord({ MUSIC_PROTOCOL_PACKAGE_ID: CUSTOM_PACKAGE_ID });
    const packageId = await Effect.runPromise(
      Effect.provide(
        Effect.map(MusicProtocol, (m) => m.deployment.packageId),
        Layer.provide(MusicProtocol.layerConfig, Layer.merge(layerTest(), ConfigProvider.layer(provider))),
      ),
    );
    expect(packageId).toBe(CUSTOM_PACKAGE_ID);
  });

  test("falls back to the bundled manifest when MUSIC_PROTOCOL_PACKAGE_ID is unset", async () => {
    const provider = ConfigProvider.fromEnvRecord({});
    const exit = await Effect.runPromise(
      Effect.exit(
        Effect.provide(
          Effect.map(MusicProtocol, (m) => m.deployment.packageId),
          Layer.provide(
            MusicProtocol.layerConfig,
            Layer.merge(layerTest({ network: "testnet", chainId: KNOWN_CHAIN_IDS["testnet"]! }), ConfigProvider.layer(provider)),
          ),
        ),
      ),
    );
    // The bundled testnet manifest exists, so this succeeds without needing
    // the environment variable at all.
    expect(exit._tag).toBe("Success");
  });

  test("ignores the pre-0.9 MUSICOS_PACKAGE_ID name and uses the bundled manifest", async () => {
    const provider = ConfigProvider.fromEnvRecord({ MUSICOS_PACKAGE_ID: CUSTOM_PACKAGE_ID });
    const packageId = await Effect.runPromise(
      Effect.provide(
        Effect.map(MusicProtocol, (m) => m.deployment.packageId),
        Layer.provide(
          MusicProtocol.layerConfig,
          Layer.merge(layerTest({ network: "testnet", chainId: KNOWN_CHAIN_IDS["testnet"]! }), ConfigProvider.layer(provider)),
        ),
      ),
    );
    expect(packageId).not.toBe(CUSTOM_PACKAGE_ID);
    expect(packageId).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("MusicProtocol.layer(): the default (bundled) branch", () => {
  test("fails typed MusicProtocolDeploymentInvalid at layer build for a network with no bundled manifest", async () => {
    const exit = await Effect.runPromise(
      Effect.exit(
        Effect.provide(Effect.map(MusicProtocol, (m) => m.packageId), Layer.provide(MusicProtocol.layer(), layerTest({ network: "localnet" }))),
      ),
    );
    expect(exit._tag).toBe("Failure");
    const error = Exit.isFailure(exit) ? Option.getOrUndefined(Cause.findErrorOption(exit.cause)) : undefined;
    expect(error).toBeInstanceOf(MusicProtocolDeploymentInvalid);
    expect((error as MusicProtocolDeploymentInvalid).outcome).toBe("not_applied");
  });

  test("picks the bundled manifest for a network this release verifies (testnet)", async () => {
    const packageId = await Effect.runPromise(
      Effect.provide(
        Effect.map(MusicProtocol, (m) => m.packageId),
        Layer.provide(MusicProtocol.layer(), layerTest({ network: "testnet", chainId: KNOWN_CHAIN_IDS["testnet"]! })),
      ),
    );
    expect(typeof packageId).toBe("string");
  });
});
