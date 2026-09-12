// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { Sui, SuiAddress, SuiCore, SuiGraphQL, type DecodeError } from "@unconfirmed/sui-effect";
import { layerTest, type FakeObject, type FakeScript } from "@unconfirmed/sui-effect/testing";
import * as recordContract from "../../src/contracts/record/record.ts";
import { deriveRecordId } from "../../src/pressing.ts";
import { OperationsUnavailableError } from "../../src/errors.ts";
import { misoConfig, type MisoConfig } from "../../src/read/config.ts";
import { getBalance, getOwnedRecords, getWorkByCap } from "../../src/read/wallet.ts";

const RECORD_PACKAGE = `0x${"ab".repeat(32)}`;
const RECORD_SHOP_PACKAGE = `0x${"ac".repeat(32)}`;
const WRONG_RECORD_PACKAGE = `0x${"cd".repeat(32)}`;
const PRESSING_ID = `0x${"ef".repeat(32)}`;
const RELEASE_ID = `0x${"12".repeat(32)}`;
const BUYER = `0x${"34".repeat(32)}`;
const OWNER = `0x${"aa".repeat(32)}`;
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
    owner?: string;
  } = {},
): FakeObject {
  const objectId = options.objectId ?? deriveRecordId(PRESSING_ID, number, RECORD_PACKAGE);
  return {
    objectId,
    type: options.type ?? RECORD_TYPE,
    version: 1n,
    owner: { $kind: "AddressOwner", AddressOwner: options.owner ?? OWNER },
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

const recordSalesConfig = {
  recordSales: {
    status: "available",
    recordPackageId: RECORD_PACKAGE,
    recordShopPackageId: RECORD_SHOP_PACKAGE,
  },
} as unknown as MisoConfig;

function run<A, E>(script: FakeScript, effect: Effect.Effect<A, E, Sui>): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, layerTest(script), { local: true }));
}

describe("getOwnedRecords", () => {
  test("projects exact finalized Record purchase provenance", async () => {
    const record = recordObject(7);
    const records = await run(
      { objects: [record, recordObject(8, { type: `${WRONG_RECORD_PACKAGE}::record::Record` })] },
      getOwnedRecords(OWNER, recordSalesConfig),
    );
    expect(records).toEqual([{
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
  });

  test("rejects generic and foreign Record types", async () => {
    const trusted = recordObject(1);
    const records = await run(
      {
        objects: [
          trusted,
          recordObject(2, { type: `${RECORD_TYPE}<${CURRENCY}>` }),
          recordObject(3, { type: `${WRONG_RECORD_PACKAGE}::record::Record` }),
          recordObject(4, { type: `${RECORD_PACKAGE}::record::Record<${CURRENCY},${CURRENCY}>` }),
        ],
      },
      getOwnedRecords(OWNER, recordSalesConfig),
    );
    expect(records.map(({ id }) => id)).toEqual([trusted.objectId]);
  });

  test("fails closed when the embedded UID disagrees with the object id", async () => {
    const object = recordObject(5, { embeddedId: `0x${"56".repeat(32)}` });
    await expect(run({ objects: [object] }, getOwnedRecords(OWNER, recordSalesConfig))).rejects.toThrow(
      /mismatched embedded UID/,
    );
  });

  test("fails closed when the Record identity is not derived from its Pressing and number", async () => {
    const arbitraryId = `0x${"78".repeat(32)}`;
    const object = recordObject(6, { objectId: arbitraryId, embeddedId: arbitraryId });
    await expect(run({ objects: [object] }, getOwnedRecords(OWNER, recordSalesConfig))).rejects.toThrow(/not derived/);
  });

  test("returns every matching record under the page cap", async () => {
    const objects = [1, 2, 3].map((n) => recordObject(n));
    const records = await run({ objects }, getOwnedRecords(OWNER, recordSalesConfig));
    expect(records.map(({ id }) => id)).toEqual(objects.map((o) => o.objectId));
  });

  test("stops at the page cap so a huge wallet cannot spin forever", async () => {
    const objects = Array.from({ length: 1005 }, (_, index) => recordObject(index + 1));
    const records = await run({ objects }, getOwnedRecords(OWNER, recordSalesConfig));
    expect(records).toHaveLength(1000);
  });

  test("fails closed when Record sales are unavailable", async () => {
    const config = {
      recordSales: { status: "unavailable", reason: "legacy deployment" },
    } as unknown as MisoConfig;
    await expect(run({}, getOwnedRecords(OWNER, config))).rejects.toThrow(/unavailable: legacy deployment/);
  });
});

describe("getBalance", () => {
  // `getCoinMetadata` has no `FakeScript` field (sui-effect's in-memory `SuiCore`
  // does not script it) — see the "Skill and library feedback" note in this
  // stage's final report. A minimal hand-built `ClientWithCoreApi` stub wrapped
  // with `SuiCore.layerFromClient` under `Sui.layerNoDepsPinned` (never reads
  // the chain identifier, so no network round trip to fake either) is the
  // sui-effect-sanctioned replacement for the predecessor's `SuiClient.layer`
  // stub — see sui-effect's migration table ("SuiClient.layer(client)" ->
  // "SuiCore.layerFromClient(client) under Sui.layerNoDeps").
  function stubClient(
    getBalanceImpl: (args: { owner: string; coinType: string }) => Promise<unknown>,
    getCoinMetadataImpl: (args: { coinType: string }) => Promise<unknown>,
  ) {
    return {
      network: "testnet",
      core: {
        getBalance: getBalanceImpl,
        getCoinMetadata: getCoinMetadataImpl,
      },
    } as never;
  }

  function runWithStub<A, E>(client: unknown, effect: Effect.Effect<A, E, Sui>): Promise<A> {
    return Effect.runPromise(
      effect.pipe(Effect.provide(Layer.provide(Sui.layerNoDepsPinned("test-chain"), SuiCore.layerFromClient(client as never)))),
    );
  }

  test("preserves storage breakdown and resolves decimals from chain metadata", async () => {
    const balanceCalls: Array<{ owner: string; coinType: string }> = [];
    const metadataCalls: string[] = [];
    const client = stubClient(
      async ({ owner, coinType }) => {
        balanceCalls.push({ owner, coinType });
        return { balance: { coinType, balance: "90000000", coinBalance: "55000000", addressBalance: "35000000" } };
      },
      async ({ coinType }) => {
        metadataCalls.push(coinType);
        return { coinMetadata: { id: "0xmetadata", decimals: 6, name: "USD", symbol: "USD", description: "", iconUrl: null } };
      },
    );
    const config = { money: { usdCoinType: "0x2::usd::USD", usdDecimals: 99 } } as unknown as MisoConfig;

    const expected = {
      address: `0x${"0".repeat(63)}1`,
      coinType: "0x2::usd::USD",
      balance: "90000000",
      coinBalance: "55000000",
      addressBalance: "35000000",
      decimals: 6,
    };
    await expect(runWithStub(client, getBalance("0x1", config))).resolves.toEqual(expected);
    expect(balanceCalls).toEqual([{ owner: `0x${"0".repeat(63)}1`, coinType: `0x${"0".repeat(63)}2::usd::USD` }]);
    expect(metadataCalls).toEqual([`0x${"0".repeat(63)}2::usd::USD`]);
  });

  test("fails closed with a typed DecodeError when coin metadata is unavailable", async () => {
    const client = stubClient(
      async () => ({ balance: { coinType: "0x2::usd::USD", balance: "0", coinBalance: "0", addressBalance: "0" } }),
      async () => ({ coinMetadata: null }),
    );
    const config = { money: { usdCoinType: "0x2::usd::USD", usdDecimals: 99 } } as unknown as MisoConfig;

    const error = await Effect.runPromise(
      getBalance("0x1", config).pipe(
        Effect.provide(Layer.provide(Sui.layerNoDepsPinned("test-chain"), SuiCore.layerFromClient(client as never))),
        Effect.flip,
      ),
    );
    expect(error._tag).toBe("DecodeError");
    expect((error as DecodeError).issue).toMatch(/decimal precision/);
  });
});

describe("getWorkByCap: B1 (misofm/sdks#35 verification) — typed failure, not a crash, when Vault is unconfigured", () => {
  test("a real object that isn't a direct admin cap type fails OperationsUnavailableError, not ObjectUnavailable/null", async () => {
    // `protocol.vault: null` (no current or legacy Vault package id) — the
    // one field `MisoConfig` can carry as absent since the B1 fix stopped
    // `configFromDeployment` from throwing for this shape.
    const config: MisoConfig = { ...misoConfig("testnet"), protocol: { ...misoConfig("testnet").protocol, vault: null } };
    const capId = `0x${"9a".repeat(32)}`;
    // A real object, but not a Composition/Recording/ReleaseAdminCap type —
    // so every direct classification falls through and `getWorkByCap` must
    // decide whether it could be a VAULTED admin cap, which needs the
    // now-missing Vault package id.
    const object: FakeObject = { objectId: capId, type: "0x2::coin::Coin<0x2::sui::SUI>", version: 1n, content: new Uint8Array() };

    const error = await Effect.runPromise(
      getWorkByCap(capId, config).pipe(
        Effect.provide(Layer.merge(layerTest({ objects: [object] }), SuiGraphQL.layerUnavailable)),
        Effect.flip,
      ),
    );
    expect(error).toBeInstanceOf(OperationsUnavailableError);
  });
});
