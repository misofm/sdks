// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Transaction building + execution + effect extraction (the Signer-parameter
// pattern). Builders elsewhere only *append* to a caller-owned Transaction;
// this module is where a transaction is actually built and submitted.
// `signAndExecute` submits over the unified Core API, unwraps the
// `{ $kind: "Transaction", Transaction }` envelope, waits for finality, and
// returns changed objects, the objectId→type map, balance changes, and net gas
// for downstream extraction. Everything here is transport-agnostic — it
// requires only the `SuiClient` service, so gRPC / JSON-RPC / GraphQL clients
// all work.

import { Effect } from "effect";
import { Transaction } from "@mysten/sui/transactions";
import type { SuiClientTypes } from "@mysten/sui/client";
import type { Signer } from "@mysten/sui/cryptography";

import { SuiRpcError, TransactionFailedError } from "./errors.ts";
import { SuiClient } from "./sui-client.ts";

/**
 * A function that appends commands to a caller-owned `Transaction`; may be async.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `Recipe = (tx) => void` instead — every existing
 * thunk is already synchronous — see the migration table in this package's README.
 */
export type TxThunk = (tx: Transaction) => void | Promise<void>;

/**
 * The effect fields every submit path requests, so extraction is uniform.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect, where this is internal to `Tx.submit` — see the
 * migration table in this package's README.
 */
export const FULL_INCLUDE = { effects: true, objectTypes: true, balanceChanges: true } as const;
type FullInclude = typeof FULL_INCLUDE;

/**
 * The normalized outcome of a successfully-executed transaction.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `Executed` instead, with `created(type)`,
 * `createdWhere(predicate)`, `packagesPublished()`, `balanceChange(address, coinType)`, and `expectCreated` —
 * see the migration table in this package's README.
 */
export interface ExecResult {
  digest: string;
  /** Objects created/mutated/deleted by the transaction. */
  changedObjects: SuiClientTypes.ChangedObject[];
  /** Map of changed objectId → fully-qualified type. */
  objectTypes: Record<string, string>;
  /** Net coin balance deltas by address. */
  balanceChanges: SuiClientTypes.BalanceChange[];
  /** Net gas cost in MIST (computation + storage − rebate). */
  gasUsed: number;
}

/**
 * Builds a fresh `Transaction` from one or more thunks (awaiting async ones); never fails.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Compose recipes instead — `(tx) => { a(tx); b(tx) }`
 * — then `Tx.build` — see the migration table in this package's README.
 */
export const buildTx: (...thunks: readonly TxThunk[]) => Effect.Effect<Transaction> = Effect.fn("buildTx")(function* (
  ...thunks: readonly TxThunk[]
): Effect.fn.Return<Transaction> {
  const tx = new Transaction();
  for (const thunk of thunks) {
    yield* Effect.promise(() => Promise.resolve(thunk(tx)));
  }
  return tx;
});

/**
 * Normalizes the `{ $kind }` transaction-result envelope into an {@link ExecResult}; throws on a failed status.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect, where this is internal to `Tx.submit` — see the
 * migration table in this package's README.
 */
export function toExecResult(res: SuiClientTypes.TransactionResult<FullInclude>): ExecResult {
  if (res.$kind !== "Transaction") {
    const failed = res.FailedTransaction;
    const status = failed.effects?.status;
    const err = status && !status.success ? JSON.stringify(status.error) : "unknown error";
    throw new Error(`Transaction failed: ${err} (digest ${failed.digest})`);
  }

  const t = res.Transaction;
  const effects = t.effects as SuiClientTypes.TransactionEffects;
  if (!effects.status.success) {
    throw new Error(`Transaction reverted: ${JSON.stringify(effects.status.error)} (digest ${t.digest})`);
  }

  return {
    digest: t.digest,
    changedObjects: effects.changedObjects,
    objectTypes: (t.objectTypes as Record<string, string>) ?? {},
    balanceChanges: (t.balanceChanges as SuiClientTypes.BalanceChange[]) ?? [],
    gasUsed: netGas(effects.gasUsed),
  };
}

/**
 * Signs, executes, and waits for a transaction; fails with `TransactionFailedError` if its effects report failure.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `Tx.run(recipe, { signer })` instead — the
 * separate `waitForTransaction` is gone — see the migration table in this package's README.
 */
export const signAndExecute = Effect.fn("signAndExecute")(function* (
  signer: Signer,
  tx: Transaction,
): Effect.fn.Return<ExecResult, TransactionFailedError | SuiRpcError, SuiClient> {
  const client = yield* SuiClient;
  const res = yield* Effect.tryPromise({
    try: (signal) => client.core.signAndExecuteTransaction({ transaction: tx, signer, include: FULL_INCLUDE, signal }),
    catch: (cause) => new SuiRpcError({ operation: "signAndExecuteTransaction", cause }),
  });

  const { digest, status } = statusOf(res);
  if (!status.success) {
    return yield* new TransactionFailedError({ digest, status });
  }

  const result = toExecResult(res);

  yield* Effect.tryPromise({
    try: (signal) => client.core.waitForTransaction({ digest: result.digest, signal }),
    catch: (cause) => new SuiRpcError({ operation: "waitForTransaction", cause }),
  });

  return result;
});

/**
 * Convenience: build from thunks, then sign+execute in one call.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `Tx.run(recipe, { signer })` instead — see the
 * migration table in this package's README.
 */
export const execThunks = Effect.fn("execThunks")(function* (
  signer: Signer,
  ...thunks: readonly TxThunk[]
): Effect.fn.Return<ExecResult, TransactionFailedError | SuiRpcError, SuiClient> {
  const tx = yield* buildTx(...thunks);
  return yield* signAndExecute(signer, tx);
});

// ── Object-change extractors (pure) ─────────────────────────────────────────

/**
 * The package id from the (single) newly-published package.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `executed.packagesPublished()` instead — it
 * returns `ChangedRef`s, not strings — see the migration table in this package's README.
 */
export function publishedPackageId(r: ExecResult): string {
  const pkg = r.changedObjects.find((c) => c.idOperation === "Created" && c.outputState === "PackageWrite");
  if (!pkg) throw new Error("No published package found in object changes.");
  return pkg.objectId;
}

/**
 * All package ids newly published by the transaction (up to 5 per PTB).
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `executed.packagesPublished()` instead — it
 * returns `ChangedRef`s, not strings — see the migration table in this package's README.
 */
export function allPublishedPackageIds(r: ExecResult): string[] {
  return r.changedObjects
    .filter((c) => c.idOperation === "Created" && c.outputState === "PackageWrite")
    .map((c) => c.objectId);
}

/**
 * The first newly-created object whose type contains `substr`.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `executed.createdWhere(ref =>
 * ref.type?.includes(substr))` instead — see the migration table in this package's README.
 */
export function createdByType(r: ExecResult, substr: string): string {
  const id = maybeCreatedByType(r, substr);
  if (!id) throw new Error(`No created object with type containing "${substr}" found in object changes.`);
  return id;
}

/**
 * Like {@link createdByType} but returns undefined instead of throwing.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `executed.createdWhere(predicate)` instead —
 * see the migration table in this package's README.
 */
export function maybeCreatedByType(r: ExecResult, substr: string): string | undefined {
  for (const c of r.changedObjects) {
    if (c.idOperation === "Created" && (r.objectTypes[c.objectId] ?? "").includes(substr)) return c.objectId;
  }
  return undefined;
}

/**
 * The first newly-created object whose type is EXACTLY `type` (for non-generic types).
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `executed.created(type)` instead — it compares
 * normalized struct tags and returns a `ChangedRef` — see the migration table in this package's README.
 */
export function createdByExactType(r: ExecResult, type: string): string {
  for (const c of r.changedObjects) {
    if (c.idOperation === "Created" && r.objectTypes[c.objectId] === type) return c.objectId;
  }
  throw new Error(`No created object of exact type "${type}" found in object changes.`);
}

/**
 * All newly-created objects whose type contains `substr`.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `executed.createdWhere(predicate)` instead —
 * see the migration table in this package's README.
 */
export function allCreatedByType(r: ExecResult, substr: string): { objectId: string; objectType: string }[] {
  const out: { objectId: string; objectType: string }[] = [];
  for (const c of r.changedObjects) {
    const type = r.objectTypes[c.objectId] ?? "";
    if (c.idOperation === "Created" && type.includes(substr)) out.push({ objectId: c.objectId, objectType: type });
  }
  return out;
}

/**
 * The signed balance delta for `address` in `coinType`, or "0" if absent.
 *
 * @deprecated `@misofm/effect` is superseded by sui-effect. Use `executed.balanceChange(address, coinType)`
 * instead — it returns a `bigint` — see the migration table in this package's README.
 */
export function balanceDelta(r: ExecResult, address: string, coinType: string): string {
  const change = r.balanceChanges.find((b) => b.address === address && b.coinType === coinType);
  return change?.amount ?? "0";
}

// ── Private ──────────────────────────────────────────────────────────────────

/** The digest and top-level execution status of a `TransactionResult`, whichever `$kind` it is. */
function statusOf(
  res: SuiClientTypes.TransactionResult<FullInclude>,
): { digest: string; status: SuiClientTypes.ExecutionStatus } {
  const t = res.$kind === "Transaction" ? res.Transaction : res.FailedTransaction;
  return { digest: t.digest, status: t.status };
}

function netGas(gasUsed: SuiClientTypes.GasCostSummary): number {
  return Number(gasUsed.computationCost) + Number(gasUsed.storageCost) - Number(gasUsed.storageRebate);
}
