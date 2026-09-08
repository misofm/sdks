// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { miso } from "../src/client.ts";
import * as contracts from "../src/contracts.ts";
import {
  assertMisoDeployment,
  getMisoDeployment,
  getMisoProtocolDeployment,
  MISO_DEPLOYMENTS,
  MISO_PACKAGE_NAMES,
  type MisoDeployment,
} from "../src/deployments.ts";

const MISO = "0x" + "cd".repeat(32);
const SHARE = "0x" + "ab".repeat(32) + "::share::Share";
const A = "0x" + "11".repeat(32);

const FULL_DEPLOYMENT = { musicos: MISO } as const satisfies MisoDeployment;

const VERIFIED_TESTNET_DEPLOYMENT = {
  musicos: "0x2a4f8d83bffa73a13c9cfefdc4376256d4cef4330d5f60233c082cfab9a34e68",
} as const satisfies MisoDeployment;

function coreClient() {
  return new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  }).$extend(miso({ misoPackageId: MISO }));
}

interface Call {
  package?: string;
  module: string;
  function: string;
}

function moveCalls(tx: Transaction): Call[] {
  const data = tx.getData() as {
    commands: { $kind: string; MoveCall?: Call }[];
  };
  return data.commands
    .filter((command) => command.$kind === "MoveCall" && command.MoveCall)
    .map((command) => command.MoveCall!);
}

test("client.call binds an explicit core package, never the codegen source label", () => {
  const tx = new Transaction();
  coreClient().miso.call.composition._new({
    typeArguments: [SHARE],
    arguments: [
      tx.pure.string("x"),
      tx.pure.u16(1000),
      tx.object(A),
      tx.object(A),
    ],
  })(tx);

  expect(moveCalls(tx).find((call) => call.module === "composition")?.package).toBe(MISO);
});

test("package-bound calls omit reference-returning Move views", () => {
  const client = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  }).$extend(miso({ deployment: FULL_DEPLOYMENT }));

  expect("title" in client.miso.packages.call.core.composition).toBeFalse();
  expect("uid" in client.miso.packages.call.core.composition).toBeFalse();
  expect("uidMut" in client.miso.packages.call.core.recording).toBeFalse();
  expect("title" in client.miso.packages.call.core.release).toBeFalse();
  expect("tracks" in client.miso.packages.call.core.release).toBeFalse();
});

test("package BCS projection exposes codecs only, not transaction builders", () => {
  const client = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" })
    .$extend(miso({ deployment: FULL_DEPLOYMENT }));
  const codecs = client.miso.packages.bcs;

  expect("Composition" in codecs.core.composition).toBeTrue();
  expect("_new" in codecs.core.composition).toBeFalse();
  expect("publish" in codecs.core.composition).toBeFalse();
  expect("package" in codecs.core.composition).toBeFalse();
  if (false) {
    // @ts-expect-error BCS namespaces must never expose a Move-call builder.
    codecs.core.composition._new;
  }
});

test("Testnet defaults to the bundled manifest while partial and unbundled deployments fail closed", () => {
  const client = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  }).$extend(miso());
  expect(client.miso.deployment.packageId).toBe(MISO_DEPLOYMENTS.testnet.musicos);
  expect(client.miso.packages.deployment).toEqual(MISO_DEPLOYMENTS.testnet);
  expect(getMisoDeployment("testnet")).toEqual(MISO_DEPLOYMENTS.testnet);
  expect(getMisoProtocolDeployment("testnet")).toEqual({
    packageId: MISO_DEPLOYMENTS.testnet.musicos,
  });
  expect(() => getMisoProtocolDeployment("mainnet")).toThrow(
    /no verified Miso deployment/,
  );
  expect(() => assertMisoDeployment({ miso: MISO })).toThrow(
    /exactly these package IDs/,
  );
  expect(() =>
    new SuiGrpcClient({
      network: "testnet",
      baseUrl: "https://fullnode.testnet.sui.io:443",
    }).$extend(miso({ deployment: { musicos: MISO, unexpected: MISO } as unknown as MisoDeployment })),
  ).toThrow(/exactly these package IDs/);
  expect(() => coreClient().miso.packages).toThrow(/complete MisoDeployment/);
});

test("Testnet deployment export matches the verified immutable admin-cli publish record", () => {
  expect(MISO_DEPLOYMENTS.testnet).toEqual(VERIFIED_TESTNET_DEPLOYMENT);
  expect(getMisoDeployment("testnet")).toEqual(VERIFIED_TESTNET_DEPLOYMENT);
  expect(getMisoProtocolDeployment("testnet")).toEqual({
    packageId: VERIFIED_TESTNET_DEPLOYMENT.musicos,
  });
});

test("deployment manifests are exact, normalized, and snapshotted", () => {
  expect(() => assertMisoDeployment({ ...FULL_DEPLOYMENT, unexpected: MISO })).toThrow(
    /exactly these package IDs/,
  );
  expect(() => assertMisoDeployment({ ...FULL_DEPLOYMENT, musicos: "0xAB" })).toThrow(
    /normalized|valid Sui address/,
  );
  const mutable = { ...FULL_DEPLOYMENT } as { musicos: string };
  const client = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" })
    .$extend(miso({ deployment: mutable }));
  mutable.musicos = "0x" + "ef".repeat(32);
  const tx = new Transaction();
  client.miso.call.release.releaseRegistryId({ arguments: [tx.object(A)] })(tx);
  expect(moveCalls(tx)[0]?.package).toBe(MISO);
});

test("bundled deployment defaults are runtime immutable", () => {
  const bundledMiso = VERIFIED_TESTNET_DEPLOYMENT.musicos;
  const alternate = "0x" + "ef".repeat(32);
  const mutableRoot = MISO_DEPLOYMENTS as unknown as {
    testnet: MisoDeployment;
  };
  const mutableTestnet = MISO_DEPLOYMENTS.testnet as unknown as {
    musicos: string;
  };

  expect(Object.isFrozen(MISO_DEPLOYMENTS)).toBeTrue();
  expect(Object.isFrozen(MISO_DEPLOYMENTS.testnet)).toBeTrue();
  expect(() => {
    mutableRoot.testnet = { ...FULL_DEPLOYMENT, musicos: alternate };
  }).toThrow(TypeError);
  expect(() => {
    mutableTestnet.musicos = alternate;
  }).toThrow(TypeError);

  expect(MISO_DEPLOYMENTS.testnet.musicos).toBe(bundledMiso);
  expect(getMisoDeployment("testnet")).toEqual(MISO_DEPLOYMENTS.testnet);
  expect(getMisoProtocolDeployment("testnet")).toEqual({
    packageId: bundledMiso,
  });
});

test("core deployment is snapshotted and immutable at registration", () => {
  const alternate = "0x" + "ef".repeat(32);
  const supplied = { packageId: MISO };
  const client = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" })
    .$extend(miso({ deployment: supplied }));
  supplied.packageId = alternate;

  expect(client.miso.deployment.packageId).toBe(MISO);
  expect(Object.isFrozen(client.miso.deployment)).toBeTrue();
  expect(() => Object.assign(client.miso.deployment, { packageId: alternate })).toThrow();
  const tx = new Transaction();
  client.miso.call.release.releaseRegistryId({ arguments: [tx.object(A)] })(tx);
  expect(moveCalls(tx)[0]?.package).toBe(MISO);
});

test("exported package names are immutable and cannot weaken validation", () => {
  const names = MISO_PACKAGE_NAMES as unknown as string[];
  expect(Object.isFrozen(names)).toBeTrue();
  expect(() => names.pop()).toThrow();
  expect(() => names.splice(0, 1)).toThrow();
  expect(() => assertMisoDeployment(FULL_DEPLOYMENT)).not.toThrow();
});

test("bound package IDs cannot be overridden by callers", () => {
  const client = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" })
    .$extend(miso({ deployment: FULL_DEPLOYMENT }));
  const tx = new Transaction();
  client.miso.packages.call.core.release.releaseRegistryId({
    // @ts-expect-error Bound package call options intentionally omit package.
    package: "0x" + "ef".repeat(32),
    arguments: [tx.object(A)],
  })(tx);
  expect(moveCalls(tx)[0]?.package).toBe(MISO);
});

test("public contracts retain BCS but omit unsafe reference-returning calls", () => {
  expect("Composition" in contracts.composition).toBeTrue();
  expect("uid" in contracts.composition).toBeFalse();
  expect("uidMut" in contracts.release).toBeFalse();
  expect("title" in contracts.release).toBeFalse();
  expect("tracks" in contracts.release).toBeFalse();
});
