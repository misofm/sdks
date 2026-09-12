// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The `Miso` service: the sui-effect extension replacing the hand-written
 * `MisoPlatformClient` class (misofm/sdks#35). Stage 3 (WP6 "facade
 * derivation") assembles the complete `MisoService` this file's earlier
 * skeleton deferred: `getPressing`/`getListing`/`getRecord`/`getSale`,
 * `ids.*`, `tx.*`, `call`/`bcs`, `vault`, `createShareCurrency`/
 * `publishShareCurrencies`/`initializeShareCurrencies`, `publishCatalog`,
 * `read.*`, `events`, and the deprecated `ready` warm-up member — see
 * `docs/CONVERSION.md` for what changed and why.
 *
 * Per sui-effect's `docs/extensions.md` ("converting an existing facade"):
 * `Musicos`/`Partyos` are dependencies already extended elsewhere, so this
 * service `Layer.provide`s their own `layer(...)` inside its own so the
 * requirement channel stays `Sui | SuiGraphQL` and never leaks
 * `Musicos | Partyos` to a consumer that only asked for `Miso`. `SuiGraphQL`
 * joins the requirement this stage, now that `read.*` and the catalog reads
 * need it (the WP1 skeleton's `Sui`-only requirement was accurate only until
 * this surface existed).
 *
 * Every I/O member closes over the `Sui`/`SuiGraphQL` this layer's `make`
 * already holds via `Effect.provideService`, so `R` is empty on every member
 * — the `withSui`/`withEnv` helpers below are the "keeps the 100-odd members
 * from repeating it" helper the issue's target shape calls for.
 */
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { Config, Context, Effect, Layer } from "effect";
import { Musicos, type MusicosDeploymentInvalid, type MusicosService } from "@misofm/musicos";
import { Partyos, type PartyosDeploymentError, type PartyosService } from "@misofm/partyos";
import {
  Sui,
  SuiGraphQL,
  type DecodeError,
  type ObjectDeleted,
  type ObjectUnavailable,
  type SuiService,
  type TransportError,
  type UnexpectedEffects,
} from "@unconfirmed/sui-effect";
import { Tx, type RunError } from "@unconfirmed/sui-effect/tx";

import {
  getMisoPlatformDeployment,
  MISO_PLATFORM_DEPLOYMENTS,
  normalizeMisoPlatformDeployment,
  requireOperationsDeployment,
  requireRecordSalesDeployment,
  type AvailableOperationsDeployment,
  type MisoPlatformDeployment,
  type RecordSalesDeployment,
} from "./deployments.ts";
import {
  MisoChainIdentifierMismatchError,
  MisoNetworkMismatchError,
  MisoPlatformDeploymentInvalidError,
  OperationsUnavailableError,
  RecordSalesUnavailableError,
} from "./errors.ts";
import { makeMisoParty, type MisoPartyService } from "./party/client.ts";
import { immutableSnapshot } from "./internal.ts";

import {
  authorizeRecordShop,
  deriveListingId,
  derivePressingAdminCapId,
  derivePressingId,
  deriveRecordId,
  deriveSaleIds,
  getListing,
  getPressing,
  getRecord,
  getSale,
  openListing,
  openPressing,
  purchaseRecord,
  revokeRecordShop,
  setListingPrice,
  setListingState,
  type GetSaleParams,
  type Listing,
  type OpenListingParams,
  type OpenPressingParams,
  type Pressing,
  type PressingAdministrationParams,
  type PressingRecord,
  type PurchaseRecordParams,
  type SetListingPriceParams,
  type SetListingStateParams,
} from "./pressing.ts";
import {
  publishComposition,
  publishCompositionAndRecording,
  publishRecording,
  publishRelease,
  publishShareCurrency,
  initializeShareCurrency,
  type PublishCompositionAndRecordingParams,
  type PublishCompositionParams,
  type PublishRecordingParams,
  type PublishReleaseParams,
  type TxThunk,
} from "./transactions.ts";
import { publishReleaseGraph, type PublishReleaseGraphParams } from "./release-graph.ts";
import {
  setReleaseDescription,
  setReleaseDspLinks,
  setReleaseKind,
  type SetReleaseDescriptionParams,
  type SetReleaseDspLinksParams,
  type SetReleaseKindParams,
} from "./release-extensions.ts";
import {
  clearRecordingGenres,
  clearReleaseGenres,
  deriveGenreAddress,
  setRecordingGenres,
  setReleaseGenres,
  type ClearRecordingGenresParams,
  type ClearReleaseGenresParams,
  type SetRecordingGenresParams,
  type SetReleaseGenresParams,
} from "./genre.ts";
import {
  setRecordingStreamingTranscode,
  unsetRecordingStreamingTranscode,
  type SetRecordingStreamingTranscodeParams,
  type UnsetRecordingStreamingTranscodeParams,
} from "./recording-extensions.ts";
import { addReleaseCredit, type AddReleaseCreditParams } from "./credits.ts";
import { setReleaseCover, setReleaseTrackCover, type SetReleaseCoverParams, type SetReleaseTrackCoverParams } from "./cover.ts";
import * as vaultActions from "./vault.ts";
import { createShareCurrency, initializeShareCurrencies, publishShareCurrencies, type RunOpts, type ShareCurrency, type ShareCurrencyMeta } from "./share.ts";
import { publishAtomicCatalog, parseAtomicPublicationResult, type AtomicPublicationParams, type AtomicPublicationResult } from "./publication.ts";
import { platformEventParsers } from "./events.ts";
import { configFromDeployment } from "./read/config.ts";
import * as readCatalog from "./read/catalog.ts";
import * as readArtist from "./read/artist.ts";
import * as readGenres from "./read/genres.ts";
import * as readWallet from "./read/wallet.ts";
import * as readReceipts from "./read/receipts.ts";
import * as readRoyalties from "./read/royalties.ts";
import type { MisoConfig } from "./read/config.ts";

import * as recordContract from "./contracts/record/record.ts";
import * as pressingContract from "./contracts/record/pressing.ts";
import * as listingContract from "./contracts/record_shop/listing.ts";
import * as genreContract from "./contracts/genre/genre.ts";
import * as releaseDescriptionContract from "./contracts/release_description/release_description.ts";
import * as releaseDspLinkContract from "./contracts/release_dsp_link/release_dsp_link.ts";
import * as releaseGenreContract from "./contracts/release_genre/release_genre.ts";
import * as releaseKindContract from "./contracts/release_kind/release_kind.ts";
import * as releaseRevenueDistributorContract from "./contracts/release_revenue_distributor/release_revenue_distributor.ts";
import * as vaultContract from "./contracts/vault/vault.ts";
import * as compositionRoyaltyPoolContract from "./contracts/composition_royalty_pool/composition_royalty_pool.ts";
import * as recordingRoyaltyPoolContract from "./contracts/recording_royalty_pool/recording_royalty_pool.ts";
import * as partyWalletContract from "./contracts/party_wallet/party_wallet.ts";
import * as compositionRoutedStakeContract from "./contracts/composition_routed_stake/composition_routed_stake.ts";
import * as compositionRoyaltyPoolPluginContract from "./contracts/composition_royalty_pool_plugin/composition_royalty_pool_plugin.ts";
import * as recordingRoyaltyPoolPluginContract from "./contracts/recording_royalty_pool_plugin/recording_royalty_pool_plugin.ts";
import * as releaseRevenueDistributorPluginContract from "./contracts/release_revenue_distributor_plugin/release_revenue_distributor_plugin.ts";
import * as routedStakeContract from "./contracts/routed_stake/routed_stake.ts";
import * as royaltyPoolContract from "./contracts/royalty_pool/pool.ts";
import * as recordingAdvisoryContract from "./contracts/recording_advisory/recording_advisory.ts";
import * as recordingLanguageContract from "./contracts/recording_language/recording_language.ts";
import * as recordingMasterReferenceContract from "./contracts/recording_master_reference/recording_master_reference.ts";
import * as recordingStreamingTranscodeContract from "./contracts/recording_streaming_transcode/recording_streaming_transcode.ts";
import * as recordingGenreContract from "./contracts/recording_genre/recording_genre.ts";
import * as coverArtContract from "./contracts/cover_art/cover_art.ts";
import * as releaseCoverArtContract from "./contracts/release_cover_art/release_cover_art.ts";
import * as releaseCreditsContract from "./contracts/release_credits/release_credits.ts";

/** Everything {@link Miso.layer} (and {@link Miso.layerConfig}) can fail with, at build time. */
export type MisoLayerError =
  | MisoNetworkMismatchError
  | MisoChainIdentifierMismatchError
  | MusicosDeploymentInvalid
  | PartyosDeploymentError;

// ── `bindModulePackage`: the allow-listed generated-call binder `call` uses ──
//
// Distinct from `party/client.ts`'s own helper of the same name (that one
// takes a deny-list and defaults to "everything"); this one is `client.ts`'s
// predecessor helper, moved here verbatim — an explicit allow-list so a
// reference-returning, UID-only, or package-internal constructor never
// appears on this executable facade.
type BoundMoveFunction<F> = F extends (options: infer Options) => infer Result
  ? Options extends { package?: unknown }
    ? (options: Omit<Options, "package">) => Result
    : F
  : F;
type BoundModule<M extends object, Available extends readonly (keyof M)[]> = {
  [Key in Available[number]]: BoundMoveFunction<M[Key]>;
};

function bindModulePackage<M extends object, K extends readonly (keyof M)[]>(mod: M, pkg: string, available: K): BoundModule<M, K> {
  const out: Record<string, unknown> = {};
  for (const key of available) {
    const value = (mod as Record<PropertyKey, unknown>)[key];
    out[String(key)] = typeof value === "function" ? (options: { package?: string }) => (value as (o: unknown) => unknown)({ ...options, package: pkg }) : value;
  }
  return out as BoundModule<M, K>;
}

/** Every function-valued member of `surface` throws `guard()`'s error before running, when it throws. */
function gateAvailability<T extends object>(surface: T, guard: () => void): T {
  return new Proxy(surface, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        guard();
        return Reflect.apply(value, target, args);
      };
    },
  });
}

function requiredPackage(id: string | undefined, field: string, operation: string): string {
  if (!id) throw new Error(`@misofm/platform: deployment.packages.${field} is required for ${operation}.`);
  return id;
}

/** Params with the ids the deployment already supplies dropped from the call site. */
type DistributiveOmit<T, Keys extends PropertyKey> = T extends unknown ? Omit<T, Keys> : never;
type Configured<T> = DistributiveOmit<T, "recordPackageId" | "recordShopPackageId">;
type ConfiguredPublish<T> = DistributiveOmit<T, "misoPackageId" | "minatoPackageId">;
type ConfiguredRelease<T> = DistributiveOmit<T, "misoPackageId" | "minatoPackageId" | "releaseRegistryId">;
type ConfiguredReleaseKind = DistributiveOmit<SetReleaseKindParams, "releaseKindPackageId">;
type ConfiguredReleaseDescription = DistributiveOmit<SetReleaseDescriptionParams, "releaseDescriptionPackageId">;
type ConfiguredReleaseGenres = DistributiveOmit<SetReleaseGenresParams, "releaseGenrePackageId">;
type ConfiguredRecordingGenres = DistributiveOmit<SetRecordingGenresParams, "recordingGenrePackageId">;
type ConfiguredClearReleaseGenres = DistributiveOmit<ClearReleaseGenresParams, "releaseGenrePackageId">;
type ConfiguredClearRecordingGenres = DistributiveOmit<ClearRecordingGenresParams, "recordingGenrePackageId">;
type ConfiguredReleaseDspLinks = DistributiveOmit<SetReleaseDspLinksParams, "releaseDspLinkPackageId">;
type ConfiguredReleaseCredit = DistributiveOmit<AddReleaseCreditParams, "releaseCreditsPackageId" | "misoCreditPackageId">;
type ConfiguredReleaseCover = DistributiveOmit<SetReleaseCoverParams, "coverArtPackageId" | "releaseCoverArtPackageId" | "oriPackageId">;
type ConfiguredReleaseTrackCover = DistributiveOmit<SetReleaseTrackCoverParams, "coverArtPackageId" | "releaseCoverArtPackageId" | "oriPackageId">;
type ConfiguredRecordingStreamingTranscode = DistributiveOmit<SetRecordingStreamingTranscodeParams, "recordingStreamingTranscodePackageId" | "oriPackageId">;
type ConfiguredUnsetRecordingStreamingTranscode = DistributiveOmit<UnsetRecordingStreamingTranscodeParams, "recordingStreamingTranscodePackageId">;
/** Whole-graph params with this deployment's package ids dropped. */
export type ConfiguredReleaseGraphParams = Omit<PublishReleaseGraphParams, "misoPackageId" | "minatoPackageId">;

/** The 7 sales reads plus PTB builders, bound to `deployment.recordSales` (`RecordSalesUnavailableError` when unavailable). */
export type MisoSalesTx = {
  readonly purchaseRecord: (p: Configured<PurchaseRecordParams>) => TxThunk;
  readonly openPressing: (p: Configured<OpenPressingParams>) => TxThunk;
  readonly openListing: (p: Configured<OpenListingParams>) => TxThunk;
  readonly authorizeRecordShop: (p: Configured<PressingAdministrationParams>) => TxThunk;
  readonly revokeRecordShop: (p: Configured<PressingAdministrationParams>) => TxThunk;
  readonly setListingPrice: (p: Configured<SetListingPriceParams>) => TxThunk;
  readonly setListingState: (p: Configured<SetListingStateParams>) => TxThunk;
};

export type MisoTx = MisoSalesTx & {
  readonly publishShareCurrency: typeof publishShareCurrency;
  readonly initializeShareCurrency: typeof initializeShareCurrency;
  readonly publishComposition: (p: ConfiguredPublish<PublishCompositionParams>) => TxThunk;
  readonly publishRecording: (p: ConfiguredPublish<PublishRecordingParams>) => TxThunk;
  readonly publishCompositionAndRecording: (p: ConfiguredPublish<PublishCompositionAndRecordingParams>) => TxThunk;
  readonly publishRelease: (p: ConfiguredRelease<PublishReleaseParams>) => TxThunk;
  readonly publishReleaseGraph: (p: ConfiguredReleaseGraphParams) => TxThunk;
  readonly setReleaseKind: (p: ConfiguredReleaseKind) => TxThunk;
  readonly setReleaseDescription: (p: ConfiguredReleaseDescription) => TxThunk;
  readonly setReleaseGenres: (p: ConfiguredReleaseGenres) => TxThunk;
  readonly clearReleaseGenres: (p: ConfiguredClearReleaseGenres) => TxThunk;
  readonly setReleaseDspLinks: (p: ConfiguredReleaseDspLinks) => TxThunk;
  readonly addReleaseCredit: (p: ConfiguredReleaseCredit) => TxThunk;
  readonly setReleaseCover: (p: ConfiguredReleaseCover) => TxThunk;
  readonly setReleaseTrackCover: (p: ConfiguredReleaseTrackCover) => TxThunk;
  readonly setRecordingStreamingTranscode: (p: ConfiguredRecordingStreamingTranscode) => TxThunk;
  readonly unsetRecordingStreamingTranscode: (p: ConfiguredUnsetRecordingStreamingTranscode) => TxThunk;
  readonly setRecordingGenres: (p: ConfiguredRecordingGenres) => TxThunk;
  readonly clearRecordingGenres: (p: ConfiguredClearRecordingGenres) => TxThunk;
};

export type MisoIds = {
  readonly pressing: (releaseId: string, edition: number) => string;
  readonly pressingAdminCap: (pressingId: string) => string;
  readonly record: (pressingId: string, number: number) => string;
  readonly listing: (pressingId: string, currencyType: string) => string;
  readonly sale: (releaseId: string, edition: number, currencyType: string) => { pressingId: string; listingId: string };
  readonly vault: (capId: string, capType: string) => string;
  readonly vaultAdminCap: (vaultId: string) => string;
  readonly genre: (canonicalName: string) => string;
};

/** Generated Move-call bindings, gated by which parts of the deployment are configured — `undefined` when their package isn't. */
export type MisoCall = {
  readonly record: ReturnType<typeof bindModulePackage<typeof recordContract, readonly ["destroy", "releaseId", "pressingId", "edition", "number", "purchaseCurrency", "purchasePrice", "purchasedBy", "purchasedTimestampMs", "deriveAddress"]>> | undefined;
  readonly listing:
    | ReturnType<
        typeof bindModulePackage<
          typeof listingContract,
          readonly ["fixed", "floor", "enabled", "disabled", "setState", "setPrice", "purchase", "deriveAddress", "releaseId", "pressingId", "pricing", "price", "state", "isEnabled", "isDisabled", "isFixed", "isFloor"]
        >
      >
    | undefined;
  readonly pressing: ReturnType<typeof bindModulePackage<typeof pressingContract, readonly ["authorizeDistributor", "revokeDistributor", "deriveAddress", "deriveAdminCapAddress", "releaseId", "edition", "supply", "maxSupply", "distributors", "isDistributorAuthorized", "pressingId"]>> | undefined;
  readonly genre: ReturnType<typeof bindModulePackage<typeof genreContract, readonly ["deriveAddress"]>>;
  readonly releaseDescription: ReturnType<typeof bindModulePackage<typeof releaseDescriptionContract, readonly ["setDescription", "clearDescription", "hasDescription"]>>;
  readonly releaseDspLink: ReturnType<
    typeof bindModulePackage<
      typeof releaseDspLinkContract,
      readonly [
        "platform", "platformSpotify", "platformAppleMusic", "platformAmazonMusic", "platformBandcamp", "platformDeezer", "platformSoundcloud", "platformTidal", "platformYoutubeMusic",
        "newSpotify", "newAppleMusicAlbum", "newAppleMusicTrack", "newAmazonMusicAlbum", "newAmazonMusicTrack", "newBandcamp", "newDeezer", "newSoundcloud", "newTidal", "newYoutubeMusic",
        "setReleaseLink", "clearReleaseLink", "setTrackLink", "clearTrackLink", "clearTrackLinks", "hasReleaseLink",
      ]
    >
  >;
  readonly releaseGenre: ReturnType<typeof bindModulePackage<typeof releaseGenreContract, readonly ["addGenre", "removeGenre", "clearGenres"]>>;
  readonly releaseKind: ReturnType<typeof bindModulePackage<typeof releaseKindContract, readonly ["setKind", "unsetKind", "hasKind"]>>;
  readonly releaseRevenueDistributor: ReturnType<typeof bindModulePackage<typeof releaseRevenueDistributorContract, readonly ["redeemAndDistribute", "redeemAllAndDistribute", "receiveAndDistribute"]>> | undefined;
  readonly releaseRevenueDistributorPlugin: ReturnType<typeof bindModulePackage<typeof releaseRevenueDistributorPluginContract, readonly ["install", "uninstall", "redeemAllAndDistribute", "receiveAndDistribute", "isInstalled"]>> | undefined;
  readonly vault: ReturnType<typeof bindModulePackage<typeof vaultContract, readonly ["share", "withdrawCap", "restoreCap", "derivedAddress", "capId", "isActive", "authorizedPlugins", "isPluginAuthorized"]>> | undefined;
  readonly compositionRoyaltyPool: ReturnType<typeof bindModulePackage<typeof compositionRoyaltyPoolContract, readonly ["newPool", "receiveAndDeposit", "redeemAndDeposit", "poolAddress"]>> | undefined;
  readonly compositionRoyaltyPoolPlugin: ReturnType<typeof bindModulePackage<typeof compositionRoyaltyPoolPluginContract, readonly ["install", "uninstall", "receiveAndDeposit", "redeemAndDeposit", "isInstalled"]>> | undefined;
  readonly recordingRoyaltyPool: ReturnType<typeof bindModulePackage<typeof recordingRoyaltyPoolContract, readonly ["newPool", "receiveAndDeposit", "redeemAndDeposit", "poolAddress"]>> | undefined;
  readonly recordingRoyaltyPoolPlugin: ReturnType<typeof bindModulePackage<typeof recordingRoyaltyPoolPluginContract, readonly ["install", "uninstall", "receiveAndDeposit", "redeemAndDeposit", "isInstalled"]>> | undefined;
  readonly partyWallet: ReturnType<typeof bindModulePackage<typeof partyWalletContract, readonly ["receive", "receiveBalance", "redeemBalance", "inboxAddress"]>> | undefined;
  readonly compositionRoutedStake: ReturnType<typeof bindModulePackage<typeof compositionRoutedStakeContract, readonly ["createStake", "register", "unregister", "unstake", "restake", "stakeAddress"]>> | undefined;
  readonly routedStake: ReturnType<typeof bindModulePackage<typeof routedStakeContract, readonly ["share", "register", "unregister", "sweep", "unstake", "restake", "derivedAddress"]>>;
  readonly royaltyPool: ReturnType<
    typeof bindModulePackage<
      typeof royaltyPoolContract,
      readonly ["share", "deposit", "settle", "recoverCoins", "registerStake", "unregisterStake", "claimRewards", "pendingRewards", "stakedShares", "cumulativeRewardPerShare", "carry", "cumulativeDeposits", "settledValue", "derivedAddress", "assertDerivedFrom"]
    >
  >;
  readonly recordingAdvisory: ReturnType<typeof bindModulePackage<typeof recordingAdvisoryContract, readonly ["explicit", "notExplicit", "cleaned", "setRating", "unsetRating", "hasRating", "isExplicit", "isNotExplicit", "isCleaned"]>>;
  readonly recordingLanguage: ReturnType<typeof bindModulePackage<typeof recordingLanguageContract, readonly ["setLanguages", "setInstrumental", "unsetLanguages", "hasLanguages", "isInstrumental"]>>;
  readonly recordingMasterReference: ReturnType<typeof bindModulePackage<typeof recordingMasterReferenceContract, readonly ["setMasterReference", "unsetMasterReference", "hasMasterReference"]>>;
  readonly recordingStreamingTranscode: ReturnType<typeof bindModulePackage<typeof recordingStreamingTranscodeContract, readonly ["setStreamingTranscode", "unsetStreamingTranscode", "hasStreamingTranscode"]>> | undefined;
  readonly recordingGenre: ReturnType<typeof bindModulePackage<typeof recordingGenreContract, readonly ["addGenre", "removeGenre", "clearGenres"]>> | undefined;
  readonly coverArt: ReturnType<typeof bindModulePackage<typeof coverArtContract, readonly []>>;
  readonly releaseCoverArt: ReturnType<typeof bindModulePackage<typeof releaseCoverArtContract, readonly ["setCover", "unsetCover", "setTrackCover", "unsetTrackCover", "hasCoverArt"]>>;
  readonly releaseCredits: ReturnType<typeof bindModulePackage<typeof releaseCreditsContract, readonly ["addCredit", "removeCredit", "hasCredits"]>>;
};

/** Generated BCS definitions, for parsing objects or events yourself. */
export type MisoBcs = {
  readonly Record: typeof recordContract.Record;
  readonly Pressing: typeof pressingContract.Pressing;
  readonly PressingAdminCap: typeof pressingContract.PressingAdminCap;
  readonly Listing: typeof listingContract.Listing;
  readonly Pricing: typeof listingContract.Pricing;
  readonly ListingState: typeof listingContract.State;
  readonly RecordCreatedEvent: typeof recordContract.RecordCreatedEvent;
  readonly RecordDestroyedEvent: typeof recordContract.RecordDestroyedEvent;
  readonly PressingCreatedEvent: typeof pressingContract.PressingCreatedEvent;
  readonly DistributorAuthorizedEvent: typeof pressingContract.DistributorAuthorizedEvent;
  readonly DistributorRevokedEvent: typeof pressingContract.DistributorRevokedEvent;
  readonly RecordPurchasedEvent: typeof pressingContract.RecordPurchasedEvent;
  readonly PressingSharedEvent: typeof pressingContract.PressingSharedEvent;
  readonly PressingDistributorAuthorizedEvent: typeof pressingContract.PressingDistributorAuthorizedEvent;
  readonly PressingDistributorRevokedEvent: typeof pressingContract.PressingDistributorRevokedEvent;
  readonly ListingCreatedEvent: typeof listingContract.ListingCreatedEvent;
  readonly ListingSharedEvent: typeof listingContract.ListingSharedEvent;
  readonly ListingPriceChangedEvent: typeof listingContract.ListingPriceChangedEvent;
  readonly ListingStateChangedEvent: typeof listingContract.ListingStateChangedEvent;
  readonly RecordSoldEvent: typeof listingContract.RecordSoldEvent;
  readonly VaultAdminCap: typeof vaultContract.VaultAdminCap;
  readonly VaultRegistry: typeof vaultContract.VaultRegistry;
  readonly VaultKey: typeof vaultContract.VaultKey;
  readonly VaultAdminCapKey: typeof vaultContract.VaultAdminCapKey;
  readonly VaultCreatedEvent: typeof vaultContract.VaultCreatedEvent;
  readonly VaultRegistryCreatedEvent: typeof vaultContract.VaultRegistryCreatedEvent;
  readonly VaultSharedEvent: typeof vaultContract.VaultSharedEvent;
  readonly PluginAuthorizedEvent: typeof vaultContract.PluginAuthorizedEvent;
  readonly PluginRevokedEvent: typeof vaultContract.PluginRevokedEvent;
  readonly VaultCapabilityWithdrawnEvent: typeof vaultContract.VaultCapabilityWithdrawnEvent;
  readonly VaultCapabilityRestoredEvent: typeof vaultContract.VaultCapabilityRestoredEvent;
  readonly VaultCapabilityBorrowedByPluginEvent: typeof vaultContract.VaultCapabilityBorrowedByPluginEvent;
  readonly VaultCapabilityBorrowedByAdminEvent: typeof vaultContract.VaultCapabilityBorrowedByAdminEvent;
  readonly VaultCapabilityReturnedEvent: typeof vaultContract.VaultCapabilityReturnedEvent;
  readonly PartyObjectReceivedEvent: typeof partyWalletContract.ObjectReceivedEvent;
  readonly PartyCoinsReceivedEvent: typeof partyWalletContract.CoinsReceivedEvent;
  readonly PartyFundsRedeemedEvent: typeof partyWalletContract.FundsRedeemedEvent;
  readonly ReleaseTrackRevenueDistributedEvent: typeof releaseRevenueDistributorContract.ReleaseTrackRevenueDistributedEvent;
  readonly ReleaseRevenueDistributedEvent: typeof releaseRevenueDistributorContract.ReleaseRevenueDistributedEvent;
  readonly ReleaseCoinsReceivedEvent: typeof releaseRevenueDistributorContract.ReleaseCoinsReceivedEvent;
  readonly ReleaseFundsRedeemedEvent: typeof releaseRevenueDistributorContract.ReleaseFundsRedeemedEvent;
};

/**
 * `vault.ts`'s builders, `getVaultAdminCap`, and `resolveReceivingCoins`,
 * always present as an object (unlike the predecessor's
 * `client.miso.vault: typeof vaultActions | undefined`) — every member
 * throws {@link OperationsUnavailableError} at call time when
 * `deployment.operations.status !== "available"`, per the issue's migration
 * map ("callers that tested `if (client.miso.vault)` must test
 * `deployment.operations.status`").
 */
export type MisoVault = Omit<typeof vaultActions, "getVaultAdminCap" | "resolveReceivingCoins"> & {
  readonly getVaultAdminCap: (vaultAdminCapId: string, capType: string) => Effect.Effect<vaultActions.VaultAdminCap | null, DecodeError | ObjectUnavailable | TransportError>;
  readonly resolveReceivingCoins: (coinIds: readonly string[]) => Effect.Effect<vaultActions.ReceivingObjectRef[], TransportError>;
};

const make =(deployment: MisoPlatformDeployment): Effect.Effect<MisoService, MisoNetworkMismatchError | MisoChainIdentifierMismatchError, Sui | SuiGraphQL | Musicos | Partyos> =>
  Effect.gen(function* () {
    const sui = yield* Sui;
    // The exact-ledger check `MisoPlatformClient#ready()` used to perform at
    // first use, moved to layer build (the issue's target shape: "a
    // caller's first call builds the runtime; a mismatch rejects it with
    // MisoChainIdentifierMismatchError instead of ready()").
    if (sui.network !== deployment.network) {
      return yield* new MisoNetworkMismatchError({ clientNetwork: sui.network, deploymentNetwork: deployment.network });
    }
    if (sui.chainId !== deployment.chainIdentifier) {
      return yield* new MisoChainIdentifierMismatchError({ actual: sui.chainId, expected: deployment.chainIdentifier });
    }
    const protocol = yield* Musicos;
    const partyos = yield* Partyos;
    const graphql = yield* SuiGraphQL;
    return assemble(sui, graphql, protocol, partyos, deployment);
  });

/** `make`, without the exact-chain check — what {@link Miso.layerTest} builds over. */
const makeUnchecked = (deployment: MisoPlatformDeployment): Effect.Effect<MisoService, never, Sui | SuiGraphQL | Musicos | Partyos> =>
  Effect.gen(function* () {
    const sui = yield* Sui;
    const protocol = yield* Musicos;
    const partyos = yield* Partyos;
    const graphql = yield* SuiGraphQL;
    return { ...assemble(sui, graphql, protocol, partyos, deployment), chainId: sui.chainId };
  });

/**
 * Assembles the complete {@link MisoService} from the `Sui`/`SuiGraphQL` the
 * layer already holds, the converted `protocol`/`party` services, and
 * `deployment`. Every I/O member is `withSui`/`withEnv`-wrapped so `R` is
 * empty; every synchronous member closes over `deployment` directly instead
 * of a `#requireReady`-style gate — sui-effect's own `warm`/`$ready`
 * mechanism (`docs/extensions.md` §7) is what governs "real before the first
 * await" now, not a second, platform-specific readiness machine.
 */
function assemble(sui: SuiService, graphql: SuiGraphQLClient, protocol: MusicosService, partyosService: PartyosService, rawDeployment: MisoPlatformDeployment): MisoService {
  // Recursively frozen snapshot taken at layer-build time, matching the
  // predecessor `MisoPlatformClient`'s own guarantee ("later caller mutation
  // cannot retarget an existing client") — a custom deployment object the
  // caller keeps a reference to and mutates after `miso({ deployment })`
  // must not reach back into an already-built `Miso` instance.
  const deployment = immutableSnapshot(rawDeployment);
  const withSui = <A, E>(effect: Effect.Effect<A, E, Sui>): Effect.Effect<A, E> => effect.pipe(Effect.provideService(Sui, sui));
  /** `Sui` and `SuiGraphQL` both provided — safe even for a `Sui`-only effect (an unused service is simply not read). */
  const withEnv = <A, E>(effect: Effect.Effect<A, E, Sui | SuiGraphQL>): Effect.Effect<A, E> =>
    effect.pipe(Effect.provideService(Sui, sui), Effect.provideService(SuiGraphQL, graphql));

  const party = makeMisoParty(sui, partyosService, deployment.party);

  // ── Sales binding (RecordSalesUnavailableError when unavailable) ─────────
  const sales = (): Extract<RecordSalesDeployment, { status: "available" }> => requireRecordSalesDeployment(deployment.recordSales);
  const salesOrFail = (): Effect.Effect<Extract<RecordSalesDeployment, { status: "available" }>, RecordSalesUnavailableError> =>
    Effect.try({ try: sales, catch: (cause) => cause as RecordSalesUnavailableError });

  // ── Operations binding (OperationsUnavailableError when unavailable) ─────
  const operations = (): AvailableOperationsDeployment => requireOperationsDeployment(deployment.operations);
  const availableOperations = (): AvailableOperationsDeployment | undefined => (deployment.operations.status === "available" ? requireOperationsDeployment(deployment.operations) : undefined);

  // ── Reads ─────────────────────────────────────────────────────────────
  const misoGetPressing = (pressingId: string): Effect.Effect<Pressing | null, DecodeError | ObjectUnavailable | TransportError | RecordSalesUnavailableError> =>
    withSui(Effect.flatMap(salesOrFail(), (s) => getPressing(pressingId, s.recordPackageId)));
  const misoGetListing = (listingId: string): Effect.Effect<Listing | null, DecodeError | ObjectUnavailable | TransportError | RecordSalesUnavailableError> =>
    withSui(Effect.flatMap(salesOrFail(), (s) => getListing(listingId, s.recordShopPackageId)));
  const misoGetRecord = (recordId: string): Effect.Effect<PressingRecord | null, DecodeError | ObjectUnavailable | TransportError | RecordSalesUnavailableError> =>
    withSui(Effect.flatMap(salesOrFail(), (s) => getRecord(recordId, s.recordPackageId)));
  const misoGetSale = (
    p: Configured<GetSaleParams>,
  ): Effect.Effect<{ pressing: Pressing | null; listing: Listing | null }, DecodeError | ObjectDeleted | ObjectUnavailable | TransportError | RecordSalesUnavailableError> =>
    withSui(
      Effect.flatMap(salesOrFail(), (s) =>
        getSale({ ...p, recordPackageId: s.recordPackageId, recordShopPackageId: s.recordShopPackageId }),
      ),
    );

  // ── Address math (`ids.*`, sync — throws RecordSalesUnavailableError/OperationsUnavailableError) ──
  const ids: MisoIds = {
    pressing: (releaseId, edition) => derivePressingId(releaseId, edition, sales().recordPackageId),
    pressingAdminCap: (pressingId) => derivePressingAdminCapId(pressingId, sales().recordPackageId),
    record: (pressingId, number) => deriveRecordId(pressingId, number, sales().recordPackageId),
    listing: (pressingId, currencyType) => deriveListingId(pressingId, currencyType, sales().recordShopPackageId),
    sale: (releaseId, edition, currencyType) => deriveSaleIds(releaseId, edition, currencyType, sales().recordPackageId, sales().recordShopPackageId),
    vault: (capId, capType) => vaultActions.deriveVaultId({ vaultRegistryId: operations().vault.registryId, capId, capType, vaultPackageId: operations().vault.packageId }),
    vaultAdminCap: (vaultId) => vaultActions.deriveVaultAdminCapId(vaultId, operations().vault.packageId),
    genre: (canonicalName) => deriveGenreAddress(deployment.objects.genreRegistry, deployment.packages.genre, canonicalName),
  };

  // ── Transaction builders (`tx.*`, sync recipes) ──────────────────────────
  const tx: MisoTx = {
    purchaseRecord: (p) => purchaseRecord({ ...p, recordPackageId: sales().recordPackageId, recordShopPackageId: sales().recordShopPackageId }),
    openPressing: (p) => openPressing({ ...p, recordPackageId: sales().recordPackageId, recordShopPackageId: sales().recordShopPackageId }),
    openListing: (p) => openListing({ ...p, recordShopPackageId: sales().recordShopPackageId }),
    authorizeRecordShop: (p) => authorizeRecordShop({ ...p, recordPackageId: sales().recordPackageId, recordShopPackageId: sales().recordShopPackageId }),
    revokeRecordShop: (p) => revokeRecordShop({ ...p, recordPackageId: sales().recordPackageId, recordShopPackageId: sales().recordShopPackageId }),
    setListingPrice: (p) => setListingPrice({ ...p, recordShopPackageId: sales().recordShopPackageId }),
    setListingState: (p) => setListingState({ ...p, recordShopPackageId: sales().recordShopPackageId }),

    publishShareCurrency,
    initializeShareCurrency,
    publishComposition: (p) => publishComposition({ ...p, misoPackageId: deployment.protocol.musicos, minatoPackageId: deployment.packages.minato }),
    publishRecording: (p) => publishRecording({ ...p, misoPackageId: deployment.protocol.musicos, minatoPackageId: deployment.packages.minato }),
    publishCompositionAndRecording: (p) => publishCompositionAndRecording({ ...p, misoPackageId: deployment.protocol.musicos, minatoPackageId: deployment.packages.minato }),
    publishRelease: (p) => publishRelease({ ...p, misoPackageId: deployment.protocol.musicos, releaseRegistryId: deployment.objects.releaseRegistry }),
    publishReleaseGraph: (p) => publishReleaseGraph({ ...p, misoPackageId: deployment.protocol.musicos, minatoPackageId: deployment.packages.minato }),
    setReleaseKind: (p) => setReleaseKind({ ...p, releaseKindPackageId: deployment.packages.releaseKind }),
    setReleaseDescription: (p) => setReleaseDescription({ ...p, releaseDescriptionPackageId: deployment.packages.releaseDescription }),
    setReleaseGenres: (p) => setReleaseGenres({ ...p, releaseGenrePackageId: deployment.packages.releaseGenre }),
    clearReleaseGenres: (p) => clearReleaseGenres({ ...p, releaseGenrePackageId: deployment.packages.releaseGenre }),
    setReleaseDspLinks: (p) => setReleaseDspLinks({ ...p, releaseDspLinkPackageId: deployment.packages.releaseDspLink }),
    addReleaseCredit: (p) => addReleaseCredit({ ...p, releaseCreditsPackageId: deployment.packages.releaseCredits, misoCreditPackageId: deployment.packages.credit }),
    setReleaseCover: (p) => setReleaseCover({ ...p, coverArtPackageId: deployment.packages.coverArt, releaseCoverArtPackageId: deployment.packages.releaseCoverArt, oriPackageId: deployment.packages.ori }),
    setReleaseTrackCover: (p) => setReleaseTrackCover({ ...p, coverArtPackageId: deployment.packages.coverArt, releaseCoverArtPackageId: deployment.packages.releaseCoverArt, oriPackageId: deployment.packages.ori }),
    setRecordingStreamingTranscode: (p) =>
      setRecordingStreamingTranscode({
        ...p,
        recordingStreamingTranscodePackageId: requiredPackage(deployment.packages.recordingStreamingTranscode, "recordingStreamingTranscode", "setRecordingStreamingTranscode"),
        oriPackageId: deployment.packages.ori,
      }),
    unsetRecordingStreamingTranscode: (p) =>
      unsetRecordingStreamingTranscode({ ...p, recordingStreamingTranscodePackageId: requiredPackage(deployment.packages.recordingStreamingTranscode, "recordingStreamingTranscode", "unsetRecordingStreamingTranscode") }),
    setRecordingGenres: (p) => setRecordingGenres({ ...p, recordingGenrePackageId: requiredPackage(deployment.packages.recordingGenre, "recordingGenre", "setRecordingGenres") }),
    clearRecordingGenres: (p) => clearRecordingGenres({ ...p, recordingGenrePackageId: requiredPackage(deployment.packages.recordingGenre, "recordingGenre", "clearRecordingGenres") }),
  };

  // ── Generated call/bcs bindings ──────────────────────────────────────────
  const availableSales = deployment.recordSales.status === "available" ? deployment.recordSales : undefined;
  const ops = availableOperations();
  const call: MisoCall = {
    record: availableSales
      ? bindModulePackage(recordContract, availableSales.recordPackageId, [
          "destroy", "releaseId", "pressingId", "edition", "number", "purchaseCurrency", "purchasePrice", "purchasedBy", "purchasedTimestampMs", "deriveAddress",
        ] as const)
      : undefined,
    listing: availableSales
      ? bindModulePackage(listingContract, availableSales.recordShopPackageId, [
          "fixed", "floor", "enabled", "disabled", "setState", "setPrice", "purchase", "deriveAddress", "releaseId", "pressingId", "pricing", "price", "state", "isEnabled", "isDisabled", "isFixed", "isFloor",
        ] as const)
      : undefined,
    pressing: availableSales
      ? bindModulePackage(pressingContract, availableSales.recordPackageId, [
          "authorizeDistributor", "revokeDistributor", "deriveAddress", "deriveAdminCapAddress", "releaseId", "edition", "supply", "maxSupply", "distributors", "isDistributorAuthorized", "pressingId",
        ] as const)
      : undefined,
    genre: bindModulePackage(genreContract, deployment.packages.genre, ["deriveAddress"] as const),
    releaseDescription: bindModulePackage(releaseDescriptionContract, deployment.packages.releaseDescription, ["setDescription", "clearDescription", "hasDescription"] as const),
    releaseDspLink: bindModulePackage(releaseDspLinkContract, deployment.packages.releaseDspLink, [
      "platform", "platformSpotify", "platformAppleMusic", "platformAmazonMusic", "platformBandcamp", "platformDeezer", "platformSoundcloud", "platformTidal", "platformYoutubeMusic",
      "newSpotify", "newAppleMusicAlbum", "newAppleMusicTrack", "newAmazonMusicAlbum", "newAmazonMusicTrack", "newBandcamp", "newDeezer", "newSoundcloud", "newTidal", "newYoutubeMusic",
      "setReleaseLink", "clearReleaseLink", "setTrackLink", "clearTrackLink", "clearTrackLinks", "hasReleaseLink",
    ] as const),
    releaseGenre: bindModulePackage(releaseGenreContract, deployment.packages.releaseGenre, ["addGenre", "removeGenre", "clearGenres"] as const),
    releaseKind: bindModulePackage(releaseKindContract, deployment.packages.releaseKind, ["setKind", "unsetKind", "hasKind"] as const),
    releaseRevenueDistributor: ops
      ? bindModulePackage(releaseRevenueDistributorContract, ops.actions.releaseRevenueDistributor, ["redeemAndDistribute", "redeemAllAndDistribute", "receiveAndDistribute"] as const)
      : undefined,
    releaseRevenueDistributorPlugin: ops
      ? bindModulePackage(releaseRevenueDistributorPluginContract, ops.plugins.releaseRevenueDistributor, ["install", "uninstall", "redeemAllAndDistribute", "receiveAndDistribute", "isInstalled"] as const)
      : undefined,
    vault: ops
      ? bindModulePackage(vaultContract, ops.vault.packageId, ["share", "withdrawCap", "restoreCap", "derivedAddress", "capId", "isActive", "authorizedPlugins", "isPluginAuthorized"] as const)
      : undefined,
    compositionRoyaltyPool: ops
      ? bindModulePackage(compositionRoyaltyPoolContract, ops.actions.compositionRoyaltyPool, ["newPool", "receiveAndDeposit", "redeemAndDeposit", "poolAddress"] as const)
      : undefined,
    compositionRoyaltyPoolPlugin: ops
      ? bindModulePackage(compositionRoyaltyPoolPluginContract, ops.plugins.compositionRoyaltyPool, ["install", "uninstall", "receiveAndDeposit", "redeemAndDeposit", "isInstalled"] as const)
      : undefined,
    recordingRoyaltyPool: ops
      ? bindModulePackage(recordingRoyaltyPoolContract, ops.actions.recordingRoyaltyPool, ["newPool", "receiveAndDeposit", "redeemAndDeposit", "poolAddress"] as const)
      : undefined,
    recordingRoyaltyPoolPlugin: ops
      ? bindModulePackage(recordingRoyaltyPoolPluginContract, ops.plugins.recordingRoyaltyPool, ["install", "uninstall", "receiveAndDeposit", "redeemAndDeposit", "isInstalled"] as const)
      : undefined,
    partyWallet: ops ? bindModulePackage(partyWalletContract, ops.actions.partyWallet, ["receive", "receiveBalance", "redeemBalance", "inboxAddress"] as const) : undefined,
    compositionRoutedStake: ops
      ? bindModulePackage(compositionRoutedStakeContract, ops.actions.compositionRoutedStake, ["createStake", "register", "unregister", "unstake", "restake", "stakeAddress"] as const)
      : undefined,
    routedStake: bindModulePackage(routedStakeContract, deployment.packages.routedStake, ["share", "register", "unregister", "sweep", "unstake", "restake", "derivedAddress"] as const),
    royaltyPool: bindModulePackage(royaltyPoolContract, deployment.packages.royaltyPool, [
      "share", "deposit", "settle", "recoverCoins", "registerStake", "unregisterStake", "claimRewards", "pendingRewards", "stakedShares", "cumulativeRewardPerShare", "carry", "cumulativeDeposits", "settledValue", "derivedAddress", "assertDerivedFrom",
    ] as const),
    recordingAdvisory: bindModulePackage(recordingAdvisoryContract, deployment.packages.recordingAdvisory, ["explicit", "notExplicit", "cleaned", "setRating", "unsetRating", "hasRating", "isExplicit", "isNotExplicit", "isCleaned"] as const),
    recordingLanguage: bindModulePackage(recordingLanguageContract, deployment.packages.recordingLanguage, ["setLanguages", "setInstrumental", "unsetLanguages", "hasLanguages", "isInstrumental"] as const),
    recordingMasterReference: bindModulePackage(recordingMasterReferenceContract, deployment.packages.recordingMasterReference, ["setMasterReference", "unsetMasterReference", "hasMasterReference"] as const),
    recordingStreamingTranscode: deployment.packages.recordingStreamingTranscode
      ? bindModulePackage(recordingStreamingTranscodeContract, deployment.packages.recordingStreamingTranscode, ["setStreamingTranscode", "unsetStreamingTranscode", "hasStreamingTranscode"] as const)
      : undefined,
    recordingGenre: deployment.packages.recordingGenre ? bindModulePackage(recordingGenreContract, deployment.packages.recordingGenre, ["addGenre", "removeGenre", "clearGenres"] as const) : undefined,
    coverArt: bindModulePackage(coverArtContract, deployment.packages.coverArt, [] as const),
    releaseCoverArt: bindModulePackage(releaseCoverArtContract, deployment.packages.releaseCoverArt, ["setCover", "unsetCover", "setTrackCover", "unsetTrackCover", "hasCoverArt"] as const),
    releaseCredits: bindModulePackage(releaseCreditsContract, deployment.packages.releaseCredits, ["addCredit", "removeCredit", "hasCredits"] as const),
  };

  const bcs: MisoBcs = {
    Record: recordContract.Record,
    Pressing: pressingContract.Pressing,
    PressingAdminCap: pressingContract.PressingAdminCap,
    Listing: listingContract.Listing,
    Pricing: listingContract.Pricing,
    ListingState: listingContract.State,
    RecordCreatedEvent: recordContract.RecordCreatedEvent,
    RecordDestroyedEvent: recordContract.RecordDestroyedEvent,
    PressingCreatedEvent: pressingContract.PressingCreatedEvent,
    DistributorAuthorizedEvent: pressingContract.DistributorAuthorizedEvent,
    DistributorRevokedEvent: pressingContract.DistributorRevokedEvent,
    RecordPurchasedEvent: pressingContract.RecordPurchasedEvent,
    PressingSharedEvent: pressingContract.PressingSharedEvent,
    PressingDistributorAuthorizedEvent: pressingContract.PressingDistributorAuthorizedEvent,
    PressingDistributorRevokedEvent: pressingContract.PressingDistributorRevokedEvent,
    ListingCreatedEvent: listingContract.ListingCreatedEvent,
    ListingSharedEvent: listingContract.ListingSharedEvent,
    ListingPriceChangedEvent: listingContract.ListingPriceChangedEvent,
    ListingStateChangedEvent: listingContract.ListingStateChangedEvent,
    RecordSoldEvent: listingContract.RecordSoldEvent,
    VaultAdminCap: vaultContract.VaultAdminCap,
    VaultRegistry: vaultContract.VaultRegistry,
    VaultKey: vaultContract.VaultKey,
    VaultAdminCapKey: vaultContract.VaultAdminCapKey,
    VaultCreatedEvent: vaultContract.VaultCreatedEvent,
    VaultRegistryCreatedEvent: vaultContract.VaultRegistryCreatedEvent,
    VaultSharedEvent: vaultContract.VaultSharedEvent,
    PluginAuthorizedEvent: vaultContract.PluginAuthorizedEvent,
    PluginRevokedEvent: vaultContract.PluginRevokedEvent,
    VaultCapabilityWithdrawnEvent: vaultContract.VaultCapabilityWithdrawnEvent,
    VaultCapabilityRestoredEvent: vaultContract.VaultCapabilityRestoredEvent,
    VaultCapabilityBorrowedByPluginEvent: vaultContract.VaultCapabilityBorrowedByPluginEvent,
    VaultCapabilityBorrowedByAdminEvent: vaultContract.VaultCapabilityBorrowedByAdminEvent,
    VaultCapabilityReturnedEvent: vaultContract.VaultCapabilityReturnedEvent,
    PartyObjectReceivedEvent: partyWalletContract.ObjectReceivedEvent,
    PartyCoinsReceivedEvent: partyWalletContract.CoinsReceivedEvent,
    PartyFundsRedeemedEvent: partyWalletContract.FundsRedeemedEvent,
    ReleaseTrackRevenueDistributedEvent: releaseRevenueDistributorContract.ReleaseTrackRevenueDistributedEvent,
    ReleaseRevenueDistributedEvent: releaseRevenueDistributorContract.ReleaseRevenueDistributedEvent,
    ReleaseCoinsReceivedEvent: releaseRevenueDistributorContract.ReleaseCoinsReceivedEvent,
    ReleaseFundsRedeemedEvent: releaseRevenueDistributorContract.ReleaseFundsRedeemedEvent,
  };

  // ── Vault namespace: always present; every member throws OperationsUnavailableError cold ──
  const vault: MisoVault = gateAvailability(
    {
      ...vaultActions,
      getVaultAdminCap: (vaultAdminCapId: string, capType: string) => withSui(vaultActions.getVaultAdminCap(vaultAdminCapId, { vaultPackageId: operations().vault.packageId, capType })),
      resolveReceivingCoins: (coinIds: readonly string[]) => withSui(vaultActions.resolveReceivingCoins(coinIds)),
    },
    () => {
      requireOperationsDeployment(deployment.operations);
    },
  ) as MisoVault;

  // ── Submissions ───────────────────────────────────────────────────────────
  const misoCreateShareCurrency = (params: Parameters<typeof createShareCurrency>[0], opts: RunOpts): Effect.Effect<ShareCurrency, RunError | UnexpectedEffects> => withSui(createShareCurrency(params, opts));
  const misoPublishShareCurrencies = (count: number, opts: Parameters<typeof publishShareCurrencies>[1]): Effect.Effect<{ packageIds: string[]; gasUsed: bigint }, RunError> => withSui(publishShareCurrencies(count, opts));
  const misoInitializeShareCurrencies = <E = never>(
    packageIds: readonly string[],
    metaOf: (packageId: string) => ShareCurrencyMeta,
    opts: Parameters<typeof initializeShareCurrencies<E>>[2],
  ): Effect.Effect<{ currencies: ShareCurrency[]; gasUsed: bigint }, RunError | E> => withSui(initializeShareCurrencies(packageIds, metaOf, opts));

  const misoPublishCatalog = (
    params: Omit<AtomicPublicationParams, "deployment">,
    opts: RunOpts,
  ): Effect.Effect<AtomicPublicationResult, RunError | UnexpectedEffects> => {
    const full: AtomicPublicationParams = { ...params, deployment };
    return withSui(Effect.map(Tx.run(publishAtomicCatalog(full), opts), (executed) => parseAtomicPublicationResult(full, executed)));
  };

  // ── `read.*`: the high-level views, config captured from this deployment ──
  const readConfig: MisoConfig = configFromDeployment(deployment);
  const read = {
    currencyInfo: readCatalog.currencyInfo,
    primaryArtistNames: readCatalog.primaryArtistNames,
    toTracks: readCatalog.toTracks,
    getPressingView: (pressingId: string) => withEnv(readCatalog.getPressingView(pressingId, readConfig)),
    getListingView: (pressingId: string, currencyType: string) => withEnv(readCatalog.getListingView(pressingId, currencyType, readConfig)),
    readReleaseCover: (releaseId: string) => withEnv(readCatalog.readReleaseCover(releaseId, readConfig)),
    getReleaseResources: (releaseId: string, include?: Parameters<typeof readCatalog.getReleaseResources>[2]) => withEnv(readCatalog.getReleaseResources(releaseId, readConfig, include)),
    getReleaseDetail: (releaseId: string, options?: Parameters<typeof readCatalog.getReleaseDetail>[2]) => withEnv(readCatalog.getReleaseDetail(releaseId, readConfig, options)),
    getTrackCredits: (releaseId: string) => withEnv(readCatalog.getTrackCredits(releaseId, readConfig)),
    getPressingDetail: (pressingId: string, options?: Parameters<typeof readCatalog.getPressingDetail>[2]) => withEnv(readCatalog.getPressingDetail(pressingId, readConfig, options)),
    getPressingSaleDetail: (pressingId: string, currencyType: string, options?: Parameters<typeof readCatalog.getPressingSaleDetail>[3]) =>
      withEnv(readCatalog.getPressingSaleDetail(pressingId, currencyType, readConfig, options)),
    getPressingPreview: (pressingId: string) => withEnv(readCatalog.getPressingPreview(pressingId, readConfig)),
    getSaleDetail: (releaseId: string, edition: number, currencyType: string, options?: Parameters<typeof readCatalog.getSaleDetail>[4]) =>
      withEnv(readCatalog.getSaleDetail(releaseId, edition, currencyType, readConfig, options)),
    getDiscoverShelf: () => withEnv(readCatalog.getDiscoverShelf(readConfig)),
    getRecordAlbum: (recordId: string, options?: Parameters<typeof readCatalog.getRecordAlbum>[2]) => withEnv(readCatalog.getRecordAlbum(recordId, readConfig, options)),

    partyAvatarUrl: (partyId: string) => readArtist.partyAvatarUrl(readConfig.apiBaseUrl, partyId),
    getArtistProfile: (partyId: string, options?: Parameters<typeof readArtist.getArtistProfile>[2]) => withEnv(readArtist.getArtistProfile(partyId, readConfig, options)),
    getPartySummaries: (ids: readonly string[]) => withEnv(readArtist.getPartySummaries(ids, readConfig)),

    resolveGenreNames: (genreIds: readonly string[]) => withSui(readGenres.resolveGenreNames(genreIds)),

    getBalance: (address: string, coinType?: string) => withSui(readWallet.getBalance(address, readConfig, coinType)),
    getOwnedParties: (owner: string) => withEnv(readWallet.getOwnedParties(owner, readConfig)),
    getPendingMemberships: (owner: string) => withEnv(readWallet.getPendingMemberships(owner, readConfig)),
    getOwnedRecords: (owner: string) => withEnv(readWallet.getOwnedRecords(owner, readConfig)),
    getOwnedWorks: (owner: string) => withEnv(readWallet.getOwnedWorks(owner, readConfig)),
    getWorkByCap: (capId: string) => withEnv(readWallet.getWorkByCap(capId, readConfig)),
    ownsParty: (address: string, partyId: string) => withEnv(readWallet.ownsParty(address, partyId, readConfig)),
    ownsRecord: (address: string, recordId: string) => withSui(readWallet.ownsRecord(address, recordId)),

    isRecordSoldEventType: readReceipts.isRecordSoldEventType,
    recordSoldCurrencyType: readReceipts.recordSoldCurrencyType,
    findRecordSales: readReceipts.findRecordSales,
    findRecordSale: readReceipts.findRecordSale,
    breakdown: readReceipts.breakdown,
    getPurchaseReceipts: (txDigest: string) => withEnv(readReceipts.getPurchaseReceipts(txDigest, readConfig)),
    getPurchaseReceipt: (txDigest: string, recordId: string) => withEnv(readReceipts.getPurchaseReceipt(txDigest, recordId, readConfig)),

    ROYALTY_CLAIMS_PAGE_LIMIT: readRoyalties.ROYALTY_CLAIMS_PAGE_LIMIT,
    royaltyClaimedEventType: () => readRoyalties.royaltyClaimedEventType(readConfig),
    listRoyaltyClaims: (address: string, options?: Parameters<typeof readRoyalties.listRoyaltyClaims>[2]) => withEnv(readRoyalties.listRoyaltyClaims(address, readConfig, options)),
  };

  return {
    deployment,
    network: deployment.network,
    chainId: deployment.chainIdentifier,
    protocol,
    party,

    getPressing: misoGetPressing,
    getListing: misoGetListing,
    getRecord: misoGetRecord,
    getSale: misoGetSale,
    ids,
    tx,
    call,
    bcs,
    vault,
    createShareCurrency: misoCreateShareCurrency,
    publishShareCurrencies: misoPublishShareCurrencies,
    initializeShareCurrencies: misoInitializeShareCurrencies,
    publishCatalog: misoPublishCatalog,
    read,
    events: platformEventParsers,
    /** @deprecated Warm-up compatibility member — see `docs/CONVERSION.md`; every member is already real once `warm`/`$ready()` resolved this runtime. */
    ready: Effect.void,
  };
}

export interface MisoService {
  /** The exact deployment this instance was built with. */
  readonly deployment: MisoPlatformDeployment;
  /** The network this deployment is for (`deployment.network`). */
  readonly network: MisoPlatformDeployment["network"];
  /** The chain identifier this instance was validated against (`deployment.chainIdentifier`). */
  readonly chainId: string;
  /**
   * The converted `@misofm/musicos` protocol service, always present.
   *
   * Typed as a mapped copy of `MusicosService`, not the interface itself:
   * sui-effect 0.1.0's `PromiseFace<S>` recurses only into members assignable
   * to `Record<string, unknown>`, and an `interface` (unlike a mapped type,
   * which resolves to a fresh object type) is not — so `client.miso.protocol`
   * would keep typing every member as `Effect`-returning while the derived
   * Promise face maps them to Promise-returning methods at runtime
   * (misofm/sdks#35 verification, A1; fixed on the 0.1.0 library's behaviour
   * here since `MusicosService` itself is not this package's to redeclare —
   * `@misofm/musicos`, not `@unconfirmed/sui-effect`, so 0.1.1's own
   * `PromiseFace` fix does not retroactively change this; this mapped-type
   * wrapping stays correct either way). See `docs/CONVERSION.md` "Stage 5".
   */
  readonly protocol: { readonly [K in keyof MusicosService]: MusicosService[K] };
  /** The party surface: `@misofm/partyos` core plus this package's own party extensions. */
  readonly party: MisoPartyService;

  /** The run itself, or `null` if this release has never opened one. Fails with `RecordSalesUnavailableError` when this deployment has no Record sales. */
  readonly getPressing: (pressingId: string) => Effect.Effect<Pressing | null, DecodeError | ObjectUnavailable | TransportError | RecordSalesUnavailableError>;
  /** One currency's offer, or `null` if the run does not sell in it. */
  readonly getListing: (listingId: string) => Effect.Effect<Listing | null, DecodeError | ObjectUnavailable | TransportError | RecordSalesUnavailableError>;
  /** One concrete purchased Record, including immutable purchase provenance. */
  readonly getRecord: (recordId: string) => Effect.Effect<PressingRecord | null, DecodeError | ObjectUnavailable | TransportError | RecordSalesUnavailableError>;
  /** Run + one currency's offer in a single round trip, by address math. */
  readonly getSale: (p: Configured<GetSaleParams>) => Effect.Effect<{ pressing: Pressing | null; listing: Listing | null }, DecodeError | ObjectDeleted | ObjectUnavailable | TransportError | RecordSalesUnavailableError>;

  /** Address math (sync); throws `RecordSalesUnavailableError`/`OperationsUnavailableError` when the relevant deployment section is unavailable. */
  readonly ids: MisoIds;
  /** PTB fragments (sync); throws the same errors as `ids.*` at build time for a gated builder. */
  readonly tx: MisoTx;
  /** Generated Move-call bindings, `undefined` for a section this deployment doesn't configure. */
  readonly call: MisoCall;
  /** Generated BCS structs, for parsing objects or events yourself. */
  readonly bcs: MisoBcs;
  /** Vault/Action/plugin builders and reads; always an object — every member throws `OperationsUnavailableError` when unavailable. */
  readonly vault: MisoVault;

  /** Two `Tx.run`s (publish, then initialize) under one signer. Fails with: `RunError`, `UnexpectedEffects`. */
  readonly createShareCurrency: (params: Parameters<typeof createShareCurrency>[0], opts: RunOpts) => Effect.Effect<ShareCurrency, RunError | UnexpectedEffects>;
  /** Batched publishing, ≤5 per `Tx.run`. Fails with: `RunError`. */
  readonly publishShareCurrencies: (count: number, opts: Parameters<typeof publishShareCurrencies>[1]) => Effect.Effect<{ packageIds: string[]; gasUsed: bigint }, RunError>;
  /** Batched initialization, ≤10 per `Tx.run`; `onBatch` reports each succeeded batch before a later one's typed failure. Fails with: `RunError | E`. */
  readonly initializeShareCurrencies: <E = never>(
    packageIds: readonly string[],
    metaOf: (packageId: string) => ShareCurrencyMeta,
    opts: Parameters<typeof initializeShareCurrencies<E>>[2],
  ) => Effect.Effect<{ currencies: ShareCurrency[]; gasUsed: bigint }, RunError | E>;
  /** The complete post-share catalog graph as one atomic PTB, submitted once. Fails with: `RunError`, `UnexpectedEffects`. */
  readonly publishCatalog: (params: Omit<AtomicPublicationParams, "deployment">, opts: RunOpts) => Effect.Effect<AtomicPublicationResult, RunError | UnexpectedEffects>;

  /** The high-level, JSON-safe `read/*` views, with `config` already captured from this deployment. */
  readonly read: {
    readonly currencyInfo: typeof readCatalog.currencyInfo;
    readonly primaryArtistNames: typeof readCatalog.primaryArtistNames;
    readonly toTracks: typeof readCatalog.toTracks;
    readonly getPressingView: (pressingId: string) => ReturnType<typeof readCatalog.getPressingView>;
    readonly getListingView: (pressingId: string, currencyType: string) => ReturnType<typeof readCatalog.getListingView>;
    readonly readReleaseCover: (releaseId: string) => ReturnType<typeof readCatalog.readReleaseCover>;
    readonly getReleaseResources: (releaseId: string, include?: Parameters<typeof readCatalog.getReleaseResources>[2]) => ReturnType<typeof readCatalog.getReleaseResources>;
    readonly getReleaseDetail: (releaseId: string, options?: Parameters<typeof readCatalog.getReleaseDetail>[2]) => ReturnType<typeof readCatalog.getReleaseDetail>;
    readonly getTrackCredits: (releaseId: string) => ReturnType<typeof readCatalog.getTrackCredits>;
    readonly getPressingDetail: (pressingId: string, options?: Parameters<typeof readCatalog.getPressingDetail>[2]) => ReturnType<typeof readCatalog.getPressingDetail>;
    readonly getPressingSaleDetail: (pressingId: string, currencyType: string, options?: Parameters<typeof readCatalog.getPressingSaleDetail>[3]) => ReturnType<typeof readCatalog.getPressingSaleDetail>;
    readonly getPressingPreview: (pressingId: string) => ReturnType<typeof readCatalog.getPressingPreview>;
    readonly getSaleDetail: (releaseId: string, edition: number, currencyType: string, options?: Parameters<typeof readCatalog.getSaleDetail>[4]) => ReturnType<typeof readCatalog.getSaleDetail>;
    readonly getDiscoverShelf: () => ReturnType<typeof readCatalog.getDiscoverShelf>;
    readonly getRecordAlbum: (recordId: string, options?: Parameters<typeof readCatalog.getRecordAlbum>[2]) => ReturnType<typeof readCatalog.getRecordAlbum>;

    readonly partyAvatarUrl: (partyId: string) => string;
    readonly getArtistProfile: (partyId: string, options?: Parameters<typeof readArtist.getArtistProfile>[2]) => ReturnType<typeof readArtist.getArtistProfile>;
    readonly getPartySummaries: (ids: readonly string[]) => ReturnType<typeof readArtist.getPartySummaries>;

    readonly resolveGenreNames: (genreIds: readonly string[]) => ReturnType<typeof readGenres.resolveGenreNames>;

    readonly getBalance: (address: string, coinType?: string) => ReturnType<typeof readWallet.getBalance>;
    readonly getOwnedParties: (owner: string) => ReturnType<typeof readWallet.getOwnedParties>;
    readonly getPendingMemberships: (owner: string) => ReturnType<typeof readWallet.getPendingMemberships>;
    readonly getOwnedRecords: (owner: string) => ReturnType<typeof readWallet.getOwnedRecords>;
    readonly getOwnedWorks: (owner: string) => ReturnType<typeof readWallet.getOwnedWorks>;
    readonly getWorkByCap: (capId: string) => ReturnType<typeof readWallet.getWorkByCap>;
    readonly ownsParty: (address: string, partyId: string) => ReturnType<typeof readWallet.ownsParty>;
    readonly ownsRecord: (address: string, recordId: string) => ReturnType<typeof readWallet.ownsRecord>;

    readonly isRecordSoldEventType: typeof readReceipts.isRecordSoldEventType;
    readonly recordSoldCurrencyType: typeof readReceipts.recordSoldCurrencyType;
    readonly findRecordSales: typeof readReceipts.findRecordSales;
    readonly findRecordSale: typeof readReceipts.findRecordSale;
    readonly breakdown: typeof readReceipts.breakdown;
    readonly getPurchaseReceipts: (txDigest: string) => ReturnType<typeof readReceipts.getPurchaseReceipts>;
    readonly getPurchaseReceipt: (txDigest: string, recordId: string) => ReturnType<typeof readReceipts.getPurchaseReceipt>;

    readonly ROYALTY_CLAIMS_PAGE_LIMIT: number;
    readonly royaltyClaimedEventType: () => string;
    readonly listRoyaltyClaims: (address: string, options?: Parameters<typeof readRoyalties.listRoyaltyClaims>[2]) => ReturnType<typeof readRoyalties.listRoyaltyClaims>;
  };

  /** The platform event-parser registry (`events.ts`). */
  readonly events: typeof platformEventParsers;
  /**
   * @deprecated Warm-up compatibility only. `Miso.layer`'s exact-chain check
   * now runs at layer build, not at first use, so this member does no work —
   * it is `Effect.void`, kept only so `await client.miso.ready()` (the
   * predecessor's own idiom) keeps compiling and working as a `$ready()`-style
   * warm-up until every consumer migrates off it. See `docs/CONVERSION.md`.
   */
  readonly ready: Effect.Effect<void>;
}

/**
 * The Miso platform service: `Pressing`/`Listing`/`Record` reads, PTB
 * fragments, `vault`/`call`/`bcs`, the high-level `read.*` views, and the
 * converted `protocol`/`party` object-model services, built on `Sui` and
 * `SuiGraphQL`. Identifier `"@misofm/platform/Miso"`, never changes after
 * publication.
 */
export class Miso extends Context.Service<Miso, MisoService>()("@misofm/platform/Miso") {
  /**
   * The live layer, bound to `deployment`. Composes `Musicos.layer` and
   * `Partyos.layer` over the same `Sui` internally, so the requirement stays
   * `Sui | SuiGraphQL` — never `Sui | SuiGraphQL | Musicos | Partyos` — for a
   * consumer that only asked for `Miso`.
   *
   * Fails with: `MisoNetworkMismatchError`, `MisoChainIdentifierMismatchError`
   * (the client's `sui.network`/`sui.chainId` do not match `deployment`),
   * plus whatever `Musicos.layer`/`Partyos.layer` fail with for a structurally
   * invalid `deployment.protocol`/`deployment.partyos` (should not happen for
   * an already-`normalizeMisoPlatformDeployment`-validated deployment).
   */
  static readonly layer = (deployment: MisoPlatformDeployment): Layer.Layer<Miso, MisoLayerError, Sui | SuiGraphQL> =>
    Layer.effect(Miso, make(deployment)).pipe(
      Layer.provide(Musicos.layer({ deployment: deployment.protocol })),
      Layer.provide(Partyos.layer({ deployment: deployment.partyos })),
    );

  /**
   * `layer`, over `Musicos`/`Partyos` and `Sui`/`SuiGraphQL` the caller
   * already provides — the shape `docs/extensions.md` calls `layerNoDeps` for
   * a service that composes other extensions, spelled out for testing or a
   * caller assembling every layer itself.
   */
  static readonly layerNoDeps = (deployment: MisoPlatformDeployment): Layer.Layer<Miso, MisoNetworkMismatchError | MisoChainIdentifierMismatchError, Sui | SuiGraphQL | Musicos | Partyos> =>
    Layer.effect(Miso, make(deployment));

  /**
   * `layer`, reading `MISO_NETWORK` from the environment to pick this
   * release's bundled manifest; unset falls back to `sui.network`.
   *
   * Fails with: `ConfigError`, `MisoPlatformDeploymentInvalidError` (an
   * unbundled `MISO_NETWORK`), plus everything {@link layer} fails with.
   */
  static readonly layerConfig: Layer.Layer<Miso, Config.ConfigError | MisoPlatformDeploymentInvalidError | MisoLayerError, Sui | SuiGraphQL> = Layer.unwrap(
    Effect.gen(function* () {
      const configuredNetwork = yield* Config.nonEmptyString("MISO_NETWORK").pipe(Config.option);
      const network = configuredNetwork._tag === "Some" ? configuredNetwork.value : (yield* Sui).network;
      const deployment = yield* Effect.try({
        try: () => getMisoPlatformDeployment(network),
        catch: (cause) => new MisoPlatformDeploymentInvalidError({ message: cause instanceof Error ? cause.message : String(cause) }),
      });
      return Miso.layer(deployment);
    }),
  );

  /**
   * The real service over a fixed manifest (the bundled testnet deployment
   * unless `state.deployment` overrides it), skipping the exact-chain check
   * `layer` performs — this is what lets a test provide any `Sui` fake
   * without also faking a matching chain id. Compose with `layerExtensionTest`
   * (or a merged `layerTest` for `Sui`) and a `SuiGraphQL` layer (e.g.
   * `SuiGraphQL.layerUnavailable` when a test never reaches `read.*`/catalog
   * GraphQL paths) from `sui-effect/testing`. Never fails.
   */
  static readonly layerTest = (state: { readonly deployment?: MisoPlatformDeployment } = {}): Layer.Layer<Miso, never, Sui | SuiGraphQL> => {
    const deployment = state.deployment ?? MISO_PLATFORM_DEPLOYMENTS.testnet;
    return Layer.effect(Miso, makeUnchecked(deployment)).pipe(
      Layer.provide(Musicos.layerTest({ packageId: deployment.protocol.musicos })),
      Layer.provide(Partyos.layerTest(deployment.partyos)),
    );
  };
}

// `normalizeMisoPlatformDeployment` stays imported (not just re-exported) so
// a future `layerConfig` `MISO_DEPLOYMENT` JSON-path addition has it in scope
// without another import line to remember.
export { normalizeMisoPlatformDeployment };
