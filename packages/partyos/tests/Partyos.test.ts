// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The `Partyos` service, exercised on `sui-effect/testing`'s harness: the
// real service over the in-memory `SuiCore`, no network, no mocks of our own
// (`docs/extensions.md` §10).

import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";
import { describe, expect, test } from "bun:test";
import { Cause, ConfigProvider, Effect, Exit, Layer, Option, Result } from "effect";
import { TestSchema } from "effect/testing";
import { KNOWN_CHAIN_IDS, ObjectId, SuiError, SuiSchema, type Recipe, type Sui, type SuiCore } from "sui-effect";
import type { FakeScript, SuiCoreFake as SuiCoreFakeService } from "sui-effect/testing";
import { layerExtensionTest, layerTest, SuiCoreFake, SuiTest } from "sui-effect/testing";
import * as party from "../src/contracts/partyos/party.ts";
import { PartyosDeploymentError, PartyNotFound } from "../src/errors.ts";
import { partyos } from "../src/extension.ts";
import { Partyos, PARTYOS_TEST_DEPLOYMENT, type PartyosService } from "../src/Partyos.ts";
import { partyContent } from "../src/schema.ts";
import { fakeMembershipField, fakeParty } from "../src/testing.ts";
import { Party } from "../src/types.ts";

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
    const party_ = await provide(Effect.flatMap(Partyos, (p) => p.getPartyById(PARTY_ID)));
    expect(party_.name).toBe("Solo");
    expect(party_.kind).toBe("individual");
    expect(String(party_.id)).toBe(PARTY_ID);
  });

  test("is PartyNotFound when the object is missing", async () => {
    const error = await provide(Effect.flatMap(Partyos, (p) => Effect.flip(p.getPartyById(MISSING_ID))));
    expect(error).toBeInstanceOf(PartyNotFound);
    expect(error.outcome).toBe("not_applied");
  });

  test("is PartyNotFound after SuiTest.deleteObject", async () => {
    const error = await provide(
      Effect.gen(function* () {
        const partyos_ = yield* Partyos;
        yield* SuiTest.deleteObject(PARTY_ID);
        return yield* Effect.flip(partyos_.getPartyById(PARTY_ID));
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

  test("SuiError.toJson does not throw on PartyNotFound and is JSON", () => {
    // `SuiError.toJson`'s declared parameter type is the closed built-in
    // taxonomy (`SuiErrorSchema`), and `PartyNotFound` is not a member of
    // it, so — as observed here — it falls back to a generic `{ _tag,
    // message }` shape rather than this error's own fields (`partyId`
    // included). The cast is required because the declared type refuses an
    // extension error outright; what this test actually protects is that
    // calling it does not throw and the result is plain, JSON-safe data —
    // the acceptance criterion this repo's issue states in words.
    const json = SuiError.toJson(new PartyNotFound({ partyId: PARTY_ID }) as never);
    expect(json["_tag"]).toBe("partyos/PartyNotFound");
    expect(() => JSON.stringify(json)).not.toThrow();
  });
});

describe("Party content: the BCS bridge's edge cases", () => {
  test("trailing bytes are a DecodeError", async () => {
    const validBytes = party.Party.serialize({
      id: PARTY_ID,
      kind: { Individual: true },
      name: "Solo",
      created_at_ms: "0",
    }).toBytes();
    const withTrailingByte = new Uint8Array([...validBytes, 0]);
    const error = await Effect.runPromise(
      Effect.flip(SuiSchema.decode(partyContent(PKG), withTrailingByte, { objectId: PARTY_ID })),
    );
    expect(error._tag).toBe("DecodeError");
    expect(error.objectId).toBe(PARTY_ID);
  });
});

describe("Party schema round-trips (TestSchema.Asserts)", () => {
  test("Party decodes and encodes", async () => {
    const encoded = { id: PARTY_ID, kind: "individual" as const, name: "Solo", createdAtMs: 0 };
    const asserts = new TestSchema.Asserts(Party);
    await asserts.decoding().succeed(encoded, new Party(encoded));
    await asserts.encoding().succeed(new Party(encoded), encoded);
  });

  test("Party with members decodes and encodes", async () => {
    const encoded = {
      id: GROUP_ID,
      kind: "group" as const,
      name: "Group",
      members: [PARTY_ID],
      createdAtMs: 1_700_000_000_000,
    };
    const asserts = new TestSchema.Asserts(Party);
    await asserts.decoding().succeed(encoded, new Party(encoded));
    await asserts.encoding().succeed(new Party(encoded), encoded);
  });

  test("PartyNotFound decodes and encodes", async () => {
    const encoded = { _tag: "partyos/PartyNotFound", partyId: PARTY_ID };
    const decoded = new PartyNotFound({ partyId: PARTY_ID });
    const asserts = new TestSchema.Asserts(PartyNotFound);
    // Two-arg form: decoding produces a class instance (which also carries
    // the plain `outcome` field), not the bare encoded object back.
    await asserts.decoding().succeed(encoded, decoded);
    await asserts.encoding().succeed(decoded, encoded);
  });

  test("PartyosDeploymentError decodes and encodes", async () => {
    const encoded = { _tag: "partyos/DeploymentError", message: "bad manifest" };
    const decoded = new PartyosDeploymentError({ message: "bad manifest" });
    const asserts = new TestSchema.Asserts(PartyosDeploymentError);
    await asserts.decoding().succeed(encoded, decoded);
    await asserts.encoding().succeed(decoded, encoded);
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
        const partyos_ = yield* Partyos;
        yield* partyos_.getPartiesByIds([PARTY_ID, PARTY_ID, GROUP_ID]);
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

  test("excludes a foreign-package MembershipKey, a sibling key type, and a primitive-typed key on the same parent", async () => {
    const parent = ObjectId.make(padded("f11ed"));
    const realGroup = ObjectId.make(padded("60001"));
    const foreignGroup = ObjectId.make(padded("60002"));
    const primitiveKeyField = {
      $kind: "DynamicField" as const,
      fieldId: padded("f00d"),
      type: "0x2::dynamic_field::Field<u64, bool>",
      name: { type: "u64", bcs: bcs.u64().serialize(7).toBytes() },
      valueType: "bool",
    };
    const customScript: FakeScript = {
      objects: [],
      dynamicFields: {
        [parent]: [
          // The real MembershipKey — the only entry that should survive.
          fakeMembershipField(parent, `${PKG}::party::MembershipKey`, realGroup),
          // Same key *name*, wrong package: `normalizeStructTag` parses fine
          // but the tag does not match the bound deployment.
          fakeMembershipField(parent, `${OTHER_PKG}::party::MembershipKey`, foreignGroup),
          // A sibling key type on the same parent.
          fakeMembershipField(parent, `${PKG}::party::PendingInviteKey`, realGroup),
          // A primitive-typed key: `normalizeStructTag("u64")` throws, and
          // must not turn into a defect (the regression this test guards).
          primitiveKeyField,
        ],
      },
    };
    const ids = await provide(Effect.flatMap(Partyos, (p) => p.getMemberships(parent)), customScript);
    expect(ids).toEqual([realGroup]);
  });

  test("bad key bytes on an exact-tag match are a DecodeError, not silently skipped", async () => {
    const parent = ObjectId.make(padded("bad00"));
    const customScript: FakeScript = {
      objects: [],
      dynamicFields: {
        [parent]: [
          {
            $kind: "DynamicField",
            fieldId: padded("bad01"),
            type: `0x2::dynamic_field::Field<${PKG}::party::MembershipKey, bool>`,
            // The type tag matches exactly, so this entry is decoded, not
            // filtered — and the bytes are too short for a one-address tuple.
            name: { type: `${PKG}::party::MembershipKey`, bcs: new Uint8Array([1, 2, 3]) },
            valueType: "bool",
          },
        ],
      },
    };
    const error = await provide(Effect.flatMap(Partyos, (p) => Effect.flip(p.getMemberships(parent))), customScript);
    expect(error._tag).toBe("DecodeError");
  });
});

describe("Partyos.tx", () => {
  test("the 9 fragments compose into one Transaction beside a foreign fragment", async () => {
    const commands = await provide(
      Effect.gen(function* () {
        const partyos_ = yield* Partyos;
        const tx = new Transaction();
        const foreign: Recipe = (t) => {
          t.moveCall({ target: `${PKG}::other::noop`, arguments: [] });
        };
        partyos_.tx.createIndividualParty({ name: "New", recipient: MEMBER_ID })(tx);
        partyos_.tx.createGroupParty({ name: "NewGroup", recipient: MEMBER_ID })(tx);
        partyos_.tx.setName({ partyId: PARTY_ID, capId: MEMBER_ID, name: "Renamed" })(tx);
        partyos_.tx.inviteParty({ groupId: GROUP_ID, groupCapId: MEMBER_ID, memberId: PARTY_ID })(tx);
        partyos_.tx.acceptInvite({ groupId: GROUP_ID, memberId: PARTY_ID, memberCapId: MEMBER_ID })(tx);
        partyos_.tx.declineInvite({ groupId: GROUP_ID, memberId: PARTY_ID, memberCapId: MEMBER_ID })(tx);
        partyos_.tx.revokeInvite({ groupId: GROUP_ID, memberId: PARTY_ID, groupCapId: MEMBER_ID })(tx);
        partyos_.tx.leaveGroup({ groupId: GROUP_ID, memberId: PARTY_ID, memberCapId: MEMBER_ID })(tx);
        partyos_.tx.removeMember({ groupId: GROUP_ID, groupCapId: MEMBER_ID, memberId: PARTY_ID })(tx);
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
  const withConfig = (config: Record<string, unknown>) =>
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(config));

  test("reads PARTYOS_PACKAGE_ID", async () => {
    const configured = padded("c0de");
    const deployment = await Effect.runPromise(
      Effect.provide(
        Effect.map(Partyos, (p) => p.deployment),
        Layer.provide(Partyos.layerConfig, layerTest({ network: "testnet", chainId: KNOWN_CHAIN_IDS["testnet"]! })),
        { local: true },
      ).pipe(withConfig({ PARTYOS: { PACKAGE_ID: configured } })),
    );
    expect(deployment.partyos).toBe(configured);
  });

  test("an unset PARTYOS_PACKAGE_ID falls back to the bundled manifest", async () => {
    const deployment = await Effect.runPromise(
      Effect.provide(
        Effect.map(Partyos, (p) => p.deployment),
        Layer.provide(Partyos.layerConfig, layerTest({ network: "testnet", chainId: KNOWN_CHAIN_IDS["testnet"]! })),
        { local: true },
      ).pipe(withConfig({})),
    );
    expect(deployment.partyos).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("a malformed PARTYOS_PACKAGE_ID is a typed PartyosDeploymentError, not a defect", async () => {
    const exit = await Effect.runPromise(
      Effect.exit(
        Effect.provide(
          Effect.map(Partyos, (p) => p.deployment),
          Layer.provide(Partyos.layerConfig, layerTest({ network: "testnet", chainId: KNOWN_CHAIN_IDS["testnet"]! })),
          { local: true },
        ).pipe(withConfig({ PARTYOS: { PACKAGE_ID: "not-a-sui-address" } })),
      ),
    );
    expect(exit._tag).toBe("Failure");
    if (Exit.isFailure(exit)) {
      const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));
      expect(failure).toBeInstanceOf(PartyosDeploymentError);
    }
  });
});

describe("partyos(): the Promise face", () => {
  test("client.$extend(partyos()) resolves and rejects with PartyNotFound", async () => {
    const { party: resolvedParty, notFoundTag } = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const fake = yield* SuiCoreFake;
          const client = fake.client.$extend(partyos({ deployment: PARTYOS_TEST_DEPLOYMENT }));
          const resolvedParty = yield* Effect.promise(() => client.partyos.getPartyById(PARTY_ID));
          const notFoundTag = yield* Effect.promise(() =>
            client.partyos.getPartyById(MISSING_ID).then(
              () => "did not reject",
              (error: unknown) => (error instanceof PartyNotFound ? "PartyNotFound" : String(error)),
            ),
          );
          yield* Effect.promise(() => client.partyos.dispose());
          return { party: resolvedParty, notFoundTag };
        }),
        SuiCoreFake.layer({ ...script, network: "testnet", chainId: KNOWN_CHAIN_IDS["testnet"] }),
      ),
    );
    expect(resolvedParty.name).toBe("Solo");
    expect(notFoundTag).toBe("PartyNotFound");
  });

  test("warm: tx and deployment are synchronous immediately after $extend, no $ready() needed", async () => {
    const { deployment, sentCommand } = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const fake = yield* SuiCoreFake;
          const client = fake.client.$extend(partyos({ deployment: PARTYOS_TEST_DEPLOYMENT }));
          // No `await client.partyos.$ready()` anywhere above: `warm` means
          // these two members are the real thing the instant `$extend`
          // returns, not a placeholder that only becomes real on the second
          // call (the bug `docs/extensions.md` §7 names).
          const deployment = client.partyos.deployment;
          const recipe = client.partyos.tx.setName({ partyId: PARTY_ID, capId: MEMBER_ID, name: "New name" });
          const tx = new Transaction();
          recipe(tx);
          yield* Effect.promise(() => client.partyos.dispose());
          return { deployment, sentCommand: tx.getData().commands[0]?.$kind };
        }),
        SuiCoreFake.layer({ ...script, network: "testnet", chainId: KNOWN_CHAIN_IDS["testnet"] }),
      ),
    );
    expect(deployment).toEqual(PARTYOS_TEST_DEPLOYMENT);
    expect(sentCommand).toBe("MoveCall");
  });

  test("localnet: an explicit chainId lets warm build synchronously on an unbundled network", async () => {
    const localChainId = "localnet-test-chain-id";
    const { deployment, sentCommand } = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const fake = yield* SuiCoreFake;
          const client = fake.client.$extend(
            partyos({ deployment: PARTYOS_TEST_DEPLOYMENT, chainId: localChainId }),
          );
          const deployment = client.partyos.deployment;
          const recipe = client.partyos.tx.setName({ partyId: PARTY_ID, capId: MEMBER_ID, name: "New name" });
          const tx = new Transaction();
          recipe(tx);
          yield* Effect.promise(() => client.partyos.dispose());
          return { deployment, sentCommand: tx.getData().commands[0]?.$kind };
        }),
        SuiCoreFake.layer({ ...script, network: "localnet", chainId: localChainId }),
      ),
    );
    expect(deployment).toEqual(PARTYOS_TEST_DEPLOYMENT);
    expect(sentCommand).toBe("MoveCall");
  });

  test("localnet: without an explicit chainId, warm throws synchronously from $extend", async () => {
    await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const fake = yield* SuiCoreFake;
          expect(() => fake.client.$extend(partyos({ deployment: PARTYOS_TEST_DEPLOYMENT }))).toThrow();
        }),
        SuiCoreFake.layer({ ...script, network: "localnet" }),
      ),
    );
  });
});

// Type-level only (checked by `tsc`, not at runtime): every member of
// `PartyosService` has an empty requirement channel. A member whose `R` is
// not `never` would make `AllRequirements` below something other than
// `never`, and the assignment would fail to typecheck.
type RequirementsOf<F> = F extends (...args: ReadonlyArray<never>) => Effect.Effect<unknown, unknown, infer R>
  ? R
  : F extends Effect.Effect<unknown, unknown, infer R>
    ? R
    : never;
type AllRequirements =
  | RequirementsOf<PartyosService["getPartyById"]>
  | RequirementsOf<PartyosService["getPartiesByIds"]>
  | RequirementsOf<PartyosService["getMemberships"]>
  | RequirementsOf<PartyosService["getPendingInvites"]>
  | RequirementsOf<PartyosService["getPendingMemberships"]>
  | RequirementsOf<PartyosService["isMember"]>;
const _everyMemberRequirementIsNever: AllRequirements extends never ? true : never = true;
void _everyMemberRequirementIsNever;
