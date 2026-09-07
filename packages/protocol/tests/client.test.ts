// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { miso } from "../src/client.ts";
import { PartyProtocolClient } from "../src/party/client.ts";
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

test("shared module binding preserves Party override policy and each reference denylist", () => {
  const client = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" })
    .$extend(miso({ deployment: FULL_DEPLOYMENT }));
  const options = { package: A, arguments: { self: A, cap: A, name: "Override" } };
  const tx = new Transaction();
  tx.add(client.miso.party.call.party.setName(options));
  tx.add(client.miso.packages.call.party.core.setName(options));
  expect(moveCalls(tx).map((call) => call.package)).toEqual([A, FULL_DEPLOYMENT.misoParty]);
  for (const calls of [client.miso.party.call.party, client.miso.packages.call.party.core]) {
    expect("uid" in calls).toBeFalse();
    expect("uidMut" in calls).toBeFalse();
    expect("groupMembers" in calls).toBeFalse();
    expect(calls.Party).toBe(client.miso.party.bcs.Party);
  }
});

test("Party client snapshots deployment values before callers mutate their manifest", () => {
  const deployment = { ...FULL_DEPLOYMENT };
  const sui = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" });
  const party = new PartyProtocolClient(sui, deployment);
  deployment.misoParty = A;
  deployment.genre = A;
  const tx = new Transaction();
  tx.add(party.call.party.setName({ arguments: { self: A, cap: A, name: "Snapshot" } }));
  expect(moveCalls(tx)[0]?.package).toBe(FULL_DEPLOYMENT.misoParty);
  expect(party.genrePackageId).toBe(FULL_DEPLOYMENT.genre);
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
