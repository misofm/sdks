// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Rewrites every exact `@mysten/sui` development pin in the workspace to one
// version, so CI can run the object-model SDKs' typecheck and tests against
// another release inside the packages' declared peer range (`^2.29.0`). It
// only edits package.json files; follow it with a plain `bun install`. The
// lockfile is not meant to be committed after this.
//
//   bun scripts/use-sui-version.ts 2.30.0
//
// Tests that assert the installed version read it from MISO_SUI_VERSION.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("usage: bun scripts/use-sui-version.ts <exact @mysten/sui version, e.g. 2.30.0>");
  process.exit(1);
}

const root = join(import.meta.dir, "..");
const manifests = [
  join(root, "package.json"),
  ...readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, "packages", entry.name, "package.json")),
];

for (const path of manifests) {
  const manifest = JSON.parse(readFileSync(path, "utf8")) as {
    devDependencies?: Record<string, string>;
  };
  if (manifest.devDependencies?.["@mysten/sui"] === undefined) continue;
  manifest.devDependencies["@mysten/sui"] = version;
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`use-sui-version: ${path} -> @mysten/sui ${version}`);
}
