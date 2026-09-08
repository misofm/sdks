// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { SuiClient } from "@misofm/effect";
import * as recordContract from "../../src/contracts/record/record.ts";
import { deriveRecordId } from "../../src/pressing.ts";
import type { MisoConfig } from "../../src/read/config.ts";
import { getBalance, getOwnedRecords } from "../../src/read/wallet.ts";

type Obj = { objectId: string; type: string; content?: Uint8Array | null };
type Page = { objects: Obj[]; hasNextPage: boolean; cursor: string | null };

const RECORD_PACKAGE = `0x${"ab".repeat(32)}`;
const RECORD_SHOP_PACKAGE = `0x${"ac".repeat(32)}`;
const WRONG_RECORD_PACKAGE = `0x${"cd".repeat(32)}`;
const PRESSING_ID = `0x${"ef".repeat(32)}`;
const RELEASE_ID = `0x${"12".repeat(32)}`;
const BUYER = `0x${"34".repeat(32)}`;
const CURRENCY = "0x2::sui::SUI";
const NORMALIZED_CURRENCY = `0x${"0".repeat(63)}2::sui::SUI`;
const RECORD_TYPE = `${RECORD_PACKAGE}::record::Record`;

function recordObject(
  number: number,
  options: {
    objectId?: string;
    embeddedId?: string;
    type?: string;
    purchaseCurrency?: string;
  } = {},
): Obj {
  const objectId = options.objectId ?? deriveRecordId(PRESSING_ID, number, RECORD_PACKAGE);
  return {
    objectId,
    type: options.type ?? RECORD_TYPE,
    content: recordContract.Record.serialize({
      id: options.embeddedId ?? objectId,
      release_id: RELEASE_ID,
      pressing_id: PRESSING_ID,
      edition: 2,
      number,
      purchase_currency: { name: options.purchaseCurrency ?? CURRENCY },
      purchase_price: "2500",
      purchased_by: BUYER,
      purchased_timestamp_ms: "1234",
    }).toBytes(),
  };
}

/** A client whose `listOwnedObjects` serves the given pages in order. */
function fakeClient(pages: Page[]): { client: ClientWithCoreApi; calls: number; types: string[] } {
  const state = { calls: 0, types: [] as string[] };
  const client = {
    core: {
      listOwnedObjects: async ({ type }: { type?: string }) => {
        if (type) state.types.push(type);
        const page = pages[state.calls] ?? { objects: [], hasNextPage: false, cursor: null };
        state.calls++;
        return page;
      },
    },
  } as unknown as ClientWithCoreApi;
  return {
    client,
    get calls() {
      return state.calls;
    },
    get types() {
      return state.types;
    },
  };
}

const recordSalesConfig = {
  recordSales: {
    status: "available",
    recordPackageId: RECORD_PACKAGE,
    recordShopPackageId: RECORD_SHOP_PACKAGE,
  },
} as unknown as MisoConfig;

function run<A, E>(client: ClientWithCoreApi, effect: Effect.Effect<A, E, SuiClient>): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(SuiClient.layer(client))));
}

describe("getOwnedRecords", () => {
  test("projects exact finalized Record purchase provenance", async () => {
    const record = recordObject(7);
    const fake = fakeClient([{
      objects: [
        record,
        recordObject(8, { type: `${WRONG_RECORD_PACKAGE}::record::Record` }),
      ],
      hasNextPage: false,
      cursor: null,
    }]);

    await expect(run(fake.client, getOwnedRecords("0xowner", recordSalesConfig))).resolves.toEqual([{
      id: record.objectId,
      type: RECORD_TYPE,
      releaseId: RELEASE_ID,
      pressingId: PRESSING_ID,
      edition: 2,
      number: 7,
      purchaseCurrency: NORMALIZED_CURRENCY,
      purchasePrice: "2500",
      purchasedBy: BUYER,
      purchasedTimestampMs: "1234",
    }]);
    expect(fake.types).toEqual([RECORD_TYPE]);
  });

  test("rejects generic and foreign Record types", async () => {
    const trusted = recordObject(1);
    const { client } = fakeClient([{
      objects: [
        trusted,
        recordObject(2, { type: `${RECORD_TYPE}<${CURRENCY}>` }),
        recordObject(3, { type: `${WRONG_RECORD_PACKAGE}::record::Record` }),
        recordObject(4, { type: `${RECORD_PACKAGE}::record::Record<${CURRENCY},${CURRENCY}>` }),
      ],
      hasNextPage: false,
      cursor: null,
    }]);

    const records = await run(client, getOwnedRecords("0xowner", recordSalesConfig));
    expect(records.map(({ id }) => id)).toEqual([trusted.objectId]);
  });

  test("fails closed when an exact Record has no BCS content", async () => {
    const { client } = fakeClient([{
      objects: [{ objectId: "0x1", type: RECORD_TYPE }],
      hasNextPage: false,
      cursor: null,
    }]);

    await expect(run(client, getOwnedRecords("0xowner", recordSalesConfig))).rejects.toThrow(/no BCS content/);
  });

  test("fails closed when the embedded UID disagrees with the object id", async () => {
    const object = recordObject(5, { embeddedId: `0x${"56".repeat(32)}` });
    const { client } = fakeClient([{ objects: [object], hasNextPage: false, cursor: null }]);

    await expect(run(client, getOwnedRecords("0xowner", recordSalesConfig))).rejects.toThrow(
      /mismatched embedded UID/,
    );
  });

  test("fails closed when the Record identity is not derived from its Pressing and number", async () => {
    const arbitraryId = `0x${"78".repeat(32)}`;
    const object = recordObject(6, { objectId: arbitraryId, embeddedId: arbitraryId });
    const { client } = fakeClient([{ objects: [object], hasNextPage: false, cursor: null }]);

    await expect(run(client, getOwnedRecords("0xowner", recordSalesConfig))).rejects.toThrow(/not derived/);
  });

  test("follows pagination until the last page", async () => {
    const page = (number: number, hasNext: boolean, cursor: string | null): Page => ({
      objects: [recordObject(number)],
      hasNextPage: hasNext,
      cursor,
    });
    const fake = fakeClient([page(1, true, "c1"), page(2, true, "c2"), page(3, false, null)]);

    const records = await run(fake.client, getOwnedRecords("0xowner", recordSalesConfig));
    expect(records.map(({ id }) => id)).toEqual([
      deriveRecordId(PRESSING_ID, 1, RECORD_PACKAGE),
      deriveRecordId(PRESSING_ID, 2, RECORD_PACKAGE),
      deriveRecordId(PRESSING_ID, 3, RECORD_PACKAGE),
    ]);
    expect(fake.calls).toBe(3);
  });

  test("stops at the page cap so a huge wallet cannot spin forever", async () => {
    const endless: Page[] = Array.from({ length: 50 }, (_, index) => ({
      objects: [recordObject(index + 1)],
      hasNextPage: true,
      cursor: `c${index}`,
    }));
    const fake = fakeClient(endless);

    const records = await run(fake.client, getOwnedRecords("0xowner", recordSalesConfig));
    expect(fake.calls).toBe(20);
    expect(records).toHaveLength(20);
  });

  test("stops when the node claims another page but returns no cursor", async () => {
    const fake = fakeClient([{
      objects: [recordObject(1)],
      hasNextPage: true,
      cursor: null,
    }]);

    await expect(run(fake.client, getOwnedRecords("0xowner", recordSalesConfig))).resolves.toHaveLength(1);
    expect(fake.calls).toBe(1);
  });

  test("fails closed when Record sales are unavailable", async () => {
    const config = {
      recordSales: { status: "unavailable", reason: "legacy deployment" },
    } as unknown as MisoConfig;
    const { client } = fakeClient([]);

    await expect(run(client, getOwnedRecords("0xowner", config))).rejects.toThrow(/unavailable: legacy deployment/);
  });
});

describe("getBalance", () => {
  test("preserves storage breakdown and resolves decimals from cached chain metadata", async () => {
    const balanceCalls: Array<{ owner: string; coinType: string }> = [];
    const metadataCalls: string[] = [];
    const client = {
      core: {
        getBalance: async ({ owner, coinType }: { owner: string; coinType: string }) => {
          balanceCalls.push({ owner, coinType });
          return {
            balance: {
              coinType,
              balance: "90000000",
              coinBalance: "55000000",
              addressBalance: "35000000",
            },
          };
        },
        getCoinMetadata: async ({ coinType }: { coinType: string }) => {
          metadataCalls.push(coinType);
          return {
            coinMetadata: {
              id: "0xmetadata",
              decimals: 6,
              name: "USD",
              symbol: "USD",
              description: "",
              iconUrl: null,
            },
          };
        },
      },
    } as unknown as ClientWithCoreApi;
    const config = { money: { usdCoinType: "0x2::usd::USD", usdDecimals: 99 } } as unknown as MisoConfig;

    const expected = {
      address: `0x${"0".repeat(63)}1`,
      coinType: "0x2::usd::USD",
      balance: "90000000",
      coinBalance: "55000000",
      addressBalance: "35000000",
      decimals: 6,
    };
    await expect(run(client, getBalance("0x1", config))).resolves.toEqual(expected);
    await expect(run(client, getBalance("0x1", config))).resolves.toEqual(expected);
    expect(balanceCalls).toEqual([
      { owner: "0x1", coinType: "0x2::usd::USD" },
      { owner: "0x1", coinType: "0x2::usd::USD" },
    ]);
    expect(metadataCalls).toEqual([`0x${"0".repeat(63)}2::usd::USD`]);
  });

  test("fails closed when coin metadata is unavailable", async () => {
    const client = {
      core: {
        getBalance: async () => ({
          balance: {
            coinType: "0x2::usd::USD",
            balance: "0",
            coinBalance: "0",
            addressBalance: "0",
          },
        }),
        getCoinMetadata: async () => ({ coinMetadata: null }),
      },
    } as unknown as ClientWithCoreApi;
    const config = { money: { usdCoinType: "0x2::usd::USD", usdDecimals: 99 } } as unknown as MisoConfig;

    const error = await Effect.runPromise(
      getBalance("0x1", config).pipe(Effect.provide(SuiClient.layer(client)), Effect.flip),
    );
    expect(error._tag).toBe("SuiRpcError");
    expect(String((error as { cause?: unknown }).cause)).toMatch(/decimal precision/);
  });
});
