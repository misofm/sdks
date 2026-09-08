// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, mock } from "bun:test";
import { Effect } from "effect";
import type { ClientWithCoreApi, SuiClientTypes } from "@mysten/sui/client";
import { SuiClient } from "@misofm/effect";
import { BcsDecodeError, ObjectNotFoundError, ObjectTypeMismatchError } from "@misofm/effect";

import { Party as PartyBcs } from "../src/contracts/partyos/party.ts";
import {
  getMemberships,
  getPartiesByIds,
  getPartyById,
  getPendingInvites,
  getPendingMemberships,
  isMember,
} from "../src/queries.ts";
import {
  MembershipKey as MembershipKeyBcs,
  PendingInviteKey as PendingInviteKeyBcs,
} from "../src/contracts/partyos/party.ts";

const id = (digit: string) => `0x${digit.repeat(64)}`;
const PKG = id("a");
const OLD_PKG = id("b");
const partyType = (pkg: string) => `${pkg}::party::Party`;

/** Runs a `SuiClient`-requiring program against a fake client. */
function run<A, E>(effect: Effect.Effect<A, E, SuiClient>, client: ClientWithCoreApi): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(SuiClient.layer(client))));
}

/** Runs a program and returns its typed failure via `Effect.flip`. */
function runFailure<A, E>(effect: Effect.Effect<A, E, SuiClient>, client: ClientWithCoreApi): Promise<E> {
  return Effect.runPromise(effect.pipe(Effect.provide(SuiClient.layer(client)), Effect.flip));
}

function fieldEntry(fieldId: string, type: string, bcs: Uint8Array): SuiClientTypes.DynamicFieldEntry {
  return {
    $kind: "DynamicField",
    fieldId,
    type: `0x1::field::Field<${type}>`,
    name: { type, bcs },
    valueType: "0x1::field::Value",
  };
}

describe("getPartiesByIds", () => {
  it("fetches every party through one Core batch and skips per-object errors", async () => {
    const soloId = id("1");
    const groupId = id("2");
    const getObjects = mock(async () => ({
      objects: [
        {
          objectId: soloId,
          type: partyType(PKG),
          content: PartyBcs.serialize({
            id: soloId,
            kind: { Individual: true },
            name: "Solo",
            created_at_ms: 1n,
          }).toBytes(),
        },
        new Error("pruned"),
        {
          objectId: groupId,
          type: partyType(PKG),
          content: PartyBcs.serialize({
            id: groupId,
            kind: { Group: { contents: [soloId] } },
            name: "Group",
            created_at_ms: 2n,
          }).toBytes(),
        },
      ],
    }));
    const client = { core: { getObjects } } as unknown as ClientWithCoreApi;

    const parties = await run(getPartiesByIds([soloId, groupId, soloId], PKG), client);

    expect(getObjects).toHaveBeenCalledTimes(1);
    expect(getObjects).toHaveBeenCalledWith(
      expect.objectContaining({ objectIds: [soloId, groupId], include: { content: true } }),
    );
    expect(parties[soloId]).toMatchObject({
      id: soloId,
      kind: "individual",
      name: "Solo",
    });
    expect(parties[groupId]).toMatchObject({
      id: groupId,
      kind: "group",
      name: "Group",
      members: [soloId],
    });
  });

  it("does not call the client for an empty id list", async () => {
    const getObjects = mock();
    const client = { core: { getObjects } } as unknown as ClientWithCoreApi;

    await expect(run(getPartiesByIds([], PKG), client)).resolves.toEqual({});
    expect(getObjects).not.toHaveBeenCalled();
  });

  it("rejects a Party from another partyos deployment with ObjectTypeMismatchError", async () => {
    const staleId = id("3");
    const getObjects = mock(async () => ({
      objects: [
        {
          objectId: staleId,
          type: partyType(OLD_PKG),
          content: PartyBcs.serialize({
            id: staleId,
            kind: { Individual: true },
            name: "Stale",
            created_at_ms: 1n,
          }).toBytes(),
        },
      ],
    }));
    const client = { core: { getObjects } } as unknown as ClientWithCoreApi;

    const err = await runFailure(getPartiesByIds([staleId], PKG), client);

    expect(err).toBeInstanceOf(ObjectTypeMismatchError);
    expect(err).toMatchObject({ objectId: staleId, expected: partyType(PKG), actual: partyType(OLD_PKG) });
  });
});

describe("getPartyById", () => {
  const partyContent = (partyId: string) =>
    PartyBcs.serialize({ id: partyId, kind: { Individual: true }, name: "Solo", created_at_ms: 1n }).toBytes();

  it("parses a Party of the deployment's package", async () => {
    const soloId = id("1");
    const getObject = mock(async () => ({
      object: { objectId: soloId, type: partyType(PKG), version: "1", content: partyContent(soloId) },
    }));
    const client = { core: { getObject } } as unknown as ClientWithCoreApi;

    await expect(run(getPartyById(soloId, PKG), client)).resolves.toMatchObject({ id: soloId, name: "Solo" });
  });

  it("rejects a Party from another partyos deployment with ObjectTypeMismatchError", async () => {
    const staleId = id("3");
    const getObject = mock(async () => ({
      object: { objectId: staleId, type: partyType(OLD_PKG), version: "1", content: partyContent(staleId) },
    }));
    const client = { core: { getObject } } as unknown as ClientWithCoreApi;

    const err = await runFailure(getPartyById(staleId, PKG), client);

    expect(err).toBeInstanceOf(ObjectTypeMismatchError);
    expect(err).toMatchObject({ objectId: staleId, expected: partyType(PKG), actual: partyType(OLD_PKG) });
  });

  it("rejects an object that is not a Party with ObjectTypeMismatchError", async () => {
    const coinId = id("4");
    const getObject = mock(async () => ({
      object: {
        objectId: coinId,
        type: "0x2::coin::Coin<0x2::sui::SUI>",
        version: "1",
        content: new Uint8Array([1]),
      },
    }));
    const client = { core: { getObject } } as unknown as ClientWithCoreApi;

    const err = await runFailure(getPartyById(coinId, PKG), client);

    expect(err).toBeInstanceOf(ObjectTypeMismatchError);
    expect(err.objectId).toBe(coinId);
    expect(err.actual).toContain("::coin::Coin<");
  });

  it("reports a missing object as ObjectNotFoundError", async () => {
    const missingId = id("5");
    const getObject = mock(async () => {
      throw new Error("Object not found");
    });
    const client = { core: { getObject } } as unknown as ClientWithCoreApi;

    const err = await runFailure(getPartyById(missingId, PKG), client);

    expect(err).toBeInstanceOf(ObjectNotFoundError);
    expect(err).toMatchObject({ objectId: missingId });
  });

  it("fails with BcsDecodeError when the object's content does not parse as a Party", async () => {
    const badId = id("6");
    const getObject = mock(async () => ({
      object: { objectId: badId, type: partyType(PKG), version: "1", content: new Uint8Array([1, 2, 3]) },
    }));
    const client = { core: { getObject } } as unknown as ClientWithCoreApi;

    const err = await runFailure(getPartyById(badId, PKG), client);

    expect(err).toBeInstanceOf(BcsDecodeError);
  });
});

describe("group membership reads", () => {
  it("getMemberships pages through listDynamicFields and decodes matching keys", async () => {
    const partyId = id("1");
    const groupA = id("a");
    const groupB = id("b");
    const keyBytes = (groupId: string) => MembershipKeyBcs.serialize([groupId]).toBytes();

    const pages = [
      {
        dynamicFields: [
          fieldEntry("f1", `${PKG}::party::MembershipKey`, keyBytes(groupA)),
          fieldEntry("f2", `${PKG}::party::PendingInviteKey`, keyBytes(groupB)),
        ],
        hasNextPage: true,
        cursor: "c1",
      },
      {
        dynamicFields: [fieldEntry("f3", `${PKG}::party::MembershipKey`, keyBytes(groupB))],
        hasNextPage: false,
        cursor: null,
      },
    ];
    let call = 0;
    const seenCursors: (string | null)[] = [];
    const listDynamicFields = mock(async ({ cursor }: { cursor: string | null }) => {
      seenCursors.push(cursor);
      return pages[call++]!;
    });
    const client = { core: { listDynamicFields } } as unknown as ClientWithCoreApi;

    const memberships = await run(getMemberships(partyId), client);

    expect(memberships).toEqual([groupA, groupB]);
    expect(seenCursors).toEqual([null, "c1"]);
  });

  it("getPendingInvites filters to PendingInviteKey fields only", async () => {
    const groupId = id("7");
    const memberId = id("8");
    const keyBytes = (m: string) => PendingInviteKeyBcs.serialize([m]).toBytes();

    const listDynamicFields = mock(async () => ({
      dynamicFields: [
        fieldEntry("f1", `${PKG}::party::MembershipKey`, keyBytes(memberId)),
        fieldEntry("f2", `${PKG}::party::PendingInviteKey`, keyBytes(memberId)),
      ],
      hasNextPage: false,
      cursor: null,
    }));
    const client = { core: { listDynamicFields } } as unknown as ClientWithCoreApi;

    const invites = await run(getPendingInvites(groupId), client);

    expect(invites).toEqual([memberId]);
  });

  it("getPendingMemberships returns an empty array when there are no matching keys", async () => {
    const partyId = id("1");
    const listDynamicFields = mock(async () => ({ dynamicFields: [], hasNextPage: false, cursor: null }));
    const client = { core: { listDynamicFields } } as unknown as ClientWithCoreApi;

    await expect(run(getPendingMemberships(partyId), client)).resolves.toEqual([]);
  });

  it("isMember is true when the derived MembershipKey field exists", async () => {
    const memberId = id("1");
    const groupId = id("2");
    const getObject = mock(async ({ objectId }: { objectId: string }) => ({
      object: { objectId, type: "0x1::dynamic_field::Field", version: "1", content: new Uint8Array([1]) },
    }));
    const client = { core: { getObject } } as unknown as ClientWithCoreApi;

    await expect(run(isMember(memberId, groupId, PKG), client)).resolves.toBe(true);
  });

  it("isMember is false when the derived MembershipKey field is missing", async () => {
    const memberId = id("1");
    const groupId = id("2");
    const getObject = mock(async () => {
      throw new Error("Object not found");
    });
    const client = { core: { getObject } } as unknown as ClientWithCoreApi;

    await expect(run(isMember(memberId, groupId, PKG), client)).resolves.toBe(false);
  });
});
