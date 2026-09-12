// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Transaction builders follow the Sui SDK thunk pattern: a builder returns a
// `(tx: Transaction) => …` thunk that adds commands to a caller-owned
// `Transaction`, so a platform call composes with protocol calls and anything
// else in the same PTB.
//
// This module holds the OPINIONATED publish flows. `@misofm/musicos` does the
// minimum the Move semantics FORCE and returns anything a caller could
// legitimately route elsewhere; deciding where those values GO is the
// platform-layer call that lives here:
//
//   - minting a work's share supply is a protocol primitive
//     (`createComposition`/`createRecording`) — allocating it to raw address
//     balances or composable Stake objects, publishing (sharing) the work, and
//     transferring its admin cap is an opinion about economics;
//   - minting a release is a platform primitive: core's `release::new` takes an
//     unconstructible PTB `&mut UID`, so core `release::new(registry, …)` is the
//     canonical client path. Choosing a track-assembly strategy, publishing
//     (sharing) it, and picking a recipient for its `ReleaseAdminCap` is the
//     opinion, so `finalizeRelease` / `publishRelease` live here.
//
// Every `finalize*` here MUST run in the same PTB as the `create*` that produced
// its parts — `Composition`, `Recording`, and `Release` are all `key`-only with
// no `drop`, so none can outlive its creating transaction. That is a same-PTB
// constraint, not a same-function one, which is exactly what makes this split
// possible.
//
// Composes with `@misofm/musicos`'s calls in the same PTB (the
// transaction-thunk composition pattern, just crossing a package boundary now).

import { Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";
import { type Recipe } from "@unconfirmed/sui-effect";
import {
  contracts,
  createComposition,
  createRecording,
  type CompositionParts,
  type CreateCompositionParams,
  type CreateRecordingParams,
  type RecordingParts,
  type ShareCurrencyBinding,
  type TxThunk,
} from "@misofm/musicos";
import { asU64, directAdminCap, disposeNewAdminCap, invokeWithAdminCap, type AdminCapAuthority, type AdminCapCustody, type U64Input } from "./vault.ts";
import * as royaltyPool from "./contracts/royalty_pool/pool.ts";
import * as royaltyPoolStake from "./contracts/royalty_pool/stake.ts";

const { track, release } = contracts;

interface ReleaseParts {
  release: TransactionObjectArgument;
  adminCap: TransactionObjectArgument;
}

/**
 * @deprecated `TxThunk` was the predecessor hand-written name for what
 * sui-effect calls `Recipe`. Kept as one minor for source compatibility
 * (misofm/sdks#35's migration map); every builder in this package is typed
 * `Recipe` directly (B8, misofm/sdks#35 verification — `git grep TxThunk
 * packages/platform/src` shows only this re-export). Import `Recipe` from
 * `@unconfirmed/sui-effect` instead.
 */
export type { TxThunk };

/** New custody is explicit; the legacy address shape remains mutually exclusive. */
export type AdminCustodyInput =
  | { readonly adminCustody: AdminCapCustody; readonly adminAddress?: never }
  | { readonly adminCustody?: never; readonly adminAddress: string };
export type RecordingAuthorityInput =
  | { readonly recordingAuthority: AdminCapAuthority; readonly recordingAdminCapId?: never }
  | { readonly recordingAuthority?: never; readonly recordingAdminCapId: string };

export function custodyOf(input: AdminCustodyInput): AdminCapCustody {
  if (input.adminCustody !== undefined) return input.adminCustody;
  if (input.adminAddress !== undefined) return { kind: "direct", owner: input.adminAddress };
  throw new Error("admin custody is required");
}
export function recordingAuthorityOf(input: RecordingAuthorityInput): AdminCapAuthority {
  if (input.recordingAuthority !== undefined) return input.recordingAuthority;
  if (input.recordingAdminCapId !== undefined) return directAdminCap(input.recordingAdminCapId);
  throw new Error("recording authority is required");
}

/** Reject a malformed multi-result command before it becomes a PTB argument. */
export function requiredCommandResult<T>(
  result: { readonly [index: number]: T | undefined },
  index: number,
  command: string,
): T {
  const value = result[index];
  if (value === undefined) {
    throw new Error(`${command} did not return result ${index}`);
  }
  return value;
}

// ============================================================================
// Share dispersal (minato)
// ============================================================================

export interface ShareRecipient {
  address: string;
  value: U64Input;
}

export interface CreateShareStakeParams {
  readonly balance: TransactionObjectArgument;
  readonly shareType: string;
  readonly value: U64Input;
  readonly royaltyPoolPackageId: string;
}

/** Split shares from a Balance and return a fresh, unregistered Stake object. */
export function createShareStake(
  tx: Transaction,
  params: CreateShareStakeParams,
): TransactionObjectArgument {
  const value = asU64("share stake value", params.value);
  if (value === 0n) throw new Error("share stake value must be greater than zero");
  const stakeBalance = tx.moveCall({
    target: "0x2::balance::split",
    typeArguments: [params.shareType],
    arguments: [params.balance, tx.pure.u64(value)],
  });
  return tx.add(
    royaltyPoolStake._new({
      package: params.royaltyPoolPackageId,
      typeArguments: [params.shareType],
      arguments: [stakeBalance],
    }),
  );
}

export interface RegisterShareStakeParams {
  readonly stake: TransactionObjectArgument;
  readonly pool: TransactionObjectArgument;
  readonly shareType: string;
  readonly currencyType: string;
  readonly royaltyPoolPackageId: string;
}

/** Register an existing Stake with one RoyaltyPool. */
export function registerShareStake(
  tx: Transaction,
  params: RegisterShareStakeParams,
): void {
  tx.add(
    royaltyPool.registerStake({
      package: params.royaltyPoolPackageId,
      typeArguments: [params.shareType, params.currencyType],
      arguments: [params.pool, params.stake],
    }),
  );
}

export interface CreateShareStakesParams {
  readonly balance: TransactionObjectArgument;
  readonly shareType: string;
  readonly recipients: readonly ShareRecipient[];
  readonly royaltyPoolPackageId: string;
}

/**
 * Convert an entire share Balance into one unregistered Stake per recipient.
 * The emptied Balance is destroyed, so recipient values must consume it exactly.
 * Returned stakes remain caller-controlled for optional registration and transfer.
 */
export function createShareStakes(
  tx: Transaction,
  params: CreateShareStakesParams,
): TransactionObjectArgument[] {
  if (params.recipients.length === 0) {
    throw new Error("share stake recipients must not be empty");
  }
  const values = params.recipients.map((recipient) => {
    const value = asU64("share stake value", recipient.value);
    if (value === 0n) throw new Error("share stake value must be greater than zero");
    return value;
  });
  const stakes = params.recipients.map((recipient, index) => createShareStake(tx, {
    balance: params.balance,
    shareType: params.shareType,
    value: values[index]!,
    royaltyPoolPackageId: params.royaltyPoolPackageId,
  }));
  tx.moveCall({
    target: "0x2::balance::destroy_zero",
    typeArguments: [params.shareType],
    arguments: [params.balance],
  });
  return stakes;
}

export interface ShareRoyaltyPoolParams {
  readonly pool: TransactionObjectArgument;
  readonly shareType: string;
  readonly currencyType: string;
  readonly royaltyPoolPackageId: string;
}

/** Consume an unshared RoyaltyPool and make it globally accessible. */
export function shareRoyaltyPool(tx: Transaction, params: ShareRoyaltyPoolParams): void {
  tx.add(
    royaltyPool.share({
      package: params.royaltyPoolPackageId,
      typeArguments: [params.shareType, params.currencyType],
      arguments: [params.pool],
    }),
  );
}

/**
 * Splits a share `Balance` across `recipients` via `minato::disperse_balance`, then
 * destroys the emptied balance. Exposed for consumers assembling custom share
 * distributions in their own PTBs.
 */
export function disperseShares(
  tx: Transaction,
  minatoPackageId: string,
  shareType: string,
  balance: TransactionObjectArgument,
  recipients: ShareRecipient[],
) {
  tx.moveCall({
    target: `${minatoPackageId}::minato::disperse_balance`,
    typeArguments: [shareType],
    arguments: [
      balance,
      tx.makeMoveVec({ type: "u64", elements: recipients.map((r) => tx.pure.u64(asU64("share recipient value", r.value)))}),
      tx.makeMoveVec({ type: "address", elements: recipients.map((r) => tx.pure.address(r.address)) }),
    ],
  });
  tx.moveCall({ target: "0x2::balance::destroy_zero", typeArguments: [shareType], arguments: [balance] });
}

// ============================================================================
// Share currency (external share / framework)
// ============================================================================

export interface PackageBytecode {
  modules: string[];
  dependencies: string[];
  digest: number[];
}

/** Publish a share package and permanently destroy its UpgradeCap in the same PTB. */
export function publishShareCurrency(bytecode: PackageBytecode): Recipe {
  return (tx) => {
    const upgradeCap = tx.publish(bytecode);
    tx.moveCall({ target: "0x2::package::make_immutable", arguments: [upgradeCap] });
  };
}

const SUI_COIN_REGISTRY_ID = "0xc";

export interface InitializeShareCurrencyParams {
  shareCurrencyPackageId: string;
  name: string;
  description: string;
  iconUrl: string;
  treasuryCapRecipient: string;
}

export function initializeShareCurrency(params: InitializeShareCurrencyParams): Recipe {
  const { shareCurrencyPackageId, name, description, iconUrl, treasuryCapRecipient } = params;
  return (tx) => {
    const treasuryCap = tx.moveCall({
      target: `${shareCurrencyPackageId}::share::initialize`,
      arguments: [tx.pure.string(name), tx.pure.string(description), tx.pure.string(iconUrl), tx.object(SUI_COIN_REGISTRY_ID)],
    });
    tx.transferObjects([treasuryCap], treasuryCapRecipient);
  };
}

// ============================================================================
// Composition
// ============================================================================

interface FinalizeCompositionParamsBase extends CompositionParts {
  /** The composition's `share::Share` type. */
  shareType: string;
  shareRecipients: ShareRecipient[];
  misoPackageId: string;
  minatoPackageId: string;
}
export type FinalizeCompositionParams = FinalizeCompositionParamsBase & AdminCustodyInput;

/**
 * The opinionated finish for a composition: disperse its share supply to
 * `shareRecipients`, publish (share) it, and transfer its admin cap to
 * `adminAddress`. Consumers that want different economics skip this and act on
 * the `CompositionParts` from `@misofm/musicos`'s `createComposition` directly.
 */
export function finalizeComposition(tx: Transaction, params: FinalizeCompositionParams): void {
  disperseShares(tx, params.minatoPackageId, params.shareType, params.balance, params.shareRecipients);
  tx.add(contracts.composition.publish({ package: params.misoPackageId, typeArguments: [params.shareType], arguments: [params.composition, params.adminCap] }));
  disposeNewAdminCap(tx, params.adminCap, custodyOf(params));
}

interface PublishCompositionParamsBase extends ShareCurrencyBinding {
  title: string;
  royaltyRateBps: number;
  shareRecipients: ShareRecipient[];
  misoPackageId: string;
  minatoPackageId: string;
}
export type PublishCompositionParams = PublishCompositionParamsBase & AdminCustodyInput;

/** Convenience: publish a composition end-to-end (createComposition → finalizeComposition). */
export function publishComposition(params: PublishCompositionParams): Recipe {
  return (tx) => {
    const parts = createComposition(tx, {
      shareType: params.shareType,
      shareCurrencyId: params.shareCurrencyId,
      shareTreasuryCapId: params.shareTreasuryCapId,
      title: params.title,
      royaltyRateBps: params.royaltyRateBps,
      misoPackageId: params.misoPackageId,
    } satisfies CreateCompositionParams);
    finalizeComposition(tx, {
      ...parts,
      shareType: params.shareType,
      shareRecipients: params.shareRecipients,
      adminCustody: custodyOf(params),
      misoPackageId: params.misoPackageId,
      minatoPackageId: params.minatoPackageId,
    });
  };
}

// ============================================================================
// Recording
// ============================================================================

interface FinalizeRecordingParamsBase extends RecordingParts {
  /** The recording's own `share::Share` type. */
  recordingShareType: string;
  /** Share type of the parent composition. */
  compositionShareType: string;
  shareRecipients: ShareRecipient[];
  misoPackageId: string;
  minatoPackageId: string;
}
export type FinalizeRecordingParams = FinalizeRecordingParamsBase & AdminCustodyInput;

/**
 * The opinionated finish for a recording: publish (share) it, disperse its
 * share supply, and transfer its admin cap to `adminAddress`. A recording has
 * no embedded metadata to set — naming lives in the metadata extension.
 */
export function finalizeRecording(tx: Transaction, params: FinalizeRecordingParams): void {
  const typeArguments: [string, string] = [params.recordingShareType, params.compositionShareType];
  tx.add(contracts.recording.publish({ package: params.misoPackageId, typeArguments, arguments: [params.recording, params.adminCap] }));
  disperseShares(tx, params.minatoPackageId, params.recordingShareType, params.balance, params.shareRecipients);
  disposeNewAdminCap(tx, params.adminCap, custodyOf(params));
}

interface PublishRecordingParamsBase extends ShareCurrencyBinding {
  /**
   * Parent composition, referenced as an on-chain object. Read-only at
   * `recording::new` (only its royalty rate and id are read).
   */
  compositionId: string;
  /** Share type of the parent composition (the recording's `CompositionShare` phantom). */
  compositionShareType: string;
  shareRecipients: ShareRecipient[];
  misoPackageId: string;
  minatoPackageId: string;
}
export type PublishRecordingParams = PublishRecordingParamsBase & AdminCustodyInput;

/** Convenience: publish a recording against an already-on-chain composition. */
export function publishRecording(params: PublishRecordingParams): Recipe {
  return (tx) => {
    const parts = createRecording(tx, {
      shareType: params.shareType,
      shareCurrencyId: params.shareCurrencyId,
      shareTreasuryCapId: params.shareTreasuryCapId,
      compositionShareType: params.compositionShareType,
      composition: tx.object(params.compositionId),
      misoPackageId: params.misoPackageId,
    } satisfies CreateRecordingParams);
    finalizeRecording(tx, {
      ...parts,
      recordingShareType: params.shareType,
      compositionShareType: params.compositionShareType,
      shareRecipients: params.shareRecipients,
      adminCustody: custodyOf(params),
      misoPackageId: params.misoPackageId,
      minatoPackageId: params.minatoPackageId,
    });
  };
}

// ============================================================================
// Composition + Recording (single PTB)
// ============================================================================

export interface PublishCompositionAndRecordingParams {
  title: string;
  royaltyRateBps: number;
  /** Share-currency binding for the composition. */
  composition: ShareCurrencyBinding & { shareRecipients: ShareRecipient[] } & AdminCustodyInput;
  /** Share-currency binding for the recording. */
  recording: ShareCurrencyBinding & { shareRecipients: ShareRecipient[] } & AdminCustodyInput;
  misoPackageId: string;
  minatoPackageId: string;
}

/**
 * Publishes a composition and its recording in a single atomic PTB.
 *
 * The ordering is load-bearing: `recording::new` borrows the composition by
 * immutable reference, so it must run while the composition is still an unshared,
 * transaction-local value — i.e. AFTER `composition::new` but BEFORE
 * `composition::publish` (which moves the composition into `share_object`). Hence:
 * `composition::new` → `recording::new(&comp)` → finalize composition (publish) →
 * finalize recording (publish).
 */
export function publishCompositionAndRecording(params: PublishCompositionAndRecordingParams): Recipe {
  return (tx) => {
    const comp = createComposition(tx, {
      shareType: params.composition.shareType,
      shareCurrencyId: params.composition.shareCurrencyId,
      shareTreasuryCapId: params.composition.shareTreasuryCapId,
      title: params.title,
      royaltyRateBps: params.royaltyRateBps,
      misoPackageId: params.misoPackageId,
    } satisfies CreateCompositionParams);

    // Borrow the still-unshared composition into recording::new before publishing it.
    // The composition's royalty rate is immutable once set at `composition::new`,
    // so `recording::new` reads exactly the rate this PTB just created it with.
    const rec = createRecording(tx, {
      shareType: params.recording.shareType,
      shareCurrencyId: params.recording.shareCurrencyId,
      shareTreasuryCapId: params.recording.shareTreasuryCapId,
      compositionShareType: params.composition.shareType,
      composition: comp.composition,
      misoPackageId: params.misoPackageId,
    } satisfies CreateRecordingParams);

    finalizeComposition(tx, {
      ...comp,
      shareType: params.composition.shareType,
      shareRecipients: params.composition.shareRecipients,
      adminCustody: custodyOf(params.composition),
      misoPackageId: params.misoPackageId,
      minatoPackageId: params.minatoPackageId,
    });

    finalizeRecording(tx, {
      ...rec,
      recordingShareType: params.recording.shareType,
      compositionShareType: params.composition.shareType,
      shareRecipients: params.recording.shareRecipients,
      adminCustody: custodyOf(params.recording),
      misoPackageId: params.misoPackageId,
      minatoPackageId: params.minatoPackageId,
    });
  };
}

// ============================================================================
// Release
// ============================================================================

interface FinalizeReleaseParamsBase extends ReleaseParts {
  /** Explicit direct delivery or Vault custody for the ReleaseAdminCap. */
  misoPackageId: string;
}
export type FinalizeReleaseParams = FinalizeReleaseParamsBase & AdminCustodyInput;

/**
 * The opinionated finish for a release: publish (share) it and transfer its
 * admin cap to `adminAddress`.
 *
 * MUST run in the same PTB as `release::new(registry, …)` that produced
 * these parts —
 * `Release` is `key`-only with no `drop`, so an unpublished release cannot
 * outlive its transaction. Splitting create from finalize is what lets a caller
 * do something else with the cap (route it to a vault, hand it to another
 * package, keep it for later commands) instead of a plain address transfer.
 */
export function finalizeRelease(tx: Transaction, params: FinalizeReleaseParams): void {
  tx.add(release.publish({ package: params.misoPackageId, arguments: [params.release, params.adminCap] }));
  disposeNewAdminCap(tx, params.adminCap, custodyOf(params));
}

interface TrackInputBase {
  recordingId: string;
  /** Explicit legacy direct cap or Vault custody authority for this recording. */
  /** Share type of the recording (the track `RecordingShare` phantom). */
  recordingShareType: string;
  /** Share type of the parent composition (the track `CompositionShare` phantom). */
  compositionShareType: string;
  splitBps: number;
}
export type TrackInput = TrackInputBase & RecordingAuthorityInput;

interface PublishReleaseParamsBase {
  title: string;
  /** The ordered tracklist. Display grouping (discs/sides) is extension data. */
  tracks: TrackInput[];
  /** Shared core `miso::release::ReleaseRegistry` object. */
  releaseRegistryId: string;
  releaseId: string;
  releaseNonce: string;
  misoPackageId: string;
}
export type PublishReleaseParams = PublishReleaseParamsBase & AdminCustodyInput;

function buildTrackVec(
  tx: Transaction,
  misoPackageId: string,
  trackArgs: TransactionObjectArgument[],
) {
  return tx.makeMoveVec({ type: `${misoPackageId}::track::Track`, elements: trackArgs });
}

/**
 * Convenience: publish a release end-to-end, assembling its tracklist from
 * recording admin caps held by the sender.
 */
export function publishRelease(params: PublishReleaseParams): Recipe {
  return (tx) => {
    const { misoPackageId } = params;
    const trackArgs = params.tracks.map((t) => {
      const typeArguments: [string, string] = [t.recordingShareType, t.compositionShareType];
      return invokeWithAdminCap(tx, recordingAuthorityOf(t), {
        target: `${misoPackageId}::track::new`,
        typeArguments,
        arguments: [tx.object(t.recordingId), tx.pure.id(params.releaseId), tx.pure.u16(t.splitBps)],
        adminCapIndex: 0,
      });
    });
    const created = tx.moveCall({
      target: `${misoPackageId}::release::new`,
      arguments: [tx.object(params.releaseRegistryId), tx.pure.string(params.title), buildTrackVec(tx, misoPackageId, trackArgs), tx.pure.u256(BigInt(params.releaseNonce))],
    });
    const parts: ReleaseParts = {
      release: requiredCommandResult(created, 0, "release::new"),
      adminCap: requiredCommandResult(created, 1, "release::new"),
    };
    finalizeRelease(tx, { ...parts, ...params, misoPackageId });
  };
}
