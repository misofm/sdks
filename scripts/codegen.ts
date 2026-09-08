// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Generate bindings without writing `package_summaries/` into sibling Move
 * source worktrees. `sui move summary` receives each source path but writes its
 * result into a unique temporary directory; @mysten/codegen then reads only
 * that copied summary and writes the tracked bindings under each tree's
 * `src/contracts` (see `outputs` in `sui-codegen.config.ts`).
 *
 * Every tree is a closed world: before generating, directories the config no
 * longer names are pruned; after generating, any directory the config did not
 * predict fails the run, because it means a `@local-pkg/<name>` label drifted
 * from the Move package's real name.
 */

import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { generateFromPackageSummary } from "@mysten/codegen";
import config, { type GeneratedTree } from "../sui-codegen.config.ts";
import {
  generatedContractDirectories,
  normalizeBcsAnchor,
  pruneRemovedPackageDirectories,
  unexpectedPackageDirectories,
} from "./codegen-output.ts";

const temporaryRoot = mkdtempSync(join(tmpdir(), "miso-sdk-codegen-"));
const trees = Object.keys(config.outputs) as GeneratedTree[];
const outputDir = (tree: GeneratedTree) => resolve(process.cwd(), config.outputs[tree]);

/** Keep generated output clean even when a generator template emits ` * ` lines. */
function normalizeGeneratedFiles(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      normalizeGeneratedFiles(entryPath);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      const source = readFileSync(entryPath, "utf8");
      const normalized = normalizeBcsAnchor(source.replace(/[ \t]+(?=\r?$)/gm, ""));
      if (normalized !== source) writeFileSync(entryPath, normalized);
    }
  }
}

try {
  for (const tree of trees) {
    mkdirSync(outputDir(tree), { recursive: true });
    const removed = pruneRemovedPackageDirectories(
      outputDir(tree),
      generatedContractDirectories(config.packages, tree),
    );
    for (const name of removed) console.log(`pruned stale ${tree} binding directory: ${name}`);
  }

  for (const [index, packageConfig] of config.packages.entries()) {
    const sourcePath = resolve(packageConfig.path);
    const summaryPath = join(
      temporaryRoot,
      `${String(index).padStart(2, "0")}-${basename(sourcePath)}`,
    );
    mkdirSync(summaryPath, { recursive: true });
    copyFileSync(join(sourcePath, "Move.toml"), join(summaryPath, "Move.toml"));

    execFileSync(
      "sui",
      [
        "move",
        "summary",
        "--path",
        sourcePath,
        "--output-directory",
        join(summaryPath, "package_summaries"),
        "--quiet",
      ],
      { stdio: "inherit" },
    );

    await generateFromPackageSummary({
      package: { package: packageConfig.package, path: summaryPath },
      prune: config.prune ?? true,
      outputDir: outputDir(packageConfig.tree),
      globalGenerate: config.generate,
      importExtension: config.importExtension,
      includePhantomTypeParameters: config.includePhantomTypeParameters,
    });
  }

  for (const tree of trees) {
    const unexpected = unexpectedPackageDirectories(
      outputDir(tree),
      generatedContractDirectories(config.packages, tree),
    );
    if (unexpected.length > 0) {
      throw new Error(
        `codegen emitted ${tree} directories the config does not name: ${unexpected.join(", ")}. ` +
          "A `@local-pkg/<name>` label in sui-codegen.config.ts disagrees with that package's Move.toml name.",
      );
    }
    normalizeGeneratedFiles(outputDir(tree));
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
