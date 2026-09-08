// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// The view types every Miso read returns.
//
// ONE RULE GOVERNS THIS FILE: these shapes must survive `JSON.stringify`.
//
// The protocol SDK hands back `bigint` for every u64/u128 (pressing supply, listing
// prices, timestamps, balances). `JSON.stringify` THROWS on a bigint, so a
// view type that carries one cannot cross an HTTP boundary — it would work in the
// browser-direct world these shapes came from and fail the moment an API serves
// them. Every such field is therefore a DECIMAL STRING here, converted once at the
// SDK edge (`u64()` in ./internal/scalars.ts). Consumers that need arithmetic
// re-widen with `BigInt(...)`; consumers that only display it already have the
// string they wanted.
//
// Timestamps are the exception worth naming: `*AtMs` fields are `number`, not
// string, because they are milliseconds — comfortably inside Number.MAX_SAFE_INTEGER
// and immediately useful to `new Date()`.

// ── Catalog ──────────────────────────────────────────────────────────────────

/** Lifecycle state shared by compositions, recordings, and releases. */
export type WorkState =
  { type: "Initialized" } | { type: "Published"; timestampMs: number };

/** A cover image's location on Walrus, plus the URL to fetch it from. */
export interface CoverImage {
  kind: "blob" | "quiltPatch";
  /** Aggregator URL for the image — the only field a renderer needs. */
  url: string;
}

export interface Cover {
  still: CoverImage;
  animated: CoverImage | null;
}

/** A credited party on a work. */
export interface Credit {
  partyId: string;
  displayName: string;
  /** Role labels, e.g. `"Producer (Lead)"`, `"Instrumentalist: Guitar"`. */
  roles: string[];
}

/**
 * A recording's credits. The artist-id lists are separate from `credits` because
 * "primary" and "featured" are billing positions the recording asserts about a
 * party, not roles the party performed — a producer can be a featured artist. UI
 * badges the names by intersecting the two.
 */
export interface RecordingCredits {
  credits: Credit[];
  primaryArtistIds: string[];
  featuredArtistIds: string[];
}

/** Composition writing credits plus recording performance/production credits. */
export interface TrackCredits {
  compositionCredits: Credit[];
  recordingCredits: RecordingCredits;
}

/** One track as a tracklist renders it. */
export interface TrackView {
  /** Display number — `"1"`, or `"1.2"` (disc.track) on a multi-disc set. */
  no: string;
  title: string;
  recordingId: string;
  /** ID of the composition underlying this track's recording. */
  compositionId: string;
  /** This track's share of the release's revenue, in basis points. */
  splitBps: number;
  /** 1-based disc this track sits on. */
  disc: number;
  /** Base64url Walrus blob id of the archival master, when attached on-chain. */
  masterBlobId?: string;
  /**
   * Base64url Walrus Quilt id of the `miso-hls/v1` streaming transcode, when
   * attached on-chain. The playback key: `streamUrl(network, transcodeQuiltId)`.
   */
  transcodeQuiltId?: string;
  /** The Miso Engine session attached on-chain, when present. */
  engineSession?: TrackEngineSession;
}

/** A track's on-chain engine session: ids are base64url Walrus blob ids. */
export interface TrackEngineSession {
  /** The canonical Session V1 JSON document. */
  sessionBlobId: string;
  /** One FLAC blob per session source, keyed by the source's canonical PCM digest (64 hex chars), sorted by digest. */
  stems: { digest: string; blobId: string }[];
}

/** A release with everything a page renders: metadata, cover, credits, tracklist. */
export interface ReleaseDetail {
  id: string;
  title: string;
  subtitle: string | null;
  /** Self-declared `release_kind`, or null when no extension is attached. */
  kind: string | null;
  state: WorkState;
  /** Publish time (ms), or null while unpublished. */
  publishedAtMs: number | null;
  cover: Cover | null;
  credits: Credit[];
  /** The release's primary artists in chain order — its artist line. */
  primaryArtists: string[];
  discCount: number;
  tracks: TrackView[];
  /** Present only when requested via `include`, keyed by recording id. */
  trackCredits?: Record<string, TrackCredits>;
}

/** Pricing policy: pay exactly `amount` (fixed), or at least `amount` (floor). */
export interface Price {
  kind: "fixed" | "floor";
  /** Base units, decimal string (see the file header). */
  amount: string;
}

/** Symbol + decimals for a pressing's currency, resolved from its coin type. */
export interface Currency {
  /** Full Move coin type, or null when the Listing type tag was unreadable. */
  type: string | null;
  symbol: string;
  decimals: number;
}

/** A permanent record-production run derived from a release. */
export interface PressingView {
  id: string;
  releaseId: string;
  edition: number;
  supply: number;
  maxSupply: number | null;
  distributors: string[];
}

/** One permanent currency offer derived from a Pressing. */
export interface ListingView {
  id: string;
  pressingId: string;
  releaseId: string;
  pricing: Price;
  currency: Currency;
  /** The per-currency purchase switch. */
  state: "enabled" | "disabled";
}

/** A Pressing plus the requested currency's Listing. */
export interface SaleView {
  pressing: PressingView;
  listing: ListingView;
}

/** Everything the pressing buy page renders. */
export interface PressingDetail {
  pressing: PressingView;
  release: ReleaseDetail;
}

/** Everything a currency-specific buy page renders. */
export interface SaleDetail {
  sale: SaleView;
  release: ReleaseDetail;
}

/** One tile on the Discover shelf. */
export interface DiscoverItem {
  sale: SaleView;
  releaseId: string;
  title: string;
  /** Primary artists, joined for display. Empty when no credits are set. */
  artist: string;
  coverUrl: string | null;
}

/** A record's parent release — the album-resolution read. Immutable per record. */
export interface RecordAlbum {
  recordId: string;
  /** Null when the record object carries no release id. */
  releaseId: string | null;
  /** Present only when requested via `include`; null when no release is linked. */
  release?: ReleaseDetail | null;
}

/** The confirmation preview shown when an owner pastes a Pressing id to pin. */
export interface PressingPreview {
  pressingId: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  edition: number;
  supply: number;
  maxSupply: number | null;
  trackCount: number;
}

// ── Artist ───────────────────────────────────────────────────────────────────

export interface PartyMember {
  id: string;
  name: string;
}

/**
 * Every external platform the party link extensions know how to build a URL for,
 * spanning social, music, and professional payloads. Enumerated rather than left
 * as `string` so a renderer's icon/label switch is exhaustive at compile time —
 * adding a platform on-chain should break the UI that has no icon for it.
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

export interface PartyLink {
  platform: PlatformKey;
  /** The platform-native identifier stored on-chain (handle / id / subdomain / URL). */
  value: string;
  /** Public profile URL, rebuilt from `value`. */
  url: string;
}

export interface PartyCta {
  label: string;
  url: string;
}

/** An artist page: the party plus every extension attached to it. */
export interface ArtistProfile {
  id: string;
  kind: "individual" | "group";
  name: string;
  createdAtMs: number;
  bioShort: string | null;
  bioLong: string | null;
  /** ISO 3166-1 alpha-2, e.g. "GB". */
  country: string | null;
  /** ISO 639-1 codes, e.g. ["en"]. */
  languages: string[];
  /** Genre DISPLAY names, already humanized from the on-chain `HIP_HOP` form. */
  genres: string[];
  links: PartyLink[];
  ctas: PartyCta[];
  /** Group parties only — members with names resolved. Empty for individuals. */
  members: PartyMember[];
  /** Present only when requested via `include` — the owner-editor fields. */
  roles?: string[];
  tags?: string[];
  /** Public avatar URL (miso-api R2 lane; may 404 when unset). */
  avatarUrl: string;
}

/** The minimal party projection used for lists (`?ids=`). */
export interface PartySummary {
  id: string;
  name: string;
  kind: "individual" | "group";
}

// ── Wallet-scoped ────────────────────────────────────────────────────────────

/** A record the wallet holds. */
export interface OwnedRecord {
  /** Canonical object id — the `recordId` route param. */
  id: string;
  /** Full on-chain type, e.g. `<record>::record::Record`. */
  type: string;
  releaseId: string;
  pressingId: string;
  edition: number;
  number: number;
  /** Defining Move type name of the currency used for the purchase. */
  purchaseCurrency: string;
  /** Lossless u64 base-unit amount actually paid. */
  purchasePrice: string;
  /** Transaction sender that purchased the Record. */
  purchasedBy: string;
  /** Lossless u64 Unix-millisecond purchase timestamp. */
  purchasedTimestampMs: string;
}

/** A party the wallet administers (holds the `PartyAdminCap` for). */
export interface OwnedParty {
  partyId: string;
  capId: string;
  name: string;
  kind: "individual" | "group";
}

/** A group invitation awaiting acceptance by a party this wallet administers. */
export interface PendingMembership {
  /** The invited individual party and the cap that authorizes accept/decline. */
  memberPartyId: string;
  memberCapId: string;
  /** The inviting group party. */
  groupId: string;
  groupName: string;
}

export type WorkKind = "composition" | "recording" | "release";

/** A work the wallet administers, as the studio catalog lists it. */
export interface OwnedWork {
  /** The ADMIN CAP object id — the catalog's routing key. */
  capId: string;
  kind: WorkKind;
  workId: string;
  title: string;
  /** Lifecycle state tag: "Initialized" | "Published". */
  state: string;
}

/** Everything the work detail page shows beyond the list row. */
export interface WorkDetail extends OwnedWork {
  subtitle?: string;
  /** Composition only — royalty rate in basis points. */
  royaltyRateBps?: number;
  /** Composition / recording only — the share token type tag. */
  shareType?: string;
  /** Release only. */
  discCount?: number;
  trackCount?: number;
}

/** A wallet's balance in one currency, split by Sui storage model. */
export interface Balance {
  address: string;
  coinType: string;
  /** Base units, decimal string. `coinBalance + addressBalance`. */
  balance: string;
  /** Base units held in address-owned `Coin<T>` objects. */
  coinBalance: string;
  /** Base units held in the address balance and available to `FundsWithdrawal`. */
  addressBalance: string;
  decimals: number;
}

/** Whether a wallet controls a thing. `null` for a check that could not be made. */
export interface Ownership {
  address: string;
  /** The object the check was about (party id or record id). */
  objectId: string;
  isOwner: boolean;
  /** Party checks only — the derived `PartyAdminCap` id owner-gated writes need. */
  capId?: string;
}

// ── Receipts ─────────────────────────────────────────────────────────────────

/** The sale itself, as the chain recorded it. */
export interface RecordSale {
  listingId: string;
  pressingId: string;
  releaseId: string;
  /** The `Record` object minted to the buyer. */
  recordId: string;
  edition: number;
  /** This copy's number in the edition. */
  number: number;
  /** Embedded defining TypeName; validated against the event generic. */
  purchaseCurrency: string;
  /** What the buyer actually paid, in base units. */
  purchasePrice: string;
  /** The fixed or floor price that the Listing accepted at this sale. */
  pricing: Price;
  /** Currency type carried by the `RecordSoldEvent` generic argument. */
  currencyType: string;
  purchasedBy: string;
  /** Lossless chain-clock timestamp captured by `listing::purchase`. */
  purchasedTimestampMs: string;
}

/** One track's share of the paid amount, and how that share splits again. */
export interface TrackRoyalty {
  no: string;
  title: string;
  recordingId: string;
  splitBps: number;
  /** Base units attributable to this track. */
  amount: string;
  /**
   * `amount` split between the composition and the recording. Both null when the
   * composition's royalty rate could not be resolved — the breakdown then stops
   * at the track level rather than guessing.
   */
  composition: string | null;
  recording: string | null;
}

export interface PurchaseReceipt {
  sale: RecordSale;
  /** The pressing/release the copy came from — cover, title, tracklist. */
  detail: PressingDetail;
  /** The Listing price captured at sale time, not its mutable current value. */
  price: string;
  tracks: TrackRoyalty[];
}
