/**
 * The `Partyos` service: every read and PTB fragment the PartyOS object model
 * offers, per sui-effect's `docs/extensions.md`. Every member returns an
 * `Effect` (or a plain `Recipe`) with a closed error union, reads through
 * `Sui`, and the layer captures `Sui` once so no member's requirement
 * channel carries anything.
 */
import { Config, Context, Effect, Layer, Option, Result, Schema, Stream } from "effect";
import { normalizeStructTag } from "@mysten/sui/utils";
import {
  ObjectId,
  Sui,
  SuiSchema,
  TransportError,
  type DecodeError,
  type Recipe,
  type SuiService,
} from "sui-effect";
import * as party from "./contracts/partyos/party.ts";
import {
  getPartyDeployment,
  normalizePartyDeployment,
  validatePartyDeployment,
  type PartyDeployment,
} from "./deployments.ts";
import { PartyNotFound, PartyosDeploymentError, type PartyBatchItemError, type PartyReadError } from "./errors.ts";
import { partyContent } from "./schema.ts";
import {
  acceptInvite,
  createGroupParty,
  createIndividualParty,
  declineInvite,
  inviteParty,
  leaveGroup,
  removeMember,
  revokeInvite,
  setName,
  type AcceptInviteParams,
  type CreatePartyParams,
  type DeclineInviteParams,
  type InvitePartyParams,
  type LeaveGroupParams,
  type RemoveMemberParams,
  type RevokeInviteParams,
  type SetNameParams,
} from "./transactions.ts";
import type { Party } from "./types.ts";

/** The 9 `transactions.ts` builders with `partyPackageId` bound to the deployment. */
export interface BoundBuilders {
  readonly createIndividualParty: (p: Omit<CreatePartyParams, "partyPackageId">) => Recipe;
  readonly createGroupParty: (p: Omit<CreatePartyParams, "partyPackageId">) => Recipe;
  readonly setName: (p: Omit<SetNameParams, "partyPackageId">) => Recipe;
  readonly inviteParty: (p: Omit<InvitePartyParams, "partyPackageId">) => Recipe;
  readonly acceptInvite: (p: Omit<AcceptInviteParams, "partyPackageId">) => Recipe;
  readonly declineInvite: (p: Omit<DeclineInviteParams, "partyPackageId">) => Recipe;
  readonly revokeInvite: (p: Omit<RevokeInviteParams, "partyPackageId">) => Recipe;
  readonly leaveGroup: (p: Omit<LeaveGroupParams, "partyPackageId">) => Recipe;
  readonly removeMember: (p: Omit<RemoveMemberParams, "partyPackageId">) => Recipe;
}

/** The PartyOS object model, as an Effect service. */
export interface PartyosService {
  /** The deployment this instance was bound to. */
  readonly deployment: PartyDeployment;
  /**
   * Reads one `Party` object and decodes it.
   *
   * Fails with: `PartyNotFound` (missing or deleted), `DecodeError` (not a
   * `Party` of this deployment), `TransportError`.
   */
  readonly getPartyById: (partyId: ObjectId) => Effect.Effect<Party, PartyReadError>;
  /**
   * Reads many `Party` objects in one chunked `sui.getObjects`: one `Result`
   * per distinct id, in input order.
   *
   * Fails with: `TransportError`.
   */
  readonly getPartiesByIds: (
    partyIds: ReadonlyArray<ObjectId>,
  ) => Effect.Effect<ReadonlyArray<Result.Result<Party, PartyBatchItemError>>, TransportError>;
  /**
   * The group ids a party currently belongs to, from its `MembershipKey`
   * dynamic fields (the member-side record).
   *
   * Fails with: `DecodeError`, `TransportError`.
   */
  readonly getMemberships: (
    partyId: ObjectId,
  ) => Effect.Effect<ReadonlyArray<ObjectId>, DecodeError | TransportError>;
  /**
   * The member ids invited to a group but not yet accepted, from its
   * `PendingInviteKey` dynamic fields.
   *
   * Fails with: `DecodeError`, `TransportError`.
   */
  readonly getPendingInvites: (
    groupId: ObjectId,
  ) => Effect.Effect<ReadonlyArray<ObjectId>, DecodeError | TransportError>;
  /**
   * The group ids that have invited a party but are still awaiting its
   * response, from the member-side `PendingMembershipKey` inbox index.
   *
   * Fails with: `DecodeError`, `TransportError`.
   */
  readonly getPendingMemberships: (
    partyId: ObjectId,
  ) => Effect.Effect<ReadonlyArray<ObjectId>, DecodeError | TransportError>;
  /**
   * Whether `memberId` currently holds a `MembershipKey` record for
   * `groupId`, read with one `sui.getDynamicFieldOption`.
   *
   * Fails with: `TransportError`.
   */
  readonly isMember: (memberId: ObjectId, groupId: ObjectId) => Effect.Effect<boolean, TransportError>;
  /**
   * The 9 `transactions.ts` builders with `partyPackageId` bound to this
   * deployment. Never fails; a recipe is synchronous and `Tx.build` reports
   * one that throws as a `BuildError`.
   */
  readonly tx: BoundBuilders;
}

/** The deployment `Partyos.layerTest` binds to by default. */
export const PARTYOS_TEST_DEPLOYMENT: PartyDeployment = normalizePartyDeployment({
  partyos: `0x${"0".repeat(63)}2`,
});

/**
 * `normalizeStructTag` throws on anything that is not a struct tag —
 * `"u64"`, `"bool"`, `"address"`, `"vector<u8>"`, all legal dynamic-field key
 * types a foreign extension can put beside PartyOS's own keys on the same
 * parent. Lifted to `Option` so a primitive-typed key is "does not match",
 * never a defect.
 */
const safeNormalizeStructTag = Option.liftThrowable(normalizeStructTag);

/**
 * Every id named by a dynamic field of `parent` whose key type is exactly
 * `tag` (no other key type on the same parent is touched, so a `Party`
 * extension's own dynamic fields — struct-typed or not — never reach this
 * decode).
 */
function collectKeyIds(
  sui: SuiService,
  parent: ObjectId,
  tag: string,
  codec: Schema.Codec<readonly [string], Uint8Array>,
): Effect.Effect<ReadonlyArray<ObjectId>, DecodeError | TransportError> {
  return sui.streamDynamicFields(parent).pipe(
    Stream.filter((entry) => Option.contains(safeNormalizeStructTag(entry.name.type), tag)),
    Stream.mapEffect((entry) => SuiSchema.decode(codec, entry.name.bcs, { actualType: entry.name.type })),
    Stream.map(([id]) => ObjectId.make(id)),
    Stream.runCollect,
    Effect.map((chunk) => Array.from(chunk)),
  );
}

const make = (deployment: PartyDeployment): Effect.Effect<PartyosService, never, Sui> =>
  Effect.gen(function* () {
    const sui = yield* Sui;
    const packageId = deployment.partyos;
    // The package a Move type name actually carries. Defaults to `packageId`
    // and is right until the first upgrade — sui-effect's
    // `docs/extensions.md` §3: `packageId` is for `moveCall` targets (the 9
    // `tx` builders below all use it directly), `typeOrigin` is for codecs,
    // dynamic-field key tags and expected types.
    const typeOrigin = deployment.typeOrigin ?? packageId;
    const content = partyContent(typeOrigin);
    const membershipKeyTag = normalizeStructTag(`${typeOrigin}::party::MembershipKey`);
    const pendingInviteKeyTag = normalizeStructTag(`${typeOrigin}::party::PendingInviteKey`);
    const pendingMembershipKeyTag = normalizeStructTag(`${typeOrigin}::party::PendingMembershipKey`);
    const membershipKeyCodec = SuiSchema.bcs(party.MembershipKey, membershipKeyTag);
    const pendingInviteKeyCodec = SuiSchema.bcs(party.PendingInviteKey, pendingInviteKeyTag);
    const pendingMembershipKeyCodec = SuiSchema.bcs(party.PendingMembershipKey, pendingMembershipKeyTag);

    const getPartyById = Effect.fn("Partyos.getPartyById")(function* (partyId: ObjectId) {
      // No `expectedType` option: `content` (`partyContent(typeOrigin)`)
      // already carries the expected tag, and `getObject` checks it.
      return yield* sui.getObject(partyId, { schema: content }).pipe(
        Effect.map((object) => object.content),
        Effect.catchTag(["ObjectNotFound", "ObjectDeleted"], () => Effect.fail(new PartyNotFound({ partyId }))),
        Effect.catchTag("ObjectUnavailable", (error) =>
          Effect.fail(new TransportError({ method: "Partyos.getPartyById", retryable: false, cause: error })),
        ),
      );
    }, Effect.provideService(Sui, sui));

    const getPartiesByIds = Effect.fn("Partyos.getPartiesByIds")(function* (partyIds: ReadonlyArray<ObjectId>) {
      // `sui.getObjects` already deduplicates its outgoing request, but its
      // response mirrors the input array (a repeated id gets the same
      // `Result` twice). This service's own contract is one `Result` per
      // *distinct* id, so the dedup happens here, before the call.
      const distinct = [...new Set(partyIds)];
      const results = yield* sui.getObjects(distinct, { schema: content });
      return results.map((result) =>
        Result.mapBoth(result, {
          onSuccess: (object) => object.content,
          onFailure: (error): PartyBatchItemError =>
            error._tag === "ObjectNotFound" || error._tag === "ObjectDeleted"
              ? new PartyNotFound({ partyId: error.objectId })
              : error,
        }),
      );
    }, Effect.provideService(Sui, sui));

    const getMemberships = Effect.fn("Partyos.getMemberships")(function* (partyId: ObjectId) {
      return yield* collectKeyIds(sui, partyId, membershipKeyTag, membershipKeyCodec);
    }, Effect.provideService(Sui, sui));

    const getPendingInvites = Effect.fn("Partyos.getPendingInvites")(function* (groupId: ObjectId) {
      return yield* collectKeyIds(sui, groupId, pendingInviteKeyTag, pendingInviteKeyCodec);
    }, Effect.provideService(Sui, sui));

    const getPendingMemberships = Effect.fn("Partyos.getPendingMemberships")(function* (partyId: ObjectId) {
      return yield* collectKeyIds(sui, partyId, pendingMembershipKeyTag, pendingMembershipKeyCodec);
    }, Effect.provideService(Sui, sui));

    const isMember = Effect.fn("Partyos.isMember")(function* (memberId: ObjectId, groupId: ObjectId) {
      const field = yield* sui.getDynamicFieldOption(memberId, {
        type: membershipKeyTag,
        bcs: party.MembershipKey.serialize([groupId]).toBytes(),
      });
      return Option.isSome(field);
    }, Effect.provideService(Sui, sui));

    const tx: BoundBuilders = {
      createIndividualParty: (p) => createIndividualParty({ ...p, partyPackageId: packageId }),
      createGroupParty: (p) => createGroupParty({ ...p, partyPackageId: packageId }),
      setName: (p) => setName({ ...p, partyPackageId: packageId }),
      inviteParty: (p) => inviteParty({ ...p, partyPackageId: packageId }),
      acceptInvite: (p) => acceptInvite({ ...p, partyPackageId: packageId }),
      declineInvite: (p) => declineInvite({ ...p, partyPackageId: packageId }),
      revokeInvite: (p) => revokeInvite({ ...p, partyPackageId: packageId }),
      leaveGroup: (p) => leaveGroup({ ...p, partyPackageId: packageId }),
      removeMember: (p) => removeMember({ ...p, partyPackageId: packageId }),
    };

    return {
      deployment,
      getPartyById,
      getPartiesByIds,
      getMemberships,
      getPendingInvites,
      getPendingMemberships,
      isMember,
      tx,
    };
  });

/**
 * The PartyOS object model, as an Effect service.
 *
 * Identifier `"@misofm/partyos/Partyos"`, per `docs/extensions.md` §1: a
 * scoped package keeps its scope, and this string never changes after
 * publication.
 */
export class Partyos extends Context.Service<Partyos, PartyosService>()("@misofm/partyos/Partyos") {
  /**
   * The live layer. `options.deployment`, when given, is validated with
   * {@link validatePartyDeployment}; when omitted, the deployment follows
   * `sui.network` from the bundled table (`docs/extensions.md` §6, "A layer
   * that picks a bundled deployment").
   *
   * Fails with: `PartyosDeploymentError` (an explicit manifest did not
   * validate, or this release bundles no deployment for the client's
   * network).
   */
  static readonly layer = (
    options: { readonly deployment?: PartyDeployment } = {},
  ): Layer.Layer<Partyos, PartyosDeploymentError, Sui> =>
    Layer.unwrap(
      Effect.gen(function* () {
        const deployment =
          options.deployment !== undefined
            ? yield* validatePartyDeployment(options.deployment)
            : yield* Effect.gen(function* () {
                const sui = yield* Sui;
                return yield* Effect.try({
                  try: () => getPartyDeployment(sui.network),
                  catch: (cause) =>
                    new PartyosDeploymentError({
                      message: cause instanceof Error ? cause.message : String(cause),
                    }),
                });
              });
        return Layer.effect(Partyos, make(deployment));
      }),
    );

  /**
   * `layer`, reading `PARTYOS_PACKAGE_ID` from the environment. Unset means
   * the bundled manifest for `sui.network`.
   *
   * Fails with: `ConfigError`, `PartyosDeploymentError`.
   */
  static readonly layerConfig: Layer.Layer<Partyos, Config.ConfigError | PartyosDeploymentError, Sui> =
    Layer.unwrap(
      Effect.gen(function* () {
        const packageId = yield* Config.nonEmptyString("PACKAGE_ID").pipe(Config.option, Config.nested("PARTYOS"));
        // The raw config value is handed to `layer` unvalidated: `layer`
        // itself runs it through `validatePartyDeployment` (a typed Effect
        // failure), so a malformed `PARTYOS_PACKAGE_ID` is a
        // `PartyosDeploymentError`, not a defect from calling the throwing
        // `normalizePartyDeployment` here.
        return Partyos.layer(Option.isSome(packageId) ? { deployment: { partyos: packageId.value } } : {});
      }),
    );

  /**
   * The real service over a fixed, padded test package id. Compose with
   * `layerExtensionTest` from `sui-effect/testing`. Never fails.
   */
  static readonly layerTest = (
    deployment: PartyDeployment = PARTYOS_TEST_DEPLOYMENT,
  ): Layer.Layer<Partyos, never, Sui> => Layer.effect(Partyos, make(deployment));
}
