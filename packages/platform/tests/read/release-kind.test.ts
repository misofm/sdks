// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { Effect } from "effect";
import { bcs } from "@mysten/sui/bcs";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { SuiClient } from "@misofm/effect";
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
      getObject: async ({ objectId }: { objectId: string }) => {
        if (!value || objectId !== FIELD) throw new Error(`Object ${objectId} not found`);
        return { object: { objectId, content: value, type: "0x2::dynamic_field::Field", version: "1" } };
      },
    },
  } as unknown as ClientWithCoreApi;
}

function run<A, E>(effect: Effect.Effect<A, E, SuiClient>, fake: ClientWithCoreApi): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(SuiClient.layer(fake))));
}

test("reads the release_kind dynamic field", async () => {
  await expect(run(getReleaseKind(RELEASE, PACKAGE), client(content))).resolves.toBe("EP");
});

test("an absent release_kind is null", async () => {
  await expect(run(getReleaseKind(RELEASE, PACKAGE), client(null))).resolves.toBeNull();
});
