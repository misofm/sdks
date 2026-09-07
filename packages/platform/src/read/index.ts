// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// @misofm/platform/read — Miso's high-level platform read surface.
//
// One place that knows how to turn Sui objects into the things Miso talks about:
// a pressing, a release, an artist, a library, a receipt. It composes
// @misofm/protocol, owns the per-network id manifest, and returns view types that
// survive JSON.
//
// Browser- and server-compatible. The HTTP API is a thin cached transport over
// this same surface; direct clients can use it without going through the API.
//
//   const miso = createMisoClient({ network: "testnet" })
//   const pressing = await getPressingDetail(miso, pressingId)

export { createMisoClient } from "./client.ts";
export type { CreateMisoClientOptions, MisoClient } from "./client.ts";

export { misoConfig, networkFrom } from "./config.ts";
export type { DiscoverSale, MisoConfig, MisoConfigOverrides, MoneyIds, Network, ProtocolIds } from "./config.ts";

export {
  currencyInfo,
  getDiscoverShelf,
  getDiscoverShelfEffect,
  getListingView,
  getListingViewEffect,
  getPressingDetail,
  getPressingDetailEffect,
  getPressingPreview,
  getPressingPreviewEffect,
  getPressingSaleDetail,
  getPressingSaleDetailEffect,
  getPressingView,
  getPressingViewEffect,
  getRecordAlbum,
  getRecordAlbumEffect,
  readReleaseCover as getReleaseCover,
  readReleaseCoverEffect as getReleaseCoverEffect,
  getReleaseDetail,
  getReleaseDetailEffect,
  getReleaseResources,
  getReleaseResourcesEffect,
  getSaleDetail,
  getSaleDetailEffect,
  getTrackCredits,
  getTrackCreditsEffect,
  primaryArtistNames,
  readReleaseCover,
  readReleaseCoverEffect,
} from "./catalog.ts";
export type {
  GetRecordAlbumOptions,
  GetReleaseOptions,
  RecordAlbumInclude,
  ReleaseInclude,
  ReleaseResourceInclude,
  ReleaseResources,
} from "./catalog.ts";

export {
  getArtistProfile,
  getArtistProfileEffect,
  partyAvatarUrl as getPartyAvatarUrl,
  getPartySummaries,
  getPartySummariesEffect,
  partyAvatarUrl,
} from "./artist.ts";
export type { ArtistInclude, GetArtistOptions } from "./artist.ts";

export {
  resolveGenreNames as getGenreNames,
  resolveGenreNamesEffect as getGenreNamesEffect,
  resolveGenreNames,
  resolveGenreNamesEffect,
} from "./genres.ts";

export {
  getBalance,
  getBalanceEffect,
  getOwnedParties,
  getOwnedPartiesEffect,
  getOwnedRecords,
  getOwnedRecordsEffect,
  getOwnedWorks,
  getOwnedWorksEffect,
  getPendingMemberships,
  getPendingMembershipsEffect,
  getWorkByCap,
  getWorkByCapEffect,
  ownsParty,
  ownsPartyEffect,
  ownsRecord,
  ownsRecordEffect,
} from "./wallet.ts";

export {
  breakdown,
  findRecordSale,
  findRecordSales,
  getPurchaseReceipt,
  getPurchaseReceiptEffect,
  getPurchaseReceipts,
  getPurchaseReceiptsEffect,
  isRecordSoldEventType,
  recordSoldCurrencyType,
} from "./receipts.ts";

export type * from "./types.ts";

export { getRecordingTitles, getRecordingTitlesEffect } from "./works.ts";
