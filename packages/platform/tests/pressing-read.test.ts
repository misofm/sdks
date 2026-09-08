// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { Effect } from "effect";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { SuiClient } from "@misofm/effect";
import {
  authorizeRecordShop,
  deriveListingId,
  derivePressingAdminCapId,
  derivePressingId,
  deriveRecordId,
  deriveSaleIds,
  getListing,
  getPressing,
  getRecord,
  getSale,
  openListing,
  openPressing,
  purchaseRecord,
  RECORD_SALES_DERIVATION_VECTOR_V1,
} from "../src/pressing.ts";
import * as pressing from "../src/contracts/record/pressing.ts";
import * as record from "../src/contracts/record/record.ts";
import * as listing from "../src/contracts/record_shop/listing.ts";

const BUYER = `0x${"44".repeat(32)}`;
const RELEASE = RECORD_SALES_DERIVATION_VECTOR_V1.releaseId;
const RECORD_PACKAGE = RECORD_SALES_DERIVATION_VECTOR_V1.recordPackageId;
const SHOP_PACKAGE = RECORD_SALES_DERIVATION_VECTOR_V1.recordShopPackageId;
const CURRENCY = RECORD_SALES_DERIVATION_VECTOR_V1.currencyType;
const EDITION = RECORD_SALES_DERIVATION_VECTOR_V1.edition;
const PRESSING = RECORD_SALES_DERIVATION_VECTOR_V1.pressingId;
const LISTING = RECORD_SALES_DERIVATION_VECTOR_V1.listingId;
const RECORD = RECORD_SALES_DERIVATION_VECTOR_V1.recordId;

const pressingBytes = pressing.Pressing.serialize({
  id: PRESSING,
  release_id: RELEASE,
  edition: EDITION,
  supply: 7,
  max_supply: 100,
  distributors: { contents: [{ name: `${SHOP_PACKAGE}::witness::Witness` }] },
}).toBytes();
const listingBytes = listing.Listing.serialize({
  id: LISTING,
  release_id: RELEASE,
  pressing_id: PRESSING,
  pricing: { Floor: "2500" },
  state: { Enabled: true },
}).toBytes();
const recordBytes = record.Record.serialize({
  id: RECORD,
  release_id: RELEASE,
  pressing_id: PRESSING,
  edition: EDITION,
  number: 7,
  purchase_currency: { name: CURRENCY },
  purchase_price: "3000",
  purchased_by: BUYER,
  purchased_timestamp_ms: "1234",
}).toBytes();

function fixtureClient(): ClientWithCoreApi {
  const object = (objectId: string) =>
    objectId === PRESSING
      ? {
          objectId,
          content: pressingBytes,
          type: `${RECORD_PACKAGE}::pressing::Pressing`,
        }
      : objectId === LISTING
        ? {
            objectId,
            content: listingBytes,
            type: `${SHOP_PACKAGE}::listing::Listing<${CURRENCY}>`,
          }
        : objectId === RECORD
          ? {
              objectId,
              content: recordBytes,
              type: `${RECORD_PACKAGE}::record::Record`,
            }
          : undefined;
  return {
    core: {
      getObject: async ({ objectId }: { objectId: string }) => ({
        object: object(objectId),
      }),
      getObjects: async ({ objectIds }: { objectIds: string[] }) => ({
        objects: objectIds.map(
          (id) => object(id) ?? new Error("Object not found"),
        ),
      }),
    },
  } as unknown as ClientWithCoreApi;
}

test("matches the fixed independent edition, cap, listing, and record derivation vector", () => {
  expect(derivePressingId(RELEASE, EDITION, RECORD_PACKAGE)).toBe(PRESSING);
  expect(derivePressingAdminCapId(PRESSING, RECORD_PACKAGE)).toBe(
    RECORD_SALES_DERIVATION_VECTOR_V1.pressingAdminCapId,
  );
  expect(deriveListingId(PRESSING, CURRENCY, SHOP_PACKAGE)).toBe(LISTING);
  expect(
    deriveRecordId(
      PRESSING,
      RECORD_SALES_DERIVATION_VECTOR_V1.recordNumber,
      RECORD_PACKAGE,
    ),
  ).toBe(RECORD);
  expect(
    deriveSaleIds(RELEASE, EDITION, CURRENCY, RECORD_PACKAGE, SHOP_PACKAGE),
  ).toEqual({
    pressingId: PRESSING,
    listingId: LISTING,
  });
  expect(() => derivePressingId(RELEASE, 0, RECORD_PACKAGE)).toThrow(
    /greater than zero/,
  );
  expect(() => derivePressingId(RELEASE, 65_536, RECORD_PACKAGE)).toThrow(
    /65535/,
  );
  expect(() => deriveRecordId(PRESSING, 0, RECORD_PACKAGE)).toThrow(
    /greater than zero/,
  );
  expect(() => deriveRecordId(PRESSING, 0x1_0000_0000, RECORD_PACKAGE)).toThrow(
    /4294967295/,
  );
});

function run<A, E>(client: ClientWithCoreApi, effect: Effect.Effect<A, E, SuiClient>): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(SuiClient.layer(client))));
}

function flip<A, E>(client: ClientWithCoreApi, effect: Effect.Effect<A, E, SuiClient>): Promise<E> {
  return Effect.runPromise(effect.pipe(Effect.provide(SuiClient.layer(client)), Effect.flip));
}

test("reads exact Pressing, Listing, and concrete Record provenance", async () => {
  const client = fixtureClient();
  await expect(run(client, getPressing(PRESSING, RECORD_PACKAGE))).resolves.toMatchObject({
    edition: EDITION,
    supply: 7,
    maxSupply: 100,
  });
  await expect(run(client, getListing(LISTING, SHOP_PACKAGE))).resolves.toMatchObject({
    pricing: { kind: "floor", amount: "2500" },
    state: "enabled",
  });
  await expect(run(client, getRecord(RECORD, RECORD_PACKAGE))).resolves.toMatchObject({
    pressingId: PRESSING,
    edition: EDITION,
    number: 7,
    purchasePrice: "3000",
    purchasedTimestampMs: "1234",
  });
  const sale = await run(
    client,
    getSale({
      releaseId: RELEASE,
      edition: EDITION,
      currencyType: CURRENCY,
      recordPackageId: RECORD_PACKAGE,
      recordShopPackageId: SHOP_PACKAGE,
    }),
  );
  expect(sale.pressing?.supply).toBe(7);
  expect(sale.listing?.pricing.kind).toBe("floor");
});

test("exact readers reject the wrong package and Listing currency", async () => {
  const client = fixtureClient();
  const pressingError = await flip(client, getPressing(PRESSING, "0xc"));
  expect(pressingError._tag).toBe("ObjectTypeMismatchError");

  const listingError = await flip(client, getListing(LISTING, "0xc"));
  expect(listingError._tag).toBe("ObjectTypeMismatchError");

  const wrongCurrency = {
    core: {
      getObject: async () => ({
        object: {
          objectId: LISTING,
          content: listingBytes,
          type: `${SHOP_PACKAGE}::listing::Listing<0x2::other::OTHER>`,
          version: "1",
        },
      }),
    },
  } as unknown as ClientWithCoreApi;
  const decodeError = await flip(wrongCurrency, getListing(LISTING, SHOP_PACKAGE));
  expect(decodeError._tag).toBe("BcsDecodeError");
  expect(String((decodeError as { cause?: unknown }).cause)).toMatch(/derived id/);
});

function calls(
  tx: Transaction,
): Array<{
  package?: string;
  module: string;
  function: string;
  typeArguments: string[];
}> {
  return (
    tx.getData().commands as Array<{
      $kind: string;
      MoveCall?: {
        package?: string;
        module: string;
        function: string;
        typeArguments: string[];
      };
    }>
  )
    .filter((item) => item.$kind === "MoveCall")
    .map((item) => item.MoveCall!);
}

test("initial setup authorizes the shop and consumes every returned Listing before sharing Pressing", () => {
  const tx = new Transaction();
  openPressing({
    releaseId: RELEASE,
    releaseAdminCapId: BUYER,
    edition: EDITION,
    maxSupply: 100,
    listings: [
      { currencyType: CURRENCY, price: { kind: "fixed", amount: "10" } },
      {
        currencyType: "0x2::foo::FOO",
        price: { kind: "floor", amount: "20" },
        state: "disabled",
      },
    ],
    adminCapRecipient: BUYER,
    recordPackageId: RECORD_PACKAGE,
    recordShopPackageId: SHOP_PACKAGE,
  })(tx);
  const sequence = calls(tx).map((call) => `${call.module}::${call.function}`);
  expect(
    sequence.filter((call) => call === "pressing::authorize_distributor"),
  ).toHaveLength(1);
  expect(sequence.filter((call) => call === "listing::new")).toHaveLength(2);
  expect(sequence.filter((call) => call === "listing::share")).toHaveLength(2);
  expect(sequence.indexOf("pressing::authorize_distributor")).toBeLessThan(
    sequence.indexOf("listing::new"),
  );
  expect(sequence.lastIndexOf("listing::share")).toBeLessThan(
    sequence.indexOf("pressing::share"),
  );
});

test("openListing shares its returned object but never changes distributor authorization", () => {
  const tx = new Transaction();
  openListing({
    pressingId: PRESSING,
    pressingAdminCapId: BUYER,
    terms: { currencyType: CURRENCY, price: { kind: "fixed", amount: 1 } },
    recordShopPackageId: SHOP_PACKAGE,
  })(tx);
  const sequence = calls(tx).map((call) => `${call.module}::${call.function}`);
  expect(sequence).toContain("listing::new");
  expect(sequence).toContain("listing::share");
  expect(sequence).not.toContain("pressing::authorize_distributor");
});

test("authorization is an explicit Record-package call for the exact shop witness", () => {
  const tx = new Transaction();
  authorizeRecordShop({
    pressingId: PRESSING,
    pressingAdminCapId: BUYER,
    recordPackageId: RECORD_PACKAGE,
    recordShopPackageId: SHOP_PACKAGE,
  })(tx);
  expect(calls(tx)[0]).toMatchObject({
    package: normalizeSuiAddress(RECORD_PACKAGE),
    module: "pressing",
    function: "authorize_distributor",
    typeArguments: [`${SHOP_PACKAGE}::witness::Witness`],
  });
});

test("two purchases use the same Pressing, exact expected Pricing variants, and transfer both Records", () => {
  const tx = new Transaction();
  purchaseRecord({
    releaseId: RELEASE,
    edition: EDITION,
    currencyType: CURRENCY,
    paymentAmount: "10",
    expectedPricing: { kind: "fixed", amount: "10" },
    recipient: BUYER,
    recordPackageId: RECORD_PACKAGE,
    recordShopPackageId: SHOP_PACKAGE,
  })(tx);
  purchaseRecord({
    releaseId: RELEASE,
    edition: EDITION,
    currencyType: CURRENCY,
    paymentAmount: "25",
    expectedPricing: { kind: "floor", amount: "20" },
    recipient: BUYER,
    recordPackageId: RECORD_PACKAGE,
    recordShopPackageId: SHOP_PACKAGE,
  })(tx);
  const sequence = calls(tx).map((call) => `${call.module}::${call.function}`);
  expect(sequence.filter((call) => call === "listing::purchase")).toHaveLength(
    2,
  );
  expect(sequence.filter((call) => call === "listing::fixed")).toHaveLength(1);
  expect(sequence.filter((call) => call === "listing::floor")).toHaveLength(1);
  expect(
    tx
      .getData()
      .commands.filter((command) => command.$kind === "TransferObjects"),
  ).toHaveLength(2);
});
