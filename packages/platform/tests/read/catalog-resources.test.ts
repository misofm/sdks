// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { Effect } from "effect";
import type { Sui } from "sui-effect";
import { layerTest, type FakeObject } from "sui-effect/testing";
import { deriveSaleIds } from "../../src/pressing.ts";
import * as listing from "../../src/contracts/record_shop/listing.ts";
import * as pressing from "../../src/contracts/record/pressing.ts";
import {
  getListingView,
  getPressingView,
} from "../../src/read/catalog.ts";
import type { MisoConfig } from "../../src/read/config.ts";

const RELEASE = `0x${"33".repeat(32)}`;
const CURRENCY = "0x2::sui::SUI";
const RECORD_PACKAGE = `0x${"aa".repeat(32)}`;
const SHOP_PACKAGE = `0x${"bb".repeat(32)}`;
const { pressingId: PRESSING, listingId: LISTING } = deriveSaleIds(
  RELEASE,
  1,
  CURRENCY,
  RECORD_PACKAGE,
  SHOP_PACKAGE,
);

const pressingBytes = pressing.Pressing.serialize({
  id: PRESSING,
  release_id: RELEASE,
  edition: 1,
  supply: 7,
  max_supply: 100,
  distributors: { contents: [] },
}).toBytes();

const listingBytes = listing.Listing.serialize({
  id: LISTING,
  release_id: RELEASE,
  pressing_id: PRESSING,
  pricing: { Floor: "2500" },
  state: { Enabled: true },
}).toBytes();

const pressingObject: FakeObject = {
  objectId: PRESSING,
  type: `${RECORD_PACKAGE}::pressing::Pressing`,
  version: 1n,
  content: pressingBytes,
};

const listingObject: FakeObject = {
  objectId: LISTING,
  type: `${SHOP_PACKAGE}::listing::Listing<${CURRENCY}>`,
  version: 1n,
  content: listingBytes,
};

const config = {
  recordSales: {
    status: "available",
    recordPackageId: RECORD_PACKAGE,
    recordShopPackageId: SHOP_PACKAGE,
  },
} as unknown as MisoConfig;

function run<A, E>(effect: Effect.Effect<A, E, Sui>): Promise<A> {
  return Effect.runPromise(
    Effect.provide(effect, layerTest({ objects: [pressingObject, listingObject] }), { local: true }),
  );
}

test("projects an atomic pressing to JSON-safe values", async () => {
  const view = await run(getPressingView(PRESSING, config));
  expect(view).toMatchObject({
    id: PRESSING,
    releaseId: RELEASE,
    edition: 1,
    supply: 7,
    maxSupply: 100,
  });
  expect(() => JSON.stringify(view)).not.toThrow();
});

test("projects a derived listing to JSON-safe values", async () => {
  const view = await run(getListingView(PRESSING, CURRENCY, config));
  expect(view).toMatchObject({
    id: LISTING,
    pressingId: PRESSING,
    releaseId: RELEASE,
    pricing: { kind: "floor", amount: "2500" },
    currency: { symbol: "SUI", decimals: 9 },
    state: "enabled",
  });
  expect(() => JSON.stringify(view)).not.toThrow();
});
