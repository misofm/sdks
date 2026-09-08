// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { bcs } from "@mysten/sui/bcs";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { Effect } from "effect";
import { SuiClient } from "@misofm/effect";
import * as releaseGenreContract from "../src/contracts/release_genre/release_genre.ts";
import * as recordingGenreContract from "../src/contracts/recording_genre/recording_genre.ts";
import {
  addRecordingGenre,
  addReleaseGenre,
  clearRecordingGenres,
  clearReleaseGenres,
  deriveGenreAddress,
  getRecordingGenres,
  getReleaseGenres,
  parseRecordingGenresContent,
  parseReleaseGenresContent,
  recordingGenresFieldId,
  releaseGenresFieldId,
  removeRecordingGenre,
  removeReleaseGenre,
  setRecordingGenres,
  setReleaseGenres,
} from "../src/genre.ts";

const PKG = `0x${"cd".repeat(32)}`;
const A = `0x${"ab".repeat(32)}`;
const B = `0x${"bc".repeat(32)}`;
const C = `0x${"de".repeat(32)}`;
const RECORDING = `0x${"11".repeat(32)}`;
const RELEASE = `0x${"22".repeat(32)}`;
const CAP = `0x${"66".repeat(32)}`;
const RECORDING_SHARE = `${PKG}::recording_share::RECORDING_SHARE`;
const COMPOSITION_SHARE = `${PKG}::composition_share::COMPOSITION_SHARE`;

interface MoveCall {
  package?: string;
  module: string;
  function: string;
  typeArguments: string[];
  arguments: { Input: number; $kind: string }[];
}

function moveCalls(tx: Transaction): MoveCall[] {
  return tx.getData().commands.flatMap((command) =>
    command.$kind === "MoveCall" ? [command.MoveCall as MoveCall] : []
  );
}

function inputAt(tx: Transaction, index: number) {
  return tx.getData().inputs[index] as {
    $kind: string;
    UnresolvedObject?: { objectId: string };
    Pure?: { bytes: string };
  };
}

// Pinned against the on-chain derivation (sui::derived_object::derive_address
// via df::hash_type_and_key with the DerivedObjectKey wrapper), computed by a
// genre unit test on sui 1.77.2: registry 0x3440…, package 0xcbbc…, name
// "ELECTRONIC" → 0xc381…. Guards the off-chain formula byte-for-byte.
test("genre address derivation matches the on-chain test vector", () => {
  expect(
    deriveGenreAddress(
      "0x34401905bebdf8c04f3cd5f04f442a39372c8dc321c29edfb4f9cb30b23ab96",
      "0xcbbce10e8b0781d458e88ce99d08e0c85f1e674c5b7ec975383d74f87a1d76b1",
      "ELECTRONIC",
    ),
  ).toBe("0xc381b7c03d87719d0e1b7b33a08ba8193bfa0af612b05705c4b62a54b18f5ddb");
});

test("genre ids are deterministic and canonical names fail closed", () => {
  expect(deriveGenreAddress(A, PKG, "ELECTRONIC")).toMatch(/^0x[0-9a-f]{64}$/);
  expect(deriveGenreAddress(A, PKG, "ELECTRONIC")).toBe(
    deriveGenreAddress(A, PKG, "ELECTRONIC"),
  );
  expect(() => deriveGenreAddress(A, PKG, "Electronic")).toThrow(
    /uppercase A-Z and underscores/,
  );
});

test("setReleaseGenres emits clear_genres then one add_genre per id, in that order", () => {
  const tx = new Transaction();
  setReleaseGenres({
    releaseId: RELEASE,
    releaseAdminCapId: CAP,
    genreIds: [A, B, C],
    releaseGenrePackageId: PKG,
  })(tx);

  const calls = moveCalls(tx);
  expect(calls.map((call) => `${call.module}::${call.function}`)).toEqual([
    "release_genre::clear_genres",
    "release_genre::add_genre",
    "release_genre::add_genre",
    "release_genre::add_genre",
  ]);
  expect(calls.every((call) => call.package === PKG)).toBe(true);
  const genreArg = [A, B, C].map((_, index) => {
    const argument = calls[index + 1]!.arguments[2]!;
    return inputAt(tx, argument.Input).UnresolvedObject?.objectId;
  });
  expect(genreArg).toEqual([A, B, C]);
});

test("setReleaseGenres composes idempotently across two calls in one transaction", () => {
  const tx = new Transaction();
  const params = {
    releaseId: RELEASE,
    releaseAdminCapId: CAP,
    genreIds: [A, B],
    releaseGenrePackageId: PKG,
  };
  setReleaseGenres(params)(tx);
  setReleaseGenres(params)(tx);

  const calls = moveCalls(tx);
  expect(calls.map((call) => `${call.module}::${call.function}`)).toEqual([
    "release_genre::clear_genres",
    "release_genre::add_genre",
    "release_genre::add_genre",
    "release_genre::clear_genres",
    "release_genre::add_genre",
    "release_genre::add_genre",
  ]);
});

test("setReleaseGenres validates before returning a thunk", () => {
  expect(() =>
    setReleaseGenres({
      releaseId: RELEASE,
      releaseAdminCapId: CAP,
      genreIds: [],
      releaseGenrePackageId: PKG,
    }),
  ).toThrow(/must not be empty/);
  expect(() =>
    setReleaseGenres({
      releaseId: RELEASE,
      releaseAdminCapId: CAP,
      genreIds: [A, B, C, A, B, C, A],
      releaseGenrePackageId: PKG,
    }),
  ).toThrow(/at most 6 genres/);
  expect(() =>
    setReleaseGenres({
      releaseId: RELEASE,
      releaseAdminCapId: CAP,
      genreIds: [A, A],
      releaseGenrePackageId: PKG,
    }),
  ).toThrow(/duplicate genre id/);
  // Differing only by case/leading zeros normalizes to the same address.
  expect(() =>
    setReleaseGenres({
      releaseId: RELEASE,
      releaseAdminCapId: CAP,
      genreIds: [A, `0X${"AB".repeat(32)}`],
      releaseGenrePackageId: PKG,
    }),
  ).toThrow(/duplicate genre id/);
});

test("setRecordingGenres emits clear_genres then N recording_genre::add_genre calls with typeArguments", () => {
  const tx = new Transaction();
  setRecordingGenres({
    recordingId: RECORDING,
    authority: { kind: "direct", adminCap: CAP },
    recordingShareType: RECORDING_SHARE,
    compositionShareType: COMPOSITION_SHARE,
    recordingGenrePackageId: PKG,
    genreIds: [A, B],
  })(tx);

  const calls = moveCalls(tx);
  expect(calls.map((call) => `${call.module}::${call.function}`)).toEqual([
    "recording_genre::clear_genres",
    "recording_genre::add_genre",
    "recording_genre::add_genre",
  ]);
  expect(calls.every((call) => call.package === PKG)).toBe(true);
  expect(calls.every((call) =>
    call.typeArguments.length === 2 &&
    call.typeArguments[0] === RECORDING_SHARE &&
    call.typeArguments[1] === COMPOSITION_SHARE
  )).toBe(true);
  // invokeWithAdminCap splices the borrowed cap in at adminCapIndex: 1, so the
  // final argument order is [recording, adminCap, genre] — not the two-element
  // [recording, genre] list the caller passed in.
  const clearCall = calls[0]!;
  expect(clearCall.arguments.length).toBe(2);
  expect(inputAt(tx, clearCall.arguments[0]!.Input).UnresolvedObject?.objectId).toBe(RECORDING);
  expect(inputAt(tx, clearCall.arguments[1]!.Input).UnresolvedObject?.objectId).toBe(CAP);
  [A, B].forEach((genreId, index) => {
    const call = calls[index + 1]!;
    expect(call.arguments.length).toBe(3);
    expect(inputAt(tx, call.arguments[0]!.Input).UnresolvedObject?.objectId).toBe(RECORDING);
    expect(inputAt(tx, call.arguments[1]!.Input).UnresolvedObject?.objectId).toBe(CAP);
    expect(inputAt(tx, call.arguments[2]!.Input).UnresolvedObject?.objectId).toBe(genreId);
  });
});

test("removeReleaseGenre and removeRecordingGenre pass the genre id as a pure input", () => {
  const releaseTx = new Transaction();
  removeReleaseGenre({
    releaseId: RELEASE,
    releaseAdminCapId: CAP,
    genreId: A,
    releaseGenrePackageId: PKG,
  })(releaseTx);
  const releaseCall = moveCalls(releaseTx)[0]!;
  expect(`${releaseCall.module}::${releaseCall.function}`).toBe("release_genre::remove_genre");
  const releasePure = inputAt(releaseTx, releaseCall.arguments[2]!.Input).Pure;
  expect(releasePure).toBeDefined();
  expect(fromBase64(releasePure!.bytes)).toEqual(bcs.Address.serialize(A).toBytes());

  const recordingTx = new Transaction();
  removeRecordingGenre({
    recordingId: RECORDING,
    authority: { kind: "direct", adminCap: CAP },
    recordingShareType: RECORDING_SHARE,
    compositionShareType: COMPOSITION_SHARE,
    genreId: A,
    recordingGenrePackageId: PKG,
  })(recordingTx);
  const recordingCall = moveCalls(recordingTx)[0]!;
  expect(`${recordingCall.module}::${recordingCall.function}`).toBe("recording_genre::remove_genre");
  const recordingPure = inputAt(recordingTx, recordingCall.arguments[2]!.Input).Pure;
  expect(recordingPure).toBeDefined();
  expect(fromBase64(recordingPure!.bytes)).toEqual(bcs.Address.serialize(A).toBytes());
});

test("addReleaseGenre and addRecordingGenre emit a single add_genre call", () => {
  const releaseTx = new Transaction();
  addReleaseGenre({
    releaseId: RELEASE,
    releaseAdminCapId: CAP,
    genreId: A,
    releaseGenrePackageId: PKG,
  })(releaseTx);
  expect(moveCalls(releaseTx).map((call) => `${call.module}::${call.function}`)).toEqual([
    "release_genre::add_genre",
  ]);

  const recordingTx = new Transaction();
  addRecordingGenre({
    recordingId: RECORDING,
    authority: { kind: "direct", adminCap: CAP },
    recordingShareType: RECORDING_SHARE,
    compositionShareType: COMPOSITION_SHARE,
    genreId: A,
    recordingGenrePackageId: PKG,
  })(recordingTx);
  expect(moveCalls(recordingTx).map((call) => `${call.module}::${call.function}`)).toEqual([
    "recording_genre::add_genre",
  ]);
});

test("clearReleaseGenres and clearRecordingGenres emit a single clear_genres call", () => {
  const releaseTx = new Transaction();
  clearReleaseGenres({
    releaseId: RELEASE,
    releaseAdminCapId: CAP,
    releaseGenrePackageId: PKG,
  })(releaseTx);
  const releaseCalls = moveCalls(releaseTx);
  expect(releaseCalls.map((call) => `${call.module}::${call.function}`)).toEqual([
    "release_genre::clear_genres",
  ]);
  expect(releaseCalls[0]!.package).toBe(PKG);
  expect(releaseCalls[0]!.arguments.length).toBe(2);
  expect(inputAt(releaseTx, releaseCalls[0]!.arguments[0]!.Input).UnresolvedObject?.objectId).toBe(RELEASE);
  expect(inputAt(releaseTx, releaseCalls[0]!.arguments[1]!.Input).UnresolvedObject?.objectId).toBe(CAP);

  const recordingTx = new Transaction();
  clearRecordingGenres({
    recordingId: RECORDING,
    authority: { kind: "direct", adminCap: CAP },
    recordingShareType: RECORDING_SHARE,
    compositionShareType: COMPOSITION_SHARE,
    recordingGenrePackageId: PKG,
  })(recordingTx);
  const recordingCalls = moveCalls(recordingTx);
  expect(recordingCalls.map((call) => `${call.module}::${call.function}`)).toEqual([
    "recording_genre::clear_genres",
  ]);
  expect(recordingCalls[0]!.package).toBe(PKG);
  expect(recordingCalls[0]!.typeArguments).toEqual([RECORDING_SHARE, COMPOSITION_SHARE]);
  expect(recordingCalls[0]!.arguments.length).toBe(2);
  expect(inputAt(recordingTx, recordingCalls[0]!.arguments[0]!.Input).UnresolvedObject?.objectId).toBe(RECORDING);
  expect(inputAt(recordingTx, recordingCalls[0]!.arguments[1]!.Input).UnresolvedObject?.objectId).toBe(CAP);
});

const ReleaseGenresField = bcs.struct("Field", {
  id: bcs.Address,
  name: releaseGenreContract.ExtensionKey,
  value: bcs.vector(bcs.Address),
});
const RecordingGenresField = bcs.struct("Field", {
  id: bcs.Address,
  name: recordingGenreContract.ExtensionKey,
  value: bcs.vector(bcs.Address),
});

test("parseReleaseGenresContent and parseRecordingGenresContent round-trip the ordered list", () => {
  const releaseFieldId = releaseGenresFieldId(RELEASE, PKG);
  const releaseContent = ReleaseGenresField.serialize({
    id: releaseFieldId,
    name: [false],
    value: [A, B],
  }).toBytes();
  expect(parseReleaseGenresContent(releaseContent)).toEqual([A, B]);

  const recordingFieldId = recordingGenresFieldId(RECORDING, PKG);
  const recordingContent = RecordingGenresField.serialize({
    id: recordingFieldId,
    name: [false],
    value: [A, B],
  }).toBytes();
  expect(parseRecordingGenresContent(recordingContent)).toEqual([A, B]);
});

test("releaseGenresFieldId and recordingGenresFieldId are deterministic and distinct", () => {
  expect(releaseGenresFieldId(RELEASE, PKG)).toMatch(/^0x[0-9a-f]{64}$/);
  expect(releaseGenresFieldId(RELEASE, PKG)).toBe(releaseGenresFieldId(RELEASE, PKG));
  expect(recordingGenresFieldId(RECORDING, PKG)).toMatch(/^0x[0-9a-f]{64}$/);
  expect(recordingGenresFieldId(RECORDING, PKG)).toBe(recordingGenresFieldId(RECORDING, PKG));
  expect(releaseGenresFieldId(RELEASE, PKG)).not.toBe(recordingGenresFieldId(RELEASE, PKG));
});

test("getReleaseGenres and getRecordingGenres read through Core and default to []", async () => {
  const fieldId = releaseGenresFieldId(RELEASE, PKG);
  const content = ReleaseGenresField.serialize({
    id: fieldId,
    name: [false],
    value: [A, B],
  }).toBytes();
  const client = {
    core: {
      getObject: async (input: { objectId: string }) => {
        expect(input.objectId).toBe(fieldId);
        return { object: { objectId: fieldId, type: "0x2::dynamic_field::Field", version: "1", content } };
      },
    },
  } as unknown as ClientWithCoreApi;
  const result = await Effect.runPromise(
    getReleaseGenres(RELEASE, PKG).pipe(Effect.provide(SuiClient.layer(client))),
  );
  expect(result).toEqual([A, B]);

  const emptyClient = {
    core: {
      getObject: async () => ({ object: { content: undefined } }),
    },
  } as unknown as ClientWithCoreApi;
  const emptyRelease = await Effect.runPromise(
    getReleaseGenres(RELEASE, PKG).pipe(Effect.provide(SuiClient.layer(emptyClient))),
  );
  expect(emptyRelease).toEqual([]);
  const emptyRecording = await Effect.runPromise(
    getRecordingGenres(RECORDING, PKG).pipe(Effect.provide(SuiClient.layer(emptyClient))),
  );
  expect(emptyRecording).toEqual([]);
});
