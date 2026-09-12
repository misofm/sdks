// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The `Musicos` service's own tests: the real service, over the real `Sui`,
// over the in-memory `SuiCore`. No network, no mocks of our own — everything
// comes from `sui-effect/testing`.

import { describe, expect, test } from "bun:test";
import { bcs } from "@mysten/sui/bcs";
import type { SuiClientTypes } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Effect, Layer, Result } from "effect";
import { TestClock } from "effect/testing";
import type { Sui, SuiCore } from "@unconfirmed/sui-effect";
import { ObjectDeleted, ObjectId, ObjectNotFound, SuiAddress } from "@unconfirmed/sui-effect";
import type { SuiCoreFake } from "@unconfirmed/sui-effect/testing";
import { FakeOutcome, layerExtensionTest, SuiTest } from "@unconfirmed/sui-effect/testing";
import { Journal, Signer } from "@unconfirmed/sui-effect/tx";
import * as composition from "../src/contracts/musicos/composition.ts";
import * as recording from "../src/contracts/musicos/recording.ts";
import * as release from "../src/contracts/musicos/release.ts";
import { MusicosTreasuryCapNotFound } from "../src/errors.ts";
import { Musicos } from "../src/Musicos.ts";

const padded = (suffix: string) => `0x${"0".repeat(64 - suffix.length)}${suffix}`;

const PACKAGE_ID = padded("7");
const CS = `${padded("c5")}::share::CompositionShare`;
const RS = `${padded("e5")}::share::RecordingShare`;

const keypair = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(9));
const OWNER = Signer.fromKeypair(keypair).address;
const owner: SuiClientTypes.ObjectOwner = { $kind: "AddressOwner", AddressOwner: OWNER };

const COMPOSITION_ID = padded("c01");
const COMPOSITION_ADMIN_CAP_ID = padded("ca1");
const MISSING_ID = padded("999");
const DELETED_ID = padded("dd1");
const RECORDING_ID = padded("e01");
const RECORDING_ADMIN_CAP_ID = padded("ea1");
const RELEASE_ID = padded("fe1");
const RELEASE_REGISTRY_ID = padded("fa1");
const RELEASE_ADMIN_CAP_ID = padded("fc1");
const SHARE_CURRENCY_ID = padded("5c1");
const TARGET_RELEASE_ID = padded("de1");
const PARAMETERLESS_COMPOSITION_ID = padded("c02");

const script = {
  objects: [
    {
      objectId: COMPOSITION_ID,
      type: `${PACKAGE_ID}::composition::Composition<${CS}>`,
      version: 3n,
      owner,
      content: composition.Composition.serialize({
        id: COMPOSITION_ID,
        state: { Initialized: true },
        title: "My Song",
        royalty_rate: [1000],
      }).toBytes(),
    },
    {
      objectId: DELETED_ID,
      type: `${PACKAGE_ID}::composition::Composition<${CS}>`,
      version: 1n,
      owner,
      content: composition.Composition.serialize({
        id: DELETED_ID,
        state: { Initialized: true },
        title: "Gone",
        royalty_rate: [1000],
      }).toBytes(),
    },
    {
      objectId: COMPOSITION_ADMIN_CAP_ID,
      type: `${PACKAGE_ID}::composition::CompositionAdminCap<${CS}>`,
      version: 3n,
      owner,
      content: composition.CompositionAdminCap.serialize({ id: COMPOSITION_ADMIN_CAP_ID }).toBytes(),
    },
    {
      // A malformed on-chain type: no type parameter at all. `getCompositionById`
      // still matches it (a bare expected tag compares address::module::name
      // only, so it is agnostic to whether the actual type carries
      // parameters), but `getCompositionShareType`'s `extractTypeParam` has
      // nothing to extract and must fail typed, not throw a defect.
      objectId: PARAMETERLESS_COMPOSITION_ID,
      type: `${PACKAGE_ID}::composition::Composition`,
      version: 1n,
      owner,
      content: composition.Composition.serialize({
        id: PARAMETERLESS_COMPOSITION_ID,
        state: { Initialized: true },
        title: "No Share Type",
        royalty_rate: [1000],
      }).toBytes(),
    },
    {
      objectId: RECORDING_ID,
      type: `${PACKAGE_ID}::recording::Recording<${RS}, ${CS}>`,
      version: 2n,
      owner,
      content: recording.Recording.serialize({
        id: RECORDING_ID,
        state: { Initialized: true },
        composition_id: COMPOSITION_ID,
      }).toBytes(),
    },
    {
      objectId: RECORDING_ADMIN_CAP_ID,
      type: `${PACKAGE_ID}::recording::RecordingAdminCap<${RS}>`,
      version: 2n,
      owner,
      content: recording.RecordingAdminCap.serialize({ id: RECORDING_ADMIN_CAP_ID }).toBytes(),
    },
    {
      objectId: RELEASE_ID,
      type: `${PACKAGE_ID}::release::Release`,
      version: 1n,
      owner,
      content: release.Release.serialize({
        id: RELEASE_ID,
        state: { Initialized: true },
        title: "My Release",
        tracks: [],
      }).toBytes(),
    },
    {
      objectId: RELEASE_REGISTRY_ID,
      type: `${PACKAGE_ID}::release::ReleaseRegistry`,
      version: 1n,
      content: release.ReleaseRegistry.serialize({ id: RELEASE_REGISTRY_ID }).toBytes(),
    },
    {
      objectId: RELEASE_ADMIN_CAP_ID,
      type: `${PACKAGE_ID}::release::ReleaseAdminCap`,
      version: 1n,
      owner,
      content: release.ReleaseAdminCap.serialize({ id: RELEASE_ADMIN_CAP_ID, release_id: RELEASE_ID }).toBytes(),
    },
    {
      objectId: SHARE_CURRENCY_ID,
      type: `0x2::coin::Currency<${CS}>`,
      version: 1n,
      content: new Uint8Array(),
    },
    {
      objectId: padded("dc1"),
      type: `0x2::coin::TreasuryCap<${CS}>`,
      version: 1n,
      owner,
      content: new Uint8Array(),
    },
  ],
  simulate: [
    FakeOutcome.succeed({
      commandResults: [{ returnValues: [{ bcs: bcs.Address.serialize(TARGET_RELEASE_ID).toBytes() }], mutatedReferences: [] }],
    }),
  ],
};

const provide = <A, E>(effect: Effect.Effect<A, E, Musicos | Sui | SuiCore | SuiCoreFake | TestClock.TestClock>) =>
  Effect.runPromise(
    Effect.provide(
      effect,
      Layer.mergeAll(layerExtensionTest(Musicos.layerTest({ packageId: PACKAGE_ID }), script), TestClock.layer(), Journal.layerMemory),
      { local: true },
    ),
  );

describe("Musicos: packageId and deployment", () => {
  test("the plain fields are the test deployment", async () => {
    const { packageId, deployment } = await provide(Musicos);
    expect(String(packageId)).toBe(PACKAGE_ID);
    expect(deployment.packageId).toBe(PACKAGE_ID);
  });
});

describe("Musicos: Composition", () => {
  test("getCompositionById decodes through the bare-tag bridge (a share-typed instance)", async () => {
    const result = await provide(Effect.flatMap(Musicos, (m) => m.getCompositionById(ObjectId.make(COMPOSITION_ID))));
    expect(result.title).toBe("My Song");
    expect(result.royaltyRate.value).toBe(1000);
  });

  test("ObjectNotFound for a missing composition", async () => {
    const error = await provide(
      Effect.flatMap(Musicos, (m) => Effect.flip(m.getCompositionById(ObjectId.make(MISSING_ID)))),
    );
    expect(error).toBeInstanceOf(ObjectNotFound);
  });

  test("ObjectDeleted after SuiTest.deleteObject", async () => {
    const error = await provide(
      Effect.gen(function* () {
        const musicos = yield* Musicos;
        yield* SuiTest.deleteObject(DELETED_ID);
        return yield* Effect.flip(musicos.getCompositionById(ObjectId.make(DELETED_ID)));
      }),
    );
    expect(error).toBeInstanceOf(ObjectDeleted);
  });

  test("DecodeError reading a Release through the Composition codec (wrong, parameterless tag)", async () => {
    const error = await provide(
      Effect.flatMap(Musicos, (m) => Effect.flip(m.getCompositionById(ObjectId.make(RELEASE_ID)))),
    );
    expect(error._tag).toBe("DecodeError");
  });

  test("getCompositionsByIds: one Result per id, a missing id fails only its own position", async () => {
    const results = await provide(
      Effect.flatMap(Musicos, (m) =>
        m.getCompositionsByIds([ObjectId.make(COMPOSITION_ID), ObjectId.make(MISSING_ID)])),
    );
    expect(results).toHaveLength(2);
    expect(Result.isSuccess(results[0]!)).toBe(true);
    expect(Result.isFailure(results[1]!)).toBe(true);
  });

  test("getCompositionShareType extracts the share type off the object's own tag", async () => {
    const shareType = await provide(Effect.flatMap(Musicos, (m) => m.getCompositionShareType(ObjectId.make(COMPOSITION_ID))));
    expect(shareType).toBe(CS);
  });

  test("getCompositionById reads a parameterless Composition tag fine (a bare expected tag is agnostic to it)", async () => {
    const result = await provide(
      Effect.flatMap(Musicos, (m) => m.getCompositionById(ObjectId.make(PARAMETERLESS_COMPOSITION_ID))),
    );
    expect(result.title).toBe("No Share Type");
  });

  test("getCompositionShareType is DecodeError, not a thrown defect, for a parameterless Composition tag", async () => {
    const error = await provide(
      Effect.flatMap(Musicos, (m) => Effect.flip(m.getCompositionShareType(ObjectId.make(PARAMETERLESS_COMPOSITION_ID)))),
    );
    expect(error._tag).toBe("DecodeError");
  });

  test("getCompositionAdminCapById reads { id } from content and shareType from the object's tag", async () => {
    const cap = await provide(Effect.flatMap(Musicos, (m) => m.getCompositionAdminCapById(ObjectId.make(COMPOSITION_ADMIN_CAP_ID))));
    expect(String(cap.id)).toBe(COMPOSITION_ADMIN_CAP_ID);
    expect(cap.shareType).toBe(CS);
  });

  test("getOwnedCompositionAdminCaps sends listOwnedObjects with the bare cap type", async () => {
    const { caps, calls } = await provide(
      Effect.gen(function* () {
        const musicos = yield* Musicos;
        const caps = yield* musicos.getOwnedCompositionAdminCaps(SuiAddress.make(OWNER));
        const calls = yield* SuiTest.calls("listOwnedObjects");
        return { caps, calls };
      }),
    );
    expect(caps).toHaveLength(1);
    expect(caps[0]!.shareType).toBe(CS);
    expect(calls.length).toBeGreaterThan(0);
    expect((calls[0]!.options as { readonly type?: string }).type).toBe(`${PACKAGE_ID}::composition::CompositionAdminCap`);
  });
});

describe("Musicos: Recording", () => {
  test("getRecordingById decodes through the bare-tag bridge", async () => {
    const result = await provide(Effect.flatMap(Musicos, (m) => m.getRecordingById(ObjectId.make(RECORDING_ID))));
    expect(result.compositionId).toBe(COMPOSITION_ID);
  });

  test("getRecordingsByIds: a missing id fails only its own position", async () => {
    const results = await provide(
      Effect.flatMap(Musicos, (m) => m.getRecordingsByIds([ObjectId.make(RECORDING_ID), ObjectId.make(MISSING_ID)])),
    );
    expect(Result.isSuccess(results[0]!)).toBe(true);
    expect(Result.isFailure(results[1]!)).toBe(true);
  });

  test("getRecordingShareTypes splits both parameters, in order", async () => {
    const [recordingShare, compositionShare] = await provide(
      Effect.flatMap(Musicos, (m) => m.getRecordingShareTypes(ObjectId.make(RECORDING_ID))),
    );
    expect(recordingShare).toBe(RS);
    expect(compositionShare).toBe(CS);
  });

  test("getRecordingShareType returns only the recording's own share type", async () => {
    const shareType = await provide(Effect.flatMap(Musicos, (m) => m.getRecordingShareType(ObjectId.make(RECORDING_ID))));
    expect(shareType).toBe(RS);
  });

  test("getRecordingAdminCapById reads { id } from content and shareType from the tag", async () => {
    const cap = await provide(Effect.flatMap(Musicos, (m) => m.getRecordingAdminCapById(ObjectId.make(RECORDING_ADMIN_CAP_ID))));
    expect(cap.shareType).toBe(RS);
  });

  test("getOwnedRecordingAdminCaps sends listOwnedObjects with the bare cap type", async () => {
    const { caps, calls } = await provide(
      Effect.gen(function* () {
        const musicos = yield* Musicos;
        const caps = yield* musicos.getOwnedRecordingAdminCaps(SuiAddress.make(OWNER));
        const calls = yield* SuiTest.calls("listOwnedObjects");
        return { caps, calls };
      }),
    );
    expect(caps).toHaveLength(1);
    expect(calls.some((call) => (call.options as { readonly type?: string }).type === `${PACKAGE_ID}::recording::RecordingAdminCap`)).toBe(
      true,
    );
  });
});

describe("Musicos: Release", () => {
  test("getReleaseById, getReleaseRegistryById and getReleaseAdminCapById decode (non-generic, exact-tag) content", async () => {
    const { rel, registry, cap } = await provide(
      Effect.gen(function* () {
        const musicos = yield* Musicos;
        const rel = yield* musicos.getReleaseById(ObjectId.make(RELEASE_ID));
        const registry = yield* musicos.getReleaseRegistryById(ObjectId.make(RELEASE_REGISTRY_ID));
        const cap = yield* musicos.getReleaseAdminCapById(ObjectId.make(RELEASE_ADMIN_CAP_ID));
        return { rel, registry, cap };
      }),
    );
    expect(rel.title).toBe("My Release");
    expect(String(registry.id)).toBe(RELEASE_REGISTRY_ID);
    // `ReleaseAdminCap` now decodes `releaseId` from BCS content directly.
    expect(cap.releaseId).toBe(RELEASE_ID);
  });

  test("getReleasesByIds: a missing id fails only its own position", async () => {
    const results = await provide(
      Effect.flatMap(Musicos, (m) => m.getReleasesByIds([ObjectId.make(RELEASE_ID), ObjectId.make(MISSING_ID)])),
    );
    expect(Result.isSuccess(results[0]!)).toBe(true);
    expect(Result.isFailure(results[1]!)).toBe(true);
  });

  test("getOwnedReleaseAdminCaps decodes full content (id, releaseId) for every owned cap", async () => {
    const caps = await provide(Effect.flatMap(Musicos, (m) => m.getOwnedReleaseAdminCaps(SuiAddress.make(OWNER))));
    expect(caps).toHaveLength(1);
    expect(caps[0]!.releaseId).toBe(RELEASE_ID);
  });
});

describe("Musicos: Share Currency", () => {
  test("getShareCurrencyType extracts the share type off the object's tag", async () => {
    const shareType = await provide(Effect.flatMap(Musicos, (m) => m.getShareCurrencyType(ObjectId.make(SHARE_CURRENCY_ID))));
    expect(shareType).toBe(CS);
  });

  test("getShareCurrencyTreasuryCap finds the owned TreasuryCap<shareType>", async () => {
    const capId = await provide(Effect.flatMap(Musicos, (m) => m.getShareCurrencyTreasuryCap(CS, SuiAddress.make(OWNER))));
    expect(String(capId)).toBe(padded("dc1"));
  });

  test("musicos/TreasuryCapNotFound when no cap is owned", async () => {
    const error = await provide(
      Effect.flatMap(Musicos, (m) => Effect.flip(m.getShareCurrencyTreasuryCap(RS, SuiAddress.make(OWNER)))),
    );
    expect(error).toBeInstanceOf(MusicosTreasuryCapNotFound);
    expect((error as MusicosTreasuryCapNotFound).outcome).toBe("not_applied");
  });

  test("getShareCurrencyTreasuryCap is DecodeError, not a thrown defect, for a malformed shareType", async () => {
    const error = await provide(
      Effect.flatMap(Musicos, (m) => Effect.flip(m.getShareCurrencyTreasuryCap("not a valid type", SuiAddress.make(OWNER)))),
    );
    expect(error._tag).toBe("DecodeError");
  });
});

describe("Musicos: view.deriveTargetReleaseId", () => {
  test("sends simulateTransaction with checksEnabled: false and decodes the returned address", async () => {
    const { releaseId, calls } = await provide(
      Effect.gen(function* () {
        const musicos = yield* Musicos;
        const releaseId = yield* musicos.view.deriveTargetReleaseId({
          sender: SuiAddress.make(OWNER),
          recordingIds: [ObjectId.make(RECORDING_ID)],
          splitBps: [10_000],
          nonce: 1,
          releaseRegistryId: ObjectId.make(RELEASE_REGISTRY_ID),
        });
        const calls = yield* SuiTest.calls("simulateTransaction");
        return { releaseId, calls };
      }),
    );
    expect(String(releaseId)).toBe(TARGET_RELEASE_ID);
    expect(calls).toHaveLength(1);
    expect((calls[0]!.options as { readonly checksEnabled?: boolean }).checksEnabled).toBe(false);
  });
});

describe("Musicos: the version the fake serves is the version the extension reads", () => {
  test("SuiTest.bumpVersion is visible on the next read", async () => {
    const versions = await provide(
      Effect.gen(function* () {
        const musicos = yield* Musicos;
        const before = yield* musicos.getCompositionById(ObjectId.make(COMPOSITION_ID));
        yield* SuiTest.bumpVersion(COMPOSITION_ID);
        const after = yield* musicos.getCompositionById(ObjectId.make(COMPOSITION_ID));
        return [before.id, after.id];
      }),
    );
    // The content is unchanged by a bare version bump; asserting on a
    // downstream read (not just the raw envelope) is the point.
    expect(versions).toEqual([COMPOSITION_ID, COMPOSITION_ID]);
  });
});
