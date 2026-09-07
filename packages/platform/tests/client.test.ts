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
      miso: "0xe5a8e0531b92f3ea1d46604f41ed9e6c1b55a46aed6ac86c5f22c1590f08579b",
      compositionCredits: "0x09434b8b65fb25a703b9c762abbb9075b5bfde6baffc923baac9353ab2191a65",
      recordingAdvisory: "0x8f745dac70fef5327e686b31acbe3f3504dc7eeb63da5f31a4660bb5aea5ee4b",
      recordingCredits: "0x598303437c97ab1ec232be884d041587f18647b71fb36f4cf76cbbcc3c276dd2",
      recordingLanguage: "0xd6b7f206f838018a28d33b77bade2b8476ccafab5fe526345c375d3b47bb892f",
      recordingMasterReference: "0x65309bf315f3e035b0f10c706eb5c327af5038be1637a0cee74f4ae62872f6ce",
      releaseCoverArt: "0xfb1dc55719142fb575c6242f338447fa87bf4618f6903c7a6e30489f4e810fb3",
      releaseCredits: "0xd6e9f090d581779099cc4beaf6c8843f1d569dea85fdde004748c8f03aadafcb",
      releaseDescription: "0x957b633fd186f65f953e17caaeec2e3385431c6f55914cb31dfb775368f89d9e",
      releaseDspLink: "0x7bce4d548314d9cff3145732f19ad7e67b3c00e2cf4d6f295f8af6d02108884e",
      releaseGenre: "0x9770bc7cf9d9b2fa35af194d14f0c36320fbf6541c5ee12b884f0db44d1b5a4f",
      releaseKind: "0x187f6f881623cc843d2c6dc98fe23203598fd3992b6a78c1b5990f3fd60a0f5b",
      royaltyPool: "0xce4a1415255ac043301f3057b1dbd1095ad4959fcbe5bfceb9dbb7cf1144def1",
      routedStake: "0xaa37871d4ba3ce4a465c13c79d1a701941efbf33491633c744ad4b7035f7f894",
      misoParty: "0xd21ad9fa5b79d7b22efb18fa6adc283dfbc2a68ea54104bb1f2630746d1bfd6a",
      partyCta: "0xd2e73bbf2b43a85df1c34acb09a709ce13ffa1741c64fd97a34c34623e65f0e6",
      partyGenre: "0xbb013ec8f590f174c9532fd11d5c6540d9caa53a8407ece46517d4ed678ddffe",
      partyMedia: "0x2a69fdab031a4e8b56b47292b59e589831edf30663e1408a433163a01756f430",
      partyMusic: "0xd3f9a7a98d17ba332cffcb311124dfdb8cb8a970d1261da202a9943a9006148d",
      partyPlatformLink: "0x42983d7b9c8a7f5e32bb529ca0e33913c56b1f1debe0f2d8ed15ddd586f838ae",
      partyProLink: "0x233a163a5bfa9b32caa82bfed52625281e1b0f44dbfea5b34a0d38b918d32db0",
      partyProfile: "0x2ab0ed2b8e29a0c3f6a9bf9ec8ad4ab8f286c29f6f1b6de3f208b0d451fb5510",
      partyRoles: "0xc6be21ffbe6ace09a9029c97ff12d7962cc7cc0411c13c64fb5708f005e1f906",
      partySocial: "0x7302f9e5026445602cab14ea91d55765d19144fb1381023d98d7c542e6f6c80a",
      partyTags: "0x77464ee05b64facc38674a67dfef5310c2d7295dc757d400c4c95d9524b4de0e",
      countryCode: "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
      languageCode: "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36",
      genre: "0x095c412a9e9846b091b8f93d9bd50bca5d98a2e65063cb6c20265dc307c4b319",
    },
    recordSales: {
      status: "available",
      recordPackageId:
        "0xc9411d3e2cb9600081544572036bec049624db1707f9354c342090f440b6e1a2",
      recordShopPackageId:
        "0xc6d49266080b8f165b6c1fc48e1aa4a6d719183d78a8d1043bfe0f2d6c744ed1",
    },
    operations: {
      status: "available",
      vault: {
        packageId:
          "0x77b74e9221874b9e29f6743a277810480bf89d71b5cb71741cd52dfcd83035d2",
        registryId:
          "0x0fcfe3bb47f0ee2fbf0dcb65b48741efd06b4d746f1df14fe6ac3c00e9e35287",
      },
      actions: {
        compositionRoyaltyPool:
          "0x26c574e0aa01f504833b4f01dad44e2cd17b8718630e025d85ce05b843092085",
        recordingRoyaltyPool:
          "0x84b3cc36907112da74c88c78d1ac20e17010a30e206dfa4322a300c87032d405",
        partyWallet:
          "0xa3d6016f2da63b53546e3f9922e8f0c12c27ca532509ef8c0e778f3e7cd56ee6",
        compositionRoutedStake:
          "0x8e32cdb08953afe0b72f46fde2b0fe1ab0ab3c12885c1e41883ccb5d8703e144",
        releaseRevenueDistributor:
          "0x5ab255ed56c601c5d3c79502e81cfd4fd534c166fa731c2275a65d5fd2b34615",
      },
      plugins: {
        compositionRoyaltyPool:
          "0x6969b98c0322a8a7ba2478d900fc88e1c9ba17903c310c7fdb133c0789bd5ba8",
        recordingRoyaltyPool:
          "0x4ac310583eda99e148207f99618ce5d21d7e7680e7c92b58422113b155a97455",
        releaseRevenueDistributor:
          "0xf13e254b32cee1315d9c0af3c4ef6e3bb770c293eee90afe30a009cde30bb381",
      },
    },
    packages: {
      minato: "0xcdf58ed7e4580118a6a3f2a8077abffe633c551b2f19e95ce01685d42f90b8d9",
      credit: "0xb82c6c2524ede481cfa3c1066c70c1e43b1a5f6f11e40d5633153c2c3150bba7",
      compositionCredits: "0x09434b8b65fb25a703b9c762abbb9075b5bfde6baffc923baac9353ab2191a65",
      recordingCredits: "0x598303437c97ab1ec232be884d041587f18647b71fb36f4cf76cbbcc3c276dd2",
      releaseCredits: "0xd6e9f090d581779099cc4beaf6c8843f1d569dea85fdde004748c8f03aadafcb",
      royaltyPool: "0xce4a1415255ac043301f3057b1dbd1095ad4959fcbe5bfceb9dbb7cf1144def1",
      routedStake: "0xaa37871d4ba3ce4a465c13c79d1a701941efbf33491633c744ad4b7035f7f894",
      coverArt: "0x711f7041fc9e12d045b278c07ff9cf5047b69002e91e9dd881ad51c09ec389f6",
      releaseCoverArt: "0xfb1dc55719142fb575c6242f338447fa87bf4618f6903c7a6e30489f4e810fb3",
      genre: "0x095c412a9e9846b091b8f93d9bd50bca5d98a2e65063cb6c20265dc307c4b319",
      releaseDescription: "0x957b633fd186f65f953e17caaeec2e3385431c6f55914cb31dfb775368f89d9e",
      releaseDspLink: "0x7bce4d548314d9cff3145732f19ad7e67b3c00e2cf4d6f295f8af6d02108884e",
      releaseGenre: "0x9770bc7cf9d9b2fa35af194d14f0c36320fbf6541c5ee12b884f0db44d1b5a4f",
      releaseKind: "0x187f6f881623cc843d2c6dc98fe23203598fd3992b6a78c1b5990f3fd60a0f5b",
      recordingAdvisory: "0x8f745dac70fef5327e686b31acbe3f3504dc7eeb63da5f31a4660bb5aea5ee4b",
      recordingLanguage: "0xd6b7f206f838018a28d33b77bade2b8476ccafab5fe526345c375d3b47bb892f",
      recordingMasterReference: "0x65309bf315f3e035b0f10c706eb5c327af5038be1637a0cee74f4ae62872f6ce",
      recordingEngineSession: undefined,
      recordingStreamingTranscode:
        "0x622cd2a9e49ee2639f5c1d922d2fc75e89e810e80da8dd6d4a843bcefa0aacb0",
      recordSealPolicy: "0x2b806033f31ed0af5a9118429111dd5c91f44d9229c41aa9d5cbaec7e3910c0a",
      ori: "0x51792b9adb9a5d05d7c4d74d7d0cb5aefc5639afa80c0089399cab8b99752e60",
    },
    objects: {
      releaseRegistry: "0x40700d8fd9de26392d10c4a3c0759b08f60be43e2f80681650e87a4efdac5cf1",
      genreRegistry: "0x479a1f43c8118b24d10cba62d64ad782c19fad974cdbc5020c909ea943c857a8",
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
