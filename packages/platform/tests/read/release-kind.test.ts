// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { Effect } from "effect";
import { bcs } from "@mysten/sui/bcs";
import type { Sui } from "@unconfirmed/sui-effect";
import { layerTest, type FakeObject } from "@unconfirmed/sui-effect/testing";
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

function objects(value: Uint8Array | null): FakeObject[] {
  if (!value) return [];
  return [{ objectId: FIELD, type: "0x2::dynamic_field::Field", version: 1n, content: value }];
}

function run<A, E>(effect: Effect.Effect<A, E, Sui>, value: Uint8Array | null): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, layerTest({ objects: objects(value) }), { local: true }));
}

test("reads the release_kind dynamic field", async () => {
  await expect(run(getReleaseKind(RELEASE, PACKAGE), content)).resolves.toBe("EP");
});

test("an absent release_kind is null", async () => {
  await expect(run(getReleaseKind(RELEASE, PACKAGE), null)).resolves.toBeNull();
});
