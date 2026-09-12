// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The `party_media` extension: a party's imagery, stored on-chain as a single
// Walrus *quilt* id. Individual images are quilt patches addressed by identifier
// ("avatar", "header", …) — those roles are a client convention, derived here
// off-chain, never stored on-chain. The write builder takes the quilt's base64url
// blob id (what `walrus store-quilt` prints) and converts it to the on-chain
// u256; the read helpers build aggregator URLs per identifier.

import { b64UrlToU256 } from "../internal.ts";
import * as mediaMod from "../../contracts/party_media/party_media.ts";
import type { Recipe } from "@unconfirmed/sui-effect";
import type { Media } from "../types.ts";

/**
 * Quilt patch identifiers party media uses, in role order. Uploaders store images
 * under these identifiers; readers fetch by them. This is the whole "meaning" the
 * chain defers to the client.
 */
export const MEDIA_IDENTIFIERS = { avatar: "avatar", header: "header" } as const;
export type MediaIdentifier = (typeof MEDIA_IDENTIFIERS)[keyof typeof MEDIA_IDENTIFIERS];

export interface SetMediaParams {
  partyId: string;
  capId: string;
  /** Walrus quilt blob id (base64url), e.g. from `walrus store-quilt`. */
  quiltId: string;
  partyMediaPackageId: string;
}

/** Sets (or replaces) the party's media quilt. */
export function setMedia(params: SetMediaParams): Recipe {
  return (tx) => {
    tx.add(
      mediaMod.setMedia({
        package: params.partyMediaPackageId,
        arguments: [params.partyId, params.capId, BigInt(b64UrlToU256(params.quiltId))],
      }),
    );
  };
}

export interface ClearMediaParams {
  partyId: string;
  capId: string;
  partyMediaPackageId: string;
}

/** Removes the party's media entirely. No-op on-chain if none is set. */
export function clearMedia(params: ClearMediaParams): Recipe {
  return (tx) => {
    tx.add(mediaMod.clearMedia({ package: params.partyMediaPackageId, arguments: [params.partyId, params.capId] }));
  };
}

/** Aggregator URL for one image in a party's quilt, addressed by identifier. */
export function mediaImageUrl(aggregatorUrl: string, quiltId: string, identifier: string): string {
  return `${aggregatorUrl.replace(/\/$/, "")}/v1/blobs/by-quilt-id/${quiltId}/${identifier}`;
}

/** The avatar + header image URLs for a party's media, or null if unset. */
export function mediaUrls(
  aggregatorUrl: string,
  media: Media | null,
): { avatar: string; header: string } | null {
  if (!media) return null;
  return {
    avatar: mediaImageUrl(aggregatorUrl, media.quiltId, MEDIA_IDENTIFIERS.avatar),
    header: mediaImageUrl(aggregatorUrl, media.quiltId, MEDIA_IDENTIFIERS.header),
  };
}
