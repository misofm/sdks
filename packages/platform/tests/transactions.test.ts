// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Structural drift gate for the opinionated publish flow: build the
// transaction and assert the generated Move calls are wired with the right
// module/function, type arguments, and argument counts, and that
// borrow-before-share ordering (composition::new → recording::new → publish →
// publish) is preserved now that createComposition/createRecording are
// imported from @misofm/musicos across the package boundary.

import { test, expect } from "bun:test";
import { Transaction } from "@mysten/sui/transactions";
import {
  createShareStakes,
  publishCompositionAndRecording,
  publishRelease,
  publishShareCurrency,
  registerShareStake,
  shareRoyaltyPool,
} from "../src/transactions.ts";

const PKG = "0x" + "cd".repeat(32);
const A = "0x" + "ab".repeat(32);
const REGISTRY = "0x" + "01".repeat(32);
const RECORDING = "0x" + "02".repeat(32);
const RECORDING_CAP = "0x" + "03".repeat(32);

test("share publication consumes its UpgradeCap with make_immutable in the same PTB", () => {
  const tx = new Transaction();
  publishShareCurrency({ modules: ["AA=="], dependencies: [], digest: [] })(tx);
  const commands = (
    tx.getData() as {
      commands: Array<{
        $kind: string;
        MoveCall?: {
          package: string;
          module: string;
          function: string;
          arguments: Array<{ $kind: string; Result?: number }>;
        };
      }>;
    }
  ).commands;

  expect(commands.map((command) => command.$kind)).toEqual([
    "Publish",
    "MoveCall",
  ]);
  expect(commands[1]!.MoveCall).toMatchObject({
    package: "0x" + "0".repeat(63) + "2",
    module: "package",
    function: "make_immutable",
    arguments: [{ $kind: "Result", Result: 0 }],
  });
});

test("share-stake primitives stay composable through create, register, share, and transfer", () => {
  const tx = new Transaction();
  const shareType = `${PKG}::share::Share`;
  const balance = tx.moveCall({
    target: `${PKG}::fixture::balance`,
    typeArguments: [shareType],
  });
  const pool = tx.moveCall({
    target: `${PKG}::fixture::pool`,
    typeArguments: [shareType, "0x2::sui::SUI"],
  });
  const recipients = [
    { address: A, value: 6n },
    { address: REGISTRY, value: 4n },
  ];
  const stakes = createShareStakes(tx, {
    balance,
    shareType,
    recipients,
    royaltyPoolPackageId: PKG,
  });
  for (const stake of stakes) {
    registerShareStake(tx, {
      stake,
      pool,
      shareType,
      currencyType: "0x2::sui::SUI",
      royaltyPoolPackageId: PKG,
    });
  }
  shareRoyaltyPool(tx, {
    pool,
    shareType,
    currencyType: "0x2::sui::SUI",
    royaltyPoolPackageId: PKG,
  });
  stakes.forEach((stake, index) =>
    tx.transferObjects([stake], recipients[index]!.address),
  );

  const calls = (
    tx.getData().commands as Array<{
      MoveCall?: { module: string; function: string };
    }>
  ).flatMap((command) =>
    command.MoveCall
      ? [`${command.MoveCall.module}::${command.MoveCall.function}`]
      : [],
  );
  expect(calls.filter((call) => call === "balance::split")).toHaveLength(2);
  expect(calls.filter((call) => call === "stake::new")).toHaveLength(2);
  expect(calls.filter((call) => call === "pool::register_stake")).toHaveLength(
    2,
  );
  expect(calls.filter((call) => call === "pool::share")).toHaveLength(1);
  expect(calls.filter((call) => call === "balance::destroy_zero")).toHaveLength(
    1,
  );
  expect(
    tx
      .getData()
      .commands.filter((command) => command.$kind === "TransferObjects"),
  ).toHaveLength(2);
});

test("share-stake creation rejects zero allocations before building an aborting PTB", () => {
  const tx = new Transaction();
  expect(() =>
    createShareStakes(tx, {
      balance: tx.object(A),
      shareType: `${PKG}::share::Share`,
      recipients: [{ address: A, value: 0n }],
      royaltyPoolPackageId: PKG,
    }),
  ).toThrow(/greater than zero/);
});

test("publishCompositionAndRecording orders new→new→publish→publish and borrows the composition in-PTB", () => {
  const tx = new Transaction();
  publishCompositionAndRecording({
    title: "LP — Track",
    royaltyRateBps: 1000,
    composition: {
      shareType: `${PKG}::cs::CS`,
      shareCurrencyId: A,
      shareTreasuryCapId: A,
      shareRecipients: [{ address: A, value: 10_000_000_000_000 }],
      adminAddress: A,
    },
    recording: {
      shareType: `${PKG}::rs::RS`,
      shareCurrencyId: A,
      shareTreasuryCapId: A,
      shareRecipients: [{ address: A, value: 9_000_000_000_000 }],
      adminAddress: A,
    },
    misoPackageId: PKG,
    minatoPackageId: PKG,
  })(tx);

  // Full ordered command stream (MoveCalls only, with their raw arguments).
  const data = tx.getData() as {
    commands: {
      $kind: string;
      MoveCall?: {
        module: string;
        function: string;
        arguments: { $kind: string; NestedResult?: [number, number] }[];
      };
    }[];
  };
  const moveCallStream = data.commands
    .map((c, cmdIndex) => ({ cmdIndex, mc: c.MoveCall }))
    .filter((c): c is { cmdIndex: number; mc: NonNullable<typeof c.mc> } =>
      Boolean(c.mc),
    );
  const label = (m: { module: string; function: string }) =>
    `${m.module}::${m.function}`;

  const seq = moveCallStream.map((c) => label(c.mc));
  const orderOf = (name: string) => seq.indexOf(name);

  // Borrow-before-share ordering is load-bearing.
  expect(orderOf("composition::new")).toBeGreaterThanOrEqual(0);
  expect(orderOf("recording::new")).toBeGreaterThan(
    orderOf("composition::new"),
  );
  expect(orderOf("composition::publish")).toBeGreaterThan(
    orderOf("recording::new"),
  );
  expect(orderOf("recording::publish")).toBeGreaterThan(
    orderOf("composition::publish"),
  );

  // recording::new's first argument must be the composition::new RESULT (an in-PTB
  // borrow), not an external tx.object — this is what makes the single-PTB bundle legal.
  const compNew = moveCallStream.find(
    (c) => label(c.mc) === "composition::new",
  )!;
  const recNew = moveCallStream.find((c) => label(c.mc) === "recording::new")!;
  const compositionArg = recNew.mc.arguments[0]!;
  expect(compositionArg.$kind).toBe("NestedResult");
  // recording::new takes (composition, currency, treasury_cap): the royalty
  // rate is immutable once set at composition::new, so no slippage guard.
  expect(recNew.mc.arguments.length).toBe(3);
  expect(compositionArg.NestedResult![0]).toBe(compNew.cmdIndex); // references composition::new
  expect(compositionArg.NestedResult![1]).toBe(0); // its first return value (the Composition)

  // Both minato disperse calls are present (composition + recording).
  expect(seq.filter((f) => f === "minato::disperse_balance").length).toBe(2);

  // recording::new carries [RecordingShare, CompositionShare] type args.
  const recTypeArgs = (
    data.commands[recNew.cmdIndex]!.MoveCall as unknown as {
      typeArguments: string[];
    }
  ).typeArguments;
  expect(recTypeArgs).toEqual([`${PKG}::rs::RS`, `${PKG}::cs::CS`]);
});

interface ReleaseCall {
  module: string;
  function: string;
  typeArguments?: string[];
  argCount?: number;
}

function releaseCalls(tx: Transaction): ReleaseCall[] {
  const data = tx.getData() as {
    commands: {
      $kind: string;
      MoveCall?: {
        module: string;
        function: string;
        typeArguments?: string[];
        arguments?: unknown[];
      };
    }[];
  };
  return data.commands
    .filter((c) => c.$kind === "MoveCall" && c.MoveCall)
    .map((c) => ({
      module: c.MoveCall!.module,
      function: c.MoveCall!.function,
      typeArguments: c.MoveCall!.typeArguments,
      argCount: c.MoveCall!.arguments?.length,
    }));
}

test("publishRelease wires one track -> registry release -> publish", () => {
  const tx = new Transaction();
  publishRelease({
    title: "LP",
    tracks: [
      {
        recordingId: A,
        recordingAdminCapId: A,
        recordingShareType: `${PKG}::r::R`,
        compositionShareType: `${PKG}::s::S`,
        splitBps: 10000,
      },
    ],
    releaseRegistryId: A,
    releaseId: A,
    releaseNonce: "0",
    misoPackageId: PKG,
    adminAddress: A,
  })(tx);

  const calls = releaseCalls(tx);
  const has = (module: string, fn: string) =>
    calls.some((c) => c.module === module && c.function === fn);
  expect(has("track", "new")).toBe(true);
  expect(has("release", "new")).toBe(true);
  expect(has("release", "publish")).toBe(true);
  // track::new carries both share types
  expect(
    calls.find((c) => c.module === "track" && c.function === "new")!
      .typeArguments,
  ).toEqual([`${PKG}::r::R`, `${PKG}::s::S`]);
  // core release::new takes (registry, title, tracks, nonce).
  expect(
    calls.find((c) => c.module === "release" && c.function === "new")!.argCount,
  ).toBe(4);
  // the admin cap is routed by finalizeRelease, not by the primitive
  const kinds = (
    tx.getData() as { commands: { $kind: string }[] }
  ).commands.map((c) => c.$kind);
  expect(kinds).toContain("TransferObjects");
});

test("release construction passes the exact shared registry as the first core release::new argument", () => {
  const tx = new Transaction();
  publishRelease({
    title: "LP",
    tracks: [
      {
        recordingId: RECORDING,
        recordingAuthority: { kind: "direct", adminCap: RECORDING_CAP },
        recordingShareType: `${PKG}::r::R`,
        compositionShareType: `${PKG}::s::S`,
        splitBps: 10000,
      },
    ],
    releaseRegistryId: REGISTRY,
    releaseId: A,
    releaseNonce: "0",
    misoPackageId: PKG,
    adminCustody: {
      kind: "vault",
      owner: A,
      vaultRegistry: REGISTRY,
      vaultPackageId: PKG,
      capType: `${PKG}::release::ReleaseAdminCap`,
    },
  })(tx);
  const data = tx.getData() as {
    inputs: unknown[];
    commands: {
      $kind: string;
      MoveCall?: {
        module: string;
        function: string;
        arguments: { $kind: string; Input?: number }[];
      };
    }[];
  };
  const releaseNew = data.commands.find(
    (command) =>
      command.MoveCall?.module === "release" &&
      command.MoveCall.function === "new",
  )!.MoveCall!;
  expect(releaseNew.arguments[0]!.$kind).toBe("Input");
  expect(
    JSON.stringify(data.inputs[releaseNew.arguments[0]!.Input!]),
  ).toContain(REGISTRY.slice(2));
  expect(
    data.commands.some(
      (command) =>
        command.MoveCall?.module === "vault" &&
        command.MoveCall.function === "new",
    ),
  ).toBe(true);
  expect(
    data.commands.some(
      (command) =>
        command.MoveCall?.module === "vault" &&
        command.MoveCall.function === "share",
    ),
  ).toBe(true);
  expect(data.commands.some((command) => command.$kind === "TransferObjects")).toBe(true);
});
