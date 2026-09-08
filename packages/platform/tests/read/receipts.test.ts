// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import * as listing from "../../src/contracts/record_shop/listing.ts";
import {
  MalformedRecordSoldEventError,
  findRecordSale,
  findRecordSales,
  isRecordSoldEventType,
} from "../../src/read/receipts.ts";

const SHOP_PACKAGE = "0xa";
const CURRENCY = "0x2::sui::SUI";
const IDS = {
  listing: `0x${"11".repeat(32)}`,
  pressing: `0x${"22".repeat(32)}`,
  release: `0x${"33".repeat(32)}`,
  record: `0x${"44".repeat(32)}`,
  secondRecord: `0x${"45".repeat(32)}`,
  buyer: `0x${"55".repeat(32)}`,
};

function eventType(packageId = SHOP_PACKAGE, currency = CURRENCY): string {
  return `${packageId}::listing::RecordSoldEvent<${currency}>`;
}

function bcsEvent(
  pricing: { Fixed: string } | { Floor: string },
  recordId = IDS.record,
  purchaseCurrency = CURRENCY,
) {
  const configured = BigInt("Fixed" in pricing ? pricing.Fixed : pricing.Floor);
  const purchasePrice = "Floor" in pricing ? configured + 50n : configured;
  return listing.RecordSoldEvent.serialize({
    listing_id: IDS.listing,
    record_id: recordId,
    release_id: IDS.release,
    pressing_id: IDS.pressing,
    edition: 2,
    number: recordId === IDS.record ? 7 : 8,
    purchase_currency: { name: purchaseCurrency },
    purchase_price: purchasePrice.toString(),
    purchased_by: IDS.buyer,
    purchased_timestamp_ms: "1234",
    pricing,
  }).toBytes();
}

describe("Record Shop sale receipts", () => {
  test("requires the exact shop event and one currency argument", () => {
    expect(isRecordSoldEventType(eventType(), SHOP_PACKAGE)).toBeTrue();
    expect(isRecordSoldEventType(eventType("0xb"), SHOP_PACKAGE)).toBeFalse();
    expect(isRecordSoldEventType(
      `${SHOP_PACKAGE}::listing::RecordSoldEvent<${CURRENCY},${CURRENCY}>`,
      SHOP_PACKAGE,
    )).toBeFalse();
  });

  test("preserves every canonical sale in event order and selects by Record ID", () => {
    const events = [
      { eventType: eventType(), bcs: bcsEvent({ Fixed: "99" }), json: null },
      { eventType: eventType("0xb"), bcs: bcsEvent({ Fixed: "1" }), json: null },
      { eventType: eventType(), bcs: bcsEvent({ Floor: "2500" }, IDS.secondRecord), json: null },
    ];
    const sales = findRecordSales(events, SHOP_PACKAGE);
    expect(sales.map((sale) => sale.recordId)).toEqual([IDS.record, IDS.secondRecord]);
    expect(sales.map((sale) => sale.pricing.kind)).toEqual(["fixed", "floor"]);
    expect(sales[1]).toMatchObject({ edition: 2, number: 8, purchasePrice: "2550" });
    expect(findRecordSale(events, SHOP_PACKAGE, IDS.secondRecord)?.recordId).toBe(IDS.secondRecord);
  });

  test("validates embedded TypeName and never falls back from malformed canonical BCS", () => {
    const malformed = {
      eventType: eventType(),
      bcs: bcsEvent({ Fixed: "99" }, IDS.record, "0x2::other::OTHER"),
      json: {
        listing_id: IDS.listing,
        record_id: IDS.record,
        release_id: IDS.release,
        pressing_id: IDS.pressing,
        edition: 2,
        number: 7,
        purchase_currency: { name: CURRENCY },
        purchase_price: "99",
        purchased_by: IDS.buyer,
        purchased_timestamp_ms: "1234",
        pricing: { Fixed: "99" },
      },
    };
    expect(() => findRecordSales([malformed], SHOP_PACKAGE)).toThrow(MalformedRecordSoldEventError);
  });

  test("accepts the exact JSON transport projection only when BCS is absent", () => {
    const sale = findRecordSale([{
      eventType: eventType(),
      bcs: new Uint8Array(),
      json: {
        listing_id: IDS.listing,
        record_id: IDS.record,
        release_id: IDS.release,
        pressing_id: IDS.pressing,
        edition: 2,
        number: 7,
        purchase_currency: { name: CURRENCY },
        purchase_price: "123",
        purchased_by: IDS.buyer,
        purchased_timestamp_ms: "5678",
        pricing: { Floor: "100" },
      },
    }], SHOP_PACKAGE, IDS.record);
    expect(sale).toMatchObject({
      pricing: { kind: "floor", amount: "100" },
      purchasePrice: "123",
      purchasedTimestampMs: "5678",
    });
  });

  test("rejects values that cannot represent Move unsigned integers", () => {
    const json = {
      listing_id: IDS.listing,
      record_id: IDS.record,
      release_id: IDS.release,
      pressing_id: IDS.pressing,
      edition: 2,
      number: 7,
      purchase_currency: { name: CURRENCY },
      purchase_price: 123,
      purchased_by: IDS.buyer,
      purchased_timestamp_ms: 5678,
      pricing: { Floor: 100 },
    };
    const sale = (overrides: Record<string, unknown>) => findRecordSale([{
      eventType: eventType(),
      bcs: new Uint8Array(),
      json: { ...json, ...overrides },
    }], SHOP_PACKAGE, IDS.record);

    expect(() => sale({ purchase_price: 123.75 })).toThrow(
      MalformedRecordSoldEventError,
    );
    expect(() => sale({ purchase_price: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
      MalformedRecordSoldEventError,
    );
    expect(() => sale({ purchase_price: (1n << 64n).toString() })).toThrow(
      MalformedRecordSoldEventError,
    );
    expect(() => sale({ edition: 2.5 })).toThrow(
      MalformedRecordSoldEventError,
    );
    expect(() => sale({ purchased_timestamp_ms: -1 })).toThrow(
      MalformedRecordSoldEventError,
    );
  });
});
