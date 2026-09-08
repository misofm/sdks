// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { bcs } from "@mysten/sui/bcs";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import * as releaseKind from "../../src/contracts/release_kind/release_kind.ts";
import {
  getReleaseKind,
  releaseKindFieldId,
} from "../../src/release-extensions.ts";

const RELEASE = `0x${"11".repeat(32)}`;
const PACKAGE = `0x${"22".repeat(32)}`;
const FIELD = releaseKindFieldId(RELEASE, PACKAGE);
const Field = bcs.struct("Field", {
  id: bcs.Address,
  name: releaseKind.ExtensionKey,
  value: bcs.string(),
});
const content = Field.serialize({
  id: FIELD,
  name: [false],
  value: "EP",
}).toBytes();

function client(value: Uint8Array | null): ClientWithCoreApi {
  return {
    core: {
      getObjects: async () => ({
        objects: value
          ? [{ objectId: FIELD, content: value, type: "0x2::dynamic_field::Field" }]
          : [new Error("not found")],
      }),
    },
  } as unknown as ClientWithCoreApi;
}

test("reads the release_kind dynamic field", async () => {
  await expect(getReleaseKind(client(content), RELEASE, PACKAGE)).resolves.toBe(
    "EP",
  );
});

test("an absent release_kind is null", async () => {
  await expect(getReleaseKind(client(null), RELEASE, PACKAGE)).resolves.toBeNull();
});
