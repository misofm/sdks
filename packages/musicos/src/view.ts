// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Simulate-based reads (the `view` surface). These build a transaction and run it
// through the Core `simulateTransaction` API to read a computed value without
// changing state — used where the value is a pure function of inputs the chain
// derives (e.g. the deterministic release id).

import { Effect } from "effect";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { SuiClient, SuiRpcError } from "@misofm/effect";
import * as release from "./contracts/musicos/release.ts";
import { asU256, asU64, type UnsignedInput } from "./numeric.ts";

export interface DeriveTargetReleaseIdParams {
  /** Sender for the simulation (any address; not charged). */
  sender: string;
  /** Recording object ids, in track order. */
  recordingIds: string[];
  /** Per-track split basis points, aligned to `recordingIds`. */
  splitBps: UnsignedInput[];
  /** The release nonce (u256 as a decimal string). */
  nonce: UnsignedInput;
  /** Shared canonical core `miso::release::ReleaseRegistry` object ID. */
  releaseRegistryId: string;
}

/**
 * Derives the release id the on-chain `release::new` will produce for these
 * inputs, via a `simulateTransaction` call to `release::derive_target_release_id`.
 * Tracks embedded in a release must reference this exact ID, so it is computed
 * up front and threaded into the core release builder.
 */
export const deriveTargetReleaseId = Effect.fn("deriveTargetReleaseId")(function* (
  misoPackageId: string,
  params: DeriveTargetReleaseIdParams,
): Effect.fn.Return<string, SuiRpcError, SuiClient> {
  if (params.recordingIds.length !== params.splitBps.length) {
    throw new Error(
      `deriveTargetReleaseId: recordingIds (${params.recordingIds.length}) and splitBps (${params.splitBps.length}) length mismatch.`,
    );
  }

  const tx = new Transaction();
  tx.setSender(params.sender);
  tx.add(
    release.deriveTargetReleaseId({
      package: misoPackageId,
      arguments: [
        params.releaseRegistryId,
        params.recordingIds,
        params.splitBps.map((v) => asU64("track split bps", v)),
        asU256("release nonce", params.nonce),
      ],
    }),
  );

  const client = yield* SuiClient;
  // gRPC/Core equivalent of devInspect: simulate with per-command return values.
  const res = yield* Effect.tryPromise({
    try: (signal) => client.core.simulateTransaction({ transaction: tx, include: { commandResults: true }, signal }),
    catch: (cause) => new SuiRpcError({ operation: "simulateTransaction", cause }),
  });
  if (res.$kind !== "Transaction") {
    return yield* new SuiRpcError({
      operation: "simulateTransaction",
      cause: new Error(`derive_target_release_id simulation failed: ${JSON.stringify(res.FailedTransaction.status)}`),
    });
  }
  const returned = res.commandResults?.[0]?.returnValues?.[0]?.bcs;
  if (!returned) {
    return yield* new SuiRpcError({
      operation: "simulateTransaction",
      cause: new Error("derive_target_release_id returned no value."),
    });
  }
  return bcs.Address.parse(returned);
});
