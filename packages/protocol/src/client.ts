// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Effect } from "effect";
import { trySync } from "@misofm/utils/effect";
import type {
  ClientWithCoreApi,
  SuiClientRegistration,
} from "@mysten/sui/client";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import {
  getMisoDeployment,
  normalizeMisoDeployment,
  normalizeMisoProtocolDeployment,
  protocolDeployment,
  type MisoDeployment,
  type MisoProtocolDeployment,
} from "./deployments.ts";
import { bindModulePackage, MisoPackageBindings, REF_RETURNING_CALLS } from "./packages.ts";
import * as parsers from "./parsers.ts";
import { eventParsers } from "./events.ts";
import { PartyProtocolClient } from "./party/client.ts";
import * as queries from "./queries.ts";
import * as view from "./view.ts";
import type {
  Composition,
  CompositionAdminCap,
  Recording,
  RecordingAdminCap,
  Release,
  ReleaseAdminCap,
} from "./types.ts";

// Generated call modules (type-safe Move calls) and BCS structs.
import * as composition from "./contracts/miso/composition.ts";
import * as recording from "./contracts/miso/recording.ts";
import * as release from "./contracts/miso/release.ts";
import * as track from "./contracts/miso/track.ts";

export interface MisoOptions<Name extends string = "miso"> {
  /** Name for the client extension. Defaults to "miso". */
  name?: Name;
  /**
   * Explicit core-only deployment or complete package manifest. Omit only after
   * this SDK has a verified bundled manifest for the client's network.
   */
  deployment?: MisoProtocolDeployment | MisoDeployment;
  /** @deprecated Use `deployment`. Retained for compatibility with pre-0.4 callers. */
  misoPackageId?: string;
  /**
   * Optional GraphQL client, required ONLY for the global type-discovery reads
   * the Core API cannot express: `getCompositionByShareType`,
   * `getRecordingByShareType`. Everything else — including every
   * `getOwned*AdminCaps` — goes over the Core API.
   */
  graphqlClient?: SuiGraphQLClient;
}

function isFullDeployment(
  deployment: MisoProtocolDeployment | MisoDeployment,
): deployment is MisoDeployment {
  return "miso" in deployment;
}

/**
 * Creates a Miso client extension for use with `$extend()`.
 *
 * @example
 * ```ts
 * const client = new SuiGrpcClient({ network: 'testnet' })
 *   .$extend(miso());
 * const composition = await client.miso.getCompositionById('0x...');
 * ```
 */
export function miso<const Name extends string = "miso">(
  options: MisoOptions<Name> = {},
): SuiClientRegistration<ClientWithCoreApi, Name, MisoProtocolClient> {
  const name = (options.name ?? "miso") as Name;
  return {
    name,
    register: (client) => {
      const supplied = options.deployment;
      const packageDeployment =
        supplied && isFullDeployment(supplied)
          ? normalizeMisoDeployment(supplied)
          : !supplied && !options.misoPackageId
            ? getMisoDeployment(client.network)
            : undefined;
      const deployment = supplied
        ? isFullDeployment(supplied)
          ? protocolDeployment(packageDeployment!)
          : normalizeMisoProtocolDeployment(supplied)
        : options.misoPackageId
          ? normalizeMisoProtocolDeployment({ packageId: options.misoPackageId })
          : protocolDeployment(packageDeployment!);
      return new MisoProtocolClient(client, {
        deployment,
        packageDeployment,
        graphqlClient: options.graphqlClient,
      });
    },
  };
}

export interface MisoProtocolClientOptions {
  deployment: MisoProtocolDeployment;
  packageDeployment?: MisoDeployment;
  graphqlClient?: SuiGraphQLClient;
}

export class MisoProtocolClient {
  #client: ClientWithCoreApi;
  #graphqlClient?: SuiGraphQLClient;
  #deployment: MisoProtocolDeployment;
  #packageDeployment?: MisoDeployment;
  #partyClient?: PartyProtocolClient;

  constructor(client: ClientWithCoreApi, options: MisoProtocolClientOptions) {
    this.#client = client;
    this.#graphqlClient = options.graphqlClient;
    this.#deployment = normalizeMisoProtocolDeployment(options.deployment);
    this.#packageDeployment = options.packageDeployment
      ? normalizeMisoDeployment(options.packageDeployment)
      : undefined;
    this.#partyClient = this.#packageDeployment
      ? new PartyProtocolClient(client, this.#packageDeployment)
      : undefined;
  }

  /** The exact deployment selected for this client. */
  get deployment(): MisoProtocolDeployment {
    return this.#deployment;
  }

  /**
   * Complete package-bound calls and BCS codecs, available only when `miso()`
   * was given a full fresh deployment manifest.
   */
  get packages(): MisoPackageBindings {
    if (!this.#packageDeployment) {
      throw new Error(
        "@misonetwork/sdk: full package bindings require a complete MisoDeployment. " +
          "Pass the verified post-publish manifest to miso({ deployment }).",
      );
    }
    return new MisoPackageBindings(this.#packageDeployment);
  }

  /** Party identity, profile, membership, and extension APIs. */
  get party(): PartyProtocolClient {
    if (!this.#partyClient) {
      throw new Error(
        "@misonetwork/sdk: Party APIs require a complete MisoDeployment. " +
          "Pass the verified post-publish manifest to miso({ deployment }).",
      );
    }
    return this.#partyClient;
  }

  get #misoPackageId(): string {
    return this.#deployment.packageId;
  }

  // === Composition ===

  getCompositionById(compositionId: string): Promise<Composition> {
    return queries.getCompositionById(this.#client, compositionId);
  }
  getCompositionByIdEffect(compositionId: string) {
    return queries.getCompositionByIdEffect(this.#client, compositionId);
  }
  getCompositionsByIds(
    ids: string[],
  ): Promise<Record<string, Composition>> {
    return queries.getCompositionsByIds(this.#client, ids);
  }
  getCompositionsByIdsEffect(
    ids: string[],
  ) {
    return queries.getCompositionsByIdsEffect(this.#client, ids);
  }
  getWorksByIds(ids: queries.WorkIds): Promise<queries.WorksById> {
    return queries.getWorksByIds(this.#client, ids);
  }
  getWorksByIdsEffect(ids: queries.WorkIds) {
    return queries.getWorksByIdsEffect(this.#client, ids);
  }
  async getWorkAddressesByShareTypes(
    shareTypes: queries.WorkShareTypes,
  ): Promise<queries.WorkAddressesByShareType> {
    return queries.getWorkAddressesByShareTypes(
      this.#requireGraphQL(),
      shareTypes,
      this.#misoPackageId,
    );
  }
  getWorkAddressesByShareTypesEffect(
    shareTypes: queries.WorkShareTypes,
  ) {
    return trySync("getWorkAddressesByShareTypes", () => this.#requireGraphQL()).pipe(
      Effect.flatMap((graphql) => queries.getWorkAddressesByShareTypesEffect(graphql, shareTypes, this.#misoPackageId)),
    );
  }
  getCompositionShareType(compositionId: string): Promise<string> {
    return queries.getCompositionShareType(this.#client, compositionId);
  }
  getCompositionShareTypeEffect(compositionId: string) {
    return queries.getCompositionShareTypeEffect(this.#client, compositionId);
  }
  async getCompositionByShareType(shareType: string): Promise<Composition> {
    return queries.getCompositionByShareType(
      this.#client,
      this.#requireGraphQL(),
      shareType,
      this.#misoPackageId,
    );
  }
  getCompositionByShareTypeEffect(shareType: string) {
    return trySync("getCompositionByShareType", () => this.#requireGraphQL()).pipe(
      Effect.flatMap((graphql) => queries.getCompositionByShareTypeEffect(this.#client, graphql, shareType, this.#misoPackageId)),
    );
  }
  getCompositionAdminCapById(
    adminCapId: string,
  ): Promise<CompositionAdminCap> {
    return queries.getCompositionAdminCapById(this.#client, adminCapId);
  }
  getCompositionAdminCapByIdEffect(
    adminCapId: string,
  ) {
    return queries.getCompositionAdminCapByIdEffect(this.#client, adminCapId);
  }
  getOwnedCompositionAdminCaps(
    owner: string,
  ): Promise<CompositionAdminCap[]> {
    return queries.getOwnedCompositionAdminCaps(
      this.#client,
      owner,
      this.#misoPackageId,
    );
  }
  getOwnedCompositionAdminCapsEffect(
    owner: string,
  ) {
    return queries.getOwnedCompositionAdminCapsEffect(
      this.#client,
      owner,
      this.#misoPackageId,
    );
  }
  deriveCompositionAdminCapId(compositionId: string): string {
    return queries.deriveCompositionAdminCapId(
      compositionId,
      this.#misoPackageId,
    );
  }

  // === Recording ===

  getRecordingById(recordingId: string): Promise<Recording> {
    return queries.getRecordingById(this.#client, recordingId);
  }
  getRecordingByIdEffect(recordingId: string) {
    return queries.getRecordingByIdEffect(this.#client, recordingId);
  }
  getRecordingsByIds(ids: string[]): Promise<Record<string, Recording>> {
    return queries.getRecordingsByIds(this.#client, ids);
  }
  getRecordingsByIdsEffect(ids: string[]) {
    return queries.getRecordingsByIdsEffect(this.#client, ids);
  }
  getRecordingShareType(recordingId: string): Promise<string> {
    return queries.getRecordingShareType(this.#client, recordingId);
  }
  getRecordingShareTypeEffect(recordingId: string) {
    return queries.getRecordingShareTypeEffect(this.#client, recordingId);
  }
  async getRecordingByShareType(shareType: string): Promise<Recording> {
    return queries.getRecordingByShareType(
      this.#client,
      this.#requireGraphQL(),
      shareType,
      this.#misoPackageId,
    );
  }
  getRecordingByShareTypeEffect(shareType: string) {
    return trySync("getRecordingByShareType", () => this.#requireGraphQL()).pipe(
      Effect.flatMap((graphql) => queries.getRecordingByShareTypeEffect(this.#client, graphql, shareType, this.#misoPackageId)),
    );
  }
  getRecordingAdminCapById(
    adminCapId: string,
  ): Promise<RecordingAdminCap> {
    return queries.getRecordingAdminCapById(this.#client, adminCapId);
  }
  getRecordingAdminCapByIdEffect(
    adminCapId: string,
  ) {
    return queries.getRecordingAdminCapByIdEffect(this.#client, adminCapId);
  }
  getOwnedRecordingAdminCaps(
    owner: string,
  ): Promise<RecordingAdminCap[]> {
    return queries.getOwnedRecordingAdminCaps(
      this.#client,
      owner,
      this.#misoPackageId,
    );
  }
  getOwnedRecordingAdminCapsEffect(
    owner: string,
  ) {
    return queries.getOwnedRecordingAdminCapsEffect(
      this.#client,
      owner,
      this.#misoPackageId,
    );
  }
  deriveRecordingAdminCapId(recordingId: string): string {
    return queries.deriveRecordingAdminCapId(recordingId, this.#misoPackageId);
  }

  // === Release ===

  getReleaseById(releaseId: string): Promise<Release> {
    return queries.getReleaseById(this.#client, releaseId);
  }
  getReleaseByIdEffect(releaseId: string) {
    return queries.getReleaseByIdEffect(this.#client, releaseId);
  }
  /** Read the shared canonical core `miso::release::ReleaseRegistry`. */
  getReleaseRegistryById(registryId: string) {
    return queries.getReleaseRegistryById(this.#client, registryId);
  }
  getReleaseRegistryByIdEffect(registryId: string) {
    return queries.getReleaseRegistryByIdEffect(this.#client, registryId);
  }
  getReleasesByIds(ids: string[]): Promise<Record<string, Release>> {
    return queries.getReleasesByIds(this.#client, ids);
  }
  getReleasesByIdsEffect(ids: string[]) {
    return queries.getReleasesByIdsEffect(this.#client, ids);
  }
  getReleaseAdminCapById(adminCapId: string): Promise<ReleaseAdminCap> {
    return queries.getReleaseAdminCapById(this.#client, adminCapId);
  }
  getReleaseAdminCapByIdEffect(adminCapId: string) {
    return queries.getReleaseAdminCapByIdEffect(this.#client, adminCapId);
  }
  deriveReleaseAdminCapId(releaseId: string): string {
    return queries.deriveReleaseAdminCapId(releaseId, this.#misoPackageId);
  }
  getOwnedReleaseAdminCaps(owner: string): Promise<ReleaseAdminCap[]> {
    return queries.getOwnedReleaseAdminCaps(
      this.#client,
      owner,
      this.#misoPackageId,
    );
  }
  getOwnedReleaseAdminCapsEffect(owner: string) {
    return queries.getOwnedReleaseAdminCapsEffect(
      this.#client,
      owner,
      this.#misoPackageId,
    );
  }
  // === Share Currency ===

  getShareCurrencyType(shareCurrencyId: string): Promise<string> {
    return queries.getShareCurrencyType(this.#client, shareCurrencyId);
  }
  getShareCurrencyTypeEffect(shareCurrencyId: string) {
    return queries.getShareCurrencyTypeEffect(this.#client, shareCurrencyId);
  }
  /**
   * The `TreasuryCap<shareType>` owned by `owner`. Takes the share TYPE — if you
   * hold only the `Currency` object id, resolve it first with
   * {@link getShareCurrencyType}.
   */
  getShareCurrencyTreasuryCap(
    shareType: string,
    owner: string,
  ): Promise<string> {
    return queries.getShareCurrencyTreasuryCap(this.#client, shareType, owner);
  }
  getShareCurrencyTreasuryCapEffect(
    shareType: string,
    owner: string,
  ) {
    return queries.getShareCurrencyTreasuryCapEffect(this.#client, shareType, owner);
  }

  // === Simulate-based reads (view) ===

  get view() {
    const client = this.#client;
    const misoPackageId = this.#misoPackageId;
    return {
      deriveTargetReleaseId: (params: view.DeriveTargetReleaseIdParams) =>
        view.deriveTargetReleaseId(client, misoPackageId, params),
    };
  }

  // === Generated type-safe Move calls (for tx.add) ===

  get call() {
    const pkg = this.#misoPackageId;
    return {
      composition: bindModulePackage(composition, pkg, REF_RETURNING_CALLS.composition),
      recording: bindModulePackage(recording, pkg, REF_RETURNING_CALLS.recording),
      release: bindModulePackage(release, pkg, REF_RETURNING_CALLS.release),
      track: bindModulePackage(track, pkg),
    };
  }

  // === Generated BCS structs (for parsing object/event content) ===

  get bcs() {
    return {
      Composition: composition.Composition,
      Recording: recording.Recording,
      Release: release.Release,
      Track: track.Track,
      CompositionPublishedEvent: composition.CompositionPublishedEvent,
      RecordingPublishedEvent: recording.RecordingPublishedEvent,
      ReleasePublishedEvent: release.ReleasePublishedEvent,
    };
  }

  // === Event parsers ===

  get parse() {
    return {
      compositionPublishedEvent: parsers.parseCompositionPublishedEvent,
      recordingPublishedEvent: parsers.parseRecordingPublishedEvent,
      compositionSharesGrantedEvent:
        parsers.parseCompositionSharesGrantedEvent,
      releasePublishedEvent: parsers.parseReleasePublishedEvent,
      releaseRegistryCreatedEvent: parsers.parseReleaseRegistryCreatedEvent,
      events: eventParsers,
    };
  }

  #requireGraphQL(): SuiGraphQLClient {
    if (!this.#graphqlClient) {
      throw new Error(
        "GraphQL client required. Pass graphqlClient to miso() options.",
      );
    }
    return this.#graphqlClient;
  }
}

/** @deprecated Prefer the layer-specific `MisoProtocolClient` name. */
export { MisoProtocolClient as MisoClient };
