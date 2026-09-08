// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Inside this workspace, every `@misofm/*` import resolves locally regardless
// of a package's `exports` map — a broken or missing published entry point,
// a stale subpath, or two packages nesting incompatible versions of a shared
// dependency all typecheck and run fine here. Only installing real tarballs
// into a consumer outside the workspace fails the way a downstream consumer
// would. This script packs every workspace package, installs the tarballs
// into `packages/platform/tests/fixtures/isolated-consumer`, and runs its
// `check` script (tsc + a runtime module-load/dependency-identity probe).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const packagesDir = join(root, "packages");
const fixtureParent = join(packagesDir, "platform", "tests", "fixtures");
const fixtureDir = join(fixtureParent, "isolated-consumer");

function unscopedName(pkgName: string): string {
  return pkgName.includes("/") ? pkgName.split("/")[1]! : pkgName;
}

const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

console.log(`test:consumer: packing ${packageDirs.length} package(s): ${packageDirs.join(", ")}`);

for (const dir of packageDirs) {
  const pkgDir = join(packagesDir, dir);
  const distEntry = join(pkgDir, "dist", "index.js");
  if (!existsSync(distEntry)) {
    console.error(
      `test:consumer: ${dir}/dist/index.js is missing. Run \`bun run build\` before ` +
        `\`bun run test:consumer\` — this check packs built output, not source.`,
    );
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as { name: string };
  const packJson = execFileSync(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", fixtureParent],
    { cwd: pkgDir },
  ).toString();
  const [packed] = JSON.parse(packJson) as { filename: string }[];
  if (!packed) throw new Error(`test:consumer: npm pack produced no output for ${dir}`);
  const { filename } = packed;

  const stableName = `misofm-${unscopedName(pkg.name)}.tgz`;
  renameSync(join(fixtureParent, filename), join(fixtureParent, stableName));
  console.log(`test:consumer: packed ${dir} -> ${stableName}`);
}

rmSync(join(fixtureDir, "node_modules"), { recursive: true, force: true });
rmSync(join(fixtureDir, "package-lock.json"), { force: true });

console.log("test:consumer: installing isolated-consumer fixture");
execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
  cwd: fixtureDir,
  stdio: "inherit",
});

console.log("test:consumer: running isolated-consumer check (tsc + verify.mjs)");
execFileSync("npm", ["run", "check"], { cwd: fixtureDir, stdio: "inherit" });

console.log(`test:consumer: OK — ${packageDirs.length} package(s) packed, installed, and verified in isolation`);
