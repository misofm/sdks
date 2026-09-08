// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Opinionated, atomic Miso catalog publication.
 *
 * Share packages and their registered Currency objects must already exist. This
 * builder then creates every declared Party, Composition, Recording, Track,
 * Release, extension, Vault plugin, Pressing, and Listing in one PTB. Share
 * allocation is explicit: callers may preserve raw address balances or create
 * holder Stakes, register them before a fresh pool is shared, and transfer the
 * registered objects. Fresh raw protocol capabilities never leave the
 * transaction: data extensions use them directly, Vault-only plugins are
 * configured while each new Vault is still owned, and only the selected direct
 * cap or VaultAdminCap is delivered.
 */

import { Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";
import {
  contracts as protocolContracts,
  deriveCompositionAdminCapId,
  deriveRecordingAdminCapId,
  deriveReleaseAdminCapId,
} from "@misofm/musicos";
import { party } from "@misofm/partyos/contracts";
import { derivePartyAdminCapId } from "@misofm/partyos";
import {
  requireOperationsDeployment,
  type AvailableOperationsDeployment,
  type MisoPlatformDeployment,
} from "./deployments.ts";
import type { TxThunk } from "./transactions.ts";
import {
  createShareStakes,
  disperseShares,
  registerShareStake,
  requiredCommandResult,
  shareRoyaltyPool,
  type ShareRecipient,
} from "./transactions.ts";
import {
  addRecordingPrimaryArtist,
  addReleaseCredit,
  attachCompositionCredit,
  attachRecordingCredit,
  type CompositionRole,
  type RecordingRole,
  type ReleaseRole,
} from "./credits.ts";
import {
  setRecordingAdvisory,
  setRecordingEngineSession,
  setRecordingInstrumental,
  setRecordingLanguages,
  setRecordingMasterReference,
  setRecordingStreamingTranscode,
} from "./recording-extensions.ts";
import { unencryptedWalrusBlob } from "./internal.ts";
import {
  setReleaseDescription,
  setReleaseDspLinks,
  setReleaseKind,
  type DspLink,
} from "./release-extensions.ts";
import { setReleaseGenres, setRecordingGenres } from "./genre.ts";
import { setReleaseCover, setReleaseTrackCover } from "./cover.ts";
import {
  custodyNewAdminCap,
  createCompositionRoutedStake,
  deriveVaultAdminCapId,
  directAdminCap,
  disposeNewAdminCap,
  installCompositionRoyaltyPoolPlugin,
  installRecordingRoyaltyPoolPlugin,
  installReleaseRevenueDistributorPlugin,
  invokeWithAdminCap,
  newCompositionRoyaltyPool,
  newRecordingRoyaltyPool,
  parseVaultCreatedEvent,
  registerCompositionRoutedStake,
  shareRoutedStake,
  type AdminCapAuthority,
  type AdminCapCustody,
} from "./vault.ts";
import {
  derivePressingAdminCapId,
  derivePressingId,
  type ListingPrice,
} from "./pressing.ts";
import { requireRecordSalesDeployment } from "./deployments.ts";
import { allCreatedByType, createdByExactType, type PlatformExecResult } from "./execute.ts";
import * as pressingContract from "./contracts/record/pressing.ts";
import * as listingContract from "./contracts/record_shop/listing.ts";

const { composition, recording, release, track } = protocolContracts;

export const MAX_ATOMIC_PUBLICATION_COMMANDS = 900;
export const MAX_ATOMIC_PUBLICATION_INPUTS = 2048;
/** Fixed protocol work-share supply: 10 million shares at six decimals. */
const WORK_SHARE_SUPPLY = 10_000_000_000_000n;

export interface PublicationCustody {
  readonly kind: "direct" | "vault";
  readonly owner: string;
}

export type PublicationParty =
  | { readonly ref: string; readonly id: string }
  | {
      readonly ref: string;
      readonly create: "individual" | "group";
      readonly name: string;
      readonly custody: PublicationCustody;
    };

export interface PublicationCompositionCredit {
  readonly party: string;
  readonly displayName: string;
  readonly roles: CompositionRole[];
}

export interface PublicationRecordingCredit {
  readonly party: string;
  readonly displayName: string;
  readonly roles: RecordingRole[];
  readonly primaryArtist?: boolean;
}

export interface PublicationReleaseCredit {
  readonly party: string;
  readonly displayName: string;
  readonly role: ReleaseRole;
}

export interface PublicationComposition {
  readonly ref: string;
  readonly shareType: string;
  readonly shareCurrencyId: string;
  readonly shareTreasuryCapId: string;
  readonly title: string;
  readonly royaltyRateBps: number;
  readonly shareRecipients: ShareRecipient[];
  /** Defaults to raw address balances for SDK compatibility; the CLI selects `stake`. */
  readonly shareDistribution?: "balance" | "stake";
  readonly custody: PublicationCustody;
  readonly credits?: PublicationCompositionCredit[];
  readonly royaltyPool?: { readonly currencyType: string };
}

type PublicationRecordingParent =
  | { readonly parentCompositionIndex: number; readonly parentCompositionId?: never }
  | { readonly parentCompositionIndex?: never; readonly parentCompositionId: string };

/** One stem a Session V1 document references, paired with its Walrus blob. */
export interface PublicationEngineSessionStem {
  /** 32-byte SHA-256 of the stem's canonical PCM (engine STEM_IDENTITY_V1); bytes or 64 hex chars. */
  readonly digest: Uint8Array | string;
  /** Unencrypted Walrus blob holding the stem's FLAC, as its on-chain `u256`. */
  readonly blobId: bigint | string;
}

export interface PublicationEngineSession {
  /** Unencrypted Walrus blob holding the canonical Session V1 JSON, as its on-chain `u256`. */
  readonly sessionBlobId: bigint | string;
  readonly stems: readonly PublicationEngineSessionStem[];
}

export type PublicationRecordingLanguages =
  | { readonly kind: "instrumental" }
  | { readonly kind: "languages"; readonly codes: string[] };

export type PublicationRecording = PublicationRecordingParent & {
  readonly ref: string;
  readonly shareType: string;
  readonly shareCurrencyId: string;
  readonly shareTreasuryCapId: string;
  readonly compositionShareType: string;
  readonly shareRecipients: ShareRecipient[];
  /** Defaults to raw address balances for SDK compatibility; the CLI selects `stake`. */
  readonly shareDistribution?: "balance" | "stake";
  readonly custody: PublicationCustody;
  readonly credits?: PublicationRecordingCredit[];
  readonly royaltyPool?: { readonly currencyType: string };
  /** Route the exact parent Composition royalty cut through this Recording's pool. */
  readonly routedStake?: true;
  readonly advisory?: "Explicit" | "NotExplicit" | "Cleaned";
  /** Ordered genre object ids, primary first (1-6). */
  readonly genres?: string[];
  readonly languages?: PublicationRecordingLanguages;
  readonly masterReferenceBlobId?: bigint | string;
  /** Complete Walrus Quilt ID containing this Recording's streaming transcodes. */
  readonly streamingTranscodeQuiltId?: bigint | string;
  /** This Recording's Miso Engine session: the Session V1 blob and every stem it plays. */
  readonly engineSession?: PublicationEngineSession;
};

export interface PublicationFreshTrack {
  readonly recordingIndex: number;
  readonly splitBps: number;
}

export interface PublicationExistingTrack {
  readonly recordingId: string;
  readonly recordingShareType: string;
  readonly compositionShareType: string;
  readonly splitBps: number;
  readonly authority: AdminCapAuthority;
}

export type PublicationTrack = PublicationFreshTrack | PublicationExistingTrack;

export interface PublicationRelease {
  readonly title: string;
  readonly nonce: string;
  readonly tracks: PublicationTrack[];
  readonly custody: PublicationCustody;
  readonly credits?: PublicationReleaseCredit[];
  readonly kind?: string;
  readonly description?: string;
  /** Ordered genre object ids, primary first (1-6). */
  readonly genres?: string[];
  readonly dspLinks?: {
    readonly release?: DspLink[];
    readonly tracks?: { readonly trackIndex: number; readonly link: DspLink }[];
  };
  readonly cover?: {
    readonly stillBlobId?: bigint | string;
    readonly animatedBlobId?: bigint | string;
    readonly tracks?: {
      readonly trackIndex: number;
      readonly stillBlobId: bigint | string;
      readonly animatedBlobId?: bigint | string;
    }[];
  };
  readonly revenueDistribution?: boolean;
}

export interface PublicationPressing {
  /** Positive edition number encoded as Move u16. */
  readonly edition: number;
  /** Immutable positive u32 ceiling, or null/omitted for an uncapped edition. */
  readonly maxSupply?: number | null;
  readonly listings: {
    readonly currencyType: string;
    readonly price: ListingPrice;
    readonly enabled?: boolean;
  }[];
  readonly custody: PublicationCustody;
}

export interface AtomicPublicationParams {
  readonly deployment: MisoPlatformDeployment;
  readonly parties: PublicationParty[];
  readonly compositions: PublicationComposition[];
  readonly recordings: PublicationRecording[];
  readonly release?: PublicationRelease;
  readonly pressing?: PublicationPressing;
}

interface WorkParts {
  work: TransactionObjectArgument;
  adminCap: TransactionObjectArgument;
  balance: TransactionObjectArgument;
}

interface PartyParts {
  party: TransactionObjectArgument;
  adminCap: TransactionObjectArgument;
}

function requiredAt<T>(items: readonly T[], index: number, description: string): T {
  const value = items[index];
  if (value === undefined) throw new Error(`${description} index ${index} is out of range`);
  return value;
}

function partyCapType(p: AtomicPublicationParams): string {
  return `${p.deployment.partyos.partyos}::party::PartyAdminCap`;
}

function compositionCapType(p: AtomicPublicationParams, shareType: string): string {
  return `${p.deployment.protocol.musicos}::composition::CompositionAdminCap<${shareType}>`;
}

function recordingCapType(p: AtomicPublicationParams, shareType: string): string {
  return `${p.deployment.protocol.musicos}::recording::RecordingAdminCap<${shareType}>`;
}

function releaseCapType(p: AtomicPublicationParams): string {
  return `${p.deployment.protocol.musicos}::release::ReleaseAdminCap`;
}

function pressingCapType(p: AtomicPublicationParams): string {
  return `${requireRecordSalesDeployment(p.deployment.recordSales).recordPackageId}::pressing::PressingAdminCap`;
}

function publicationUsesVault(p: AtomicPublicationParams): boolean {
  return (
    p.parties.some((node) => "create" in node && node.custody.kind === "vault") ||
    p.compositions.some((node) => node.custody.kind === "vault") ||
    p.recordings.some((node) => node.custody.kind === "vault") ||
    p.release?.custody.kind === "vault" ||
    p.release?.tracks.some((node) =>
      "authority" in node && node.authority.kind === "vault"
    ) === true ||
    p.pressing?.custody.kind === "vault"
  );
}

function operations(p: AtomicPublicationParams): AvailableOperationsDeployment {
  return requireOperationsDeployment(p.deployment.operations);
}

function custody(
  p: AtomicPublicationParams,
  selected: PublicationCustody,
  capType: string,
  configure?: Exclude<AdminCapCustody, { kind: "direct" }>["configure"],
): AdminCapCustody {
  if (selected.kind === "direct") return { kind: "direct", owner: selected.owner };
  const available = operations(p);
  return {
    kind: "vault",
    owner: selected.owner,
    vaultRegistry: available.vault.registryId,
    capType,
    vaultPackageId: available.vault.packageId,
    configure,
  };
}

function partyByRef(
  parties: Map<string, TransactionObjectArgument>,
  ref: string,
): TransactionObjectArgument {
  const value = parties.get(ref);
  if (!value) throw new Error(`Unknown publication party ref ${JSON.stringify(ref)}`);
  return value;
}

function languageVector(tx: Transaction, p: AtomicPublicationParams, codes: string[]) {
  const values = codes.map((code) => tx.moveCall({
    target: `${p.deployment.packages.languageCode}::language_code::new`,
    arguments: [tx.pure.string(code)],
  }));
  return tx.makeMoveVec({
    type: `${p.deployment.packages.languageCode}::language_code::LanguageCode`,
    elements: values,
  });
}

function walrusBlob(tx: Transaction, p: AtomicPublicationParams, blobId: bigint | string) {
  return unencryptedWalrusBlob(tx, p.deployment.packages.ori, blobId);
}

function listingPrice(tx: Transaction, p: AtomicPublicationParams, price: ListingPrice) {
  const pkg = requireRecordSalesDeployment(p.deployment.recordSales).recordShopPackageId;
  const args = { package: pkg, arguments: [BigInt(price.amount)] as [bigint] };
  return tx.add(price.kind === "fixed"
    ? listingContract.fixed(args)
    : listingContract.floor(args));
}

function publicationEdition(value: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > 0xffff) {
    throw new RangeError("pressing.edition must be an integer from 1 to 65535");
  }
  return value;
}

function publicationMaxSupply(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value <= 0 || value > 0xffff_ffff) {
    throw new RangeError("pressing.maxSupply must be a positive u32 or null");
  }
  return value;
}

function compositionRoyaltyCut(royaltyRateBps: number): bigint {
  // Atomic publication always allocates a non-zero Recording creator remainder.
  // Lower-level routed-stake builders remain available for Move's 100% case.
  if (!Number.isInteger(royaltyRateBps) || royaltyRateBps <= 0 || royaltyRateBps >= 10_000) {
    throw new RangeError("routed stake requires parent royaltyRateBps from 1 to 9999");
  }
  return (WORK_SHARE_SUPPLY * BigInt(royaltyRateBps)) / 10_000n;
}

interface PublicationShareAllocation {
  readonly shareType: string;
  readonly shareRecipients: ShareRecipient[];
  readonly shareDistribution?: "balance" | "stake";
}

function allocatePublicationShares(
  tx: Transaction,
  p: AtomicPublicationParams,
  node: PublicationShareAllocation,
  balance: TransactionObjectArgument,
): TransactionObjectArgument[] {
  if (node.shareDistribution !== "stake") {
    disperseShares(tx, p.deployment.packages.minato, node.shareType, balance, node.shareRecipients);
    return [];
  }
  return createShareStakes(tx, {
    balance,
    shareType: node.shareType,
    recipients: node.shareRecipients,
    royaltyPoolPackageId: p.deployment.packages.royaltyPool,
  });
}

function registerPublicationStakes(
  tx: Transaction,
  p: AtomicPublicationParams,
  node: PublicationShareAllocation,
  stakes: readonly TransactionObjectArgument[],
  pool: TransactionObjectArgument,
  currencyType: string,
): void {
  for (const stake of stakes) {
    registerShareStake(tx, {
      stake,
      pool,
      shareType: node.shareType,
      currencyType,
      royaltyPoolPackageId: p.deployment.packages.royaltyPool,
    });
  }
}

function transferPublicationStakes(
  tx: Transaction,
  node: PublicationShareAllocation,
  stakes: readonly TransactionObjectArgument[],
): void {
  if (node.shareDistribution !== "stake") {
    if (stakes.length !== 0) throw new Error("balance distribution unexpectedly created stakes");
    return;
  }
  if (stakes.length !== node.shareRecipients.length) {
    throw new Error("publication stake count does not match share recipient count");
  }
  stakes.forEach((stake, index) => {
    tx.transferObjects([stake], tx.pure.address(node.shareRecipients[index]!.address));
  });
}

function publishComposition(
  tx: Transaction,
  p: AtomicPublicationParams,
  node: PublicationComposition,
  parts: WorkParts,
): void {
  const available = node.custody.kind === "vault" ? operations(p) : undefined;
  const stakes = allocatePublicationShares(tx, p, node, parts.balance);
  const typeArguments: [string] = [node.shareType];
  if (node.custody.kind === "direct") {
    tx.add(composition.publish({
      package: p.deployment.protocol.musicos,
      typeArguments,
      arguments: [parts.work, parts.adminCap],
    }));
    disposeNewAdminCap(tx, parts.adminCap, custody(p, node.custody, compositionCapType(p, node.shareType)));
    transferPublicationStakes(tx, node, stakes);
    return;
  }
  custodyNewAdminCap(tx, {
    adminCap: parts.adminCap,
    vaultRegistry: available!.vault.registryId,
    capType: compositionCapType(p, node.shareType),
    vaultPackageId: available!.vault.packageId,
    owner: node.custody.owner,
    configure: (vault, vaultAdminCap) => {
      if (node.royaltyPool) {
        installCompositionRoyaltyPoolPlugin(tx, {
          vault, vaultAdminCap, compositionShareType: node.shareType,
          pluginPackageId: available!.plugins.compositionRoyaltyPool,
        });
        const authority: AdminCapAuthority = {
          kind: "vault", vault, vaultAdminCap,
          capType: compositionCapType(p, node.shareType),
          vaultPackageId: available!.vault.packageId,
        };
        const poolParams = {
          authority, composition: parts.work,
          compositionShareType: node.shareType,
          currencyType: node.royaltyPool.currencyType,
          actionPackageId: available!.actions.compositionRoyaltyPool,
        };
        const pool = newCompositionRoyaltyPool(tx, poolParams);
        if (stakes.length > 0) {
          registerPublicationStakes(tx, p, node, stakes, pool, node.royaltyPool.currencyType);
        }
        shareRoyaltyPool(tx, {
          pool,
          shareType: node.shareType,
          currencyType: node.royaltyPool.currencyType,
          royaltyPoolPackageId: p.deployment.packages.royaltyPool,
        });
      }
      invokeWithAdminCap(tx, {
        kind: "vault", vault, vaultAdminCap,
        capType: compositionCapType(p, node.shareType),
        vaultPackageId: available!.vault.packageId,
      }, {
        target: `${p.deployment.protocol.musicos}::composition::publish`,
        typeArguments,
        arguments: [parts.work, tx.object.clock()],
        adminCapIndex: 1,
      });
    },
  });
  transferPublicationStakes(tx, node, stakes);
}

function publishRecording(
  tx: Transaction,
  p: AtomicPublicationParams,
  node: PublicationRecording,
  parts: WorkParts,
  parentComposition?: { node: PublicationComposition; parts: WorkParts },
): void {
  const available = node.custody.kind === "vault" ? operations(p) : undefined;
  const typeArguments: [string, string] = [node.shareType, node.compositionShareType];
  const stakes = allocatePublicationShares(tx, p, node, parts.balance);
  if (node.custody.kind === "direct") {
    tx.add(recording.publish({
      package: p.deployment.protocol.musicos,
      typeArguments,
      arguments: [parts.work, parts.adminCap],
    }));
    disposeNewAdminCap(tx, parts.adminCap, custody(p, node.custody, recordingCapType(p, node.shareType)));
    transferPublicationStakes(tx, node, stakes);
    return;
  }
  custodyNewAdminCap(tx, {
    adminCap: parts.adminCap,
    vaultRegistry: available!.vault.registryId,
    capType: recordingCapType(p, node.shareType),
    vaultPackageId: available!.vault.packageId,
    owner: node.custody.owner,
    configure: (vault, vaultAdminCap) => {
      if (node.royaltyPool) {
        installRecordingRoyaltyPoolPlugin(tx, {
          vault, vaultAdminCap,
          recordingShareType: node.shareType,
          compositionShareType: node.compositionShareType,
          pluginPackageId: available!.plugins.recordingRoyaltyPool,
        });
        const authority: AdminCapAuthority = {
          kind: "vault", vault, vaultAdminCap,
          capType: recordingCapType(p, node.shareType),
          vaultPackageId: available!.vault.packageId,
        };
        const poolParams = {
          authority, recording: parts.work,
          recordingShareType: node.shareType,
          compositionShareType: node.compositionShareType,
          currencyType: node.royaltyPool.currencyType,
          actionPackageId: available!.actions.recordingRoyaltyPool,
        };
        const pool = newRecordingRoyaltyPool(tx, poolParams);
        if (stakes.length > 0) {
          registerPublicationStakes(tx, p, node, stakes, pool, node.royaltyPool.currencyType);
        }
        if (node.routedStake) {
          if (!parentComposition) throw new Error(`${node.ref}: routed stake requires a fresh parent Composition`);
          const authority = directAdminCap(parentComposition.parts.adminCap);
          const routed = createCompositionRoutedStake(tx, {
            authority,
            composition: parentComposition.parts.work,
            recording: parts.work,
            recordingShareType: node.shareType,
            compositionShareType: node.compositionShareType,
            value: compositionRoyaltyCut(parentComposition.node.royaltyRateBps),
            actionPackageId: available!.actions.compositionRoutedStake,
          });
          registerCompositionRoutedStake(tx, {
            authority,
            composition: parentComposition.parts.work,
            recording: parts.work,
            routedStake: routed,
            royaltyPool: pool,
            recordingShareType: node.shareType,
            compositionShareType: node.compositionShareType,
            currencyType: node.royaltyPool.currencyType,
            actionPackageId: available!.actions.compositionRoutedStake,
          });
          shareRoutedStake(tx, {
            routedStake: routed,
            routedStakePackageId: p.deployment.packages.routedStake,
            stakeShareType: node.shareType,
            poolShareType: node.compositionShareType,
          });
        }
        shareRoyaltyPool(tx, {
          pool,
          shareType: node.shareType,
          currencyType: node.royaltyPool.currencyType,
          royaltyPoolPackageId: p.deployment.packages.royaltyPool,
        });
      }
      invokeWithAdminCap(tx, {
        kind: "vault", vault, vaultAdminCap,
        capType: recordingCapType(p, node.shareType),
        vaultPackageId: available!.vault.packageId,
      }, {
        target: `${p.deployment.protocol.musicos}::recording::publish`,
        typeArguments,
        arguments: [parts.work, tx.object.clock()],
        adminCapIndex: 1,
      });
    },
  });
  transferPublicationStakes(tx, node, stakes);
}

function publishReleaseObject(
  tx: Transaction,
  p: AtomicPublicationParams,
  node: PublicationRelease,
  releaseObject: TransactionObjectArgument,
  adminCap: TransactionObjectArgument,
): void {
  const available = node.custody.kind === "vault" ? operations(p) : undefined;
  if (node.custody.kind === "direct") {
    tx.add(release.publish({
      package: p.deployment.protocol.musicos,
      arguments: [releaseObject, adminCap],
    }));
    disposeNewAdminCap(tx, adminCap, custody(p, node.custody, releaseCapType(p)));
    return;
  }
  custodyNewAdminCap(tx, {
    adminCap,
    vaultRegistry: available!.vault.registryId,
    capType: releaseCapType(p),
    vaultPackageId: available!.vault.packageId,
    owner: node.custody.owner,
    configure: (vault, vaultAdminCap) => {
      if (node.revenueDistribution) {
        installReleaseRevenueDistributorPlugin(tx, {
          vault, vaultAdminCap,
          pluginPackageId: available!.plugins.releaseRevenueDistributor,
        });
      }
      invokeWithAdminCap(tx, {
        kind: "vault", vault, vaultAdminCap,
        capType: releaseCapType(p),
        vaultPackageId: available!.vault.packageId,
      }, {
        target: `${p.deployment.protocol.musicos}::release::publish`,
        arguments: [releaseObject, tx.object.clock()],
        adminCapIndex: 1,
      });
    },
  });
}

/** Build the complete post-share catalog graph as one atomic PTB. */
export function publishAtomicCatalog(p: AtomicPublicationParams): TxThunk {
  if (
    p.recordings.some((node) => node.streamingTranscodeQuiltId !== undefined) &&
    !p.deployment.packages.recordingStreamingTranscode
  ) {
    throw new Error(
      "A recording streaming transcode requires deployment.packages.recordingStreamingTranscode",
    );
  }
  if (
    p.recordings.some((node) => node.engineSession !== undefined) &&
    !p.deployment.packages.recordingEngineSession
  ) {
    throw new Error(
      "A recording engine session requires deployment.packages.recordingEngineSession",
    );
  }
  if (publicationUsesVault(p)) {
    requireOperationsDeployment(p.deployment.operations);
  }
  if (p.pressing) {
    requireRecordSalesDeployment(p.deployment.recordSales);
    if (!p.release) throw new Error("A pressing requires a release");
  }
  for (const node of [...p.compositions, ...p.recordings]) {
    if (node.royaltyPool && node.custody.kind !== "vault") {
      throw new Error(`${node.ref}: permissionless royalty cranks require Vault custody`);
    }
  }
  p.recordings.forEach((node) => {
    if (!node.routedStake) return;
    if (node.parentCompositionIndex === undefined) {
      throw new Error(`${node.ref}: routed stake requires a fresh parent Composition`);
    }
    if (!node.royaltyPool) {
      throw new Error(`${node.ref}: routed stake requires a Recording royalty pool`);
    }
    if (node.shareDistribution !== "stake") {
      throw new Error(`${node.ref}: routed stake requires Recording stake distribution`);
    }
    const parent = requiredAt(p.compositions, node.parentCompositionIndex, "parent composition");
    if (!parent.royaltyPool) {
      throw new Error(`${node.ref}: routed stake requires a parent Composition royalty pool`);
    }
    if (parent.shareDistribution !== "stake") {
      throw new Error(`${node.ref}: routed stake requires parent Composition stake distribution`);
    }
    compositionRoyaltyCut(parent.royaltyRateBps);
    if (parent.royaltyPool.currencyType !== node.royaltyPool.currencyType) {
      throw new Error(`${node.ref}: routed stake pools must use the same currency type`);
    }
    if (parent.custody.kind !== "vault") {
      throw new Error(`${node.ref}: routed stake requires parent Composition Vault custody`);
    }
  });
  if (p.release?.revenueDistribution && p.release.custody.kind !== "vault") {
    throw new Error("Release revenue distribution requires Vault custody");
  }

  return (tx) => {
    const createdParties = new Map<string, PartyParts>();
    const parties = new Map<string, TransactionObjectArgument>();
    for (const node of p.parties) {
      if ("id" in node) {
        parties.set(node.ref, tx.object(node.id));
        continue;
      }
      const kind = tx.add(node.create === "group"
        ? party.newGroupKind({ package: p.deployment.partyos.partyos })
        : party.newIndividualKind({ package: p.deployment.partyos.partyos }));
      const created = tx.add(party._new({
        package: p.deployment.partyos.partyos,
        arguments: [kind, node.name],
      }));
      const parts = {
        party: requiredCommandResult(created, 0, "party::new"),
        adminCap: requiredCommandResult(created, 1, "party::new"),
      };
      createdParties.set(node.ref, parts);
      parties.set(node.ref, parts.party);
    }

    const compositions: WorkParts[] = p.compositions.map((node) => {
      const created = tx.add(composition._new({
        package: p.deployment.protocol.musicos,
        typeArguments: [node.shareType],
        arguments: [node.title, node.royaltyRateBps, node.shareCurrencyId, node.shareTreasuryCapId],
      }));
      return {
        work: requiredCommandResult(created, 0, "composition::new"),
        adminCap: requiredCommandResult(created, 1, "composition::new"),
        balance: requiredCommandResult(created, 2, "composition::new"),
      };
    });

    const recordings: WorkParts[] = p.recordings.map((node) => {
      const parent = node.parentCompositionIndex !== undefined
        ? requiredAt(compositions, node.parentCompositionIndex, "parent composition").work
        : tx.object(node.parentCompositionId);
      const created = tx.add(recording._new({
        package: p.deployment.protocol.musicos,
        typeArguments: [node.shareType, node.compositionShareType],
        arguments: [parent, node.shareCurrencyId, node.shareTreasuryCapId],
      }));
      return {
        work: requiredCommandResult(created, 0, "recording::new"),
        adminCap: requiredCommandResult(created, 1, "recording::new"),
        balance: requiredCommandResult(created, 2, "recording::new"),
      };
    });

    let releaseObject: TransactionObjectArgument | undefined;
    let releaseAdminCap: TransactionObjectArgument | undefined;
    if (p.release) {
      const ids = p.release.tracks.map((node) => "recordingIndex" in node
        ? tx.moveCall({
            target: "0x2::object::id",
            typeArguments: [`${p.deployment.protocol.musicos}::recording::Recording<${p.recordings[node.recordingIndex]!.shareType},${p.recordings[node.recordingIndex]!.compositionShareType}>`],
            arguments: [requiredAt(recordings, node.recordingIndex, "fresh recording").work],
          })
        : tx.pure.id(node.recordingId));
      const targetReleaseId = tx.moveCall({
        target: `${p.deployment.protocol.musicos}::release::derive_target_release_id`,
        arguments: [
          tx.object(p.deployment.objects.releaseRegistry),
          tx.makeMoveVec({ type: "0x2::object::ID", elements: ids }),
          tx.makeMoveVec({ type: "u64", elements: p.release.tracks.map((node) => tx.pure.u64(node.splitBps)) }),
          tx.pure.u256(BigInt(p.release.nonce)),
        ],
      });
      const tracks = p.release.tracks.map((node) => {
        if ("recordingIndex" in node) {
          const recNode = requiredAt(p.recordings, node.recordingIndex, "fresh recording");
          const rec = requiredAt(recordings, node.recordingIndex, "fresh recording");
          return tx.add(track._new({
            package: p.deployment.protocol.musicos,
            typeArguments: [recNode.shareType, recNode.compositionShareType],
            arguments: [rec.adminCap, rec.work, targetReleaseId, node.splitBps],
          }));
        }
        return invokeWithAdminCap(tx, node.authority, {
          target: `${p.deployment.protocol.musicos}::track::new`,
          typeArguments: [node.recordingShareType, node.compositionShareType],
          arguments: [tx.object(node.recordingId), targetReleaseId, tx.pure.u16(node.splitBps)],
          adminCapIndex: 0,
        });
      });
      const created = tx.moveCall({
        target: `${p.deployment.protocol.musicos}::release::new`,
        arguments: [
          tx.object(p.deployment.objects.releaseRegistry),
          tx.pure.string(p.release.title),
          tx.makeMoveVec({ type: `${p.deployment.protocol.musicos}::track::Track`, elements: tracks }),
          tx.pure.u256(BigInt(p.release.nonce)),
        ],
      });
      releaseObject = requiredCommandResult(created, 0, "release::new");
      releaseAdminCap = requiredCommandResult(created, 1, "release::new");
    }

    p.compositions.forEach((node, index) => {
      const parts = requiredAt(compositions, index, "composition");
      for (const credit of node.credits ?? []) {
        attachCompositionCredit({
          compositionId: parts.work,
          authority: directAdminCap(parts.adminCap),
          partyId: partyByRef(parties, credit.party),
          displayName: credit.displayName,
          roles: credit.roles,
          compositionShareType: node.shareType,
          compositionCreditsPackageId: p.deployment.packages.compositionCredits,
          misoCreditPackageId: p.deployment.packages.credit,
        })(tx);
      }
    });

    p.recordings.forEach((node, index) => {
      const parts = requiredAt(recordings, index, "recording");
      const authority = directAdminCap(parts.adminCap);
      for (const credit of node.credits ?? []) {
        const target = partyByRef(parties, credit.party);
        attachRecordingCredit({
          recordingId: parts.work, authority, partyId: target,
          displayName: credit.displayName, roles: credit.roles,
          recordingShareType: node.shareType,
          compositionShareType: node.compositionShareType,
          recordingCreditsPackageId: p.deployment.packages.recordingCredits,
          misoCreditPackageId: p.deployment.packages.credit,
        })(tx);
        if (credit.primaryArtist) {
          addRecordingPrimaryArtist({
            recordingId: parts.work, authority, partyId: target,
            recordingShareType: node.shareType,
            compositionShareType: node.compositionShareType,
            recordingCreditsPackageId: p.deployment.packages.recordingCredits,
          })(tx);
        }
      }
      if (node.advisory) setRecordingAdvisory({
        recordingId: parts.work, authority,
        recordingShareType: node.shareType,
        compositionShareType: node.compositionShareType,
        recordingAdvisoryPackageId: p.deployment.packages.recordingAdvisory,
        rating: node.advisory,
      })(tx);
      if (node.genres) {
        const recordingGenrePackageId = p.deployment.packages.recordingGenre;
        if (!recordingGenrePackageId) {
          throw new Error(
            "publishAtomicCatalog: recording genres require deployment.packages.recordingGenre",
          );
        }
        setRecordingGenres({
          recordingId: parts.work, authority,
          recordingShareType: node.shareType,
          compositionShareType: node.compositionShareType,
          recordingGenrePackageId,
          genreIds: node.genres,
        })(tx);
      }
      if (node.languages?.kind === "instrumental") setRecordingInstrumental({
        recordingId: parts.work, authority,
        recordingShareType: node.shareType,
        compositionShareType: node.compositionShareType,
        recordingLanguagePackageId: p.deployment.packages.recordingLanguage,
      })(tx);
      if (node.languages?.kind === "languages") setRecordingLanguages({
        recordingId: parts.work, authority,
        recordingShareType: node.shareType,
        compositionShareType: node.compositionShareType,
        recordingLanguagePackageId: p.deployment.packages.recordingLanguage,
        languages: languageVector(tx, p, node.languages.codes),
      })(tx);
      if (node.masterReferenceBlobId !== undefined) setRecordingMasterReference({
        recordingId: parts.work, authority,
        recordingShareType: node.shareType,
        compositionShareType: node.compositionShareType,
        recordingMasterReferencePackageId: p.deployment.packages.recordingMasterReference,
        reference: walrusBlob(tx, p, node.masterReferenceBlobId),
      })(tx);
      if (node.streamingTranscodeQuiltId !== undefined) setRecordingStreamingTranscode({
        recordingId: parts.work, authority,
        recordingShareType: node.shareType,
        compositionShareType: node.compositionShareType,
        recordingStreamingTranscodePackageId:
          p.deployment.packages.recordingStreamingTranscode!,
        oriPackageId: p.deployment.packages.ori,
        quiltId: node.streamingTranscodeQuiltId,
      })(tx);
      if (node.engineSession !== undefined) setRecordingEngineSession({
        recordingId: parts.work, authority,
        recordingShareType: node.shareType,
        compositionShareType: node.compositionShareType,
        recordingEngineSessionPackageId: p.deployment.packages.recordingEngineSession!,
        oriPackageId: p.deployment.packages.ori,
        sessionBlobId: node.engineSession.sessionBlobId,
        stems: node.engineSession.stems,
      })(tx);
    });

    if (p.release && releaseObject && releaseAdminCap) {
      const authority = directAdminCap(releaseAdminCap);
      for (const credit of p.release.credits ?? []) addReleaseCredit({
        releaseId: releaseObject, authority,
        partyId: partyByRef(parties, credit.party),
        displayName: credit.displayName, role: credit.role,
        releaseCreditsPackageId: p.deployment.packages.releaseCredits,
        misoCreditPackageId: p.deployment.packages.credit,
      })(tx);
      if (p.release.kind) setReleaseKind({
        releaseId: releaseObject, authority, kind: p.release.kind,
        releaseKindPackageId: p.deployment.packages.releaseKind,
      })(tx);
      if (p.release.description) setReleaseDescription({
        releaseId: releaseObject, authority, description: p.release.description,
        releaseDescriptionPackageId: p.deployment.packages.releaseDescription,
      })(tx);
      if (p.release.genres) setReleaseGenres({
        releaseId: releaseObject, authority,
        genreIds: p.release.genres,
        releaseGenrePackageId: p.deployment.packages.releaseGenre,
      })(tx);
      if (p.release.dspLinks) setReleaseDspLinks({
        releaseId: releaseObject, authority,
        releaseLinks: p.release.dspLinks.release ?? [],
        trackLinks: p.release.dspLinks.tracks ?? [],
        releaseDspLinkPackageId: p.deployment.packages.releaseDspLink,
      })(tx);
      if (p.release.cover?.stillBlobId !== undefined) setReleaseCover({
        releaseId: releaseObject, authority,
        stillBlobId: p.release.cover.stillBlobId,
        animatedBlobId: p.release.cover.animatedBlobId,
        coverArtPackageId: p.deployment.packages.coverArt,
        releaseCoverArtPackageId: p.deployment.packages.releaseCoverArt,
        oriPackageId: p.deployment.packages.ori,
      })(tx);
      for (const cover of p.release.cover?.tracks ?? []) setReleaseTrackCover({
        releaseId: releaseObject, authority,
        trackIndex: cover.trackIndex,
        stillBlobId: cover.stillBlobId,
        animatedBlobId: cover.animatedBlobId,
        coverArtPackageId: p.deployment.packages.coverArt,
        releaseCoverArtPackageId: p.deployment.packages.releaseCoverArt,
        oriPackageId: p.deployment.packages.ori,
      })(tx);
    }

    let pressingParts: { pressing: TransactionObjectArgument; adminCap: TransactionObjectArgument } | undefined;
    if (p.pressing && releaseObject && releaseAdminCap) {
      const sales = requireRecordSalesDeployment(p.deployment.recordSales);
      const created = tx.add(pressingContract._new({
        package: sales.recordPackageId,
        arguments: [
          releaseObject,
          releaseAdminCap,
          publicationEdition(p.pressing.edition),
          publicationMaxSupply(p.pressing.maxSupply),
        ],
      }));
      pressingParts = {
        pressing: requiredCommandResult(created, 0, "pressing::new"),
        adminCap: requiredCommandResult(created, 1, "pressing::new"),
      };
      tx.add(pressingContract.authorizeDistributor({
        package: sales.recordPackageId,
        typeArguments: [`${sales.recordShopPackageId}::witness::Witness`],
        arguments: [pressingParts.pressing, pressingParts.adminCap],
      }));
      for (const listing of p.pressing.listings) {
        const createdListing = tx.add(listingContract._new({
          package: sales.recordShopPackageId,
          typeArguments: [listing.currencyType],
          arguments: [
            pressingParts.pressing,
            pressingParts.adminCap,
            listingPrice(tx, p, listing.price),
          ],
        }));
        if (listing.enabled === false) {
          tx.add(listingContract.setState({
            package: sales.recordShopPackageId,
            typeArguments: [listing.currencyType],
            arguments: [
              createdListing,
              pressingParts.adminCap,
              tx.add(listingContract.disabled({ package: sales.recordShopPackageId })),
            ],
          }));
        }
        tx.add(listingContract.share({
          package: sales.recordShopPackageId,
          typeArguments: [listing.currencyType],
          arguments: [createdListing],
        }));
      }
    }

    p.recordings.forEach((node, index) => publishRecording(
      tx,
      p,
      node,
      requiredAt(recordings, index, "recording"),
      node.parentCompositionIndex === undefined
        ? undefined
        : {
            node: requiredAt(p.compositions, node.parentCompositionIndex, "parent composition"),
            parts: requiredAt(compositions, node.parentCompositionIndex, "parent composition"),
          },
    ));
    p.compositions.forEach((node, index) => publishComposition(tx, p, node, requiredAt(compositions, index, "composition")));
    if (p.release && releaseObject && releaseAdminCap) {
      publishReleaseObject(tx, p, p.release, releaseObject, releaseAdminCap);
    }

    for (const node of p.parties) {
      if ("id" in node) continue;
      const parts = createdParties.get(node.ref)!;
      tx.add(party.share({
        package: p.deployment.partyos.partyos,
        arguments: [parts.party, parts.adminCap],
      }));
      disposeNewAdminCap(tx, parts.adminCap, custody(p, node.custody, partyCapType(p)));
    }

    if (p.pressing && pressingParts) {
      const sales = requireRecordSalesDeployment(p.deployment.recordSales);
      tx.add(pressingContract.share({
        package: sales.recordPackageId,
        arguments: [pressingParts.pressing],
      }));
      disposeNewAdminCap(tx, pressingParts.adminCap, custody(
        p, p.pressing.custody, pressingCapType(p),
      ));
    }
  };
}

export interface AtomicPublicationInspection {
  commands: number;
  inputs: number;
}

/** Assemble without RPC access so callers can fail before publishing share packages. */
export function inspectAtomicPublication(p: AtomicPublicationParams): AtomicPublicationInspection {
  const tx = new Transaction();
  publishAtomicCatalog(p)(tx);
  const data = tx.getData();
  return { commands: data.commands.length, inputs: data.inputs.length };
}

export function assertAtomicPublicationBounds(p: AtomicPublicationParams): AtomicPublicationInspection {
  const inspection = inspectAtomicPublication(p);
  if (inspection.commands > MAX_ATOMIC_PUBLICATION_COMMANDS) {
    throw new Error(
      `Atomic publication requires ${inspection.commands} commands; the SDK safety cap is ` +
      `${MAX_ATOMIC_PUBLICATION_COMMANDS} (Sui permits at most 1024).`,
    );
  }
  if (inspection.inputs > MAX_ATOMIC_PUBLICATION_INPUTS) {
    throw new Error(
      `Atomic publication requires ${inspection.inputs} inputs; Sui permits at most ` +
      `${MAX_ATOMIC_PUBLICATION_INPUTS}.`,
    );
  }
  return inspection;
}

export type PublicationAuthorityOut =
  | { kind: "direct"; adminCapId: string }
  | { kind: "vault"; vaultId: string; vaultAdminCapId: string; capType: string; vaultPackageId: string };

export interface AtomicPublicationResult {
  digest: string;
  gasUsed: number;
  parties: Record<string, { id: string; adminCapId: string; created: boolean; authority?: PublicationAuthorityOut }>;
  compositions: Record<string, { id: string; adminCapId: string; shareType: string; authority: PublicationAuthorityOut; royaltyPoolId?: string }>;
  recordings: Record<string, { id: string; adminCapId: string; shareType: string; compositionShareType: string; authority: PublicationAuthorityOut; royaltyPoolId?: string; routedStakeId?: string }>;
  release?: { id: string; adminCapId: string; authority: PublicationAuthorityOut };
  pressing?: { id: string; adminCapId: string; authority: PublicationAuthorityOut };
}

function compactType(type: string): string {
  return type.replace(/\s+/g, "");
}

function findByShareType(
  created: { objectId: string; objectType: string }[],
  shareType: string,
  description: string,
): string {
  const wanted = compactType(shareType);
  const matches = created.filter((item) => compactType(item.objectType).includes(wanted));
  if (matches.length !== 1) throw new Error(`Expected one ${description} for ${shareType}; found ${matches.length}`);
  return matches[0]!.objectId;
}

function vaultsByCap(result: PlatformExecResult, vaultPackageId: string) {
  const out = new Map<string, { vaultId: string; vaultAdminCapId: string }>();
  for (const event of result.events) {
    if (!event.eventType.includes("::vault::VaultCreatedEvent<")) continue;
    const parsed = parseVaultCreatedEvent(event.bcs);
    out.set(parsed.cap_id, {
      vaultId: parsed.vault_id,
      vaultAdminCapId: deriveVaultAdminCapId(parsed.vault_id, vaultPackageId),
    });
  }
  return out;
}

function authorityOut(
  result: PlatformExecResult,
  vaults: ReturnType<typeof vaultsByCap>,
  selected: PublicationCustody,
  adminCapId: string,
  capType: string,
  vaultPackageId: string,
): PublicationAuthorityOut {
  if (selected.kind === "direct") return { kind: "direct", adminCapId };
  const found = vaults.get(adminCapId);
  if (!found) throw new Error(`No VaultCreatedEvent for admin cap ${adminCapId} in ${result.digest}`);
  return { kind: "vault", ...found, capType, vaultPackageId };
}

/** Parse one atomic publication using type identity plus lifecycle event payloads. */
export function parseAtomicPublicationResult(
  p: AtomicPublicationParams,
  result: PlatformExecResult,
): AtomicPublicationResult {
  const available = publicationUsesVault(p) ? operations(p) : undefined;
  const vaultPackageId = available?.vault.packageId ?? "";
  const vaults = available
    ? vaultsByCap(result, vaultPackageId)
    : new Map<string, { vaultId: string; vaultAdminCapId: string }>();
  const createdCompositions = allCreatedByType(result, "::composition::Composition<");
  const createdRecordings = allCreatedByType(result, "::recording::Recording<");
  const createdPools = allCreatedByType(result, "::pool::RoyaltyPool<");

  const createdPartyNodes = p.parties.filter((node): node is Extract<PublicationParty, { create: string }> => "create" in node);
  const partyEvents = result.events.filter((event) => event.eventType.endsWith("::party::PartyCreatedEvent"));
  if (partyEvents.length !== createdPartyNodes.length) {
    throw new Error(`Expected ${createdPartyNodes.length} PartyCreatedEvent values; found ${partyEvents.length}`);
  }
  const parties: AtomicPublicationResult["parties"] = {};
  for (const node of p.parties) {
    if ("id" in node) {
      parties[node.ref] = {
        id: node.id,
        adminCapId: derivePartyAdminCapId(node.id, p.deployment.partyos.partyos),
        created: false,
      };
    }
  }
  createdPartyNodes.forEach((node, index) => {
    const event = partyEvents[index]!;
    const parsed = party.PartyCreatedEvent.parse(event.bcs);
    const adminCapId = derivePartyAdminCapId(parsed.party_id, p.deployment.partyos.partyos);
    parties[node.ref] = {
      id: parsed.party_id,
      adminCapId,
      created: true,
      authority: authorityOut(result, vaults, node.custody, adminCapId, partyCapType(p), vaultPackageId),
    };
  });

  const compositions: AtomicPublicationResult["compositions"] = {};
  p.compositions.forEach((node) => {
    const id = findByShareType(createdCompositions, node.shareType, "Composition");
    const adminCapId = deriveCompositionAdminCapId(id, p.deployment.protocol.musicos);
    compositions[node.ref] = {
      id,
      adminCapId,
      shareType: node.shareType,
      authority: authorityOut(result, vaults, node.custody, adminCapId, compositionCapType(p, node.shareType), vaultPackageId),
      royaltyPoolId: node.royaltyPool ? findByShareType(createdPools, node.shareType, "Composition RoyaltyPool") : undefined,
    };
  });

  const recordings: AtomicPublicationResult["recordings"] = {};
  p.recordings.forEach((node) => {
    const id = findByShareType(createdRecordings, node.shareType, "Recording");
    const adminCapId = deriveRecordingAdminCapId(id, p.deployment.protocol.musicos);
    recordings[node.ref] = {
      id,
      adminCapId,
      shareType: node.shareType,
      compositionShareType: node.compositionShareType,
      authority: authorityOut(result, vaults, node.custody, adminCapId, recordingCapType(p, node.shareType), vaultPackageId),
      royaltyPoolId: node.royaltyPool ? findByShareType(createdPools, node.shareType, "Recording RoyaltyPool") : undefined,
      routedStakeId: node.routedStake
        ? createdByExactType(
            result,
            `${p.deployment.packages.routedStake}::routed_stake::RoutedStake<${node.shareType},${node.compositionShareType}>`,
          )
        : undefined,
    };
  });

  let releaseOut: AtomicPublicationResult["release"];
  if (p.release) {
    const id = createdByExactType(result, `${p.deployment.protocol.musicos}::release::Release`);
    const adminCapId = deriveReleaseAdminCapId(id, p.deployment.protocol.musicos);
    releaseOut = {
      id,
      adminCapId,
      authority: authorityOut(result, vaults, p.release.custody, adminCapId, releaseCapType(p), vaultPackageId),
    };
  }

  let pressingOut: AtomicPublicationResult["pressing"];
  if (p.pressing && releaseOut) {
    const sales = requireRecordSalesDeployment(p.deployment.recordSales);
    const id = derivePressingId(releaseOut.id, p.pressing.edition, sales.recordPackageId);
    const adminCapId = derivePressingAdminCapId(id, sales.recordPackageId);
    pressingOut = {
      id,
      adminCapId,
      authority: authorityOut(result, vaults, p.pressing.custody, adminCapId, pressingCapType(p), vaultPackageId),
    };
  }

  return {
    digest: result.digest,
    gasUsed: result.gasUsed,
    parties,
    compositions,
    recordings,
    release: releaseOut,
    pressing: pressingOut,
  };
}
