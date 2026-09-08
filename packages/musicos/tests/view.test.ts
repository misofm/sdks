// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { bcs } from "@mysten/sui/bcs";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { deriveTargetReleaseId } from "../src/view.ts";

const PKG = "0x" + "cd".repeat(32);
const REGISTRY = "0x" + "ab".repeat(32);
const RECORDING = "0x" + "ef".repeat(32);

test("deriveTargetReleaseId sends the core registry as the first Move argument", async () => {
  let transaction: { getData(): unknown } | undefined;
  const client = {
    core: {
      simulateTransaction: async (request: { transaction: { getData(): unknown } }) => {
        transaction = request.transaction;
        return {
          $kind: "Transaction",
          commandResults: [{ returnValues: [{ bcs: bcs.Address.serialize(RECORDING).toBytes() }] }],
        };
      },
    },
  } as unknown as ClientWithCoreApi;

  await expect(
    deriveTargetReleaseId(client, PKG, {
      sender: REGISTRY,
      releaseRegistryId: REGISTRY,
      recordingIds: [RECORDING],
      splitBps: [10_000],
      nonce: "42",
    }),
  ).resolves.toBe(RECORDING);

  const data = transaction!.getData() as {
    inputs: { $kind: string; UnresolvedObject?: { objectId: string } }[];
    commands: {
      MoveCall?: { module: string; function: string; arguments: { Input?: number }[] };
    }[];
  };
  const call = data.commands[0]!.MoveCall!;
  expect(call).toMatchObject({ module: "release", function: "derive_target_release_id" });
  expect(data.inputs[call.arguments[0]!.Input!]).toEqual({
    $kind: "UnresolvedObject",
    UnresolvedObject: { objectId: REGISTRY },
  });
});

test("deriveTargetReleaseId rejects unsafe JavaScript integer inputs before simulation", async () => {
  const client = {
    core: {
      simulateTransaction: async () => {
        throw new Error("must not simulate unsafe input");
      },
    },
  } as unknown as ClientWithCoreApi;
  await expect(
    deriveTargetReleaseId(client, PKG, {
      sender: REGISTRY,
      recordingIds: [RECORDING],
      splitBps: [Number.MAX_SAFE_INTEGER + 2],
      nonce: "1",
      releaseRegistryId: REGISTRY,
    }),
  ).rejects.toThrow("safe integer");
});
