// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { toPromise, tryPromise, workflow, type SdkError } from "@misofm/utils/effect";
import { Effect } from "effect";

// `executeViaExecutor` — the one piece of transaction execution that's specific
// to this package's opinionated publish flows (batched, non-idempotent share-
// currency publishing in `share.ts`). Everything else — `buildTx`,
// `signAndExecute`, `toExecResult`, the object-change extractors — is generic
// PTB execution plumbing that stays in `@misofm/protocol`'s `execute.ts` and is
// re-exported from there; this module builds on top of it.

import { buildTxEffect, FULL_INCLUDE, toExecResult, type ExecResult } from "@misofm/protocol";
import type { SuiClientTypes } from "@mysten/sui/client";
import type { ParallelTransactionExecutor } from "@mysten/sui/transactions";
import type { TxThunk } from "./transactions.ts";

// Consumers of the platform SDK should not need a second direct dependency on
// the protocol SDK just to execute a composed PTB. Keep the generic execution
// surface available through this platform-layer entry point as well.
export * from "@misofm/protocol/execute";

/** Publication execution also needs lifecycle events to associate same-typed
 * objects (notably several new Parties and Vaults) with their manifest refs. */
export const PLATFORM_FULL_INCLUDE = { ...FULL_INCLUDE, events: true } as const;
type PlatformFullInclude = typeof PLATFORM_FULL_INCLUDE;

export interface PlatformExecResult extends ExecResult {
  events: SuiClientTypes.Event[];
}

/**
 * Builds a transaction from thunks and executes it through the parallel executor,
 * exactly ONCE.
 *
 * These PTBs are typically non-idempotent (publish a package, initialize a
 * currency, consume a TreasuryCap). A thrown transport error is ambiguous — the tx
 * may already have committed — so blindly rebuilding and re-submitting would risk
 * double-execution or a guaranteed abort against already-consumed inputs. We
 * therefore do NOT auto-retry: any error propagates and recovery is the caller's
 * job (e.g. a resumable checkpoint that reconciles against on-chain state). A Move
 * abort RESOLVES as a `FailedTransaction`, so `toExecResult` surfaces it too.
 */
export function executeViaExecutorEffect(
  executor: ParallelTransactionExecutor,
  ...thunks: TxThunk[]
): Effect.Effect<PlatformExecResult, SdkError> {
  return workflow("executeViaExecutor", function* () {
    const tx = yield* buildTxEffect(...thunks);
    const res: SuiClientTypes.TransactionResult<PlatformFullInclude> = yield* tryPromise("executeViaExecutor", () =>
      executor.executeTransaction(tx, PLATFORM_FULL_INCLUDE),
    );
    const base = toExecResult(res);
    if (res.$kind !== "Transaction") throw new Error("unreachable: toExecResult accepted a failed transaction");
    return { ...base, events: res.Transaction.events ?? [] };
  }).pipe(Effect.uninterruptible);
}

export const executeViaExecutor = toPromise(executeViaExecutorEffect);
