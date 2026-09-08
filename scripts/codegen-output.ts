// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  generatedDirectoryName,
  type GeneratedTree,
  type MisoPackageConfig,
} from "../sui-codegen.config.ts";

/**
 * `@mysten/codegen` writes this directory on every run, in every output tree,
 * without a corresponding config entry.
 */
const CODEGEN_UTILS_DIRECTORY = "utils";

// A `.d.ts` referencing `@mysten/bcs` types only through inferred (unwritten)
// signatures still needs a direct declaration reference to that package, or a
// consumer building with `skipLibCheck: false` fails to resolve it. Every
// generated file that imports from `@mysten/sui/bcs` gets exactly one such
// anchor line directly beneath that import.
const directBcsAnchor = 'import type {} from "@mysten/bcs";';
const suiBcsImportLine = /^(import .* from '@mysten\/sui\/bcs';)$/m;

/** Idempotent: strips any existing anchor line(s) before reinserting exactly one. */
export function normalizeBcsAnchor(source: string): string {
  const withoutAnchor = source
    .split("\n")
    .filter((line) => line !== directBcsAnchor)
    .join("\n");
  return suiBcsImportLine.test(withoutAnchor)
    ? withoutAnchor.replace(suiBcsImportLine, `$1\n${directBcsAnchor}`)
    : withoutAnchor;
}

/**
 * The complete, closed-world directory set one generated tree may contain —
 * derived from the codegen config rather than hand-maintained, so adding or
 * renaming a Move package in `sui-codegen.config.ts` is the only edit needed.
 */
export function generatedContractDirectories(
  packages: readonly MisoPackageConfig[],
  tree: GeneratedTree,
): ReadonlySet<string> {
  return new Set([
    ...packages.filter((entry) => entry.tree === tree).map(generatedDirectoryName),
    CODEGEN_UTILS_DIRECTORY,
  ]);
}

/**
 * Enforce codegen as a closed-world operation. A removed or renamed Move package
 * must not leave a stale generated namespace that can be accidentally imported.
 * Returns the directories it removed.
 */
export function pruneRemovedPackageDirectories(
  directory: string,
  expected: ReadonlySet<string>,
): string[] {
  const removed: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !expected.has(entry.name)) {
      rmSync(join(directory, entry.name), { recursive: true, force: true });
      removed.push(entry.name);
    }
  }
  return removed;
}

/**
 * Directories present in a generated tree that the config does not account
 * for. After a run this can only mean a `@local-pkg/<name>` label disagrees
 * with the Move package's real name: codegen emitted a directory for the real
 * name while the keep-set expected the label.
 */
export function unexpectedPackageDirectories(
  directory: string,
  expected: ReadonlySet<string>,
): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !expected.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}
