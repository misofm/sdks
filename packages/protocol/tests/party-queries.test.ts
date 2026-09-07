import { describe, expect, it, mock } from "bun:test";
import type { ClientWithCoreApi } from "@mysten/sui/client";

import { Party as PartyBcs } from "../src/contracts/miso_party/party.ts";
import { getPartiesByIds, getPartyById } from "../src/party/queries.ts";

const id = (digit: string) => `0x${digit.repeat(64)}`;
const PKG = id("a");
const OLD_PKG = id("b");
const partyType = (pkg: string) => `${pkg}::party::Party`;

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

    const parties = await getPartiesByIds(client, [soloId, groupId, soloId], PKG);

    expect(getObjects).toHaveBeenCalledTimes(1);
    expect(getObjects).toHaveBeenCalledWith({
      objectIds: [soloId, groupId],
      include: { content: true },
    });
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

    await expect(getPartiesByIds(client, [], PKG)).resolves.toEqual({});
    expect(getObjects).not.toHaveBeenCalled();
  });

  it("rejects a Party from another miso_party deployment", async () => {
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

    await expect(getPartiesByIds(client, [staleId], PKG)).rejects.toThrow(
      /a Party from a different miso_party deployment/,
    );
  });
});

describe("getPartyById", () => {
  const partyContent = (partyId: string) =>
    PartyBcs.serialize({ id: partyId, kind: { Individual: true }, name: "Solo", created_at_ms: 1n }).toBytes();

  it("parses a Party of the deployment's package", async () => {
    const soloId = id("1");
    const getObject = mock(async () => ({
      object: { objectId: soloId, type: partyType(PKG), content: partyContent(soloId) },
    }));
    const client = { core: { getObject } } as unknown as ClientWithCoreApi;

    await expect(getPartyById(client, soloId, PKG)).resolves.toMatchObject({ id: soloId, name: "Solo" });
  });

  it("rejects a Party from another miso_party deployment", async () => {
    const staleId = id("3");
    const getObject = mock(async () => ({
      object: { objectId: staleId, type: partyType(OLD_PKG), content: partyContent(staleId) },
    }));
    const client = { core: { getObject } } as unknown as ClientWithCoreApi;

    await expect(getPartyById(client, staleId, PKG)).rejects.toThrow(
      /a Party from a different miso_party deployment/,
    );
  });

  it("rejects an object that is not a Party", async () => {
    const coinId = id("4");
    const getObject = mock(async () => ({
      object: { objectId: coinId, type: "0x2::coin::Coin<0x2::sui::SUI>", content: new Uint8Array([1]) },
    }));
    const client = { core: { getObject } } as unknown as ClientWithCoreApi;

    await expect(getPartyById(client, coinId, PKG)).rejects.toThrow(/not a 0x/);
  });

  it("reports a missing object as not found", async () => {
    const getObject = mock(async () => {
      throw new Error("Object not found");
    });
    const client = { core: { getObject } } as unknown as ClientWithCoreApi;

    await expect(getPartyById(client, id("5"), PKG)).rejects.toThrow(/Party not found/);
  });
});
