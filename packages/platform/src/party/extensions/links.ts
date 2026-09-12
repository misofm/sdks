// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The platform-link facade: attaches one independent `PlatformLink<Data>` per
// platform to a party via `party_platform_link`. The payload `Data` types live in
// their own packages (`party_social`, `party_music`, `party_pro_link`); this file
// drives all ~27 platforms from a single table (`PLATFORMS`) rather than 27×
// copy-paste. Each setter builds the link via the platform's constructor move-call
// (returning a `PlatformLink<…Data>`), then calls `set_link` with the matching
// `Data` type argument; clearers call `clear_link` with the same type argument.
// Only the native identifier is stored on-chain; the public URL is rebuilt from it.

import * as platformLinkMod from "../../contracts/party_platform_link/party_platform_link.ts";
import type { Recipe } from "@unconfirmed/sui-effect";
import { PlatformLink } from "../types.ts";
import type { PlatformKey } from "../types.ts";

/** Which payload package a platform's `Data` type + constructor live in. */
type PayloadPkgKind = "social" | "music" | "pro";

/** Everything needed to build, store, and rebuild one platform's link. */
export interface PlatformSpec {
  key: PlatformKey;
  /** Payload package the `Data` type + constructor live in. */
  pkgKind: PayloadPkgKind;
  /** Move module holding the constructor + `Data` type. */
  module: "party_social" | "party_music" | "party_pro_link";
  /** Constructor function (snake_case) — takes a single `String`, returns `PlatformLink<Data>`. */
  ctor: string;
  /** The `Data` type name (e.g. `InstagramData`). */
  dataType: string;
  /** Rebuilds the public URL from the stored native identifier. */
  url: (value: string) => string;
}

/**
 * Every platform this SDK can link, keyed by `PlatformKey`. The single source of
 * truth: setters, clearers, and the read-side URL/type mapping all derive from it.
 */
export const PLATFORMS: Record<PlatformKey, PlatformSpec> = {
  // === Social (party_social) ===
  x: { key: "x", pkgKind: "social", module: "party_social", ctor: "x", dataType: "XData", url: (v) => `https://x.com/${v}` },
  instagram: { key: "instagram", pkgKind: "social", module: "party_social", ctor: "instagram", dataType: "InstagramData", url: (v) => `https://instagram.com/${v}` },
  threads: { key: "threads", pkgKind: "social", module: "party_social", ctor: "threads", dataType: "ThreadsData", url: (v) => `https://www.threads.net/@${v}` },
  tiktok: { key: "tiktok", pkgKind: "social", module: "party_social", ctor: "tiktok", dataType: "TikTokData", url: (v) => `https://www.tiktok.com/@${v}` },
  youtube: { key: "youtube", pkgKind: "social", module: "party_social", ctor: "youtube", dataType: "YouTubeData", url: (v) => `https://youtube.com/@${v}` },
  discord: { key: "discord", pkgKind: "social", module: "party_social", ctor: "discord", dataType: "DiscordData", url: (v) => `https://discord.gg/${v}` },
  telegram: { key: "telegram", pkgKind: "social", module: "party_social", ctor: "telegram", dataType: "TelegramData", url: (v) => `https://t.me/${v}` },
  reddit: { key: "reddit", pkgKind: "social", module: "party_social", ctor: "reddit", dataType: "RedditData", url: (v) => `https://reddit.com/user/${v}` },
  twitch: { key: "twitch", pkgKind: "social", module: "party_social", ctor: "twitch", dataType: "TwitchData", url: (v) => `https://twitch.tv/${v}` },
  facebook: { key: "facebook", pkgKind: "social", module: "party_social", ctor: "facebook", dataType: "FacebookData", url: (v) => `https://facebook.com/${v}` },
  // === Music (party_music) ===
  spotify: { key: "spotify", pkgKind: "music", module: "party_music", ctor: "spotify", dataType: "SpotifyData", url: (v) => `https://open.spotify.com/artist/${v}` },
  bandcamp: { key: "bandcamp", pkgKind: "music", module: "party_music", ctor: "bandcamp", dataType: "BandcampData", url: (v) => `https://${v}.bandcamp.com` },
  soundcloud: { key: "soundcloud", pkgKind: "music", module: "party_music", ctor: "soundcloud", dataType: "SoundCloudData", url: (v) => `https://soundcloud.com/${v}` },
  appleMusic: { key: "appleMusic", pkgKind: "music", module: "party_music", ctor: "apple_music", dataType: "AppleMusicData", url: (v) => `https://music.apple.com/artist/${v}` },
  deezer: { key: "deezer", pkgKind: "music", module: "party_music", ctor: "deezer", dataType: "DeezerData", url: (v) => `https://www.deezer.com/artist/${v}` },
  tidal: { key: "tidal", pkgKind: "music", module: "party_music", ctor: "tidal", dataType: "TidalData", url: (v) => `https://tidal.com/artist/${v}` },
  amazonMusic: { key: "amazonMusic", pkgKind: "music", module: "party_music", ctor: "amazon_music", dataType: "AmazonMusicData", url: (v) => `https://music.amazon.com/artists/${v}` },
  audiomack: { key: "audiomack", pkgKind: "music", module: "party_music", ctor: "audiomack", dataType: "AudiomackData", url: (v) => `https://audiomack.com/${v}` },
  // === Professional / industry (party_pro_link). URL-based payloads store a full URL. ===
  website: { key: "website", pkgKind: "pro", module: "party_pro_link", ctor: "website", dataType: "WebsiteData", url: (v) => v },
  bookingPage: { key: "bookingPage", pkgKind: "pro", module: "party_pro_link", ctor: "booking_page", dataType: "BookingPageData", url: (v) => v },
  managementPage: { key: "managementPage", pkgKind: "pro", module: "party_pro_link", ctor: "management_page", dataType: "ManagementPageData", url: (v) => v },
  publisherPage: { key: "publisherPage", pkgKind: "pro", module: "party_pro_link", ctor: "publisher_page", dataType: "PublisherPageData", url: (v) => v },
  labelPage: { key: "labelPage", pkgKind: "pro", module: "party_pro_link", ctor: "label_page", dataType: "LabelPageData", url: (v) => v },
  epk: { key: "epk", pkgKind: "pro", module: "party_pro_link", ctor: "epk", dataType: "EpkData", url: (v) => v },
  patreon: { key: "patreon", pkgKind: "pro", module: "party_pro_link", ctor: "patreon", dataType: "PatreonData", url: (v) => `https://patreon.com/${v}` },
  substack: { key: "substack", pkgKind: "pro", module: "party_pro_link", ctor: "substack", dataType: "SubstackData", url: (v) => `https://${v}.substack.com` },
  kofi: { key: "kofi", pkgKind: "pro", module: "party_pro_link", ctor: "kofi", dataType: "KofiData", url: (v) => `https://ko-fi.com/${v}` },
};

/** All platform keys, in table order. */
export const PLATFORM_KEYS = Object.keys(PLATFORMS) as PlatformKey[];

/** The package ids the platform-link facade binds (the facade + the three payload packages). */
export interface LinkPackageIds {
  partyPlatformLinkPackageId: string;
  partySocialPackageId: string;
  partyMusicPackageId: string;
  partyProLinkPackageId: string;
}

function payloadPackageId(spec: PlatformSpec, ids: LinkPackageIds): string {
  switch (spec.pkgKind) {
    case "social":
      return ids.partySocialPackageId;
    case "music":
      return ids.partyMusicPackageId;
    case "pro":
      return ids.partyProLinkPackageId;
  }
}

/** The fully-qualified Move `Data` type for a platform (e.g. `0x…::party_social::InstagramData`). */
function dataTypeArg(spec: PlatformSpec, ids: LinkPackageIds): string {
  return `${payloadPackageId(spec, ids)}::${spec.module}::${spec.dataType}`;
}

export interface SetLinkParams extends LinkPackageIds {
  partyId: string;
  capId: string;
  /** The platform-native identifier to store (handle / id / subdomain / full URL). */
  value: string;
}

/** Sets (or replaces) a platform's link on the party. */
export function setLink(platform: PlatformKey, params: SetLinkParams): Recipe {
  return (tx) => {
    const spec = PLATFORMS[platform];
    const pkg = payloadPackageId(spec, params);
    const link = tx.moveCall({
      target: `${pkg}::${spec.module}::${spec.ctor}`,
      arguments: [tx.pure.string(params.value)],
    });
    tx.add(
      platformLinkMod.setLink({
        package: params.partyPlatformLinkPackageId,
        typeArguments: [dataTypeArg(spec, params)],
        arguments: [params.partyId, params.capId, link],
      }),
    );
  };
}

export interface ClearLinkParams extends LinkPackageIds {
  partyId: string;
  capId: string;
}

/** Clears a platform's link from the party. No-op on-chain if unset. */
export function clearLink(platform: PlatformKey, params: ClearLinkParams): Recipe {
  return (tx) => {
    const spec = PLATFORMS[platform];
    tx.add(
      platformLinkMod.clearLink({
        package: params.partyPlatformLinkPackageId,
        typeArguments: [dataTypeArg(spec, params)],
        arguments: [params.partyId, params.capId],
      }),
    );
  };
}

// === Read helpers ===

// The Move `Data` type suffix (`<module>::<dataType>`) → platform key. The package
// id prefix varies, so match on the last two `::` segments (unique across the table).
const BY_MOVE_TYPE: Record<string, PlatformKey> = Object.fromEntries(
  PLATFORM_KEYS.map((k) => [`${PLATFORMS[k].module}::${PLATFORMS[k].dataType}`, k]),
) as Record<string, PlatformKey>;

/**
 * The platform for a fully-qualified `Data` type argument, or null if unknown.
 * @param dataType e.g. `0x…::party_social::InstagramData`.
 */
export function platformForDataType(dataType: string): PlatformKey | null {
  const suffix = dataType.split("::").slice(-2).join("::");
  return BY_MOVE_TYPE[suffix] ?? null;
}

/** Builds a public `PlatformLink` from a platform key and its stored native identifier. */
export function buildLink(platform: PlatformKey, value: string): PlatformLink {
  return new PlatformLink({ platform, value, url: PLATFORMS[platform].url(value) });
}

// === Bound builders (the client binds package ids, then exposes per-platform methods) ===

export type BoundSetLinkParams = Omit<SetLinkParams, keyof LinkPackageIds>;
export type BoundClearLinkParams = Omit<ClearLinkParams, keyof LinkPackageIds>;

/** Per-platform `setX` / `clearX` builders, keyed off the table so all ~27 are covered. */
export type LinkTxBuilders =
  & { [K in PlatformKey as `set${Capitalize<K>}`]: (p: BoundSetLinkParams) => Recipe }
  & { [K in PlatformKey as `clear${Capitalize<K>}`]: (p: BoundClearLinkParams) => Recipe };

/** Builds the per-platform link tx builders with `ids` pre-bound. */
export function linkTxBuilders(ids: LinkPackageIds): LinkTxBuilders {
  const out: Record<string, unknown> = {};
  for (const key of PLATFORM_KEYS) {
    const cap = key.charAt(0).toUpperCase() + key.slice(1);
    out[`set${cap}`] = (p: BoundSetLinkParams): Recipe => setLink(key, { ...p, ...ids });
    out[`clear${cap}`] = (p: BoundClearLinkParams): Recipe => clearLink(key, { ...p, ...ids });
  }
  return out as LinkTxBuilders;
}
