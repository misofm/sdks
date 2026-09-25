import { execFileSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const packageDir = resolve(import.meta.dir, "..")
const fixtureDir = join(packageDir, "tests", "consumer")
const tempDir = mkdtempSync(join(tmpdir(), "misofm-bridge-consumer-"))

try {
	const packed = JSON.parse(execFileSync(
		"npm",
		["pack", "--ignore-scripts", "--json", "--pack-destination", tempDir],
		{ cwd: packageDir }
	).toString()) as ReadonlyArray<{ filename: string; files: ReadonlyArray<{ path: string }> }>
	const tarball = packed[0]
	if (!tarball) throw new Error("npm pack produced no Bridge tarball")
	const packageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
		name: string
		exports: Record<string, unknown>
	}
	const packedFiles = new Set(tarball.files.map((file) => file.path))
	for (const [subpath, entry] of Object.entries(packageJson.exports)) {
		if (subpath === "./package.json") continue
		if (typeof entry !== "object" || entry === null || !("default" in entry) || !("types" in entry)) {
			throw new Error(`Export ${subpath} must provide both ESM and declarations`)
		}
		for (const target of [(entry as { default: string }).default, (entry as { types: string }).types]) {
			if (!packedFiles.has(target.replace(/^\.\//, ""))) {
				throw new Error(`Export ${subpath} points to missing packed file ${target}`)
			}
		}
	}

	const fixtureFiles = [
		"package.json",
		"tsconfig.json",
		"tsconfig.worker.json",
		"consumer.ts",
		"runtime.mjs",
		"worker-smoke.mjs"
	]
	for (const filename of fixtureFiles) copyFileSync(join(fixtureDir, filename), join(tempDir, filename))
	copyFileSync(join(tempDir, tarball.filename), join(tempDir, "bridge.tgz"))
	copyFileSync(
		join(packageDir, "examples", "cloudflare-worker", "src", "index.ts"),
		join(tempDir, "worker.ts")
	)

	console.log("Bridge consumer: installing isolated packed package")
	execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
		cwd: tempDir,
		stdio: "inherit"
	})
	console.log("Bridge consumer: typechecking every exported subpath")
	execFileSync("npm", ["run", "check"], { cwd: tempDir, stdio: "inherit" })
	console.log("Bridge consumer: compiling and running the Worker example with mocked Fetch")
	execFileSync("npm", ["run", "check:worker"], { cwd: tempDir, stdio: "inherit" })
	console.log(`Bridge consumer: OK — ${packageJson.name} ${tarball.filename}`)
} finally {
	rmSync(tempDir, { recursive: true, force: true })
}
