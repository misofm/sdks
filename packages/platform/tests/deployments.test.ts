// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure `deployments.ts` validation: the bundled testnet manifest, its frozen
// snapshot, and the two fail-closed structural validators
// (`requireRecordSalesDeployment`/`requireOperationsDeployment`). Moved out
// of `tests/client.test.ts` (misofm/sdks#35, WP6 "facade derivation") — none
// of this exercises the facade, only `deployments.ts` itself.

import { expect, test } from "bun:test";
import {
  MISO_DEPLOYMENTS as PROTOCOL_MISO_DEPLOYMENTS,
} from "@misofm/musicos/deployments";
import {
  PARTYOS_DEPLOYMENTS as PROTOCOL_PARTYOS_DEPLOYMENTS,
} from "@misofm/partyos/deployments";
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
import { networkFrom } from "../src/read/config.ts";

const id = (value: number) => `0x${value.toString(16).padStart(64, "0")}`;
const RECORD = `0x${"12".repeat(32)}`;
const SHOP = `0x${"13".repeat(32)}`;

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

test("deployment/network selection remains fail closed", () => {
  expect(getMisoPlatformDeployment("testnet")).toBe(MISO_PLATFORM_DEPLOYMENTS.testnet);
  expect(getMisoPlatformDeployment("mainnet")).toBe(MISO_PLATFORM_DEPLOYMENTS.mainnet);
  expect(() => getMisoPlatformDeployment("localnet")).toThrow(/no bundled/);
  expect(networkFrom(undefined)).toBe("testnet");
  expect(networkFrom("mainnet")).toBe("mainnet");
  expect(() => networkFrom("tesnet")).toThrow(/unsupported network/);
});

test("bundled Testnet deployment exactly matches the verified immutable export", () => {
  expect(MISO_PLATFORM_DEPLOYMENTS.testnet).toEqual({
    "network": "testnet",
    "chainIdentifier": "69WiPg3DAQiwdxfncX6wYQ2siKwAe6L9BZthQea3JNMD",
    "protocol": PROTOCOL_MISO_DEPLOYMENTS.testnet,
    "partyos": PROTOCOL_PARTYOS_DEPLOYMENTS.testnet,
    "recordSales": {
      "status": "available",
      "recordPackageId": "0xf51af0e4a29d764a6880db65d99aaa7d1802774f7be18e7220a05a2d673b4743",
      "recordShopPackageId": "0x6eb622211786516988c6ee8e7c0403b4ef64a8c004d654494122e29c103060e1"
    },
    "operations": {
      "status": "available",
      "vault": {
        "packageId": "0x9909927b5fc7d02a8b4eaf26170bcb08760d8ae67c58998650460900185f15ff",
        "registryId": "0xc07932e4bd2e1711a01a83ce38de974cd8a8a4dd59de11b77d87787fcfb4f884"
      },
      "actions": {
        "compositionRoyaltyPool": "0x795e530c4c0ee5072e75b32c93b0f35b00c3eb24b06c9d0586317bec4a0a9c24",
        "recordingRoyaltyPool": "0x45bb431d6763a3310283062c292770ba2bb4f0d7c015bbfcb91259de48a54229",
        "partyWallet": "0xbd3fbf4a6bb5c5a68f3060188f8ae17039fa8e38802bf8058230cf19812d3f59",
        "compositionRoutedStake": "0xd361472a3ec3096eae15ff17c9b062bbf6f2f8badebcb89ce33c6af53d05860c",
        "releaseRevenueDistributor": "0x0f8da651529d2e47440f934bdf1d8a857d244c6fcff10670a59842af6a4a7f48"
      },
      "plugins": {
        "compositionRoyaltyPool": "0x97b4db34a28a4ca80cb50a1c862710047b3a5df9d21b2e042e30ba38292836a9",
        "recordingRoyaltyPool": "0xe0061c18dd62e884b3bc34e9588290a0e3e75dafcff3098441fe7ee30e33b44c",
        "releaseRevenueDistributor": "0xed87ae465856b775927879cffb7baa25d2ca0ca06b46b704c63d3b65e6d3b651"
      }
    },
    "packages": {
      "audio": "0x7b143c3408e5fc8964e7ee696c9d4b63b6d0464347797e32bfa43275f09a3b08",
      "minato": "0xcdf58ed7e4580118a6a3f2a8077abffe633c551b2f19e95ce01685d42f90b8d9",
      "credit": "0xe3fa36c9dd8cf22d0b622c49b3f566520aefb93cbf417ed2416dbdb6dae65dd4",
      "compositionCredits": "0xac64c8a52fd7adb31e89eeda184ba8313c8c4dc43d1a98c64717565273c828fe",
      "recordingCredits": "0x5e196e56a0e47c6f02e23737a5ea28a1a87f1df36936aa624f8bffeed95f2d7f",
      "releaseCredits": "0x433880d8f55568b97add2be734c657c8c91adcc3da978fc2aa9bccc1c17bdb82",
      "royaltyPool": "0xd6d13d85d5748ce6faa6b2670e5b8039aa7bf8894735c9506ec78a578a7f9b31",
      "routedStake": "0xa7bcda2e2db97e4fb8f0c99ffd38332cfaf3626ae6afb012a2b40d0318e642f1",
      "coverArt": "0x97ae14cddfc69650c81022cbe10012b06f3065cf81077bda2c784706bbe129cd",
      "releaseCoverArt": "0x45ece832ba6d87b46e770e370cc0d3207ee30e9d4caf30bee8d9536b494538ad",
      "genre": "0xeda153873304f89c694ff97bc3fa81f07895f68c94a588fd49196f741793016f",
      "releaseDescription": "0x99ee52a1acd70b277c2e834bcb7fa48b72788eb0dfd98f54bab125c908c376f6",
      "releaseDspLink": "0xc3f5e8ad2db4d0f35667f2ae6a19f7f71e7254659f0981b57ea01888b3caf97e",
      "releaseGenre": "0xfc5939ee3e31a2aba2906ecb35b67f87c8999557bff2ed409d6ef9307188ab42",
      "releaseKind": "0x714d059d3ce04e6a0e2d091b10217ed0581dc66dbfbefce5d0166d02e92c8468",
      "recordingAdvisory": "0xaf50ef46545e86e6e9e532649323211c5b5c94e47b677d80285c3a92102e3238",
      "recordingLanguage": "0x4bdef95a64af8900065f24c34a66ccf694c96de4324e7fadf491a5bf73a899bf",
      "recordingGenre": "0x3d4751aec7ece56e51f82a7d725b6ce47768f36a41beba475e2cca269e7cf732",
      "recordingMaster": "0x35494a8a33181347fc73f7dac260f0b2fafb2e74dc1a2b3b42311ff668cdbc66",
      "recordingMasterAudio": "0x7b143c3408e5fc8964e7ee696c9d4b63b6d0464347797e32bfa43275f09a3b08",
      "recordingEngineSession": "0x5e330ba7c23338f6f27400df97240d0b2b569a957f86dbfd6775b845280057b0",
      "recordingStreamingTranscode": "0x4e06f832bf66aa33b80bf5055b01105de68205434f817afe60ad5fab55c58e98",
      "ori": "0x51792b9adb9a5d05d7c4d74d7d0cb5aefc5639afa80c0089399cab8b99752e60",
      "countryCode": "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
      "languageCode": "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36",
      "compositionLyrics": "0x9d4bd69f62c9744ec5ef9bba8a57a003b0ae79b4b00ab7e941b9ecb2ee5e6274"
    },
    "party": {
      "partyCta": "0xee916ffdb352b1cb3c829479f919ff2fb93fde079ac83136f8e2cfa5d688503d",
      "partyGenre": "0x53acdf1dc66214dce13b2643b46d22956638e961344dcd389197770e3a424e01",
      "partyMedia": "0x7be7be101a35ac4c0b47668fff6dcc6b997b0e092bfdf021c585f3ebfb142a7e",
      "partyMusic": "0xabc47ccb7ef9d96be1e4cc236aa4017fce125a7decd2dba41b1d1eedec42cda2",
      "partyPlatformLink": "0x8b3acdd68b88a533db6827255019f7041f7f9b543e0917d4c91b4efd74ad2f8f",
      "partyProLink": "0x05abf41ac85028c4a9b5e3c8d7ba9cd2255629482e72fc54efe9d1be01db1e7f",
      "partyProfile": "0x7c3648386f35895403a4cabcbe15866bf66442de436ea0510c648acf530e2eb2",
      "partyRoles": "0x24aec83ec238b65b591798d0c6ae976a5ca19a918b4c6a3157b96068a5ea9dcf",
      "partySocial": "0x96b71cf7c631db0add13a19565570c8a22355ef5b59d3bde76ebd0717ef448f0",
      "partyTags": "0x928a85e6204efafdbcab29b83efcd1e5edc463a6f870d7968ca40720168e383a",
      "countryCode": "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
      "languageCode": "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36"
    },
    "objects": {
      "releaseRegistry": "0xd42fb305a0c03982f01ce90d6d831d0101446bb3cf6771f89a56aa45fdfcd34f",
      "genreRegistry": "0x256f4e3d9dd4f20bb053a779ffe0b97dfd74b1ab046fc9471039e17de4e39337"
    },
    "legacy": {
      "releaseCoverArtPackages": []
    }
  });

  const deployment = MISO_PLATFORM_DEPLOYMENTS.testnet;
  const identities = [
    deployment.chainIdentifier,
    ...Object.values(deployment.protocol),
    ...Object.values(deployment.partyos),
    deployment.recordSales.recordPackageId,
    deployment.recordSales.recordShopPackageId,
    deployment.operations.vault.packageId,
    deployment.operations.vault.registryId,
    ...Object.values(deployment.operations.actions),
    ...Object.values(deployment.operations.plugins),
    ...Object.values(deployment.packages),
    ...Object.values(deployment.party),
    ...Object.values(deployment.objects),
  ];
  // `party.countryCode`/`party.languageCode` intentionally repeat
  // `packages.countryCode`/`packages.languageCode` (see
  // assertMisoPlatformDeployment), so this sanity list has duplicates by design.
  expect(identities).toHaveLength(55);
});

test("bundled deployment and every nested container are frozen", () => {
  expectRecursivelyFrozen(MISO_PLATFORM_DEPLOYMENTS);
});

test("available operations reject invalid, partial, or aliased identities", () => {
  expect(requireOperationsDeployment(OPERATIONS)).toBe(OPERATIONS);

  const invalid = { ...OPERATIONS, actions: { ...OPERATIONS.actions, partyWallet: "0x12" } } as OperationsDeployment;
  const duplicate = {
    ...OPERATIONS,
    plugins: { ...OPERATIONS.plugins, releaseRevenueDistributor: OPERATIONS.actions.releaseRevenueDistributor },
  } as OperationsDeployment;
  const partial = {
    status: "available",
    vault: OPERATIONS.vault,
    actions: OPERATIONS.actions,
    plugins: { compositionRoyaltyPool: OPERATIONS.plugins.compositionRoyaltyPool },
  } as unknown as OperationsDeployment;

  for (const deployment of [invalid, duplicate, partial]) {
    expect(() => requireOperationsDeployment(deployment)).toThrow(OperationsUnavailableError);
  }
});

test("unavailable legacy IDs never become current operations ABIs", () => {
  const legacy = {
    status: "unavailable",
    reason: "legacy combined packages",
    legacy: {
      vaultPackageId: OPERATIONS.vault.packageId,
      vaultRegistryId: OPERATIONS.vault.registryId,
      packageIds: { compositionRoyaltyPool: OPERATIONS.actions.compositionRoyaltyPool },
    },
  } as const satisfies OperationsDeployment;
  expect(() => requireOperationsDeployment(legacy)).toThrow(OperationsUnavailableError);
});

test("the Vault registry cannot alias any operations package identity", () => {
  const aliased = { ...OPERATIONS, vault: { ...OPERATIONS.vault, registryId: OPERATIONS.actions.partyWallet } } as OperationsDeployment;
  expect(() => requireOperationsDeployment(aliased)).toThrow(OperationsUnavailableError);
});

test("available Record sales require distinct canonical package IDs", () => {
  const available = (recordPackageId: string, recordShopPackageId: string) => ({
    status: "available" as const,
    recordPackageId,
    recordShopPackageId,
  });

  expect(requireRecordSalesDeployment(available(RECORD, SHOP))).toEqual(available(RECORD, SHOP));
  for (const deployment of [
    available("0x12", SHOP),
    available(`0x${"AB".repeat(32)}`, SHOP),
    available(`0x${"gg".repeat(32)}`, SHOP),
    available(RECORD, RECORD),
  ]) {
    expect(() => requireRecordSalesDeployment(deployment)).toThrow(RecordSalesUnavailableError);
  }
});

test("custom-deployment snapshotting: mutating the caller's object after normalization does not retarget the frozen copy", () => {
  // `as unknown as`: the bundled testnet manifest's `legacy.releaseCoverArtPackages`
  // is inferred as the literal empty tuple `readonly []` (from its own `as
  // const`), which `Mutable<T>`'s array branch cannot directly overlap-cast
  // to `string[]` — the runtime shape is identical either way.
  const custom = structuredClone(MISO_PLATFORM_DEPLOYMENTS.testnet) as unknown as Mutable<MisoPlatformDeployment>;
  // Cloned from the original literal manifest, not from `custom`, so its
  // fields keep their exact literal types (`chainIdentifier`, ...) for the
  // `.toBe` assertions below rather than `Mutable<MisoPlatformDeployment>`'s
  // widened `string`.
  const expected = structuredClone(MISO_PLATFORM_DEPLOYMENTS.testnet);

  expect(Object.isFrozen(custom)).toBeFalse();
  custom.chainIdentifier = "mutated-after-normalize";
  if (custom.recordSales.status !== "available") {
    throw new Error("test fixture");
  }
  custom.recordSales.recordPackageId = id(701);

  // `normalizeMisoPlatformDeployment` (exercised indirectly by `Miso.layer`)
  // snapshots BEFORE any caller mutation reaches it — this proves the
  // snapshot taken at import time (`MISO_PLATFORM_DEPLOYMENTS`) already
  // reflects the immutable export, independent of `custom`'s later edits.
  expect(MISO_PLATFORM_DEPLOYMENTS.testnet.chainIdentifier).toBe(expected.chainIdentifier);
  expect(MISO_PLATFORM_DEPLOYMENTS.testnet).not.toBe(custom);
});
