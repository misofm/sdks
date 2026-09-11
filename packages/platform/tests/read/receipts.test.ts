// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { KNOWN_CHAIN_IDS, SuiGraphQL } from "sui-effect";
import { layerTest, SuiTest } from "sui-effect/testing";
import * as listing from "../../src/contracts/record_shop/listing.ts";
import {
  findRecordSale,
  findRecordSales,
  getPurchaseReceipt,
  isRecordSoldEventType,
} from "../../src/read/receipts.ts";
import { misoConfig } from "../../src/read/config.ts";
import { MalformedRecordSoldEventError } from "../../src/errors.ts";

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
  pricing: { fixed: boolean; price: string },
  recordId = IDS.record,
  purchaseCurrency = CURRENCY,
) {
  const configured = BigInt(pricing.price);
  const purchasePrice = pricing.fixed ? configured : configured + 50n;
  return listing.RecordSoldEvent.serialize({
    listing_id: IDS.listing,
    record_id: recordId,
    release_id: IDS.release,
    pressing_id: IDS.pressing,
    edition: 2,
    number: recordId === IDS.record ? 7 : 8,
    purchase_currency: Array.from(new TextEncoder().encode(purchaseCurrency)),
    purchase_price: purchasePrice.toString(),
    purchased_by: IDS.buyer,
    purchased_timestamp_ms: "1234",
    pricing_is_fixed: pricing.fixed,
    price: configured.toString(),
    enabled: true,
    distributor: Array.from(new TextEncoder().encode("0xvendor::dist::D")),
    supply_before: 1,
    supply_delta: 1,
    supply_after: 2,
    has_max_supply: true,
    max_supply: 100,
    payment_recipient: IDS.release,
    proceeds_amount: purchasePrice.toString(),
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
      { eventType: eventType(), bcs: bcsEvent({ fixed: true, price: "99" }), json: null },
      { eventType: eventType("0xb"), bcs: bcsEvent({ fixed: true, price: "1" }), json: null },
      { eventType: eventType(), bcs: bcsEvent({ fixed: false, price: "2500" }, IDS.secondRecord), json: null },
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
      bcs: bcsEvent({ fixed: true, price: "99" }, IDS.record, "0x2::other::OTHER"),
      json: {
        listing_id: IDS.listing,
        record_id: IDS.record,
        release_id: IDS.release,
        pressing_id: IDS.pressing,
        edition: 2,
        number: 7,
        purchase_currency: Array.from(new TextEncoder().encode(CURRENCY)),
        purchase_price: "99",
        purchased_by: IDS.buyer,
        purchased_timestamp_ms: "1234",
        pricing_is_fixed: true,
        price: "99",
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
        purchase_currency: Array.from(new TextEncoder().encode(CURRENCY)),
        purchase_price: "123",
        purchased_by: IDS.buyer,
        purchased_timestamp_ms: "5678",
        pricing_is_fixed: false,
        price: "100",
      },
    }], SHOP_PACKAGE, IDS.record);
    expect(sale).toMatchObject({
      pricing: { kind: "floor", amount: "100" },
      purchasePrice: "123",
      purchasedTimestampMs: "5678",
    });
  });

  test("accepts GraphQL MoveValue Base64 vectors and rejects malformed encodings", () => {
    const base64 = btoa(CURRENCY);
    const sale = (purchase_currency: unknown) => findRecordSale([{
      eventType: eventType(),
      bcs: new Uint8Array(),
      json: {
        listing_id: IDS.listing,
        record_id: IDS.record,
        release_id: IDS.release,
        pressing_id: IDS.pressing,
        edition: 2,
        number: 7,
        purchase_currency,
        purchase_price: "123",
        purchased_by: IDS.buyer,
        purchased_timestamp_ms: "5678",
        pricing_is_fixed: false,
        price: "100",
      },
    }], SHOP_PACKAGE, IDS.record);
    expect(sale(base64)?.purchaseCurrency).toContain("::sui::SUI");
    expect(() => sale(`${base64.slice(0, -1)}!`)).toThrow(MalformedRecordSoldEventError);
    expect(() => sale(CURRENCY)).toThrow(MalformedRecordSoldEventError);
  });

  test("rejects values that cannot represent Move unsigned integers", () => {
    const json = {
      listing_id: IDS.listing,
      record_id: IDS.record,
      release_id: IDS.release,
      pressing_id: IDS.pressing,
      edition: 2,
      number: 7,
      purchase_currency: Array.from(new TextEncoder().encode(CURRENCY)),
      purchase_price: 123,
      purchased_by: IDS.buyer,
      purchased_timestamp_ms: 5678,
      pricing_is_fixed: false,
      price: 100,
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

  test("rejects malformed rich pricing and byte-vector JSON at the GraphQL boundary", () => {
    const json = {
      listing_id: IDS.listing,
      record_id: IDS.record,
      release_id: IDS.release,
      pressing_id: IDS.pressing,
      edition: 2,
      number: 7,
      purchase_currency: btoa(CURRENCY),
      purchase_price: "123",
      purchased_by: IDS.buyer,
      purchased_timestamp_ms: "5678",
      pricing_is_fixed: true,
      price: "123",
    };
    const sale = (overrides: Record<string, unknown>) => findRecordSale([{
      eventType: eventType(),
      bcs: new Uint8Array(),
      json: { ...json, ...overrides },
    }], SHOP_PACKAGE, IDS.record);
    expect(() => sale({ pricing_is_fixed: "true" })).toThrow(MalformedRecordSoldEventError);
    expect(() => sale({ price: -1 })).toThrow(MalformedRecordSoldEventError);
    expect(() => sale({ purchase_currency: [1, 256] })).toThrow(MalformedRecordSoldEventError);
    expect(() => sale({ purchase_currency: "YWJj=".replace("=", "==") })).toThrow(MalformedRecordSoldEventError);
  });

  test("uses the real GraphQL fallback after fullnode pruning", async () => {
    const config = misoConfig("testnet");
    const recordSales = config.recordSales;
    if (recordSales.status !== "available") throw new Error("test fixture requires Record sales");
    const calls: unknown[] = [];
    const graphql = {
      query: async (request: unknown) => {
        calls.push(request);
        return {
          data: {
            transaction: {
              effects: {
                status: "SUCCESS",
                events: { nodes: [{ contents: {
                  type: { repr: eventType(recordSales.recordShopPackageId, config.money.usdCoinType) },
                  json: {
                    listing_id: IDS.listing,
                    record_id: IDS.record,
                    release_id: IDS.release,
                    pressing_id: IDS.pressing,
                    edition: 2,
                    number: 7,
                    purchase_currency: btoa(config.money.usdCoinType),
                    purchase_price: "123",
                    purchased_by: IDS.buyer,
                    purchased_timestamp_ms: "5678",
                    pricing_is_fixed: true,
                    price: "123",
                  },
                } }] },
              },
            },
          },
        };
      },
    };
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        // The fullnode does not have this transaction (pruned) — a
        // scripted "not found" `getTransaction` outcome is what
        // `sui.core.waitForTransaction` serves it as, driving the same
        // fallback-to-indexer path the predecessor's thrown "pruned"
        // Error did.
        yield* SuiTest.scriptGetTransaction([{ _tag: "notFound" }]);
        return yield* getPurchaseReceipt("digest", IDS.record, config);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(layerTest({ network: "testnet", chainId: KNOWN_CHAIN_IDS["testnet"]! }), SuiGraphQL.layer(graphql as any)),
          { local: true },
        ),
      ),
    );
    expect(result).toBeNull();
    expect((calls[0] as any).variables).toEqual({ digest: "digest" });
  });

  test("surfaces malformed GraphQL sale JSON from the fallback path", async () => {
    const config = misoConfig("testnet");
    const recordSales = config.recordSales;
    if (recordSales.status !== "available") throw new Error("test fixture requires Record sales");
    const graphql = {
      query: async () => ({
        data: {
          transaction: {
            effects: {
              status: "SUCCESS",
              events: { nodes: [{ contents: {
                type: { repr: eventType(recordSales.recordShopPackageId, config.money.usdCoinType) },
                json: { listing_id: IDS.listing, record_id: IDS.record, release_id: IDS.release, pressing_id: IDS.pressing,
                  edition: 2, number: 7, purchase_currency: "not-base64", purchase_price: "123", purchased_by: IDS.buyer,
                  purchased_timestamp_ms: "5678", pricing_is_fixed: true, price: "123" },
              } }] },
            },
          },
        },
      }),
    };
    const error = await Effect.runPromise(
      Effect.gen(function* () {
        yield* SuiTest.scriptGetTransaction([{ _tag: "notFound" }]);
        return yield* Effect.flip(getPurchaseReceipt("digest", IDS.record, config));
      }).pipe(
        Effect.provide(
          Layer.mergeAll(layerTest({ network: "testnet", chainId: KNOWN_CHAIN_IDS["testnet"]! }), SuiGraphQL.layer(graphql as any)),
          { local: true },
        ),
      ),
    );
    expect(error._tag).toBe("MalformedRecordSoldEventError");
  });
});
