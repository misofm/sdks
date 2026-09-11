// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Catalog reads: pressings, releases, covers, credits, tracklists, and the
// Discover shelf. Everything here is PUBLIC — no address is involved and no two
// callers get different answers, which is what makes this layer edge-cacheable.
//
// The composition of these reads is the point. A pressing page used to cost the
// browser five sequential round-trips to the chain (pressing → release → cover →
// credits → recordings); the same work happens once here, inside one datacenter,
// and every subsequent visitor is served from cache.

import { Effect, Result } from "effect";
import {
  deriveListingId,
  getListing,
  getPressing,
  getRecord,
  getSale,
  type Listing as ContractListing,
  type Pressing as ContractPressing,
} from "../pressing.ts";
import { requireRecordSalesDeployment } from "../deployments.ts";
import {
  getReleaseCoversByIds,
  parseReleaseCoverContent,
  releaseCoverFieldId,
  type ReleaseCoverView,
  type CoverImageRef,
} from "../cover.ts";
import {
  getReleaseCreditsByIds,
  parseReleaseCreditsContent,
  releaseCreditsFieldId,
  type CreditView,
} from "../credits.ts";
import {
  parseReleaseKindContent,
  releaseKindFieldId,
} from "../release-extensions.ts";
import {
  getRecordingEngineSessionsByIds,
  getRecordingMasterReferencesByIds,
  getRecordingStreamingTranscodesByIds,
  type RecordingEngineSessionView,
} from "../recording-extensions.ts";
import { getTrackCreditsByRecordingIds } from "../catalog.ts";
import { Musicos, type MusicosDeploymentInvalid, type MusicosService, type ReadError } from "@misofm/musicos";
import type { Release } from "@misofm/musicos";
import {
  DecodeError,
  ObjectId,
  Sui,
  SuiGraphQL,
  type BatchItemError,
  type GraphQLUnavailable,
  type ObjectDeleted,
  type ObjectUnavailable,
  type TransportError,
} from "sui-effect";
import { ReleaseNotFoundError } from "../errors.ts";
import type { MisoConfig } from "./config.ts";
import { getRecordingTitles, parseReleaseObject } from "./works.ts";
import { int } from "./internal/scalars.ts";
import {
  u256ToB64Url,
  walrusBlobReadUrl,
} from "./internal/walrus.ts";
import type {
  Cover,
  CoverImage,
  Credit,
  Currency,
  DiscoverItem,
  ListingView,
  PressingDetail,
  PressingPreview,
  PressingView,
  Price,
  RecordAlbum,
  ReleaseDetail,
  SaleDetail,
  SaleView,
  TrackCredits,
  TrackEngineSession,
  TrackView,
  WorkState,
} from "./types.ts";

/**
 * Builds `Musicos.layer({ deployment: { packageId } })`, provides it, and
 * hands back the effect it wraps — see `../catalog.ts`'s `withMusicos` for
 * the same idiom (kept file-local; see `docs/CONVERSION-STATUS.md`).
 */
function withMusicos<A, E>(
  packageId: string,
  effect: (musicos: MusicosService) => Effect.Effect<A, E, Sui>,
): Effect.Effect<A, E | MusicosDeploymentInvalid, Sui> {
  return Effect.gen(function* () {
    const musicos = yield* Musicos;
    return yield* effect(musicos);
  }).pipe(Effect.provide(Musicos.layer({ deployment: { packageId } })));
}

// ── Walrus URLs ──────────────────────────────────────────────────────────────

/** Aggregator URL for a cover image ref (a standalone Walrus blob). */
function imageUrl(aggregator: string, ref: CoverImageRef): string {
  return walrusBlobReadUrl(aggregator.replace(/\/$/, ""), ref.blobId);
}

function toCover(
  aggregator: string,
  view: ReleaseCoverView | null,
): Cover | null {
  if (!view) return null;
  const image = (ref: CoverImageRef): CoverImage => ({
    kind: ref.kind,
    url: imageUrl(aggregator, ref),
  });
  return {
    still: image(view.still),
    animated: view.animated ? image(view.animated) : null,
  };
}

// ── Currency ─────────────────────────────────────────────────────────────────

/**
 * Symbol + decimals for a coin type. FakeUsd (the testnet dollar) is 6dp; SUI is
 * 9dp; anything else falls back to its module name at 9dp, which is the Sui
 * default and the honest guess for a coin we have no table entry for.
 */
export function currencyInfo(type: string | null): Currency {
  if (!type) return { type: null, symbol: "COIN", decimals: 9 };
  if (/::fakeusd::/i.test(type))
    return { type, symbol: "FAKEUSD", decimals: 6 };
  if (type === "0x2::sui::SUI") return { type, symbol: "SUI", decimals: 9 };
  return {
    type,
    symbol: (type.split("::").pop() ?? "COIN").toUpperCase(),
    decimals: 9,
  };
}

// ── Projections ──────────────────────────────────────────────────────────────

function toPressingView(pressing: ContractPressing): PressingView {
  return {
    id: pressing.id,
    releaseId: pressing.releaseId,
    edition: pressing.edition,
    supply: pressing.supply,
    maxSupply: pressing.maxSupply,
    distributors: [...pressing.distributors],
  };
}

function toListingView(listing: ContractListing): ListingView {
  const price: Price = {
    kind: listing.pricing.kind,
    amount: listing.pricing.amount,
  };
  return {
    id: listing.id,
    pressingId: listing.pressingId,
    releaseId: listing.releaseId,
    pricing: price,
    currency: currencyInfo(listing.currencyType),
    state: listing.state,
  };
}

function toSaleView(
  pressing: ContractPressing,
  listing: ContractListing,
): SaleView {
  return { pressing: toPressingView(pressing), listing: toListingView(listing) };
}

/** One permanent pressing, projected to the JSON-safe read boundary. */
export const getPressingView = Effect.fn("getPressingView")(function* (
  pressingId: string,
  config: MisoConfig,
): Effect.fn.Return<PressingView | null, DecodeError | ObjectUnavailable | TransportError, Sui> {
  const sales = requireRecordSalesDeployment(config.recordSales);
  const pressing = yield* getPressing(pressingId, sales.recordPackageId);
  return pressing ? toPressingView(pressing) : null;
});

/** One currency-specific listing derived from its permanent pressing. */
export const getListingView = Effect.fn("getListingView")(function* (
  pressingId: string,
  currencyType: string,
  config: MisoConfig,
): Effect.fn.Return<ListingView | null, DecodeError | ObjectUnavailable | TransportError, Sui> {
  const sales = requireRecordSalesDeployment(config.recordSales);
  const listingId = deriveListingId(pressingId, currencyType, sales.recordShopPackageId);
  const listing = yield* getListing(listingId, sales.recordShopPackageId);
  return listing ? toListingView(listing) : null;
});

function toWorkState(state: Release["state"]): WorkState {
  return state.type === "Published"
    ? { type: "Published", timestampMs: state.timestampMs }
    : { type: "Initialized" };
}

function toCredits(credits: readonly CreditView[] | null): Credit[] {
  return (credits ?? []).map((c) => ({
    partyId: c.partyId,
    displayName: c.displayName,
    roles: [...c.roles],
  }));
}

/** The release's PRIMARY credits, in chain order — a release's artist line. */
export function primaryArtistNames(credits: Credit[]): string[] {
  return credits
    .filter((c) => c.roles.includes("Primary"))
    .map((c) => c.displayName);
}

/** Per-recording audio attachments, every id already base64url. */
export interface TrackAudio {
  masterBlobIds?: Partial<Record<string, string>>;
  transcodeQuiltIds?: Partial<Record<string, string>>;
  engineSessions?: Partial<Record<string, TrackEngineSession>>;
}

/**
 * Number the protocol's flat tracklist. Display grouping such as discs belongs
 * to metadata extensions and can be layered onto this projection later.
 */
export function toTracks(
  release: Release,
  titles: Record<string, string>,
  audio: TrackAudio,
): TrackView[] {
  return release.tracks.map((track, index) => {
    const masterBlobId = audio.masterBlobIds?.[track.recordingId];
    const transcodeQuiltId = audio.transcodeQuiltIds?.[track.recordingId];
    const engineSession = audio.engineSessions?.[track.recordingId];
    return {
      no: `${index + 1}`,
      title: titles[track.recordingId] ?? "Untitled",
      recordingId: track.recordingId,
      compositionId: track.compositionId,
      splitBps: int(track.splitBps.value),
      disc: 1,
      ...(masterBlobId ? { masterBlobId } : {}),
      ...(transcodeQuiltId ? { transcodeQuiltId } : {}),
      ...(engineSession ? { engineSession } : {}),
    };
  });
}

/** Re-key a soft per-recording read of decimal `u256` ids to base64url. */
function b64UrlByRecording(
  ids: Partial<Record<string, string>>,
): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {};
  for (const [recordingId, id] of Object.entries(ids)) {
    if (id) out[recordingId] = u256ToB64Url(id);
  }
  return out;
}

function toTrackEngineSession(view: RecordingEngineSessionView): TrackEngineSession {
  return {
    sessionBlobId: u256ToB64Url(view.sessionBlobId),
    stems: view.stems.map((stem) => ({ digest: stem.digest, blobId: u256ToB64Url(stem.blobId) })),
  };
}

// ── Cover ────────────────────────────────────────────────────────────────────

/** A release's cover from the configured `release_cover_art` package. */
export const readReleaseCover = Effect.fn("readReleaseCover")(function* (
  releaseId: string,
  config: MisoConfig,
): Effect.fn.Return<Cover | null, never, Sui> {
  const { releaseCoverArt } = config.protocol;
  const covers = yield* getReleaseCoversByIds([releaseId], releaseCoverArt).pipe(
    Effect.catch(() => Effect.succeed({} as Partial<Record<string, ReleaseCoverView>>)),
  );
  return toCover(config.walrusAggregatorUrl, covers[releaseId] ?? null);
});

export type ReleaseResourceInclude = "cover" | "credits" | "kind";

export interface ReleaseResources {
  release: Release;
  cover?: Cover | null;
  credits?: Credit[];
  kind?: string | null;
}

/**
 * A release plus selected derived resources in one heterogeneous chunked
 * `sui.getObjects`. Every extension id is deterministic, so separate object
 * calls only add network round trips without discovering anything new.
 */
export const getReleaseResources = Effect.fn("getReleaseResources")(function* (
  releaseId: string,
  config: MisoConfig,
  include: readonly ReleaseResourceInclude[] = [],
): Effect.fn.Return<ReleaseResources, ReleaseNotFoundError | DecodeError | TransportError, Sui> {
  const wantsCover = include.includes("cover");
  const wantsCredits = include.includes("credits");
  const wantsKind = include.includes("kind");
  const coverFieldId = wantsCover ? releaseCoverFieldId(releaseId, config.protocol.releaseCoverArt) : null;
  const creditsFieldId = wantsCredits ? releaseCreditsFieldId(releaseId, config.protocol.releaseCredits) : null;
  const kindFieldId = wantsKind ? releaseKindFieldId(releaseId, config.protocol.releaseKind) : null;
  const objectIds = [
    releaseId,
    ...(coverFieldId ? [coverFieldId] : []),
    ...(creditsFieldId ? [creditsFieldId] : []),
    ...(kindFieldId ? [kindFieldId] : []),
  ];
  const sui = yield* Sui;
  const results = yield* sui.getObjects(objectIds.map((id) => ObjectId.make(id)));
  const contentById = new Map(
    results.flatMap((result, index) => (Result.isSuccess(result) ? [[objectIds[index]!, result.success] as const] : [])),
  );

  const releaseFound = contentById.get(releaseId);
  if (!releaseFound) return yield* new ReleaseNotFoundError({ releaseId });
  const release = yield* parseReleaseObject(releaseId, releaseFound.content);

  let cover: Cover | null | undefined;
  if (wantsCover) {
    const found = coverFieldId ? contentById.get(coverFieldId) : undefined;
    let view: ReleaseCoverView | null = null;
    if (found) {
      try {
        view = parseReleaseCoverContent(found.content);
      } catch {
        view = null;
      }
    }
    cover = toCover(config.walrusAggregatorUrl, view);
  }

  let credits: Credit[] | undefined;
  if (wantsCredits) {
    const found = creditsFieldId ? contentById.get(creditsFieldId) : undefined;
    let view: CreditView[] = [];
    if (found) {
      try {
        view = parseReleaseCreditsContent(found.content);
      } catch {
        view = [];
      }
    }
    credits = toCredits(view);
  }
  let kind: string | null | undefined;
  if (wantsKind) {
    const found = kindFieldId ? contentById.get(kindFieldId) : undefined;
    kind = found ? parseReleaseKindContent(found.content) : null;
  }
  return {
    release,
    ...(wantsCover ? { cover: cover ?? null } : {}),
    ...(wantsCredits ? { credits: credits ?? [] } : {}),
    ...(wantsKind ? { kind: kind ?? null } : {}),
  };
});

// ── Release ──────────────────────────────────────────────────────────────────

/**
 * A release with its cover, credits, and resolved tracklist.
 *
 * Identity (the release object) is HARD — a failure here is a failed read.
 * Decoration (cover, credits) is SOFT: a release with no cover extension set is a
 * normal state, not a broken page, so those reads swallow their errors. That
 * split keeps a half-configured
 * release renderable.
 */
export type ReleaseInclude = "trackCredits";

export interface GetReleaseOptions {
  include?: readonly ReleaseInclude[];
}

export const getReleaseDetail = Effect.fn("getReleaseDetail")(function* (
  releaseId: string,
  config: MisoConfig,
  options: GetReleaseOptions = {},
): Effect.fn.Return<ReleaseDetail, ReleaseNotFoundError | DecodeError | BatchItemError | GraphQLUnavailable | TransportError, Sui | SuiGraphQL> {
  const { release, cover, credits, kind } = yield* getReleaseResources(releaseId, config, [
    "cover",
    "credits",
    "kind",
  ]);

  const recordingIds = release.tracks.map((track) => track.recordingId);
  const { recordingStreamingTranscode, recordingEngineSession } = config.protocol;
  const [titles, masterReferences, transcodes, engineSessions, trackCredits] = yield* Effect.all([
    getRecordingTitles(recordingIds, config.deployment.musicos).pipe(
      Effect.catch(() => Effect.succeed({} as Record<string, string>)),
    ),
    getRecordingMasterReferencesByIds(recordingIds, config.protocol.recordingMasterReference).pipe(
      Effect.catch(() => Effect.succeed({} as Partial<Record<string, string>>)),
    ),
    recordingStreamingTranscode
      ? getRecordingStreamingTranscodesByIds(recordingIds, recordingStreamingTranscode).pipe(
          Effect.catch(() => Effect.succeed({} as Partial<Record<string, string>>)),
        )
      : Effect.succeed({} as Partial<Record<string, string>>),
    recordingEngineSession
      ? getRecordingEngineSessionsByIds(recordingIds, recordingEngineSession).pipe(
          Effect.catch(() => Effect.succeed({} as Partial<Record<string, RecordingEngineSessionView>>)),
        )
      : Effect.succeed({} as Partial<Record<string, RecordingEngineSessionView>>),
    options.include?.includes("trackCredits")
      ? getTrackCreditsForRecordingIds(recordingIds, config)
      : Effect.succeed(undefined),
  ]);
  const audio: TrackAudio = {
    masterBlobIds: b64UrlByRecording(masterReferences),
    transcodeQuiltIds: b64UrlByRecording(transcodes),
    engineSessions: Object.fromEntries(
      Object.entries(engineSessions).flatMap(([recordingId, view]) =>
        view ? [[recordingId, toTrackEngineSession(view)]] : [],
      ),
    ),
  };

  const creditViews = credits ?? [];
  return {
    id: release.id,
    title: release.title,
    subtitle: null,
    kind: kind ?? null,
    state: toWorkState(release.state),
    publishedAtMs:
      release.state.type === "Published" ? release.state.timestampMs : null,
    cover: cover ?? null,
    credits: creditViews,
    primaryArtists: primaryArtistNames(creditViews),
    discCount: release.tracks.length > 0 ? 1 : 0,
    tracks: toTracks(release, titles, audio),
    ...(trackCredits !== undefined ? { trackCredits } : {}),
  };
});

const getTrackCreditsForRecordingIds = Effect.fn("getTrackCreditsForRecordingIds")(function* (
  recordingIds: readonly string[],
  config: MisoConfig,
): Effect.fn.Return<Record<string, TrackCredits>, BatchItemError | GraphQLUnavailable | TransportError, Sui | SuiGraphQL> {
  const { compositionCredits, recordingCredits } = config.protocol;
  const tracks = yield* getTrackCreditsByRecordingIds(recordingIds, {
    misoPackageId: config.deployment.musicos,
    compositionCreditsPackageId: compositionCredits,
    recordingCreditsPackageId: recordingCredits,
  });
  return Object.fromEntries(
    Object.entries(tracks).map(([id, track]) => [
      id,
      {
        compositionCredits: toCredits(track.compositionCredits),
        recordingCredits: {
          credits: toCredits(track.recordingCredits.credits),
          primaryArtistIds: [...track.recordingCredits.primaryArtistIds],
          featuredArtistIds: [...track.recordingCredits.featuredArtistIds],
        },
      } satisfies TrackCredits,
    ]),
  );
});

/**
 * Per-track credits for a release, keyed by recording id. A track with no credits
 * set maps to an empty entry rather than being absent, so a caller can tell
 * "nothing credited" from "no such track".
 */
export const getTrackCredits = Effect.fn("getTrackCredits")(function* (
  releaseId: string,
  config: MisoConfig,
): Effect.fn.Return<
  Record<string, TrackCredits>,
  ReadError | MusicosDeploymentInvalid | BatchItemError | GraphQLUnavailable | TransportError,
  Sui | SuiGraphQL
> {
  const release = yield* withMusicos(config.deployment.musicos, (musicos) => musicos.getReleaseById(ObjectId.make(releaseId)));
  const recordingIds = release.tracks.map((track) => track.recordingId);
  return yield* getTrackCreditsForRecordingIds(recordingIds, config);
});

// ── Pressing ─────────────────────────────────────────────────────────────────

/** Everything a Pressing page renders. `null` when no such Pressing exists. */
export const getPressingDetail = Effect.fn("getPressingDetail")(function* (
  pressingId: string,
  config: MisoConfig,
  options: GetReleaseOptions = {},
): Effect.fn.Return<
  PressingDetail | null,
  DecodeError | ReleaseNotFoundError | BatchItemError | GraphQLUnavailable | TransportError,
  Sui | SuiGraphQL
> {
  const pressing = yield* getPressingView(pressingId, config);
  if (!pressing) return null;
  const release = yield* getReleaseDetail(pressing.releaseId, config, options);
  return { pressing, release };
});

/**
 * A Pressing page plus one currency-specific Listing. Unlike `getSaleDetail`,
 * this starts from a Pressing id, which is the durable route and Party-feature
 * reference exposed to users.
 */
export const getPressingSaleDetail = Effect.fn("getPressingSaleDetail")(function* (
  pressingId: string,
  currencyType: string,
  config: MisoConfig,
  options: GetReleaseOptions = {},
): Effect.fn.Return<
  SaleDetail | null,
  DecodeError | ReleaseNotFoundError | BatchItemError | GraphQLUnavailable | TransportError,
  Sui | SuiGraphQL
> {
  const pressing = yield* getPressingView(pressingId, config);
  if (!pressing) return null;

  const [listing, release] = yield* Effect.all([
    getListingView(pressing.id, currencyType, config),
    getReleaseDetail(pressing.releaseId, config, options),
  ]);
  if (!listing) return null;
  return { sale: { pressing, listing }, release };
});

/**
 * The confirmation preview behind "paste a pressing id to pin it". Verifies the
 * object really is a `Pressing` before spending reads on it — a release id or a
 * record id pasted by mistake must come back as `null`, not as a half-built card.
 */
export const getPressingPreview = Effect.fn("getPressingPreview")(function* (
  pressingId: string,
  config: MisoConfig,
): Effect.fn.Return<
  PressingPreview | null,
  DecodeError | ObjectUnavailable | ReleaseNotFoundError | TransportError,
  Sui
> {
  const pressing = yield* getPressingView(pressingId, config);
  if (!pressing) return null;

  const { release, cover } = yield* getReleaseResources(pressing.releaseId, config, ["cover"]);

  return {
    pressingId,
    title: release.title,
    subtitle: null,
    coverUrl: cover?.still.url ?? null,
    edition: pressing.edition,
    supply: pressing.supply,
    maxSupply: pressing.maxSupply,
    trackCount: release.tracks.length,
  };
});

/**
 * Everything a currency-specific buy page renders. The Listing is derived from
 * the release's Pressing and the requested currency, never found through mutable
 * lookup state.
 */
export const getSaleDetail = Effect.fn("getSaleDetail")(function* (
  releaseId: string,
  edition: number,
  currencyType: string,
  config: MisoConfig,
  options: GetReleaseOptions = {},
): Effect.fn.Return<
  SaleDetail | null,
  DecodeError | ObjectDeleted | ObjectUnavailable | ReleaseNotFoundError | BatchItemError | GraphQLUnavailable | TransportError,
  Sui | SuiGraphQL
> {
  const sales = requireRecordSalesDeployment(config.recordSales);
  const sale = yield* getSale({
    releaseId,
    edition,
    currencyType,
    recordPackageId: sales.recordPackageId,
    recordShopPackageId: sales.recordShopPackageId,
  });
  if (!sale.pressing || !sale.listing) return null;
  const release = yield* getReleaseDetail(sale.pressing.releaseId, config, options);
  return { sale: toSaleView(sale.pressing, sale.listing), release };
});

// ── Discover ─────────────────────────────────────────────────────────────────

/**
 * The records currently on sale.
 *
 * Configured by release + edition + currency: both addresses are deterministic.
 */
export const getDiscoverShelf = Effect.fn("getDiscoverShelf")(function* (
  config: MisoConfig,
): Effect.fn.Return<
  DiscoverItem[],
  DecodeError | ObjectDeleted | ObjectUnavailable | MusicosDeploymentInvalid | TransportError,
  Sui
> {
  const configuredSales = [...config.discoverSales];
  const sales = requireRecordSalesDeployment(config.recordSales);
  const settled = yield* Effect.forEach(
    configuredSales,
    (configured) =>
      getSale({
        ...configured,
        recordPackageId: sales.recordPackageId,
        recordShopPackageId: sales.recordShopPackageId,
      }).pipe(Effect.map((result) => ({ configured, result }))),
    { concurrency: "unbounded" },
  );
  const available = settled.filter(
    (item): item is typeof item & {
      result: { pressing: ContractPressing; listing: ContractListing };
    } => item.result.pressing !== null && item.result.listing !== null,
  );
  const releaseIds = [...new Set(available.map((item) => item.result.pressing.releaseId))];
  if (releaseIds.length === 0) return [];

  const [releaseResults, coverViews, credits] = yield* Effect.all([
    withMusicos(config.deployment.musicos, (musicos) => musicos.getReleasesByIds(releaseIds.map((id) => ObjectId.make(id)))),
    getReleaseCoversByIds(releaseIds, config.protocol.releaseCoverArt).pipe(
      Effect.catch(() => Effect.succeed({} as Partial<Record<string, ReleaseCoverView>>)),
    ),
    getReleaseCreditsByIds(releaseIds, config.protocol.releaseCredits).pipe(
      Effect.catch(() => Effect.succeed({} as Partial<Record<string, CreditView[]>>)),
    ),
  ]);
  const releases = new Map(
    releaseResults.flatMap((result, index) => (Result.isSuccess(result) ? [[releaseIds[index]!, result.success] as const] : [])),
  );

  return available.flatMap(({ result }) => {
    const releaseId = result.pressing.releaseId;
    const release = releases.get(releaseId);
    if (!release) return [];
    const cover = toCover(config.walrusAggregatorUrl, coverViews[releaseId] ?? null);
    return [
      {
        sale: toSaleView(result.pressing, result.listing),
        releaseId,
        title: release.title,
        artist: primaryArtistNames(toCredits(credits[releaseId] ?? null)).join(", "),
        coverUrl: cover?.still.url ?? null,
      },
    ];
  });
});

// ── Record → release ─────────────────────────────────────────────────────────

/**
 * A record's parent release. Fresh `Record` objects expose `release_id`.
 *
 * This answer is IMMUTABLE for the life of the record, which is what lets the
 * endpoint in front of it cache for a year.
 */
export type RecordAlbumInclude = "release" | "trackCredits";

export interface GetRecordAlbumOptions {
  include?: readonly RecordAlbumInclude[];
}

export const getRecordAlbum = Effect.fn("getRecordAlbum")(function* (
  recordId: string,
  config: MisoConfig,
  options: GetRecordAlbumOptions = {},
): Effect.fn.Return<
  RecordAlbum | null,
  DecodeError | ObjectUnavailable | ReleaseNotFoundError | BatchItemError | GraphQLUnavailable | TransportError,
  Sui | SuiGraphQL
> {
  const sales = requireRecordSalesDeployment(config.recordSales);
  const record = yield* getRecord(recordId, sales.recordPackageId);
  if (!record) return null;
  const releaseId = record.releaseId;
  const includeRelease = options.include?.some((part) => part === "release" || part === "trackCredits") ?? false;
  const release =
    includeRelease && releaseId
      ? yield* getReleaseDetail(releaseId, config, {
          include: options.include?.includes("trackCredits") ? ["trackCredits"] : [],
        })
      : includeRelease
        ? null
        : undefined;
  return {
    recordId,
    releaseId,
    ...(includeRelease ? { release } : {}),
  };
});
