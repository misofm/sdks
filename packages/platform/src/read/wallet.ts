// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { toPromise, tryPromise, workflow, type SdkError } from "@misofm/utils/effect";
import { Effect } from "effect";
//
// Address-scoped reads: what a wallet owns, administers, and can spend.
//
// None of this is cacheable at a shared edge — every answer is different per
// address — but it belongs here anyway, because the VALUE of a single read layer
// is the response shape, not just the cache. The studio catalog's three-transport
// dance (owned caps over gRPC → share types over GraphQL → work contents over
// gRPC) is exactly the sort of thing that should exist once in the SDK rather
// than be reimplemented by every browser, Worker, server, or native client.

import {
  getCompositionByShareTypeEffect,
  getOwnedReleaseAdminCapsEffect,
  getRecordingByShareTypeEffect,
  getReleaseByIdEffect,
  isNotFound,
  contracts as networkContracts,
} from "@misofm/protocol";
import * as recordContract from "@misofm/protocol/contracts/miso_record/record";
import * as vaultContract from "@misofm/protocol/contracts/vault/vault";
import { normalizeStructTag, normalizeSuiAddress, parseStructTag } from "@mysten/sui/utils";
import { requireRecordSalesDeployment } from "../deployments.ts";
import { deriveRecordId } from "../pressing.ts";
import type { MisoClient } from "./client.ts";
import { int, u64 } from "./internal/scalars.ts";
import type {
  Balance,
  OwnedParty,
  OwnedRecord,
  OwnedWork,
  Ownership,
  PendingMembership,
  WorkDetail,
} from "./types.ts";
import { getRecordingTitlesEffect, getWorkAddressesByShareTypesEffect, getWorksByIdsEffect } from "./works.ts";

/**
 * Page cap on the owned-objects scan, so a wallet holding a huge unrelated object
 * set can't spin forever. 50/page × 20 = 1000 objects — far beyond any realistic
 * library.
 */
const MAX_PAGES = 20;

type WorkAdminCapType =
  | { kind: "composition"; shareType: string }
  | { kind: "recording"; shareType: string }
  | { kind: "release" };

type VaultedGenericCap = {
  id: string;
  shareType: string;
  vaultId: string;
};

type VaultedReleaseCap = {
  id: string;
  vaultId: string;
};

function classifyWorkAdminCapType(type: string, misoPackageId: string): WorkAdminCapType | null {
  let tag: ReturnType<typeof parseStructTag>;
  try {
    tag = parseStructTag(type);
  } catch {
    return null;
  }
  if (tag.address !== misoPackageId) return null;

  if (
    tag.module === "composition" &&
    tag.name === "CompositionAdminCap" &&
    tag.typeParams.length === 1
  ) {
    const share = tag.typeParams[0]!;
    return {
      kind: "composition",
      shareType: typeof share === "string" ? share : normalizeStructTag(share),
    };
  }
  if (
    tag.module === "recording" &&
    tag.name === "RecordingAdminCap" &&
    tag.typeParams.length === 1
  ) {
    const share = tag.typeParams[0]!;
    return {
      kind: "recording",
      shareType: typeof share === "string" ? share : normalizeStructTag(share),
    };
  }
  if (
    tag.module === "release" &&
    tag.name === "ReleaseAdminCap" &&
    tag.typeParams.length === 0
  ) {
    return { kind: "release" };
  }
  return null;
}

/** @internal Exact nested-type classifier used by the vault-aware catalog read. */
export function classifyVaultedWorkAdminCapType(
  type: string,
  vaultPackageId: string,
  misoPackageId: string,
): WorkAdminCapType | null {
  let tag: ReturnType<typeof parseStructTag>;
  try {
    tag = parseStructTag(type);
  } catch {
    return null;
  }
  if (
    tag.address !== vaultPackageId ||
    tag.module !== "vault" ||
    tag.name !== "VaultAdminCap" ||
    tag.typeParams.length !== 1
  ) {
    return null;
  }
  const wrapped = tag.typeParams[0];
  return wrapped && typeof wrapped !== "string"
    ? classifyWorkAdminCapType(normalizeStructTag(wrapped), misoPackageId)
    : null;
}

// ── Records ──────────────────────────────────────────────────────────────────

/**
 * A wallet record is trusted only when it is the exact, non-generic Record type
 * from the configured package. Checking the parsed tag (rather than a prefix or
 * suffix) rejects retired namespaces and legacy/arbitrary generic wrappers.
 */
function isCanonicalRecordType(
  type: string,
  recordPackageId: string,
): boolean {
  let tag: ReturnType<typeof parseStructTag>;
  try {
    tag = parseStructTag(type);
  } catch {
    return false;
  }

  if (
    tag.address !== normalizeSuiAddress(recordPackageId) ||
    tag.module !== "record" ||
    tag.name !== "Record" ||
    tag.typeParams.length !== 0
  ) {
    return false;
  }
  return true;
}

/**
 * The records `owner` holds. Ownership is DIRECT — a record is an address-owned
 * `<miso_record>::record::Record` with no pressing/license/receipt intermediary.
 * The server-side type filter and exact local check deliberately exclude records
 * from any retired package namespace.
 */
export function getOwnedRecordsEffect(client: MisoClient, owner: string): Effect.Effect<OwnedRecord[], SdkError> {
  return workflow("getOwnedRecords", function* () {
    const out: OwnedRecord[] = [];
    const sales = requireRecordSalesDeployment(client.config.recordSales);
    const recordType = `${sales.recordPackageId}::record::Record`;

    yield* forOwnedObjectsEffect(client, owner, recordType, true, (objects) => {
      for (const obj of objects) {
        if (!isCanonicalRecordType(obj.type, sales.recordPackageId)) {
          continue;
        }
        if (!obj.content) throw new Error(`Record ${obj.objectId} has no BCS content`);
        const record = recordContract.Record.parse(obj.content);
        if (normalizeSuiAddress(record.id) !== normalizeSuiAddress(obj.objectId)) {
          throw new Error(`Record ${obj.objectId} has mismatched embedded UID ${record.id}`);
        }
        const derived = deriveRecordId(record.pressing_id, record.number, sales.recordPackageId);
        if (normalizeSuiAddress(derived) !== normalizeSuiAddress(obj.objectId)) {
          throw new Error(`Record ${obj.objectId} is not derived from its Pressing and number`);
        }
        out.push({
          id: obj.objectId,
          type: obj.type,
          releaseId: record.release_id,
          pressingId: record.pressing_id,
          edition: record.edition,
          number: record.number,
          purchaseCurrency: normalizeStructTag(record.purchase_currency.name),
          purchasePrice: record.purchase_price,
          purchasedBy: record.purchased_by,
          purchasedTimestampMs: record.purchased_timestamp_ms,
        });
      }
    });
    return out;
  });
}

export const getOwnedRecords = toPromise(getOwnedRecordsEffect);

// ── Parties ──────────────────────────────────────────────────────────────────

/**
 * The parties `owner` administers. A wallet "owns" a party iff it holds the
 * party's `PartyAdminCap`, so this is one owned-objects listing filtered to the
 * cap type plus a name resolve. Caps are transferable, which is why this is
 * authoritative in a way that remembering created parties client-side is not.
 */
export function getOwnedPartiesEffect(client: MisoClient, owner: string): Effect.Effect<OwnedParty[], SdkError> {
  return workflow("getOwnedParties", function* () {
    const capType = `${client.config.deployment.misoParty}::party::PartyAdminCap`;

    // One page of 50 caps is plenty for launch-scale artists; paginate if labels
    // ever start hitting the cap.
    const { objects } = yield* tryPromise("getOwnedParties", (signal) =>
      client.protocol.core.listOwnedObjects({ signal, owner, type: capType, limit: 50, include: { content: true } }),
    );

    const caps = objects.flatMap((obj) => {
      try {
        const cap = networkContracts.party.PartyAdminCap.parse(obj.content);
        return [{ capId: obj.objectId, partyId: cap.party_id }];
      } catch {
        return [];
      }
    });
    if (caps.length === 0) return [];

    const parties = yield* client.sui.miso.party.getPartiesByIdsEffect?.(caps.map((c) => c.partyId)) ??
      tryPromise("getOwnedParties", () => client.sui.miso.party.getPartiesByIds(caps.map((c) => c.partyId)));
    return caps.flatMap(({ capId, partyId }) => {
      const p = parties[partyId];
      return p ? [{ partyId, capId, name: p.name, kind: p.kind }] : [];
    });
  });
}

export const getOwnedParties = toPromise(getOwnedPartiesEffect);

/**
 * Pending group invitations for every individual party the wallet administers.
 *
 * The Party module maintains a member-side pending-membership index, so this
 * reads only the wallet's controlled parties — never a global event scan. Group
 * names are resolved in one batch so the API can render an inbox without extra
 * browser reads.
 */
export function getPendingMembershipsEffect(
  client: MisoClient,
  owner: string,
): Effect.Effect<PendingMembership[], SdkError> {
  return workflow("getPendingMemberships", function* () {
    const controlled = yield* getOwnedPartiesEffect(client, owner);
    const individuals = controlled.filter((party) => party.kind === "individual");
    if (individuals.length === 0) return [];

    const invitations = yield* Effect.forEach(
      individuals,
      (member) =>
        workflow("getPendingMemberships", function* () {
          return {
            member,
            groupIds: yield* client.sui.miso.party.getPendingMembershipsEffect?.(member.partyId) ??
              tryPromise("getPendingMemberships", () => client.sui.miso.party.getPendingMemberships(member.partyId)),
          };
        }),
      { concurrency: 8 },
    );
    const groupIds = [...new Set(invitations.flatMap(({ groupIds }) => groupIds))];
    if (groupIds.length === 0) return [];

    const groups = yield* client.sui.miso.party.getPartiesByIdsEffect?.(groupIds) ??
      tryPromise("getPendingMemberships", () => client.sui.miso.party.getPartiesByIds(groupIds));
    return invitations.flatMap(({ member, groupIds }) =>
      groupIds.flatMap((groupId): PendingMembership[] => {
        const group = groups[groupId];
        return group?.kind === "group"
          ? [{ memberPartyId: member.partyId, memberCapId: member.capId, groupId, groupName: group.name }]
          : [];
      }),
    );
  });
}

export const getPendingMemberships = toPromise(getPendingMembershipsEffect);

// ── Works (studio catalog) ───────────────────────────────────────────────────

/**
 * Owned generic admin caps over gRPC. The bare type filter matches every
 * instantiation of `CompositionAdminCap<T>` / `RecordingAdminCap<T>`; the share
 * type `T` is parsed back out of each instance's type tag, because the cap does
 * not store the work's id — only its share type.
 */
function ownedGenericCapsEffect(client: MisoClient, owner: string, capType: string) {
  return workflow("ownedGenericCaps", function* () {
    const caps: { id: string; shareType: string }[] = [];
    yield* forOwnedObjectsEffect(client, owner, capType, false, (objects) => {
      for (const obj of objects) {
        const match = /<(.+)>$/.exec(obj.type);
        if (match?.[1]) caps.push({ id: obj.objectId, shareType: match[1] });
      }
    });
    return caps;
  });
}

/**
 * Discover owner-held VaultAdminCaps whose wrapped capability administers a
 * catalog work. PressingAdminCap is deliberately ignored: Catalog is a work
 * surface (composition / recording / release), not a sale-management surface.
 */
function ownedVaultedWorkCapsEffect(client: MisoClient, owner: string) {
  return workflow("ownedVaultedWorkCaps", function* () {
    const out: {
      compositions: VaultedGenericCap[];
      recordings: VaultedGenericCap[];
      releases: VaultedReleaseCap[];
    } = { compositions: [], recordings: [], releases: [] };
    const vaultPackageId = client.config.protocol.vault;
    const misoPackageId = client.config.deployment.miso;
    const capType = `${vaultPackageId}::vault::VaultAdminCap`;

    yield* forOwnedObjectsEffect(client, owner, capType, true, (objects) => {
      for (const object of objects) {
        if (!object.content) continue;
        const work = classifyVaultedWorkAdminCapType(object.type, vaultPackageId, misoPackageId);
        if (!work) continue;
        try {
          const { vault_id: vaultId } = vaultContract.VaultAdminCap.parse(object.content);
          if (work.kind === "composition") {
            out.compositions.push({ id: object.objectId, shareType: work.shareType, vaultId });
          } else if (work.kind === "recording") {
            out.recordings.push({ id: object.objectId, shareType: work.shareType, vaultId });
          } else {
            out.releases.push({ id: object.objectId, vaultId });
          }
        } catch {
          // A malformed object under the configured vault namespace is not usable
          // authority and should not hide otherwise valid catalog entries.
        }
      }
    });
    return out;
  });
}

/** Read the ReleaseAdminCap wrapped by each shared release vault. */
function resolveVaultedReleaseCapsEffect(
  client: MisoClient,
  caps: readonly VaultedReleaseCap[],
): Effect.Effect<{ id: string; releaseId: string }[], SdkError> {
  return workflow("resolveVaultedReleaseCaps", function* () {
    if (caps.length === 0) return [];
    const releaseCapType = `${client.config.deployment.miso}::release::ReleaseAdminCap`;
    const vaultType = normalizeStructTag(`${client.config.protocol.vault}::vault::Vault<${releaseCapType}>`);
    const { objects } = yield* tryPromise("resolveVaultedReleaseCaps", (signal) =>
      client.protocol.core.getObjects({
        signal,
        objectIds: caps.map((cap) => cap.vaultId),
        include: { content: true },
      }),
    );
    const releasesByVault = new Map<string, string>();
    for (const object of objects) {
      if (object instanceof Error || !object.content) continue;
      try {
        if (normalizeStructTag(object.type) !== vaultType) continue;
        const vault = vaultContract.Vault(networkContracts.release.ReleaseAdminCap).parse(object.content);
        const releaseId = vault.cap?.value?.release_id;
        if (releaseId) releasesByVault.set(object.objectId, releaseId);
      } catch {
        // Batch catalog discovery is best-effort per authority, matching the
        // existing direct-cap path's treatment of unreadable work objects.
      }
    }
    return caps.flatMap((cap) => {
      const releaseId = releasesByVault.get(cap.vaultId);
      return releaseId ? [{ id: cap.id, releaseId }] : [];
    });
  });
}

/**
 * Every work the wallet administers, keyed by its ADMIN CAP id (the studio
 * catalog's routing unit — caps are what control means here).
 *
 * Three transports, one answer: direct or vaulted cap discovery is gRPC; one aliased GraphQL
 * request maps every share type to its work address (gRPC cannot ask "which
 * object has type X"); one gRPC batch loads all the work contents. Releases skip
 * the GraphQL hop entirely — `ReleaseAdminCap` is not generic and carries
 * `release_id` directly.
 */
export function getOwnedWorksEffect(client: MisoClient, owner: string): Effect.Effect<OwnedWork[], SdkError> {
  return workflow("getOwnedWorks", function* () {
    const miso = client.config.deployment.miso;

    const [directCompCaps, directRecCaps, directRelCaps, vaulted] = yield* Effect.all(
      [
        ownedGenericCapsEffect(client, owner, `${miso}::composition::CompositionAdminCap`),
        ownedGenericCapsEffect(client, owner, `${miso}::recording::RecordingAdminCap`),
        getOwnedReleaseAdminCapsEffect(client.protocol, owner, miso),
        ownedVaultedWorkCapsEffect(client, owner),
      ],
      { concurrency: 8 },
    );
    const vaultedRelCaps = yield* resolveVaultedReleaseCapsEffect(client, vaulted.releases);
    const compCaps = [...directCompCaps, ...vaulted.compositions];
    const recCaps = [...directRecCaps, ...vaulted.recordings];
    const relCaps = [...directRelCaps, ...vaultedRelCaps];

    const addresses = yield* getWorkAddressesByShareTypesEffect(
      client.graphql,
      { compositions: compCaps.map((c) => c.shareType), recordings: recCaps.map((c) => c.shareType) },
      miso,
    );
    const works = yield* getWorksByIdsEffect(client.protocol, {
      compositions: Object.values(addresses.compositions).filter((id): id is string => id !== undefined),
      recordings: Object.values(addresses.recordings).filter((id): id is string => id !== undefined),
      releases: relCaps.map((c) => c.releaseId),
    });
    const recordingTitles = yield* getRecordingTitlesEffect(
      client.protocol,
      client.graphql,
      Object.values(addresses.recordings).filter((id): id is string => id !== undefined),
      miso,
    );

    const comps = compCaps.flatMap((cap): OwnedWork[] => {
      const workId = addresses.compositions[cap.shareType];
      const composition = workId ? works.compositions[workId] : undefined;
      if (!workId || !composition) return [];
      return [{ capId: cap.id, kind: "composition", workId, title: composition.title, state: composition.state.type }];
    });
    const recs = recCaps.flatMap((cap): OwnedWork[] => {
      const workId = addresses.recordings[cap.shareType];
      const recording = workId ? works.recordings[workId] : undefined;
      if (!workId || !recording) return [];
      return [
        {
          capId: cap.id,
          kind: "recording",
          workId,
          title: recordingTitles[workId] ?? "Untitled",
          state: recording.state.type,
        },
      ];
    });
    const rels = relCaps.flatMap((cap): OwnedWork[] => {
      const release = works.releases[cap.releaseId];
      if (!release) return [];
      return [{ capId: cap.id, kind: "release", workId: release.id, title: release.title, state: release.state.type }];
    });

    return [...comps, ...recs, ...rels];
  });
}

export const getOwnedWorks = toPromise(getOwnedWorksEffect);

/** Classify a direct or vaulted cap by its on-chain type, then resolve its work. */
export function getWorkByCapEffect(client: MisoClient, capId: string): Effect.Effect<WorkDetail | null, SdkError> {
  return workflow("getWorkByCap", function* () {
    const miso = client.config.deployment.miso;

    const result = yield* tryPromise("getWorkByCap", (signal) =>
      client.protocol.core.getObject({ signal, objectId: capId, include: { json: true, content: true } }),
    ).pipe(Effect.catch((error) => (isNotFound(error.cause) ? Effect.succeed(null) : Effect.fail(error))));
    if (!result) return null;
    const { type, content } = result.object;
    const json = (result.object.json ?? null) as Record<string, unknown> | null;

    const direct = classifyWorkAdminCapType(type, miso);
    if (direct?.kind === "composition") {
      const { shareType } = direct;
      const c = yield* getCompositionByShareTypeEffect(client.protocol, client.graphql, shareType, miso);
      return {
        capId,
        kind: "composition",
        workId: c.id,
        title: c.title,
        state: c.state.type,
        royaltyRateBps: int(c.royaltyRate.value),
        shareType,
      };
    }

    if (direct?.kind === "recording") {
      const { shareType } = direct;
      const r = yield* getRecordingByShareTypeEffect(client.protocol, client.graphql, shareType, miso);
      const titles = yield* getRecordingTitlesEffect(client.protocol, client.graphql, [r.id], miso);
      return {
        capId,
        kind: "recording",
        workId: r.id,
        title: titles[r.id] ?? "Untitled",
        state: r.state.type,
        shareType,
      };
    }

    if (direct?.kind === "release") {
      const releaseId = typeof json?.release_id === "string" ? json.release_id : null;
      if (!releaseId) throw new Error(`Release cap ${capId} carries no release id`);
      const r = yield* getReleaseByIdEffect(client.protocol, releaseId);
      return {
        capId,
        kind: "release",
        workId: r.id,
        title: r.title,
        state: r.state.type,
        discCount: r.tracks.length > 0 ? 1 : 0,
        trackCount: r.tracks.length,
      };
    }

    const vaulted = classifyVaultedWorkAdminCapType(type, client.config.protocol.vault, miso);
    if (!vaulted || !content) {
      // A real object, but not a supported work authority — "no such work",
      // not a transport failure. PressingAdminCap intentionally lands here.
      return null;
    }
    const { vault_id: vaultId } = vaultContract.VaultAdminCap.parse(content);

    if (vaulted.kind === "composition") {
      const c = yield* getCompositionByShareTypeEffect(client.protocol, client.graphql, vaulted.shareType, miso);
      return {
        capId,
        kind: "composition",
        workId: c.id,
        title: c.title,
        state: c.state.type,
        royaltyRateBps: int(c.royaltyRate.value),
        shareType: vaulted.shareType,
      };
    }

    if (vaulted.kind === "recording") {
      const r = yield* getRecordingByShareTypeEffect(client.protocol, client.graphql, vaulted.shareType, miso);
      const titles = yield* getRecordingTitlesEffect(client.protocol, client.graphql, [r.id], miso);
      return {
        capId,
        kind: "recording",
        workId: r.id,
        title: titles[r.id] ?? "Untitled",
        state: r.state.type,
        shareType: vaulted.shareType,
      };
    }

    const [releaseCap] = yield* resolveVaultedReleaseCapsEffect(client, [{ id: capId, vaultId }]);
    if (!releaseCap) throw new Error(`Release vault ${vaultId} carries no release admin cap`);
    const r = yield* getReleaseByIdEffect(client.protocol, releaseCap.releaseId);
    return {
      capId,
      kind: "release",
      workId: r.id,
      title: r.title,
      state: r.state.type,
      discCount: r.tracks.length > 0 ? 1 : 0,
      trackCount: r.tracks.length,
    };
  });
}

export const getWorkByCap = toPromise(getWorkByCapEffect);

// ── Balance ──────────────────────────────────────────────────────────────────

const decimalsByClient = new WeakMap<MisoClient, Map<string, Effect.Effect<number, SdkError>>>();

/** Resolve once per client/type. Failed lookups are evicted so a transient
 * fullnode error cannot poison a long-lived API worker. */
function coinDecimalsEffect(client: MisoClient, coinType: string): Effect.Effect<number, SdkError> {
  return workflow("coinDecimals", function* () {
    let cache = decimalsByClient.get(client);
    if (!cache) {
      cache = new Map();
      decimalsByClient.set(client, cache);
    }
    const key = normalizeStructTag(coinType);
    const cached = cache.get(key);
    if (cached) return yield* cached;

    const pending = yield* Effect.cached(
      workflow("coinDecimals", function* () {
        const { coinMetadata } = yield* tryPromise("coinMetadata", (signal) =>
          client.protocol.core.getCoinMetadata({ coinType: key, signal }),
        );
        const decimals = coinMetadata?.decimals;
        if (!Number.isSafeInteger(decimals) || decimals! < 0 || decimals! > 18) {
          throw new Error(`Coin metadata for ${key} has no supported decimal precision`);
        }
        return decimals!;
      }).pipe(
        Effect.tapError(() =>
          Effect.sync(() => {
            if (cache.get(key) === pending) cache.delete(key);
          }),
        ),
        Effect.uninterruptible,
      ),
    );
    cache.set(key, pending);
    return yield* pending;
  });
}

/**
 * A wallet's balance in one currency. Keep the aggregate and both Sui storage
 * classes: callers using a `FundsWithdrawal` must never mistake coin-object
 * value for immediately withdrawable address balance.
 */
export function getBalanceEffect(
  client: MisoClient,
  address: string,
  coinType?: string,
): Effect.Effect<Balance, SdkError> {
  return workflow("getBalance", function* () {
    const type = coinType ?? client.config.money.usdCoinType;
    const [res, decimals] = yield* Effect.all(
      [
        tryPromise("getBalance", (signal) =>
          client.protocol.core.getBalance({ signal, owner: address, coinType: type }),
        ),
        coinDecimalsEffect(client, type),
      ],
      { concurrency: 8 },
    );
    return {
      address: normalizeSuiAddress(address),
      coinType: type,
      balance: u64(res.balance.balance),
      coinBalance: u64(res.balance.coinBalance),
      addressBalance: u64(res.balance.addressBalance),
      decimals,
    };
  });
}

export const getBalance = toPromise(getBalanceEffect);

// ── Ownership ────────────────────────────────────────────────────────────────

function isAddressOwner(owner: unknown, address: string): boolean {
  const o = owner as { $kind?: string; AddressOwner?: string } | undefined;
  return (
    o?.$kind === "AddressOwner" && !!o.AddressOwner && normalizeSuiAddress(o.AddressOwner) === normalizeSuiAddress(address)
  );
}

/**
 * Whether `address` controls a party — i.e. holds its `PartyAdminCap`. The cap is
 * a DERIVED object of the party, so this is one `getObject` on a computed id, no
 * search. The chain enforces writes regardless; this drives the UI and hands back
 * the cap id that owner-gated writes need.
 *
 * A failed read means "can't confirm", which resolves to `false` — the editor
 * stays hidden rather than being offered and then rejected on submit.
 */
export function ownsPartyEffect(
  client: MisoClient,
  address: string,
  partyId: string,
): Effect.Effect<Ownership, SdkError> {
  return workflow("ownsParty", function* () {
    const capId = client.sui.miso.party.derivePartyAdminCapId(partyId);
    const isOwner = yield* Effect.catch(
      tryPromise("ownsParty", (signal) =>
        client.protocol.core
          .getObject({ signal, objectId: capId })
          .then(({ object }) => isAddressOwner(object?.owner, address)),
      ),
      () => Effect.succeed(false),
    );
    return { address: normalizeSuiAddress(address), objectId: partyId, isOwner, capId };
  });
}

export const ownsParty = toPromise(ownsPartyEffect);

/**
 * Whether `address` owns a record. Records are address-owned objects, so this is
 * one `getObject` and an owner compare. Presentation gating only — it decides
 * whether the Snapshots tab appears, and a non-owner has no snapshot content to
 * fetch regardless.
 */
export function ownsRecordEffect(
  client: MisoClient,
  address: string,
  recordId: string,
): Effect.Effect<Ownership, SdkError> {
  return workflow("ownsRecord", function* () {
    const isOwner = yield* Effect.catch(
      tryPromise("ownsRecord", (signal) =>
        client.protocol.core
          .getObject({ signal, objectId: recordId })
          .then(({ object }) => isAddressOwner(object?.owner, address)),
      ),
      () => Effect.succeed(false),
    );
    return { address: normalizeSuiAddress(address), objectId: recordId, isOwner };
  });
}

export const ownsRecord = toPromise(ownsRecordEffect);

/** Bounded wallet paging; map each page before requesting the next. */
function forOwnedObjectsEffect(
  client: MisoClient,
  owner: string,
  type: string,
  includeContent: boolean,
  visit: (objects: Awaited<ReturnType<MisoClient["protocol"]["core"]["listOwnedObjects"]>>["objects"]) => void,
) {
  return workflow("wallet.ownedObjects", function* () {
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result: Awaited<ReturnType<typeof client.protocol.core.listOwnedObjects>> = yield* tryPromise(
        "wallet.ownedObjects",
        (signal) =>
          client.protocol.core.listOwnedObjects({
            owner,
            type,
            cursor,
            limit: 50,
            signal,
            ...(includeContent ? { include: { content: true } } : {}),
          }),
      );
      visit(result.objects);
      if (!result.hasNextPage || !result.cursor) break;
      cursor = result.cursor;
    }
  });
}
