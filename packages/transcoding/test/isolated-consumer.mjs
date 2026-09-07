import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const [runtime, tarballArgument, ...extraTarballs] = process.argv.slice(2);
if ((runtime !== "node" && runtime !== "bun") || tarballArgument === undefined)
  process.exit(64);
const tarball = resolve(tarballArgument);
// Sibling workspace tarballs (the @misofm/streaming contract) so the install
// never reaches the registry for an unpublished version.
const extras = extraTarballs.map((path) => resolve(path));

/** Read `name` out of a tarball's package/package.json without extracting it to disk. */
async function tarballPackageName(path) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { stdout } = await promisify(execFile)("tar", ["-xOf", path, "package/package.json"]);
  return JSON.parse(stdout).name;
}
const directory = await mkdtemp(join(tmpdir(), `transcoding-${runtime}-`));
// Sibling workspace tarballs are pinned through overrides so neither runtime
// resolves an unpublished version of a workspace dependency from the registry.
const overrides = Object.fromEntries(
  await Promise.all(
    extras.map(async (path) => {
      const name = await tarballPackageName(path);
      return [name, `file:${path}`];
    }),
  ),
);
await writeFile(
  join(directory, "package.json"),
  `${JSON.stringify({ type: "module", private: true, overrides, resolutions: overrides }, null, 2)}\n`,
);

const run = (file, args) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(file, args, {
      cwd: directory,
      shell: false,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0 && signal === null
        ? resolvePromise()
        : reject(new Error(`${file} failed`)),
    );
  });

if (runtime === "node") {
  // npm refuses an override that is also a direct dependency, so the sibling
  // tarballs reach npm only through `overrides`.
  await run("npm", [
    "install",
    "--ignore-scripts",
    tarball,
    "effect@4.0.0-rc.112",
    "@effect/platform-node@4.0.0-rc.112",
  ]);
  await run("node", [
    "--input-type=module",
    "-e",
    'await import("@misofm/transcoding"); await import("@misofm/transcoding/node")',
  ]);
} else {
  await run("bun", [
    "add",
    "--ignore-scripts",
    tarball,
    ...extras,
    "effect@4.0.0-rc.112",
    "@effect/platform-node@4.0.0-rc.112",
  ]);
  await run("bun", [
    "-e",
    'await import("@misofm/transcoding"); await import("@misofm/transcoding/node")',
  ]);
}

const installed = join(directory, "node_modules", "@misofm", "transcoding");
const manifest = JSON.parse(await readFile(join(installed, "package.json")));
const expectedExports = [".", "./node", "./package.json"];
if (
  JSON.stringify(Object.keys(manifest.exports).sort()) !==
  JSON.stringify(expectedExports)
)
  throw new Error("installed package export surface changed");
const files = [];
const walk = async (root, prefix = "") => {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const relative =
      prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await walk(join(root, entry.name), relative);
    else files.push(relative);
  }
};
await walk(installed);
if (
  files.some(
    (file) =>
      file.startsWith("src/") ||
      file.startsWith("test/") ||
      file.startsWith("dist/crypto/") ||
      file.startsWith("dist/hls/rewrite.") ||
      file.endsWith(".map") ||
      (file.endsWith(".ts") && !file.endsWith(".d.ts")),
  )
)
  throw new Error(
    "installed package leaked source, tests, source maps, or removed crypto output",
  );
