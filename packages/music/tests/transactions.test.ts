// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Structural drift gate for the (sync, client-free) tx builders: build the
// transaction and assert the generated Move calls are wired with the right
// module/function, type arguments, and argument counts. Catches arg-order and
// signature drift in the builders.

import { test, expect } from "bun:test";
import { Transaction } from "@mysten/sui/transactions";
import {
  createComposition,
  createRelease,
  createTrack,
  createRecording,
  publishComposition,
} from "../src/transactions.ts";

const PKG = "0x" + "cd".repeat(32);
const A = "0x" + "ab".repeat(32);
const B = "0x" + "ef".repeat(32);

interface MoveCallInfo {
  module: string;
  function: string;
  typeArguments: string[];
  argCount: number;
}

function moveCalls(tx: Transaction): MoveCallInfo[] {
  const data = tx.getData() as { commands: { $kind: string; MoveCall?: { module: string; function: string; typeArguments: string[]; arguments: unknown[] } }[] };
  return data.commands
    .filter((c) => c.$kind === "MoveCall" && c.MoveCall)
    .map((c) => ({
      module: c.MoveCall!.module,
      function: c.MoveCall!.function,
      typeArguments: c.MoveCall!.typeArguments,
      argCount: c.MoveCall!.arguments.length,
    }));
}

function kinds(tx: Transaction): string[] {
  return (tx.getData() as { commands: { $kind: string }[] }).commands.map((c) => c.$kind);
}

test("createTrack wires track::new (4 args, both share types) and routes nothing", () => {
  const tx = new Transaction();
  const trackArg = createTrack(tx, {
    recordingId: A,
    recordingAdminCapId: A,
    recordingShareType: `${PKG}::r::R`,
    compositionShareType: `${PKG}::s::S`,
    targetReleaseId: A,
    trackSplitBps: 5000,
    misoPackageId: PKG,
  });

  const trackNew = moveCalls(tx).find((c) => c.module === "track" && c.function === "new");
  expect(trackNew).toBeDefined();
  // (cap, recording, release_id, split)
  expect(trackNew!.argCount).toBe(4);
  // typeArguments order is [RecordingShare, CompositionShare]
  expect(trackNew!.typeArguments).toEqual([`${PKG}::r::R`, `${PKG}::s::S`]);
  expect(trackArg).toBeDefined();
  expect(kinds(tx)).toEqual(["MoveCall"]);
});

test("createTrack throws when neither recordingAdminCapId nor recordingAdminCap is provided", () => {
  const tx = new Transaction();
  expect(() =>
    createTrack(tx, {
      recordingId: A,
      recordingShareType: `${PKG}::r::R`,
      compositionShareType: `${PKG}::s::S`,
      targetReleaseId: A,
      trackSplitBps: 5000,
      misoPackageId: PKG,
    }),
  ).toThrow(/createTrack: recordingAdminCapId or recordingAdminCap required/);
});

test("createTrack accepts a PTB-local recording and admin cap", () => {
  const tx = new Transaction();
  const recording = createRecording(tx, {
    composition: tx.object(A),
    shareType: RS,
    compositionShareType: CS,
    shareCurrencyId: A,
    shareTreasuryCapId: A,
    misoPackageId: PKG,
  });
  createTrack(tx, {
    recording: recording.recording,
    recordingAdminCap: recording.adminCap,
    recordingShareType: RS,
    compositionShareType: CS,
    targetReleaseId: A,
    trackSplitBps: 10_000,
    misoPackageId: PKG,
  });
  const data = tx.getData() as {
    commands: {
      $kind: string;
      MoveCall?: { module: string; function: string; arguments: unknown[] };
    }[];
  };
  const call = data.commands.at(-1)!.MoveCall!;
  expect(call).toMatchObject({ module: "track", function: "new" });
  // `recording::new` returns (Recording, RecordingAdminCap, Balance): this
  // must thread the two PTB-local outputs directly into `track::new`, rather
  // than accidentally resolving either as an address-owned object input.
  expect(call.arguments[0]).toEqual({ $kind: "NestedResult", NestedResult: [0, 1] });
  expect(call.arguments[1]).toEqual({ $kind: "NestedResult", NestedResult: [0, 0] });
});

// ============================================================================
// Primitive contract: create*, don't route
// ============================================================================
//
// These pin the invariant the whole two-package split rests on: a `create*`
// primitive appends exactly ONE move call and hands back every by-value result
// for the caller to route. If one ever started publishing, sharing, or
// transferring, `@misofm/sdk`'s finalizers would double-dispose and the PTB
// would abort on-chain — so assert on the exact command list, not just on the
// absence of a TransferObjects kind.

const CS = `${PKG}::cs::CS`;
const RS = `${PKG}::rs::RS`;

test("createComposition appends only composition::new and returns all three parts", () => {
  const tx = new Transaction();
  const parts = createComposition(tx, {
    title: "T",
    royaltyRateBps: 1000,
    shareType: CS,
    shareCurrencyId: A,
    shareTreasuryCapId: A,
    misoPackageId: PKG,
  });

  expect(kinds(tx)).toEqual(["MoveCall"]);
  const [call] = moveCalls(tx);
  expect(call).toMatchObject({ module: "composition", function: "new" });
  expect(call!.typeArguments).toEqual([CS]);
  // (title, royalty_rate_bps, share_currency, share_treasury_cap)
  expect(call!.argCount).toBe(4);

  // All three results returned, and mapped to DISTINCT ascending NestedResults.
  // A transposition of adminCap/balance typechecks (both are
  // TransactionObjectArgument) and would silently disperse an admin cap.
  expect(Object.keys(parts).sort()).toEqual(["adminCap", "balance", "composition"]);
  expect(parts.composition).toEqual({ $kind: "NestedResult", NestedResult: [0, 0] });
  expect(parts.adminCap).toEqual({ $kind: "NestedResult", NestedResult: [0, 1] });
  expect(parts.balance).toEqual({ $kind: "NestedResult", NestedResult: [0, 2] });
});

test("createRecording appends only recording::new, borrows the composition, returns all three parts", () => {
  const tx = new Transaction();
  const comp = createComposition(tx, {
    title: "T",
    royaltyRateBps: 1000,
    shareType: CS,
    shareCurrencyId: A,
    shareTreasuryCapId: A,
    misoPackageId: PKG,
  });
  const parts = createRecording(tx, {
    shareType: RS,
    compositionShareType: CS,
    shareCurrencyId: A,
    shareTreasuryCapId: A,
    composition: comp.composition, // borrow-before-share: still unshared
    misoPackageId: PKG,
  });

  // exactly one more command than the composition's
  expect(kinds(tx)).toEqual(["MoveCall", "MoveCall"]);
  const call = moveCalls(tx)[1]!;
  expect(call).toMatchObject({ module: "recording", function: "new" });
  // order is [RecordingShare, CompositionShare] — transposable and untyped
  expect(call.typeArguments).toEqual([RS, CS]);
  // (composition, share_currency, share_treasury_cap)
  expect(call.argCount).toBe(3);

  expect(Object.keys(parts).sort()).toEqual(["adminCap", "balance", "recording"]);
  expect(parts.recording).toEqual({ $kind: "NestedResult", NestedResult: [1, 0] });
  expect(parts.adminCap).toEqual({ $kind: "NestedResult", NestedResult: [1, 1] });
  expect(parts.balance).toEqual({ $kind: "NestedResult", NestedResult: [1, 2] });
});

test("createRelease calls core release::new with the registry as its first object argument", () => {
  const tx = new Transaction();
  const parts = createRelease(tx, {
    releaseRegistryId: A,
    title: "Release",
    tracks: [tx.object(B)],
    nonce: 42n,
    misoPackageId: PKG,
  });

  expect(kinds(tx)).toEqual(["MakeMoveVec", "MoveCall"]);
  const data = tx.getData() as {
    inputs: { $kind: string; UnresolvedObject?: { objectId: string } }[];
    commands: {
      $kind: string;
      MoveCall?: { module: string; function: string; arguments: { $kind: string; Input?: number }[] };
    }[];
  };
  const call = data.commands[1]!.MoveCall!;
  expect(call).toMatchObject({ module: "release", function: "new" });
  expect(call.arguments).toHaveLength(4);
  expect(call.arguments[0]).toMatchObject({ $kind: "Input" });
  const registryInput = data.inputs[call.arguments[0]!.Input!]!;
  expect(registryInput).toEqual({
    $kind: "UnresolvedObject",
    UnresolvedObject: { objectId: A },
  });
  expect(parts.release).toEqual({ $kind: "NestedResult", NestedResult: [1, 0] });
  expect(parts.adminCap).toEqual({ $kind: "NestedResult", NestedResult: [1, 1] });
});

test("createRelease rejects an unsafe JavaScript nonce before u256 serialization", () => {
  expect(() =>
    createRelease(new Transaction(), {
      releaseRegistryId: A,
      title: "R",
      tracks: [],
      nonce: Number.MAX_SAFE_INTEGER + 2,
      misoPackageId: PKG,
    }),
  ).toThrow("safe integer");
  expect(() =>
    createRelease(new Transaction(), {
      releaseRegistryId: A,
      title: "R",
      tracks: [],
      nonce: "9007199254740993",
      misoPackageId: PKG,
    }),
  ).not.toThrow();
});

test("publish finalizers consume their PTB-local values without setting gas or submitting", () => {
  const tx = new Transaction();
  const composition = createComposition(tx, {
    title: "T",
    royaltyRateBps: 1000,
    shareType: CS,
    shareCurrencyId: A,
    shareTreasuryCapId: A,
    misoPackageId: PKG,
  });
  publishComposition(tx, {
    composition: composition.composition,
    adminCap: composition.adminCap,
    shareType: CS,
    misoPackageId: PKG,
  });

  expect(kinds(tx)).toEqual(["MoveCall", "MoveCall"]);
  const call = moveCalls(tx)[1]!;
  expect(call).toMatchObject({ module: "composition", function: "publish" });
  expect(call.argCount).toBe(3); // Codegen adds the framework Clock input.
});

