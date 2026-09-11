// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The derived Promise face, tested exactly the way a consumer writes it:
// `client.$extend(musicos())` against the in-memory fake, no network.

import { describe, expect, test } from "bun:test";
import { bcs } from "@mysten/sui/bcs";
import { Effect } from "effect";
import { ObjectId, SuiAddress } from "sui-effect";
import { FakeOutcome, SuiCoreFake } from "sui-effect/testing";
import * as release from "../src/contracts/musicos/release.ts";
import { musicos } from "../src/extension.ts";

const padded = (suffix: string) => `0x${"0".repeat(64 - suffix.length)}${suffix}`;

const PACKAGE_ID = padded("7");
const RELEASE_ID = padded("fe1");
const MISSING_ID = padded("999");
const RELEASE_REGISTRY_ID = padded("fa1");
const TARGET_RELEASE_ID = padded("de1");
const SENDER = padded("5e2");

const script = {
  objects: [
    {
      objectId: RELEASE_ID,
      type: `${PACKAGE_ID}::release::Release`,
      version: 1n,
      content: release.Release.serialize({
        id: RELEASE_ID,
        state: { Initialized: true },
        title: "The Extension Face",
        tracks: [],
      }).toBytes(),
    },
    {
      objectId: RELEASE_REGISTRY_ID,
      type: `${PACKAGE_ID}::release::ReleaseRegistry`,
      version: 1n,
      content: release.ReleaseRegistry.serialize({ id: RELEASE_REGISTRY_ID }).toBytes(),
    },
  ],
  simulate: [
    FakeOutcome.succeed({
      commandResults: [{ returnValues: [{ bcs: bcs.Address.serialize(TARGET_RELEASE_ID).toBytes() }], mutatedReferences: [] }],
    }),
  ],
};

describe("musicos(): the derived Promise face", () => {
  test("client.$extend(musicos()) — an Effect member, a namespaced view member, a typed rejection, and dispose()", async () => {
    const fake = await Effect.runPromise(Effect.provide(SuiCoreFake, SuiCoreFake.layer(script)));
    const client = fake.client.$extend(musicos({ deployment: { packageId: PACKAGE_ID } }));

    // An `Effect` member: a zero-argument method returning a Promise.
    const found = await client.musicos.getReleaseById(ObjectId.make(RELEASE_ID));
    expect(found.title).toBe("The Extension Face");

    // A namespaced member (`view`), mapped recursively.
    const derived = await client.musicos.view.deriveTargetReleaseId({
      sender: SuiAddress.make(SENDER),
      recordingIds: [],
      splitBps: [],
      nonce: 0,
      releaseRegistryId: ObjectId.make(RELEASE_REGISTRY_ID),
    });
    expect(String(derived)).toBe(TARGET_RELEASE_ID);

    // A rejection is the same tagged error instance a Promise consumer can
    // switch on `_tag` for.
    await expect(client.musicos.getReleaseById(ObjectId.make(MISSING_ID))).rejects.toMatchObject({
      _tag: "ObjectNotFound",
    });

    await client.musicos.dispose();
  });
});
