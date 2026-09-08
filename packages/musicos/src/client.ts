// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

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
import * as composition from "./contracts/musicos/composition.ts";
import * as recording from "./contracts/musicos/recording.ts";
import * as release from "./contracts/musicos/release.ts";
import * as track from "./contracts/musicos/track.ts";

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
  return "musicos" in deployment;
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

  constructor(client: ClientWithCoreApi, options: MisoProtocolClientOptions) {
    this.#client = client;
    this.#graphqlClient = options.graphqlClient;
    this.#deployment = normalizeMisoProtocolDeployment(options.deployment);
    this.#packageDeployment = options.packageDeployment
      ? normalizeMisoDeployment(options.packageDeployment)
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
        "@misofm/musicos: full package bindings require a complete MisoDeployment. " +
          "Pass the verified post-publish manifest to miso({ deployment }).",
      );
    }
    return new MisoPackageBindings(this.#packageDeployment);
  }

  get #misoPackageId(): string {
    return this.#deployment.packageId;
  }

  // === Composition ===

  async getCompositionById(compositionId: string): Promise<Composition> {
    return queries.getCompositionById(this.#client, compositionId);
  }
  async getCompositionsByIds(
    ids: string[],
  ): Promise<Record<string, Composition>> {
    return queries.getCompositionsByIds(this.#client, ids);
  }
  async getWorksByIds(ids: queries.WorkIds): Promise<queries.WorksById> {
    return queries.getWorksByIds(this.#client, ids);
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
  async getCompositionShareType(compositionId: string): Promise<string> {
    return queries.getCompositionShareType(this.#client, compositionId);
  }
  async getCompositionByShareType(shareType: string): Promise<Composition> {
    return queries.getCompositionByShareType(
      this.#client,
      this.#requireGraphQL(),
      shareType,
      this.#misoPackageId,
    );
  }
  async getCompositionAdminCapById(
    adminCapId: string,
  ): Promise<CompositionAdminCap> {
    return queries.getCompositionAdminCapById(this.#client, adminCapId);
  }
  async getOwnedCompositionAdminCaps(
    owner: string,
  ): Promise<CompositionAdminCap[]> {
    return queries.getOwnedCompositionAdminCaps(
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

  async getRecordingById(recordingId: string): Promise<Recording> {
    return queries.getRecordingById(this.#client, recordingId);
  }
  async getRecordingsByIds(ids: string[]): Promise<Record<string, Recording>> {
    return queries.getRecordingsByIds(this.#client, ids);
  }
  async getRecordingShareType(recordingId: string): Promise<string> {
    return queries.getRecordingShareType(this.#client, recordingId);
  }
  async getRecordingByShareType(shareType: string): Promise<Recording> {
    return queries.getRecordingByShareType(
      this.#client,
      this.#requireGraphQL(),
      shareType,
      this.#misoPackageId,
    );
  }
  async getRecordingAdminCapById(
    adminCapId: string,
  ): Promise<RecordingAdminCap> {
    return queries.getRecordingAdminCapById(this.#client, adminCapId);
  }
  async getOwnedRecordingAdminCaps(
    owner: string,
  ): Promise<RecordingAdminCap[]> {
    return queries.getOwnedRecordingAdminCaps(
      this.#client,
      owner,
      this.#misoPackageId,
    );
  }
  deriveRecordingAdminCapId(recordingId: string): string {
    return queries.deriveRecordingAdminCapId(recordingId, this.#misoPackageId);
  }

  // === Release ===

  async getReleaseById(releaseId: string): Promise<Release> {
    return queries.getReleaseById(this.#client, releaseId);
  }
  /** Read the shared canonical core `miso::release::ReleaseRegistry`. */
  async getReleaseRegistryById(registryId: string) {
    return queries.getReleaseRegistryById(this.#client, registryId);
  }
  async getReleasesByIds(ids: string[]): Promise<Record<string, Release>> {
    return queries.getReleasesByIds(this.#client, ids);
  }
  async getReleaseAdminCapById(adminCapId: string): Promise<ReleaseAdminCap> {
    return queries.getReleaseAdminCapById(this.#client, adminCapId);
  }
  deriveReleaseAdminCapId(releaseId: string): string {
    return queries.deriveReleaseAdminCapId(releaseId, this.#misoPackageId);
  }
  async getOwnedReleaseAdminCaps(owner: string): Promise<ReleaseAdminCap[]> {
    return queries.getOwnedReleaseAdminCaps(
      this.#client,
      owner,
      this.#misoPackageId,
    );
  }
  // === Share Currency ===

  async getShareCurrencyType(shareCurrencyId: string): Promise<string> {
    return queries.getShareCurrencyType(this.#client, shareCurrencyId);
  }
  /**
   * The `TreasuryCap<shareType>` owned by `owner`. Takes the share TYPE — if you
   * hold only the `Currency` object id, resolve it first with
   * {@link getShareCurrencyType}.
   */
  async getShareCurrencyTreasuryCap(
    shareType: string,
    owner: string,
  ): Promise<string> {
    return queries.getShareCurrencyTreasuryCap(this.#client, shareType, owner);
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
