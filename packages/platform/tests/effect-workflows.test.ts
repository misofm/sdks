import { expect, test } from "bun:test";
import { Effect, Result } from "effect";
import { runPromise, SdkError } from "@misofm/utils/effect";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { ParallelTransactionExecutor, Transaction } from "@mysten/sui/transactions";
import { executeViaExecutor, executeViaExecutorEffect } from "../src/execute.ts";
import { initializeShareCurrencies, initializeShareCurrenciesEffect, publishShareCurrencies } from "../src/share.ts";
import { getPressing, getPressingEffect } from "../src/pressing.ts";
import { requestAuthorizationChallengeEffect, createAuthorizationHeaders, MisoAuthError } from "../src/auth.ts";
import { getBalanceEffect } from "../src/read/wallet.ts";
import type { MisoClient } from "../src/read/client.ts";

const id = (value: number) => `0x${value.toString(16).padStart(64, "0")}`;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function resultFor(packages: string[]) {
  const objectTypes: Record<string, string> = {};
  const changedObjects = packages.flatMap((pkg, index) => {
    const currency = id(1000 + index),
      cap = id(2000 + index);
    objectTypes[currency] = `0x2::coin_registry::Currency<${pkg}::share::Share>`;
    objectTypes[cap] = `0x2::coin::TreasuryCap<${pkg}::share::Share>`;
    return [currency, cap].map((objectId) => ({ objectId, idOperation: "Created" }));
  });
  return {
    $kind: "Transaction",
    Transaction: {
      digest: "digest",
      objectTypes,
      effects: {
        status: { success: true },
        changedObjects,
        gasUsed: { computationCost: "3", storageCost: "0", storageRebate: "0" },
      },
    },
  };
}

function batchExecutor() {
  const started = [deferred<void>(), deferred<void>(), deferred<void>()];
  const calls: { packages: string[]; pending: ReturnType<typeof deferred<ReturnType<typeof resultFor>>> }[] = [];
  const executor = {
    executeTransaction(tx: Transaction) {
      const packages = tx
        .getData()
        .commands.flatMap((command) => (command.MoveCall?.function === "initialize" ? [command.MoveCall.package] : []));
      const pending = deferred<ReturnType<typeof resultFor>>();
      calls.push({ packages, pending });
      started[calls.length - 1]!.resolve();
      return pending.promise;
    },
  } as unknown as ParallelTransactionExecutor;
  return { executor, calls, started };
}
const metadata = () => ({ name: "Work", description: "Share" });

test("executor effects are lazy, submit once, and preserve original rejection values", async () => {
  const failure = { reason: "ambiguous submission" };
  const steps: string[] = [];
  const executor = {
    executeTransaction: async () => {
      steps.push("submit");
      throw failure;
    },
  } as unknown as ParallelTransactionExecutor;
  const program = executeViaExecutorEffect(
    executor,
    async () => {
      steps.push("first");
      await Promise.resolve();
    },
    () => {
      steps.push("second");
    },
  );
  expect(steps).toEqual([]);
  const result = await Effect.runPromise(Effect.result(program));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(SdkError);
    expect(result.failure.cause).toBe(failure);
  }
  expect(steps).toEqual(["first", "second", "submit"]);
  await expect(executeViaExecutor(executor)).rejects.toBe(failure);
  expect(steps.filter((step) => step === "submit")).toHaveLength(2);
});

test("initialization checkpoints land immediately but final aggregation retains batch order", async () => {
  const { executor, calls, started } = batchExecutor();
  const packages = Array.from({ length: 11 }, (_, index) => id(index + 1));
  const checkpoints: string[] = [];
  const checkpoint = deferred<void>();
  const pending = initializeShareCurrencies(executor, id(99), packages, metadata, (currencies) => {
    checkpoints.push(currencies[0]!.packageId);
    checkpoint.resolve();
  });
  await started[1]!.promise;
  const laterBatch = calls.find((call) => call.packages[0] === packages[10])!;
  const firstBatch = calls.find((call) => call.packages[0] === packages[0])!;
  laterBatch.pending.resolve(resultFor(laterBatch.packages));
  await checkpoint.promise;
  expect(checkpoints).toEqual([packages[10]!]);
  firstBatch.pending.resolve(resultFor(firstBatch.packages));
  expect((await pending).currencies.map((currency) => currency.packageId)).toEqual(packages);
});

test("failed initialization joins other batches and retains successful checkpoints without resubmission", async () => {
  const { executor, calls, started } = batchExecutor();
  const packages = Array.from({ length: 21 }, (_, index) => id(index + 1));
  const checkpoints: string[] = [];
  const pending = initializeShareCurrencies(
    executor,
    id(99),
    packages,
    metadata,
    (currencies) => {
      checkpoints.push(currencies[0]!.packageId);
    },
    { concurrency: 2 },
  ).catch((error: unknown) => error);
  await started[1]!.promise;
  expect(calls).toHaveLength(2);
  calls[0]!.pending.reject(new Error("ambiguous"));
  await started[2]!.promise;
  calls[2]!.pending.resolve(resultFor(calls[2]!.packages));
  calls[1]!.pending.resolve(resultFor(calls[1]!.packages));
  expect(await pending).toMatchObject({ message: "1/3 initialize batch(es) failed: ambiguous" });
  expect(checkpoints.sort()).toEqual([packages[10]!, packages[20]!].sort());
  expect(calls).toHaveLength(3);
});

test("interrupting initialization waits for the started transaction and its checkpoint", async () => {
  const { executor, calls, started } = batchExecutor();
  const controller = new AbortController();
  let checkpoint = false;
  const pending = runPromise(
    initializeShareCurrenciesEffect(executor, id(99), [id(1)], metadata, () => {
      checkpoint = true;
    }),
    { signal: controller.signal },
  ).catch(() => undefined);
  await started[0]!.promise;
  controller.abort();
  calls[0]!.pending.resolve(resultFor(calls[0]!.packages));
  await pending;
  expect(checkpoint).toBe(true);
  expect(calls).toHaveLength(1);
});

test("invalid batch limits fail before any submission or bytecode patch", async () => {
  const { executor, calls } = batchExecutor();
  await expect(publishShareCurrencies(executor, id(99), Infinity)).rejects.toThrow("non-negative safe integer");
  await expect(
    initializeShareCurrencies(executor, id(99), [id(1)], metadata, undefined, { concurrency: 0 }),
  ).rejects.toThrow("positive safe integer");
  expect(calls).toEqual([]);
});

test("optional reads retain transport failures in the typed channel and Promise identity", async () => {
  const failure = new Error("offline");
  const client = {
    core: {
      getObject: async () => {
        throw failure;
      },
    },
  } as unknown as ClientWithCoreApi;
  const result = await Effect.runPromise(Effect.result(getPressingEffect(client, id(1), id(2))));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure.cause).toBe(failure);
  await expect(getPressing(client, id(1), id(2))).rejects.toBe(failure);
});

test("challenge cancellation aborts response body consumption and never signs", async () => {
  const controller = new AbortController();
  const reading = deferred<void>();
  const aborted = deferred<void>();
  const program = requestAuthorizationChallengeEffect({
    apiUrl: "https://api.testnet.miso.fm",
    token: "token",
    address: id(1),
    method: "PUT",
    path: "/platform/test",
    fetch: async (_input, init) =>
      new Response(
        new ReadableStream({
          start(stream) {
            reading.resolve();
            init!.signal!.addEventListener(
              "abort",
              () => {
                stream.error(init!.signal!.reason);
                aborted.resolve();
              },
              { once: true },
            );
          },
        }),
      ),
  });
  const pending = runPromise(program, { signal: controller.signal }).catch(() => undefined);
  await reading.promise;
  controller.abort();
  await aborted.promise;
  await pending;
});

test("auth validation exposes named MisoAuthError failures and preserves them at Promise boundaries", async () => {
  const options = {
    apiUrl: "https://api.testnet.miso.fm",
    token: "token",
    address: id(1),
    method: "GET",
    path: "/platform/test",
    signer: { signPersonalMessage: async () => ({ signature: "unused" }) },
  };
  const result = await Effect.runPromise(Effect.result(requestAuthorizationChallengeEffect(options)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(MisoAuthError);
  await expect(createAuthorizationHeaders(options)).rejects.toBeInstanceOf(MisoAuthError);
});

test("coin metadata deduplicates concurrent reads and evicts failed lookups", async () => {
  let calls = 0;
  const client = {
    config: { money: { usdCoinType: "0x2::usd::USD" } },
    protocol: {
      core: {
        getBalance: async () => ({ balance: { balance: "0", coinBalance: "0", addressBalance: "0" } }),
        getCoinMetadata: async () => {
          if (++calls === 1) throw new Error("transient");
          return { coinMetadata: { decimals: 6 } };
        },
      },
    },
  } as unknown as MisoClient;
  await expect(runPromise(getBalanceEffect(client, id(1)))).rejects.toThrow("transient");
  const balances = await runPromise(
    Effect.all([getBalanceEffect(client, id(1)), getBalanceEffect(client, id(2))], { concurrency: 2 }),
  );
  expect(balances.map((balance) => balance.decimals)).toEqual([6, 6]);
  expect(calls).toBe(2);
});
