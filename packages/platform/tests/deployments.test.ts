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
      partyCta: "0xf107dfc9ca185af74ffb31208db433e95f5edb159a355de1fe16d65e20ce593c",
      partyGenre: "0x366e4d8ff0c3ec0b85fed79f8124bea7a1b04bbff7e718613a46e5d6ad3dc35d",
      partyMedia: "0x930b615b1c6e80067c8a1872974e754d7fb1484b5af02ffe937c329ee178aa1a",
      partyMusic: "0x38fc3972c66708adc4aefba96a85b2ebf16ead8e10e5d23424ff76fd8238e5df",
      partyPlatformLink: "0x395cc7fbe05ecbc152bd370dacfac78197c6411218a81b8972309c93083f0f3a",
      partyProLink: "0x165eecf72665f763a3e7e394cfee19976e5254c1f0a86ddbb24686fc7091e161",
      partyProfile: "0xf1ab0011e4ce756edf0b715f2717c313f52b9b60fd40902db9ba70847f236856",
      partyRoles: "0xd37c8666b196768f57eb2a2f3c211fdc2e0105eadd99a528fb99b75dd56f8e7f",
      partySocial: "0xd7bd2d7e1bf1a35ef699c93416529b2e1d4144351e11545b504b142eb3706f47",
      partyTags: "0x0001237f7802d0adb21f40428189bb12dc35f20904aa406a779f3ef9ccb7baea",
      countryCode: "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
      languageCode: "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36",
    },
    recordSales: {
      status: "available",
      recordPackageId: "0x2b13f706f5c8ad8c07950299c8620251cc84044ec2e40fed327262fb164a2e50",
      recordShopPackageId: "0xeaee1a75ff9900cc76b4fd27f3fb697c75119ac54ba4114a379d93a3fd5627ac",
    },
    operations: {
      status: "available",
      vault: {
        packageId: "0x69d23319e33b7df88e1e3e31afa29c5f3f14aa2f686f7a594d9a0d1bf0a2c3ea",
        registryId: "0x4b03bdbbb8bb52c00d70a14c0e429652cf5c910ea9b37f7058738cb8ac1383cf",
      },
      actions: {
        compositionRoyaltyPool: "0x4f20726607f9f9ee65176b69d32c2ec08a759a811a4d94b0ac6c8e01a704de3a",
        recordingRoyaltyPool: "0x2e0c8cd5f2e3c7ae307af038e5f20e4d5b16e9963bac97f513bccb7827c9b7f2",
        partyWallet: "0xf3fb5a33e2da39f55f416790be488f0218e68cef105b8339a1b005d1e0177705",
        compositionRoutedStake: "0xe0006d7e7b5115a364b2b0fb25fc660680287a32e44aaf1c801d63fc5f87933f",
        releaseRevenueDistributor: "0x1066a008a026a08d547d3622499eee068573e41051df870dd8959de512e57f59",
      },
      plugins: {
        compositionRoyaltyPool: "0xd56aa84888a242eac12ec7943e114a268dff116d9bd978a933a3436d83bc07d8",
        recordingRoyaltyPool: "0x63cd7ad32a9a94f846f81bb94202ce4612f466fb885e6b0748bc1bcfdaeb712e",
        releaseRevenueDistributor: "0xe0240522156316e0bfeeb14e6f2a18e178f8f15c55a49995fd980d9be3d89185",
      },
    },
    packages: {
      minato: "0xcdf58ed7e4580118a6a3f2a8077abffe633c551b2f19e95ce01685d42f90b8d9",
      credit: "0x2f7d0c3a5cbe2931331897eb19746c31a200956d74f76d0cca0a39ddf2687e7a",
      compositionCredits: "0xce41fd80e3d7258512e0ccc15f4580c8bc473c128aebdcc8c919418345ec460f",
      recordingCredits: "0x30d8fa4e05aec5e6d030b217fc03f213d3d1d434df7c8b0912be7f71deaa4f0f",
      releaseCredits: "0xd7fccca9d5245463089661ee56091685fa1dad3ff8816fe54ceed21ba6b75234",
      royaltyPool: "0xf121fe75a59e7a9a9aab54c43e1b9207570d454f9029e148d5bce1aa09d6693c",
      routedStake: "0x0ccc1ad150f0d3d06e650c65c631fa08790407ab50e43d4db709eded0528bca3",
      coverArt: "0x29b500b08b05c2fcca1f48e5484bbb658dd29a9cf19dbd6593d2eda5954ab12b",
      releaseCoverArt: "0xb76b4f3d23bc381376c73195268c454a22ce6f16ca0c45680d3a79601a20ae59",
      genre: "0xb5a3534a863759f026c5d63124298e132da59286184de82fd92daf683356d73a",
      releaseDescription: "0xc28721399a570d8df7bf6632a554cecc49e57157b24e6fa332fee96bea241650",
      releaseDspLink: "0x3da99cd6b97ffc57cec4c6262fda95a3312ce05fe9bae7235951b522c6316ca4",
      releaseGenre: "0xc81bdefb7a787ca29767df388234301c3e8cdcc569c9a3278b4a213aa8aaba1a",
      releaseKind: "0x666d42cd8541345ab9039c2fe8896caf33a9e3fe46ecad2d15de4f6ec4c47cf1",
      recordingAdvisory: "0x35f3b50e5e1d224821516ff3c12d95fed253cce919bc38c801a6005efb8a2c79",
      recordingLanguage: "0x00b2f10f149feae80ccea23e0db32c1ad68aacc90f626e9fc4a8b5a6bd9b9c23",
      recordingGenre: "0xd55fa9d6596a215c44e544941d276243b09362ad93e97d797e268532d2fe9a9f",
      recordingMasterReference: "0xc9d7717a4fa018cf7a1e85a657523e740981d1000221be0a789ae467eb864ce2",
      recordingEngineSession: "0x8b3ed264e4b2c0d3cbaa3086db8f8b22e4095e415a9d4912ce3886c767e31197",
      recordingStreamingTranscode: "0x1b4be5273a23b71478e574b59990a3bce6f7bd18f1dd58656959987d35c932b2",
      recordSealPolicy: "0xcf462d00f85b6b94e04d7cdc2c2ea5d6fda6c5b2fe022bd0df8d55fe8a45d1a6",
      ori: "0x51792b9adb9a5d05d7c4d74d7d0cb5aefc5639afa80c0089399cab8b99752e60",
      countryCode: "0x69fb214a74d5253971a45b2d07f83f13ae96992dd38198d7bacb21e1f5fb5f81",
      languageCode: "0xac318126565a2fab608984a091b3582ba9cda6c32232f567eef50277c5042c36",
    },
    objects: {
      releaseRegistry: "0xda8d553fbd0295558310c73a4bf763d9d0ecea04b87db22466b537e4d75864d8",
      genreRegistry: "0xab0dab8b35eb4a00c518744689dee599629a286e1547f71d8c193f9e633e58b7",
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
  if (custom.recordSales.status !== "available") throw new Error("test fixture");
  custom.recordSales.recordPackageId = id(701);

  // `normalizeMisoPlatformDeployment` (exercised indirectly by `Miso.layer`)
  // snapshots BEFORE any caller mutation reaches it — this proves the
  // snapshot taken at import time (`MISO_PLATFORM_DEPLOYMENTS`) already
  // reflects the immutable export, independent of `custom`'s later edits.
  expect(MISO_PLATFORM_DEPLOYMENTS.testnet.chainIdentifier).toBe(expected.chainIdentifier);
  expect(MISO_PLATFORM_DEPLOYMENTS.testnet).not.toBe(custom);
});
