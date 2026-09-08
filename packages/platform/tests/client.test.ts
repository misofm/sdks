// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import {
  Transaction,
  type ParallelTransactionExecutor,
} from "@mysten/sui/transactions";
import {
  MisoChainIdentifierMismatchError,
  MisoClientNotReadyError,
  MisoNetworkMismatchError,
  miso,
  misoPlatform,
  type MisoPlatformConfig,
} from "../src/client.ts";
import {
  getMisoPlatformDeployment,
  MISO_PLATFORM_DEPLOYMENTS,
  OperationsUnavailableError,
  RecordSalesUnavailableError,
  requireOperationsDeployment,
  requireRecordSalesDeployment,
  type MisoPlatformDeployment,
  type OperationsDeployment,
} from "../src/deployments.ts";
import {
  MISO_PACKAGE_NAMES,
  type MisoDeployment,
} from "@misofm/protocol/deployments";
import { networkFrom } from "../src/read/config.ts";

const RECORD = `0x${"12".repeat(32)}`;
const SHOP = `0x${"13".repeat(32)}`;
const MISO = `0x${"cd".repeat(32)}`;
const MINATO = `0x${"ef".repeat(32)}`;
const A = `0x${"11".repeat(32)}`;
const id = (value: number) => `0x${value.toString(16).padStart(64, "0")}`;

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function expectRecursivelyFrozen(value: unknown, path = "deployment"): void {
  if (!value || typeof value !== "object") return;
  expect(Object.isFrozen(value), path).toBeTrue();
  for (const [key, nested] of Object.entries(value)) {
    expectRecursivelyFrozen(nested, `${path}.${key}`);
  }
}

const OPERATIONS = {
  status: "available",
  vault: { packageId: id(101), registryId: id(201) },
  actions: {
    compositionRoyaltyPool: id(102),
    recordingRoyaltyPool: id(103),
    partyWallet: id(104),
    compositionRoutedStake: id(105),
    releaseRevenueDistributor: id(106),
  },
  plugins: {
    compositionRoyaltyPool: id(107),
    recordingRoyaltyPool: id(108),
    releaseRevenueDistributor: id(109),
  },
} as const satisfies OperationsDeployment;

const NETWORK_DEPLOYMENT = Object.fromEntries(
  MISO_PACKAGE_NAMES.map((name, index) => [
    name,
    name === "miso" ? MISO : `0x${(index + 1).toString(16).padStart(64, "0")}`,
  ]),
) as MisoDeployment;

const DEPLOYMENT = {
  network: "testnet",
  chainIdentifier: "testnet-chain-identifier",
  protocol: NETWORK_DEPLOYMENT,
  recordSales: {
    status: "available",
    recordPackageId: RECORD,
    recordShopPackageId: SHOP,
  },
  operations: OPERATIONS,
  packages: {
    minato: MINATO,
    releaseCoverArt: A,
    releaseCredits: A,
    routedStake: A,
  },
  objects: { releaseRegistry: A, genreRegistry: A },
} as unknown as MisoPlatformDeployment;

interface Call {
  package?: string;
  module: string;
  function: string;
}
function moveCalls(tx: Transaction): Call[] {
  return (tx.getData().commands as Array<{ $kind: string; MoveCall?: Call }>)
    .filter((command) => command.$kind === "MoveCall")
    .map((command) => command.MoveCall!);
}

test("explicit verified deployment binds both finalized sales packages", async () => {
  const base = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  });
  Object.defineProperty(base.core, "getChainIdentifier", {
    configurable: true,
    value: async () => ({ chainIdentifier: DEPLOYMENT.chainIdentifier }),
  });
  const client = base.$extend(miso({ deployment: DEPLOYMENT }));
  await client.miso.ready();
  expect(client.miso.recordPackageId).toBe(RECORD);
  expect(client.miso.recordShopPackageId).toBe(SHOP);

  const tx = new Transaction();
  client.miso.tx.purchaseRecord({
    releaseId: A,
    edition: 1,
    currencyType: "0x2::sui::SUI",
    paymentAmount: "10",
    expectedPricing: { kind: "fixed", amount: "10" },
    recipient: A,
  })(tx);
  const calls = moveCalls(tx);
  expect(calls.find((call) => call.function === "fixed")?.package).toBe(SHOP);
  expect(calls.find((call) => call.function === "purchase")?.package).toBe(
    SHOP,
  );
  expect(
    tx
      .getData()
      .commands.some((command) => command.$kind === "TransferObjects"),
  ).toBeTrue();
});

test("configured client exposes safe raw modules without witness or mint", () => {
  const client = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  }).$extend(miso({ deployment: DEPLOYMENT }));
  expect(client.miso.call.record).toBeDefined();
  expect(client.miso.call.listing).toBeDefined();
  expect(client.miso.call.pressing).toBeDefined();
  expect((client.miso.call as Record<string, unknown>).witness).toBeUndefined();
  expect(
    (client.miso.call.pressing as Record<string, unknown>).mint,
  ).toBeUndefined();
});

test("configured client binds composable streaming-transcode attach and unset builders", async () => {
  const streamingPackage = id(110);
  const oriPackage = id(111);
  const deployment = {
    ...DEPLOYMENT,
    packages: {
      ...DEPLOYMENT.packages,
      recordingStreamingTranscode: streamingPackage,
      ori: oriPackage,
    },
  } as MisoPlatformDeployment;
  const base = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  });
  Object.defineProperty(base.core, "getChainIdentifier", {
    configurable: true,
    value: async () => ({ chainIdentifier: deployment.chainIdentifier }),
  });
  const client = base.$extend(miso({ deployment }));
  await client.miso.ready();

  const target = {
    recordingId: A,
    authority: { kind: "direct" as const, adminCap: id(112) },
    recordingShareType: `${id(113)}::share::Share`,
    compositionShareType: `${id(114)}::share::Share`,
  };
  const tx = new Transaction();
  client.miso.tx.setRecordingStreamingTranscode({
    ...target,
    quiltId: 42n,
  })(tx);
  client.miso.tx.unsetRecordingStreamingTranscode(target)(tx);

  expect(moveCalls(tx).map((call) => `${call.module}::${call.function}`)).toEqual([
    "data::new_quilt",
    "recording_streaming_transcode::new",
    "recording_streaming_transcode::set_streaming_transcode",
    "recording_streaming_transcode::unset_streaming_transcode",
  ]);
  expect(client.miso.call.recordingStreamingTranscode).toBeDefined();
});

test("an available operations deployment binds all nine exact package targets", async () => {
  const base = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  });
  Object.defineProperty(base.core, "getChainIdentifier", {
    configurable: true,
    value: async () => ({ chainIdentifier: DEPLOYMENT.chainIdentifier }),
  });
  const client = base.$extend(miso({ deployment: DEPLOYMENT }));
  await client.miso.ready();
  const tx = new Transaction();
  const share = `${id(301)}::share::Share`;
  const currency = "0x2::sui::SUI";
  const cap = `${MISO}::release::ReleaseAdminCap`;

  tx.add(client.miso.call.vault!.capId({
    arguments: [tx.object(A)],
    typeArguments: [cap],
  }));
  tx.add(client.miso.call.compositionRoyaltyPool!.poolAddress({
    arguments: [tx.object(A)],
    typeArguments: [share, currency],
  }));
  tx.add(client.miso.call.recordingRoyaltyPool!.poolAddress({
    arguments: [tx.object(A)],
    typeArguments: [share, share, currency],
  }));
  tx.add(client.miso.call.partyWallet!.inboxAddress({
    arguments: [tx.object(A)],
  }));
  tx.add(client.miso.call.compositionRoutedStake!.stakeAddress({
    arguments: [tx.object(A)],
    typeArguments: [share, share],
  }));
  tx.add(client.miso.call.releaseRevenueDistributor!.redeemAllAndDistribute({
    arguments: [tx.object(A), tx.object(A)],
    typeArguments: [currency],
  }));
  tx.add(client.miso.call.compositionRoyaltyPoolPlugin!.isInstalled({
    arguments: [tx.object(A)],
    typeArguments: [share],
  }));
  tx.add(client.miso.call.recordingRoyaltyPoolPlugin!.isInstalled({
    arguments: [tx.object(A)],
    typeArguments: [share],
  }));
  tx.add(client.miso.call.releaseRevenueDistributorPlugin!.isInstalled({
    arguments: [tx.object(A)],
  }));

  expect(moveCalls(tx).map((call) => call.package)).toEqual([
    OPERATIONS.vault.packageId,
    OPERATIONS.actions.compositionRoyaltyPool,
    OPERATIONS.actions.recordingRoyaltyPool,
    OPERATIONS.actions.partyWallet,
    OPERATIONS.actions.compositionRoutedStake,
    OPERATIONS.actions.releaseRevenueDistributor,
    OPERATIONS.plugins.compositionRoyaltyPool,
    OPERATIONS.plugins.recordingRoyaltyPool,
    OPERATIONS.plugins.releaseRevenueDistributor,
  ]);
});

test("bundled Testnet deployment exposes the verified sales and operations ABIs", async () => {
  const base = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  });
  Object.defineProperty(base.core, "getChainIdentifier", {
    configurable: true,
    value: async () => ({
      chainIdentifier: MISO_PLATFORM_DEPLOYMENTS.testnet.chainIdentifier,
    }),
  });
  const client = base.$extend(miso());
  await client.miso.ready();

  expect(MISO_PLATFORM_DEPLOYMENTS.testnet.recordSales.status).toBe("available");
  expect(MISO_PLATFORM_DEPLOYMENTS.testnet.operations.status).toBe("available");
  expect(client.miso.deployment?.protocol.miso).toBe(
    MISO_PLATFORM_DEPLOYMENTS.testnet.protocol.miso,
  );
  expect(client.miso.recordPackageId).toBe(
    MISO_PLATFORM_DEPLOYMENTS.testnet.recordSales.recordPackageId,
  );
  expect(client.miso.recordShopPackageId).toBe(
    MISO_PLATFORM_DEPLOYMENTS.testnet.recordSales.recordShopPackageId,
  );
  expect(client.miso.vault).toBeDefined();
  for (const name of [
    "vault",
    "compositionRoyaltyPool",
    "recordingRoyaltyPool",
    "partyWallet",
    "compositionRoutedStake",
    "releaseRevenueDistributor",
    "compositionRoyaltyPoolPlugin",
    "recordingRoyaltyPoolPlugin",
    "releaseRevenueDistributorPlugin",
  ]) {
    expect((client.miso.call as Record<string, unknown>)[name]).toBeDefined();
  }
  expect(
    client.miso.ids.vault(A, `${MISO}::release::ReleaseAdminCap`),
  ).toMatch(/^0x[0-9a-f]{64}$/);
  expect(MISO_PLATFORM_DEPLOYMENTS.testnet.packages).not.toHaveProperty("vault");
  expect(MISO_PLATFORM_DEPLOYMENTS.testnet.objects).not.toHaveProperty("vaultRegistry");
});

test("bundled Testnet deployment exactly matches the verified immutable export", () => {
  expect(MISO_PLATFORM_DEPLOYMENTS.testnet).toEqual({
    network: "testnet",
    chainIdentifier: "69WiPg3DAQiwdxfncX6wYQ2siKwAe6L9BZthQea3JNMD",
    protocol: {
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
    },
    recordSales: {
      status: "available",
      recordPackageId:
        "0x0ad1ad504c63f8e14f74f0535600eb965217bc9ef3305d6d4bd3dad077bb832f",
      recordShopPackageId:
        "0x6f075182093837a6b9ea00be706c94d896a3cf62567e05a74d902716a7ac8730",
    },
    operations: {
      status: "available",
      vault: {
        packageId:
          "0x994699b7df4963aa3ad4ca3253d26e7271b8f8e76b50108f00eb69e7aca4637a",
        registryId:
          "0xeaad77ce26cc610340c32c55f8fe0ae6f63639431c4608c7466703dee8450c7a",
      },
      actions: {
        compositionRoyaltyPool:
          "0x8a55e02198a9ab7997abf2815e7f4b587d976570128741dfed2e152b7c0e9cab",
        recordingRoyaltyPool:
          "0x404089e5da21fe26dd6b9b346f457b3cbe34977bb12c503036e6b625fa34ba41",
        partyWallet:
          "0x0bdd7e78d46834546b54d6c02697cf67b37d36a2c6fdbb19e290729529fdb3a9",
        compositionRoutedStake:
          "0xf5138fd64c16a43bead17e56fe7ac6900c214cd55233c069f47b13174d0a9ff8",
        releaseRevenueDistributor:
          "0x24656bb1feafc1a3d0ec30b8f10b364983c7a9c12febb5b7f6acd007f013a54b",
      },
      plugins: {
        compositionRoyaltyPool:
          "0x8934a96dd9cbdc64040d74810556deef0a39d28ea7033f633d76d7b560e9191c",
        recordingRoyaltyPool:
          "0x92b8b21483241e39ddab66a67fb1fc99f553eef9b53f47747cb59515540c8dec",
        releaseRevenueDistributor:
          "0xbebed662371093a75c0d24a2c34a161339a2e4ab981594de8aa7157c555c620e",
      },
    },
    packages: {
      minato: "0xcdf58ed7e4580118a6a3f2a8077abffe633c551b2f19e95ce01685d42f90b8d9",
      credit: "0xdcbe495da81859e16540e2df44e86123217930ac9066a8aecebf479cbe73006f",
      compositionCredits: "0x54cac9dde365a08eff983af16d74d798e6c0a14264bf6cc8a24790708498e37b",
      recordingCredits: "0x0ca2c727c3eb8d3f889d9b29ce1118bc60518c6990e26e9ab278a7ffe635bf1e",
      releaseCredits: "0x3a05d0c863ca0b5210f90f69cf87da59791b127c9eaaa10633961aee229a3ed5",
      royaltyPool: "0xa49e297e4ed8c29ea9bd5941b3ac7d41327f97c85fc35e11bda466f09fce1943",
      routedStake: "0xc920af18421cd11c315fa8d0cdd56056854cf453f1ced1fa1b32d555bca2955a",
      coverArt: "0xb7c82b0435e6f577cdc334a9b2d8940b869dacb846d72ddb3ee566b5e8c63b52",
      releaseCoverArt: "0xb289dfb58ccf2af3722f7bc93b072426a791d05a401115f2901d130f12d8e4b2",
      genre: "0x6ae4aefdd9d147db6f04a14e4f6149944c485fc7d87d8201dcdb0dee15f0f296",
      releaseDescription: "0x60a8bc11b7d41d594a2c54c8dee4534dcf94d3be20054100c7774026a543ec6f",
      releaseDspLink: "0xbeffd79f656ce89d3595c9fb36dac42a169b72a5e7090504c48ba6c2425961a6",
      releaseGenre: "0x111dd8bff35a1779067d7c75f8a514691342f91f67d2fcdae392768ba6db26f2",
      releaseKind: "0x90bf2633b45699d424da616869ecb3d824a88d78d8f8d2ccf5b711b18a734bf1",
      recordingAdvisory: "0x48a16738e6af6548e50d8f76dce9b9de247f365ef2a07c171f732bdc9c88b235",
      recordingLanguage: "0x677cef9c766b17f87fdf9d6623f1adca0d2e244ee228c86d82c23599ad9a828a",
      recordingMasterReference: "0x2b1ca393e8d41eba5b0d3cabf6df1e207a349bba0486ca9ea3a31734d3445971",
      recordingEngineSession: "0x55ca06d2ac044247e55165a9cb661219d47cee94789cc289a6e1e91ac8159a76",
      recordingStreamingTranscode:
        "0x45ee95108ddc6f90c1f4c73fb8aff5f0b7047d4982e6f997e2c9afe02f908a05",
      recordSealPolicy: "0x3af51d7c48b32d37a1a3bd31f06cdd873032fca8663cb3f9d9cf516bc4ee08ba",
      ori: "0x51792b9adb9a5d05d7c4d74d7d0cb5aefc5639afa80c0089399cab8b99752e60",
    },
    objects: {
      releaseRegistry: "0xbb947ba51420df59a726487e008adaf352b7c58c1dbfe1e5e6b19131a98cc43c",
      genreRegistry: "0x63cfb245a15871b7a4c33b66487a3f4de0a7bd6431e3f0434cad4176c25e6eb5",
    },
    legacy: { releaseCoverArtPackages: [] },
  });

  const deployment = MISO_PLATFORM_DEPLOYMENTS.testnet;
  const identities = [
    deployment.chainIdentifier,
    ...Object.values(deployment.protocol),
    deployment.recordSales.recordPackageId,
    deployment.recordSales.recordShopPackageId,
    deployment.operations.vault.packageId,
    deployment.operations.vault.registryId,
    ...Object.values(deployment.operations.actions),
    ...Object.values(deployment.operations.plugins),
    ...Object.values(deployment.packages),
    ...Object.values(deployment.objects),
  ];
  expect(identities).toHaveLength(64);
});

test("bundled deployment and every nested container are frozen", () => {
  expectRecursivelyFrozen(MISO_PLATFORM_DEPLOYMENTS);
});

test("custom deployment registration snapshots nested targets before readiness", async () => {
  const custom = structuredClone(
    MISO_PLATFORM_DEPLOYMENTS.testnet,
  ) as Mutable<MisoPlatformDeployment>;
  const expected = structuredClone(custom);
  const base = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  });
  Object.defineProperty(base.core, "getChainIdentifier", {
    configurable: true,
    value: async () => ({ chainIdentifier: expected.chainIdentifier }),
  });
  const client = base.$extend(
    miso({ deployment: custom as MisoPlatformDeployment }),
  );

  expect(Object.isFrozen(custom)).toBeFalse();
  expect(Object.isFrozen(custom.operations)).toBeFalse();
  custom.chainIdentifier = "mutated-before-ready";
  custom.protocol.miso = id(701);
  if (custom.recordSales.status !== "available") throw new Error("test fixture");
  custom.recordSales.recordPackageId = id(702);
  custom.recordSales.recordShopPackageId = id(703);
  if (custom.operations.status !== "available") throw new Error("test fixture");
  custom.operations.vault.packageId = id(704);
  custom.operations.actions.partyWallet = id(705);
  custom.operations.plugins.compositionRoyaltyPool = id(706);
  custom.packages.minato = id(707);
  custom.objects.releaseRegistry = id(708);
  custom.legacy.releaseCoverArtPackages.push(id(709));

  await client.miso.ready();
  expect(client.miso.deployment).not.toBe(custom);
  expect(client.miso.deployment).toEqual(expected);
  expectRecursivelyFrozen(client.miso.deployment);
  expect(client.miso.recordPackageId).toBe(
    expected.recordSales.status === "available"
      ? expected.recordSales.recordPackageId
      : "",
  );

  const before = new Transaction();
  before.add(
    client.miso.call.partyWallet!.inboxAddress({
      arguments: [before.object(A)],
    }),
  );
  before.add(
    client.miso.protocol!.call.release.releaseRegistryId({ arguments: [A] }),
  );
  expect(moveCalls(before).map((call) => call.package)).toEqual([
    expected.operations.status === "available"
      ? expected.operations.actions.partyWallet
      : "",
    expected.protocol.miso,
  ]);

  custom.protocol.miso = id(710);
  custom.recordSales.recordPackageId = id(711);
  custom.operations.actions.partyWallet = id(712);
  custom.legacy.releaseCoverArtPackages.push(id(713));
  expect(client.miso.deployment).toEqual(expected);
  expect(client.miso.recordPackageId).toBe(
    expected.recordSales.status === "available"
      ? expected.recordSales.recordPackageId
      : "",
  );
  expect(() => {
    (client.miso.deployment as Mutable<MisoPlatformDeployment>).packages.minato =
      id(714);
  }).toThrow(TypeError);
});

test("deprecated custom config registration snapshots nested targets", async () => {
  const config = {
    network: "testnet",
    chainIdentifier: "custom-config-chain",
    misoPackageId: MISO,
    recordSales: {
      status: "available",
      recordPackageId: RECORD,
      recordShopPackageId: SHOP,
    },
    operations: structuredClone(OPERATIONS),
  } as Mutable<MisoPlatformConfig>;
  const expectedOperations = structuredClone(OPERATIONS);
  const base = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  });
  Object.defineProperty(base.core, "getChainIdentifier", {
    configurable: true,
    value: async () => ({ chainIdentifier: "custom-config-chain" }),
  });
  const client = base.$extend(misoPlatform(config));

  expect(Object.isFrozen(config)).toBeFalse();
  expect(Object.isFrozen(config.operations)).toBeFalse();
  config.chainIdentifier = "mutated-before-ready";
  if (config.recordSales?.status !== "available") throw new Error("test fixture");
  config.recordSales.recordPackageId = id(801);
  if (config.operations?.status !== "available") throw new Error("test fixture");
  config.operations.actions.partyWallet = id(802);
  await client.misoPlatform.ready();

  expect(client.misoPlatform.recordPackageId).toBe(RECORD);
  const tx = new Transaction();
  tx.add(
    client.misoPlatform.call.partyWallet!.inboxAddress({
      arguments: [tx.object(A)],
    }),
  );
  expect(moveCalls(tx)[0]?.package).toBe(
    expectedOperations.actions.partyWallet,
  );

  config.recordSales.recordPackageId = id(803);
  config.operations.actions.partyWallet = id(804);
  expect(client.misoPlatform.recordPackageId).toBe(RECORD);
  const after = new Transaction();
  after.add(
    client.misoPlatform.call.partyWallet!.inboxAddress({
      arguments: [after.object(A)],
    }),
  );
  expect(moveCalls(after)[0]?.package).toBe(
    expectedOperations.actions.partyWallet,
  );
});

test("bare platform config without finalized package identities fails sales closed", () => {
  const client = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  }).$extend(misoPlatform({}));
  expect(client.misoPlatform.protocol).toBeUndefined();
  expect(() => client.misoPlatform.ids.pressing(A, 1)).toThrow(
    /without Record and Record Shop/,
  );
});

test("deployment/network selection remains fail closed", () => {
  expect(getMisoPlatformDeployment("testnet")).toBe(
    MISO_PLATFORM_DEPLOYMENTS.testnet,
  );
  expect(() => getMisoPlatformDeployment("mainnet")).toThrow(/no bundled/);
  expect(networkFrom(undefined)).toBe("testnet");
  expect(networkFrom("mainnet")).toBe("mainnet");
  expect(() => networkFrom("tesnet")).toThrow(/unsupported network/);
});

test("explicit deployment registration rejects a mismatched client network synchronously", () => {
  const client = new SuiGrpcClient({
    network: "mainnet",
    baseUrl: "https://fullnode.mainnet.sui.io:443",
  });
  expect(() => client.$extend(miso({ deployment: DEPLOYMENT }))).toThrow(
    MisoNetworkMismatchError,
  );
});

test("ready memoizes exact-chain validation and gates synchronous builders", async () => {
  const base = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  });
  let calls = 0;
  Object.defineProperty(base.core, "getChainIdentifier", {
    configurable: true,
    value: async () => {
      calls += 1;
      return { chainIdentifier: DEPLOYMENT.chainIdentifier };
    },
  });
  const client = base.$extend(miso({ deployment: DEPLOYMENT }));
  expect(() =>
    client.miso.tx.purchaseRecord({
      releaseId: A,
      edition: 1,
      currencyType: "0x2::sui::SUI",
      paymentAmount: 1,
      expectedPricing: { kind: "fixed", amount: 1 },
      recipient: A,
    }),
  ).toThrow(MisoClientNotReadyError);
  expect(() =>
    client.miso.call.record!.deriveAddress({
      arguments: [A, 1],
    }),
  ).toThrow(MisoClientNotReadyError);

  const first = client.miso.ready();
  const second = client.miso.ready();
  expect(first).toBe(second);
  await Promise.all([first, second]);
  expect(calls).toBe(1);
  expect(await client.miso.validateChainIdentifier()).toBe(
    DEPLOYMENT.chainIdentifier,
  );
  expect(calls).toBe(1);
});

test("protocol and nested Party surfaces cannot read or build before readiness", async () => {
  const base = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  });
  let chainReads = 0;
  let objectReads = 0;
  Object.defineProperty(base.core, "getChainIdentifier", {
    configurable: true,
    value: async () => {
      chainReads += 1;
      return { chainIdentifier: DEPLOYMENT.chainIdentifier };
    },
  });
  Object.defineProperty(base.core, "getObject", {
    configurable: true,
    value: async () => {
      objectReads += 1;
      return { object: { content: undefined } };
    },
  });
  const client = base.$extend(miso({ deployment: DEPLOYMENT }));
  const tx = new Transaction();

  expect(() => client.miso.protocol!.getReleaseById(A)).toThrow(
    MisoClientNotReadyError,
  );
  expect(() => client.miso.protocol!.party.getPartyById(A)).toThrow(
    MisoClientNotReadyError,
  );
  expect(() =>
    tx.add(
      client.miso.protocol!.call.release.releaseRegistryId({
        arguments: [A],
      }),
    ),
  ).toThrow(MisoClientNotReadyError);
  expect(() =>
    tx.add(
      client.miso.protocol!.packages.call.core.release.releaseRegistryId({
        arguments: [A],
      }),
    ),
  ).toThrow(MisoClientNotReadyError);
  expect(() =>
    tx.add(client.miso.protocol!.party.call.party.newIndividualKind({})),
  ).toThrow(MisoClientNotReadyError);
  expect(tx.getData().commands).toHaveLength(0);
  expect(tx.getData().inputs).toHaveLength(0);
  expect(objectReads).toBe(0);
  expect(chainReads).toBe(0);

  await Promise.all([client.miso.ready(), client.miso.ready()]);
  expect(chainReads).toBe(1);
  tx.add(
    client.miso.protocol!.call.release.releaseRegistryId({ arguments: [A] }),
  );
  tx.add(
    client.miso.protocol!.packages.call.core.release.releaseRegistryId({
      arguments: [A],
    }),
  );
  tx.add(client.miso.protocol!.party.call.party.newIndividualKind({}));
  expect(moveCalls(tx).map((call) => call.package)).toEqual([
    MISO,
    MISO,
    NETWORK_DEPLOYMENT.misoParty,
  ]);

  await expect(client.miso.protocol!.getReleaseById(A)).rejects.toThrow(
    /Release not found/,
  );
  await expect(client.miso.protocol!.party.getPartyById(A)).rejects.toThrow(
    /Party not found/,
  );
  expect(objectReads).toBe(2);
  await client.miso.ready();
  expect(chainReads).toBe(1);
});

test("deprecated misoPlatform protocol access uses the same explicit readiness gate", async () => {
  const base = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  });
  let chainReads = 0;
  Object.defineProperty(base.core, "getChainIdentifier", {
    configurable: true,
    value: async () => {
      chainReads += 1;
      return { chainIdentifier: DEPLOYMENT.chainIdentifier };
    },
  });
  const client = base.$extend(
    misoPlatform({
      network: "testnet",
      chainIdentifier: DEPLOYMENT.chainIdentifier,
      misoPackageId: MISO,
    }),
  );
  expect(() => client.misoPlatform.protocol).toThrow(MisoClientNotReadyError);
  expect(chainReads).toBe(0);
  await client.misoPlatform.ready();
  expect(client.misoPlatform.protocol?.deployment.packageId).toBe(MISO);
  expect(chainReads).toBe(1);
});

test("high-level online reads await readiness automatically", async () => {
  const base = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  });
  let chainReads = 0;
  Object.defineProperty(base.core, "getChainIdentifier", {
    configurable: true,
    value: async () => {
      chainReads += 1;
      return { chainIdentifier: DEPLOYMENT.chainIdentifier };
    },
  });
  Object.defineProperty(base.core, "getObject", {
    configurable: true,
    value: async () => ({ object: null }),
  });
  const client = base.$extend(miso({ deployment: DEPLOYMENT }));
  expect(await client.miso.getRecord(A)).toBeNull();
  expect(chainReads).toBe(1);
});

test("ready rejects a mismatched exact chain identifier", async () => {
  const base = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  });
  Object.defineProperty(base.core, "getChainIdentifier", {
    configurable: true,
    value: async () => ({ chainIdentifier: "wrong-ledger" }),
  });
  const client = base.$extend(miso({ deployment: DEPLOYMENT }));
  await expect(client.miso.ready()).rejects.toBeInstanceOf(
    MisoChainIdentifierMismatchError,
  );
  let executions = 0;
  const executor = {
    executeTransaction: async () => {
      executions += 1;
      throw new Error("must not execute");
    },
  } as unknown as ParallelTransactionExecutor;
  await expect(
    client.miso.executeViaExecutor(executor, () => {}),
  ).rejects.toBeInstanceOf(MisoChainIdentifierMismatchError);
  expect(executions).toBe(0);
});

test("available operations reject invalid, partial, or aliased identities", () => {
  expect(requireOperationsDeployment(OPERATIONS)).toBe(OPERATIONS);

  const invalid = {
    ...OPERATIONS,
    actions: { ...OPERATIONS.actions, partyWallet: "0x12" },
  } as OperationsDeployment;
  const duplicate = {
    ...OPERATIONS,
    plugins: {
      ...OPERATIONS.plugins,
      releaseRevenueDistributor: OPERATIONS.actions.releaseRevenueDistributor,
    },
  } as OperationsDeployment;
  const partial = {
    status: "available",
    vault: OPERATIONS.vault,
    actions: OPERATIONS.actions,
    plugins: {
      compositionRoyaltyPool: OPERATIONS.plugins.compositionRoyaltyPool,
    },
  } as unknown as OperationsDeployment;

  for (const deployment of [invalid, duplicate, partial]) {
    expect(() => requireOperationsDeployment(deployment)).toThrow(
      OperationsUnavailableError,
    );
  }
});

test("unavailable legacy IDs never become current operations ABIs", () => {
  const legacy = {
    status: "unavailable",
    reason: "legacy combined packages",
    legacy: {
      vaultPackageId: OPERATIONS.vault.packageId,
      vaultRegistryId: OPERATIONS.vault.registryId,
      packageIds: {
        compositionRoyaltyPool: OPERATIONS.actions.compositionRoyaltyPool,
      },
    },
  } as const satisfies OperationsDeployment;
  expect(() => requireOperationsDeployment(legacy)).toThrow(
    OperationsUnavailableError,
  );
});

test("the Vault registry cannot alias any operations package identity", () => {
  const aliased = {
    ...OPERATIONS,
    vault: {
      ...OPERATIONS.vault,
      registryId: OPERATIONS.actions.partyWallet,
    },
  } as OperationsDeployment;
  expect(() => requireOperationsDeployment(aliased)).toThrow(
    OperationsUnavailableError,
  );
});

test("available Record sales require distinct canonical package IDs", () => {
  const available = (recordPackageId: string, recordShopPackageId: string) => ({
    status: "available" as const,
    recordPackageId,
    recordShopPackageId,
  });

  expect(requireRecordSalesDeployment(available(RECORD, SHOP))).toEqual(
    available(RECORD, SHOP),
  );
  for (const deployment of [
    available("0x12", SHOP),
    available(`0x${"AB".repeat(32)}`, SHOP),
    available(`0x${"gg".repeat(32)}`, SHOP),
    available(RECORD, RECORD),
  ]) {
    expect(() => requireRecordSalesDeployment(deployment)).toThrow(
      RecordSalesUnavailableError,
    );
  }
});
