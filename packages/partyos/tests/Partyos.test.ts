// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The `Partyos` service, exercised on `sui-effect/testing`'s harness: the
// real service over the in-memory `SuiCore`, no network, no mocks of our own
// (`docs/extensions.md` §10).

import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";
import { describe, expect, test } from "bun:test";
import { Cause, Effect, Exit, Layer, Option, Result } from "effect";
import { KNOWN_CHAIN_IDS, ObjectId, type Recipe, type Sui, type SuiCore } from "sui-effect";
import type { FakeScript, SuiCoreFake as SuiCoreFakeService } from "sui-effect/testing";
import { layerExtensionTest, layerTest, SuiCoreFake, SuiTest } from "sui-effect/testing";
import { partyos } from "../src/extension.ts";
import { PartyosDeploymentError, PartyNotFound } from "../src/errors.ts";
import { Partyos, PARTYOS_TEST_DEPLOYMENT } from "../src/Partyos.ts";
import { fakeMembershipField, fakeParty } from "../src/testing.ts";

const PKG = PARTYOS_TEST_DEPLOYMENT.partyos;
const padded = (suffix: string) => `0x${"0".repeat(64 - suffix.length)}${suffix}`;
const PARTY_ID = ObjectId.make(padded("15077"));
const GROUP_ID = ObjectId.make(padded("90000"));
const MEMBER_ID = ObjectId.make(padded("00001"));
const MISSING_ID = ObjectId.make(padded("dead"));
const OTHER_PKG = padded("bad9");

const script: FakeScript = {
  objects: [
    fakeParty({ id: PARTY_ID, kind: "individual", name: "Solo" }),
    fakeParty({ id: GROUP_ID, kind: "group", name: "Group", members: [PARTY_ID] }),
  ],
  dynamicFields: {
    [PARTY_ID]: [fakeMembershipField(PARTY_ID, `${PKG}::party::MembershipKey`, GROUP_ID)],
    [GROUP_ID]: [fakeMembershipField(GROUP_ID, `${PKG}::party::PendingInviteKey`, MEMBER_ID)],
  },
};

const provide = <A, E>(
  effect: Effect.Effect<A, E, Partyos | Sui | SuiCore | SuiCoreFakeService>,
  fakeScript: FakeScript = script,
): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, layerExtensionTest(Partyos.layerTest(), fakeScript), { local: true }));

describe("Partyos.getPartyById", () => {
  test("decodes a Party through the BCS bridge", async () => {
    const party = await provide(Effect.flatMap(Partyos, (p) => p.getPartyById(PARTY_ID)));
    expect(party.name).toBe("Solo");
    expect(party.kind).toBe("individual");
    expect(String(party.id)).toBe(PARTY_ID);
  });

  test("is PartyNotFound when the object is missing", async () => {
    const error = await provide(Effect.flatMap(Partyos, (p) => Effect.flip(p.getPartyById(MISSING_ID))));
    expect(error).toBeInstanceOf(PartyNotFound);
    expect(error.outcome).toBe("not_applied");
  });

  test("is PartyNotFound after SuiTest.deleteObject", async () => {
    const error = await provide(
      Effect.gen(function* () {
        const partyos = yield* Partyos;
        yield* SuiTest.deleteObject(PARTY_ID);
        return yield* Effect.flip(partyos.getPartyById(PARTY_ID));
      }),
    );
    expect(error).toBeInstanceOf(PartyNotFound);
  });

  test("is DecodeError for a Party from another package", async () => {
    const staleId = ObjectId.make(padded("57a1e"));
    const stale = { ...fakeParty({ id: staleId, kind: "individual", name: "Stale" }), type: `${OTHER_PKG}::party::Party` };
    const error = await provide(Effect.flatMap(Partyos, (p) => Effect.flip(p.getPartyById(staleId))), {
      objects: [stale],
    });
    expect(error._tag).toBe("DecodeError");
  });

  test("is DecodeError for a Coin", async () => {
    const coinId = ObjectId.make(padded("c01d"));
    const coinBytes = bcs.struct("Coin", { id: bcs.Address, balance: bcs.u64() }).serialize({
      id: coinId,
      balance: "1",
    }).toBytes();
    const error = await provide(Effect.flatMap(Partyos, (p) => Effect.flip(p.getPartyById(coinId))), {
      objects: [{ objectId: coinId, type: "0x2::coin::Coin<0x2::sui::SUI>", version: 1n, content: coinBytes }],
    });
    expect(error._tag).toBe("DecodeError");
  });
});

describe("Partyos.getPartiesByIds", () => {
  test("one Result per distinct id, in order, with a mismatch kept as an item error", async () => {
    const staleId = ObjectId.make(padded("57a1e"));
    const stale = { ...fakeParty({ id: staleId, kind: "individual", name: "Stale" }), type: `${OTHER_PKG}::party::Party` };
    const results = await provide(
      Effect.flatMap(Partyos, (p) => p.getPartiesByIds([PARTY_ID, PARTY_ID, MISSING_ID, staleId])),
      { objects: [...script.objects!, stale] },
    );
    expect(results).toHaveLength(3);
    expect(Result.isSuccess(results[0]!)).toBe(true);
    expect(Result.isFailure(results[1]!)).toBe(true);
    if (Result.isFailure(results[1]!)) expect(results[1].failure).toBeInstanceOf(PartyNotFound);
    expect(Result.isFailure(results[2]!)).toBe(true);
    if (Result.isFailure(results[2]!)) expect(results[2].failure._tag).toBe("DecodeError");
  });

  test("one chunked sui.getObjects call, deduplicated", async () => {
    const { calls } = await provide(
      Effect.gen(function* () {
        const partyos = yield* Partyos;
        yield* partyos.getPartiesByIds([PARTY_ID, PARTY_ID, GROUP_ID]);
        const calls = yield* SuiTest.calls("getObjects");
        return { calls };
      }),
    );
    expect(calls).toHaveLength(1);
    const options = calls[0]!.options as { readonly objectIds: ReadonlyArray<string>; readonly include: unknown };
    expect(options.objectIds).toEqual([PARTY_ID, GROUP_ID]);
    expect(options.include).toEqual({ content: true });
  });
});

describe("group membership reads", () => {
  test("getMemberships pages streamDynamicFields and filters by exact tag", async () => {
    const ids = await provide(Effect.flatMap(Partyos, (p) => p.getMemberships(PARTY_ID)));
    expect(ids).toEqual([GROUP_ID]);
  });

  test("getPendingInvites filters to PendingInviteKey fields", async () => {
    const ids = await provide(Effect.flatMap(Partyos, (p) => p.getPendingInvites(GROUP_ID)));
    expect(ids).toEqual([MEMBER_ID]);
  });

  test("getPendingMemberships is empty when there are no matching keys", async () => {
    const ids = await provide(Effect.flatMap(Partyos, (p) => p.getPendingMemberships(MEMBER_ID)));
    expect(ids).toEqual([]);
  });

  test("isMember reads one dynamic field", async () => {
    const yes = await provide(Effect.flatMap(Partyos, (p) => p.isMember(PARTY_ID, GROUP_ID)));
    expect(yes).toBe(true);
    const no = await provide(Effect.flatMap(Partyos, (p) => p.isMember(MEMBER_ID, GROUP_ID)));
    expect(no).toBe(false);
  });
});

describe("Partyos.tx", () => {
  test("the 9 fragments compose into one Transaction beside a foreign fragment", async () => {
    const commands = await provide(
      Effect.gen(function* () {
        const partyos = yield* Partyos;
        const tx = new Transaction();
        const foreign: Recipe = (t) => {
          t.moveCall({ target: `${PKG}::other::noop`, arguments: [] });
        };
        partyos.tx.createIndividualParty({ name: "New", recipient: MEMBER_ID })(tx);
        partyos.tx.createGroupParty({ name: "NewGroup", recipient: MEMBER_ID })(tx);
        partyos.tx.setName({ partyId: PARTY_ID, capId: MEMBER_ID, name: "Renamed" })(tx);
        partyos.tx.inviteParty({ groupId: GROUP_ID, groupCapId: MEMBER_ID, memberId: PARTY_ID })(tx);
        partyos.tx.acceptInvite({ groupId: GROUP_ID, memberId: PARTY_ID, memberCapId: MEMBER_ID })(tx);
        partyos.tx.declineInvite({ groupId: GROUP_ID, memberId: PARTY_ID, memberCapId: MEMBER_ID })(tx);
        partyos.tx.revokeInvite({ groupId: GROUP_ID, memberId: PARTY_ID, groupCapId: MEMBER_ID })(tx);
        partyos.tx.leaveGroup({ groupId: GROUP_ID, memberId: PARTY_ID, memberCapId: MEMBER_ID })(tx);
        partyos.tx.removeMember({ groupId: GROUP_ID, groupCapId: MEMBER_ID, memberId: PARTY_ID })(tx);
        foreign(tx);
        return tx.getData().commands;
      }),
    );
    expect(commands.length).toBeGreaterThanOrEqual(9);
    expect(commands.some((c) => c.$kind === "MoveCall")).toBe(true);
    // The foreign fragment's command is last and composes cleanly beside PartyOS's own.
    expect(commands[commands.length - 1]?.$kind).toBe("MoveCall");
  });
});

describe("Partyos.layer", () => {
  test("fails with PartyosDeploymentError on an unbundled network", async () => {
    const exit = await Effect.runPromise(
      Effect.exit(
        Effect.provide(
          Effect.map(Partyos, (p) => p.deployment),
          Layer.provide(Partyos.layer(), layerTest({ network: "localnet" })),
          { local: true },
        ),
      ),
    );
    expect(exit._tag).toBe("Failure");
    if (Exit.isFailure(exit)) {
      const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));
      expect(failure).toBeInstanceOf(PartyosDeploymentError);
    }
  });

  test("picks the bundled deployment for a known network", async () => {
    const deployment = await Effect.runPromise(
      Effect.provide(
        Effect.map(Partyos, (p) => p.deployment),
        Layer.provide(
          Partyos.layer(),
          layerTest({ network: "testnet", chainId: KNOWN_CHAIN_IDS["testnet"]! }),
        ),
        { local: true },
      ),
    );
    expect(deployment.partyos).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("Partyos.layerConfig", () => {
  test("reads PARTYOS_PACKAGE_ID", async () => {
    const configured = padded("c0de");
    const previous = process.env["PARTYOS_PACKAGE_ID"];
    process.env["PARTYOS_PACKAGE_ID"] = configured;
    try {
      const deployment = await Effect.runPromise(
        Effect.provide(
          Effect.map(Partyos, (p) => p.deployment),
          Layer.provide(Partyos.layerConfig, layerTest({ network: "testnet", chainId: KNOWN_CHAIN_IDS["testnet"]! })),
          { local: true },
        ),
      );
      expect(deployment.partyos).toBe(configured);
    } finally {
      if (previous === undefined) delete process.env["PARTYOS_PACKAGE_ID"];
      else process.env["PARTYOS_PACKAGE_ID"] = previous;
    }
  });

  test("an unset PARTYOS_PACKAGE_ID falls back to the bundled manifest", async () => {
    const previous = process.env["PARTYOS_PACKAGE_ID"];
    delete process.env["PARTYOS_PACKAGE_ID"];
    try {
      const deployment = await Effect.runPromise(
        Effect.provide(
          Effect.map(Partyos, (p) => p.deployment),
          Layer.provide(Partyos.layerConfig, layerTest({ network: "testnet", chainId: KNOWN_CHAIN_IDS["testnet"]! })),
          { local: true },
        ),
      );
      expect(deployment.partyos).toMatch(/^0x[0-9a-f]{64}$/);
    } finally {
      if (previous !== undefined) process.env["PARTYOS_PACKAGE_ID"] = previous;
    }
  });
});

describe("partyos(): the Promise face", () => {
  test("client.$extend(partyos()) resolves and rejects with PartyNotFound", async () => {
    const { party, notFoundTag } = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const fake = yield* SuiCoreFake;
          const client = fake.client.$extend(partyos({ deployment: PARTYOS_TEST_DEPLOYMENT }));
          const party = yield* Effect.promise(() => client.partyos.getPartyById(PARTY_ID));
          const notFoundTag = yield* Effect.promise(() =>
            client.partyos.getPartyById(MISSING_ID).then(
              () => "did not reject",
              (error: unknown) => (error instanceof PartyNotFound ? "PartyNotFound" : String(error)),
            ),
          );
          yield* Effect.promise(() => client.partyos.dispose());
          return { party, notFoundTag };
        }),
        SuiCoreFake.layer({ ...script, network: "testnet", chainId: KNOWN_CHAIN_IDS["testnet"] }),
      ),
    );
    expect(party.name).toBe("Solo");
    expect(notFoundTag).toBe("PartyNotFound");
  });
});
