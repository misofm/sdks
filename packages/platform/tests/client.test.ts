// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The derived Promise face, tested exactly the way a consumer writes it:
// `client.$extend(miso())` against the in-memory fake, no network
// (misofm/sdks#35, WP6 "facade derivation" — see docs/CONVERSION.md).
//
// Pure `deployments.ts` validation (frozen snapshot, `requireOperationsDeployment`/
// `requireRecordSalesDeployment`) moved to `tests/deployments.test.ts`; this
// file is only the facade.

import { describe, expect, test } from "bun:test";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { normalizeSuiObjectId } from "@mysten/sui/utils";
import type { SuiClientTypes } from "@mysten/sui/client";
import { Effect, Layer } from "effect";
import { ExtensionNotReady, KNOWN_CHAIN_IDS, SuiGraphQL } from "@unconfirmed/sui-effect";
import { FakeOutcome, SuiCoreFake, type FakeObject } from "@unconfirmed/sui-effect/testing";
import { Signer } from "@unconfirmed/sui-effect/tx";
import { SuiExtension } from "@unconfirmed/sui-effect/extension";
import { party as partyCoreContracts } from "@misofm/partyos/contracts";
import { miso, MisoNetworkMismatchError } from "../src/client.ts";
import { Miso } from "../src/Miso.ts";
import { MISO_PLATFORM_DEPLOYMENTS } from "../src/deployments.ts";
import { RecordSalesUnavailableError } from "../src/errors.ts";
import type { MisoPlatformDeployment } from "../src/deployments.ts";

const TESTNET = MISO_PLATFORM_DEPLOYMENTS.testnet;
const REAL_TESTNET_CHAIN_ID = KNOWN_CHAIN_IDS["testnet"]!;
const A = `0x${"11".repeat(32)}`;

interface Call {
  package?: string;
  module: string;
  function: string;
}
function moveCalls(tx: Transaction): Call[] {
  return (tx.getData().commands as Array<{ $kind: string; MoveCall?: Call }>)
    .filter((command) => command.$kind === "MoveCall")
    .map((command) => command.MoveCall!);
}

describe("client.$extend(miso()): warm registration", () => {
  test("nested namespaces are reachable immediately, and a platform tx fragment composes with a party fragment in one PTB", async () => {
    // No explicit `chainId` needed: "testnet" is in sui-effect's built-in
    // table, so `warm` resolves it without a network round trip — the
    // "registered warm when a chain id is known for the network" case.
    const fake = await Effect.runPromise(
      Effect.provide(SuiCoreFake, SuiCoreFake.layer({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
    );
    const client = fake.client.$extend(miso({ deployment: TESTNET }));

    // A plain-object value member (`deployment`) is real immediately under `warm`.
    expect(client.miso.deployment.network).toBe("testnet");
    // Nested namespaces: `protocol` (Musicos) and `party` (Partyos + extensions).
    expect(typeof client.miso.protocol.getReleaseById).toBe("function");
    expect(typeof client.miso.party.getPartyById).toBe("function");
    expect(client.miso.party.bcs.PartyProfileClearedEvent).toBeDefined();
    expect(client.miso.bcs.PressingSharedEvent).toBeDefined();

    // A sibling-composed PTB: `client.miso.tx.*` (this package's own fragment)
    // plus `client.miso.party.tx.*` (the party surface's fragment) in one
    // caller-owned `Transaction`.
    const tx = new Transaction();
    client.miso.tx.purchaseRecord({
      releaseId: A,
      edition: 1,
      currencyType: "0x2::sui::SUI",
      paymentAmount: "10",
      expectedPricing: { kind: "fixed", amount: "10" },
      recipient: A,
    })(tx);
    client.miso.party.tx.setProfile({ partyId: A, capId: A, bioShort: "hi" })(tx);

    const calls = moveCalls(tx);
    expect(calls.some((call) => call.function === "purchase")).toBe(true);
    expect(calls.some((call) => call.module === "party_profile" && call.function === "set_profile")).toBe(true);

    await client.miso.dispose();
  });
});

describe("client.$extend(...): a cold (non-warm) registration and $ready()", () => {
  test("a synchronous member throws ExtensionNotReady before $ready(), and is real after", async () => {
    const fake = await Effect.runPromise(
      Effect.provide(SuiCoreFake, SuiCoreFake.layer({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
    );
    // Built without `warm`, the way `musicos()` registers by default —
    // proves `Miso` supports either mode, not just the `miso()` helper's own
    // choice of `warm`. `SuiGraphQL.layerUnavailable` stands in for
    // `miso()`'s own default (no `graphqlClient` given).
    const client = fake.client.$extend(
      SuiExtension.fromService(Miso, { name: "miso", layer: Miso.layer(TESTNET).pipe(Layer.provide(SuiGraphQL.layerUnavailable)) }),
    );

    // Before the runtime exists the face does not know what `chainId` (a
    // plain string member) *is*: it comes back as a placeholder function,
    // not a string and not a Promise either (`docs/extensions.md` §7). Using
    // it as the string it is typed to be is what throws, naming itself.
    expect(typeof client.miso.chainId).toBe("function");
    expect(() => String(client.miso.chainId)).toThrow(ExtensionNotReady);

    await client.miso.$ready();
    expect(typeof client.miso.chainId).not.toBe("function");
    expect(client.miso.chainId).toBe(REAL_TESTNET_CHAIN_ID);
    expect(client.miso.ids.pressing(A, 1)).toMatch(/^0x[0-9a-f]{64}$/);

    await client.miso.dispose();
  });
});

describe("client.$extend(miso()): a submit-on-behalf member through Tx.run", () => {
  test("createShareCurrency: two Tx.run's (publish, then initialize), scripted execute", async () => {
    const keypair = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(7));
    const signer = Signer.fromKeypair(keypair);
    const owner = { $kind: "AddressOwner", AddressOwner: signer.address } as const;
    const padded = (suffix: string) => `0x${"0".repeat(64 - suffix.length)}${suffix}`;
    const PKG = padded("aa1");
    const CURRENCY_ID = padded("cc1");
    const TREASURY_ID = padded("991");

    // `initializeShareCurrency` reads the shared `0xc` Sui Coin Registry
    // object; `Tx.build` has to resolve it even though the fake never
    // inspects its content (see `tests/share.test.ts`'s identical fixture).
    const coinRegistryObject: FakeObject = {
      objectId: normalizeSuiObjectId("0xc"),
      type: "0x2::coin_registry::CoinRegistry",
      version: 1n,
      content: new Uint8Array(),
      owner: { $kind: "Shared", Shared: { initialSharedVersion: 1n } } as unknown as SuiClientTypes.ObjectOwner,
    };
    const fake = await Effect.runPromise(
      Effect.provide(
        SuiCoreFake,
        SuiCoreFake.layer({
          network: "testnet",
          chainId: REAL_TESTNET_CHAIN_ID,
          objects: [coinRegistryObject],
          execute: [
            FakeOutcome.succeed({ created: [{ objectId: PKG, type: "package", version: 2n, outputState: "PackageWrite" }] }),
            FakeOutcome.succeed({
              created: [
                { objectId: CURRENCY_ID, type: `0x2::coin_registry::Currency<${PKG}::share::Share>`, version: 2n, owner },
                { objectId: TREASURY_ID, type: `0x2::coin::TreasuryCap<${PKG}::share::Share>`, version: 2n, owner },
              ],
            }),
          ],
        }),
      ),
    );
    const client = fake.client.$extend(miso({ deployment: TESTNET }));

    const currency = await client.miso.createShareCurrency({ name: "Test Share", description: "d" }, { signer });
    expect(currency.packageId).toBe(PKG);
    expect(currency.currencyId).toBe(CURRENCY_ID);
    expect(currency.treasuryCapId).toBe(TREASURY_ID);
    expect(typeof currency.gasUsed).toBe("bigint");

    await client.miso.dispose();
  });
});

describe("client.$extend(miso()): error identity through the face", () => {
  test("a rejection is the original tagged error instance, _tag preserved", async () => {
    // `deployment.recordSales` is `unavailable` — `getPressing` fails typed
    // instead of throwing (the sync `ids.*` behaviour), and the Promise face
    // must reject with the SAME tagged instance a Promise consumer can
    // switch `_tag` on.
    const withoutSales: MisoPlatformDeployment = {
      ...TESTNET,
      recordSales: { status: "unavailable", reason: "test fixture" },
    };
    const fake = await Effect.runPromise(
      Effect.provide(SuiCoreFake, SuiCoreFake.layer({ network: "testnet", chainId: REAL_TESTNET_CHAIN_ID })),
    );
    const client = fake.client.$extend(miso({ deployment: withoutSales }));

    await expect(client.miso.getPressing(A)).rejects.toMatchObject({ _tag: "RecordSalesUnavailableError" });
    await expect(client.miso.getPressing(A)).rejects.toBeInstanceOf(RecordSalesUnavailableError);

    // Through the nested `party` namespace: `Partyos.getPartyById` wraps a
    // missing object into its own package-specific tag (`PartyNotFound`, not
    // sui-effect's generic `ObjectNotFound`) — the identity guarantee holds
    // for a composed sibling service's own tag too, not only sui-effect's.
    const partyRejection = await client.miso.party.getPartyById(A).catch((error: unknown) => error);
    expect((partyRejection as { _tag: string })._tag).toBe("partyos/PartyNotFound");

    await client.miso.dispose();
  });

  test("core party reads resolve through the real converted Partyos service", async () => {
    const fake = await Effect.runPromise(
      Effect.provide(
        SuiCoreFake,
        SuiCoreFake.layer({
          network: "testnet",
          chainId: REAL_TESTNET_CHAIN_ID,
          objects: [
            {
              objectId: A,
              type: `${TESTNET.partyos.partyos}::party::Party`,
              version: 1n,
              content: partyCoreContracts.Party.serialize({ id: A, kind: { Individual: true }, name: "Test Party", created_at_ms: 1n }).toBytes(),
            },
          ],
        }),
      ),
    );
    const client = fake.client.$extend(miso({ deployment: TESTNET }));

    const party = await client.miso.party.getPartyById(A);
    expect(party).toMatchObject({ id: A, kind: "individual", name: "Test Party" });

    await client.miso.dispose();
  });
});

describe("the network-mismatch path at layer build", () => {
  // `Miso.layer`'s network check runs at layer build either way (see
  // `Miso.test.ts` for the Effect-level assertions); what changes is WHEN
  // that build happens relative to `$extend`. `miso()`'s default `warm`
  // registration (chosen per this stage's own instructions, matching
  // `partyos()`) builds the layer synchronously inside `register`, so a
  // mismatch throws AT `$extend` for "testnet"/"mainnet" — a real deviation
  // from the issue's own migration-map wording ("no longer a synchronous
  // throw... rejects the first call"), which describes a LAZY registration.
  // A lazy registration (no `warm`, `SuiExtension.fromService` called
  // directly) still gets the deferred-rejection behaviour that wording
  // describes — documented in docs/CONVERSION.md.
  test("warm (miso()'s default): a mismatch throws synchronously at $extend", async () => {
    const fake = await Effect.runPromise(
      Effect.provide(SuiCoreFake, SuiCoreFake.layer({ network: "mainnet", chainId: KNOWN_CHAIN_IDS["mainnet"]! })),
    );
    expect(() => fake.client.$extend(miso({ deployment: TESTNET }))).toThrow(MisoNetworkMismatchError);
  });

  test("lazy (no warm): a mismatch rejects the first call instead", async () => {
    const fake = await Effect.runPromise(
      Effect.provide(SuiCoreFake, SuiCoreFake.layer({ network: "mainnet", chainId: KNOWN_CHAIN_IDS["mainnet"]! })),
    );
    const client = fake.client.$extend(
      SuiExtension.fromService(Miso, { name: "miso", layer: Miso.layer(TESTNET).pipe(Layer.provide(SuiGraphQL.layerUnavailable)) }),
    );

    // The deprecated `ready` warm-up member: `await client.miso.ready()`
    // keeps compiling and working as the predecessor's own idiom asked for.
    // (A lazy member's placeholder is a custom thenable supporting both
    // Promise- and Stream-shaped usage until the runtime resolves what it
    // really is, so a plain `await`/`catch` is used here rather than
    // `expect(...).rejects`, which expects a native `Promise`.)
    const rejection = await client.miso.ready().catch((error: unknown) => error);
    expect(rejection).toBeInstanceOf(MisoNetworkMismatchError);
    expect((rejection as MisoNetworkMismatchError)._tag).toBe("MisoNetworkMismatchError");

    await client.miso.dispose();
  });
});
