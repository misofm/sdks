// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The fragment composition this package's builders exist for: two of
// `transactions.ts`'s recipe fragments composed into one `Transaction` and
// submitted once with `Tx.run`, on the sui-effect harness. No `Musicos`
// service is needed here — `createComposition` / `publishComposition` are
// plain sync fragments, exactly as a consumer composes them with fragments
// from other extensions in the same PTB.

import { describe, expect, test } from "bun:test";
import type { SuiClientTypes } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import type { Recipe, Sui, SuiCore } from "sui-effect";
import { FakeOutcome, layerTest, SuiTest } from "sui-effect/testing";
import type { SuiCoreFake } from "sui-effect/testing";
import { Journal, Signer, Tx } from "sui-effect/tx";
import { createComposition, publishComposition } from "../src/transactions.ts";

const padded = (suffix: string) => `0x${"0".repeat(64 - suffix.length)}${suffix}`;

const keypair = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(3));
const signer = Signer.fromKeypair(keypair);
const SENDER = signer.address;
const owner: SuiClientTypes.ObjectOwner = { $kind: "AddressOwner", AddressOwner: SENDER };

const PKG = padded("7");
const CS = `${padded("c5")}::share::CompositionShare`;
const COMPOSITION_TYPE = `${PKG}::composition::Composition<${CS}>`;
const ADMIN_CAP_TYPE = `${PKG}::composition::CompositionAdminCap<${CS}>`;
const SHARE_CURRENCY_ID = padded("5c1");
const TREASURY_CAP_ID = padded("dc1");
const COMPOSITION_ID = padded("cc1");
const ADMIN_CAP_ID = padded("ac1");

const script = {
  objects: [
    { objectId: SHARE_CURRENCY_ID, type: `0x2::coin::Currency<${CS}>`, version: 1n, owner, content: new Uint8Array() },
    { objectId: TREASURY_CAP_ID, type: `0x2::coin::TreasuryCap<${CS}>`, version: 1n, owner, content: new Uint8Array() },
  ],
  coins: [
    {
      objectId: padded("c01"),
      version: "2",
      digest: "11111111111111111111111111111111",
      type: "0x2::coin::Coin<0x2::sui::SUI>",
      balance: "1000000000",
      owner,
      previousTransaction: null,
    } as unknown as SuiClientTypes.Coin,
  ],
  execute: [
    FakeOutcome.succeed({
      created: [
        { objectId: COMPOSITION_ID, type: COMPOSITION_TYPE, version: 2n, owner },
        { objectId: ADMIN_CAP_ID, type: ADMIN_CAP_TYPE, version: 2n, owner },
      ],
    }),
  ],
};

const provide = <A, E>(effect: Effect.Effect<A, E, Sui | SuiCore | SuiCoreFake | TestClock.TestClock>) =>
  Effect.runPromise(
    Effect.provide(effect, Layer.mergeAll(layerTest(script), TestClock.layer(), Journal.layerMemory), { local: true }),
  );

const recipe: Recipe = (tx) => {
  const parts = createComposition(tx, {
    title: "Composed In One PTB",
    royaltyRateBps: 1000,
    shareType: CS,
    shareCurrencyId: SHARE_CURRENCY_ID,
    shareTreasuryCapId: TREASURY_CAP_ID,
    misoPackageId: PKG,
  });
  publishComposition(tx, {
    composition: parts.composition,
    adminCap: parts.adminCap,
    shareType: CS,
    misoPackageId: PKG,
  });
};

describe("transactions.ts fragments compose and run once", () => {
  test("createComposition + publishComposition in one Recipe, run through Tx.run, submit once", async () => {
    const { executed, calls } = await provide(
      Effect.gen(function* () {
        const executed = yield* Tx.run(recipe, { signer });
        const calls = yield* SuiTest.calls("executeTransaction");
        return { executed, calls };
      }),
    );
    expect(executed.created(COMPOSITION_TYPE)).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });
});
