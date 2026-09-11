/**
 * @deprecated `PartyosClient` predates the `Partyos` service (`./Partyos.ts`)
 * and its derived Promise face (`partyos()`, `./extension.ts`, re-exported
 * from the `/client` subpath). New code should use `partyos()` with
 * `client.$extend(...)`, or `Partyos.layer(...)` directly for Effect
 * callers.
 *
 * This file (exported from the package root only, not `/client`) exists
 * only so `@misofm/platform` — converted to sui-effect separately, see
 * misofm/sdks#35 — keeps constructing `PartyosClient` directly until its own
 * conversion lands. It is a thin wrapper over `Partyos`, so its methods now
 * fail with this package's own error taxonomy (`PartyNotFound`,
 * `DecodeError`, `TransportError`, `PartyosDeploymentError` from a bad
 * deployment, `NetworkMismatch` from the client's chain) rather than
 * `@misofm/effect`'s `ObjectNotFoundError` / `ObjectTypeMismatchError` /
 * `BcsDecodeError` / `SuiRpcError` — the migration-map behaviour change
 * `docs/extensions.md` §13 documents for every `@misofm/effect` conversion.
 */
import { Effect, Layer } from "effect";
import type { ClientWithCoreApi, SuiClientRegistration } from "@mysten/sui/client";
import { ObjectId, Sui, SuiCore } from "sui-effect";
import { PARTY_REF_RETURNING_CALLS } from "./contracts.ts";
import * as partyMod from "./contracts/partyos/party.ts";
import { normalizePartyDeployment, type PartyDeployment } from "./deployments.ts";
import { Partyos } from "./Partyos.ts";
import * as queries from "./queries.ts";
import * as transactions from "./transactions.ts";

type BoundMoveFunction<F> = F extends (options: infer Options) => infer Result
  ? Options extends { package?: unknown }
    ? (options: Omit<Options, "package">) => Result
    : F
  : F;
type BoundModule<M extends object, Removed extends PropertyKey> = {
  [Key in Exclude<keyof M, Removed>]: BoundMoveFunction<M[Key]>;
};

/** Defaults generated calls to one package and removes reference-returning calls. */
export function bindModulePackage<M extends object, K extends readonly (keyof M)[]>(
  mod: M,
  pkg: string,
  unavailable: K = [] as unknown as K,
): BoundModule<M, K[number]> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries({ ...mod })) {
    if ((unavailable as readonly string[]).includes(key)) continue;
    out[key] =
      typeof value === "function"
        ? (options: { package?: string }) => (value as (o: unknown) => unknown)({ package: pkg, ...options })
        : value;
  }
  return out as BoundModule<M, K[number]>;
}

/**
 * @deprecated Use {@link partyos} (`client.$extend(partyos())`) for a Promise
 * consumer, or `Partyos.layer(...)` directly for an Effect one.
 */
export interface PartyosOptions<Name extends string = "partyos"> {
  readonly name?: Name;
  readonly deployment?: PartyDeployment;
}

/** @deprecated Package-bound PartyOS client. Use {@link Partyos} / `partyos()`. */
export class PartyosClient {
  #deployment: PartyDeployment;
  #layer: Layer.Layer<Partyos>;

  constructor(client: ClientWithCoreApi, deployment: PartyDeployment) {
    this.#deployment = normalizePartyDeployment(deployment);
    this.#layer = Partyos.layer({ deployment: this.#deployment }).pipe(
      Layer.provide(Sui.layerNoDeps.pipe(Layer.provide(SuiCore.layerFromClient(client)))),
      Layer.orDie,
    );
  }

  /** The exact deployment selected for this client. */
  get deployment(): PartyDeployment {
    return this.#deployment;
  }

  get #pkg(): string {
    return this.#deployment.partyos;
  }

  #provide<A, E>(effect: Effect.Effect<A, E, Partyos>): Effect.Effect<A, E> {
    return Effect.provide(effect, this.#layer);
  }

  // === Queries ===

  getPartyById(partyId: string) {
    return this.#provide(Effect.flatMap(Partyos, (p) => p.getPartyById(ObjectId.make(partyId))));
  }
  getPartiesByIds(partyIds: readonly string[]) {
    return this.#provide(
      Effect.flatMap(Partyos, (p) => p.getPartiesByIds(partyIds.map((id) => ObjectId.make(id)))),
    );
  }
  derivePartyAdminCapId(partyId: string): string {
    return queries.derivePartyAdminCapId(partyId, this.#pkg);
  }
  /** Group ids a party belongs to (member-side membership records). */
  getMemberships(partyId: string) {
    return this.#provide(Effect.flatMap(Partyos, (p) => p.getMemberships(ObjectId.make(partyId))));
  }
  /** Member ids invited to a group but not yet accepted. */
  getPendingInvites(groupId: string) {
    return this.#provide(Effect.flatMap(Partyos, (p) => p.getPendingInvites(ObjectId.make(groupId))));
  }
  /** Group ids that have invited this party but are awaiting its response. */
  getPendingMemberships(partyId: string) {
    return this.#provide(Effect.flatMap(Partyos, (p) => p.getPendingMemberships(ObjectId.make(partyId))));
  }
  /** Whether a party is a member of a group. */
  isMember(memberId: string, groupId: string) {
    return this.#provide(
      Effect.flatMap(Partyos, (p) => p.isMember(ObjectId.make(memberId), ObjectId.make(groupId))),
    );
  }

  // === Transaction builders (recipes; the package id is bound from the client) ===

  get tx() {
    const pkg = this.#pkg;
    return {
      createIndividualParty: (p: Omit<transactions.CreatePartyParams, "partyPackageId">) =>
        transactions.createIndividualParty({ ...p, partyPackageId: pkg }),
      createGroupParty: (p: Omit<transactions.CreatePartyParams, "partyPackageId">) =>
        transactions.createGroupParty({ ...p, partyPackageId: pkg }),
      setName: (p: Omit<transactions.SetNameParams, "partyPackageId">) =>
        transactions.setName({ ...p, partyPackageId: pkg }),
      inviteParty: (p: Omit<transactions.InvitePartyParams, "partyPackageId">) =>
        transactions.inviteParty({ ...p, partyPackageId: pkg }),
      acceptInvite: (p: Omit<transactions.AcceptInviteParams, "partyPackageId">) =>
        transactions.acceptInvite({ ...p, partyPackageId: pkg }),
      declineInvite: (p: Omit<transactions.DeclineInviteParams, "partyPackageId">) =>
        transactions.declineInvite({ ...p, partyPackageId: pkg }),
      revokeInvite: (p: Omit<transactions.RevokeInviteParams, "partyPackageId">) =>
        transactions.revokeInvite({ ...p, partyPackageId: pkg }),
      leaveGroup: (p: Omit<transactions.LeaveGroupParams, "partyPackageId">) =>
        transactions.leaveGroup({ ...p, partyPackageId: pkg }),
      removeMember: (p: Omit<transactions.RemoveMemberParams, "partyPackageId">) =>
        transactions.removeMember({ ...p, partyPackageId: pkg }),
    };
  }

  // === Generated type-safe Move calls (for tx.add) ===

  get call() {
    return {
      party: bindModulePackage(partyMod, this.#pkg, PARTY_REF_RETURNING_CALLS),
    };
  }

  // === Generated BCS structs (for parsing object/event content) ===

  get bcs() {
    return {
      Party: partyMod.Party,
      PartyAdminCap: partyMod.PartyAdminCap,
    };
  }
}

/** @deprecated Use {@link PartyosClient}. Retained for callers migrating from `@misofm/protocol/party`. */
export { PartyosClient as PartyProtocolClient };
