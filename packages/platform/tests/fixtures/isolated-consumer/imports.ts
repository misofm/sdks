// Proves the published `.d.ts` for @misofm/effect, @misofm/musicos,
// @misofm/partyos, @misofm/platform, @misofm/streaming, and
// @misofm/transcoding are self-contained when installed as real tarballs (see
// ../../../../scripts/check-consumer.ts, or `bun run test:consumer` at the
// repo root, driving this fixture). Every subpath below is used for both a
// value and a type so tsc cannot elide the import — if any packaged
// declaration file is missing, malformed, or has a broken relative path, this
// file fails to typecheck with `skipLibCheck: false`.

import { SuiClient } from "@misofm/effect";
import { SuiRpcError } from "@misofm/effect/errors";

// musicos is a sui-effect extension (misofm/sdks#34): the `Musicos` service,
// the derived `musicos()` Promise registration, and every curated subpath
// the Definition of Done names (`.`, `/errors`, `/transactions`,
// `/deployments`, `/types`, `/parsers`, `/events`, `/packages`, `/contracts`).
import { Musicos, musicos, type MusicosOptions, type MusicosService } from "@misofm/musicos";
import { MusicosDeploymentInvalid, DecodeError as MusicosDecodeError } from "@misofm/musicos/errors";
import { createComposition, type CreateCompositionParams } from "@misofm/musicos/transactions";
import { MISO_DEPLOYMENTS, type MisoDeployment } from "@misofm/musicos/deployments";
import type { Composition as MusicosCompositionType } from "@misofm/musicos/types";
import { parseCompositionCreatedEvent } from "@misofm/musicos/parsers";
import { eventParsers as musicosEventParsers } from "@misofm/musicos/events";
import { bindModulePackage } from "@misofm/musicos/packages";
import { composition as musicosComposition } from "@misofm/musicos/contracts";

// The raw wildcard subpath (`./contracts/*`): a deep module not exposed
// through the curated barrel.
import { Composition as CompositionStruct } from "@misofm/musicos/contracts/musicos/composition";

// partyos is also a sui-effect extension (misofm/sdks#34): the `Partyos`
// service and the derived `partyos()` Promise registration replace the
// predecessor `PartyosClient` class.
import { Partyos, partyos, type Party as PartyosParty } from "@misofm/partyos";
import { getPartyDeployment, type PartyDeployment } from "@misofm/partyos/deployments";
import { Party as PartyStruct } from "@misofm/partyos/contracts/partyos/party";
import { PartyNotFoundError } from "@misofm/partyos/errors";

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
type _SuiClientLayerArg = Parameters<typeof SuiClient.layer>[0];
type _SuiRpcError = SuiRpcError;

type _MusicosOptions = MusicosOptions;
type _MusicosService = MusicosService;
type _MusicosDeploymentInvalid = MusicosDeploymentInvalid;
type _MusicosDecodeError = MusicosDecodeError;
type _MusicosCreateCompositionParams = CreateCompositionParams;
type _MusicosDeployment = MisoDeployment;
type _MusicosCompositionType = MusicosCompositionType;
type _MusicosContractsCompositionNewOptions = Parameters<typeof musicosComposition._new>[0];
type _Composition = ReturnType<typeof CompositionStruct.parse>;
// The registration `musicos()` returns, without ever calling `.register` —
// this fixture makes no network call — proving `client.$extend(musicos())`
// typechecks the way the Definition of Done names it.
type _MusicosExtensionRegistration = ReturnType<typeof musicos>;

type _PartyosParty = PartyosParty;
type _PartyosDeployment = PartyDeployment;
type _PartyStruct = ReturnType<typeof PartyStruct.parse>;
type _PartyNotFoundError = PartyNotFoundError;
// The registration `partyos()` returns, without ever calling `.register` —
// proving `client.$extend(partyos())` typechecks, the same probe `musicos()`
// gets above.
type _PartyosExtensionRegistration = ReturnType<typeof partyos>;

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
// "typechecks without calling .register" probe as `musicos()`/`partyos()`.
type _MisoExtensionRegistration = ReturnType<typeof miso>;
type _PlatformContractsRecordReleaseIdOptions = Parameters<typeof platformRecord.releaseId>[0];
type _PlatformRecordSoldCurrencyByte = ReturnType<typeof platformListing.RecordSoldEvent.parse>["purchase_currency"][number];
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
  SuiClient,
  SuiRpcError,
  Musicos,
  musicos,
  MusicosDeploymentInvalid,
  MusicosDecodeError,
  createComposition,
  MISO_DEPLOYMENTS,
  parseCompositionCreatedEvent,
  musicosEventParsers,
  bindModulePackage,
  musicosComposition,
  CompositionStruct,
  Partyos,
  partyos,
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
  _SuiClientLayerArg,
  _SuiRpcError,
  _MusicosOptions,
  _MusicosService,
  _MusicosDeploymentInvalid,
  _MusicosDecodeError,
  _MusicosCreateCompositionParams,
  _MusicosDeployment,
  _MusicosCompositionType,
  _MusicosContractsCompositionNewOptions,
  _Composition,
  _MusicosExtensionRegistration,
  _PartyosParty,
  _PartyosDeployment,
  _PartyStruct,
  _PartyNotFoundError,
  _PartyosExtensionRegistration,
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
  _PlatformRecordSoldCurrencyByte,
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
