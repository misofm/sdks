// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
  ClientWithCoreApi,
  SuiClientRegistration,
} from "@mysten/sui/client";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { Effect } from "effect";
import {
  GraphQLUnavailableError,
  SuiClient,
  SuiGraphQL,
  type BcsDecodeError,
  type ObjectNotFoundError,
  type SuiRpcError,
} from "@misofm/effect";
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
  ReleaseRegistry,
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
 * const composition = await Effect.runPromise(client.miso.getCompositionById('0x...'));
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

  /** Provides `SuiClient` from this client's `ClientWithCoreApi`, so a method's program has `R = never`. */
  #run<A, E>(effect: Effect.Effect<A, E, SuiClient>): Effect.Effect<A, E> {
    return effect.pipe(Effect.provide(SuiClient.layer(this.#client)));
  }

  // === Composition ===

  getCompositionById(compositionId: string): Effect.Effect<Composition, ObjectNotFoundError | SuiRpcError | BcsDecodeError> {
    return this.#run(queries.getCompositionById(compositionId));
  }
  getCompositionsByIds(ids: string[]): Effect.Effect<Record<string, Composition>, SuiRpcError | BcsDecodeError> {
    return this.#run(queries.getCompositionsByIds(ids));
  }
  getWorksByIds(ids: queries.WorkIds): Effect.Effect<queries.WorksById, SuiRpcError | BcsDecodeError> {
    return this.#run(queries.getWorksByIds(ids));
  }
  getWorkAddressesByShareTypes(
    shareTypes: queries.WorkShareTypes,
  ): Effect.Effect<queries.WorkAddressesByShareType, SuiRpcError | GraphQLUnavailableError> {
    if (!this.#graphqlClient) return Effect.fail(new GraphQLUnavailableError());
    return queries
      .getWorkAddressesByShareTypes(shareTypes, this.#misoPackageId)
      .pipe(Effect.provide(SuiGraphQL.layer(this.#graphqlClient)));
  }
  getCompositionShareType(compositionId: string): Effect.Effect<string, ObjectNotFoundError | SuiRpcError> {
    return this.#run(queries.getCompositionShareType(compositionId));
  }
  getCompositionByShareType(
    shareType: string,
  ): Effect.Effect<Composition, ObjectNotFoundError | SuiRpcError | BcsDecodeError | GraphQLUnavailableError> {
    if (!this.#graphqlClient) return Effect.fail(new GraphQLUnavailableError());
    return queries.getCompositionByShareType(shareType, this.#misoPackageId).pipe(
      Effect.provide(SuiGraphQL.layer(this.#graphqlClient)),
      Effect.provide(SuiClient.layer(this.#client)),
    );
  }
  getCompositionAdminCapById(adminCapId: string): Effect.Effect<CompositionAdminCap, ObjectNotFoundError | SuiRpcError> {
    return this.#run(queries.getCompositionAdminCapById(adminCapId));
  }
  getOwnedCompositionAdminCaps(owner: string): Effect.Effect<CompositionAdminCap[], SuiRpcError> {
    return this.#run(queries.getOwnedCompositionAdminCaps(owner, this.#misoPackageId));
  }
  deriveCompositionAdminCapId(compositionId: string): string {
    return queries.deriveCompositionAdminCapId(compositionId, this.#misoPackageId);
  }

  // === Recording ===

  getRecordingById(recordingId: string): Effect.Effect<Recording, ObjectNotFoundError | SuiRpcError | BcsDecodeError> {
    return this.#run(queries.getRecordingById(recordingId));
  }
  getRecordingsByIds(ids: string[]): Effect.Effect<Record<string, Recording>, SuiRpcError | BcsDecodeError> {
    return this.#run(queries.getRecordingsByIds(ids));
  }
  getRecordingShareType(recordingId: string): Effect.Effect<string, ObjectNotFoundError | SuiRpcError> {
    return this.#run(queries.getRecordingShareType(recordingId));
  }
  getRecordingByShareType(
    shareType: string,
  ): Effect.Effect<Recording, ObjectNotFoundError | SuiRpcError | BcsDecodeError | GraphQLUnavailableError> {
    if (!this.#graphqlClient) return Effect.fail(new GraphQLUnavailableError());
    return queries.getRecordingByShareType(shareType, this.#misoPackageId).pipe(
      Effect.provide(SuiGraphQL.layer(this.#graphqlClient)),
      Effect.provide(SuiClient.layer(this.#client)),
    );
  }
  getRecordingAdminCapById(adminCapId: string): Effect.Effect<RecordingAdminCap, ObjectNotFoundError | SuiRpcError> {
    return this.#run(queries.getRecordingAdminCapById(adminCapId));
  }
  getOwnedRecordingAdminCaps(owner: string): Effect.Effect<RecordingAdminCap[], SuiRpcError> {
    return this.#run(queries.getOwnedRecordingAdminCaps(owner, this.#misoPackageId));
  }
  deriveRecordingAdminCapId(recordingId: string): string {
    return queries.deriveRecordingAdminCapId(recordingId, this.#misoPackageId);
  }

  // === Release ===

  getReleaseById(releaseId: string): Effect.Effect<Release, ObjectNotFoundError | SuiRpcError | BcsDecodeError> {
    return this.#run(queries.getReleaseById(releaseId));
  }
  /** Read the shared canonical core `miso::release::ReleaseRegistry`. */
  getReleaseRegistryById(registryId: string): Effect.Effect<ReleaseRegistry, ObjectNotFoundError | SuiRpcError | BcsDecodeError> {
    return this.#run(queries.getReleaseRegistryById(registryId));
  }
  getReleasesByIds(ids: string[]): Effect.Effect<Record<string, Release>, SuiRpcError | BcsDecodeError> {
    return this.#run(queries.getReleasesByIds(ids));
  }
  getReleaseAdminCapById(adminCapId: string): Effect.Effect<ReleaseAdminCap, ObjectNotFoundError | SuiRpcError> {
    return this.#run(queries.getReleaseAdminCapById(adminCapId));
  }
  deriveReleaseAdminCapId(releaseId: string): string {
    return queries.deriveReleaseAdminCapId(releaseId, this.#misoPackageId);
  }
  getOwnedReleaseAdminCaps(owner: string): Effect.Effect<ReleaseAdminCap[], SuiRpcError> {
    return this.#run(queries.getOwnedReleaseAdminCaps(owner, this.#misoPackageId));
  }

  // === Share Currency ===

  getShareCurrencyType(shareCurrencyId: string): Effect.Effect<string, ObjectNotFoundError | SuiRpcError> {
    return this.#run(queries.getShareCurrencyType(shareCurrencyId));
  }
  /**
   * The `TreasuryCap<shareType>` owned by `owner`. Takes the share TYPE — if you
   * hold only the `Currency` object id, resolve it first with
   * {@link getShareCurrencyType}.
   */
  getShareCurrencyTreasuryCap(shareType: string, owner: string): Effect.Effect<string, SuiRpcError> {
    return this.#run(queries.getShareCurrencyTreasuryCap(shareType, owner));
  }

  // === Simulate-based reads (view) ===

  get view() {
    const misoPackageId = this.#misoPackageId;
    return {
      deriveTargetReleaseId: (params: view.DeriveTargetReleaseIdParams) =>
        this.#run(view.deriveTargetReleaseId(misoPackageId, params)),
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
}

/** @deprecated Prefer the layer-specific `MisoProtocolClient` name. */
export { MisoProtocolClient as MisoClient };
