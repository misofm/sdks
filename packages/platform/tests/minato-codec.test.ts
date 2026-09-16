import { expect, test } from "bun:test";
import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { encodeMinatoDistribution } from "../src/minato-codec.ts";
import { disperseShares } from "../src/transactions.ts";

// Independent golden bytes from Minato's documented codec v1.
test("Minato golden run encoding preserves sorted address/amount pairs", () => {
  const input = [{ address: "0x3", value: 128 }, { address: "0x2", value: 1 }, { address: "0x1", value: 1 }];
  expect(encodeMinatoDistribution(input)).toEqual({
    recipients: ["0x1", "0x2", "0x3"].map((address) => normalizeSuiAddress(address)),
    runs: [2, 1, 2, 127, 1],
  });
  expect(input[0]!.value).toBe(128);
  expect(encodeMinatoDistribution([{ address: "0x1", value: 128 }]).runs).toEqual([1, 128, 1, 1]);
});

test("Minato u64 maximum uses all ten ULEB128 bytes without number rounding", () => {
  expect(encodeMinatoDistribution([{ address: "0x1", value: 0xffff_ffff_ffff_ffffn }]).runs)
    .toEqual([1, ...Array(9).fill(255), 1, 1]);
});

test("Minato retains duplicate-recipient payments supported by the contract", () => {
  expect(encodeMinatoDistribution([{ address: "0x1", value: 1 }, { address: "0x1", value: 2 }]))
    .toEqual({ recipients: [normalizeSuiAddress("0x1"), normalizeSuiAddress("0x1")], runs: [2, 1, 1, 1, 1] });
});

test("invalid distributions fail before adding any PTB commands", () => {
  for (const recipients of [[], [{ address: "0x1", value: 0 }], [{ address: "bad!", value: 1 }],
    [{ address: "", value: 1 }], [{ address: "0x", value: 1 }],
    [{ address: "0x1", value: 0xffff_ffff_ffff_ffffn }, { address: "0x2", value: 1 }]]) {
    const tx = new Transaction();
    expect(() => disperseShares(tx, "0x99", "0x2::sui::SUI", tx.object("0x12"), recipients)).toThrow();
    expect(tx.getData().commands).toHaveLength(0);
  }
});

test("share dispersal matches deployed ABI and consumes the emptied balance", () => {
  const tx = new Transaction();
  const balance = tx.object("0x12");
  disperseShares(tx, "0x99", "0x2::sui::SUI", balance,
    [{ address: "0x2", value: 128 }, { address: "0x1", value: 1 }]);
  const data = tx.getData();
  expect(data.commands).toHaveLength(2);
  const call = data.commands[0]!.MoveCall!;
  expect(call.function).toBe("disperse");
  expect(call.typeArguments).toEqual(["0x2::sui::SUI"]);
  expect(call.arguments).toHaveLength(3);
  const addressArg = call.arguments[1]!;
  const runArg = call.arguments[2]!;
  if (addressArg.$kind !== "Input" || runArg.$kind !== "Input") {
    throw new Error("Minato distribution arguments must be pure inputs");
  }
  const addresses = data.inputs[addressArg.Input]!.Pure!.bytes;
  const runs = data.inputs[runArg.Input]!.Pure!.bytes;
  expect(bcs.vector(bcs.Address).parse(Buffer.from(addresses, "base64"))).toEqual(["0x1", "0x2"].map((address) => normalizeSuiAddress(address)));
  expect(bcs.vector(bcs.U8).parse(Buffer.from(runs, "base64"))).toEqual([2, 1, 1, 127, 1]);
  expect(data.commands[1]!.MoveCall!.function).toBe("destroy_zero");
  expect(data.commands[1]!.MoveCall!.arguments[0]).toEqual(call.arguments[0]);
});
