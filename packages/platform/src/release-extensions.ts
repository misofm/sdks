// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// First-party metadata attached to a protocol Release. The JSON/CLI release
// intent aggregates these concerns, but every value is written by its own
// independently deployed extension package.

import { bcs } from "@mysten/sui/bcs";
import { deriveDynamicFieldID } from "@mysten/sui/utils";
import type {
  Transaction,
  TransactionArgument,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";
import { Effect, Option } from "effect";
import { ObjectId, Sui, type DecodeError, type ObjectUnavailable, type TransportError } from "@unconfirmed/sui-effect";
import type { TxThunk } from "./transactions.ts";
import * as releaseDescription from "./contracts/release_description/release_description.ts";
import * as releaseDspLink from "./contracts/release_dsp_link/release_dsp_link.ts";
import * as releaseKind from "./contracts/release_kind/release_kind.ts";
import { asU64, directAdminCap, invokeWithAdminCap, type AdminCapAuthority, type ObjectInput, type U64Input } from "./vault.ts";

function object(tx: Transaction, value: ObjectInput): TransactionObjectArgument {
  return typeof value === "string" ? tx.object(value) : value;
}

type ReleaseAuthorityInput =
  | { readonly authority: AdminCapAuthority; readonly releaseAdminCapId?: never }
  | { readonly authority?: never; readonly releaseAdminCapId: string };
interface ReleaseExtensionTargetBase {
  releaseId: ObjectInput;
}
export type ReleaseExtensionTarget = ReleaseExtensionTargetBase & ReleaseAuthorityInput;
function authority(p: ReleaseExtensionTarget): AdminCapAuthority {
  if (p.authority !== undefined) return p.authority;
  if (p.releaseAdminCapId !== undefined) return directAdminCap(p.releaseAdminCapId);
  throw new Error("release authority is required");
}

export type SetReleaseKindParams = ReleaseExtensionTarget & {
  kind: string;
  releaseKindPackageId: string;
};

/** Attach the release's self-declared kind (for example "EP" or "Mixtape"). */
export function setReleaseKind(p: SetReleaseKindParams): TxThunk {
  const bytes = new TextEncoder().encode(p.kind).length;
  if (bytes === 0) throw new Error("setReleaseKind: kind must not be empty");
  if (bytes > 32) {
    throw new Error(
      `setReleaseKind: kind must be at most 32 UTF-8 bytes (got ${bytes})`,
    );
  }
  return (tx) => {
    invokeWithAdminCap(tx, authority(p), {
      target: `${p.releaseKindPackageId}::release_kind::set_kind`,
      arguments: [object(tx, p.releaseId), tx.pure.string(p.kind)],
      adminCapIndex: 1,
    });
  };
}

const ReleaseKindField = bcs.struct("Field", {
  id: bcs.Address,
  name: releaseKind.ExtensionKey,
  value: bcs.string(),
});
const RELEASE_KIND_KEY_BYTES = releaseKind.ExtensionKey.serialize([
  false,
]).toBytes();

/** Deterministic dynamic-field id for a Release's optional self-declared kind. */
export function releaseKindFieldId(
  releaseId: string,
  releaseKindPackageId: string,
): string {
  return deriveDynamicFieldID(
    releaseId,
    `${releaseKindPackageId}::release_kind::ExtensionKey`,
    RELEASE_KIND_KEY_BYTES,
  );
}

/** Parse the dynamic field storing `Option<String>` as its present string. */
export function parseReleaseKindContent(content: Uint8Array): string {
  return ReleaseKindField.parse(content).value;
}

/** Read a Release's self-declared kind, or `null` when the extension is absent. */
export const getReleaseKind = Effect.fn("getReleaseKind")(function* (
  releaseId: string,
  releaseKindPackageId: string,
): Effect.fn.Return<string | null, DecodeError | ObjectUnavailable | TransportError, Sui> {
  const sui = yield* Sui;
  const found = yield* sui.getObjectOption(ObjectId.make(releaseKindFieldId(releaseId, releaseKindPackageId)));
  return Option.isNone(found) ? null : parseReleaseKindContent(found.value.content);
});

export type SetReleaseDescriptionParams = ReleaseExtensionTarget & {
  description: string;
  releaseDescriptionPackageId: string;
};

/** Attach the release's editorial description. */
export function setReleaseDescription(p: SetReleaseDescriptionParams): TxThunk {
  const bytes = new TextEncoder().encode(p.description).length;
  if (bytes === 0) {
    throw new Error("setReleaseDescription: description must not be empty");
  }
  if (bytes > 8192) {
    throw new Error(
      `setReleaseDescription: description must be at most 8192 UTF-8 bytes (got ${bytes})`,
    );
  }
  return (tx) => {
    invokeWithAdminCap(tx, authority(p), {
      target: `${p.releaseDescriptionPackageId}::release_description::set_description`,
      arguments: [object(tx, p.releaseId), tx.pure.string(p.description)],
      adminCapIndex: 1,
    });
  };
}

export type DspLink =
  | { platform: "Spotify"; id: string }
  | {
      platform: "AppleMusic";
      storefront: string;
      albumId: string;
      trackId?: string;
    }
  | { platform: "AmazonMusic"; albumId: string; trackId?: string }
  | { platform: "Bandcamp"; subdomain: string; slug: string }
  | { platform: "Deezer"; id: string }
  | { platform: "SoundCloud"; user: string; slug: string }
  | { platform: "Tidal"; id: string }
  | { platform: "YouTubeMusic"; id: string };

function buildDspLink(
  tx: Transaction,
  packageId: string,
  link: DspLink,
): TransactionArgument {
  switch (link.platform) {
    case "Spotify":
      return tx.add(
        releaseDspLink.newSpotify({ package: packageId, arguments: [link.id] }),
      );
    case "AppleMusic":
      return tx.add(
        link.trackId === undefined
          ? releaseDspLink.newAppleMusicAlbum({
              package: packageId,
              arguments: [link.storefront, link.albumId],
            })
          : releaseDspLink.newAppleMusicTrack({
              package: packageId,
              arguments: [link.storefront, link.albumId, link.trackId],
            }),
      );
    case "AmazonMusic":
      return tx.add(
        link.trackId === undefined
          ? releaseDspLink.newAmazonMusicAlbum({
              package: packageId,
              arguments: [link.albumId],
            })
          : releaseDspLink.newAmazonMusicTrack({
              package: packageId,
              arguments: [link.albumId, link.trackId],
            }),
      );
    case "Bandcamp":
      return tx.add(
        releaseDspLink.newBandcamp({
          package: packageId,
          arguments: [link.subdomain, link.slug],
        }),
      );
    case "Deezer":
      return tx.add(
        releaseDspLink.newDeezer({ package: packageId, arguments: [link.id] }),
      );
    case "SoundCloud":
      return tx.add(
        releaseDspLink.newSoundcloud({
          package: packageId,
          arguments: [link.user, link.slug],
        }),
      );
    case "Tidal":
      return tx.add(
        releaseDspLink.newTidal({ package: packageId, arguments: [link.id] }),
      );
    case "YouTubeMusic":
      return tx.add(
        releaseDspLink.newYoutubeMusic({
          package: packageId,
          arguments: [link.id],
        }),
      );
  }
}

export interface TrackDspLink {
  trackIndex: U64Input;
  link: DspLink;
}

export type SetReleaseDspLinksParams = ReleaseExtensionTarget & {
  releaseLinks?: readonly DspLink[];
  trackLinks?: readonly TrackDspLink[];
  releaseDspLinkPackageId: string;
};

/** Attach release-level and per-track DSP links. */
export function setReleaseDspLinks(p: SetReleaseDspLinksParams): TxThunk {
  return (tx) => {
    for (const link of p.releaseLinks ?? []) {
      const value = buildDspLink(tx, p.releaseDspLinkPackageId, link);
      invokeWithAdminCap(tx, authority(p), {
        target: `${p.releaseDspLinkPackageId}::release_dsp_link::set_release_link`,
        arguments: [object(tx, p.releaseId), value],
        adminCapIndex: 1,
      });
    }
    for (const item of p.trackLinks ?? []) {
      const value = buildDspLink(tx, p.releaseDspLinkPackageId, item.link);
      invokeWithAdminCap(tx, authority(p), {
        target: `${p.releaseDspLinkPackageId}::release_dsp_link::set_track_link`,
        arguments: [object(tx, p.releaseId), tx.pure.u64(asU64("trackIndex", item.trackIndex)), value],
        adminCapIndex: 1,
      });
    }
  };
}
