// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";
import { layerTest } from "@unconfirmed/sui-effect/testing";
import {
  ArtistRole,
  RolesKey,
} from "../src/contracts/party_roles/party_roles.ts";
import { removeRole } from "../src/party/extensions/roles.ts";
import { getRoles, getRoleValues } from "../src/party/queries.ts";

const PARTY_ID = `0x${"31".repeat(32)}`;
const FIELD_ID = `0x${"32".repeat(32)}`;
const PACKAGE_ID = `0x${"33".repeat(32)}`;
const KEY_TYPE = `${PACKAGE_ID}::party_roles::RolesKey`;

const roleScript = {
  dynamicFields: {
    [PARTY_ID]: [
      {
        $kind: "DynamicField" as const,
        fieldId: FIELD_ID,
        type: `0x2::dynamic_field::Field<${KEY_TYPE}, vector<${PACKAGE_ID}::party_roles::ArtistRole>>`,
        name: { type: KEY_TYPE, bcs: RolesKey.serialize([false]).toBytes() },
        valueType: `vector<${PACKAGE_ID}::party_roles::ArtistRole>`,
      },
    ],
  },
  dynamicFieldValues: {
    [FIELD_ID]: {
      type: `vector<${PACKAGE_ID}::party_roles::ArtistRole>`,
      bcs: bcs
        .vector(ArtistRole)
        .serialize([{ Artist: true }, { Custom: "Artist" }])
        .toBytes(),
    },
  },
};

describe("party role identity", () => {
  test("the exact query keeps canonical Artist distinct from Custom(Artist)", async () => {
    const roles = await Effect.runPromise(
      getRoleValues(PARTY_ID, PACKAGE_ID).pipe(
        Effect.provide(layerTest(roleScript)),
      ),
    );
    expect(roles).toEqual([
      { kind: "artist" },
      { kind: "custom", name: "Artist" },
    ]);
  });

  test("the compatibility display query remains unchanged", async () => {
    const roles = await Effect.runPromise(
      getRoles(PARTY_ID, PACKAGE_ID).pipe(
        Effect.provide(layerTest(roleScript)),
      ),
    );
    expect(roles).toEqual(["Artist", "Artist"]);
  });

  test("independent removals construct the matching canonical and custom values", () => {
    const functionsFor = (
      role: { kind: "artist" } | { kind: "custom"; name: string },
    ) => {
      const transaction = new Transaction();
      removeRole({
        partyId: PARTY_ID,
        capId: `0x${"34".repeat(32)}`,
        partyRolesPackageId: PACKAGE_ID,
        role,
      })(transaction);
      return transaction
        .getData()
        .commands.flatMap((command) =>
          command.$kind === "MoveCall" ? [command.MoveCall.function] : [],
        );
    };

    expect(functionsFor({ kind: "artist" })).toEqual(["artist", "remove_role"]);
    expect(functionsFor({ kind: "custom", name: "Artist" })).toEqual([
      "custom",
      "remove_role",
    ]);
  });
});
