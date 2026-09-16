// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { Transaction } from "@mysten/sui/transactions";
import * as compositionPool from "../src/contracts/composition_royalty_pool/composition_royalty_pool.ts";
import * as recordingPool from "../src/contracts/recording_royalty_pool/recording_royalty_pool.ts";
import * as royaltyPool from "../src/contracts/royalty_pool/pool.ts";

const PACKAGE = `0x${"10".repeat(32)}`;
const PARENT = `0x${"20".repeat(32)}`;
const ADMIN_CAP = `0x${"30".repeat(32)}`;
const SHARE_CURRENCY = `0x${"40".repeat(32)}`;
const SHARE = `${PACKAGE}::share::Share`;
const PAYOUT = "0x2::sui::SUI";

function moveCallObjectIds(tx: Transaction): string[] {
  const command = tx.getData().commands[0];
  if (command?.$kind !== "MoveCall") throw new Error("expected one Move call");

  return command.MoveCall.arguments.map((argument) => {
    if (argument.$kind !== "Input") throw new Error("expected an object input");
    const input = tx.getData().inputs[argument.Input];
    if (input?.$kind !== "UnresolvedObject") throw new Error("expected an unresolved object");
    return input.UnresolvedObject.objectId;
  });
}

test("generated verified-share constructors keep the currency witness in ABI order", () => {
  const primitive = new Transaction();
  royaltyPool._new({
    package: PACKAGE,
    arguments: {
      parent: primitive.object(PARENT),
      shareCurrency: primitive.object(SHARE_CURRENCY),
    },
    typeArguments: [SHARE, PAYOUT],
  })(primitive);
  expect(moveCallObjectIds(primitive)).toEqual([PARENT, SHARE_CURRENCY]);

  const composition = new Transaction();
  compositionPool.newPool({
    package: PACKAGE,
    arguments: {
      composition: composition.object(PARENT),
      adminCap: composition.object(ADMIN_CAP),
      shareCurrency: composition.object(SHARE_CURRENCY),
    },
    typeArguments: [SHARE, PAYOUT],
  })(composition);
  expect(moveCallObjectIds(composition)).toEqual([PARENT, ADMIN_CAP, SHARE_CURRENCY]);

  const recording = new Transaction();
  recordingPool.newPool({
    package: PACKAGE,
    arguments: {
      recording: recording.object(PARENT),
      adminCap: recording.object(ADMIN_CAP),
      shareCurrency: recording.object(SHARE_CURRENCY),
    },
    typeArguments: [SHARE, SHARE, PAYOUT],
  })(recording);
  expect(moveCallObjectIds(recording)).toEqual([PARENT, ADMIN_CAP, SHARE_CURRENCY]);
});
