// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Share-currency provisioning on `Tx.run` (misofm/sdks#35 WP4): the two
// submit-on-behalf single-currency transactions, batched publishing, and
// batched initialization (including a failing batch reporting the succeeded
// ones through `onBatch` before failing typed), all on the sui-effect
// harness — no network, per `docs/extensions.md` §10.

import { describe, expect, test } from "bun:test";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { normalizeSuiObjectId } from "@mysten/sui/utils";
import type { SuiClientTypes } from "@mysten/sui/client";
import { Effect, Fiber, Layer } from "effect";
import { TestClock } from "effect/testing";
import type { Sui, SuiCore } from "@unconfirmed/sui-effect";
import { FakeOutcome, layerTest, SuiTest } from "@unconfirmed/sui-effect/testing";
import type { SuiCoreFake } from "@unconfirmed/sui-effect/testing";
import { Journal, Signer } from "@unconfirmed/sui-effect/tx";
import { SuiError, UnexpectedEffects } from "@unconfirmed/sui-effect";
import { createShareCurrency, initializeShareCurrencies, publishShareCurrencies } from "../src/share.ts";

const padded = (suffix: string) => `0x${"0".repeat(64 - suffix.length)}${suffix}`;

const keypair = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(7));
const signer = Signer.fromKeypair(keypair);
const SENDER = signer.address;
const owner: SuiClientTypes.ObjectOwner = { $kind: "AddressOwner", AddressOwner: SENDER };

const sponsorKeypair = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(9));
const sponsor = Signer.fromKeypair(sponsorKeypair);
const SPONSOR = sponsor.address;
const sponsorOwner: SuiClientTypes.ObjectOwner = { $kind: "AddressOwner", AddressOwner: SPONSOR };

// `initializeShareCurrency` reads the shared `0xc` Sui Coin Registry object;
// `Tx.build` has to resolve it even though the fake never inspects its content.
const COIN_REGISTRY_OBJECT = {
  objectId: normalizeSuiObjectId("0xc"),
  type: "0x2::coin_registry::CoinRegistry",
  version: 1n,
  content: new Uint8Array(),
  owner: { $kind: "Shared", Shared: { initialSharedVersion: 1n } } as unknown as SuiClientTypes.ObjectOwner,
};

const COINS: SuiClientTypes.Coin[] = [
  {
    objectId: padded("c01"),
    version: "2",
    digest: "11111111111111111111111111111111",
    type: "0x2::coin::Coin<0x2::sui::SUI>",
    balance: "1000000000",
    owner,
    previousTransaction: null,
  } as unknown as SuiClientTypes.Coin,
  {
    objectId: padded("c02"),
    version: "2",
    digest: "11111111111111111111111111111111",
    type: "0x2::coin::Coin<0x2::sui::SUI>",
    balance: "1000000000",
    owner: sponsorOwner,
    previousTransaction: null,
  } as unknown as SuiClientTypes.Coin,
];

const provide = <A, E>(
  effect: Effect.Effect<A, E, Sui | SuiCore | SuiCoreFake | TestClock.TestClock>,
  execute: FakeOutcome[],
) =>
  Effect.runPromise(
    Effect.provide(
      effect,
      Layer.mergeAll(layerTest({ objects: [COIN_REGISTRY_OBJECT], coins: COINS, execute }), TestClock.layer(), Journal.layerMemory),
      { local: true },
    ),
  );

describe("createShareCurrency: two Tx.run's, one signer", () => {
  test("publishes then initializes, summing gas across both runs", async () => {
    const PKG = padded("aa1");
    const CURRENCY_ID = padded("cc1");
    const TREASURY_ID = padded("991");
    const { currency, calls } = await provide(
      Effect.gen(function* () {
        const currency = yield* createShareCurrency(
          { name: "Test Share", description: "d", iconUrl: "https://example.com/i.png" },
          { signer },
        );
        const calls = yield* SuiTest.calls("executeTransaction");
        return { currency, calls };
      }),
      [
        FakeOutcome.succeed({ created: [{ objectId: PKG, type: "package", version: 2n, outputState: "PackageWrite" }] }),
        FakeOutcome.succeed({
          created: [
            { objectId: CURRENCY_ID, type: `0x2::coin_registry::Currency<${PKG}::share::Share>`, version: 2n, owner },
            { objectId: TREASURY_ID, type: `0x2::coin::TreasuryCap<${PKG}::share::Share>`, version: 2n, owner },
          ],
        }),
      ],
    );
    expect(calls).toHaveLength(2);
    expect(currency.packageId).toBe(PKG);
    expect(currency.currencyId).toBe(CURRENCY_ID);
    expect(currency.treasuryCapId).toBe(TREASURY_ID);
    expect(currency.shareType).toBe(`${PKG}::share::Share`);
    expect(typeof currency.gasUsed).toBe("bigint");
  });

  // B9, misofm/sdks#35 verification: the publish `Tx.run` applies (gas is
  // charged) but the effects carry no published package — this must fail
  // typed `UnexpectedEffects` (outcome "applied"), not die.
  test("fails typed UnexpectedEffects when the publish creates no package", async () => {
    const error = await provide(
      Effect.flip(createShareCurrency({ name: "Test Share", description: "d" }, { signer })),
      [FakeOutcome.succeed({ created: [] })],
    );
    expect(error).toBeInstanceOf(UnexpectedEffects);
    expect(SuiError.outcome(error)).toBe("applied");
  });

  // B4, misofm/sdks#35 verification: the sponsor path on createShareCurrency.
  describe("the sponsor path (gasOwner + sponsor)", () => {
    const PKG = padded("bb1");
    const CURRENCY_ID = padded("dd1");
    const TREASURY_ID = padded("992");
    const outcomes = () => [
      FakeOutcome.succeed({ created: [{ objectId: PKG, type: "package", version: 2n, outputState: "PackageWrite" }] }),
      FakeOutcome.succeed({
        created: [
          { objectId: CURRENCY_ID, type: `0x2::coin_registry::Currency<${PKG}::share::Share>`, version: 2n, owner },
          { objectId: TREASURY_ID, type: `0x2::coin::TreasuryCap<${PKG}::share::Share>`, version: 2n, owner },
        ],
      }),
    ];

    test("gasOwner plus sponsor: both runs submit with the sponsor paying gas", async () => {
      const currency = await provide(
        createShareCurrency({ name: "Sponsored Share", description: "d" }, { signer, gasOwner: SPONSOR, sponsor }),
        outcomes(),
      );
      expect(currency.packageId).toBe(PKG);
      expect(currency.currencyId).toBe(CURRENCY_ID);
    });

    test("gasOwner without sponsor fails typed SigningError, naming the missing signature", async () => {
      const error = await provide(
        Effect.flip(createShareCurrency({ name: "Sponsored Share", description: "d" }, { signer, gasOwner: SPONSOR })),
        outcomes(),
      );
      expect(error._tag).toBe("SigningError");
    });
  });
});

describe("publishShareCurrencies: batched at 5 publishes per Tx.run", () => {
  test("6 requested packages batch as 5 + 1, two Tx.run's", async () => {
    const batch1 = Array.from({ length: 5 }, (_, i) => ({
      objectId: padded(`b1${i}`),
      type: "package",
      version: 2n,
      outputState: "PackageWrite" as const,
    }));
    const batch2 = [{ objectId: padded("b20"), type: "package", version: 2n, outputState: "PackageWrite" as const }];
    const { packageIds, calls } = await provide(
      Effect.gen(function* () {
        const { packageIds } = yield* publishShareCurrencies(6, { signer });
        const calls = yield* SuiTest.calls("executeTransaction");
        return { packageIds, calls };
      }),
      [FakeOutcome.succeed({ created: batch1 }), FakeOutcome.succeed({ created: batch2 })],
    );
    expect(calls).toHaveLength(2);
    expect(packageIds).toHaveLength(6);
  });

  // B9, misofm/sdks#35 verification: every batch applied (gas charged) but
  // the total published count disagrees with what was requested.
  test("fails typed UnexpectedEffects when the published count disagrees with what was requested", async () => {
    const error = await provide(Effect.flip(publishShareCurrencies(2, { signer })), [
      FakeOutcome.succeed({ created: [{ objectId: padded("f01"), type: "package", version: 2n, outputState: "PackageWrite" }] }),
    ]);
    expect(error).toBeInstanceOf(UnexpectedEffects);
    expect(SuiError.outcome(error)).toBe("applied");
  });
});

describe("initializeShareCurrencies: onBatch fires per succeeded batch, a failure is typed", () => {
  test("happy path reports every batch through onBatch", async () => {
    const PKG = padded("dd1");
    const CURRENCY_ID = padded("ce1");
    const TREASURY_ID = padded("9e1");
    const reported: { currencies: readonly { packageId: string }[]; gasUsed: bigint }[] = [];
    const { result } = await provide(
      Effect.gen(function* () {
        const result = yield* initializeShareCurrencies(
          [PKG],
          () => ({ name: "n", description: "d" }),
          {
            signer,
            onBatch: (currencies, gasUsed) =>
              Effect.sync(() => {
                reported.push({ currencies, gasUsed });
              }),
          },
        );
        return { result };
      }),
      [
        FakeOutcome.succeed({
          created: [
            { objectId: CURRENCY_ID, type: `0x2::coin_registry::Currency<${PKG}::share::Share>`, version: 2n, owner },
            { objectId: TREASURY_ID, type: `0x2::coin::TreasuryCap<${PKG}::share::Share>`, version: 2n, owner },
          ],
        }),
      ],
    );
    expect(result.currencies).toHaveLength(1);
    expect(result.currencies[0]!.packageId).toBe(PKG);
    expect(reported).toHaveLength(1);
    expect(reported[0]!.currencies[0]!.packageId).toBe(PKG);
  });

  test("one failing batch still reports the succeeded batch through onBatch, then fails typed", async () => {
    // INITS_PER_PTB is 10, so 11 package ids batch as [10, 1] — one call to
    // `initializeShareCurrencies`, two `Tx.run`'s, the second of which fails.
    const okPackages = Array.from({ length: 10 }, (_, i) => padded(`e${i}`));
    const failingPackage = padded("eff");
    const reported: { packageId: string }[][] = [];
    const outcome = await provide(
      Effect.gen(function* () {
        // The failing batch's `transportError` is retryable, so `Tx.submit`
        // resubmits on `SubmitConfig.resubmit`'s schedule (5 attempts,
        // exponential up to 30s, jittered) before giving up — drive the
        // program's own clock past that instead of waiting for real time.
        const fiber = yield* Effect.forkChild(
          Effect.exit(
            initializeShareCurrencies([...okPackages, failingPackage], () => ({ name: "n", description: "d" }), {
              signer,
              onBatch: (currencies) =>
                Effect.sync(() => {
                  reported.push(currencies.map((c) => ({ packageId: c.packageId })));
                }),
            }),
          ),
        );
        yield* TestClock.adjust("3 minutes");
        return yield* Fiber.join(fiber);
      }),
      [
        FakeOutcome.succeed({
          created: okPackages.flatMap((pkg, i) => [
            { objectId: padded(`ce${i}`), type: `0x2::coin_registry::Currency<${pkg}::share::Share>`, version: 2n, owner },
            { objectId: padded(`9e${i}`), type: `0x2::coin::TreasuryCap<${pkg}::share::Share>`, version: 2n, owner },
          ]),
        }),
        FakeOutcome.transportError("UNAVAILABLE"),
      ],
    );
    expect(outcome._tag).toBe("Failure");
    // The first (succeeding) batch was reported through `onBatch` before the
    // second batch's failure surfaced — a resume needs only the failed batch.
    expect(reported).toHaveLength(1);
    expect(reported[0]).toHaveLength(10);
  });

  // B9, misofm/sdks#35 verification: the init `Tx.run` applied, but the
  // effects carry no `Currency<Share>`/`TreasuryCap<Share>` for this package.
  test("fails typed UnexpectedEffects when a package's Currency/TreasuryCap is missing from the applied effects", async () => {
    const PKG = padded("ff1");
    const error = await provide(
      Effect.flip(initializeShareCurrencies([PKG], () => ({ name: "n", description: "d" }), { signer })),
      [FakeOutcome.succeed({ created: [] })],
    );
    expect(error).toBeInstanceOf(UnexpectedEffects);
    expect(SuiError.outcome(error)).toBe("applied");
  });
});
