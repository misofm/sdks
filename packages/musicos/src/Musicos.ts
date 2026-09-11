// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The `Musicos` service: reads over the Miso object model (Composition,
 * Recording, Release, Track), built on `Sui` per `sui-effect/docs/extensions.md`.
 *
 * Every member is `Effect.fn("Musicos.<name>", ..., Effect.provideService(Sui, sui))`,
 * so `R` is empty and a consumer never has to know the layer holds a `Sui`.
 * Non-generic types (`Release`, `ReleaseRegistry`, `ReleaseAdminCap`) read
 * through `sui.getObject(id, { schema })`, which checks the object's type tag
 * before it parses a byte. `Composition<T>`, `Recording<R, C>` and their two
 * admin caps are generic, but sui-effect's bridge now matches every
 * instantiation of a **bare** expected tag — see `schema.ts` — so they read
 * through the exact same path; there is no separate "generic" read function.
 * Nothing here submits: `Musicos` has no `Tx.run` member because every write
 * to the object model is a fragment in `transactions.ts`, composed and run
 * once by the consumer.
 */
import { bcs } from "@mysten/sui/bcs";
import { Config, Context, Effect, Layer, Option, Result, Stream } from "effect";
import {
  BuildError,
  DecodeError,
  ObjectId,
  type Recipe,
  StructTag,
  Sui,
  SuiAddress,
  SuiSchema,
  type BatchItemError,
  type ObjectDeleted,
  type ObjectNotFound,
  type ObjectUnavailable,
  type SimulationFailed,
  type TransportError,
} from "sui-effect";
import * as release from "./contracts/musicos/release.ts";
import {
  MISO_DEPLOYMENTS,
  normalizeMisoDeployment,
  normalizeMisoProtocolDeployment,
  protocolDeployment,
  type MisoDeployment,
  type MisoProtocolDeployment,
} from "./deployments.ts";
import { MusicosDeploymentInvalid, MusicosTreasuryCapNotFound } from "./errors.ts";
import { asU64, asU256, type UnsignedInput } from "./numeric.ts";
import * as schema from "./schema.ts";
import { extractTypeParam, extractTypeParams2 } from "./type-params.ts";
import {
  Composition,
  CompositionAdminCap,
  Recording,
  RecordingAdminCap,
  Release,
  ReleaseAdminCap,
  ReleaseRegistry,
} from "./types.ts";

/**
 * Options for {@link Musicos.layer}. Omit `deployment` to use the manifest
 * this release bundles for `sui.network`; the default fails
 * {@link MusicosDeploymentInvalid} at layer build when there is none.
 */
export interface MusicosOptions {
  readonly deployment?: MisoProtocolDeployment | MisoDeployment;
}

/** Every failure reading one object by id can produce. */
export type ReadError = ObjectNotFound | ObjectDeleted | ObjectUnavailable | DecodeError | TransportError;

/** Every failure listing objects an address owns can produce. */
export type OwnedReadError = DecodeError | TransportError;

export interface DeriveTargetReleaseIdParams {
  /** Sender for the simulation (any address; not charged). */
  readonly sender: SuiAddress;
  /** Recording object ids, in track order. */
  readonly recordingIds: ReadonlyArray<ObjectId>;
  /** Per-track split basis points, aligned to `recordingIds`. */
  readonly splitBps: ReadonlyArray<UnsignedInput>;
  /** The release nonce (u256 as a decimal string, bigint or number). */
  readonly nonce: UnsignedInput;
  /** Shared canonical core `miso::release::ReleaseRegistry` object id. */
  readonly releaseRegistryId: ObjectId;
}

export interface MusicosService {
  /** The published `musicos` package this service reads. */
  readonly packageId: ObjectId;
  /** The exact deployment this service was built with. */
  readonly deployment: MisoProtocolDeployment;

  /** Fails with: `ObjectNotFound`, `ObjectDeleted`, `ObjectUnavailable`, `DecodeError`, `TransportError`. */
  readonly getCompositionById: (id: ObjectId) => Effect.Effect<Composition, ReadError>;
  /** Fails with: `TransportError`. One `Result` per id, in request order. */
  readonly getCompositionsByIds: (
    ids: ReadonlyArray<ObjectId>,
  ) => Effect.Effect<ReadonlyArray<Result.Result<Composition, BatchItemError>>, TransportError>;
  /** The share type `T` of `Composition<T>`. Fails with: `ObjectNotFound`, `ObjectDeleted`, `ObjectUnavailable`, `DecodeError`, `TransportError`. */
  readonly getCompositionShareType: (id: ObjectId) => Effect.Effect<string, ReadError>;
  /** Fails with: `ObjectNotFound`, `ObjectDeleted`, `ObjectUnavailable`, `DecodeError`, `TransportError`. */
  readonly getCompositionAdminCapById: (id: ObjectId) => Effect.Effect<CompositionAdminCap, ReadError>;
  /** Fails with: `DecodeError`, `TransportError`. */
  readonly getOwnedCompositionAdminCaps: (owner: SuiAddress) => Effect.Effect<ReadonlyArray<CompositionAdminCap>, OwnedReadError>;

  /** Fails with: `ObjectNotFound`, `ObjectDeleted`, `ObjectUnavailable`, `DecodeError`, `TransportError`. */
  readonly getRecordingById: (id: ObjectId) => Effect.Effect<Recording, ReadError>;
  /** Fails with: `TransportError`. One `Result` per id, in request order. */
  readonly getRecordingsByIds: (
    ids: ReadonlyArray<ObjectId>,
  ) => Effect.Effect<ReadonlyArray<Result.Result<Recording, BatchItemError>>, TransportError>;
  /** The recording's own `RecordingShare`. Fails with: `ObjectNotFound`, `ObjectDeleted`, `ObjectUnavailable`, `DecodeError`, `TransportError`. */
  readonly getRecordingShareType: (id: ObjectId) => Effect.Effect<string, ReadError>;
  /** Both share types, as `[RecordingShare, CompositionShare]`. Fails with: `ObjectNotFound`, `ObjectDeleted`, `ObjectUnavailable`, `DecodeError`, `TransportError`. */
  readonly getRecordingShareTypes: (id: ObjectId) => Effect.Effect<readonly [string, string], ReadError>;
  /** Fails with: `ObjectNotFound`, `ObjectDeleted`, `ObjectUnavailable`, `DecodeError`, `TransportError`. */
  readonly getRecordingAdminCapById: (id: ObjectId) => Effect.Effect<RecordingAdminCap, ReadError>;
  /** Fails with: `DecodeError`, `TransportError`. */
  readonly getOwnedRecordingAdminCaps: (owner: SuiAddress) => Effect.Effect<ReadonlyArray<RecordingAdminCap>, OwnedReadError>;

  /** Fails with: `ObjectNotFound`, `ObjectDeleted`, `ObjectUnavailable`, `DecodeError`, `TransportError`. */
  readonly getReleaseById: (id: ObjectId) => Effect.Effect<Release, ReadError>;
  /** Fails with: `TransportError`. One `Result` per id, in request order. */
  readonly getReleasesByIds: (
    ids: ReadonlyArray<ObjectId>,
  ) => Effect.Effect<ReadonlyArray<Result.Result<Release, BatchItemError>>, TransportError>;
  /** Reads the shared canonical core `miso::release::ReleaseRegistry`. Fails with: `ObjectNotFound`, `ObjectDeleted`, `ObjectUnavailable`, `DecodeError`, `TransportError`. */
  readonly getReleaseRegistryById: (id: ObjectId) => Effect.Effect<ReleaseRegistry, ReadError>;
  /** Fails with: `ObjectNotFound`, `ObjectDeleted`, `ObjectUnavailable`, `DecodeError`, `TransportError`. */
  readonly getReleaseAdminCapById: (id: ObjectId) => Effect.Effect<ReleaseAdminCap, ReadError>;
  /** Fails with: `DecodeError`, `TransportError`. */
  readonly getOwnedReleaseAdminCaps: (owner: SuiAddress) => Effect.Effect<ReadonlyArray<ReleaseAdminCap>, OwnedReadError>;

  /** The share type `T` of `Currency<T>`. Fails with: `ObjectNotFound`, `ObjectDeleted`, `ObjectUnavailable`, `DecodeError`, `TransportError`. */
  readonly getShareCurrencyType: (currencyId: ObjectId) => Effect.Effect<string, ReadError>;
  /**
   * The `TreasuryCap<shareType>` owned by `owner`.
   *
   * Fails with: `musicos/TreasuryCapNotFound` (no such cap for that owner), `TransportError`.
   */
  readonly getShareCurrencyTreasuryCap: (
    shareType: string,
    owner: SuiAddress,
  ) => Effect.Effect<ObjectId, MusicosTreasuryCapNotFound | TransportError>;

  /** Simulate-based reads. A namespace, which the Promise face maps recursively. */
  readonly view: {
    /**
     * Derives the release id the on-chain `release::new` will produce for
     * these inputs, via a simulated call to `release::derive_target_release_id`.
     *
     * Fails with: `SimulationFailed`, `BuildError` (a `recordingIds`/`splitBps`
     * length mismatch, reported by the recipe), `DecodeError`, `TransportError`.
     */
    readonly deriveTargetReleaseId: (
      params: DeriveTargetReleaseIdParams,
    ) => Effect.Effect<ObjectId, SimulationFailed | BuildError | DecodeError | TransportError>;
  };
}

const bareCompositionAdminCapType = (packageId: string) => `${packageId}::composition::CompositionAdminCap`;
const bareRecordingAdminCapType = (packageId: string) => `${packageId}::recording::RecordingAdminCap`;
const bareReleaseAdminCapType = (packageId: string) => `${packageId}::release::ReleaseAdminCap`;

const shareTypeError = (objectId: ObjectId, expectedType: string) => (cause: unknown) =>
  new DecodeError({ objectId, expectedType, issue: cause instanceof Error ? cause.message : String(cause) });

const make = (deployment: MisoProtocolDeployment): Effect.Effect<MusicosService, never, Sui> =>
  Effect.gen(function* () {
    const sui = yield* Sui;
    const packageId = ObjectId.make(deployment.packageId);

    const CompositionContent = schema.compositionContent(deployment.packageId);
    const CompositionAdminCapContent = schema.compositionAdminCapContent(deployment.packageId);
    const RecordingContent = schema.recordingContent(deployment.packageId);
    const RecordingAdminCapContent = schema.recordingAdminCapContent(deployment.packageId);
    const ReleaseContent = schema.releaseContent(deployment.packageId);
    const ReleaseRegistryContent = schema.releaseRegistryContent(deployment.packageId);
    const ReleaseAdminCapContent = schema.releaseAdminCapContent(deployment.packageId);

    // === Composition ===

    const getCompositionById = Effect.fn("Musicos.getCompositionById")(function* (id: ObjectId) {
      const object = yield* sui.getObject(id, { schema: CompositionContent });
      return object.content;
    }, Effect.provideService(Sui, sui));

    const getCompositionsByIds = Effect.fn("Musicos.getCompositionsByIds")(function* (ids: ReadonlyArray<ObjectId>) {
      const results = yield* sui.getObjects(ids, { schema: CompositionContent });
      return results.map((result) => Result.map(result, (object) => object.content));
    }, Effect.provideService(Sui, sui));

    const getCompositionShareType = Effect.fn("Musicos.getCompositionShareType")(function* (id: ObjectId) {
      const object = yield* sui.getObject(id);
      return yield* Effect.try({
        try: () => extractTypeParam(object.type),
        catch: shareTypeError(id, `${deployment.packageId}::composition::Composition`),
      });
    }, Effect.provideService(Sui, sui));

    const getCompositionAdminCapById = Effect.fn("Musicos.getCompositionAdminCapById")(function* (id: ObjectId) {
      const object = yield* sui.getObject(id, { schema: CompositionAdminCapContent });
      const shareType = yield* Effect.try({
        try: () => extractTypeParam(object.type),
        catch: shareTypeError(id, bareCompositionAdminCapType(deployment.packageId)),
      });
      return new CompositionAdminCap({ id: object.id, shareType });
    }, Effect.provideService(Sui, sui));

    const getOwnedCompositionAdminCaps = Effect.fn("Musicos.getOwnedCompositionAdminCaps")(function* (owner: SuiAddress) {
      const capType = StructTag.make(bareCompositionAdminCapType(deployment.packageId));
      const objects = yield* Stream.runCollect(sui.streamOwnedObjects(owner, { type: capType }));
      return yield* Effect.forEach(objects, (object) =>
        Effect.try({
          try: () => extractTypeParam(object.type),
          catch: shareTypeError(object.id, capType),
        }).pipe(Effect.map((shareType) => new CompositionAdminCap({ id: object.id, shareType }))),
      );
    }, Effect.provideService(Sui, sui));

    // === Recording ===

    const getRecordingById = Effect.fn("Musicos.getRecordingById")(function* (id: ObjectId) {
      const object = yield* sui.getObject(id, { schema: RecordingContent });
      return object.content;
    }, Effect.provideService(Sui, sui));

    const getRecordingsByIds = Effect.fn("Musicos.getRecordingsByIds")(function* (ids: ReadonlyArray<ObjectId>) {
      const results = yield* sui.getObjects(ids, { schema: RecordingContent });
      return results.map((result) => Result.map(result, (object) => object.content));
    }, Effect.provideService(Sui, sui));

    const getRecordingShareTypes = Effect.fn("Musicos.getRecordingShareTypes")(function* (id: ObjectId) {
      const object = yield* sui.getObject(id);
      return yield* Effect.try({
        try: () => extractTypeParams2(object.type),
        catch: shareTypeError(id, `${deployment.packageId}::recording::Recording`),
      });
    }, Effect.provideService(Sui, sui));

    const getRecordingShareType = Effect.fn("Musicos.getRecordingShareType")(function* (id: ObjectId) {
      const [recordingShareType] = yield* getRecordingShareTypes(id);
      return recordingShareType;
    }, Effect.provideService(Sui, sui));

    const getRecordingAdminCapById = Effect.fn("Musicos.getRecordingAdminCapById")(function* (id: ObjectId) {
      const object = yield* sui.getObject(id, { schema: RecordingAdminCapContent });
      const shareType = yield* Effect.try({
        try: () => extractTypeParam(object.type),
        catch: shareTypeError(id, bareRecordingAdminCapType(deployment.packageId)),
      });
      return new RecordingAdminCap({ id: object.id, shareType });
    }, Effect.provideService(Sui, sui));

    const getOwnedRecordingAdminCaps = Effect.fn("Musicos.getOwnedRecordingAdminCaps")(function* (owner: SuiAddress) {
      const capType = StructTag.make(bareRecordingAdminCapType(deployment.packageId));
      const objects = yield* Stream.runCollect(sui.streamOwnedObjects(owner, { type: capType }));
      return yield* Effect.forEach(objects, (object) =>
        Effect.try({
          try: () => extractTypeParam(object.type),
          catch: shareTypeError(object.id, capType),
        }).pipe(Effect.map((shareType) => new RecordingAdminCap({ id: object.id, shareType }))),
      );
    }, Effect.provideService(Sui, sui));

    // === Release ===

    const getReleaseById = Effect.fn("Musicos.getReleaseById")(function* (id: ObjectId) {
      const object = yield* sui.getObject(id, { schema: ReleaseContent });
      return object.content;
    }, Effect.provideService(Sui, sui));

    const getReleasesByIds = Effect.fn("Musicos.getReleasesByIds")(function* (ids: ReadonlyArray<ObjectId>) {
      const results = yield* sui.getObjects(ids, { schema: ReleaseContent });
      return results.map((result) => Result.map(result, (object) => object.content));
    }, Effect.provideService(Sui, sui));

    const getReleaseRegistryById = Effect.fn("Musicos.getReleaseRegistryById")(function* (id: ObjectId) {
      const object = yield* sui.getObject(id, { schema: ReleaseRegistryContent });
      return object.content;
    }, Effect.provideService(Sui, sui));

    const getReleaseAdminCapById = Effect.fn("Musicos.getReleaseAdminCapById")(function* (id: ObjectId) {
      const object = yield* sui.getObject(id, { schema: ReleaseAdminCapContent });
      return object.content;
    }, Effect.provideService(Sui, sui));

    const getOwnedReleaseAdminCaps = Effect.fn("Musicos.getOwnedReleaseAdminCaps")(function* (owner: SuiAddress) {
      const capType = StructTag.make(bareReleaseAdminCapType(deployment.packageId));
      const objects = yield* Stream.runCollect(sui.streamOwnedObjects(owner, { type: capType }));
      return yield* Effect.forEach(objects, (object) =>
        SuiSchema.decode(ReleaseAdminCapContent, object.content, { objectId: object.id, actualType: object.type }),
      );
    }, Effect.provideService(Sui, sui));

    // === Share Currency ===

    const getShareCurrencyType = Effect.fn("Musicos.getShareCurrencyType")(function* (id: ObjectId) {
      const object = yield* sui.getObject(id);
      return yield* Effect.try({
        try: () => extractTypeParam(object.type),
        catch: shareTypeError(id, "0x2::coin::Currency"),
      });
    }, Effect.provideService(Sui, sui));

    const getShareCurrencyTreasuryCap = Effect.fn("Musicos.getShareCurrencyTreasuryCap")(function* (
      shareType: string,
      owner: SuiAddress,
    ) {
      const capType = StructTag.make(`0x2::coin::TreasuryCap<${shareType}>`);
      const objects = yield* Stream.runCollect(sui.streamOwnedObjects(owner, { type: capType }));
      const first = objects[0];
      if (first === undefined) {
        return yield* new MusicosTreasuryCapNotFound({ shareType, owner });
      }
      return first.id;
    }, Effect.provideService(Sui, sui));

    // === view ===

    const deriveTargetReleaseId = Effect.fn("Musicos.view.deriveTargetReleaseId")(function* (
      params: DeriveTargetReleaseIdParams,
    ) {
      const recipe: Recipe = (tx) => {
        if (params.recordingIds.length !== params.splitBps.length) {
          throw new Error(
            `deriveTargetReleaseId: recordingIds (${params.recordingIds.length}) and splitBps (${params.splitBps.length}) length mismatch.`,
          );
        }
        tx.setSender(params.sender);
        tx.add(
          release.deriveTargetReleaseId({
            package: deployment.packageId,
            arguments: [
              params.releaseRegistryId,
              [...params.recordingIds],
              params.splitBps.map((v) => asU64("track split bps", v)),
              asU256("release nonce", params.nonce),
            ],
          }),
        );
      };
      const address = yield* sui.view(recipe, bcs.Address);
      return ObjectId.make(address);
    }, Effect.provideService(Sui, sui));

    return {
      packageId,
      deployment,
      getCompositionById,
      getCompositionsByIds,
      getCompositionShareType,
      getCompositionAdminCapById,
      getOwnedCompositionAdminCaps,
      getRecordingById,
      getRecordingsByIds,
      getRecordingShareType,
      getRecordingShareTypes,
      getRecordingAdminCapById,
      getOwnedRecordingAdminCaps,
      getReleaseById,
      getReleasesByIds,
      getReleaseRegistryById,
      getReleaseAdminCapById,
      getOwnedReleaseAdminCaps,
      getShareCurrencyType,
      getShareCurrencyTreasuryCap,
      view: { deriveTargetReleaseId },
    };
  });

function isFullDeployment(deployment: MisoProtocolDeployment | MisoDeployment): deployment is MisoDeployment {
  return "musicos" in deployment;
}

const deploymentInvalid = (cause: unknown): MusicosDeploymentInvalid =>
  new MusicosDeploymentInvalid({ message: cause instanceof Error ? cause.message : String(cause) });

/** Picks the deployment `Musicos.layer` builds over: the options given, or the bundled manifest for `sui.network`. */
const resolveDeployment = (options: MusicosOptions): Effect.Effect<MisoProtocolDeployment, MusicosDeploymentInvalid, Sui> =>
  Effect.gen(function* () {
    const supplied = options.deployment;
    if (supplied !== undefined) {
      return yield* Effect.try({
        try: () =>
          isFullDeployment(supplied) ? protocolDeployment(normalizeMisoDeployment(supplied)) : normalizeMisoProtocolDeployment(supplied),
        catch: deploymentInvalid,
      });
    }
    const sui = yield* Sui;
    const bundled = (MISO_DEPLOYMENTS as Partial<Record<string, MisoDeployment>>)[sui.network];
    if (bundled === undefined) {
      return yield* new MusicosDeploymentInvalid({
        message: `@misofm/musicos: no verified Miso deployment is bundled for network "${sui.network}". Pass an explicit deployment.`,
      });
    }
    return protocolDeployment(bundled);
  });

/** A fixed, already-normalized package id `layerTest` builds over when the caller does not supply one. */
const TEST_PACKAGE_ID = `0x${"7".repeat(64)}`;

/**
 * The Miso object-model service: Composition, Recording, Release, Track,
 * built on `Sui`. The identifier is a runtime key and never changes after
 * publication.
 */
export class Musicos extends Context.Service<Musicos, MusicosService>()("@misofm/musicos/Musicos") {
  /**
   * The live layer. Uses `options.deployment` when given; otherwise reads
   * `sui.network` and picks this release's bundled manifest.
   *
   * Fails with: `MusicosDeploymentInvalid` (an invalid `options.deployment`,
   * or no bundled manifest for the client's network).
   */
  static readonly layer = (options: MusicosOptions = {}): Layer.Layer<Musicos, MusicosDeploymentInvalid, Sui> =>
    Layer.unwrap(Effect.map(resolveDeployment(options), (deployment) => Layer.effect(Musicos, make(deployment))));

  /**
   * The same layer from `MUSICOS_PACKAGE_ID`, falling back to the bundled
   * manifest for `sui.network` when it is unset.
   *
   * Fails with: `ConfigError`, `MusicosDeploymentInvalid`.
   */
  static readonly layerConfig: Layer.Layer<Musicos, Config.ConfigError | MusicosDeploymentInvalid, Sui> = Layer.unwrap(
    Effect.gen(function* () {
      const packageId = yield* Config.nonEmptyString("PACKAGE_ID").pipe(Config.nested("MUSICOS"), Config.option);
      return Musicos.layer(Option.isSome(packageId) ? { deployment: { packageId: packageId.value } } : undefined);
    }),
  );

  /**
   * The real service over a fixed test package id (or the one given).
   * Compose with `layerExtensionTest` from `sui-effect/testing`. Never fails.
   */
  static readonly layerTest = (state: { readonly packageId?: string } = {}): Layer.Layer<Musicos, never, Sui> =>
    Layer.effect(Musicos, make(protocolDeployment(normalizeMisoDeployment({ musicos: state.packageId ?? TEST_PACKAGE_ID }))));
}
