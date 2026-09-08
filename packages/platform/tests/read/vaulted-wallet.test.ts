// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import { contracts } from "@misofm/musicos";
import * as vaultContract from "../../src/contracts/vault/vault.ts";
import type { MisoClient } from "../../src/read/client.ts";
import {
  classifyVaultedWorkAdminCapType,
  getOwnedWorks,
  getWorkByCap,
} from "../../src/read/wallet.ts";

const MISO = `0x${"11".repeat(32)}`;
const VAULT_PACKAGE = `0x${"22".repeat(32)}`;
const PRESSING = `0x${"33".repeat(32)}`;
const SHARE = `0x${"44".repeat(32)}::share::Share`;
const RELEASE = `0x${"55".repeat(32)}`;
const VAULT = `0x${"66".repeat(32)}`;
const VAULT_CAP = `0x${"77".repeat(32)}`;
const RAW_CAP = `0x${"88".repeat(32)}`;
const REFERENT = `0x${"99".repeat(32)}`;
const PLUGINS = `0x${"aa".repeat(32)}`;

const RELEASE_CAP_TYPE = `${MISO}::release::ReleaseAdminCap`;
const VAULT_CAP_TYPE = `${VAULT_PACKAGE}::vault::VaultAdminCap<${RELEASE_CAP_TYPE}>`;
const VAULT_TYPE = `${VAULT_PACKAGE}::vault::Vault<${RELEASE_CAP_TYPE}>`;

function releaseBytes(): Uint8Array {
  return contracts.release.Release.serialize({
    id: RELEASE,
    state: { Published: 123n },
    title: "Vaulted release",
    tracks: [],
  }).toBytes();
}

function vaultBytes(): Uint8Array {
  return vaultContract.Vault(contracts.release.ReleaseAdminCap).serialize({
    id: VAULT,
    cap_id: RAW_CAP,
    cap: {
      id: REFERENT,
      value: { id: RAW_CAP, release_id: RELEASE },
    },
    authorized_plugins: { id: PLUGINS, size: 1n },
  }).toBytes();
}

function vaultCapBytes(): Uint8Array {
  return vaultContract.VaultAdminCap.serialize({ id: VAULT_CAP, vault_id: VAULT }).toBytes();
}

function fakeClient(): MisoClient {
  const core = {
    listOwnedObjects: async ({ type }: { type?: string }) => ({
      objects:
        type === `${VAULT_PACKAGE}::vault::VaultAdminCap`
          ? [{ objectId: VAULT_CAP, type: VAULT_CAP_TYPE, content: vaultCapBytes() }]
          : [],
      hasNextPage: false,
      cursor: null,
    }),
    getObjects: async ({ objectIds }: { objectIds: string[] }) => ({
      objects: objectIds.map((objectId) =>
        objectId === VAULT
          ? { objectId, type: VAULT_TYPE, content: vaultBytes() }
          : { objectId, type: `${MISO}::release::Release`, content: releaseBytes() },
      ),
    }),
    getObject: async ({ objectId }: { objectId: string }) => {
      if (objectId === VAULT_CAP) {
        return {
          object: {
            objectId,
            type: VAULT_CAP_TYPE,
            content: vaultCapBytes(),
            json: { vault_id: VAULT },
          },
        };
      }
      if (objectId === RELEASE) {
        return {
          object: {
            objectId,
            type: `${MISO}::release::Release`,
            content: releaseBytes(),
          },
        };
      }
      throw new Error(`Unexpected object ${objectId}`);
    },
  };
  return {
    config: {
      deployment: { musicos: MISO },
      protocol: { vault: VAULT_PACKAGE },
    },
    protocol: { core },
    graphql: {},
  } as unknown as MisoClient;
}

describe("vaulted work cap classification", () => {
  test("recognizes all catalog work caps through the nested VaultAdminCap type", () => {
    expect(
      classifyVaultedWorkAdminCapType(
        `${VAULT_PACKAGE}::vault::VaultAdminCap<${MISO}::composition::CompositionAdminCap<${SHARE}>>`,
        VAULT_PACKAGE,
        MISO,
      ),
    ).toEqual({ kind: "composition", shareType: SHARE });
    expect(
      classifyVaultedWorkAdminCapType(
        `${VAULT_PACKAGE}::vault::VaultAdminCap<${MISO}::recording::RecordingAdminCap<${SHARE}>>`,
        VAULT_PACKAGE,
        MISO,
      ),
    ).toEqual({ kind: "recording", shareType: SHARE });
    expect(
      classifyVaultedWorkAdminCapType(VAULT_CAP_TYPE, VAULT_PACKAGE, MISO),
    ).toEqual({ kind: "release" });
  });

  test("rejects pressing caps and foreign or malformed vault types", () => {
    expect(
      classifyVaultedWorkAdminCapType(
        `${VAULT_PACKAGE}::vault::VaultAdminCap<${PRESSING}::pressing::PressingAdminCap>`,
        VAULT_PACKAGE,
        MISO,
      ),
    ).toBeNull();
    expect(
      classifyVaultedWorkAdminCapType(VAULT_CAP_TYPE, `0x${"ff".repeat(32)}`, MISO),
    ).toBeNull();
    expect(
      classifyVaultedWorkAdminCapType("not-a-type", VAULT_PACKAGE, MISO),
    ).toBeNull();
  });
});

test("getOwnedWorks lists a release through its owner-held VaultAdminCap", async () => {
  await expect(getOwnedWorks(fakeClient(), `0x${"bb".repeat(32)}`)).resolves.toEqual([
    {
      capId: VAULT_CAP,
      kind: "release",
      workId: RELEASE,
      title: "Vaulted release",
      state: "Published",
    },
  ]);
});

test("getWorkByCap resolves a VaultAdminCap detail route through its shared vault", async () => {
  await expect(getWorkByCap(fakeClient(), VAULT_CAP)).resolves.toEqual({
    capId: VAULT_CAP,
    kind: "release",
    workId: RELEASE,
    title: "Vaulted release",
    state: "Published",
    discCount: 0,
    trackCount: 0,
  });
});
