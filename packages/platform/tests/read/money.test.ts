// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// The two places this SDK does arithmetic with somebody's money: resolving a
// currency's decimals, and splitting a paid amount into royalties.

import { describe, expect, test } from "bun:test";
import { currencyInfo } from "../../src/read/catalog.ts";
import { breakdown } from "../../src/read/receipts.ts";
import type { TrackView } from "../../src/read/types.ts";

describe("currencyInfo", () => {
  test("knows the testnet dollar is 6dp", () => {
    const c = currencyInfo("0x7777::fakeusd::FakeUsd");
    expect(c).toEqual({ type: "0x7777::fakeusd::FakeUsd", symbol: "FAKEUSD", decimals: 6 });
  });

  test("knows SUI is 9dp", () => {
    expect(currencyInfo("0x2::sui::SUI").decimals).toBe(9);
  });

  test("falls back to the module name at 9dp for an unknown coin", () => {
    expect(currencyInfo("0xabc::usdc::USDC")).toEqual({ type: "0xabc::usdc::USDC", symbol: "USDC", decimals: 9 });
  });

  test("a listing with an unreadable type tag still renders", () => {
    expect(currencyInfo(null)).toEqual({ type: null, symbol: "COIN", decimals: 9 });
  });
});

const track = (no: string, recordingId: string, splitBps: number): TrackView => ({
  no,
  title: `Track ${no}`,
  recordingId,
  compositionId: `${recordingId}-composition`,
  splitBps,
  disc: 1,
});

describe("breakdown", () => {
  // The Between the Doors splits: 35% / 15% / 20% / 30%.
  const tracks = [track("1", "0xr1", 3500), track("2", "0xr2", 1500), track("3", "0xr3", 2000), track("4", "0xr4", 3000)];

  test("splits the paid amount by each track's share of the release", () => {
    // $1.00 at 6dp.
    const rows = breakdown(tracks, "1000000", {});
    expect(rows.map((r) => r.amount)).toEqual(["350000", "150000", "200000", "300000"]);
  });

  test("splits each track again between its composition and its recording", () => {
    // A 10% composition royalty on track 1: 35c → 3.5c composition, 31.5c recording.
    const rows = breakdown(tracks, "1000000", { "0xr1": 1000 });
    expect(rows[0]!.composition).toBe("35000");
    expect(rows[0]!.recording).toBe("315000");
    expect(BigInt(rows[0]!.composition!) + BigInt(rows[0]!.recording!)).toBe(BigInt(rows[0]!.amount));
  });

  test("stops at the track level when a composition rate could not be resolved", () => {
    const rows = breakdown(tracks, "1000000", { "0xr1": 1000 });
    expect(rows[1]!.composition).toBeNull();
    expect(rows[1]!.recording).toBeNull();
    // The track amount is still shown — a missing rate costs the sub-rows only.
    expect(rows[1]!.amount).toBe("150000");
  });

  test("truncates exactly like the on-chain integer math", () => {
    // 1 base unit at 35% truncates to 0 on chain; it must here too, not round to 1.
    expect(breakdown([track("1", "0xr1", 3500)], "1", {})[0]!.amount).toBe("0");
    // 3 units at 35% = 1.05 → 1.
    expect(breakdown([track("1", "0xr1", 3500)], "3", {})[0]!.amount).toBe("1");
  });

  test("holds precision past Number.MAX_SAFE_INTEGER", () => {
    const paid = "10000000000000000000"; // 1e19, well beyond f64 integer precision
    const [row] = breakdown([track("1", "0xr1", 3500)], paid, { "0xr1": 1000 });
    expect(row!.amount).toBe("3500000000000000000");
    expect(row!.composition).toBe("350000000000000000");
    expect(row!.recording).toBe("3150000000000000000");
  });

  test("a floor-priced overpay distributes the whole amount paid, not the list price", () => {
    // The buyer chose $5 on a $1 floor — every track's share scales with it.
    const rows = breakdown(tracks, "5000000", {});
    const total = rows.reduce((n, r) => n + BigInt(r.amount), 0n);
    expect(total).toBe(5_000_000n);
  });

  test("returns only JSON-safe scalars", () => {
    const rows = breakdown(tracks, "1000000", { "0xr1": 1000 });
    expect(() => JSON.stringify(rows)).not.toThrow();
    expect(JSON.parse(JSON.stringify(rows))).toEqual(rows);
  });
});
