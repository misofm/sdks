import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";

import * as effectRoot from "@misofm/effect";
import * as effectErrors from "@misofm/effect/errors";

import * as musicosRoot from "@misofm/musicos";
import * as musicosClient from "@misofm/musicos/client";
import * as musicosQueries from "@misofm/musicos/queries";
import * as musicosContracts from "@misofm/musicos/contracts";
import * as musicosErrors from "@misofm/musicos/errors";

import * as partyosRoot from "@misofm/partyos";
import * as partyosContracts from "@misofm/partyos/contracts";
import * as partyosErrors from "@misofm/partyos/errors";

import * as platformRoot from "@misofm/platform";
import * as platformClient from "@misofm/platform/client";
import * as platformPressing from "@misofm/platform/pressing";
import * as platformVault from "@misofm/platform/vault";
import * as platformRead from "@misofm/platform/read";
import * as platformCredits from "@misofm/platform/credits";
import * as platformParty from "@misofm/platform/party";
import * as platformErrors from "@misofm/platform/errors";
import * as recordModule from "@misofm/platform/contracts/record/record";
import * as languageCodeModule from "@misofm/platform/contracts/recording_language/deps/language_code/language_code";

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

invariant(Object.keys(effectRoot).length > 0, "@misofm/effect root export did not load");
invariant(hasExport(effectRoot, "SuiClient"), "@misofm/effect root missing SuiClient");

invariant(Object.keys(effectErrors).length > 0, "@misofm/effect/errors export did not load");
invariant(hasExport(effectErrors, "SuiRpcError"), "@misofm/effect/errors missing SuiRpcError");
invariant(hasExport(effectErrors, "ObjectNotFoundError"), "@misofm/effect/errors missing ObjectNotFoundError");

invariant(Object.keys(musicosRoot).length > 0, "@misofm/musicos root export did not load");
invariant(hasExport(musicosRoot, "MisoClient"), "@misofm/musicos root missing MisoClient");
invariant(hasExport(musicosRoot, "contracts"), "@misofm/musicos root missing contracts namespace");

invariant(Object.keys(musicosClient).length > 0, "@misofm/musicos/client export did not load");
invariant(hasExport(musicosClient, "MisoProtocolClient"), "@misofm/musicos/client missing MisoProtocolClient");

invariant(Object.keys(musicosQueries).length > 0, "@misofm/musicos/queries export did not load");

invariant(Object.keys(musicosErrors).length > 0, "@misofm/musicos/errors export did not load");
invariant(hasExport(musicosErrors, "ObjectNotFoundError"), "@misofm/musicos/errors missing ObjectNotFoundError");

invariant(Object.keys(musicosContracts).length > 0, "@misofm/musicos/contracts export did not load");
invariant(hasExport(musicosContracts, "composition"), "@misofm/musicos/contracts (curated) missing composition");
invariant(
  typeof musicosContracts.composition._new === "function",
  "@misofm/musicos/contracts (curated) composition._new did not load as a function",
);
invariant(
  !("uid" in musicosContracts.composition),
  "@misofm/musicos/contracts (curated) leaked the raw `uid` accessor it is meant to curate away",
);

invariant(Object.keys(partyosRoot).length > 0, "@misofm/partyos root export did not load");
invariant(hasExport(partyosRoot, "PartyosClient"), "@misofm/partyos root missing PartyosClient");
invariant(hasExport(partyosContracts, "party"), "@misofm/partyos/contracts missing party");
invariant(!("uid" in partyosContracts.party), "@misofm/partyos/contracts leaked the raw `uid` accessor");

invariant(Object.keys(partyosErrors).length > 0, "@misofm/partyos/errors export did not load");
invariant(hasExport(partyosErrors, "PartyNotFoundError"), "@misofm/partyos/errors missing PartyNotFoundError");

invariant(Object.keys(platformRoot).length > 0, "@misofm/platform root export did not load");
invariant(hasExport(platformRoot, "MisoClient"), "@misofm/platform root missing MisoClient");
invariant(hasExport(platformRoot, "contracts"), "@misofm/platform root missing contracts namespace");

invariant(Object.keys(platformClient).length > 0, "@misofm/platform/client export did not load");
invariant(hasExport(platformClient, "MisoPlatformClient"), "@misofm/platform/client missing MisoPlatformClient");

invariant(Object.keys(platformPressing).length > 0, "@misofm/platform/pressing export did not load");
invariant(hasExport(platformPressing, "derivePressingId"), "@misofm/platform/pressing missing derivePressingId");

invariant(Object.keys(platformVault).length > 0, "@misofm/platform/vault export did not load");
invariant(hasExport(platformVault, "directAdminCap"), "@misofm/platform/vault missing directAdminCap");

invariant(Object.keys(platformRead).length > 0, "@misofm/platform/read export did not load");
invariant(hasExport(platformRead, "misoConfig"), "@misofm/platform/read missing misoConfig");

invariant(Object.keys(platformCredits).length > 0, "@misofm/platform/credits export did not load");
invariant(hasExport(platformCredits, "attachCompositionCredit"), "@misofm/platform/credits missing attachCompositionCredit");

invariant(Object.keys(platformParty).length > 0, "@misofm/platform/party export did not load");
invariant(hasExport(platformParty, "PartyPlatformClient"), "@misofm/platform/party missing PartyPlatformClient");

invariant(Object.keys(platformErrors).length > 0, "@misofm/platform/errors export did not load");
invariant(hasExport(platformErrors, "RecordSalesUnavailableError"), "@misofm/platform/errors missing RecordSalesUnavailableError");

// Raw wildcard subpath: a deep module and a nested `deps/*` module that are
// NOT reachable through the curated `./contracts` barrel.
invariant(Object.keys(recordModule).length > 0, "@misofm/platform/contracts/record/record did not load");
invariant(hasExport(recordModule, "Record"), "raw contracts/record/record missing Record");
invariant(typeof recordModule.Record.parse === "function", "Record BCS codec missing parse()");

invariant(
  Object.keys(languageCodeModule).length > 0,
  "@misofm/platform/contracts/recording_language/deps/language_code/language_code did not load",
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
