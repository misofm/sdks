// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The client extension — Sui's recommended shape for an SDK
// (https://sdk.mystenlabs.com/sui/sdk-building). Register it once and the
// platform layer hangs off whatever client you already have:
//
//   const client = new SuiGrpcClient({ network, baseUrl }).$extend(miso());
//
//   await client.miso.getSale({ releaseId, edition, currencyType });
//   await client.miso.protocol.getReleaseById(releaseId);
//   tx.add(client.miso.tx.purchaseRecord({ releaseId, edition, currencyType,
//     paymentAmount, expectedPricing, recipient }));
//
// Two things this buys over calling the bare functions:
//
//   IDS ARE CONFIGURED ONCE. Every builder and reader below needs the pressing
//   package id. Threading those
//   through 20 call sites is how an app ends up publishing against one package and
//   reading against another.
//
//   IT COMPOSES. `register` takes the transport-agnostic `ClientWithCoreApi`, never
//   a concrete client, so this works on gRPC, GraphQL, or JSON-RPC — and the
//   builders stay thunks, so a platform call and a protocol call go in the same PTB.
//
// Namespaces follow the guide's convention: top-level methods read and parse,
// `tx` builds transactions without executing, `bcs` exposes the generated struct
// definitions, `ids` is the address math that replaces a registry.

import type {
  ClientWithCoreApi,
  SuiClientRegistration,
} from "@mysten/sui/client";
import type {} from "@mysten/bcs";
import type { Signer } from "@mysten/sui/cryptography";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import type { ParallelTransactionExecutor } from "@mysten/sui/transactions";
import {
  miso as protocolMiso,
  type MisoProtocolClient,
} from "@misofm/protocol/client";
import type { PartyProtocolClient } from "@misofm/protocol/party";

import * as recordContract from "@misofm/protocol/contracts/miso_record/record";
import * as pressingContract from "@misofm/protocol/contracts/miso_record/pressing";
import * as listingContract from "@misofm/protocol/contracts/miso_record_shop/listing";
import * as genreContract from "@misofm/protocol/contracts/genre/genre";
import * as releaseDescriptionContract from "@misofm/protocol/contracts/release_description/release_description";
import * as releaseDspLinkContract from "@misofm/protocol/contracts/release_dsp_link/release_dsp_link";
import * as releaseGenreContract from "@misofm/protocol/contracts/release_genre/release_genre";
import * as releaseKindContract from "@misofm/protocol/contracts/release_kind/release_kind";
import * as releaseRevenueDistributorContract from "@misofm/protocol/contracts/release_revenue_distributor/release_revenue_distributor";
import * as vaultContract from "@misofm/protocol/contracts/vault/vault";
import * as compositionRoyaltyPoolContract from "@misofm/protocol/contracts/composition_royalty_pool/composition_royalty_pool";
import * as recordingRoyaltyPoolContract from "@misofm/protocol/contracts/recording_royalty_pool/recording_royalty_pool";
import * as partyWalletContract from "@misofm/protocol/contracts/party_wallet/party_wallet";
import * as compositionRoutedStakeContract from "@misofm/protocol/contracts/composition_routed_stake/composition_routed_stake";
import * as compositionRoyaltyPoolPluginContract from "@misofm/protocol/contracts/composition_royalty_pool_plugin/composition_royalty_pool_plugin";
import * as recordingRoyaltyPoolPluginContract from "@misofm/protocol/contracts/recording_royalty_pool_plugin/recording_royalty_pool_plugin";
import * as releaseRevenueDistributorPluginContract from "@misofm/protocol/contracts/release_revenue_distributor_plugin/release_revenue_distributor_plugin";
import * as routedStakeContract from "@misofm/protocol/contracts/routed_stake/routed_stake";
import * as royaltyPoolContract from "@misofm/protocol/contracts/royalty_pool/pool";
import * as recordingAdvisoryContract from "@misofm/protocol/contracts/recording_advisory/recording_advisory";
import * as recordingLanguageContract from "@misofm/protocol/contracts/recording_language/recording_language";
import * as recordingMasterReferenceContract from "@misofm/protocol/contracts/recording_master_reference/recording_master_reference";
import * as recordingStreamingTranscodeContract from "@misofm/protocol/contracts/recording_streaming_transcode/recording_streaming_transcode";
import * as vaultActions from "./vault.ts";
import * as coverArtContract from "@misofm/protocol/contracts/cover_art/cover_art";
import * as releaseCoverArtContract from "@misofm/protocol/contracts/release_cover_art/release_cover_art";
import * as releaseCreditsContract from "@misofm/protocol/contracts/release_credits/release_credits";
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
} from "./pressing.ts";
import type {
  GetSaleParams,
  ListingView,
  OpenListingParams,
  OpenPressingParams,
  PressingAdministrationParams,
  PressingView,
  PurchaseRecordParams,
  RecordView,
  SetListingPriceParams,
  SetListingStateParams,
} from "./pressing.ts";
import {
  publishShareCurrency,
  initializeShareCurrency,
  publishComposition,
  publishRecording,
  publishCompositionAndRecording,
  publishRelease,
} from "./transactions.ts";
import type {
  TxThunk,
  PublishCompositionParams,
  PublishRecordingParams,
  PublishCompositionAndRecordingParams,
  PublishReleaseParams,
} from "./transactions.ts";
import * as share from "./share.ts";
import {
  publishReleaseGraph,
  type PublishReleaseGraphParams,
} from "./release-graph.ts";
import {
  getMisoPlatformDeployment,
  requireOperationsDeployment,
  requireRecordSalesDeployment,
  type MisoPlatformDeployment,
  type OperationsDeployment,
  type RecordSalesDeployment,
} from "./deployments.ts";
import { immutableSnapshot } from "./internal.ts";
import {
  deriveGenreAddress,
  setReleaseDescription,
  setReleaseDspLinks,
  setReleaseGenres,
  setReleaseKind,
  type SetReleaseDescriptionParams,
  type SetReleaseDspLinksParams,
  type SetReleaseGenresParams,
  type SetReleaseKindParams,
} from "./release-extensions.ts";
import {
  setRecordingStreamingTranscode,
  unsetRecordingStreamingTranscode,
  type SetRecordingStreamingTranscodeParams,
  type UnsetRecordingStreamingTranscodeParams,
} from "./recording-extensions.ts";
import { addReleaseCredit, type AddReleaseCreditParams } from "./credits.ts";
import {
  setReleaseCover,
  setReleaseTrackCover,
  type SetReleaseCoverParams,
  type SetReleaseTrackCoverParams,
} from "./cover.ts";
import {
  executeViaExecutor as executePlatformViaExecutor,
  type PlatformExecResult,
} from "./execute.ts";

type BoundMoveFunction<F> = F extends (options: infer Options) => infer Result
  ? Options extends { package?: unknown }
    ? (options: Omit<Options, "package">) => Result
    : F
  : F;
type BoundModule<M extends object, Available extends readonly (keyof M)[]> = {
  [Key in Available[number]]: BoundMoveFunction<M[Key]>;
};

/**
 * Bind an explicit safe subset of a generated module to one immutable package.
 * Callers cannot supply or override `package`; reference-returning, UID-only,
 * and package-internal constructors never appear in this executable facade.
 */
function bindModulePackage<M extends object, K extends readonly (keyof M)[]>(
  mod: M,
  pkg: string,
  available: K,
): BoundModule<M, K> {
  const out: Record<string, unknown> = {};
  for (const key of available) {
    const value = (mod as Record<PropertyKey, unknown>)[key];
    out[String(key)] =
      typeof value === "function"
        ? (options: { package?: string }) =>
            (value as (o: unknown) => unknown)({ ...options, package: pkg })
        : value;
  }
  return out as BoundModule<M, K>;
}

/** Keep synchronous, client-bound surfaces unusable until the endpoint's exact
 * ledger has been validated. The underlying standalone builders remain pure. */
function requireReadyOnFunctions<T extends object>(
  surface: T,
  requireReady: (operation: string) => void,
  namespace: string,
): T {
  return new Proxy(surface, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        requireReady(`${namespace}.${String(property)}`);
        return Reflect.apply(value, target, args);
      };
    },
  });
}

function requireReadyOnModuleFunctions<T extends object>(
  surface: T,
  requireReady: (operation: string) => void,
  namespace: string,
): T {
  return new Proxy(surface, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (!value || typeof value !== "object") return value;
      return requireReadyOnFunctions(
        value,
        requireReady,
        `${namespace}.${String(property)}`,
      );
    },
  });
}

export interface MisoOptions<Name extends string = "miso"> {
  /** Name for the client extension. Defaults to `miso`. */
  name?: Name;
  /** Complete custom deployment; omit to select the bundled client network. */
  deployment?: MisoPlatformDeployment;
  /** Required only by protocol methods that perform global type discovery. */
  graphqlClient?: SuiGraphQLClient;
}

export class MisoNetworkMismatchError extends Error {
  override readonly name = "MisoNetworkMismatchError";
  constructor(
    readonly clientNetwork: string,
    readonly deploymentNetwork: string,
  ) {
    super(
      `@misofm/platform: client network "${clientNetwork}" does not match deployment network "${deploymentNetwork}"`,
    );
  }
}

export class MisoChainIdentifierMismatchError extends Error {
  override readonly name = "MisoChainIdentifierMismatchError";
  constructor(
    readonly actual: string,
    readonly expected: string,
  ) {
    super(
      `@misofm/platform: endpoint chain identifier "${actual}" does not match deployment chain identifier "${expected}"`,
    );
  }
}

export class MisoClientNotReadyError extends Error {
  override readonly name = "MisoClientNotReadyError";
  constructor(readonly operation: string) {
    super(
      `@misofm/platform: ${operation} requires an exact-chain validation lifecycle; call and await client.miso.ready() first`,
    );
  }
}

export interface MisoPlatformConfig {
  /** Exact client network label for deprecated `misoPlatform()` registration. */
  network?: string;
  /** Exact ledger identifier required by deprecated `misoPlatform().ready()`. */
  chainIdentifier?: string;
  /** Finalized immutable Record + Record Shop identities, or an explicit
   * unavailable legacy state that makes every sales API fail closed. */
  recordSales?: RecordSalesDeployment;
  /**
   * The `@misofm/protocol` protocol package (miso core). Required for the
   * publish builders (`publishComposition`, `publishRecording`,
   * `publishCompositionAndRecording`) — optional if this client only ever
   * sells pressed records.
   */
  misoPackageId?: string;
  /**
   * The minato share-disperse package. Bound into the publish builders so
   * callers don't repeat it; required alongside `misoPackageId` for the same
   * builders (they disperse shares via minato).
   */
  minatoPackageId?: string;
  /** The shared core `miso::release::ReleaseRegistry` object. */
  releaseRegistryId?: string;
  /** Release metadata/discovery extension package ids. */
  releaseKindPackageId?: string;
  releaseDescriptionPackageId?: string;
  releaseGenrePackageId?: string;
  releaseDspLinkPackageId?: string;
  recordingAdvisoryPackageId?: string;
  recordingLanguagePackageId?: string;
  recordingMasterReferencePackageId?: string;
  recordingStreamingTranscodePackageId?: string;
  /** Structurally complete Vault/Action/plugin identity set. */
  operations?: OperationsDeployment;
  /** Generic royalty-pool value package used by pool and routed-stake helpers. */
  royaltyPoolPackageId?: string;
  routedStakePackageId?: string;
  releaseCreditsPackageId?: string;
  misoCreditPackageId?: string;
  coverArtPackageId?: string;
  releaseCoverArtPackageId?: string;
  /** Curated genre vocabulary package and its shared derivation parent. */
  genrePackageId?: string;
  genreRegistryId?: string;
  /** External ori package used to create `data::WalrusBlob` values. */
  oriPackageId?: string;
}

/** Params with the ids this client already knows dropped from the call site. */
type DistributiveOmit<T, Keys extends PropertyKey> = T extends unknown
  ? Omit<T, Keys>
  : never;
type Configured<T> = DistributiveOmit<
  T,
  "recordPackageId" | "recordShopPackageId"
>;

/** Publish-builder params with the protocol/minato ids this client already knows dropped. */
type ConfiguredPublish<T> = DistributiveOmit<
  T,
  "misoPackageId" | "minatoPackageId"
>;

/** Release-builder params with this client's core, share, and registry ids dropped. */
type ConfiguredRelease<T> = DistributiveOmit<
  T,
  "misoPackageId" | "minatoPackageId" | "releaseRegistryId"
>;

type ConfiguredReleaseKind = DistributiveOmit<
  SetReleaseKindParams,
  "releaseKindPackageId"
>;
type ConfiguredReleaseDescription = DistributiveOmit<
  SetReleaseDescriptionParams,
  "releaseDescriptionPackageId"
>;
type ConfiguredReleaseGenres = DistributiveOmit<
  SetReleaseGenresParams,
  "releaseGenrePackageId"
>;
type ConfiguredReleaseDspLinks = DistributiveOmit<
  SetReleaseDspLinksParams,
  "releaseDspLinkPackageId"
>;
type ConfiguredReleaseCredit = DistributiveOmit<
  AddReleaseCreditParams,
  "releaseCreditsPackageId" | "misoCreditPackageId"
>;
type ConfiguredReleaseCover = DistributiveOmit<
  SetReleaseCoverParams,
  "coverArtPackageId" | "releaseCoverArtPackageId" | "oriPackageId"
>;
type ConfiguredReleaseTrackCover = DistributiveOmit<
  SetReleaseTrackCoverParams,
  "coverArtPackageId" | "releaseCoverArtPackageId" | "oriPackageId"
>;
type ConfiguredRecordingStreamingTranscode = DistributiveOmit<
  SetRecordingStreamingTranscodeParams,
  "recordingStreamingTranscodePackageId" | "oriPackageId"
>;
type ConfiguredUnsetRecordingStreamingTranscode = DistributiveOmit<
  UnsetRecordingStreamingTranscodeParams,
  "recordingStreamingTranscodePackageId"
>;

/** Whole-graph params with this client's package ids dropped. */
export type ConfiguredReleaseGraphParams = Omit<
  PublishReleaseGraphParams,
  "misoPackageId" | "minatoPackageId"
>;

export class MisoPlatformClient {
  readonly #client: ClientWithCoreApi;
  readonly #config: MisoPlatformConfig;
  readonly #protocol?: MisoProtocolClient;
  readonly #chainIdentifier?: string;
  /** Bundled/custom deployment selected for the full facade, when available. */
  readonly deployment?: MisoPlatformDeployment;
  #readyState: "unvalidated" | "validating" | "ready" | "failed" =
    "unvalidated";
  #readyPromise?: Promise<void>;

  constructor(
    client: ClientWithCoreApi,
    config: MisoPlatformConfig,
    protocol?: MisoProtocolClient,
    deployment?: MisoPlatformDeployment,
  ) {
    const configSnapshot = immutableSnapshot(config);
    const deploymentSnapshot = deployment
      ? immutableSnapshot(deployment)
      : undefined;
    this.#client = client;
    this.#config = configSnapshot;
    if (configSnapshot.operations?.status === "available") {
      requireOperationsDeployment(configSnapshot.operations);
    }
    // A pressing-only facade must not implicitly register a fail-closed core
    // extension. Supply a core deployment/misoPackageId when `protocol` is
    // needed; otherwise this remains a safe, independent pressing client.
    this.#protocol =
      protocol ??
      (configSnapshot.misoPackageId
        ? protocolMiso({
            deployment: { packageId: configSnapshot.misoPackageId },
          }).register(client)
        : undefined);
    this.deployment = deploymentSnapshot;
    this.#chainIdentifier =
      deploymentSnapshot?.chainIdentifier ?? configSnapshot.chainIdentifier;
  }

  /** Permissionless protocol APIs bound to the same validated ledger. */
  get protocol(): MisoProtocolClient | undefined {
    if (!this.#protocol) return undefined;
    this.#requireReady("protocol APIs");
    return this.#protocol;
  }

  /**
   * Memoized exact-ledger readiness gate. Registration already rejects a
   * synchronous network-label mismatch; this Core API read protects every
   * client-bound write surface from a mislabeled or custom endpoint.
   */
  ready(): Promise<void> {
    if (!this.#readyPromise) {
      this.#readyState = "validating";
      this.#readyPromise = (async () => {
        try {
          if (!this.#chainIdentifier) {
            throw new Error(
              "misoPlatform: chain readiness requires a complete deployment or an explicit `chainIdentifier`.",
            );
          }
          const { chainIdentifier } =
            await this.#client.core.getChainIdentifier();
          if (chainIdentifier !== this.#chainIdentifier) {
            throw new MisoChainIdentifierMismatchError(
              chainIdentifier,
              this.#chainIdentifier,
            );
          }
          this.#readyState = "ready";
        } catch (error) {
          this.#readyState = "failed";
          throw error;
        }
      })();
    }
    return this.#readyPromise;
  }

  /** Compatibility hook; prefer `await client.miso.ready()`. */
  async validateChainIdentifier(): Promise<string> {
    await this.ready();
    return this.#chainIdentifier!;
  }

  #requireReady(operation: string): void {
    // Capability availability remains the first fail-closed boundary. This
    // keeps an unavailable deployment from masquerading as a mere lifecycle
    // error while still preventing configured builders from running pre-ready.
    if (
      operation === "ids.pressing" ||
      operation === "ids.pressingAdminCap" ||
      operation === "ids.record" ||
      operation === "ids.listing" ||
      operation === "ids.sale" ||
      operation === "tx.purchaseRecord" ||
      operation === "tx.openPressing" ||
      operation === "tx.openListing" ||
      operation === "tx.authorizeRecordShop" ||
      operation === "tx.revokeRecordShop" ||
      operation === "tx.setListingPrice" ||
      operation === "tx.setListingState"
    ) {
      this.#recordSales();
    }
    if (operation === "ids.vault" || operation === "ids.vaultAdminCap") {
      this.#operations();
    }
    if (this.#readyState !== "ready") {
      throw new MisoClientNotReadyError(operation);
    }
  }

  /** Party identity and profile APIs, backed by the network SDK. */
  get party(): PartyProtocolClient {
    if (!this.#protocol) {
      throw new Error(
        "misoPlatform: Party APIs require the complete platform deployment. Use miso({ deployment }).",
      );
    }
    this.#requireReady("party APIs");
    return this.#protocol.party;
  }

  #recordSales() {
    return requireRecordSalesDeployment(
      this.#config.recordSales ?? {
        status: "unavailable",
        reason:
          "this client was configured without Record and Record Shop package IDs",
      },
    );
  }

  #operations() {
    return requireOperationsDeployment(this.#config.operations);
  }

  #availableOperations() {
    return this.#config.operations?.status === "available"
      ? requireOperationsDeployment(this.#config.operations)
      : undefined;
  }

  get recordPackageId(): string {
    return this.#recordSales().recordPackageId;
  }

  get recordShopPackageId(): string {
    return this.#recordSales().recordShopPackageId;
  }

  #misoPackageId(): string {
    const { misoPackageId } = this.#config;
    if (!misoPackageId) {
      throw new Error(
        "misoPlatform: `misoPackageId` is required for the publish builders " +
          "(publishComposition, publishRecording, publishCompositionAndRecording, publishRelease) — pass it to misoPlatform({ misoPackageId }).",
      );
    }
    return misoPackageId;
  }

  #minatoPackageId(): string {
    const { minatoPackageId } = this.#config;
    if (!minatoPackageId) {
      throw new Error(
        "misoPlatform: `minatoPackageId` is required for the publish builders that disperse shares " +
          "(publishComposition, publishRecording, publishCompositionAndRecording) — pass it to misoPlatform({ minatoPackageId }).",
      );
    }
    return minatoPackageId;
  }

  #releaseRegistryId(): string {
    const { releaseRegistryId: id } = this.#config;
    if (!id) {
      throw new Error(
        "misoPlatform: `releaseRegistryId` is required to build a release.",
      );
    }
    return id;
  }

  #requiredConfig(field: keyof MisoPlatformConfig, operation: string): string {
    const value = this.#config[field];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(
        `misoPlatform: \`${String(field)}\` is required for ${operation}.`,
      );
    }
    return value;
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  /** The run itself, or `null` if this release has never opened one. */
  async getPressing(pressingId: string): Promise<PressingView | null> {
    await this.ready();
    return getPressing(this.#client, pressingId, this.recordPackageId);
  }

  /** One currency's offer, or `null` if the run does not sell in it. */
  async getListing(listingId: string): Promise<ListingView | null> {
    await this.ready();
    return getListing(this.#client, listingId, this.recordShopPackageId);
  }

  /** One concrete purchased Record, including immutable purchase provenance. */
  async getRecord(recordId: string): Promise<RecordView | null> {
    await this.ready();
    return getRecord(this.#client, recordId, this.recordPackageId);
  }

  /** Run + one currency's offer in a single round trip, by address math. */
  async getSale(p: Configured<GetSaleParams>): Promise<{
    pressing: PressingView | null;
    listing: ListingView | null;
  }> {
    await this.ready();
    return getSale(this.#client, {
      ...p,
      recordPackageId: this.recordPackageId,
      recordShopPackageId: this.recordShopPackageId,
    });
  }

  // ── Address math ──────────────────────────────────────────────────────────

  readonly ids = requireReadyOnFunctions({
    pressing: (releaseId: string, edition: number) =>
      derivePressingId(releaseId, edition, this.recordPackageId),
    pressingAdminCap: (pressingId: string) =>
      derivePressingAdminCapId(pressingId, this.recordPackageId),
    record: (pressingId: string, number: number) =>
      deriveRecordId(pressingId, number, this.recordPackageId),
    listing: (pressingId: string, currencyType: string) =>
      deriveListingId(pressingId, currencyType, this.recordShopPackageId),
    sale: (releaseId: string, edition: number, currencyType: string) =>
      deriveSaleIds(
        releaseId,
        edition,
        currencyType,
        this.recordPackageId,
        this.recordShopPackageId,
      ),
    vault: (capId: string, capType: string) =>
      vaultActions.deriveVaultId({
        vaultRegistryId: this.#operations().vault.registryId,
        capId,
        capType,
        vaultPackageId: this.#operations().vault.packageId,
      }),
    vaultAdminCap: (vaultId: string) =>
      vaultActions.deriveVaultAdminCapId(
        vaultId,
        this.#operations().vault.packageId,
      ),
    genre: (canonicalName: string) =>
      deriveGenreAddress(
        this.#requiredConfig("genreRegistryId", "genre id derivation"),
        this.#requiredConfig("genrePackageId", "genre id derivation"),
        canonicalName,
      ),
  }, (operation) => this.#requireReady(operation), "ids");

  // ── Transaction builders ──────────────────────────────────────────────────

  /** Client-bound builders require a successful `await client.miso.ready()`.
   * Standalone exports remain pure for explicitly managed offline workflows. */
  readonly tx = requireReadyOnFunctions({
    purchaseRecord: (p: Configured<PurchaseRecordParams>): TxThunk =>
      purchaseRecord({
        ...p,
        recordPackageId: this.recordPackageId,
        recordShopPackageId: this.recordShopPackageId,
      }),
    openPressing: (p: Configured<OpenPressingParams>): TxThunk =>
      openPressing({
        ...p,
        recordPackageId: this.recordPackageId,
        recordShopPackageId: this.recordShopPackageId,
      }),
    openListing: (p: Configured<OpenListingParams>): TxThunk =>
      openListing({ ...p, recordShopPackageId: this.recordShopPackageId }),
    authorizeRecordShop: (
      p: Configured<PressingAdministrationParams>,
    ): TxThunk =>
      authorizeRecordShop({
        ...p,
        recordPackageId: this.recordPackageId,
        recordShopPackageId: this.recordShopPackageId,
      }),
    revokeRecordShop: (p: Configured<PressingAdministrationParams>): TxThunk =>
      revokeRecordShop({
        ...p,
        recordPackageId: this.recordPackageId,
        recordShopPackageId: this.recordShopPackageId,
      }),
    setListingPrice: (p: Configured<SetListingPriceParams>): TxThunk =>
      setListingPrice({ ...p, recordShopPackageId: this.recordShopPackageId }),
    setListingState: (p: Configured<SetListingStateParams>): TxThunk =>
      setListingState({ ...p, recordShopPackageId: this.recordShopPackageId }),

    // Publishing (protocol works + minato share economics) — package-id-free
    // builders pass through unchanged; the rest bind this client's
    // `misoPackageId`/`minatoPackageId`, throwing at call time if either is
    // missing (kept optional on the client so a sell-only client, e.g. a
    // storefront that never mints new works, doesn't need to carry them).
    publishShareCurrency,
    initializeShareCurrency,
    publishComposition: (
      p: ConfiguredPublish<PublishCompositionParams>,
    ): TxThunk =>
      publishComposition({
        ...p,
        misoPackageId: this.#misoPackageId(),
        minatoPackageId: this.#minatoPackageId(),
      }),
    publishRecording: (p: ConfiguredPublish<PublishRecordingParams>): TxThunk =>
      publishRecording({
        ...p,
        misoPackageId: this.#misoPackageId(),
        minatoPackageId: this.#minatoPackageId(),
      }),
    publishCompositionAndRecording: (
      p: ConfiguredPublish<PublishCompositionAndRecordingParams>,
    ): TxThunk =>
      publishCompositionAndRecording({
        ...p,
        misoPackageId: this.#misoPackageId(),
        minatoPackageId: this.#minatoPackageId(),
      }),
    publishRelease: (p: ConfiguredRelease<PublishReleaseParams>): TxThunk => {
      return publishRelease({
        ...p,
        misoPackageId: this.#misoPackageId(),
        releaseRegistryId: this.#releaseRegistryId(),
      });
    },
    publishReleaseGraph: (p: ConfiguredReleaseGraphParams): TxThunk => {
      return publishReleaseGraph({
        ...p,
        misoPackageId: this.#misoPackageId(),
        minatoPackageId: this.#minatoPackageId(),
      });
    },
    setReleaseKind: (p: ConfiguredReleaseKind): TxThunk =>
      setReleaseKind({
        ...p,
        releaseKindPackageId: this.#requiredConfig(
          "releaseKindPackageId",
          "setReleaseKind",
        ),
      }),
    setReleaseDescription: (p: ConfiguredReleaseDescription): TxThunk =>
      setReleaseDescription({
        ...p,
        releaseDescriptionPackageId: this.#requiredConfig(
          "releaseDescriptionPackageId",
          "setReleaseDescription",
        ),
      }),
    setReleaseGenres: (p: ConfiguredReleaseGenres): TxThunk =>
      setReleaseGenres({
        ...p,
        releaseGenrePackageId: this.#requiredConfig(
          "releaseGenrePackageId",
          "setReleaseGenres",
        ),
      }),
    setReleaseDspLinks: (p: ConfiguredReleaseDspLinks): TxThunk =>
      setReleaseDspLinks({
        ...p,
        releaseDspLinkPackageId: this.#requiredConfig(
          "releaseDspLinkPackageId",
          "setReleaseDspLinks",
        ),
      }),
    addReleaseCredit: (p: ConfiguredReleaseCredit): TxThunk =>
      addReleaseCredit({
        ...p,
        releaseCreditsPackageId: this.#requiredConfig(
          "releaseCreditsPackageId",
          "addReleaseCredit",
        ),
        misoCreditPackageId: this.#requiredConfig(
          "misoCreditPackageId",
          "addReleaseCredit",
        ),
      }),
    setReleaseCover: (p: ConfiguredReleaseCover): TxThunk =>
      setReleaseCover({
        ...p,
        coverArtPackageId: this.#requiredConfig(
          "coverArtPackageId",
          "setReleaseCover",
        ),
        releaseCoverArtPackageId: this.#requiredConfig(
          "releaseCoverArtPackageId",
          "setReleaseCover",
        ),
        oriPackageId: this.#requiredConfig("oriPackageId", "setReleaseCover"),
      }),
    setReleaseTrackCover: (p: ConfiguredReleaseTrackCover): TxThunk =>
      setReleaseTrackCover({
        ...p,
        coverArtPackageId: this.#requiredConfig(
          "coverArtPackageId",
          "setReleaseTrackCover",
        ),
        releaseCoverArtPackageId: this.#requiredConfig(
          "releaseCoverArtPackageId",
          "setReleaseTrackCover",
        ),
        oriPackageId: this.#requiredConfig(
          "oriPackageId",
          "setReleaseTrackCover",
        ),
      }),
    setRecordingStreamingTranscode: (
      p: ConfiguredRecordingStreamingTranscode,
    ): TxThunk =>
      setRecordingStreamingTranscode({
        ...p,
        recordingStreamingTranscodePackageId: this.#requiredConfig(
          "recordingStreamingTranscodePackageId",
          "setRecordingStreamingTranscode",
        ),
        oriPackageId: this.#requiredConfig(
          "oriPackageId",
          "setRecordingStreamingTranscode",
        ),
      }),
    unsetRecordingStreamingTranscode: (
      p: ConfiguredUnsetRecordingStreamingTranscode,
    ): TxThunk =>
      unsetRecordingStreamingTranscode({
        ...p,
        recordingStreamingTranscodePackageId: this.#requiredConfig(
          "recordingStreamingTranscodePackageId",
          "unsetRecordingStreamingTranscode",
        ),
      }),
  }, (operation) => this.#requireReady(operation), "tx");

  /**
   * Vault-aware builders and parsers. These take explicit object ids because a
   * VaultAdminCap is owner-held while the Vault is shared; package ids can come
   * from the deployment config or be supplied for private deployments.
   */
  get vault(): typeof vaultActions | undefined {
    if (!this.#availableOperations()) return undefined;
    this.#requireReady("vault builders");
    return vaultActions;
  }

  // ── Share currency provisioning (executes; Signer pattern) ─────────────────

  /** Publishes + initializes a fresh share currency (two txs). */
  async createShareCurrency(
    signer: Signer,
    params: share.CreateShareCurrencyParams,
  ): Promise<share.ShareCurrency> {
    await this.ready();
    return share.createShareCurrency(this.#client, signer, params);
  }

  /** Execute a composed platform PTB only after exact-ledger validation. */
  async executeViaExecutor(
    executor: ParallelTransactionExecutor,
    ...thunks: TxThunk[]
  ): Promise<PlatformExecResult> {
    await this.ready();
    return executePlatformViaExecutor(executor, ...thunks);
  }

  // ── Generated layer ───────────────────────────────────────────────────────

  /** Generated Move-call bindings, for commands this facade doesn't wrap. */
  get call() {
    const sales =
      this.#config.recordSales?.status === "available"
        ? this.#config.recordSales
        : undefined;
    const operations = this.#availableOperations();
    return requireReadyOnModuleFunctions({
      record: sales
        ? bindModulePackage(recordContract, sales.recordPackageId, [
            "destroy",
            "releaseId",
            "pressingId",
            "edition",
            "number",
            "purchaseCurrency",
            "purchasePrice",
            "purchasedBy",
            "purchasedTimestampMs",
            "deriveAddress",
          ] as const)
        : undefined,
      listing: sales
        ? bindModulePackage(listingContract, sales.recordShopPackageId, [
            "fixed",
            "floor",
            "enabled",
            "disabled",
            "setState",
            "setPrice",
            "purchase",
            "deriveAddress",
            "releaseId",
            "pressingId",
            "pricing",
            "price",
            "state",
            "isEnabled",
            "isDisabled",
            "isFixed",
            "isFloor",
          ] as const)
        : undefined,
      pressing: sales
        ? bindModulePackage(pressingContract, sales.recordPackageId, [
            "authorizeDistributor",
            "revokeDistributor",
            "deriveAddress",
            "deriveAdminCapAddress",
            "releaseId",
            "edition",
            "supply",
            "maxSupply",
            "distributors",
            "isDistributorAuthorized",
            "pressingId",
          ] as const)
        : undefined,
      genre: this.#config.genrePackageId
        ? bindModulePackage(genreContract, this.#config.genrePackageId, [
            "deriveAddress",
          ] as const)
        : undefined,
      releaseDescription: this.#config.releaseDescriptionPackageId
        ? bindModulePackage(
            releaseDescriptionContract,
            this.#config.releaseDescriptionPackageId,
            ["setDescription", "clearDescription", "hasDescription"],
          )
        : undefined,
      releaseDspLink: this.#config.releaseDspLinkPackageId
        ? bindModulePackage(
            releaseDspLinkContract,
            this.#config.releaseDspLinkPackageId,
            [
              "platform",
              "platformSpotify",
              "platformAppleMusic",
              "platformAmazonMusic",
              "platformBandcamp",
              "platformDeezer",
              "platformSoundcloud",
              "platformTidal",
              "platformYoutubeMusic",
              "newSpotify",
              "newAppleMusicAlbum",
              "newAppleMusicTrack",
              "newAmazonMusicAlbum",
              "newAmazonMusicTrack",
              "newBandcamp",
              "newDeezer",
              "newSoundcloud",
              "newTidal",
              "newYoutubeMusic",
              "setReleaseLink",
              "clearReleaseLink",
              "setTrackLink",
              "clearTrackLink",
              "clearTrackLinks",
              "hasReleaseLink",
            ] as const,
          )
        : undefined,
      releaseGenre: this.#config.releaseGenrePackageId
        ? bindModulePackage(
            releaseGenreContract,
            this.#config.releaseGenrePackageId,
            [
              "setPrimaryGenre",
              "addSecondaryGenre",
              "removeSecondaryGenre",
              "setTrackPrimaryGenre",
              "unsetTrackPrimaryGenre",
              "hasGenre",
            ] as const,
          )
        : undefined,
      releaseKind: this.#config.releaseKindPackageId
        ? bindModulePackage(
            releaseKindContract,
            this.#config.releaseKindPackageId,
            ["setKind", "unsetKind", "hasKind"] as const,
          )
        : undefined,
      releaseRevenueDistributor: operations
        ? bindModulePackage(
            releaseRevenueDistributorContract,
            operations.actions.releaseRevenueDistributor,
            [
              "redeemAndDistribute",
              "redeemAllAndDistribute",
              "receiveAndDistribute",
            ] as const,
          )
        : undefined,
      releaseRevenueDistributorPlugin: operations
        ? bindModulePackage(
            releaseRevenueDistributorPluginContract,
            operations.plugins.releaseRevenueDistributor,
            [
              "install",
              "uninstall",
              "redeemAllAndDistribute",
              "receiveAndDistribute",
              "isInstalled",
            ] as const,
          )
        : undefined,
      vault: operations
        ? bindModulePackage(vaultContract, operations.vault.packageId, [
            "share",
            "withdrawCap",
            "restoreCap",
            "derivedAddress",
            "capId",
            "isActive",
            "authorizedPlugins",
            "isPluginAuthorized",
          ] as const)
        : undefined,
      compositionRoyaltyPool: operations
        ? bindModulePackage(
            compositionRoyaltyPoolContract,
            operations.actions.compositionRoyaltyPool,
            ["newPool", "receiveAndDeposit", "redeemAndDeposit", "poolAddress"] as const,
          )
        : undefined,
      compositionRoyaltyPoolPlugin: operations
        ? bindModulePackage(
            compositionRoyaltyPoolPluginContract,
            operations.plugins.compositionRoyaltyPool,
            [
              "install",
              "uninstall",
              "receiveAndDeposit",
              "redeemAndDeposit",
              "isInstalled",
            ] as const,
          )
        : undefined,
      recordingRoyaltyPool: operations
        ? bindModulePackage(
            recordingRoyaltyPoolContract,
            operations.actions.recordingRoyaltyPool,
            ["newPool", "receiveAndDeposit", "redeemAndDeposit", "poolAddress"] as const,
          )
        : undefined,
      recordingRoyaltyPoolPlugin: operations
        ? bindModulePackage(
            recordingRoyaltyPoolPluginContract,
            operations.plugins.recordingRoyaltyPool,
            [
              "install",
              "uninstall",
              "receiveAndDeposit",
              "redeemAndDeposit",
              "isInstalled",
            ] as const,
          )
        : undefined,
      partyWallet: operations
        ? bindModulePackage(
            partyWalletContract,
            operations.actions.partyWallet,
            ["receive", "receiveBalance", "redeemBalance", "inboxAddress"] as const,
          )
        : undefined,
      compositionRoutedStake: operations
        ? bindModulePackage(
            compositionRoutedStakeContract,
            operations.actions.compositionRoutedStake,
            ["createStake", "register", "unregister", "unstake", "restake", "stakeAddress"] as const,
          )
        : undefined,
      routedStake: this.#config.routedStakePackageId
        ? bindModulePackage(
            routedStakeContract,
            this.#config.routedStakePackageId,
            [
              "share",
              "register",
              "unregister",
              "sweep",
              "unstake",
              "restake",
              "derivedAddress",
            ] as const,
          )
        : undefined,
      royaltyPool: this.#config.royaltyPoolPackageId
        ? bindModulePackage(
            royaltyPoolContract,
            this.#config.royaltyPoolPackageId,
            [
              "share",
              "deposit",
              "sweepAndDeposit",
              "receiveAndDeposit",
              "registerStake",
              "unregisterStake",
              "claimRewards",
              "pendingRewards",
              "stakedShares",
              "cumulativeRewardPerShare",
              "cumulativeDeposits",
              "derivedAddress",
              "assertDerivedFrom",
            ] as const,
          )
        : undefined,
      recordingAdvisory: this.#config.recordingAdvisoryPackageId
        ? bindModulePackage(
            recordingAdvisoryContract,
            this.#config.recordingAdvisoryPackageId,
            [
              "explicit",
              "notExplicit",
              "cleaned",
              "setRating",
              "unsetRating",
              "hasRating",
              "isExplicit",
              "isNotExplicit",
              "isCleaned",
            ] as const,
          )
        : undefined,
      recordingLanguage: this.#config.recordingLanguagePackageId
        ? bindModulePackage(
            recordingLanguageContract,
            this.#config.recordingLanguagePackageId,
            [
              "setLanguages",
              "setInstrumental",
              "unsetLanguages",
              "hasLanguages",
              "isInstrumental",
            ] as const,
          )
        : undefined,
      recordingMasterReference: this.#config.recordingMasterReferencePackageId
        ? bindModulePackage(
            recordingMasterReferenceContract,
            this.#config.recordingMasterReferencePackageId,
            [
              "setMasterReference",
              "unsetMasterReference",
              "hasMasterReference",
            ] as const,
          )
        : undefined,
      recordingStreamingTranscode: this.#config.recordingStreamingTranscodePackageId
        ? bindModulePackage(
            recordingStreamingTranscodeContract,
            this.#config.recordingStreamingTranscodePackageId,
            [
              "setStreamingTranscode",
              "unsetStreamingTranscode",
              "hasStreamingTranscode",
            ] as const,
          )
        : undefined,
      coverArt: this.#config.coverArtPackageId
        ? bindModulePackage(
            coverArtContract,
            this.#config.coverArtPackageId,
            [] as const,
          )
        : undefined,
      releaseCoverArt: this.#config.releaseCoverArtPackageId
        ? bindModulePackage(
            releaseCoverArtContract,
            this.#config.releaseCoverArtPackageId,
            [
              "setCover",
              "unsetCover",
              "setTrackCover",
              "unsetTrackCover",
              "hasCoverArt",
            ] as const,
          )
        : undefined,
      releaseCredits: this.#config.releaseCreditsPackageId
        ? bindModulePackage(
            releaseCreditsContract,
            this.#config.releaseCreditsPackageId,
            ["addCredit", "removeCredit", "hasCredits"] as const,
          )
        : undefined,
    }, (operation) => this.#requireReady(operation), "call");
  }

  /** Generated BCS definitions, for parsing objects or events yourself. */
  readonly bcs = {
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
    ListingCreatedEvent: listingContract.ListingCreatedEvent,
    ListingPriceChangedEvent: listingContract.ListingPriceChangedEvent,
    ListingStateChangedEvent: listingContract.ListingStateChangedEvent,
    RecordSoldEvent: listingContract.RecordSoldEvent,
    VaultAdminCap: vaultContract.VaultAdminCap,
    VaultRegistry: vaultContract.VaultRegistry,
    VaultKey: vaultContract.VaultKey,
    VaultAdminCapKey: vaultContract.VaultAdminCapKey,
    VaultCreatedEvent: vaultContract.VaultCreatedEvent,
    VaultCapabilityWithdrawnEvent: vaultContract.VaultCapabilityWithdrawnEvent,
    VaultCapabilityRestoredEvent: vaultContract.VaultCapabilityRestoredEvent,
    PartyObjectReceivedEvent: partyWalletContract.ObjectReceivedEvent,
    PartyCoinsReceivedEvent: partyWalletContract.CoinsReceivedEvent,
    PartyFundsRedeemedEvent: partyWalletContract.FundsRedeemedEvent,
    ReleaseTrackRevenueDistributedEvent:
      releaseRevenueDistributorContract.ReleaseTrackRevenueDistributedEvent,
    ReleaseRevenueDistributedEvent:
      releaseRevenueDistributorContract.ReleaseRevenueDistributedEvent,
  };
}

/** The full Miso client exposed by `@misofm/platform`. */
export { MisoPlatformClient as MisoClient };

/**
 * Registers the complete Miso facade at `client.miso`.
 *
 * Platform operations live directly on `client.miso`; the lower-level
 * permissionless protocol SDK is available at `client.miso.protocol`.
 */
export function miso<const Name extends string = "miso">(
  options: MisoOptions<Name> = {},
): SuiClientRegistration<ClientWithCoreApi, Name, MisoPlatformClient> {
  const name = (options.name ?? "miso") as Name;
  return {
    name,
    register: (client: ClientWithCoreApi) => {
      const deployment = immutableSnapshot(
        options.deployment ?? getMisoPlatformDeployment(client.network),
      );
      if (deployment.network !== client.network) {
        throw new MisoNetworkMismatchError(client.network, deployment.network);
      }
      const protocol = protocolMiso({
        deployment: deployment.protocol,
        graphqlClient: options.graphqlClient,
      }).register(client);
      return new MisoPlatformClient(
        client,
        {
          recordSales: deployment.recordSales,
          misoPackageId: deployment.protocol.miso,
          minatoPackageId: deployment.packages.minato,
          releaseRegistryId: deployment.objects.releaseRegistry,
          releaseKindPackageId: deployment.packages.releaseKind,
          releaseDescriptionPackageId: deployment.packages.releaseDescription,
          releaseGenrePackageId: deployment.packages.releaseGenre,
          releaseDspLinkPackageId: deployment.packages.releaseDspLink,
          recordingAdvisoryPackageId: deployment.packages.recordingAdvisory,
          recordingLanguagePackageId: deployment.packages.recordingLanguage,
          recordingMasterReferencePackageId:
            deployment.packages.recordingMasterReference,
          recordingStreamingTranscodePackageId:
            deployment.packages.recordingStreamingTranscode,
          operations: deployment.operations,
          royaltyPoolPackageId: deployment.packages.royaltyPool,
          routedStakePackageId: deployment.packages.routedStake,
          releaseCreditsPackageId: deployment.packages.releaseCredits,
          misoCreditPackageId: deployment.packages.credit,
          coverArtPackageId: deployment.packages.coverArt,
          releaseCoverArtPackageId: deployment.packages.releaseCoverArt,
          genrePackageId: deployment.packages.genre,
          genreRegistryId: deployment.objects.genreRegistry,
          oriPackageId: deployment.packages.ori,
        },
        protocol,
        deployment,
      );
    },
  };
}

/**
 * @deprecated Prefer zero-config `miso()`, which registers the complete facade
 * at `client.miso` and exposes the protocol layer at `client.miso.protocol`.
 */
export function misoPlatform(config: MisoPlatformConfig) {
  return {
    name: "misoPlatform" as const,
    register: (client: ClientWithCoreApi) => {
      const configSnapshot = immutableSnapshot(config);
      if (configSnapshot.network && configSnapshot.network !== client.network) {
        throw new MisoNetworkMismatchError(client.network, configSnapshot.network);
      }
      const protocol = configSnapshot.misoPackageId
        ? protocolMiso({
            deployment: { packageId: configSnapshot.misoPackageId },
          }).register(client)
        : undefined;
      return new MisoPlatformClient(client, configSnapshot, protocol);
    },
  };
}
