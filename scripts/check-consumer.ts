// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { cp, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Install real tarballs outside the workspace. This catches unpublished sibling
// resolution, missing exports, Node-incompatible imports, and declaration drift.
const root = resolve(import.meta.dir, "..");
const temporary = await mkdtemp(join(tmpdir(), "miso-sdk-consumer-"));
const run = async (command: string[], cwd: string): Promise<string> => {
  const process = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "inherit" });
  const output = await new Response(process.stdout).text();
  if (await process.exited !== 0) throw new Error(`Failed: ${command.join(" ")}\n${output}`);
  return output;
};

type Manifest = { name: string; version: string; exports: Record<string, unknown> };
const manifests: Manifest[] = [];
// The full export probe includes the optional browser player and its HlsConfig types.
const dependencies: Record<string, string> = { typescript: "5.9.3", "hls.js": "1.6.13" };
for (const directory of await readdir(join(root, "packages"))) {
  const cwd = join(root, "packages", directory);
  const manifest = JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as Manifest;
  const packed = JSON.parse(await run(["npm", "pack", "--ignore-scripts", "--json", "--pack-destination", temporary], cwd)) as [{ filename: string }];
  manifests.push(manifest);
  dependencies[manifest.name] = `file:${join(temporary, packed[0].filename)}`;
}
await writeFile(join(temporary, "package.json"), JSON.stringify({ private: true, type: "module", dependencies }, null, 2));
await run(["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"], temporary);
const fixture = join(root, "packages/platform/tests/fixtures/isolated-consumer");
await cp(join(fixture, "imports.ts"), join(temporary, "imports.ts"));
await cp(join(fixture, "tsconfig.json"), join(temporary, "tsconfig.json"));
const imports = manifests.flatMap((manifest) => Object.keys(manifest.exports)
  .filter((subpath) => !subpath.includes("*") && subpath !== "./package.json")
  .map((subpath) => manifest.name + (subpath === "." ? "" : subpath.slice(1))));
await writeFile(join(temporary, "exports.ts"), imports.map((specifier, index) =>
  `import * as entry${index} from ${JSON.stringify(specifier)}; void entry${index};`).join("\n"));
await run(["node", "node_modules/typescript/bin/tsc", "--noEmit"], temporary);
await run(["node", "--input-type=module", "-e", imports.map((specifier) => `await import(${JSON.stringify(specifier)});`).join("\n")], temporary);
console.log(`Verified ${manifests.length} packed packages and ${imports.length} entry points with Node and TypeScript 5.9: ${temporary}`);
