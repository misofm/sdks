// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Genre classification for both `Release` and `Recording`.
 *
 * On-chain, `release_genre` and `recording_genre` store the identical shape: a
 * bare `vector<ID>` of `genre::Genre` object ids under a dynamic field keyed by
 * an empty `ExtensionKey()`, index 0 the primary, capped at `MAX_GENRES` (6), and
 * non-empty by construction — removing the last entry drops the field, so "the
 * field exists" and "there is a primary" are the same fact. Every id in the list
 * came from `add_genre(self, cap, genre: &Genre)`, which only accepts a real
 * object minted by the shared `genre` vocabulary registry; `remove_genre` takes
 * a bare `ID` since proving membership is not needed to drop a reference.
 *
 * This module spans both `Release` and `Recording` rather than living beside
 * one target object (contrast `release-extensions.ts` / `recording-extensions.ts`,
 * which are split by target). Genre is not a per-target-object axis: the two
 * packages are separately deployed, separately versioned siblings with the same
 * vocabulary and the same shape, and `recording-extensions.ts` must not import
 * genre helpers out of `release-extensions.ts` (or vice versa) just because one
 * happened to be written first.
 *
 * `setReleaseGenres` / `setRecordingGenres` below express the complete desired
 * list: they emit `clear_genres` first, then exactly one `add_genre` per id in
 * array order. `clear_genres` is a no-op when nothing is attached, so this is
 * safe to run against a fresh object, and it is equally safe to re-run against
 * one that already carries genres — the leading `clear_genres` wipes prior
 * state before the adds replay, so the transaction is idempotent and can be
 * composed more than once in the same PTB. Editing clients that want to
 * mutate an existing assignment without a full replace should use the
 * exported single-mutation primitives (`addReleaseGenre`, `removeReleaseGenre`
 * and their `recording` counterparts), or `clearReleaseGenres` /
 * `clearRecordingGenres` to drop the list outright.
 *
 * `getReleaseGenres` / `getRecordingGenres` below return `[]` when the
 * dynamic field is absent, which now exactly mirrors the on-chain `genres()`
 * view — both Move modules removed their standalone emptiness/first-entry
 * accessors, so emptiness is `genres().length === 0` and the primary is
 * `genres()[0]`, computed client-side the same way Move computes them.
 */

import { bcs } from "@mysten/sui/bcs";
import { deriveDynamicFieldID, deriveObjectID, normalizeSuiObjectId } from "@mysten/sui/utils";
import type { Transaction, TransactionObjectArgument } from "@mysten/sui/transactions";
import { Effect, Schema } from "effect";
import { ObjectId, Sui, type ObjectUnavailable, type DecodeError, type TransportError } from "@unconfirmed/sui-effect";
import type { TxThunk } from "./transactions.ts";
import { directAdminCap, invokeWithAdminCap, type AdminCapAuthority, type ObjectInput } from "./vault.ts";
import { PlatformDeployment } from "./deployments.ts";
import type { ReleaseExtensionTarget } from "./release-extensions.ts";
import type { RecordingExtensionTarget } from "./recording-extensions.ts";
import * as genre from "./contracts/genre/genre.ts";
import * as releaseGenre from "./contracts/release_genre/release_genre.ts";
import * as recordingGenre from "./contracts/recording_genre/recording_genre.ts";

// ── Vocabulary helpers ───────────────────────────────────────────────────────

const GENRE_NAME_RE = /^[A-Z]+(?:_[A-Z]+)*$/;

/** Validate the canonical on-chain genre vocabulary spelling. */
export function assertCanonicalGenreName(name: string): void {
  const bytes = new TextEncoder().encode(name).length;
  if (bytes === 0 || bytes > 64 || !GENRE_NAME_RE.test(name)) {
    throw new Error(
      `Genre name must be 1-64 bytes of uppercase A-Z and underscores; got ${JSON.stringify(name)}`,
    );
  }
}

/** Derive the immutable Genre object address for a canonical vocabulary name.
 * `genrePackageId` must be the genre package's defining (original publish)
 * address — the on-chain derivation hashes type names with defining IDs. */
export function deriveGenreAddress(
  genreRegistryId: string,
  genrePackageId: string,
  canonicalName: string,
): string {
  assertCanonicalGenreName(canonicalName);
  return deriveObjectID(
    genreRegistryId,
    `${genrePackageId}::genre::GenreKey`,
    genre.GenreKey.serialize([canonicalName]).toBytes(),
  );
}

/**
 * A vocabulary entry from the shared `genre` registry, identified by its
 * canonical name (e.g. `"HIP_HOP"`). Constructing one needs the deployment's
 * genre registry object id and genre package id — see {@link Genre.derive}.
 */
export class Genre extends Schema.Class<Genre>("@misofm/platform/Genre")({
  id: Schema.String,
  name: Schema.String,
}) {
  /**
   * Derives a `Genre`'s immutable object address from the platform
   * deployment's genre registry + package id. This is a pure derivation (no
   * chain read) but is the pilot for a value object whose construction
   * genuinely needs deployment context, so it reaches that context through
   * the `PlatformDeployment` service rather than an explicit parameter.
   */
  static readonly derive = Effect.fn("Genre.derive")(function* (
    canonicalName: string,
  ): Effect.fn.Return<Genre, never, PlatformDeployment> {
    const deployment = yield* PlatformDeployment;
    const id = deriveGenreAddress(deployment.objects.genreRegistry, deployment.packages.genre, canonicalName);
    return new Genre({ id, name: canonicalName });
  });
}

// ── Shared validation ────────────────────────────────────────────────────────

/** The maximum number of genres `release_genre` / `recording_genre` will accept. */
export const MAX_GENRES = 6;

/**
 * Fail closed before signing rather than let a bad list abort on-chain as
 * `EDuplicateGenre` (40) or `EMaxGenres` (41). Mirrors how `setReleaseKind`
 * validates its input up front and returns a thunk only once it is well-formed.
 */
function validateGenreIds(op: string, genreIds: readonly string[]): string[] {
  if (genreIds.length === 0) {
    throw new Error(`${op}: genreIds must not be empty`);
  }
  if (genreIds.length > MAX_GENRES) {
    throw new Error(`${op}: at most ${MAX_GENRES} genres (got ${genreIds.length})`);
  }
  const seen = new Set<string>();
  for (const id of genreIds) {
    const normalized = normalizeSuiObjectId(id);
    if (seen.has(normalized)) {
      throw new Error(`${op}: duplicate genre id ${id}`);
    }
    seen.add(normalized);
  }
  return [...genreIds];
}

// ── Release setters ──────────────────────────────────────────────────────────

function releaseAuthorityOf(p: ReleaseExtensionTarget): AdminCapAuthority {
  if (p.authority !== undefined) return p.authority;
  if (p.releaseAdminCapId !== undefined) return directAdminCap(p.releaseAdminCapId);
  throw new Error("release authority is required");
}

function object(tx: Transaction, value: ObjectInput): TransactionObjectArgument {
  return typeof value === "string" ? tx.object(value) : value;
}

export type SetReleaseGenresParams = ReleaseExtensionTarget & {
  /** Ordered `genre::Genre` object ids; index 0 becomes the primary. 1-6 entries, no duplicates. */
  genreIds: readonly string[];
  releaseGenrePackageId: string;
};

/**
 * Attach the complete, ordered list of genres to a Release. Emits
 * `release_genre::clear_genres` first, then exactly one
 * `release_genre::add_genre` per id in array order. `clear_genres` is a no-op
 * when nothing is attached, so this is safe to run against a fresh release
 * and safe to re-run against one that already has genres assigned.
 */
export function setReleaseGenres(p: SetReleaseGenresParams): TxThunk {
  const genreIds = validateGenreIds("setReleaseGenres", p.genreIds);
  return (tx) => {
    const authority = releaseAuthorityOf(p);
    invokeWithAdminCap(tx, authority, {
      target: `${p.releaseGenrePackageId}::release_genre::clear_genres`,
      arguments: [object(tx, p.releaseId)],
      adminCapIndex: 1,
    });
    for (const genreId of genreIds) {
      invokeWithAdminCap(tx, authority, {
        target: `${p.releaseGenrePackageId}::release_genre::add_genre`,
        arguments: [object(tx, p.releaseId), tx.object(genreId)],
        adminCapIndex: 1,
      });
    }
  };
}

export type ClearReleaseGenresParams = ReleaseExtensionTarget & {
  releaseGenrePackageId: string;
};

/** Remove a Release's entire genre list. A no-op on-chain if nothing is attached. */
export function clearReleaseGenres(p: ClearReleaseGenresParams): TxThunk {
  return (tx) => {
    invokeWithAdminCap(tx, releaseAuthorityOf(p), {
      target: `${p.releaseGenrePackageId}::release_genre::clear_genres`,
      arguments: [object(tx, p.releaseId)],
      adminCapIndex: 1,
    });
  };
}

export type ReleaseGenreMutationParams = ReleaseExtensionTarget & {
  genreId: string;
  releaseGenrePackageId: string;
};

/** Append one genre to a Release's list. */
export function addReleaseGenre(p: ReleaseGenreMutationParams): TxThunk {
  return (tx) => {
    invokeWithAdminCap(tx, releaseAuthorityOf(p), {
      target: `${p.releaseGenrePackageId}::release_genre::add_genre`,
      arguments: [object(tx, p.releaseId), tx.object(p.genreId)],
      adminCapIndex: 1,
    });
  };
}

/** Remove one genre from a Release by id. */
export function removeReleaseGenre(p: ReleaseGenreMutationParams): TxThunk {
  return (tx) => {
    invokeWithAdminCap(tx, releaseAuthorityOf(p), {
      target: `${p.releaseGenrePackageId}::release_genre::remove_genre`,
      arguments: [object(tx, p.releaseId), tx.pure.id(p.genreId)],
      adminCapIndex: 1,
    });
  };
}

// ── Recording setters ────────────────────────────────────────────────────────

export interface SetRecordingGenresParams extends RecordingExtensionTarget {
  readonly recordingGenrePackageId: string;
  /** Ordered `genre::Genre` object ids; index 0 becomes the primary. 1-6 entries, no duplicates. */
  readonly genreIds: readonly string[];
}

/**
 * Attach the complete, ordered list of genres to a Recording. Emits
 * `recording_genre::clear_genres` first, then exactly one
 * `recording_genre::add_genre` per id in array order. `clear_genres` is a
 * no-op when nothing is attached, so this is safe to run against a fresh
 * recording and safe to re-run against one that already has genres assigned.
 */
export function setRecordingGenres(p: SetRecordingGenresParams): TxThunk {
  const genreIds = validateGenreIds("setRecordingGenres", p.genreIds);
  return (tx) => {
    invokeWithAdminCap(tx, p.authority, {
      target: `${p.recordingGenrePackageId}::recording_genre::clear_genres`,
      typeArguments: [p.recordingShareType, p.compositionShareType],
      arguments: [object(tx, p.recordingId)],
      adminCapIndex: 1,
    });
    for (const genreId of genreIds) {
      invokeWithAdminCap(tx, p.authority, {
        target: `${p.recordingGenrePackageId}::recording_genre::add_genre`,
        typeArguments: [p.recordingShareType, p.compositionShareType],
        arguments: [object(tx, p.recordingId), tx.object(genreId)],
        adminCapIndex: 1,
      });
    }
  };
}

export interface ClearRecordingGenresParams extends RecordingExtensionTarget {
  readonly recordingGenrePackageId: string;
}

/** Remove a Recording's entire genre list. A no-op on-chain if nothing is attached. */
export function clearRecordingGenres(p: ClearRecordingGenresParams): TxThunk {
  return (tx) => {
    invokeWithAdminCap(tx, p.authority, {
      target: `${p.recordingGenrePackageId}::recording_genre::clear_genres`,
      typeArguments: [p.recordingShareType, p.compositionShareType],
      arguments: [object(tx, p.recordingId)],
      adminCapIndex: 1,
    });
  };
}

export interface RecordingGenreMutationParams extends RecordingExtensionTarget {
  readonly recordingGenrePackageId: string;
  readonly genreId: string;
}

/** Append one genre to a Recording's list. */
export function addRecordingGenre(p: RecordingGenreMutationParams): TxThunk {
  return (tx) => {
    invokeWithAdminCap(tx, p.authority, {
      target: `${p.recordingGenrePackageId}::recording_genre::add_genre`,
      typeArguments: [p.recordingShareType, p.compositionShareType],
      arguments: [object(tx, p.recordingId), tx.object(p.genreId)],
      adminCapIndex: 1,
    });
  };
}

/** Remove one genre from a Recording by id. */
export function removeRecordingGenre(p: RecordingGenreMutationParams): TxThunk {
  return (tx) => {
    invokeWithAdminCap(tx, p.authority, {
      target: `${p.recordingGenrePackageId}::recording_genre::remove_genre`,
      typeArguments: [p.recordingShareType, p.compositionShareType],
      arguments: [object(tx, p.recordingId), tx.pure.id(p.genreId)],
      adminCapIndex: 1,
    });
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

// Both packages store the same shape: a dynamic field on the target's UID under
// an empty `ExtensionKey()` (Move's implicit `dummy_field: bool` → one `false`
// byte), value `vector<ID>`, ordered with the primary first.
const ReleaseGenresField = bcs.struct("Field", {
  id: bcs.Address,
  name: releaseGenre.ExtensionKey,
  value: bcs.vector(bcs.Address),
});
const RELEASE_GENRES_KEY_BYTES = releaseGenre.ExtensionKey.serialize([false]).toBytes();

const RecordingGenresField = bcs.struct("Field", {
  id: bcs.Address,
  name: recordingGenre.ExtensionKey,
  value: bcs.vector(bcs.Address),
});
const RECORDING_GENRES_KEY_BYTES = recordingGenre.ExtensionKey.serialize([false]).toBytes();

/** Parse a `release_genre` dynamic field's content into its ordered genre ids. */
export function parseReleaseGenresContent(content: Uint8Array): string[] {
  return ReleaseGenresField.parse(content).value;
}

/** Parse a `recording_genre` dynamic field's content into its ordered genre ids. */
export function parseRecordingGenresContent(content: Uint8Array): string[] {
  return RecordingGenresField.parse(content).value;
}

/** Deterministic dynamic-field id for a Release's genre list. */
export function releaseGenresFieldId(
  releaseId: string,
  releaseGenrePackageId: string,
): string {
  return deriveDynamicFieldID(
    releaseId,
    `${releaseGenrePackageId}::release_genre::ExtensionKey`,
    RELEASE_GENRES_KEY_BYTES,
  );
}

/** Deterministic dynamic-field id for a Recording's genre list. */
export function recordingGenresFieldId(
  recordingId: string,
  recordingGenrePackageId: string,
): string {
  return deriveDynamicFieldID(
    recordingId,
    `${recordingGenrePackageId}::recording_genre::ExtensionKey`,
    RECORDING_GENRES_KEY_BYTES,
  );
}

/**
 * Read a Release's genre ids in order (primary first), or `[]` when no genres
 * are attached. The primary is `list[0]`; there is no separate primary reader
 * because the Move `genres` view already returns `[]` for the absent case.
 */
export const getReleaseGenres = Effect.fn("getReleaseGenres")(function* (
  releaseId: string,
  releaseGenrePackageId: string,
): Effect.fn.Return<string[], ObjectUnavailable | DecodeError | TransportError, Sui> {
  const sui = yield* Sui;
  const found = yield* sui.getObjectOption(ObjectId.make(releaseGenresFieldId(releaseId, releaseGenrePackageId)));
  return found._tag === "None" ? [] : parseReleaseGenresContent(found.value.content);
});

/**
 * Read a Recording's genre ids in order (primary first), or `[]` when no
 * genres are attached. The primary is `list[0]`; there is no separate primary
 * reader because the Move `genres` view already returns `[]` for the absent
 * case.
 */
export const getRecordingGenres = Effect.fn("getRecordingGenres")(function* (
  recordingId: string,
  recordingGenrePackageId: string,
): Effect.fn.Return<string[], ObjectUnavailable | DecodeError | TransportError, Sui> {
  const sui = yield* Sui;
  const found = yield* sui.getObjectOption(ObjectId.make(recordingGenresFieldId(recordingId, recordingGenrePackageId)));
  return found._tag === "None" ? [] : parseRecordingGenresContent(found.value.content);
});
