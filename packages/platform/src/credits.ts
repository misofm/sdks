// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Contributor credits. A credit pairs a party with a display name and one or more
// domain-specific roles (`miso_credit::credit::Credit<Role>`), attached to a work
// via a dynamic field on the work's UID and gated by the work's admin cap. Three
// first-party extensions carry the domain role vocabularies:
//
//   - composition_credits — writing credits (Composer, Lyricist, …), no level.
//   - recording_credits    — production/performance credits (Producer, Vocalist,
//                            Instrumentalist, …), each with an optional seniority
//                            level; plus primary/featured artist designation.
//   - release_credits      — top-line billing, exactly one role (Primary|Featured).
//
// A credit is built in-PTB from raw role constructor move-calls (the role enums
// are closed — only the extension's `new_*_role` functions can mint them), wrapped
// in `credit::new(display_name, roles)`, then attached with the extension's
// `add_credit` (which borrows the work `&mut` via its cap-gated `uid_mut`).
//
// Writers mirror `cover.ts`: they return a `TxThunk` and take explicit on-chain
// package ids. Generic works (Composition, Recording) additionally require the
// share coin type argument(s) so the `&mut Work<Share>` / `&AdminCap<Share>` calls
// resolve.
//
// The role vocabularies below are the clearest case for why extensions ship from
// the platform package: which roles exist, what they are called, and how many a
// work may carry are editorial decisions Miso made. The protocol has no opinion
// about any of it — it only provides the cap-gated `uid_mut` hook these attach
// through.

import type { ClientWithCoreApi } from "@mysten/sui/client";
import { bcs } from "@mysten/sui/bcs";
import { deriveDynamicFieldID } from "@mysten/sui/utils";
import type {
  Transaction,
  TransactionArgument,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";
import type { TxThunk } from "./transactions.ts";
import { OPTION_NONE, OPTION_SOME } from "./internal.ts";
import * as compositionCredits from "./contracts/composition_credits/composition_credits.ts";
import * as compositionPartyRole from "./contracts/composition_credits/composition_party_role.ts";
import * as recordingCredits from "./contracts/recording_credits/recording_credits.ts";
import * as recordingPartyRole from "./contracts/recording_credits/recording_party_role.ts";
import * as releaseCredits from "./contracts/release_credits/release_credits.ts";
import * as releasePartyRole from "./contracts/release_credits/release_party_role.ts";
import { directAdminCap, invokeWithAdminCap, type AdminCapAuthority, type ObjectInput } from "./vault.ts";

function object(tx: Transaction, value: ObjectInput): TransactionObjectArgument {
  return typeof value === "string" ? tx.object(value) : value;
}

type CompositionAuthorityInput =
  | { readonly authority: AdminCapAuthority; readonly compositionAdminCapId?: never }
  | { readonly authority?: never; readonly compositionAdminCapId: string };
type RecordingAuthorityInput =
  | { readonly authority: AdminCapAuthority; readonly recordingAdminCapId?: never }
  | { readonly authority?: never; readonly recordingAdminCapId: string };
type ReleaseAuthorityInput =
  | { readonly authority: AdminCapAuthority; readonly releaseAdminCapId?: never }
  | { readonly authority?: never; readonly releaseAdminCapId: string };

function compositionAuthorityOf(input: CompositionAuthorityInput): AdminCapAuthority {
  if (input.authority !== undefined) return input.authority;
  return directAdminCap(input.compositionAdminCapId);
}
function recordingAuthorityOf(input: RecordingAuthorityInput): AdminCapAuthority {
  if (input.authority !== undefined) return input.authority;
  return directAdminCap(input.recordingAdminCapId);
}
function releaseAuthorityOf(input: ReleaseAuthorityInput): AdminCapAuthority {
  if (input.authority !== undefined) return input.authority;
  return directAdminCap(input.releaseAdminCapId);
}

// ── Role model ────────────────────────────────────────────────────────────────

/** A composition writing role. `Custom` carries a free-form (validated) name. */
export type CompositionRole =
  | {
      type:
        | "Adapter"
        | "Arranger"
        | "Composer"
        | "Lyricist"
        | "Songwriter"
        | "Translator";
    }
  | { type: "Custom"; name: string };

/** Seniority/prominence level for a recording role. */
export type RecordingRoleLevel =
  | "Additional"
  | "Assistant"
  | "Associate"
  | "Backing"
  | "Executive"
  | "Featured"
  | "Lead"
  | "Primary"
  | "Principal";

/** Recording role base names that carry an optional level. */
export type RecordingLeveledRoleType =
  | "Actor"
  | "Arranger"
  | "BandLeader"
  | "Choir"
  | "ChoirMaster"
  | "ConcertMaster"
  | "Conductor"
  | "Contractor"
  | "DJ"
  | "Editor"
  | "Engineer"
  | "Ensemble"
  | "MasteringEngineer"
  | "MixingEngineer"
  | "MusicDirector"
  | "MusicSupervisor"
  | "Narrator"
  | "Orchestra"
  | "Orchestrator"
  | "Performer"
  | "Producer"
  | "Programmer"
  | "RecordingEngineer"
  | "RemixingEngineer"
  | "Soloist"
  | "SoundDesigner"
  | "Speaker"
  | "Vocalist";

/**
 * A recording production/performance role. Most roles take an optional `level`;
 * `Instrumentalist` also carries the instrument name; `Custom` carries a free-form
 * (validated) name; `ArtistsAndRepertoire` and `Copyist` are clerical and take no
 * level.
 */
export type RecordingRole =
  | { type: RecordingLeveledRoleType; level?: RecordingRoleLevel }
  | { type: "Instrumentalist"; instrument: string; level?: RecordingRoleLevel }
  | { type: "Custom"; name: string; level?: RecordingRoleLevel }
  | { type: "ArtistsAndRepertoire" }
  | { type: "Copyist" };

/** A release billing role — a release credit carries exactly one of these. */
export type ReleaseRole = "Primary" | "Featured";

// Role constructor lookups. Each generated `new_*_role` returns a thunk that adds
// the constructor move-call; `tx.add` runs it and yields the role value.
type RoleThunk = (tx: Transaction) => TransactionObjectArgument;
type LevelCtor = (options: { package?: string }) => RoleThunk;
type LeveledRoleCtor = (options: {
  package?: string;
  arguments: [TransactionArgument];
}) => RoleThunk;

const COMPOSITION_ROLE_CTOR: Record<
  Exclude<CompositionRole["type"], "Custom">,
  LevelCtor
> = {
  Adapter: compositionPartyRole.newAdapterRole,
  Arranger: compositionPartyRole.newArrangerRole,
  Composer: compositionPartyRole.newComposerRole,
  Lyricist: compositionPartyRole.newLyricistRole,
  Songwriter: compositionPartyRole.newSongwriterRole,
  Translator: compositionPartyRole.newTranslatorRole,
};

const RECORDING_LEVEL_CTOR: Record<RecordingRoleLevel, LevelCtor> = {
  Additional: recordingPartyRole.newAdditionalRoleLevel,
  Assistant: recordingPartyRole.newAssistantRoleLevel,
  Associate: recordingPartyRole.newAssociateRoleLevel,
  Backing: recordingPartyRole.newBackingRoleLevel,
  Executive: recordingPartyRole.newExecutiveRoleLevel,
  Featured: recordingPartyRole.newFeaturedRoleLevel,
  Lead: recordingPartyRole.newLeadRoleLevel,
  Primary: recordingPartyRole.newPrimaryRoleLevel,
  Principal: recordingPartyRole.newPrincipalRoleLevel,
};

const RECORDING_LEVELED_ROLE_CTOR: Record<
  RecordingLeveledRoleType,
  LeveledRoleCtor
> = {
  Actor: recordingPartyRole.newActorRole,
  Arranger: recordingPartyRole.newArrangerRole,
  BandLeader: recordingPartyRole.newBandLeaderRole,
  Choir: recordingPartyRole.newChoirRole,
  ChoirMaster: recordingPartyRole.newChoirMasterRole,
  ConcertMaster: recordingPartyRole.newConcertMasterRole,
  Conductor: recordingPartyRole.newConductorRole,
  Contractor: recordingPartyRole.newContractorRole,
  DJ: recordingPartyRole.newDjRole,
  Editor: recordingPartyRole.newEditorRole,
  Engineer: recordingPartyRole.newEngineerRole,
  Ensemble: recordingPartyRole.newEnsembleRole,
  MasteringEngineer: recordingPartyRole.newMasteringEngineerRole,
  MixingEngineer: recordingPartyRole.newMixingEngineerRole,
  MusicDirector: recordingPartyRole.newMusicDirectorRole,
  MusicSupervisor: recordingPartyRole.newMusicSupervisorRole,
  Narrator: recordingPartyRole.newNarratorRole,
  Orchestra: recordingPartyRole.newOrchestraRole,
  Orchestrator: recordingPartyRole.newOrchestratorRole,
  Performer: recordingPartyRole.newPerformerRole,
  Producer: recordingPartyRole.newProducerRole,
  Programmer: recordingPartyRole.newProgrammerRole,
  RecordingEngineer: recordingPartyRole.newRecordingEngineerRole,
  RemixingEngineer: recordingPartyRole.newRemixingEngineerRole,
  Soloist: recordingPartyRole.newSoloistRole,
  SoundDesigner: recordingPartyRole.newSoundDesignerRole,
  Speaker: recordingPartyRole.newSpeakerRole,
  Vocalist: recordingPartyRole.newVocalistRole,
};

/** Builds an `Option<RecordingPartyRoleLevel>` argument for a role constructor. */
function levelOption(
  tx: Transaction,
  pkg: string,
  level: RecordingRoleLevel | undefined,
): TransactionArgument {
  const levelType = `${pkg}::recording_party_role::RecordingPartyRoleLevel`;
  if (!level)
    return tx.moveCall({ target: OPTION_NONE, typeArguments: [levelType] });
  const lvl = tx.add(RECORDING_LEVEL_CTOR[level]({ package: pkg }));
  return tx.moveCall({
    target: OPTION_SOME,
    typeArguments: [levelType],
    arguments: [lvl],
  });
}

/** Builds one `CompositionPartyRole` value in the PTB. */
function buildCompositionRole(
  tx: Transaction,
  pkg: string,
  role: CompositionRole,
): TransactionObjectArgument {
  if (role.type === "Custom") {
    return tx.add(
      compositionPartyRole.newCustomRole({
        package: pkg,
        arguments: [role.name],
      }),
    );
  }
  return tx.add(COMPOSITION_ROLE_CTOR[role.type]({ package: pkg }));
}

/** Builds one `RecordingPartyRole` value in the PTB. */
function buildRecordingRole(
  tx: Transaction,
  pkg: string,
  role: RecordingRole,
): TransactionObjectArgument {
  switch (role.type) {
    case "ArtistsAndRepertoire":
      return tx.add(
        recordingPartyRole.newArtistsAndRepertoireRole({ package: pkg }),
      );
    case "Copyist":
      return tx.add(recordingPartyRole.newCopyistRole({ package: pkg }));
    case "Instrumentalist":
      return tx.add(
        recordingPartyRole.newInstrumentalistRole({
          package: pkg,
          arguments: [role.instrument, levelOption(tx, pkg, role.level)],
        }),
      );
    case "Custom":
      return tx.add(
        recordingPartyRole.newCustomRole({
          package: pkg,
          arguments: [role.name, levelOption(tx, pkg, role.level)],
        }),
      );
    default:
      return tx.add(
        RECORDING_LEVELED_ROLE_CTOR[role.type]({
          package: pkg,
          arguments: [levelOption(tx, pkg, role.level)],
        }),
      );
  }
}

/** Builds one `ReleasePartyRole` value in the PTB. */
function buildReleaseRole(
  tx: Transaction,
  pkg: string,
  role: ReleaseRole,
): TransactionObjectArgument {
  const ctor =
    role === "Primary"
      ? releasePartyRole.newPrimaryRole
      : releasePartyRole.newFeaturedRole;
  return tx.add(ctor({ package: pkg }));
}

// ── Client-side validation ────────────────────────────────────────────────────
//
// Mirrors the Move aborts so bad params fail fast (and readably) at the writer
// call site instead of as an on-chain abort code:
//   - miso_credit::credit::new — EEmptyString / EMaxDisplayNameLengthExceeded
//     (display name non-empty, ≤200 BYTES of UTF-8) and ENoRoles / EDuplicateRoles.
//   - composition_credits::add_credit — EMinRolesNotMet / EExceedsMaxRoles (1–5).
//   - recording_credits::add_credit — EMinRolesNotMet / EExceedsMaxRoles (1–10).

const MAX_DISPLAY_NAME_BYTES = 200;
const MAX_COMPOSITION_ROLES = 5;
const MAX_RECORDING_ROLES = 10;

function assertDisplayName(fn: string, displayName: string): void {
  if (displayName.length === 0)
    throw new Error(`${fn}: displayName must not be empty`);
  const byteLength = new TextEncoder().encode(displayName).length;
  if (byteLength > MAX_DISPLAY_NAME_BYTES) {
    throw new Error(
      `${fn}: displayName must be at most ${MAX_DISPLAY_NAME_BYTES} bytes of UTF-8 (got ${byteLength})`,
    );
  }
}

// Move rejects duplicates by full struct equality, so the duplicate key is the
// role's complete identity: type + instrument + custom name + level.
function roleKey(role: CompositionRole | RecordingRole): string {
  return JSON.stringify([
    role.type,
    "instrument" in role ? role.instrument : null,
    "name" in role ? role.name : null,
    "level" in role && role.level !== undefined ? role.level : null,
  ]);
}

function assertRoles(
  fn: string,
  roles: (CompositionRole | RecordingRole)[],
  max: number,
): void {
  if (roles.length < 1) throw new Error(`${fn}: at least one role is required`);
  if (roles.length > max)
    throw new Error(
      `${fn}: at most ${max} roles are allowed (got ${roles.length})`,
    );
  const seen = new Set<string>();
  for (const role of roles) {
    const key = roleKey(role);
    if (seen.has(key)) throw new Error(`${fn}: duplicate role ${key}`);
    seen.add(key);
  }
}

/** Wraps built role values in a `miso_credit::credit::Credit<Role>`. */
function buildCredit(
  tx: Transaction,
  misoCreditPackageId: string,
  roleType: string,
  displayName: string,
  roleArgs: TransactionObjectArgument[],
): TransactionObjectArgument {
  const roles = tx.makeMoveVec({ type: roleType, elements: roleArgs });
  return tx.moveCall({
    target: `${misoCreditPackageId}::credit::new`,
    typeArguments: [roleType],
    arguments: [tx.pure.string(displayName), roles],
  });
}

// ── Writers ───────────────────────────────────────────────────────────────────

interface AttachCompositionCreditParamsBase {
  /** The `Composition` object to credit on. */
  compositionId: ObjectInput;
  /** The `Party` being credited. */
  partyId: ObjectInput;
  /** Human-readable name for the credit (≤200 bytes, non-empty). */
  displayName: string;
  /** 1–5 writing roles; duplicates are rejected on-chain. */
  roles: CompositionRole[];
  /** The composition's share coin type (the `CompositionShare` phantom). */
  compositionShareType: string;
  /** `composition_credits` package id (roles + `add_credit`). */
  compositionCreditsPackageId: string;
  /** `miso_credit` package id (home of `credit::new`). */
  misoCreditPackageId: string;
}
export type AttachCompositionCreditParams =
  AttachCompositionCreditParamsBase & CompositionAuthorityInput;

/**
 * Adds a writing credit for a party on a composition. Throws (client-side,
 * mirroring the Move aborts) when `displayName` is empty or over 200 UTF-8
 * bytes, or `roles` is empty, has more than 5 entries, or contains duplicates.
 */
export function attachCompositionCredit(
  p: AttachCompositionCreditParams,
): TxThunk {
  assertDisplayName("attachCompositionCredit", p.displayName);
  assertRoles("attachCompositionCredit", p.roles, MAX_COMPOSITION_ROLES);
  return (tx) => {
    const roleType = `${p.compositionCreditsPackageId}::composition_party_role::CompositionPartyRole`;
    const roleArgs = p.roles.map((r) =>
      buildCompositionRole(tx, p.compositionCreditsPackageId, r),
    );
    const credit = buildCredit(
      tx,
      p.misoCreditPackageId,
      roleType,
      p.displayName,
      roleArgs,
    );
    invokeWithAdminCap(tx, compositionAuthorityOf(p), {
      target: `${p.compositionCreditsPackageId}::composition_credits::add_credit`,
      typeArguments: [p.compositionShareType],
      arguments: [object(tx, p.compositionId), object(tx, p.partyId), credit],
      adminCapIndex: 1,
    });
  };
}

interface AttachRecordingCreditParamsBase {
  /** The `Recording` object to credit on. */
  recordingId: ObjectInput;
  /** The `Party` being credited. */
  partyId: ObjectInput;
  /** Human-readable name for the credit (≤200 bytes, non-empty). */
  displayName: string;
  /** 1–10 production/performance roles; duplicates are rejected on-chain. */
  roles: RecordingRole[];
  /** The recording's own share coin type (the `RecordingShare` phantom). */
  recordingShareType: string;
  /** The parent composition's share coin type (the `CompositionShare` phantom). */
  compositionShareType: string;
  /** `recording_credits` package id (roles + `add_credit`). */
  recordingCreditsPackageId: string;
  /** `miso_credit` package id (home of `credit::new`). */
  misoCreditPackageId: string;
}
export type AttachRecordingCreditParams =
  AttachRecordingCreditParamsBase & RecordingAuthorityInput;

/**
 * Adds a production/performance credit for a party on a recording. Throws
 * (client-side, mirroring the Move aborts) when `displayName` is empty or over
 * 200 UTF-8 bytes, or `roles` is empty, has more than 10 entries, or contains
 * duplicates (same type + instrument + custom name + level).
 */
export function attachRecordingCredit(p: AttachRecordingCreditParams): TxThunk {
  assertDisplayName("attachRecordingCredit", p.displayName);
  assertRoles("attachRecordingCredit", p.roles, MAX_RECORDING_ROLES);
  return (tx) => {
    const roleType = `${p.recordingCreditsPackageId}::recording_party_role::RecordingPartyRole`;
    const roleArgs = p.roles.map((r) =>
      buildRecordingRole(tx, p.recordingCreditsPackageId, r),
    );
    const credit = buildCredit(
      tx,
      p.misoCreditPackageId,
      roleType,
      p.displayName,
      roleArgs,
    );
    invokeWithAdminCap(tx, recordingAuthorityOf(p), {
      target: `${p.recordingCreditsPackageId}::recording_credits::add_credit`,
      typeArguments: [p.recordingShareType, p.compositionShareType],
      arguments: [object(tx, p.recordingId), object(tx, p.partyId), credit],
      adminCapIndex: 1,
    });
  };
}

interface AddRecordingArtistParamsBase {
  /** The `Recording` object. */
  recordingId: ObjectInput;
  /** The `Party` to designate. Must already be credited on the recording. */
  partyId: ObjectInput;
  /** The recording's own share coin type (the `RecordingShare` phantom). */
  recordingShareType: string;
  /** The parent composition's share coin type (the `CompositionShare` phantom). */
  compositionShareType: string;
  /** `recording_credits` package id. */
  recordingCreditsPackageId: string;
}
export type AddRecordingArtistParams =
  AddRecordingArtistParamsBase & RecordingAuthorityInput;

/**
 * Designates an already-credited party as a primary artist on a recording. The
 * party must be credited first (via `attachRecordingCredit`) and not already a
 * primary or featured artist.
 */
export function addRecordingPrimaryArtist(
  p: AddRecordingArtistParams,
): TxThunk {
  return (tx) => {
    invokeWithAdminCap(tx, recordingAuthorityOf(p), {
      target: `${p.recordingCreditsPackageId}::recording_credits::add_primary_artist`,
      typeArguments: [p.recordingShareType, p.compositionShareType],
      arguments: [object(tx, p.recordingId), object(tx, p.partyId)],
      adminCapIndex: 1,
    });
  };
}

/**
 * Designates an already-credited party as a featured artist on a recording. The
 * party must be credited first (via `attachRecordingCredit`) and not already a
 * primary or featured artist.
 */
export function addRecordingFeaturedArtist(
  p: AddRecordingArtistParams,
): TxThunk {
  return (tx) => {
    invokeWithAdminCap(tx, recordingAuthorityOf(p), {
      target: `${p.recordingCreditsPackageId}::recording_credits::add_featured_artist`,
      typeArguments: [p.recordingShareType, p.compositionShareType],
      arguments: [object(tx, p.recordingId), object(tx, p.partyId)],
      adminCapIndex: 1,
    });
  };
}

interface AddReleaseCreditParamsBase {
  /** The `Release` object to credit on. */
  releaseId: ObjectInput;
  /** The `Party` being credited. */
  partyId: ObjectInput;
  /** Human-readable name for the credit (≤200 bytes, non-empty). */
  displayName: string;
  /** The single billing role: `"Primary"` or `"Featured"`. */
  role: ReleaseRole;
  /** `release_credits` package id (roles + `add_credit`). */
  releaseCreditsPackageId: string;
  /** `miso_credit` package id (home of `credit::new`). */
  misoCreditPackageId: string;
}
export type AddReleaseCreditParams = AddReleaseCreditParamsBase & ReleaseAuthorityInput;

/**
 * Adds a top-line billing credit (a single role) for a party on a release.
 * Throws (client-side, mirroring the Move aborts) when `displayName` is empty
 * or over 200 UTF-8 bytes. The single role is structural, so no role checks.
 */
export function addReleaseCredit(p: AddReleaseCreditParams): TxThunk {
  assertDisplayName("addReleaseCredit", p.displayName);
  return (tx) => {
    const roleType = `${p.releaseCreditsPackageId}::release_party_role::ReleasePartyRole`;
    const roleArg = buildReleaseRole(tx, p.releaseCreditsPackageId, p.role);
    const credit = buildCredit(
      tx,
      p.misoCreditPackageId,
      roleType,
      p.displayName,
      [roleArg],
    );
    invokeWithAdminCap(tx, releaseAuthorityOf(p), {
      target: `${p.releaseCreditsPackageId}::release_credits::add_credit`,
      arguments: [object(tx, p.releaseId), object(tx, p.partyId), credit],
      adminCapIndex: 1,
    });
  };
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** A normalized credit: the party, its display name, and its role labels. */
export interface CreditView {
  /** Object id of the credited `Party`. */
  partyId: string;
  /** Human-readable name for the credit. */
  displayName: string;
  /**
   * Role labels (the `name()` semantics). For a recording `Instrumentalist` the
   * instrument is included (`"Instrumentalist: Guitar"`); a recording role's level
   * is appended in parentheses (`"Producer (Lead)"`).
   */
  roles: string[];
}

/** A recording's credits, plus its primary/featured artist party ids. */
export interface RecordingCreditsView {
  credits: CreditView[];
  primaryArtistIds: string[];
  featuredArtistIds: string[];
}

// A parsed closed-enum value: `{ $kind, [variant]: payload }`. Unit variants carry
// `true`; data variants carry their parsed payload.
type ParsedEnum = { $kind: string } & Record<string, unknown>;
type ParsedLevel = ParsedEnum | null;

// Credits are stored as a dynamic field on the work's UID under the extension's
// `ExtensionKey()` — a positional struct with no fields, so Move's implicit
// `dummy_field: bool` serializes to a single `false` byte. The stored object is a
// `Field { id, name: <Key>, value: <Credits> }`.
const CompositionCreditsField = bcs.struct("Field", {
  id: bcs.Address,
  name: compositionCredits.ExtensionKey,
  value: compositionCredits.CompositionCredits,
});
const RecordingCreditsField = bcs.struct("Field", {
  id: bcs.Address,
  name: recordingCredits.ExtensionKey,
  value: recordingCredits.RecordingCredits,
});
const ReleaseCreditsField = bcs.struct("Field", {
  id: bcs.Address,
  name: releaseCredits.ExtensionKey,
  value: releaseCredits.ReleaseCredits,
});

const COMPOSITION_CREDITS_KEY_BYTES = compositionCredits.ExtensionKey.serialize(
  [false],
).toBytes();
const RECORDING_CREDITS_KEY_BYTES = recordingCredits.ExtensionKey.serialize([
  false,
]).toBytes();
const RELEASE_CREDITS_KEY_BYTES = releaseCredits.ExtensionKey.serialize([
  false,
]).toBytes();

type CreditFieldKind =
  | "composition"
  | "recording"
  | "release";

interface CreditFieldTarget {
  workId: string;
  kind: CreditFieldKind;
  fieldId: string;
}

/** Fetch many derived credit fields through one Core bulk request. */
async function fetchCreditFields(
  client: ClientWithCoreApi,
  targets: readonly CreditFieldTarget[],
): Promise<Map<string, Uint8Array>> {
  if (targets.length === 0) return new Map();
  const { objects } = await client.core.getObjects({
    objectIds: targets.map((target) => target.fieldId),
    include: { content: true },
  });
  const contents = new Map<string, Uint8Array>();
  objects.forEach((object, index) => {
    if (object instanceof Error || !object.content) return;
    const target = targets[index];
    if (target) contents.set(target.fieldId, object.content);
  });
  return contents;
}

function compositionCreditTargets(
  compositionIds: readonly string[],
  packageId: string,
): CreditFieldTarget[] {
  return compositionIds.map((workId) => ({
    workId,
    kind: "composition" as const,
    fieldId: deriveDynamicFieldID(
      workId,
      `${packageId}::composition_credits::ExtensionKey`,
      COMPOSITION_CREDITS_KEY_BYTES,
    ),
  }));
}

function recordingCreditTargets(
  recordingIds: readonly string[],
  packageId: string,
): CreditFieldTarget[] {
  return recordingIds.map((workId) => ({
    workId,
    kind: "recording" as const,
    fieldId: deriveDynamicFieldID(
      workId,
      `${packageId}::recording_credits::ExtensionKey`,
      RECORDING_CREDITS_KEY_BYTES,
    ),
  }));
}

function releaseCreditTargets(
  releaseIds: readonly string[],
  packageId: string,
): CreditFieldTarget[] {
  return releaseIds.map((workId) => ({
    workId,
    kind: "release",
    fieldId: releaseCreditsFieldId(workId, packageId),
  }));
}

/** Deterministic dynamic-field id for a release's billing credits. */
export function releaseCreditsFieldId(
  releaseId: string,
  releaseCreditsPackageId: string,
): string {
  return deriveDynamicFieldID(
    releaseId,
    `${releaseCreditsPackageId}::release_credits::ExtensionKey`,
    RELEASE_CREDITS_KEY_BYTES,
  );
}

// The credits container shape, checked structurally against the parse output of
// the generated bindings (their `$inferType`): the readers below pass
// `<X>CreditsField.parse(...).value.credits` in WITHOUT casting, so a codegen
// field rename (`contents`/`key`/`value`/`display_name`/`roles`, or the
// `credits`/`primary_artist_ids`/`featured_artist_ids` fields at the call
// sites) fails typecheck here instead of silently misparsing.
type ParsedCreditsMap<Role> = {
  contents: { key: string; value: { display_name: string; roles: Role[] } }[];
};

function creditViews<Role extends ParsedEnum>(
  credits: ParsedCreditsMap<Role>,
  roleLabel: (role: Role) => string,
): CreditView[] {
  return credits.contents.map((entry) => ({
    partyId: entry.key,
    displayName: entry.value.display_name,
    roles: entry.value.roles.map(roleLabel),
  }));
}

// `name()` semantics: the `$kind` is the canonical PascalCase token; `Custom`
// carries the user-supplied name in its payload.
function compositionRoleLabel(role: ParsedEnum): string {
  return role.$kind === "Custom" ? (role.Custom as string) : role.$kind;
}

function releaseRoleLabel(role: ParsedEnum): string {
  return role.$kind;
}

/** Parse a fetched release-credit dynamic field. */
export function parseReleaseCreditsContent(content: Uint8Array): CreditView[] {
  return creditViews(
    ReleaseCreditsField.parse(content).value.credits,
    releaseRoleLabel,
  );
}

// `name()` semantics plus the recording extras: the instrument (for
// `Instrumentalist`) and the optional level, both surfaced into the label.
function recordingRoleLabel(role: ParsedEnum): string {
  let base: string;
  let level: ParsedLevel = null;
  switch (role.$kind) {
    case "Instrumentalist": {
      const [instrument, lvl] = role.Instrumentalist as [string, ParsedLevel];
      base = `Instrumentalist: ${instrument}`;
      level = lvl;
      break;
    }
    case "Custom": {
      const [name, lvl] = role.Custom as [string, ParsedLevel];
      base = name;
      level = lvl;
      break;
    }
    case "ArtistsAndRepertoire":
    case "Copyist":
      base = role.$kind;
      break;
    default: {
      // A leveled variant's payload is `Option<Level>`: `None` parses to `true`
      // (the unit-payload convention), `Some(level)` to the level enum object.
      base = role.$kind;
      const payload = role[role.$kind];
      level =
        payload && typeof payload === "object" && "$kind" in payload
          ? (payload as ParsedEnum)
          : null;
      break;
    }
  }
  return level ? `${base} (${level.$kind})` : base;
}

/**
 * Reads a composition's writing credits (the `composition_credits` extension), or
 * `null` if no credits field is attached.
 */
export async function getCompositionCredits(
  client: ClientWithCoreApi,
  compositionId: string,
  compositionCreditsPackageId: string,
): Promise<CreditView[] | null> {
  return (
    (
      await getCompositionCreditsByIds(
        client,
        [compositionId],
        compositionCreditsPackageId,
      )
    )[compositionId] ?? null
  );
}

/** Composition credits for many works in one Core bulk request. */
export async function getCompositionCreditsByIds(
  client: ClientWithCoreApi,
  compositionIdsInput: readonly string[],
  compositionCreditsPackageId: string,
): Promise<Partial<Record<string, CreditView[]>>> {
  const compositionIds = [...new Set(compositionIdsInput)];
  const targets = compositionCreditTargets(
    compositionIds,
    compositionCreditsPackageId,
  );
  const contents = await fetchCreditFields(client, targets);
  const out: Partial<Record<string, CreditView[]>> = {};
  for (const target of targets) {
    const content = contents.get(target.fieldId);
    if (content) {
      out[target.workId] = creditViews(
        CompositionCreditsField.parse(content).value.credits,
        compositionRoleLabel,
      );
    }
  }
  return out;
}

/**
 * Reads a recording's credits plus its primary/featured artist party ids (the
 * `recording_credits` extension), or `null` if no credits field is attached.
 */
export async function getRecordingCredits(
  client: ClientWithCoreApi,
  recordingId: string,
  recordingCreditsPackageId: string,
): Promise<RecordingCreditsView | null> {
  return (
    (
      await getRecordingCreditsByIds(
        client,
        [recordingId],
        recordingCreditsPackageId,
      )
    )[recordingId] ?? null
  );
}

/** Recording credits for many works in one Core bulk request. */
export async function getRecordingCreditsByIds(
  client: ClientWithCoreApi,
  recordingIdsInput: readonly string[],
  recordingCreditsPackageId: string,
): Promise<Partial<Record<string, RecordingCreditsView>>> {
  const recordingIds = [...new Set(recordingIdsInput)];
  const targets = recordingCreditTargets(
    recordingIds,
    recordingCreditsPackageId,
  );
  const contents = await fetchCreditFields(client, targets);
  const out: Partial<Record<string, RecordingCreditsView>> = {};
  for (const target of targets) {
    const content = contents.get(target.fieldId);
    if (!content) continue;
    const value = RecordingCreditsField.parse(content).value;
    out[target.workId] = {
      credits: creditViews(value.credits, recordingRoleLabel),
      primaryArtistIds: value.primary_artist_ids.contents,
      featuredArtistIds: value.featured_artist_ids.contents,
    };
  }
  return out;
}

/**
 * Reads a release's top-line billing credits (the `release_credits` extension), or
 * `null` if no credits field is attached. Each credit has exactly one role.
 */
export async function getReleaseCredits(
  client: ClientWithCoreApi,
  releaseId: string,
  releaseCreditsPackageId: string,
): Promise<CreditView[] | null> {
  return (
    (
      await getReleaseCreditsByIds(client, [releaseId], releaseCreditsPackageId)
    )[releaseId] ?? null
  );
}

/** Release billing credits for many releases in one Core bulk request. */
export async function getReleaseCreditsByIds(
  client: ClientWithCoreApi,
  releaseIdsInput: readonly string[],
  releaseCreditsPackageId: string,
): Promise<Partial<Record<string, CreditView[]>>> {
  const releaseIds = [...new Set(releaseIdsInput)];
  const targets = releaseCreditTargets(releaseIds, releaseCreditsPackageId);
  const contents = await fetchCreditFields(client, targets);
  const out: Partial<Record<string, CreditView[]>> = {};
  for (const target of targets) {
    const content = contents.get(target.fieldId);
    if (content) {
      out[target.workId] = parseReleaseCreditsContent(content);
    }
  }
  return out;
}
