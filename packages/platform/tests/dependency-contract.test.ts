// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";

type PackageManifest = {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const repositoryRoot = `${import.meta.dir}/..`;
const exactVersions = {
  "@mysten/sui": "2.29.0",
} as const;
const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

async function readManifest(path: string): Promise<PackageManifest> {
  return Bun.file(path).json();
}

test("Sui uses one exact development and peer dependency contract", async () => {
  const manifest = await readManifest(`${repositoryRoot}/package.json`);
  const consumer = await readManifest(
    `${repositoryRoot}/tests/fixtures/isolated-consumer/package.json`,
  );

  expect(Object.keys(consumer.dependencies ?? {})).toEqual([
    "@misofm/musicos",
    "@misofm/partyos",
    "@misofm/platform",
    "@misofm/streaming",
    "@misofm/transcoding",
    "typescript",
  ]);

  for (const [name, expectedVersion] of Object.entries(exactVersions)) {
    const developmentVersion = manifest.devDependencies?.[name];
    const peerVersion = manifest.peerDependencies?.[name];

    expect(developmentVersion, `${name} devDependency`).toBe(expectedVersion);
    expect(peerVersion, `${name} peerDependency`).toBe(expectedVersion);
    expect(developmentVersion, `${name} devDependency must be exact`).toMatch(
      exactVersionPattern,
    );
    expect(peerVersion, `${name} peerDependency must be exact`).toMatch(
      exactVersionPattern,
    );
    expect(
      consumer.devDependencies?.[name] ?? consumer.dependencies?.[name],
      `${name} must be resolved only through the SDK peer contract`,
    ).toBeUndefined();
  }
});

test("installed Sui matches the declared exact version", async () => {
  for (const [name, expectedVersion] of Object.entries(exactVersions)) {
    const installed = await readManifest(
      `${repositoryRoot}/node_modules/${name}/package.json`,
    );

    expect(installed.version, `${name} installed version`).toBe(expectedVersion);
  }
});
