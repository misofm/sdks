// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { deriveSaleIds } from "../../src/pressing.ts";
import * as listing from "@misofm/protocol/contracts/miso_record_shop/listing";
import * as pressing from "@misofm/protocol/contracts/miso_record/pressing";
import {
  getListingView,
  getPressingView,
  toTracks,
} from "../../src/read/catalog.ts";
import type { MisoClient } from "../../src/read/client.ts";

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

function fixtureClient(): MisoClient {
  const protocol = {
    core: {
      getObject: async ({ objectId }: { objectId: string }) => ({
        object:
          objectId === PRESSING
            ? {
                content: pressingBytes,
                type: `${RECORD_PACKAGE}::pressing::Pressing`,
              }
            : objectId === LISTING
              ? {
                  content: listingBytes,
                  type: `${SHOP_PACKAGE}::listing::Listing<${CURRENCY}>`,
                }
              : undefined,
      }),
    },
  } as unknown as ClientWithCoreApi;

  return {
    config: {
      recordSales: {
        status: "available",
        recordPackageId: RECORD_PACKAGE,
        recordShopPackageId: SHOP_PACKAGE,
      },
    },
    protocol,
  } as unknown as MisoClient;
}

test("projects an atomic pressing to JSON-safe values", async () => {
  const view = await getPressingView(fixtureClient(), PRESSING);
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
  const view = await getListingView(fixtureClient(), PRESSING, CURRENCY);
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
