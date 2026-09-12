// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Single-PTB publisher for a whole release graph: creates every composition and
// recording, derives the release id ON-CHAIN
// (so recordings need not be shared first), builds the tracks/release,
// then shares everything and transfers the admin caps — all in ONE transaction.
//
// Share currencies must already be published + initialized (their Currency objects
// shared on-chain); their ids/types are passed in. Ordering is load-bearing:
//   1. composition::new → recording::new(&comp)  (borrow-before-share)
//   2. release::derive_target_release_id(<recording::id results>) →
//      track::new(cap, &rec, derivedId, split) → release::new(registry, …)
//   3. publish (share) comps + recs + release, disperse supply, transfer caps
// Steps 1–2 borrow the works; step 3 consumes them into share_object.
//
// Release tracks come in two shapes (see TrackNode): recordings created in THIS
// PTB, and existing recordings authorized by their admin cap.
//
// This is the whole-graph orchestration half of the opinionated publish flow —
// it composes `@misofm/musicos`'s bare `composition`/`recording`/`track`/
// `release` core call bindings with its
// own `disperseShares`/`finalizeRelease` helpers into one PTB. Royalty pools are
// installed later through an admin-cap Vault plugin; the retired raw-cap helper
// is intentionally not used here.

import { Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";
import type { Recipe } from "sui-effect";
import { contracts } from "@misofm/musicos";
import { custodyOf, disperseShares, finalizeRelease, recordingAuthorityOf, requiredCommandResult, type AdminCustodyInput, type RecordingAuthorityInput, type ShareRecipient } from "./transactions.ts";
import { disposeNewAdminCap, invokeWithAdminCap } from "./vault.ts";

const { composition, recording, track } = contracts;

interface CompositionNodeBase {
  shareType: string;
  shareCurrencyId: string;
  shareTreasuryCapId: string;
  title: string;
  royaltyRateBps: number;
  shareRecipients: ShareRecipient[];
}
export type CompositionNode = CompositionNodeBase & AdminCustodyInput;

interface RecordingNodeBase {
  shareType: string;
  shareCurrencyId: string;
  shareTreasuryCapId: string;
  /** The parent composition's share type. */
  compositionShareType: string;
  shareRecipients: ShareRecipient[];
}
type RecordingParent =
  | { readonly parentCompositionIndex: number; readonly parentCompositionId?: never }
  | { readonly parentCompositionIndex?: never; readonly parentCompositionId: string };
export type RecordingNode = RecordingNodeBase & RecordingParent & AdminCustodyInput;

/** A track whose recording is created in THIS PTB. */
export interface FreshTrackNode {
  /** Index into `recordings[]`. */
  recordingIndex: number;
  splitBps: number;
}

/**
 * A track over an EXISTING recording, authorized by its admin cap held by the
 * sender. This can coexist with recordings created in this PTB.
 */
interface CapTrackNodeBase {
  recordingId: string;
  recordingShareType: string;
  compositionShareType: string;
  splitBps: number;
}
export type CapTrackNode = CapTrackNodeBase & RecordingAuthorityInput;

export type TrackNode = FreshTrackNode | CapTrackNode;

const isFresh = (t: TrackNode): t is FreshTrackNode => "recordingIndex" in t;

function requiredAt<T>(items: readonly T[], index: number, description: string): T {
  const item = items[index];
  if (item === undefined) throw new Error(`${description} index ${index} is out of range`);
  return item;
}

interface ReleaseNodeBase {
  title: string;
  /** u256 nonce as a decimal string (deterministic release id). */
  nonce: string;
  releaseRegistryId: string;
  /** The ordered tracklist. Display grouping (discs/sides) is extension data. */
  tracks: TrackNode[];
}
export type ReleaseNode = ReleaseNodeBase & AdminCustodyInput;

export interface PublishReleaseGraphParams {
  compositions: CompositionNode[];
  recordings: RecordingNode[];
  release?: ReleaseNode;
  misoPackageId: string;
  minatoPackageId: string;
}

interface Parts {
  work: TransactionObjectArgument;
  adminCap: TransactionObjectArgument;
  balance: TransactionObjectArgument;
}

/** Builds the entire graph in a single transaction (see file header for ordering). */
export function publishReleaseGraph(params: PublishReleaseGraphParams): Recipe {
  const { misoPackageId: pkg, minatoPackageId } = params;
  return (tx) => {
    // ── 1) Create every composition, then every recording (borrow-before-share) ──
    const comps: Parts[] = params.compositions.map((c) => {
      const r = tx.add(
        composition._new({
          package: pkg,
          typeArguments: [c.shareType],
          arguments: [tx.pure.string(c.title), tx.pure.u16(c.royaltyRateBps), tx.object(c.shareCurrencyId), tx.object(c.shareTreasuryCapId)],
        }),
      );
      const parts: Parts = {
        work: requiredCommandResult(r, 0, "composition::_new"),
        adminCap: requiredCommandResult(r, 1, "composition::_new"),
        balance: requiredCommandResult(r, 2, "composition::_new"),
      };
      return parts;
    });

    const recTypeArgs = (i: number): [string, string] => {
      const n = requiredAt(params.recordings, i, "recording");
      return [n.shareType, n.compositionShareType];
    };

    const recs: Parts[] = params.recordings.map((rec, i) => {
      const parent = rec.parentCompositionIndex !== undefined
        ? requiredAt(comps, rec.parentCompositionIndex, "parent composition").work
        : tx.object(rec.parentCompositionId);
      const typeArgs = recTypeArgs(i);
      const r = tx.add(
        recording._new({ package: pkg, typeArguments: typeArgs, arguments: [parent, tx.object(rec.shareCurrencyId), tx.object(rec.shareTreasuryCapId)] }),
      );
      const parts: Parts = {
        work: requiredCommandResult(r, 0, "recording::_new"),
        adminCap: requiredCommandResult(r, 1, "recording::_new"),
        balance: requiredCommandResult(r, 2, "recording::_new"),
      };
      return parts;
    });

    // ── 2) Release: derive the id on-chain, then tracks → release ──────────
    if (params.release) {
      const rel = params.release;
      const ordered = rel.tracks;
      const idVec = tx.makeMoveVec({
        type: "0x2::object::ID",
        elements: ordered.map((t) =>
          isFresh(t)
            ? tx.moveCall({
                target: "0x2::object::id",
                typeArguments: [
                  `${pkg}::recording::Recording<${recTypeArgs(t.recordingIndex).join(",")}>`,
                ],
                arguments: [requiredAt(recs, t.recordingIndex, "fresh recording").work],
              })
            : tx.pure.id(t.recordingId),
        ),
      });
      const splitVec = tx.makeMoveVec({ type: "u64", elements: ordered.map((t) => tx.pure.u64(t.splitBps)) });
      // This returns an ID value (not an object); pass the result straight to
      // `track::new` so every track consents to this exact release target.
      const releaseId = tx.moveCall({
        target: `${pkg}::release::derive_target_release_id`,
        arguments: [tx.object(rel.releaseRegistryId), idVec, splitVec, tx.pure.u256(BigInt(rel.nonce))],
      });

      const trackArgs = ordered.map((t) => {
        if (isFresh(t)) {
          const typeArgs = recTypeArgs(t.recordingIndex);
          const parts = requiredAt(recs, t.recordingIndex, "fresh recording");
          return tx.add(track._new({ package: pkg, typeArguments: typeArgs, arguments: [parts.adminCap, parts.work, releaseId, tx.pure.u16(t.splitBps)] }));
        }
        const typeArgs: [string, string] = [t.recordingShareType, t.compositionShareType];
        const rec = tx.object(t.recordingId);
        return invokeWithAdminCap(tx, recordingAuthorityOf(t), {
          target: `${pkg}::track::new`,
          typeArguments: typeArgs,
          arguments: [rec, releaseId, tx.pure.u16(t.splitBps)],
          adminCapIndex: 0,
        });
      });
      const trackVec = tx.makeMoveVec({ type: `${pkg}::track::Track`, elements: trackArgs });
      const created = tx.moveCall({
        target: `${pkg}::release::new`,
        arguments: [tx.object(rel.releaseRegistryId), tx.pure.string(rel.title), trackVec, tx.pure.u256(BigInt(rel.nonce))],
      });
      const releaseParts = {
        release: requiredCommandResult(created, 0, "release::new"),
        adminCap: requiredCommandResult(created, 1, "release::new"),
      };
      finalizeRelease(tx, { ...releaseParts, adminCustody: custodyOf(rel), misoPackageId: pkg });
    }

    // ── 3) Share every work, disperse its supply, transfer admin caps ──
    params.compositions.forEach((c, i) => {
      const parts = requiredAt(comps, i, "composition");
      disperseShares(tx, minatoPackageId, c.shareType, parts.balance, c.shareRecipients);
      tx.add(composition.publish({ package: pkg, typeArguments: [c.shareType], arguments: [parts.work, parts.adminCap] }));
      disposeNewAdminCap(tx, parts.adminCap, custodyOf(c));
    });
    params.recordings.forEach((rec, i) => {
      const parts = requiredAt(recs, i, "recording");
      tx.add(recording.publish({ package: pkg, typeArguments: recTypeArgs(i), arguments: [parts.work, parts.adminCap] }));
      disperseShares(tx, minatoPackageId, rec.shareType, parts.balance, rec.shareRecipients);
      disposeNewAdminCap(tx, parts.adminCap, custodyOf(rec));
    });
  };
}
