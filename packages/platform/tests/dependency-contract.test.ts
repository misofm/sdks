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
// The pinned development version of each package the SDK builds against, and
// the (wider) peer range consumers may bring. The dev pin must satisfy the
// peer range, and a consumer must not install the package itself.
//
// CI also runs the SDKs against other releases inside the peer range
// (`scripts/use-sui-version.ts`, the `sui-matrix` job): it rewrites the dev pin
// and sets MISO_SUI_VERSION, which replaces the expected development version.
const pinnedVersions = {
  "@mysten/sui": { development: process.env["MISO_SUI_VERSION"] ?? "2.29.0", peer: "^2.29.0" },
} as const;
const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

async function readManifest(path: string): Promise<PackageManifest> {
  return Bun.file(path).json();
}

test("Sui is pinned for development and a caret range for consumers", async () => {
  const manifest = await readManifest(`${repositoryRoot}/package.json`);
  const consumer = await readManifest(
    `${repositoryRoot}/tests/fixtures/isolated-consumer/package.json`,
  );

  expect(Object.keys(consumer.dependencies ?? {})).toEqual([
    // @misofm/transcoding peers on the Effect release train; npm would
    // otherwise resolve `@effect/platform-node` to the newest 4.0.x, whose
    // `effect` peer can be newer than the pinned `effect` below.
    "@effect/platform-node",
    "@misofm/music",
    "@misofm/party",
    "@misofm/platform",
    "@misofm/streaming",
    "@misofm/transcoding",
    "effect",
    // @misofm/music (misofm/sdks#34) is a sui-effect extension; the isolated
    // consumer needs the published `@unconfirmed/sui-effect` package
    // resolvable too, the same way it needs every other dependency a packed
    // @misofm/* tarball's peers name.
    "@unconfirmed/sui-effect",
    "typescript",
  ]);

  for (const [name, expected] of Object.entries(pinnedVersions)) {
    const developmentVersion = manifest.devDependencies?.[name];
    const peerVersion = manifest.peerDependencies?.[name];

    expect(developmentVersion, `${name} devDependency`).toBe(expected.development);
    expect(peerVersion, `${name} peerDependency`).toBe(expected.peer);
    expect(developmentVersion, `${name} devDependency must be exact`).toMatch(
      exactVersionPattern,
    );
    expect(
      Bun.semver.satisfies(developmentVersion ?? "", peerVersion ?? ""),
      `${name} peer range must admit the dev pin`,
    ).toBe(true);
    expect(
      consumer.devDependencies?.[name] ?? consumer.dependencies?.[name],
      `${name} must be resolved only through the SDK peer contract`,
    ).toBeUndefined();
  }
});

test("installed Sui matches the declared development version", async () => {
  for (const [name, { development: expectedVersion }] of Object.entries(pinnedVersions)) {
    const installed = await readManifest(
      `${repositoryRoot}/node_modules/${name}/package.json`,
    );

    expect(installed.version, `${name} installed version`).toBe(expectedVersion);
  }
});

test("Effect, sui-effect and bcs are peers on the stable 4.0.x line", async () => {
  const manifest = await readManifest(`${repositoryRoot}/package.json`);

  expect(manifest.peerDependencies?.effect).toBe(">=4.0.3 <4.1");
  expect(manifest.peerDependencies?.["@unconfirmed/sui-effect"]).toBe(">=0.3.0 <0.4.0");
  // One copy of @mysten/bcs across the SDKs and sui-effect: a peer, not a
  // bundled dependency.
  expect(manifest.peerDependencies?.["@mysten/bcs"]).toBe("^2.1.1");
  expect(manifest.dependencies?.["@mysten/bcs"]).toBeUndefined();
  expect(manifest.devDependencies?.effect).toBe("4.0.4");
  expect(manifest.devDependencies?.["@unconfirmed/sui-effect"]).toBe("0.3.0");
});
