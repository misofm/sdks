// Proves the published `.d.ts` for @misofm/music,
// @misofm/party, @misofm/platform, @misofm/streaming, and
// @misofm/transcoding are self-contained when installed as real tarballs (see
// ../../../../scripts/check-consumer.ts, or `bun run test:consumer` at the
// repo root, driving this fixture). Every subpath below is used for both a
// value and a type so tsc cannot elide the import — if any packaged
// declaration file is missing, malformed, or has a broken relative path, this
// file fails to typecheck with `skipLibCheck: false`.

// @misofm/music is a sui-effect extension (misofm/sdks#34): the `MusicProtocol` service,
// the derived `musicProtocol()` Promise registration, and every curated subpath
// the Definition of Done names (`.`, `/errors`, `/transactions`,
// `/deployments`, `/types`, `/parsers`, `/events`, `/packages`, `/contracts`).
import { MusicProtocol, musicProtocol, type MusicProtocolOptions, type MusicProtocolService } from "@misofm/music";
import { MusicProtocolDeploymentInvalid, DecodeError as MusicProtocolDecodeError } from "@misofm/music/errors";
import { createComposition, type CreateCompositionParams } from "@misofm/music/transactions";
import { MISO_DEPLOYMENTS, type MisoDeployment } from "@misofm/music/deployments";
import type { Composition as MusicProtocolCompositionType } from "@misofm/music/types";
import { parseCompositionPublishedEvent } from "@misofm/music/parsers";
import { eventParsers as musicProtocolEventParsers } from "@misofm/music/events";
import { bindModulePackage } from "@misofm/music/packages";
import { composition as musicProtocolComposition } from "@misofm/music/contracts";

// The raw wildcard subpath (`./contracts/*`): a deep module not exposed
// through the curated barrel.
import { Composition as CompositionStruct } from "@misofm/music/contracts/musicos/composition";

// @misofm/party is also a sui-effect extension (misofm/sdks#34): the `PartyProtocol`
// service and the derived `partyProtocol()` Promise registration replace the
// predecessor `PartyosClient` class.
import { PartyProtocol, partyProtocol, type Party as PartyProtocolParty } from "@misofm/party";
import { getPartyDeployment, type PartyDeployment } from "@misofm/party/deployments";
import { Party as PartyStruct } from "@misofm/party/contracts/partyos/party";
import { PartyNotFoundError } from "@misofm/party/errors";

// platform is a sui-effect extension too (misofm/sdks#35): the `Miso`
// service and the derived `miso()` Promise registration (`./client`)
// replace the predecessor `MisoPlatformClient` class; `MisoClient` is now
// the type alias for `client.miso` (`PromiseFace<MisoService> & ExtensionFace`),
// not a runtime class.
import {
  Miso as PlatformRootService,
  platformEventParsers as rootPlatformEventParsers,
  parseReleaseRevenueDistributedEvent,
  parseReleaseTrackRevenueDistributedEvent,
  type MisoOptions as PlatformRootOptions,
} from "@misofm/platform";
import { platformEventParsers } from "@misofm/platform/events";
import { miso, type MisoClient, type MisoOptions as PlatformClientOptions } from "@misofm/platform/client";
import { derivePressingId, type OpenPressingParams } from "@misofm/platform/pressing";
import { directAdminCap, type AdminCapAuthority } from "@misofm/platform/vault";
import { misoConfig, type MisoConfig } from "@misofm/platform/read";
import { attachCompositionCredit, type CompositionRole } from "@misofm/platform/credits";
import { makeMisoParty, type MisoPartyService, type Profile } from "@misofm/platform/party";
import {
  record as platformRecord,
  listing as platformListing,
  share as platformShare,
  pay as platformPay,
  platformLink as platformLinkContract,
} from "@misofm/platform/contracts";
import { RecordSalesUnavailableError } from "@misofm/platform/errors";

// The raw wildcard subpath (`./contracts/*`): a deep module and a nested
// `deps/*` module, neither of which is exposed through the curated barrel.
import { Record as RecordStruct } from "@misofm/platform/contracts/record/record";
import { LanguageCode as LanguageCodeTuple } from "@misofm/platform/contracts/party_profile/deps/language_code/language_code";

import { HLS_CONTRACT, type Rendition } from "@misofm/streaming";
import { WarmError } from "@misofm/streaming/errors";
import { chooseSegmentTargetMs, type TranscodeRequest } from "@misofm/transcoding";
import { ProcessExitError } from "@misofm/transcoding/errors";

// Type-position uses of every imported type. Each is either a directly
// exported interface/type alias, or (for the curated `contracts` barrels and
// the raw BCS codecs, which expose no standalone type export) derived from
// the value itself so it still proves the underlying declaration resolves.
type _MusicProtocolOptions = MusicProtocolOptions;
type _MusicProtocolService = MusicProtocolService;
type _MusicProtocolDeploymentInvalid = MusicProtocolDeploymentInvalid;
type _MusicProtocolDecodeError = MusicProtocolDecodeError;
type _MusicProtocolCreateCompositionParams = CreateCompositionParams;
type _MusicProtocolDeployment = MisoDeployment;
type _MusicProtocolCompositionType = MusicProtocolCompositionType;
type _MusicProtocolContractsCompositionNewOptions = Parameters<typeof musicProtocolComposition._new>[0];
type _Composition = ReturnType<typeof CompositionStruct.parse>;
// The registration `musicProtocol()` returns, without ever calling `.register` —
// this fixture makes no network call — proving `client.$extend(musicProtocol())`
// typechecks the way the Definition of Done names it.
type _MusicProtocolExtensionRegistration = ReturnType<typeof musicProtocol>;

type _PartyProtocolParty = PartyProtocolParty;
type _PartyProtocolDeployment = PartyDeployment;
type _PartyStruct = ReturnType<typeof PartyStruct.parse>;
type _PartyNotFoundError = PartyNotFoundError;
// The registration `partyProtocol()` returns, without ever calling `.register` —
// proving `client.$extend(partyProtocol())` typechecks, the same probe `musicProtocol()`
// gets above.
type _PartyProtocolExtensionRegistration = ReturnType<typeof partyProtocol>;

type _PlatformRootService = typeof PlatformRootService;
type _PlatformRootOptions = PlatformRootOptions;
type _PlatformClientOptions = PlatformClientOptions;
type _PlatformClient = MisoClient;
type _PlatformPressingParams = OpenPressingParams;
type _PlatformVaultAuthority = AdminCapAuthority;
type _PlatformReadConfig = MisoConfig;
type _PlatformCreditRole = CompositionRole;
type _PlatformParty = Profile;
type _PlatformPartyService = MisoPartyService;
// The registration `miso()` returns (`@misofm/platform/client`), the same
// "typechecks without calling .register" probe as `musicProtocol()`/`partyProtocol()`.
type _MisoExtensionRegistration = ReturnType<typeof miso>;

// A namespace method reached THROUGH the derived Promise face, not just the
// bare `MisoClient` alias above — misofm/sdks#35 verification, A1: before the
// fix, `MisoClient["protocol"]`/`["party"]`/`["vault"]` stayed typed as their
// raw Effect-returning service shape (an `interface`, unmapped by
// `PromiseFace`) instead of recursing into Promise-returning methods, and a
// bare type-alias reference to `MisoClient` alone would never have caught
// that: only indexing into a nested member does. `ReturnsPromise`/`Assert`
// fail this file's typecheck if any of these three regress.
type ReturnsPromise<F> = F extends (...args: never[]) => Promise<unknown> ? true : false;
type Assert<T extends true> = T;
type _PlatformClientProtocolMemberIsPromise = Assert<ReturnsPromise<MisoClient["protocol"]["getReleaseById"]>>;
type _PlatformClientPartyMemberIsPromise = Assert<ReturnsPromise<MisoClient["party"]["getPartyById"]>>;
type _PlatformClientVaultMemberIsPromise = Assert<ReturnsPromise<MisoClient["vault"]["getVaultAdminCap"]>>;
type _PlatformContractsRecordReleaseIdOptions = Parameters<typeof platformRecord.releaseId>[0];
type _PlatformRecordSoldPurchasePrice = ReturnType<typeof platformListing.RecordSoldEvent.parse>["purchase_price"];
type _PlatformShareEvent = ReturnType<typeof platformShare.ShareInitializedEvent.parse>;
type _PlatformLinkEvent = ReturnType<typeof platformLinkContract.PlatformLinkSetEvent.parse>;
type _PlatformPaymentEventFactory = typeof platformPay.PaymentSentEvent;
type _PlatformTrackDistribution = ReturnType<typeof parseReleaseTrackRevenueDistributedEvent>;
type _PlatformRevenueDistribution = ReturnType<typeof parseReleaseRevenueDistributedEvent>;
type _PlatformWideReward = ReturnType<typeof platformEventParsers.primitives.royaltyPool.royaltyClaimed>["cumulative_reward_per_share_after"];
type _Record = ReturnType<typeof RecordStruct.parse>;
type _LanguageCode = ReturnType<typeof LanguageCodeTuple.parse>;
type _PlatformRecordSalesUnavailableError = RecordSalesUnavailableError;

type _StreamingRendition = Rendition;
type _StreamingWarmError = WarmError;
type _TranscodingRequest = TranscodeRequest;
type _TranscodingProcessExitError = ProcessExitError;

// Value-position uses of every imported value.
void ([
  MusicProtocol,
  musicProtocol,
  MusicProtocolDeploymentInvalid,
  MusicProtocolDecodeError,
  createComposition,
  MISO_DEPLOYMENTS,
  parseCompositionPublishedEvent,
  musicProtocolEventParsers,
  bindModulePackage,
  musicProtocolComposition,
  CompositionStruct,
  PartyProtocol,
  partyProtocol,
  getPartyDeployment,
  PartyStruct,
  PartyNotFoundError,
  PlatformRootService,
  miso,
  derivePressingId,
  directAdminCap,
  misoConfig,
  attachCompositionCredit,
  makeMisoParty,
  platformRecord,
  platformListing,
  platformShare,
  platformPay,
  platformLinkContract,
  rootPlatformEventParsers,
  platformEventParsers,
  parseReleaseRevenueDistributedEvent,
  parseReleaseTrackRevenueDistributedEvent,
  RecordStruct,
  LanguageCodeTuple,
  RecordSalesUnavailableError,
  HLS_CONTRACT,
  WarmError,
  chooseSegmentTargetMs,
  ProcessExitError,
] satisfies unknown[]);

// Referenced so the otherwise-unused type aliases above cannot be reported as
// dead code by a stricter consumer tsconfig than this fixture's own.
export type IsolatedConsumerTypeProbe = [
  _MusicProtocolOptions,
  _MusicProtocolService,
  _MusicProtocolDeploymentInvalid,
  _MusicProtocolDecodeError,
  _MusicProtocolCreateCompositionParams,
  _MusicProtocolDeployment,
  _MusicProtocolCompositionType,
  _MusicProtocolContractsCompositionNewOptions,
  _Composition,
  _MusicProtocolExtensionRegistration,
  _PartyProtocolParty,
  _PartyProtocolDeployment,
  _PartyStruct,
  _PartyNotFoundError,
  _PartyProtocolExtensionRegistration,
  _PlatformRootService,
  _PlatformRootOptions,
  _PlatformClientOptions,
  _PlatformClient,
  _PlatformPressingParams,
  _PlatformVaultAuthority,
  _PlatformReadConfig,
  _PlatformCreditRole,
  _PlatformParty,
  _PlatformPartyService,
  _MisoExtensionRegistration,
  _PlatformContractsRecordReleaseIdOptions,
  _PlatformRecordSoldPurchasePrice,
  _PlatformShareEvent,
  _PlatformLinkEvent,
  _PlatformPaymentEventFactory,
  _PlatformTrackDistribution,
  _PlatformRevenueDistribution,
  _PlatformWideReward,
  _Record,
  _LanguageCode,
  _PlatformRecordSalesUnavailableError,
  _StreamingRendition,
  _StreamingWarmError,
  _TranscodingRequest,
  _TranscodingProcessExitError,
];
