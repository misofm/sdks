// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Transaction execution + effect extraction (the Signer-parameter pattern).
//
// Builders elsewhere only *append* to a caller-owned Transaction; this module is
// where a transaction is actually submitted. `signAndExecute` submits over the
// unified Core API, unwraps the `{ $kind: "Transaction", Transaction }` envelope,
// waits for finality, and returns changed objects, the objectId→type map, balance
// changes, and net gas for downstream extraction. Everything here is
// transport-agnostic — it takes any `ClientWithCoreApi`, so gRPC / JSON-RPC /
// GraphQL clients all work.
//

import { Transaction } from "@mysten/sui/transactions";
import type { ClientWithCoreApi, SuiClientTypes } from "@mysten/sui/client";
import type { Signer } from "@mysten/sui/cryptography";
import type { TxThunk } from "./transactions.ts";
import { Effect } from "effect";
import { runPromise, tryPromise, trySync } from "@misofm/utils/effect";

/** The effect fields every submit path requests, so extraction is uniform. */
export const FULL_INCLUDE = { effects: true, objectTypes: true, balanceChanges: true } as const;
type FullInclude = typeof FULL_INCLUDE;

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

/** Builds a fresh Transaction from one or more thunks (awaiting async ones). */
export function buildTxEffect(...thunks: TxThunk[]) {
  return Effect.gen(function* () {
    const tx = new Transaction();
    for (const thunk of thunks) {
      yield* tryPromise("buildTx.thunk", async () => thunk(tx));
    }
    return tx;
  });
}

export function buildTx(...thunks: TxThunk[]): Promise<Transaction> {
  return runPromise(buildTxEffect(...thunks));
}

/** Normalizes the `{ $kind }` transaction-result envelope into an {@link ExecResult}. */
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

/** Once submission starts, interruption waits for submission and finality; never retries. */
export function signAndExecuteEffect(client: ClientWithCoreApi, signer: Signer, tx: Transaction) {
  return Effect.gen(function* () {
    const res = yield* tryPromise("signAndExecute.submit", () =>
      client.core.signAndExecuteTransaction({ transaction: tx, signer, include: FULL_INCLUDE }));
    const result = yield* trySync("signAndExecute.result", () => toExecResult(res));
    yield* tryPromise("signAndExecute.finality", (signal) => client.core.waitForTransaction({ signal, digest: result.digest }));
    return result;
  }).pipe(Effect.uninterruptible);
}

export function signAndExecute(client: ClientWithCoreApi, signer: Signer, tx: Transaction): Promise<ExecResult> {
  return runPromise(signAndExecuteEffect(client, signer, tx));
}

/** Convenience: build from thunks, then sign+execute in one call. */
export function executeThunksEffect(client: ClientWithCoreApi, signer: Signer, ...thunks: TxThunk[]) {
  return Effect.gen(function* () {
    return yield* signAndExecuteEffect(client, signer, yield* buildTxEffect(...thunks));
  });
}

export const execThunksEffect = executeThunksEffect;
export function execThunks(client: ClientWithCoreApi, signer: Signer, ...thunks: TxThunk[]): Promise<ExecResult> {
  return runPromise(executeThunksEffect(client, signer, ...thunks));
}
export const executeThunks = execThunks;

// ── Object-change extractors ────────────────────────────────────────────────

/** The package id from the (single) newly-published package. */
export function publishedPackageId(r: ExecResult): string {
  const pkg = r.changedObjects.find((c) => c.idOperation === "Created" && c.outputState === "PackageWrite");
  if (!pkg) throw new Error("No published package found in object changes.");
  return pkg.objectId;
}

/** All package ids newly published by the transaction (up to 5 per PTB). */
export function allPublishedPackageIds(r: ExecResult): string[] {
  return r.changedObjects
    .filter((c) => c.idOperation === "Created" && c.outputState === "PackageWrite")
    .map((c) => c.objectId);
}

/** The first newly-created object whose type contains `substr`. */
export function createdByType(r: ExecResult, substr: string): string {
  const id = maybeCreatedByType(r, substr);
  if (!id) throw new Error(`No created object with type containing "${substr}" found in object changes.`);
  return id;
}

/** Like {@link createdByType} but returns undefined instead of throwing. */
export function maybeCreatedByType(r: ExecResult, substr: string): string | undefined {
  for (const c of r.changedObjects) {
    if (c.idOperation === "Created" && (r.objectTypes[c.objectId] ?? "").includes(substr)) return c.objectId;
  }
  return undefined;
}

/** The first newly-created object whose type is EXACTLY `type` (for non-generic types). */
export function createdByExactType(r: ExecResult, type: string): string {
  for (const c of r.changedObjects) {
    if (c.idOperation === "Created" && r.objectTypes[c.objectId] === type) return c.objectId;
  }
  throw new Error(`No created object of exact type "${type}" found in object changes.`);
}

/** All newly-created objects whose type contains `substr`. */
export function allCreatedByType(r: ExecResult, substr: string): { objectId: string; objectType: string }[] {
  const out: { objectId: string; objectType: string }[] = [];
  for (const c of r.changedObjects) {
    const type = r.objectTypes[c.objectId] ?? "";
    if (c.idOperation === "Created" && type.includes(substr)) out.push({ objectId: c.objectId, objectType: type });
  }
  return out;
}

/** The signed balance delta for `address` in `coinType`, or "0" if absent. */
export function balanceDelta(r: ExecResult, address: string, coinType: string): string {
  const change = r.balanceChanges.find((b) => b.address === address && b.coinType === coinType);
  return change?.amount ?? "0";
}

function netGas(gasUsed: SuiClientTypes.GasCostSummary): number {
  return Number(gasUsed.computationCost) + Number(gasUsed.storageCost) - Number(gasUsed.storageRebate);
}
