// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Party queries and transaction builders bound to one verified partyos
// deployment. Consumers reach this through `client.partyos` after
// `$extend(partyos())`, or construct `PartyosClient` directly.

import { Effect } from "effect";
import type { ClientWithCoreApi, SuiClientRegistration } from "@mysten/sui/client";
import { SuiClient } from "@misofm/effect";
import type { BcsDecodeError, ObjectNotFoundError, ObjectTypeMismatchError, SuiRpcError } from "@misofm/effect";
import { getPartyDeployment, normalizePartyDeployment, type PartyDeployment } from "./deployments.ts";
import { PARTY_REF_RETURNING_CALLS } from "./contracts.ts";
import * as queries from "./queries.ts";
import * as transactions from "./transactions.ts";
import type { TxThunk } from "./transactions.ts";
import type { Party } from "./types.ts";
import * as partyMod from "./contracts/partyos/party.ts";

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

export interface PartyosOptions<Name extends string = "partyos"> {
  /** Name for the client extension. Defaults to "partyos". */
  name?: Name;
  /** Explicit deployment. Omit only when this SDK bundles a verified manifest for the client's network. */
  deployment?: PartyDeployment;
}

/**
 * Creates a PartyOS client extension for use with `$extend()`.
 *
 * @example
 * ```ts
 * const client = new SuiGrpcClient({ network: "testnet" }).$extend(partyos());
 * const party = await client.partyos.getPartyById("0x...");
 * ```
 */
export function partyos<const Name extends string = "partyos">(
  options: PartyosOptions<Name> = {},
): SuiClientRegistration<ClientWithCoreApi, Name, PartyosClient> {
  const name = (options.name ?? "partyos") as Name;
  return {
    name,
    register: (client) =>
      new PartyosClient(
        client,
        options.deployment ? normalizePartyDeployment(options.deployment) : getPartyDeployment(client.network),
      ),
  };
}

/** Package-bound PartyOS client. */
export class PartyosClient {
  #client: ClientWithCoreApi;
  #deployment: PartyDeployment;
  #layer: ReturnType<typeof SuiClient.layer>;

  constructor(client: ClientWithCoreApi, deployment: PartyDeployment) {
    this.#client = client;
    this.#deployment = normalizePartyDeployment(deployment);
    this.#layer = SuiClient.layer(client);
  }

  /** The exact deployment selected for this client. */
  get deployment(): PartyDeployment {
    return this.#deployment;
  }

  get #pkg(): string {
    return this.#deployment.partyos;
  }

  /** Provides the `SuiClient` service bound to this client, discharging `R`. */
  #provide<A, E>(effect: Effect.Effect<A, E, SuiClient>): Effect.Effect<A, E> {
    return effect.pipe(Effect.provide(this.#layer));
  }

  // === Queries ===
  // Each method provides `SuiClient` internally, so callers get `Effect<A, E>`
  // (R = never) and only need `Effect.runPromise` (or their own composition).

  getPartyById(
    partyId: string,
  ): Effect.Effect<Party, ObjectNotFoundError | ObjectTypeMismatchError | BcsDecodeError | SuiRpcError> {
    return this.#provide(queries.getPartyById(partyId, this.#pkg));
  }
  getPartiesByIds(
    partyIds: readonly string[],
  ): Effect.Effect<Partial<Record<string, Party>>, ObjectTypeMismatchError | BcsDecodeError | SuiRpcError> {
    return this.#provide(queries.getPartiesByIds(partyIds, this.#pkg));
  }
  derivePartyAdminCapId(partyId: string): string {
    return queries.derivePartyAdminCapId(partyId, this.#pkg);
  }
  /** Group ids a party belongs to (member-side membership records). */
  getMemberships(partyId: string): Effect.Effect<string[], SuiRpcError> {
    return this.#provide(queries.getMemberships(partyId));
  }
  /** Member ids invited to a group but not yet accepted. */
  getPendingInvites(groupId: string): Effect.Effect<string[], SuiRpcError> {
    return this.#provide(queries.getPendingInvites(groupId));
  }
  /** Group ids that have invited this party but are awaiting its response. */
  getPendingMemberships(partyId: string): Effect.Effect<string[], SuiRpcError> {
    return this.#provide(queries.getPendingMemberships(partyId));
  }
  /** Whether a party is a member of a group. */
  isMember(memberId: string, groupId: string): Effect.Effect<boolean, SuiRpcError> {
    return this.#provide(queries.isMember(memberId, groupId, this.#pkg));
  }

  // === Transaction builders (thunks; the package id is bound from the client) ===

  get tx() {
    const pkg = this.#pkg;
    return {
      createIndividualParty: (p: Omit<transactions.CreatePartyParams, "partyPackageId">): TxThunk =>
        transactions.createIndividualParty({ ...p, partyPackageId: pkg }),
      createGroupParty: (p: Omit<transactions.CreatePartyParams, "partyPackageId">): TxThunk =>
        transactions.createGroupParty({ ...p, partyPackageId: pkg }),
      setName: (p: Omit<transactions.SetNameParams, "partyPackageId">): TxThunk =>
        transactions.setName({ ...p, partyPackageId: pkg }),
      inviteParty: (p: Omit<transactions.InvitePartyParams, "partyPackageId">): TxThunk =>
        transactions.inviteParty({ ...p, partyPackageId: pkg }),
      acceptInvite: (p: Omit<transactions.AcceptInviteParams, "partyPackageId">): TxThunk =>
        transactions.acceptInvite({ ...p, partyPackageId: pkg }),
      declineInvite: (p: Omit<transactions.DeclineInviteParams, "partyPackageId">): TxThunk =>
        transactions.declineInvite({ ...p, partyPackageId: pkg }),
      revokeInvite: (p: Omit<transactions.RevokeInviteParams, "partyPackageId">): TxThunk =>
        transactions.revokeInvite({ ...p, partyPackageId: pkg }),
      leaveGroup: (p: Omit<transactions.LeaveGroupParams, "partyPackageId">): TxThunk =>
        transactions.leaveGroup({ ...p, partyPackageId: pkg }),
      removeMember: (p: Omit<transactions.RemoveMemberParams, "partyPackageId">): TxThunk =>
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

/** @deprecated Use `PartyosClient`. Retained for callers migrating from `@misofm/protocol/party`. */
export { PartyosClient as PartyProtocolClient };
