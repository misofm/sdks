// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import config, { generatedDirectoryName } from "../../../sui-codegen.config.ts";
import {
  generatedContractDirectories,
  pruneRemovedPackageDirectories,
  unexpectedPackageDirectories,
} from "../scripts/codegen-output.ts";

test("the musicos tree holds exactly the object model plus codegen utils", () => {
  expect([...generatedContractDirectories(config.packages, "musicos")].sort()).toEqual([
    "musicos",
    "utils",
  ]);
});

test("the partyos tree holds exactly the party object model plus codegen utils", () => {
  expect([...generatedContractDirectories(config.packages, "partyos")].sort()).toEqual([
    "partyos",
    "utils",
  ]);
});

test("every configured package lands in exactly one tree", () => {
  const trees = (Object.keys(config.outputs) as (keyof typeof config.outputs)[]).map((tree) =>
    generatedContractDirectories(config.packages, tree),
  );
  for (const entry of config.packages) {
    const name = generatedDirectoryName(entry);
    expect(trees.filter((tree) => tree.has(name)).length).toBe(1);
  }
  // Every package directory plus one `utils` per tree.
  expect(trees.reduce((total, tree) => total + tree.size, 0)).toBe(config.packages.length + trees.length);
});

test("codegen output is closed-world: stale directories are pruned and drift is reported", () => {
  const fixture = mkdtempSync(join(tmpdir(), "miso-sdk-codegen-output-"));
  try {
    mkdirSync(join(fixture, "musicos"));
    mkdirSync(join(fixture, "miso"));
    mkdirSync(join(fixture, "unrelated-directory"));
    const expected = generatedContractDirectories(config.packages, "musicos");

    expect(unexpectedPackageDirectories(fixture, expected)).toEqual(["miso", "unrelated-directory"]);
    expect(pruneRemovedPackageDirectories(fixture, expected).sort()).toEqual([
      "miso",
      "unrelated-directory",
    ]);
    expect(existsSync(join(fixture, "musicos"))).toBeTrue();
    expect(existsSync(join(fixture, "miso"))).toBeFalse();
    expect(unexpectedPackageDirectories(fixture, expected)).toEqual([]);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
