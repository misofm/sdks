import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";

import * as musicProtocolRoot from "@misofm/music";
import * as musicProtocolDeployments from "@misofm/music/deployments";
import * as musicProtocolTransactions from "@misofm/music/transactions";
import * as musicProtocolParsers from "@misofm/music/parsers";
import * as musicProtocolEvents from "@misofm/music/events";
import * as musicProtocolPackages from "@misofm/music/packages";
import * as musicProtocolContracts from "@misofm/music/contracts";
import * as musicProtocolErrors from "@misofm/music/errors";

import * as partyProtocolRoot from "@misofm/party";
import * as partyProtocolContracts from "@misofm/party/contracts";
import * as partyProtocolErrors from "@misofm/party/errors";

import * as platformRoot from "@misofm/platform";
import * as platformEvents from "@misofm/platform/events";
import * as platformContracts from "@misofm/platform/contracts";
import * as platformClient from "@misofm/platform/client";
import * as platformPressing from "@misofm/platform/pressing";
import * as platformVault from "@misofm/platform/vault";
import * as platformRead from "@misofm/platform/read";
import * as platformCredits from "@misofm/platform/credits";
import * as platformParty from "@misofm/platform/party";
import * as platformErrors from "@misofm/platform/errors";
import * as recordModule from "@misofm/platform/contracts/record/record";
import * as languageCodeModule from "@misofm/platform/contracts/party_profile/deps/language_code/language_code";

import * as streamingRoot from "@misofm/streaming";
import * as streamingErrors from "@misofm/streaming/errors";
import * as transcodingRoot from "@misofm/transcoding";
import * as transcodingErrors from "@misofm/transcoding/errors";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function hasExport(namespace, name) {
  return Object.prototype.hasOwnProperty.call(namespace, name);
}

// --- module load + expected-export checks -------------------------------

invariant(Object.keys(musicProtocolRoot).length > 0, "@misofm/music root export did not load");
invariant(hasExport(musicProtocolRoot, "MusicProtocol"), "@misofm/music root missing the MusicProtocol service");
invariant(hasExport(musicProtocolRoot, "musicProtocol"), "@misofm/music root missing the musicProtocol() registration");
invariant(hasExport(musicProtocolRoot, "contracts"), "@misofm/music root missing contracts namespace");

// `musicProtocol()` builds a `SuiClientRegistration` synchronously — no network —
// so it is safe to call here, proving `client.$extend(musicProtocol())` (the
// Definition of Done's own words) resolves and shapes correctly without this
// fixture needing a real client.
const registration = musicProtocolRoot.musicProtocol();
invariant(registration.name === "musicProtocol", "musicProtocol() registration name is not \"musicProtocol\"");
invariant(typeof registration.register === "function", "musicProtocol() registration has no register()");

invariant(Object.keys(musicProtocolDeployments).length > 0, "@misofm/music/deployments export did not load");
invariant(hasExport(musicProtocolDeployments, "MISO_DEPLOYMENTS"), "@misofm/music/deployments missing MISO_DEPLOYMENTS");

invariant(Object.keys(musicProtocolTransactions).length > 0, "@misofm/music/transactions export did not load");
invariant(hasExport(musicProtocolTransactions, "createComposition"), "@misofm/music/transactions missing createComposition");

invariant(Object.keys(musicProtocolParsers).length > 0, "@misofm/music/parsers export did not load");
invariant(
  hasExport(musicProtocolParsers, "parseCompositionPublishedEvent"),
  "@misofm/music/parsers missing parseCompositionPublishedEvent",
);

invariant(Object.keys(musicProtocolEvents).length > 0, "@misofm/music/events export did not load");
invariant(hasExport(musicProtocolEvents, "eventParsers"), "@misofm/music/events missing eventParsers");

invariant(Object.keys(musicProtocolPackages).length > 0, "@misofm/music/packages export did not load");
invariant(hasExport(musicProtocolPackages, "bindModulePackage"), "@misofm/music/packages missing bindModulePackage");

invariant(Object.keys(musicProtocolErrors).length > 0, "@misofm/music/errors export did not load");
invariant(hasExport(musicProtocolErrors, "ObjectNotFound"), "@misofm/music/errors missing ObjectNotFound");
invariant(hasExport(musicProtocolErrors, "MusicProtocolDeploymentInvalid"), "@misofm/music/errors missing MusicProtocolDeploymentInvalid");
invariant(hasExport(musicProtocolErrors, "MusicProtocolTreasuryCapNotFound"), "@misofm/music/errors missing MusicProtocolTreasuryCapNotFound");

invariant(Object.keys(musicProtocolContracts).length > 0, "@misofm/music/contracts export did not load");
invariant(hasExport(musicProtocolContracts, "composition"), "@misofm/music/contracts (curated) missing composition");
invariant(
  typeof musicProtocolContracts.composition._new === "function",
  "@misofm/music/contracts (curated) composition._new did not load as a function",
);
invariant(
  !("uid" in musicProtocolContracts.composition),
  "@misofm/music/contracts (curated) leaked the raw `uid` accessor it is meant to curate away",
);

invariant(Object.keys(partyProtocolRoot).length > 0, "@misofm/party root export did not load");
invariant(hasExport(partyProtocolRoot, "PartyProtocol"), "@misofm/party root missing the PartyProtocol service");
invariant(hasExport(partyProtocolRoot, "partyProtocol"), "@misofm/party root missing the partyProtocol() registration");

// `partyProtocol()` builds a `SuiClientRegistration` synchronously — no network —
// the same proof `musicProtocol()` gets above.
const partyProtocolRegistration = partyProtocolRoot.partyProtocol();
invariant(partyProtocolRegistration.name === "partyProtocol", 'partyProtocol() registration name is not "partyProtocol"');
invariant(typeof partyProtocolRegistration.register === "function", "partyProtocol() registration has no register()");

invariant(hasExport(partyProtocolContracts, "party"), "@misofm/party/contracts missing party");
invariant(!("uid" in partyProtocolContracts.party), "@misofm/party/contracts leaked the raw `uid` accessor");

invariant(Object.keys(partyProtocolErrors).length > 0, "@misofm/party/errors export did not load");
invariant(hasExport(partyProtocolErrors, "PartyNotFoundError"), "@misofm/party/errors missing PartyNotFoundError");

invariant(Object.keys(platformRoot).length > 0, "@misofm/platform root export did not load");
invariant(hasExport(platformRoot, "Miso"), "@misofm/platform root missing the Miso service");
invariant(hasExport(platformRoot, "miso"), "@misofm/platform root missing the miso() registration");

// `miso()` builds a `SuiClientRegistration` synchronously — no network —
// the same proof `musicProtocol()`/`partyProtocol()` get above.
const misoRegistration = platformRoot.miso();
invariant(misoRegistration.name === "miso", 'miso() registration name is not "miso"');
invariant(typeof misoRegistration.register === "function", "miso() registration has no register()");

invariant(hasExport(platformRoot, "contracts"), "@misofm/platform root missing contracts namespace");
invariant(hasExport(platformRoot, "platformEventParsers"), "@misofm/platform root missing platform event registry");
invariant(hasExport(platformEvents, "platformEventParsers"), "@misofm/platform/events missing platform event registry");
invariant(hasExport(platformContracts, "share"), "platform contracts missing share input");
invariant(hasExport(platformContracts, "pay"), "platform contracts missing pay input");
invariant(hasExport(platformContracts, "platformLink"), "platform contracts missing platform_link input");

// Public barrel codecs and the public registry must agree on representative
// rich fields. These values are deliberately built through the barrel (the
// fixture has no deep source imports) and include wide quantities and byte
// vectors that used to be pruned or narrowed.
const eventId = `0x${"11".repeat(32)}`;
const descriptionBytes = platformContracts.releaseDescription.ReleaseDescriptionSetEvent.serialize({
  release_id: eventId,
  release_admin_cap_id: eventId,
  description_existed_before: false,
}).toBytes();
const description = platformEvents.platformEventParsers.extensions.releaseDescription.descriptionSet(descriptionBytes);
invariant(description.description_existed_before === false, "description presence did not survive public decode");
invariant(!("description_after" in description), "description content leaked into bounded receipt");
const claimBytes = platformContracts.royaltyPool.RoyaltyClaimedEvent.serialize({
  pool_id: eventId,
  stake_id: eventId,
  staked_amount: "1",
  reward_amount: "9007199254740993",
  registration_debt_before: "340282366920938463463374607431768211456",
  registration_debt_after: "340282366920938463463374607431768211457",
  reward_residue_after: "0",
  stake_registration_count_after: "1",
  pool_balance_after: "2",
  staked_shares_after: "3",
  cumulative_reward_per_share_after: "4",
  carry_after: "5",
  cumulative_deposits_after: "6",
}).toBytes();
const claim = platformRoot.platformEventParsers.primitives.royaltyPool.royaltyClaimed(claimBytes);
invariant(claim.reward_amount === "9007199254740993", "wide royalty quantity lost precision");
invariant(typeof platformContracts.pay.PaymentSentEvent === "function", "generic pay event factory missing");
invariant(typeof platformContracts.share.ShareInitializedEvent.parse === "function", "share event codec missing");
invariant(typeof platformContracts.platformLink.PlatformLinkSetEvent.parse === "function", "platform-link event codec missing");
const mappedRevenue = platformRoot.parseReleaseRevenueDistributedEvent;
invariant(typeof mappedRevenue === "function", "release revenue mapper missing");

invariant(Object.keys(platformClient).length > 0, "@misofm/platform/client export did not load");
invariant(hasExport(platformClient, "miso"), "@misofm/platform/client missing the miso() registration");

invariant(Object.keys(platformPressing).length > 0, "@misofm/platform/pressing export did not load");
invariant(hasExport(platformPressing, "derivePressingId"), "@misofm/platform/pressing missing derivePressingId");

invariant(Object.keys(platformVault).length > 0, "@misofm/platform/vault export did not load");
invariant(hasExport(platformVault, "directAdminCap"), "@misofm/platform/vault missing directAdminCap");

invariant(Object.keys(platformRead).length > 0, "@misofm/platform/read export did not load");
invariant(hasExport(platformRead, "misoConfig"), "@misofm/platform/read missing misoConfig");

invariant(Object.keys(platformCredits).length > 0, "@misofm/platform/credits export did not load");
invariant(hasExport(platformCredits, "attachCompositionCredit"), "@misofm/platform/credits missing attachCompositionCredit");

invariant(Object.keys(platformParty).length > 0, "@misofm/platform/party export did not load");
invariant(hasExport(platformParty, "makeMisoParty"), "@misofm/platform/party missing makeMisoParty");

invariant(Object.keys(platformErrors).length > 0, "@misofm/platform/errors export did not load");
invariant(hasExport(platformErrors, "RecordSalesUnavailableError"), "@misofm/platform/errors missing RecordSalesUnavailableError");

// Raw wildcard subpath: a deep module and a nested `deps/*` module that are
// NOT reachable through the curated `./contracts` barrel.
invariant(Object.keys(recordModule).length > 0, "@misofm/platform/contracts/record/record did not load");
invariant(hasExport(recordModule, "Record"), "raw contracts/record/record missing Record");
invariant(typeof recordModule.Record.parse === "function", "Record BCS codec missing parse()");

invariant(
  Object.keys(languageCodeModule).length > 0,
  "@misofm/platform/contracts/party_profile/deps/language_code/language_code did not load",
);
invariant(hasExport(languageCodeModule, "LanguageCode"), "raw nested deps/language_code module missing LanguageCode");
invariant(typeof languageCodeModule.LanguageCode.parse === "function", "LanguageCode BCS codec missing parse()");

invariant(Object.keys(streamingRoot).length > 0, "@misofm/streaming root export did not load");
invariant(hasExport(streamingRoot, "HLS_CONTRACT"), "@misofm/streaming root missing HLS_CONTRACT");

invariant(Object.keys(streamingErrors).length > 0, "@misofm/streaming/errors export did not load");
invariant(hasExport(streamingErrors, "WarmError"), "@misofm/streaming/errors missing WarmError");

invariant(Object.keys(transcodingRoot).length > 0, "@misofm/transcoding root export did not load");
invariant(
  hasExport(transcodingRoot, "chooseSegmentTargetMs"),
  "@misofm/transcoding root missing chooseSegmentTargetMs",
);

invariant(Object.keys(transcodingErrors).length > 0, "@misofm/transcoding/errors export did not load");
invariant(hasExport(transcodingErrors, "ProcessExitError"), "@misofm/transcoding/errors missing ProcessExitError");

// --- dependency identity: package manager agnostic -----------------------
//
// Walks every `node_modules` directory reachable from this consumer (real
// directories only — a symlinked directory is left alone rather than walked
// into again, which keeps this terminating regardless of whether the
// package manager hoists, nests, or symlinks). Works the same whether the
// consumer was installed with npm, bun, or pnpm.

function collectNodeModulesDirs(root) {
  const found = [];
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue; // skips symlinks too (isDirectory() is false for them)
      const full = join(dir, entry.name);
      if (entry.name === "node_modules") {
        found.push(full);
        walk(full);
      } else if (entry.name !== ".bin") {
        walk(full);
      }
    }
  }
  walk(root);
  return found;
}

function findPackageInstances(root, packageName) {
  const parts = packageName.split("/");
  const instances = new Set();
  for (const nodeModulesDir of collectNodeModulesDirs(root)) {
    const manifestPath = join(nodeModulesDir, ...parts, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.name === packageName) instances.add(realpathSync(manifestPath));
  }
  return instances;
}

const consumerRoot = import.meta.dirname;

function assertSingleInstance(packageName) {
  const instances = findPackageInstances(consumerRoot, packageName);
  invariant(instances.size === 1, `expected exactly one ${packageName} instance, found ${instances.size}`);
  const [manifestPath] = instances;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  console.log(`isolated consumer verified: single ${packageName}@${manifest.version} installed`);
}

assertSingleInstance("@mysten/sui");

// Every `@misofm/*` package peers on exactly one `effect`; two copies would
// give the shared `SuiClient`/`SuiGraphQL` Context.Service tags (and every
// Schema.TaggedError class) distinct identities across package boundaries,
// silently breaking `Effect.provide`/`Effect.catchTag` for a consumer that
// composes programs from more than one `@misofm/*` package.
assertSingleInstance("effect");

// `@mysten/bcs` is a peer of party, music and platform (not a bundled
// dependency). The runtime codecs come through `@mysten/sui/bcs`; the peer is
// type-only (the generated declarations `import type {} from "@mysten/bcs"`),
// so one installed copy keeps the `BcsType` types in the packed `.d.ts` files
// identical to the ones `@mysten/sui` exposes.
assertSingleInstance("@mysten/bcs");

// A consumer that ends up resolving two copies of the same `@misofm/*`
// package (e.g. because one package pins another at a version distinct from
// the workspace's) gets two distinct class identities for the same name, so
// `instanceof` checks and BCS codecs passed across the package boundary fail
// silently. Discovered from the fixture's own `node_modules/@misofm/*`
// rather than hard-coded, so this check covers whatever this fixture's
// `package.json` currently installs.
const misofmScopeDir = join(consumerRoot, "node_modules", "@misofm");
const installedMisofmPackages = readdirSync(misofmScopeDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `@misofm/${entry.name}`);
invariant(installedMisofmPackages.length > 0, "no @misofm/* packages found under node_modules/@misofm");
for (const packageName of installedMisofmPackages) {
  assertSingleInstance(packageName);
}

console.log("isolated consumer dependency identity verified");
