// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Public, camelCase result types for the Party EXTENSIONS. The mappers in
// ./internal.ts turn the generated (snake_case, Move-shaped) parse output into
// these. The Party object model itself (`Party`, `PartyKind`) is owned by
// `@misofm/partyos` — import it from there.

import { Schema } from "effect";

export class Profile extends Schema.Class<Profile>("@misofm/platform/Profile")({
  partyId: Schema.String,
  bioShort: Schema.String,
  bioLong: Schema.optional(Schema.String),
  /** ISO 3166-1 alpha-2 country code, e.g. "GB". */
  country: Schema.optional(Schema.String),
  /** ISO 639-1 language codes, e.g. ["en"]. */
  languages: Schema.Array(Schema.String),
}) {}

/**
 * A party's imagery, stored on-chain as a single Walrus quilt. Individual images
 * (avatar, header, …) are quilt patches addressed by identifier off-chain — see
 * `mediaUrls` / `MEDIA_IDENTIFIERS` in `extensions/media`.
 */
export class Media extends Schema.Class<Media>("@misofm/platform/Media")({
  partyId: Schema.String,
  /** Walrus quilt blob id (base64url) holding the party's images. */
  quiltId: Schema.String,
}) {}

/** A single call-to-action on a party: a labeled external link. Position is priority. */
export class Cta extends Schema.Class<Cta>("@misofm/platform/Cta")({
  label: Schema.String,
  url: Schema.String,
}) {}

/**
 * A platform this SDK knows how to build a link for. One key per external
 * platform, spanning social (`x`, `instagram`, …), music (`spotify`, `bandcamp`,
 * …), and professional/industry (`website`, `patreon`, …) payloads.
 */
export const PlatformKey = Schema.Literals([
  // Social (party_social)
  "x",
  "instagram",
  "threads",
  "tiktok",
  "youtube",
  "discord",
  "telegram",
  "reddit",
  "twitch",
  "facebook",
  // Music (party_music)
  "spotify",
  "bandcamp",
  "soundcloud",
  "appleMusic",
  "deezer",
  "tidal",
  "amazonMusic",
  "audiomack",
  // Professional / industry (party_pro_link)
  "website",
  "bookingPage",
  "managementPage",
  "publisherPage",
  "labelPage",
  "epk",
  "patreon",
  "substack",
  "kofi",
]);
export type PlatformKey = typeof PlatformKey.Type;

/**
 * One external-platform link attached to a party. Only the native identifier
 * (`value` — a handle, artist id, subdomain, or full URL) is stored on-chain; the
 * public `url` is rebuilt client-side from it.
 */
export class PlatformLink extends Schema.Class<PlatformLink>("@misofm/platform/PlatformLink")({
  platform: PlatformKey,
  /** The platform-native identifier stored on-chain (handle / id / subdomain / URL). */
  value: Schema.String,
  /** The public profile URL, rebuilt from `value`. */
  url: Schema.String,
}) {}
