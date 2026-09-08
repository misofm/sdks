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

const FULL_DEPLOYMENT = Object.fromEntries(
  MISO_PACKAGE_NAMES.map((name, index) => [
    name,
    name === "miso"
      ? MISO
      : `0x${(index + 1).toString(16).padStart(64, "0")}`,
  ]),
) as MisoDeployment;

const VERIFIED_TESTNET_DEPLOYMENT = {
  miso: "0x95bb43d650fe582caba27d4ead2c3f9939c38125943f8716c5baf5af528bc671",
  compositionCredits: "0x54cac9dde365a08eff983af16d74d798e6c0a14264bf6cc8a24790708498e37b",
  recordingAdvisory: "0x48a16738e6af6548e50d8f76dce9b9de247f365ef2a07c171f732bdc9c88b235",
  recordingCredits: "0x0ca2c727c3eb8d3f889d9b29ce1118bc60518c6990e26e9ab278a7ffe635bf1e",
  recordingLanguage: "0x677cef9c766b17f87fdf9d6623f1adca0d2e244ee228c86d82c23599ad9a828a",
  recordingMasterReference: "0x2b1ca393e8d41eba5b0d3cabf6df1e207a349bba0486ca9ea3a31734d3445971",
  releaseCoverArt: "0xb289dfb58ccf2af3722f7bc93b072426a791d05a401115f2901d130f12d8e4b2",
  releaseCredits: "0x3a05d0c863ca0b5210f90f69cf87da59791b127c9eaaa10633961aee229a3ed5",
  releaseDescription: "0x60a8bc11b7d41d594a2c54c8dee4534dcf94d3be20054100c7774026a543ec6f",
  releaseDspLink: "0xbeffd79f656ce89d3595c9fb36dac42a169b72a5e7090504c48ba6c2425961a6",
  releaseGenre: "0x111dd8bff35a1779067d7c75f8a514691342f91f67d2fcdae392768ba6db26f2",
  releaseKind: "0x90bf2633b45699d424da616869ecb3d824a88d78d8f8d2ccf5b711b18a734bf1",
  royaltyPool: "0xa49e297e4ed8c29ea9bd5941b3ac7d41327f97c85fc35e11bda466f09fce1943",
  routedStake: "0xc920af18421cd11c315fa8d0cdd56056854cf453f1ced1fa1b32d555bca2955a",
  misoParty: "0xc9fc5d918da992b7c6499880fc509635def384d8529948b28f58494daedf8ec8",
  partyCta: "0x25bbdb3dc3fa9482be90294a2b3e328ab4fc2658f1258f1cdf4fe73b13a8d7c5",
  partyGenre: "0xa02cffae5be2820e8cda8ecd4f10ae4149a40800aee1a78c74736a409aa515b9",
  partyMedia: "0xcafdbe4be3dd6bfade79e546f7faf08972ed864fdb1d49157ad420d71f927783",
  partyMusic: "0x76405c486eccde051a621d91a9fd05a911fdc88a3282ef58a3c58eeaad200008",
  partyPlatformLink: "0x1d555a8ed265f4a76119c5c01be3646807b91b2cec588e33db016671bdcc259c",
  partyProLink: "0xbe6f66e75c6f41afcbf88b166e11cf0a849337379e2f12673598ff976c9f327b",
  partyProfile: "0xa5b333defcf07ad3c59feac4b831f4d6775776b1734c9fb1145f590c3028e789",
  partyRoles: "0x7a3ab86bfe19b3d291a18d7c0582a1248cf9d74f981f901e9dc75dce0dc3ced9",
  partySocial: "0xaaa1af3282370b3f1cd376b2e6f1e0c3b457498eae8ba6150b86e7fe56285392",
  partyTags: "0x68a90de97c82f90f22eaa8f2e2b2bfcc3bcfef4847d62e8540474a494f1198d9",
  countryCode: "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
  languageCode: "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36",
  genre: "0x6ae4aefdd9d147db6f04a14e4f6149944c485fc7d87d8201dcdb0dee15f0f296",
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

test("a complete manifest binds extension calls to their own fresh package IDs", () => {
  const client = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  }).$extend(miso({ deployment: FULL_DEPLOYMENT }));
  const tx = new Transaction();

  client.miso.packages.call.extensions.recordingAdvisory.unsetRating({
    typeArguments: [SHARE, SHARE],
    arguments: [tx.object(A), tx.object(A)],
  })(tx);
  client.miso.packages.call.primitives.royaltyPool.pool.sweepAndDeposit({
    typeArguments: [SHARE, "0x2::sui::SUI"],
    arguments: [tx.object(A)],
  })(tx);

  const call = moveCalls(tx).find((item) => item.module === "recording_advisory");
  expect(call).toMatchObject({
    package: FULL_DEPLOYMENT.recordingAdvisory,
    function: "unset_rating",
  });
  expect(moveCalls(tx).find((item) => item.function === "sweep_and_deposit")).toMatchObject({
    package: FULL_DEPLOYMENT.royaltyPool,
    module: "pool",
  });
});

test("Party APIs live at client.miso.party and bind the consolidated manifest", () => {
  const client = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  }).$extend(miso({ deployment: FULL_DEPLOYMENT }));
  const tx = new Transaction();

  tx.add(client.miso.party.tx.setName({ partyId: A, capId: A, name: "Miso" }));

  expect(moveCalls(tx).find((item) => item.module === "party")).toMatchObject({
    package: FULL_DEPLOYMENT.misoParty,
    function: "set_name",
  });
  expect(client.miso.party.genrePackageId).toBe(FULL_DEPLOYMENT.genre);
  expect("uid" in client.miso.party.call.party).toBeFalse();
  expect("profile" in client.miso.party.call.profile).toBeFalse();
});

test("package-bound calls omit reference-returning Move views", () => {
  const client = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  }).$extend(miso({ deployment: FULL_DEPLOYMENT }));

  expect("title" in client.miso.packages.call.core.composition).toBeFalse();
  expect("releaseLink" in client.miso.packages.call.extensions.releaseDspLink).toBeTrue();
  expect("credits" in client.miso.packages.call.extensions.compositionCredits.compositionCredits).toBeFalse();
  expect("register" in client.miso.packages.call.primitives.routedStake).toBeFalse();
  expect("unregister" in client.miso.packages.call.primitives.routedStake).toBeFalse();
  expect("unstake" in client.miso.packages.call.primitives.routedStake).toBeFalse();
  expect("restake" in client.miso.packages.call.primitives.routedStake).toBeFalse();
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
  expect(client.miso.deployment.packageId).toBe(MISO_DEPLOYMENTS.testnet.miso);
  expect(client.miso.packages.deployment).toEqual(MISO_DEPLOYMENTS.testnet);
  expect(client.miso.party.genrePackageId).toBe(MISO_DEPLOYMENTS.testnet.genre);
  expect(getMisoDeployment("testnet")).toEqual(MISO_DEPLOYMENTS.testnet);
  expect(getMisoProtocolDeployment("testnet")).toEqual({
    packageId: MISO_DEPLOYMENTS.testnet.miso,
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
    }).$extend(miso({ deployment: { miso: MISO } as MisoDeployment })),
  ).toThrow(/exactly these package IDs/);
  expect(() => coreClient().miso.packages).toThrow(/complete MisoDeployment/);
  expect(() => coreClient().miso.party).toThrow(/Party APIs require a complete MisoDeployment/);
});

test("Testnet deployment export matches the verified immutable admin-cli publish record", () => {
  expect(MISO_DEPLOYMENTS.testnet).toEqual(VERIFIED_TESTNET_DEPLOYMENT);
  expect(getMisoDeployment("testnet")).toEqual(VERIFIED_TESTNET_DEPLOYMENT);
  expect(getMisoProtocolDeployment("testnet")).toEqual({
    packageId: VERIFIED_TESTNET_DEPLOYMENT.miso,
  });
});

test("deployment manifests are exact, normalized, and snapshotted", () => {
  expect(() => assertMisoDeployment({ ...FULL_DEPLOYMENT, unexpected: MISO })).toThrow(
    /exactly these package IDs/,
  );
  expect(() => assertMisoDeployment({ ...FULL_DEPLOYMENT, miso: "0xAB" })).toThrow(
    /normalized|valid Sui address/,
  );
  expect(() =>
    assertMisoDeployment({ ...FULL_DEPLOYMENT, recordingAdvisory: MISO }),
  ).toThrow(/duplicates another package/);
  const mutable = { ...FULL_DEPLOYMENT };
  const client = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" })
    .$extend(miso({ deployment: mutable }));
  mutable.miso = "0x" + "ef".repeat(32);
  const tx = new Transaction();
  client.miso.call.release.releaseRegistryId({ arguments: [tx.object(A)] })(tx);
  expect(moveCalls(tx)[0]?.package).toBe(MISO);
});

test("bundled deployment defaults are runtime immutable", () => {
  const bundledMiso = VERIFIED_TESTNET_DEPLOYMENT.miso;
  const alternate = "0x" + "ef".repeat(32);
  const mutableRoot = MISO_DEPLOYMENTS as unknown as {
    testnet: MisoDeployment;
  };
  const mutableTestnet = MISO_DEPLOYMENTS.testnet as unknown as {
    miso: string;
  };

  expect(Object.isFrozen(MISO_DEPLOYMENTS)).toBeTrue();
  expect(Object.isFrozen(MISO_DEPLOYMENTS.testnet)).toBeTrue();
  expect(() => {
    mutableRoot.testnet = { ...FULL_DEPLOYMENT, miso: alternate };
  }).toThrow(TypeError);
  expect(() => {
    mutableTestnet.miso = alternate;
  }).toThrow(TypeError);

  expect(MISO_DEPLOYMENTS.testnet.miso).toBe(bundledMiso);
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
  expect("credits" in contracts.compositionCredits).toBeFalse();
  expect("_new" in contracts.royaltyPool).toBeFalse();
  expect("_new" in contracts.routedStake).toBeFalse();
  expect("register" in contracts.routedStake).toBeFalse();
  expect("unregister" in contracts.routedStake).toBeFalse();
  expect("unstake" in contracts.routedStake).toBeFalse();
  expect("restake" in contracts.routedStake).toBeFalse();
  if (false) {
    // @ts-expect-error UID-gated routed-stake transitions are not client calls.
    contracts.routedStake.register;
  }
});
