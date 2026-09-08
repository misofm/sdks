// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Public, camelCase result types for the Party EXTENSIONS. The mappers in
// ./internal.ts turn the generated (snake_case, Move-shaped) parse output into
// these. The Party object model itself (`Party`, `PartyKind`) is owned by
// `@misofm/partyos` — import it from there.

export interface Profile {
  partyId: string;
  bioShort: string;
  bioLong?: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "GB". */
  country?: string;
  /** ISO 639-1 language codes, e.g. ["en"]. */
  languages: string[];
}

/**
 * A party's imagery, stored on-chain as a single Walrus quilt. Individual images
 * (avatar, header, …) are quilt patches addressed by identifier off-chain — see
 * `mediaUrls` / `MEDIA_IDENTIFIERS` in `extensions/media`.
 */
export interface Media {
  partyId: string;
  /** Walrus quilt blob id (base64url) holding the party's images. */
  quiltId: string;
}

/** A single call-to-action on a party: a labeled external link. Position is priority. */
export interface Cta {
  label: string;
  url: string;
}

/**
 * A platform this SDK knows how to build a link for. One key per external
 * platform, spanning social (`x`, `instagram`, …), music (`spotify`, `bandcamp`,
 * …), and professional/industry (`website`, `patreon`, …) payloads.
 */
export type PlatformKey =
  // Social (party_social)
  | "x"
  | "instagram"
  | "threads"
  | "tiktok"
  | "youtube"
  | "discord"
  | "telegram"
  | "reddit"
  | "twitch"
  | "facebook"
  // Music (party_music)
  | "spotify"
  | "bandcamp"
  | "soundcloud"
  | "appleMusic"
  | "deezer"
  | "tidal"
  | "amazonMusic"
  | "audiomack"
  // Professional / industry (party_pro_link)
  | "website"
  | "bookingPage"
  | "managementPage"
  | "publisherPage"
  | "labelPage"
  | "epk"
  | "patreon"
  | "substack"
  | "kofi";

/**
 * One external-platform link attached to a party. Only the native identifier
 * (`value` — a handle, artist id, subdomain, or full URL) is stored on-chain; the
 * public `url` is rebuilt client-side from it.
 */
export interface PlatformLink {
  platform: PlatformKey;
  /** The platform-native identifier stored on-chain (handle / id / subdomain / URL). */
  value: string;
  /** The public profile URL, rebuilt from `value`. */
  url: string;
}
