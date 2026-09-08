// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from "bun:test";
import { Effect } from "effect";
import { Transaction } from "@mysten/sui/transactions";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { Signer } from "@mysten/sui/cryptography";

import {
  allCreatedByType,
  balanceDelta,
  buildTx,
  createdByExactType,
  createdByType,
  execThunks,
  publishedPackageId,
  signAndExecute,
  toExecResult,
  type ExecResult,
} from "../src/execute.ts";
import { SuiRpcError, TransactionFailedError } from "../src/errors.ts";
import { SuiClient } from "../src/sui-client.ts";

function fakeClient(core: Record<string, unknown>): ClientWithCoreApi {
  return { core } as unknown as ClientWithCoreApi;
}

const fakeSigner = {} as Signer;

const successResult = (digest: string) => ({
  $kind: "Transaction" as const,
  Transaction: {
    digest,
    status: { success: true as const, error: null },
    effects: {
      status: { success: true as const, error: null },
      changedObjects: [
        { objectId: "0xcreated", idOperation: "Created" as const, outputState: "ObjectWrite" as const },
      ],
      gasUsed: { computationCost: "10", storageCost: "5", storageRebate: "2", nonRefundableStorageFee: "0" },
    },
    objectTypes: { "0xcreated": "0x1::mod::Thing" },
    balanceChanges: [{ address: "0xowner", coinType: "0x2::sui::SUI", amount: "-15" }],
  },
});

const failedResult = (digest: string) => ({
  $kind: "Transaction" as const,
  Transaction: {
    digest,
    status: { success: false as const, error: { code: "InsufficientGas" } },
    effects: {
      status: { success: false as const, error: { code: "InsufficientGas" } },
      changedObjects: [],
      gasUsed: { computationCost: "0", storageCost: "0", storageRebate: "0", nonRefundableStorageFee: "0" },
    },
    objectTypes: {},
    balanceChanges: [],
  },
});

// ── buildTx ──────────────────────────────────────────────────────────────────

test("buildTx runs sync and async thunks against one fresh Transaction", async () => {
  const seen: boolean[] = [];
  const tx = await Effect.runPromise(
    buildTx(
      (t) => {
        seen.push(t instanceof Transaction);
      },
      async (t) => {
        await Promise.resolve();
        seen.push(t instanceof Transaction);
      },
    ),
  );

  expect(tx).toBeInstanceOf(Transaction);
  expect(seen).toEqual([true, true]);
});

// ── signAndExecute ───────────────────────────────────────────────────────────

test("signAndExecute submits, waits, and normalizes a successful transaction", async () => {
  const calls: string[] = [];
  const client = fakeClient({
    signAndExecuteTransaction: async () => {
      calls.push("sign");
      return successResult("digest-ok");
    },
    waitForTransaction: async () => {
      calls.push("wait");
      return successResult("digest-ok");
    },
  });

  const result = await Effect.runPromise(
    signAndExecute(fakeSigner, new Transaction()).pipe(Effect.provide(SuiClient.layer(client))),
  );

  expect(result.digest).toBe("digest-ok");
  expect(result.gasUsed).toBe(13);
  expect(result.objectTypes).toEqual({ "0xcreated": "0x1::mod::Thing" });
  expect(calls).toEqual(["sign", "wait"]);
});

test("signAndExecute fails with TransactionFailedError when the execution status reports failure", async () => {
  const client = fakeClient({
    signAndExecuteTransaction: async () => failedResult("digest-fail"),
    waitForTransaction: async () => {
      throw new Error("waitForTransaction must not be called for a failed transaction");
    },
  });

  const err = await Effect.runPromise(
    signAndExecute(fakeSigner, new Transaction()).pipe(Effect.provide(SuiClient.layer(client)), Effect.flip),
  );

  expect(err).toBeInstanceOf(TransactionFailedError);
  expect(err).toMatchObject({ _tag: "TransactionFailedError", digest: "digest-fail" });
});

test("signAndExecute fails with SuiRpcError when the Core API call rejects", async () => {
  const client = fakeClient({
    signAndExecuteTransaction: async () => {
      throw new Error("network down");
    },
  });

  const err = await Effect.runPromise(
    signAndExecute(fakeSigner, new Transaction()).pipe(Effect.provide(SuiClient.layer(client)), Effect.flip),
  );

  expect(err).toBeInstanceOf(SuiRpcError);
  expect(err).toMatchObject({ _tag: "SuiRpcError", operation: "signAndExecuteTransaction" });
});

test("execThunks builds from thunks then signs and executes in one call", async () => {
  const client = fakeClient({
    signAndExecuteTransaction: async () => successResult("digest-thunked"),
    waitForTransaction: async () => successResult("digest-thunked"),
  });

  const result = await Effect.runPromise(
    execThunks(fakeSigner, () => {}).pipe(Effect.provide(SuiClient.layer(client))),
  );

  expect(result.digest).toBe("digest-thunked");
});

// ── object-change extractors (pure) ─────────────────────────────────────────

const okResult = toExecResult(successResult("digest-ok") as unknown as Parameters<typeof toExecResult>[0]);

test("toExecResult normalizes a successful envelope", () => {
  expect(okResult.digest).toBe("digest-ok");
  expect(okResult.gasUsed).toBe(13);
});

test("toExecResult throws on a reverted transaction", () => {
  expect(() =>
    toExecResult(failedResult("digest-fail") as unknown as Parameters<typeof toExecResult>[0]),
  ).toThrow(/reverted/);
});

test("publishedPackageId finds the newly-published package", () => {
  const r: ExecResult = {
    digest: "d",
    changedObjects: [{ objectId: "0xpkg", idOperation: "Created", outputState: "PackageWrite" } as never],
    objectTypes: {},
    balanceChanges: [],
    gasUsed: 0,
  };
  expect(publishedPackageId(r)).toBe("0xpkg");
});

test("createdByType and createdByExactType find created objects by their type", () => {
  expect(createdByType(okResult, "mod::Thing")).toBe("0xcreated");
  expect(createdByExactType(okResult, "0x1::mod::Thing")).toBe("0xcreated");
  expect(() => createdByType(okResult, "nope")).toThrow();
});

test("allCreatedByType and balanceDelta read the changed-object and balance maps", () => {
  expect(allCreatedByType(okResult, "Thing")).toEqual([{ objectId: "0xcreated", objectType: "0x1::mod::Thing" }]);
  expect(balanceDelta(okResult, "0xowner", "0x2::sui::SUI")).toBe("-15");
  expect(balanceDelta(okResult, "0xother", "0x2::sui::SUI")).toBe("0");
});
