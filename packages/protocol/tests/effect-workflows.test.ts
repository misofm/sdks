import { expect, test } from "bun:test";
import { Effect, Result } from "effect";
import { runPromise, SdkError } from "@misofm/utils/effect";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import type { Signer } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import { buildTx, executeThunksEffect, signAndExecute } from "../src/execute.ts";
import { getCompositionAddressByShareType, getObjectByBcsEffect, getOwnedCompositionAdminCaps, getWorkAddressesByShareTypes } from "../src/queries.ts";
import { getMemberships, getProfile, getRoles } from "../src/party/queries.ts";
import { MembershipKey } from "../src/contracts/miso_party/party.ts";

const id = `0x${"ab".repeat(32)}`;
const signer = {} as Signer;
const clientWith = (core: object) => ({ core }) as ClientWithCoreApi;

test("execution is lazy, runs shared transaction thunks sequentially, submits once and awaits finality", async () => {
  const steps: string[] = [];
  let built: Transaction | undefined;
  const client = clientWith({
    signAndExecuteTransaction: async ({ transaction }: { transaction: Transaction }) => {
      expect(transaction).toBe(built);
      steps.push("submit");
      return { $kind: "Transaction", Transaction: { digest: "digest", effects: {
        status: { success: true }, changedObjects: [], gasUsed: { computationCost: "3", storageCost: "2", storageRebate: "1" },
      } } };
    },
    waitForTransaction: async () => { steps.push("finality"); },
  });
  const program = executeThunksEffect(client, signer,
    async (tx) => { built = tx; steps.push("first"); await Promise.resolve(); steps.push("first complete"); },
    (tx) => { expect(tx).toBe(built); steps.push("second"); });
  expect(steps).toEqual([]);
  expect((await runPromise(program)).gasUsed).toBe(4);
  expect(steps).toEqual(["first", "first complete", "second", "submit", "finality"]);
});

test("Promise execution preserves foreign rejection identity and never retries", async () => {
  const failure = { code: "custom failure" };
  await expect(buildTx(() => { throw failure; })).rejects.toBe(failure);
  let submits = 0;
  const client = clientWith({ signAndExecuteTransaction: async () => { submits++; throw failure; } });
  await expect(signAndExecute(client, signer, new Transaction())).rejects.toBe(failure);
  expect(submits).toBe(1);
});

test("resolved failed and reverted envelopes fail before finality", async () => {
  for (const envelope of [
    { $kind: "FailedTransaction", FailedTransaction: { digest: "bad", effects: { status: { success: false, error: "failure" } } } },
    { $kind: "Transaction", Transaction: { digest: "bad", effects: { status: { success: false, error: "reverted" } } } },
  ]) {
    let waited = false;
    const client = clientWith({ signAndExecuteTransaction: async () => envelope, waitForTransaction: async () => { waited = true; } });
    await expect(signAndExecute(client, signer, new Transaction())).rejects.toThrow("digest bad");
    expect(waited).toBe(false);
  }
});

test("codec failures are typed and preserve the original object at Promise boundaries", async () => {
  const failure = new Error("invalid BCS");
  const client = clientWith({ getObject: async () => ({ object: { content: new Uint8Array([0]) } }) });
  const program = getObjectByBcsEffect(client, id, { parse() { throw failure; } });
  const result = await Effect.runPromise(Effect.result(program));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(SdkError);
    expect(result.failure.cause).toBe(failure);
  }
  await expect(runPromise(program)).rejects.toBe(failure);
});

test("Party optional reads distinguish missing fields from transport errors", async () => {
  const missing = clientWith({ getObject: async () => { throw { code: "notExists" }; } });
  expect(await getProfile(missing, id, id)).toBeNull();
  expect(await getRoles(missing, id, id)).toEqual([]);
  const failure = new Error("peer not found");
  const broken = clientWith({ getObject: async () => { throw failure; } });
  await expect(getProfile(broken, id, id)).rejects.toBe(failure);
  await expect(getRoles(broken, id, id)).rejects.toBe(failure);
});

test("owned-object pagination rejects missing and cyclic continuation cursors", async () => {
  for (const cursors of [[null], ["a", "a"], ["a", "b", "a"]]) {
    let calls = 0;
    const client = clientWith({ listOwnedObjects: async () => ({ objects: [], hasNextPage: true, cursor: cursors[calls++] }) });
    await expect(getOwnedCompositionAdminCaps(client, id, id)).rejects.toThrow("Pagination");
    expect(calls).toBe(cursors.length);
  }
});

test("Party membership pagination reads later keys and detects non-progress", async () => {
  let calls = 0;
  const client = clientWith({ listDynamicFields: async () => ++calls === 1
    ? { dynamicFields: [], hasNextPage: true, cursor: "next" }
    : { dynamicFields: [{ name: { type: `${id}::party::MembershipKey`, bcs: MembershipKey.serialize([id]).toBytes() } }], hasNextPage: false, cursor: null },
  });
  expect(await getMemberships(client, id)).toEqual([id]);
  const stuck = clientWith({ listDynamicFields: async () => ({ dynamicFields: [], hasNextPage: true, cursor: "same" }) });
  await expect(getMemberships(stuck, id)).rejects.toThrow("Pagination");
});

test("GraphQL discovery rejects service errors and non-progress instead of reporting absence", async () => {
  const broken = { query: async () => ({ errors: [{ message: "service unavailable" }] }) } as unknown as SuiGraphQLClient;
  await expect(getCompositionAddressByShareType(broken, "share", id)).rejects.toThrow("Work type discovery failed");
  let calls = 0;
  const stuck = { query: async () => { calls++; return { data: { recordings: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "same" } } } }; } } as unknown as SuiGraphQLClient;
  await expect(getWorkAddressesByShareTypes(stuck, { compositions: [], recordings: ["share"] }, id)).rejects.toThrow("Pagination");
  expect(calls).toBe(2);
});

test("interrupting a composed read aborts its transport signal", async () => {
  let ready!: () => void;
  const started = new Promise<void>((resolve) => { ready = resolve; });
  let signal: AbortSignal | undefined;
  const client = clientWith({ getObject: ({ signal: incoming }: { signal: AbortSignal }) => {
    signal = incoming;
    ready();
    return new Promise((_, reject) => incoming.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  } });
  const controller = new AbortController();
  const pending = runPromise(getObjectByBcsEffect(client, id, { parse: () => "unused" }), { signal: controller.signal });
  const rejected = pending.then(() => { throw new Error("expected interruption"); }, (error: unknown) => error);
  await started;
  controller.abort();
  expect(await rejected).toBeDefined();
  expect(signal?.aborted).toBe(true);
});
