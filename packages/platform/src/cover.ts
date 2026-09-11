// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Release cover art. A cover is a still image (optionally an animation) stored as
// a Walrus blob and referenced on-chain via `ori::data::WalrusBlob`. We build the
// plaintext ref (`ori::data::new_blob`, a raw call — ori is an external dep), wrap
// it in a `cover_art::CoverArt`, and attach it to the Release with
// `release_cover_art::set_cover` (gated by the ReleaseAdminCap).
//
// Blob ids are passed as `u256` (decimal string or bigint) — the CLI converts the
// base64url Walrus blob id to u256 before calling.
//
// The `Release` being covered is a protocol object; the cover is a platform
// opinion attached to it through the release's cap-gated `uid_mut` hook, which is
// why this module ships from `@misofm/platform` rather than the protocol SDK.

import { bcs } from "@mysten/sui/bcs";
import { deriveDynamicFieldID } from "@mysten/sui/utils";
import type { Transaction, TransactionObjectArgument } from "@mysten/sui/transactions";
import { Effect, Result } from "effect";
import { ObjectId, Sui, type TransportError } from "sui-effect";
import type { TxThunk } from "./transactions.ts";
import { asU64, directAdminCap, invokeWithAdminCap, type AdminCapAuthority, type ObjectInput, type U64Input } from "./vault.ts";
import { OPTION_NONE, OPTION_SOME, unencryptedWalrusBlob } from "./internal.ts";
import * as coverArt from "./contracts/cover_art/cover_art.ts";
import * as releaseCoverArt from "./contracts/release_cover_art/release_cover_art.ts";

type ReleaseAuthorityInput =
  | { readonly authority: AdminCapAuthority; readonly releaseAdminCapId?: never }
  | { readonly authority?: never; readonly releaseAdminCapId: string };
function releaseAuthorityOf(input: ReleaseAuthorityInput): AdminCapAuthority {
  if (input.authority !== undefined) return input.authority;
  if (input.releaseAdminCapId !== undefined) return directAdminCap(input.releaseAdminCapId);
  throw new Error("release authority is required");
}

interface SetReleaseCoverParamsBase {
  /** The `Release` object to attach the cover to. */
  releaseId: ObjectInput;
  /** Walrus blob id of the still cover image, as `u256` (decimal string or bigint). */
  stillBlobId: bigint | string;
  /** Optional animated-cover Walrus blob id (`u256`); omit for a still-only cover. */
  animatedBlobId?: bigint | string | null;
  /** `cover_art` package — home of the `CoverArt` value type (`cover_art::new`). */
  coverArtPackageId: string;
  /** `release_cover_art` package — home of the `set_cover` extension entry point. */
  releaseCoverArtPackageId: string;
  /** `ori` package (home of `data::new_blob` / the `WalrusBlob` type). */
  oriPackageId: string;
}

function object(tx: Transaction, value: ObjectInput): TransactionObjectArgument {
  return typeof value === "string" ? tx.object(value) : value;
}
export type SetReleaseCoverParams = SetReleaseCoverParamsBase & ReleaseAuthorityInput;

export type SetReleaseTrackCoverParams = SetReleaseCoverParams & {
  /** Zero-based index in the release's flattened tracklist. */
  trackIndex: U64Input;
};

function buildCover(tx: Parameters<TxThunk>[0], p: SetReleaseCoverParams) {
  const walrusType = `${p.oriPackageId}::data::WalrusBlob`;
  const blob = (id: bigint | string) => unencryptedWalrusBlob(tx, p.oriPackageId, id);

  const still = blob(p.stillBlobId);
  const animated =
    p.animatedBlobId == null
      ? tx.moveCall({ target: OPTION_NONE, typeArguments: [walrusType] })
      : tx.moveCall({
          target: OPTION_SOME,
          typeArguments: [walrusType],
          arguments: [blob(p.animatedBlobId)],
        });

  return tx.add(
    coverArt._new({
      package: p.coverArtPackageId,
      arguments: [still, animated],
    }),
  );
}

/** Sets (or replaces) a release's album-level cover from Walrus blob ids. */
export function setReleaseCover(p: SetReleaseCoverParams): TxThunk {
  return (tx) => {
    const cover = buildCover(tx, p);
    invokeWithAdminCap(tx, releaseAuthorityOf(p), {
      target: `${p.releaseCoverArtPackageId}::release_cover_art::set_cover`,
      arguments: [object(tx, p.releaseId), cover],
      adminCapIndex: 1,
    });
  };
}

/** Sets (or replaces) one track's cover from Walrus blob ids. */
export function setReleaseTrackCover(p: SetReleaseTrackCoverParams): TxThunk {
  return (tx) => {
    const cover = buildCover(tx, p);
    invokeWithAdminCap(tx, releaseAuthorityOf(p), {
      target: `${p.releaseCoverArtPackageId}::release_cover_art::set_track_cover`,
      arguments: [object(tx, p.releaseId), tx.pure.u64(asU64("trackIndex", p.trackIndex)), cover],
      adminCapIndex: 1,
    });
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * A normalized reference to a cover image's Walrus data. Blob ids are returned as
 * `u256` decimal strings (the on-chain form); callers convert to a base64url
 * aggregator URL with `@unconfirmed/ori` (`u256ToB64Url` / `walrusBlobUrl`).
 *
 * The current `cover_art` generation stores standalone `ori::data::WalrusBlob`
 * values only, so every cover image is a `blob` reference.
 */
export type CoverImageRef = { kind: "blob"; blobId: string };

/** A release's album-level cover: a still image and an optional animation. */
export interface ReleaseCoverView {
  still: CoverImageRef;
  animated: CoverImageRef | null;
}

// The cover is a dynamic field on the release UID under an empty `ExtensionKey()`
// (Move's implicit `dummy_field: bool` → one `false` byte). The stored value is a
// `Field { id, name: ExtensionKey, value: ReleaseCoverArt }`.
const CoverArtField = bcs.struct("Field", {
  id: bcs.Address,
  name: releaseCoverArt.ExtensionKey,
  value: releaseCoverArt.ReleaseCoverArt,
});
const COVER_ART_KEY_BYTES = releaseCoverArt.ExtensionKey.serialize([
  false,
]).toBytes();

/** A parsed `ori::data::WalrusBlob` value. */
interface ParsedWalrusBlob {
  blob_id: string | number | bigint;
}

function toCoverImageRef(blob: ParsedWalrusBlob): CoverImageRef {
  return { kind: "blob", blobId: String(blob.blob_id) };
}

/**
 * Reads a release's album-level cover (the `release_cover_art` extension), or
 * `null` if no cover is attached. Derives the `ExtensionKey` dynamic field on the
 * release, parses the `ReleaseCoverArt`, and returns the still (+ optional
 * animation) as normalized Walrus refs for release displays.
 */
export const getReleaseCover = Effect.fn("getReleaseCover")(function* (
  releaseId: string,
  releaseCoverArtPackageId: string,
): Effect.fn.Return<ReleaseCoverView | null, TransportError, Sui> {
  const found = yield* getReleaseCoversByIds([releaseId], releaseCoverArtPackageId);
  return found[releaseId] ?? null;
});

export function parseReleaseCoverContent(
  content: Uint8Array,
): ReleaseCoverView | null {
  const cover = CoverArtField.parse(content).value.cover as {
    still: ParsedWalrusBlob;
    animated: ParsedWalrusBlob | null;
  } | null;
  if (!cover) return null;

  return {
    still: toCoverImageRef(cover.still),
    animated: cover.animated ? toCoverImageRef(cover.animated) : null,
  };
}

/** Deterministic dynamic-field id for the configured release-cover package. */
export function releaseCoverFieldId(
  releaseId: string,
  releaseCoverArtPackageId: string,
): string {
  return deriveDynamicFieldID(
    releaseId,
    `${releaseCoverArtPackageId}::release_cover_art::ExtensionKey`,
    COVER_ART_KEY_BYTES,
  );
}

/**
 * Read covers for many releases from the configured package in one Core request.
 */
export const getReleaseCoversByIds = Effect.fn("getReleaseCoversByIds")(function* (
  releaseIdsInput: readonly string[],
  releaseCoverArtPackageId: string,
): Effect.fn.Return<Partial<Record<string, ReleaseCoverView>>, TransportError, Sui> {
  const releaseIds = [...new Set(releaseIdsInput)];
  const targets = releaseIds.map((releaseId) => ({
    releaseId,
    fieldId: releaseCoverFieldId(releaseId, releaseCoverArtPackageId),
  }));
  if (targets.length === 0) return {};

  const sui = yield* Sui;
  const results = yield* sui.getObjects(targets.map((target) => ObjectId.make(target.fieldId)));
  const out: Partial<Record<string, ReleaseCoverView>> = {};
  results.forEach((result, index) => {
    if (!Result.isSuccess(result)) return;
    const cover = parseReleaseCoverContent(result.success.content);
    if (cover) out[targets[index]!.releaseId] = cover;
  });
  return out;
});
