import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { createServer as createHttpServer } from "node:http"
import { createServer as createTcpServer } from "node:net"
import { readFileSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"

const host = "127.0.0.1"
const syntheticKey = "bridge-workerd-smoke-synthetic-key"
const packageDir = resolve(import.meta.dir, "..")
const exampleDir = join(packageDir, "examples", "cloudflare-worker")
const require = createRequire(import.meta.url)

// Bun's ambient Node compatibility declarations omit EventEmitter methods on
// net.Server and ChildProcess. Those host values implement Node's standard
// `on` method at runtime, which this script needs for listen/shutdown errors.
interface EventSource {
	on(event: string, listener: (...args: Array<unknown>) => void): unknown
}

const onEvent = (target: object, event: string, listener: (...args: Array<unknown>) => void): void => {
	(target as unknown as EventSource).on(event, listener)
}

interface WranglerPackage {
	readonly bin: { readonly wrangler: string }
}

interface SeenRequest {
	readonly method: string | undefined
	readonly url: string | undefined
	readonly apiKey: string | undefined
}

const reservePort = async (): Promise<number> => {
	const server = createTcpServer()
	const port = await new Promise<number>((resolvePort, reject) => {
		onEvent(server, "error", reject)
		server.listen(0, host, () => {
			const address = server.address()
			if (address === null || typeof address === "string") {
				reject(new Error("Could not reserve a local TCP port"))
				return
			}
			resolvePort(address.port)
		})
	})
	await new Promise<void>((resolveClose, reject) => {
		server.close((error) => error ? reject(error) : resolveClose())
	})
	return port
}

const listenOnLoopback = (server: ReturnType<typeof createHttpServer>): Promise<number> =>
	new Promise((resolvePort, reject) => {
		onEvent(server, "error", reject)
		server.listen(0, host, () => {
			const address = server.address()
			if (address === null || typeof address === "string") {
				reject(new Error("Could not start the local Bridge mock"))
				return
			}
			resolvePort(address.port)
		})
	})

const startWrangler = (port: number, upstreamBaseUrl: string, configPath: string, stateDir: string) => {
	const packageJsonPath = require.resolve("wrangler/package.json")
	const wranglerPackage = JSON.parse(readFileSync(packageJsonPath, "utf8")) as WranglerPackage
	const cliPath = resolve(dirname(packageJsonPath), wranglerPackage.bin.wrangler)
	const child = spawn("node", [
		cliPath,
		"dev",
		"--config",
		configPath,
		"--local",
		"--ip",
		host,
		"--port",
		String(port),
		"--log-level",
		"info",
		"--persist-to",
		stateDir,
		"--var",
		`BRIDGE_API_KEY:${syntheticKey}`,
		"--var",
		`BRIDGE_API_BASE_URL:${upstreamBaseUrl}`
	], {
		cwd: exampleDir,
		env: {
			...process.env,
			CI: "1",
			NO_UPDATE_NOTIFIER: "1",
			WRANGLER_SEND_METRICS: "false",
			CLOUDFLARE_INCLUDE_PROCESS_ENV: "false",
			CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false"
		},
		stdio: ["ignore", "pipe", "pipe"],
		detached: process.platform !== "win32"
	})

	let output = ""
	const append = (chunk: Uint8Array) => {
		output = `${output}${Buffer.from(chunk).toString()}`.slice(-12_000)
	}
	child.stdout?.on("data", append)
	child.stderr?.on("data", append)

	return {
		child,
		get output() {
			return output
		}
	}
}

const waitForWorker = async (
	url: string,
	process: ReturnType<typeof startWrangler>
): Promise<void> => {
	const deadline = Date.now() + 60_000
	while (Date.now() < deadline) {
		if (process.child.exitCode !== null || process.child.signalCode !== null) {
			throw new Error(`Wrangler exited before ready.\n${process.output}`)
		}
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(500) })
			if (response.status === 404) return
		} catch {
			// Wrangler is still starting its local workerd server.
		}
		await delay(250)
	}
	throw new Error(`Timed out waiting for local workerd.\n${process.output}`)
}

const stopWrangler = async (child: ReturnType<typeof spawn>): Promise<void> => {
	const childPid = child.pid
	if (childPid === undefined) return
	const kill = (signal: NodeJS.Signals) => {
		try {
			if (process.platform === "win32") child.kill(signal)
			else process.kill(-childPid, signal)
		} catch {
			// The process or its group may already have exited.
		}
	}
	const exited = new Promise<void>((resolveExit) => {
		if (child.exitCode !== null || child.signalCode !== null) resolveExit()
		else onEvent(child, "exit", () => resolveExit())
	})
	kill("SIGTERM")
	const timeout = Symbol("timeout")
	if (await Promise.race([exited.then(() => true), delay(5_000).then(() => timeout)]) === timeout) {
		kill("SIGKILL")
	}
	await exited
	// Wrangler may have started workerd as a child process. Remove any survivor
	// left in Wrangler's process group after its own shutdown completes.
	kill("SIGKILL")
}

const main = async (): Promise<void> => {
	const requests: Array<SeenRequest> = []
	const upstream = createHttpServer((request, response) => {
		requests.push({
			method: request.method,
			url: request.url,
			apiKey: typeof request.headers["api-key"] === "string" ? request.headers["api-key"] : undefined
		})
		if (request.method === "GET" && request.url === "/v0/customers") {
			response.writeHead(200, { "content-type": "application/json" })
			response.end(JSON.stringify({ count: 0, data: [] }))
			return
		}
		response.writeHead(404, { "content-type": "application/json" })
		response.end(JSON.stringify({ message: "unexpected mock request" }))
	})
	const stateDir = await mkdtemp(join(tmpdir(), "bridge-workerd-state-"))
	let upstreamListening = false
	let workerd: ReturnType<typeof startWrangler> | undefined
	try {
		const sourceConfig = JSON.parse(readFileSync(join(exampleDir, "wrangler.jsonc"), "utf8")) as {
			readonly name: string
			readonly compatibility_date: string
			readonly vars?: Record<string, string>
		}
		const configPath = join(stateDir, "wrangler.jsonc")
		await writeFile(configPath, JSON.stringify({
			...sourceConfig,
			name: `${sourceConfig.name}-workerd-smoke`,
			main: join(exampleDir, "src", "index.ts")
		}, null, 2), { flag: "wx" })
		const upstreamPort = await listenOnLoopback(upstream)
		upstreamListening = true
		const workerPort = await reservePort()
		workerd = startWrangler(workerPort, `http://${host}:${upstreamPort}/v0`, configPath, stateDir)
		await waitForWorker(`http://${host}:${workerPort}/__workerd_ready`, workerd)
		const response = await fetch(`http://${host}:${workerPort}/customers`, {
			method: "GET",
			signal: AbortSignal.timeout(15_000)
		})
		assert.equal(response.status, 200)
		assert.deepEqual(await response.json(), { count: 0, data: [] })
		assert.deepEqual(requests, [{
			method: "GET",
			url: "/v0/customers",
			apiKey: syntheticKey
		}])
		console.log("Bridge workerd runtime smoke: OK (local workerd, mock upstream, synthetic key)")
	} catch (error) {
		throw new Error(`Bridge workerd runtime smoke failed.\n${workerd?.output ?? "Wrangler did not start."}`, { cause: error })
	} finally {
		if (workerd !== undefined) await stopWrangler(workerd.child)
		if (upstreamListening) {
			await new Promise<void>((resolveClose, reject) => {
				upstream.close((error) => error ? reject(error) : resolveClose())
			})
		}
		await rm(stateDir, { recursive: true, force: true })
	}
}

await main()
