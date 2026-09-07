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

import {
  deriveListingId,
  getListing,
  getPressing,
  getRecord,
  getSale,
  type ListingView as ContractListingView,
  type PressingView as ContractPressingView,
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
import { getRecordingMasterReferencesByIds } from "../recording-extensions.ts";
import { getTrackCreditsByRecordingIds } from "../catalog.ts";
import { getReleaseById, getReleasesByIds, isNotFound } from "@misofm/protocol";
import type { Release } from "@misofm/protocol";
import type { MisoClient } from "./client.ts";
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
  TrackView,
  WorkState,
} from "./types.ts";

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

function toPressingView(pressing: ContractPressingView): PressingView {
  return {
    id: pressing.id,
    releaseId: pressing.releaseId,
    edition: pressing.edition,
    supply: pressing.supply,
    maxSupply: pressing.maxSupply,
    distributors: [...pressing.distributors],
  };
}

function toListingView(listing: ContractListingView): ListingView {
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
  pressing: ContractPressingView,
  listing: ContractListingView,
): SaleView {
  return { pressing: toPressingView(pressing), listing: toListingView(listing) };
}

/** One permanent pressing, projected to the JSON-safe read boundary. */
export async function getPressingView(
  client: MisoClient,
  pressingId: string,
): Promise<PressingView | null> {
  const sales = requireRecordSalesDeployment(client.config.recordSales);
  const pressing = await getPressing(
    client.protocol,
    pressingId,
    sales.recordPackageId,
  );
  return pressing ? toPressingView(pressing) : null;
}

/** One currency-specific listing derived from its permanent pressing. */
export async function getListingView(
  client: MisoClient,
  pressingId: string,
  currencyType: string,
): Promise<ListingView | null> {
  const sales = requireRecordSalesDeployment(client.config.recordSales);
  const listingId = deriveListingId(pressingId, currencyType, sales.recordShopPackageId);
  const listing = await getListing(client.protocol, listingId, sales.recordShopPackageId);
  return listing ? toListingView(listing) : null;
}

function toWorkState(state: Release["state"]): WorkState {
  return state.type === "Published"
    ? { type: "Published", timestampMs: state.timestampMs }
    : { type: "Initialized" };
}

function toCredits(credits: CreditView[] | null): Credit[] {
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

/**
 * Number the protocol's flat tracklist. Display grouping such as discs belongs
 * to metadata extensions and can be layered onto this projection later.
 */
export function toTracks(
  release: Release,
  titles: Record<string, string>,
  masterBlobIds: Partial<Record<string, string>>,
): TrackView[] {
  return release.tracks.map((track, index) => {
    const masterBlobId = masterBlobIds[track.recordingId];
    return {
      no: `${index + 1}`,
      title: titles[track.recordingId] ?? "Untitled",
      recordingId: track.recordingId,
      compositionId: track.compositionId,
      splitBps: int(track.splitBps.value),
      disc: 1,
      ...(masterBlobId ? { masterBlobId } : {}),
    };
  });
}

// ── Cover ────────────────────────────────────────────────────────────────────

/** A release's cover from the configured `release_cover_art` package. */
export async function readReleaseCover(
  client: MisoClient,
  releaseId: string,
): Promise<Cover | null> {
  const { releaseCoverArt } = client.config.protocol;
  const covers = await getReleaseCoversByIds(
    client.protocol,
    [releaseId],
    releaseCoverArt,
  ).catch(() => ({}) as Partial<Record<string, ReleaseCoverView>>);
  return toCover(client.config.walrusAggregatorUrl, covers[releaseId] ?? null);
}

export type ReleaseResourceInclude = "cover" | "credits" | "kind";

export interface ReleaseResources {
  release: Release;
  cover?: Cover | null;
  credits?: Credit[];
  kind?: string | null;
}

/**
 * A release plus selected derived resources in one heterogeneous Core batch.
 * Every extension id is deterministic, so separate object calls only add
 * network round trips without discovering anything new.
 */
export async function getReleaseResources(
  client: MisoClient,
  releaseId: string,
  include: readonly ReleaseResourceInclude[] = [],
): Promise<ReleaseResources> {
  const wantsCover = include.includes("cover");
  const wantsCredits = include.includes("credits");
  const wantsKind = include.includes("kind");
  const coverFieldIds = wantsCover
    ? [releaseCoverFieldId(releaseId, client.config.protocol.releaseCoverArt)]
    : [];
  const creditsFieldId = wantsCredits
    ? releaseCreditsFieldId(releaseId, client.config.protocol.releaseCredits)
    : null;
  const kindFieldId = wantsKind
    ? releaseKindFieldId(releaseId, client.config.protocol.releaseKind)
    : null;
  const objectIds = [
    releaseId,
    ...coverFieldIds,
    ...(creditsFieldId ? [creditsFieldId] : []),
    ...(kindFieldId ? [kindFieldId] : []),
  ];
  const { objects } = await client.protocol.core.getObjects({
    objectIds,
    include: { content: true },
  });
  const releaseObject = objects[0];
  if (!releaseObject) throw new Error(`Release not found: ${releaseId}`);
  if (releaseObject instanceof Error) throw releaseObject;
  if (!releaseObject.content)
    throw new Error(`Release has no content: ${releaseId}`);
  const release = parseReleaseObject(
    releaseObject.objectId,
    releaseObject.content,
  );

  let cover: Cover | null | undefined;
  if (wantsCover) {
    let view: ReleaseCoverView | null = null;
    for (let index = 0; index < coverFieldIds.length; index += 1) {
      const object = objects[index + 1];
      if (!object || object instanceof Error || !object.content) continue;
      try {
        view = parseReleaseCoverContent(object.content);
      } catch {
        view = null;
      }
      if (view) break;
    }
    cover = toCover(client.config.walrusAggregatorUrl, view);
  }

  let credits: Credit[] | undefined;
  if (wantsCredits) {
    const object = objects[1 + coverFieldIds.length];
    let view: CreditView[] = [];
    if (object && !(object instanceof Error) && object.content) {
      try {
        view = parseReleaseCreditsContent(object.content);
      } catch {
        view = [];
      }
    }
    credits = toCredits(view);
  }
  let kind: string | null | undefined;
  if (wantsKind) {
    const object = objects[
      1 + coverFieldIds.length + (creditsFieldId ? 1 : 0)
    ];
    kind =
      object && !(object instanceof Error) && object.content
        ? parseReleaseKindContent(object.content)
        : null;
  }
  return {
    release,
    ...(wantsCover ? { cover: cover ?? null } : {}),
    ...(wantsCredits ? { credits: credits ?? [] } : {}),
    ...(wantsKind ? { kind: kind ?? null } : {}),
  };
}

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

export async function getReleaseDetail(
  client: MisoClient,
  releaseId: string,
  options: GetReleaseOptions = {},
): Promise<ReleaseDetail> {
  const { release, cover, credits, kind } = await getReleaseResources(
    client,
    releaseId,
    ["cover", "credits", "kind"],
  );

  const recordingIds = release.tracks.map((track) => track.recordingId);
  const [titles, masterReferences, trackCredits] = await Promise.all([
    getRecordingTitles(
      client.protocol,
      client.graphql,
      recordingIds,
      client.config.deployment.miso,
    ),
    getRecordingMasterReferencesByIds(
      client.protocol,
      recordingIds,
      client.config.protocol.recordingMasterReference,
    ).catch(() => ({})),
    options.include?.includes("trackCredits")
      ? getTrackCreditsForRecordingIds(client, recordingIds)
      : Promise.resolve(undefined),
  ]);
  const masterBlobIds: Record<string, string> = {};
  for (const [recordingId, blobId] of Object.entries(masterReferences)) {
    if (blobId) masterBlobIds[recordingId] = u256ToB64Url(blobId);
  }

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
    tracks: toTracks(release, titles, masterBlobIds),
    ...(trackCredits !== undefined ? { trackCredits } : {}),
  };
}

async function getTrackCreditsForRecordingIds(
  client: MisoClient,
  recordingIds: readonly string[],
): Promise<Record<string, TrackCredits>> {
  const { compositionCredits, recordingCredits } = client.config.protocol;
  const tracks = await getTrackCreditsByRecordingIds(
    client.protocol,
    client.graphql,
    recordingIds,
    {
      misoPackageId: client.config.deployment.miso,
      compositionCreditsPackageId: compositionCredits,
      recordingCreditsPackageId: recordingCredits,
    },
  );
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
}

/**
 * Per-track credits for a release, keyed by recording id. A track with no credits
 * set maps to an empty entry rather than being absent, so a caller can tell
 * "nothing credited" from "no such track".
 */
export async function getTrackCredits(
  client: MisoClient,
  releaseId: string,
): Promise<Record<string, TrackCredits>> {
  const release = await getReleaseById(client.protocol, releaseId);
  const recordingIds = release.tracks.map((track) => track.recordingId);
  return getTrackCreditsForRecordingIds(client, recordingIds);
}

// ── Pressing ─────────────────────────────────────────────────────────────────

/** Everything a Pressing page renders. `null` when no such Pressing exists. */
export async function getPressingDetail(
  client: MisoClient,
  pressingId: string,
  options: GetReleaseOptions = {},
): Promise<PressingDetail | null> {
  const pressing = await getPressingView(client, pressingId);
  if (!pressing) return null;
  const release = await getReleaseDetail(client, pressing.releaseId, options);
  return { pressing, release };
}

/**
 * A Pressing page plus one currency-specific Listing. Unlike `getSaleDetail`,
 * this starts from a Pressing id, which is the durable route and Party-feature
 * reference exposed to users.
 */
export async function getPressingSaleDetail(
  client: MisoClient,
  pressingId: string,
  currencyType: string,
  options: GetReleaseOptions = {},
): Promise<SaleDetail | null> {
  const pressing = await getPressingView(client, pressingId);
  if (!pressing) return null;

  const [listing, release] = await Promise.all([
    getListingView(client, pressing.id, currencyType),
    getReleaseDetail(client, pressing.releaseId, options),
  ]);
  if (!listing) return null;
  return { sale: { pressing, listing }, release };
}

/**
 * The confirmation preview behind "paste a pressing id to pin it". Verifies the
 * object really is a `Pressing` before spending reads on it — a release id or a
 * record id pasted by mistake must come back as `null`, not as a half-built card.
 */
export async function getPressingPreview(
  client: MisoClient,
  pressingId: string,
): Promise<PressingPreview | null> {
  const pressing = await getPressingView(client, pressingId);
  if (!pressing) return null;

  const { release, cover } = await getReleaseResources(
    client,
    pressing.releaseId,
    ["cover"],
  );

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
}

/**
 * Everything a currency-specific buy page renders. The Listing is derived from
 * the release's Pressing and the requested currency, never found through mutable
 * lookup state.
 */
export async function getSaleDetail(
  client: MisoClient,
  releaseId: string,
  edition: number,
  currencyType: string,
  options: GetReleaseOptions = {},
): Promise<SaleDetail | null> {
  const sales = requireRecordSalesDeployment(client.config.recordSales);
  const sale = await getSale(client.protocol, {
    releaseId,
    edition,
    currencyType,
    recordPackageId: sales.recordPackageId,
    recordShopPackageId: sales.recordShopPackageId,
  });
  if (!sale.pressing || !sale.listing) return null;
  const release = await getReleaseDetail(client, sale.pressing.releaseId, options);
  return { sale: toSaleView(sale.pressing, sale.listing), release };
}

// ── Discover ─────────────────────────────────────────────────────────────────

/**
 * The records currently on sale.
 *
 * Configured by release + edition + currency: both addresses are deterministic.
 */
export async function getDiscoverShelf(
  client: MisoClient,
): Promise<DiscoverItem[]> {
  const configuredSales = [...client.config.discoverSales];
  const sales = requireRecordSalesDeployment(client.config.recordSales);
  const settled = await Promise.all(
    configuredSales.map(async (configured) => ({
      configured,
      result: await getSale(client.protocol, {
        ...configured,
        recordPackageId: sales.recordPackageId,
        recordShopPackageId: sales.recordShopPackageId,
      }),
    })),
  );
  const available = settled.filter(
    (item): item is typeof item & {
      result: { pressing: ContractPressingView; listing: ContractListingView };
    } => item.result.pressing !== null && item.result.listing !== null,
  );
  const releaseIds = [...new Set(available.map((item) => item.result.pressing.releaseId))];
  if (releaseIds.length === 0) return [];

  const [releases, coverViews, credits] = await Promise.all([
    getReleasesByIds(client.protocol, releaseIds),
    getReleaseCoversByIds(client.protocol, releaseIds, client.config.protocol.releaseCoverArt).catch(() => ({}) as Partial<Record<string, ReleaseCoverView>>),
    getReleaseCreditsByIds(
      client.protocol,
      releaseIds,
      client.config.protocol.releaseCredits,
    ).catch(() => ({}) as Partial<Record<string, CreditView[]>>),
  ]);

  return available.flatMap(({ result }) => {
    const releaseId = result.pressing.releaseId;
    const release = releases[releaseId];
    if (!release) return [];
    const cover = toCover(
      client.config.walrusAggregatorUrl,
      coverViews[releaseId] ?? null,
    );
    return [
      {
        sale: toSaleView(result.pressing, result.listing),
        releaseId,
        title: release.title,
        artist: primaryArtistNames(toCredits(credits[releaseId] ?? null)).join(
          ", ",
        ),
        coverUrl: cover?.still.url ?? null,
      },
    ];
  });
}

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

export async function getRecordAlbum(
  client: MisoClient,
  recordId: string,
  options: GetRecordAlbumOptions = {},
): Promise<RecordAlbum | null> {
  try {
    const sales = requireRecordSalesDeployment(client.config.recordSales);
    const record = await getRecord(client.protocol, recordId, sales.recordPackageId);
    if (!record) return null;
    const releaseId = record.releaseId;
    const includeRelease =
      options.include?.some(
        (part) => part === "release" || part === "trackCredits",
      ) ?? false;
    const release =
      includeRelease && releaseId
        ? await getReleaseDetail(client, releaseId, {
            include: options.include?.includes("trackCredits")
              ? ["trackCredits"]
              : [],
          })
        : includeRelease
          ? null
          : undefined;
    return {
      recordId,
      releaseId,
      ...(includeRelease ? { release } : {}),
    };
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}
