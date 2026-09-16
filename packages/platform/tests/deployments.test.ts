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
    network: "testnet",
    chainIdentifier: "69WiPg3DAQiwdxfncX6wYQ2siKwAe6L9BZthQea3JNMD",
    // Checked against the live constant (not a hardcoded copy) so this test
    // tracks musicos/partyos, not a snapshot of them.
    protocol: PROTOCOL_MISO_DEPLOYMENTS.testnet,
    partyos: PROTOCOL_PARTYOS_DEPLOYMENTS.testnet,
    party: {
      partyCta: "0x5a8d375265c811aff63ed1b1213b308f71a50094de15e9b70e012e8a8d91929f",
      partyGenre: "0xe4fb7e3591fceba8c04775fd6509d99d7bf82e964f747a9bd6e8f97e5202fbd6",
      partyMedia: "0x250599884202c32a5878f8535c5856d49aa61cb95ef46a1b044c3857d548bc3f",
      partyMusic: "0x43d4cccfc1b85eb37066b6fa4672a2237b252f84bd6a57a4bbe33b3cbd989fd0",
      partyPlatformLink: "0x74f671feaa8304eec8181c9aacc9f18d23b45bd1862ad57a7b1cb66257501a27",
      partyProLink: "0x05099a977bdff9339e436735f94a6cebba75512c67f2f0eadaed76f91c5d85d8",
      partyProfile: "0xd3c64dde8ec97046ae81985f135ace83bf8920e804e21172581fba81255db9e3",
      partyRoles: "0xe1673aee8206c97887820fe26a58883531838f4edd928500a1b841f9f6d1e4f1",
      partySocial: "0xb2891df368c7508100013d2125d4c202fa3ddcae93c23bc1445ba5c9a52e9415",
      partyTags: "0xa65ca58a766eb49b0120fefcf03c2aecf3c179621b40929cb79f3ca3a4d68eca",
      countryCode: "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
      languageCode: "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36",
    },
    recordSales: {
      status: "unavailable",
      reason: "the published Record sales packages use the previous optional-cap ABI; publish and verify the mandatory-cap packages before enabling writes or current-schema reads",
      legacy: {
        recordPackageId: "0x39144c9cd87f1cedb33cfeee041db853548d3b1697b82fb429d289b47b42cfa3",
        recordShopPackageId: "0xbaeb00b56f6294d4bc81690f1b1ddcdf43439dad9342040c9c9bd1dc3c6f55ca",
      },
    },
    operations: {
      status: "unavailable",
      reason: "the published Vault uses the previous custody layout and API; publish and verify the renamed Vault and dependent plugins before enabling operations or current-schema reads",
      legacy: {
        vaultPackageId: "0xd4343e031e0b81de18e0227e437b3a186fbb5632ee3b77220409db7740a7db95",
        vaultRegistryId: "0xc188228aac4915834e36874842d3baaaab7a570925ef068f3f24211633422b51",
        packageIds: {
          compositionRoyaltyPoolAction: "0x142af88648b6d24948014b0faed6b1220eb87a633e4a8b3a0034780775d9615b",
          recordingRoyaltyPoolAction: "0x544efe4646ef55c9bcd5378e56909fba4d3933306e227a4b6d8685e3a5ae73a7",
          partyWalletAction: "0x507045549941be7517e21678ab2932c21355a787ffc634a690d5f984be8c3a3a",
          compositionRoutedStakeAction: "0x10785cc55af8a7b2bb6fd3864b2278129cfa40cef623da7b318019e4ea32a2ab",
          releaseRevenueDistributorAction: "0xe83039e607d109ad9aa0030e357cfe2025d949de04c4147c479cc4e7056c37d4",
          compositionRoyaltyPoolPlugin: "0x569b306d2aac2f927e2d0ce39704b533b1b053aa1b95e1d432ce545c1cfc4760",
          recordingRoyaltyPoolPlugin: "0x27a4354849bdb4049838d836b0e82d8ec9f183c583eebea97b0f67593ca02195",
          releaseRevenueDistributorPlugin: "0x4ef01180df90882411ea74575086e51f1957aeda97e4f81e22055d23c98ca5bf",
        },
      },
    },
    packages: {
      recordingMaster: "0xa42ff0bc709c7ee69847ba6ee6a2f9084b8763f271f53bf63f100abc6dfd1300",
      recordingMasterAudio: "0x5b5fd443fc953bae224d995fcfefdd8c15aeff866323dbe49e43df8243c8e074",
      audio: "0xdc7d00d565b6157acaecbbe07b1d95b66a9247bde400bd520e17810eb464993a",
      minato: "0xcdf58ed7e4580118a6a3f2a8077abffe633c551b2f19e95ce01685d42f90b8d9",
      credit: "0x5a283f1289c31cf5f4aa2ac998cceeac819ce8aad22d8a75786444b060c56acd",
      compositionCredits: "0xbb5d04fe7f81d6b01099716d312aba34ba9817875bc95494bcf0a4c819d7cc94",
      recordingCredits: "0x26eecf81819248d6ebefc6c7d3dc959a7039881f605a245e7fdae4d0ed2cc8b9",
      releaseCredits: "0xbd84fae836fe3dc519f3ba9ee239cbb474f37b2b1599131a8ae4f0749788fefb",
      royaltyPool: "0x4871a97fa5336978bf8a08139f1bc9edfed9f5c83e1ec9a2eee437b19072874f",
      routedStake: "0x1f196e1e3a028b4d351aa0590c57db39c52846c30552fb4a0740cf2e71d14729",
      coverArt: "0xf27b9cca73518cadfe436616ffaea2722154f317dad5484a9d0e94a4d4e1802c",
      releaseCoverArt: "0x96d092f74cb9742848926529529a214b6dcede046ac2a22e52d1825a04a2784b",
      genre: "0xd457e0b7e042295231e0ae98634579dd148b78850b208d3730c7c400dcc0f6d8",
      releaseDescription: "0x8d5a75afeca744a6b30a12cacc6bf483bb9d931d3f86a0095e1401299c0392f7",
      releaseDspLink: "0xd557ef0b169d6262720a58570e6721a80528d914b926a9b1ba5d074c946ea950",
      releaseGenre: "0x34b74ee1f9b6f80cc4d96e5dafd5a55fa2c1feaf23366094d9f943d1f682c0c9",
      releaseKind: "0x2d7fdb6bedc67a9ca5351de00cb600b8aae4a2171dcbf6988fbbe47c6e0672b9",
      recordingAdvisory: "0x5f06d603fc2067f8ebe3d98d25c0dab7acbf84f41b01dada1c9f5bd6254dc344",
      recordingLanguage: "0xd01d9fcfdde98d0aada3fa8fa237d6a753176d9f656590012eb2cb45cee5ec07",
      recordingGenre: "0x6df226240ab9bfb7a828f9aaf5fa7cae32987e0a6f57f50d8030520a1075f30e",
      recordingEngineSession: "0xc1bd01a68b39081267b8b089d74e4e6fddb39637b3b165c8186542a2dd826845",
      recordingStreamingTranscode: "0x04c2dd271e782d5d5e43656e378c78a97d6c75c7d7fa2267f1ac388d2e495afe",
      ori: "0x51792b9adb9a5d05d7c4d74d7d0cb5aefc5639afa80c0089399cab8b99752e60",
      countryCode: "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
      languageCode: "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36",
    },
    objects: {
      releaseRegistry: "0xd94e71bd6f38ae5bf69bdd76940e78ce3ff6679d946b5258845378cf2eb4ad0a",
      genreRegistry: "0x5aa477101309cfc890e0a737917ce7f39afb247827cf027e59ce2e6e9924b6ab",
    },
    legacy: { releaseCoverArtPackages: [] },
  });

  const deployment = MISO_PLATFORM_DEPLOYMENTS.testnet;
  const identities = [
    deployment.chainIdentifier,
    ...Object.values(deployment.protocol),
    ...Object.values(deployment.partyos),
    ...Object.values(deployment.recordSales.legacy),
    deployment.operations.legacy.vaultPackageId,
    deployment.operations.legacy.vaultRegistryId,
    ...Object.values(deployment.operations.legacy.packageIds),
    ...Object.values(deployment.packages),
    ...Object.values(deployment.party),
    ...Object.values(deployment.objects),
  ];
  // `party.countryCode`/`party.languageCode` intentionally repeat
  // `packages.countryCode`/`packages.languageCode` (see
  // assertMisoPlatformDeployment), so this sanity list has duplicates by design.
  expect(identities).toHaveLength(54);
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
  if (custom.recordSales.status !== "unavailable" || !custom.recordSales.legacy) {
    throw new Error("test fixture");
  }
  custom.recordSales.legacy.recordPackageId = id(701);

  // `normalizeMisoPlatformDeployment` (exercised indirectly by `Miso.layer`)
  // snapshots BEFORE any caller mutation reaches it — this proves the
  // snapshot taken at import time (`MISO_PLATFORM_DEPLOYMENTS`) already
  // reflects the immutable export, independent of `custom`'s later edits.
  expect(MISO_PLATFORM_DEPLOYMENTS.testnet.chainIdentifier).toBe(expected.chainIdentifier);
  expect(MISO_PLATFORM_DEPLOYMENTS.testnet).not.toBe(custom);
});
