// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// @misofm/platform/read — Miso's high-level platform read surface.
//
// One place that knows how to turn Sui objects into the things Miso talks about:
// a pressing, a release, an artist, a library, a receipt. It composes
// @misofm/musicos, owns the per-network id manifest, and returns view types that
// survive JSON.
//
// Browser- and server-compatible. The HTTP API is a thin cached transport over
// this same surface; direct clients can use it without going through the API.
// Every read returns `Effect<A, E, SuiClient | SuiGraphQL>`; `createMisoClient`
// bundles the transport, config, and Party client — provide its `sui`/`graphqlRaw`
// as the Effect services once, at your program's boundary:
//
//   const miso = createMisoClient({ network: "testnet" })
//   const layer = Layer.mergeAll(SuiClient.layer(miso.sui), SuiGraphQL.layer(miso.graphqlRaw))
//   const pressing = await Effect.runPromise(
//     getPressingDetail(pressingId, miso.config).pipe(Effect.provide(layer)),
//   )

export { createMisoClient } from "./client.ts";
export type { MisoClient, CreateMisoClientOptions } from "./client.ts";

export { misoConfig, networkFrom } from "./config.ts";
export type {
  MisoConfig,
  MisoConfigOverrides,
  DiscoverSale,
  MoneyIds,
  Network,
  ProtocolIds,
} from "./config.ts";

export {
  currencyInfo,
  getDiscoverShelf,
  getListingView,
  getPressingDetail,
  getPressingView,
  getPressingSaleDetail,
  getPressingPreview,
  getRecordAlbum,
  getReleaseDetail,
  getReleaseResources,
  getTrackCredits,
  getSaleDetail,
  primaryArtistNames,
  readReleaseCover,
} from "./catalog.ts";
export type {
  GetRecordAlbumOptions,
  GetReleaseOptions,
  RecordAlbumInclude,
  ReleaseInclude,
  ReleaseResourceInclude,
} from "./catalog.ts";
export type { ReleaseResources } from "./catalog.ts";

export {
  getArtistProfile,
  getPartySummaries,
  partyAvatarUrl,
} from "./artist.ts";
export type { ArtistInclude, GetArtistOptions } from "./artist.ts";

export { resolveGenreNames } from "./genres.ts";

export {
  getBalance,
  getOwnedParties,
  getPendingMemberships,
  getOwnedRecords,
  getOwnedWorks,
  getWorkByCap,
  ownsParty,
  ownsRecord,
} from "./wallet.ts";

export {
  breakdown,
  findRecordSale,
  findRecordSales,
  getPurchaseReceipt,
  getPurchaseReceipts,
  isRecordSoldEventType,
  recordSoldCurrencyType,
} from "./receipts.ts";

export type * from "./types.ts";
