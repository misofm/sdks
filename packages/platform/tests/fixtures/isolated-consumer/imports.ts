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

import { MisoClient as MusicosRootClient, type MisoOptions as MusicosRootOptions } from "@misofm/musicos";
import { MisoProtocolClient, type MisoProtocolClientOptions } from "@misofm/musicos/client";
import { type BcsParser } from "@misofm/musicos/queries";
import { composition as musicosComposition } from "@misofm/musicos/contracts";
import { BcsDecodeError as MusicosBcsDecodeError } from "@misofm/musicos/errors";

// The raw wildcard subpath (`./contracts/*`): a deep module not exposed
// through the curated barrel.
import { Composition as CompositionStruct } from "@misofm/musicos/contracts/musicos/composition";

import { PartyosClient, type Party as PartyosParty } from "@misofm/partyos";
import { getPartyDeployment, type PartyDeployment } from "@misofm/partyos/deployments";
import { Party as PartyStruct } from "@misofm/partyos/contracts/partyos/party";
import { PartyNotFoundError } from "@misofm/partyos/errors";

import { MisoClient as PlatformRootClient, type MisoOptions as PlatformRootOptions } from "@misofm/platform";
import { MisoPlatformClient, type MisoPlatformConfig } from "@misofm/platform/client";
import { derivePressingId, type OpenPressingParams } from "@misofm/platform/pressing";
import { directAdminCap, type AdminCapAuthority } from "@misofm/platform/vault";
import { misoConfig, type MisoConfig } from "@misofm/platform/read";
import { attachCompositionCredit, type CompositionRole } from "@misofm/platform/credits";
import { PartyPlatformClient, type Profile } from "@misofm/platform/party";
import { record as platformRecord } from "@misofm/platform/contracts";
import { RecordSalesUnavailableError } from "@misofm/platform/errors";

// The raw wildcard subpath (`./contracts/*`): a deep module and a nested
// `deps/*` module, neither of which is exposed through the curated barrel.
import { Record as RecordStruct } from "@misofm/platform/contracts/record/record";
import { LanguageCode as LanguageCodeTuple } from "@misofm/platform/contracts/recording_language/deps/language_code/language_code";

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

type _MusicosRootOptions = MusicosRootOptions;
type _MusicosClientOptions = MisoProtocolClientOptions;
type _MusicosBcsParser = BcsParser<string>;
type _MusicosContractsCompositionNewOptions = Parameters<typeof musicosComposition._new>[0];
type _Composition = ReturnType<typeof CompositionStruct.parse>;
type _MusicosBcsDecodeError = MusicosBcsDecodeError;

type _PartyosParty = PartyosParty;
type _PartyosDeployment = PartyDeployment;
type _PartyStruct = ReturnType<typeof PartyStruct.parse>;
type _PartyNotFoundError = PartyNotFoundError;

type _PlatformRootOptions = PlatformRootOptions;
type _PlatformClientConfig = MisoPlatformConfig;
type _PlatformPressingParams = OpenPressingParams;
type _PlatformVaultAuthority = AdminCapAuthority;
type _PlatformReadConfig = MisoConfig;
type _PlatformCreditRole = CompositionRole;
type _PlatformParty = Profile;
type _PlatformContractsRecordReleaseIdOptions = Parameters<typeof platformRecord.releaseId>[0];
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
  MusicosRootClient,
  MisoProtocolClient,
  musicosComposition,
  CompositionStruct,
  MusicosBcsDecodeError,
  PartyosClient,
  getPartyDeployment,
  PartyStruct,
  PartyNotFoundError,
  PlatformRootClient,
  MisoPlatformClient,
  derivePressingId,
  directAdminCap,
  misoConfig,
  attachCompositionCredit,
  PartyPlatformClient,
  platformRecord,
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
  _MusicosRootOptions,
  _MusicosClientOptions,
  _MusicosBcsParser,
  _MusicosContractsCompositionNewOptions,
  _Composition,
  _MusicosBcsDecodeError,
  _PartyosParty,
  _PartyosDeployment,
  _PartyStruct,
  _PartyNotFoundError,
  _PlatformRootOptions,
  _PlatformClientConfig,
  _PlatformPressingParams,
  _PlatformVaultAuthority,
  _PlatformReadConfig,
  _PlatformCreditRole,
  _PlatformParty,
  _PlatformContractsRecordReleaseIdOptions,
  _Record,
  _LanguageCode,
  _PlatformRecordSalesUnavailableError,
  _StreamingRendition,
  _StreamingWarmError,
  _TranscodingRequest,
  _TranscodingProcessExitError,
];
