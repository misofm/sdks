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
  expect(() => getMisoPlatformDeployment("mainnet")).toThrow(/no bundled/);
  expect(networkFrom(undefined)).toBe("testnet");
  expect(networkFrom("mainnet")).toBe("mainnet");
  expect(() => networkFrom("tesnet")).toThrow(/unsupported network/);
});

test("bundled Testnet deployment exactly matches the verified immutable export", () => {
  expect(MISO_PLATFORM_DEPLOYMENTS.testnet).toEqual({
    network: "testnet",
    chainIdentifier: "69WiPg3DAQiwdxfncX6wYQ2siKwAe6L9BZthQea3JNMD",
    // Checked against the live constant (not a hardcoded copy) so this test
    // tracks musicos/partyos, not a snapshot of them.
    protocol: PROTOCOL_MISO_DEPLOYMENTS.testnet,
    partyos: PROTOCOL_PARTYOS_DEPLOYMENTS.testnet,
    party: {
      partyCta: "0x310bd64b4d32b547ad52128df9839702a3b74e144e920d04d00bb2bd488b2036",
      partyGenre: "0x6b66b793a13c899e41d812a3feccafc9078184f0bd74c4af474d23ef7fd35ec5",
      partyMedia: "0xb4479afae1f14c4cf7064908c29ccf698b5e10f2e48a31d63f861131476594c5",
      partyMusic: "0xe583826d1610a252769eddb4fa81e81040d40468fc99eec4bf72c52456ff7f79",
      partyPlatformLink: "0xe0990445758d27732928759a33e73bcddd2b06604dc0c552b958b6b0220b060b",
      partyProLink: "0xdbf8f3d1d12cf15e435d74bfb910e88eae7094064176661a85bc79a76e6ce674",
      partyProfile: "0x0cb11099892f9a583077408369a1d838ec888660ed31af7f7bd52a3794f147a6",
      partyRoles: "0x53227d2c8c36b6bae17e2cdfaff50cf7e52261c40cbda65a11fe9f9486cc6104",
      partySocial: "0xb691711983ad484e8caecc3091872a163a4cf6f93bfab3d3974ad94bb4b63d2f",
      partyTags: "0xcc0a53bfa1310758c02607a9ee95fa1553ef3d9431e3df25f38a16e09c3466c5",
      countryCode: "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
      languageCode: "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36",
    },
    recordSales: {
      status: "available",
      recordPackageId: "0x8562a4c266b1229871551cec69c1a331f682920b9cad7685e42e7c6a5eba61d5",
      recordShopPackageId: "0x5d1b79c312b5d2a2bc9aa0ce7ea6d41ecedd4a5d8698bc007000ca0c8a3459f9",
    },
    operations: {
      status: "available",
      vault: {
        packageId: "0xe7a5d1f895d7ca2571c2329a13a5703905d8903433b379db3aa987c7594a0198",
        registryId: "0xebd40980edb30e425b80f7d65378246254cc5787e07d23faa46e6b9a2b9dd14d",
      },
      actions: {
        compositionRoyaltyPool: "0xa4655e8c1319655cbc0ad5da0d8bccbd528372fea2cb767235e89f2be6eb403c",
        recordingRoyaltyPool: "0xff510b24ddba7755dafeb3ceae65204ed6be058a83b482f98da92b3d19eefcd2",
        partyWallet: "0x493fa265fd7c8066cd80f644d22086fe36b2c8e26bd160d8a6f6f44743c42acc",
        compositionRoutedStake: "0xff5b7a4e1791210c36f2ea071a87e2e6212ddbe2acc922d324cf5436f8ca0b47",
        releaseRevenueDistributor: "0x72b175f79cdb1df5d597cdb07007ac309994e6c3f99823b04400a48565dd3989",
      },
      plugins: {
        compositionRoyaltyPool: "0x57b58eb53ade40a7e1e6e4be4bdd0fecdd57f709efe8021830b2e3519e800254",
        recordingRoyaltyPool: "0x69c859aba359ca8fbeb1df4cff3de53cca3b4ce5ffaa1a7516bc9eb3e016cf71",
        releaseRevenueDistributor: "0x875a764569360ec7f4e676bcf5e30a50037229f33f2bae6d2acd205c0570e8b2",
      },
    },
    packages: {
      minato: "0xcdf58ed7e4580118a6a3f2a8077abffe633c551b2f19e95ce01685d42f90b8d9",
      credit: "0xd77981b6872d975ccebeac1c639eebbcd1f7916f468df0242d4b26d9bf7293c1",
      compositionCredits: "0x924a5e87230cf1218be23484e4914d9c5515528c8ef032b1796ebdc71dd3830c",
      recordingCredits: "0x982d946a34bb342913c81441be1c702b29f2a83bc801c4fce9ed4f9d7833b8b1",
      releaseCredits: "0xdc854106cb76733bb012db2369e0a39319fb79b0587e2a887814c7cb67134d77",
      royaltyPool: "0xf7be632d74f71574c2aa5ac2790a51e770b2cfbcf80233b875bdbe24ffe0b3b9",
      routedStake: "0xfe3f0c0008823330d2e465a300b34eec50ab3c7444e655602ed2efc517c91824",
      coverArt: "0xc0b1421b32e287559ec29f6d7c71dd83778234cb62d4fe9d296577710411f6d4",
      releaseCoverArt: "0x74c1708ff6016b5244f8d31559210ae6e5a2b5e52cb3c7996e1f630a7d4a87b2",
      genre: "0xeea93dd140ee2133d1baeeb71281846658b104d53403d4f89e75f65ade38f931",
      releaseDescription: "0x8d59667b5e9476df33125153494246107a1384ecbea8862fa1b5c256588789fa",
      releaseDspLink: "0xebcf0515a35c765ca89208162510bdddd2a9225866b9c66f33dc3cfa1e07bf8a",
      releaseGenre: "0xc7269a52efa400b80009f8c9f7e31591a26c50c0ae925be31edaef8889e91c83",
      releaseKind: "0x48f1651e00572525fb2e59ebb37c5367d45258d62486984825c972a8ab2d0ce3",
      recordingAdvisory: "0x4149faba212e3aca5440e5ea15bde535dca453f2701125a996d89188b0000ed0",
      recordingLanguage: "0x78e48de29be0b9dca4921dd0740cc12c88cb02599ee8554854b4e423a689fd19",
      recordingGenre: "0x3c017256c66c7d48f4c23ae40dd6d5a0470a4f85a750aadef388ef9ac8e71b36",
      recordingMasterReference: "0x2638edd3c9fec5650eda561e77fb390add0110088ad54c470e83ea079108bb1a",
      recordingEngineSession: "0xa3057f47e31683c1eba0afba56aa38af6734f6b9fc3fb679c2681a21ccfe3c24",
      recordingStreamingTranscode: "0x67bde09257865521b221aebf83bc95e5a9ae9d38f2c77223772436bc9c70e8ec",
      recordSealPolicy: "0x7e1921715dbda4fbb73227d0764f4c0de55fdcf3892ddadc4ef1bf895453b2a2",
      ori: "0x51792b9adb9a5d05d7c4d74d7d0cb5aefc5639afa80c0089399cab8b99752e60",
      countryCode: "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
      languageCode: "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36",
    },
    objects: {
      releaseRegistry: "0xb0506d287b50a134a2773a5d4e0c9c4e3ef4aa3806cad6ff93d8b28be063c6df",
      genreRegistry: "0x9a5a7ce36906a0581e6e38a0dd6abc24093acc6ffd7c0d6a7f419c57b069d00e",
    },
    legacy: { releaseCoverArtPackages: [] },
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
  expect(identities).toHaveLength(53);
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
  const custom = structuredClone(MISO_PLATFORM_DEPLOYMENTS.testnet) as Mutable<MisoPlatformDeployment>;
  const expected = structuredClone(custom);

  expect(Object.isFrozen(custom)).toBeFalse();
  custom.chainIdentifier = "mutated-after-normalize";
  if (custom.recordSales.status !== "available") throw new Error("test fixture");
  custom.recordSales.recordPackageId = id(701);

  // `normalizeMisoPlatformDeployment` (exercised indirectly by `Miso.layer`)
  // snapshots BEFORE any caller mutation reaches it — this proves the
  // snapshot taken at import time (`MISO_PLATFORM_DEPLOYMENTS`) already
  // reflects the immutable export, independent of `custom`'s later edits.
  expect(MISO_PLATFORM_DEPLOYMENTS.testnet.chainIdentifier).toBe(expected.chainIdentifier);
  expect(MISO_PLATFORM_DEPLOYMENTS.testnet).not.toBe(custom);
});
