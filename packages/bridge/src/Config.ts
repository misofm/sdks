import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Redacted from "effect/Redacted"

import { BridgeConfigurationError } from "./Errors.js"

export type BridgeEnvironment = "production" | "sandbox"

/**
 * Configuration for one Bridge API client. Keys must be wrapped with
 * `Redacted.make` (or read with `Config.Redacted`) before they enter the SDK.
 */
export interface BridgeConfig {
	readonly apiKey: Redacted.Redacted<string>
	readonly environment?: BridgeEnvironment | undefined
	/** An absolute API root, for example `https://bridge.example.test/v0`. */
	readonly baseUrl?: string | URL | undefined
	/** Optional per-request timeout, in milliseconds. */
	readonly timeoutMs?: number | undefined
}

export interface ResolvedBridgeConfig {
	readonly apiKey: Redacted.Redacted<string>
	readonly baseUrl: string
	readonly timeoutMs?: number | undefined
}

export const productionBaseUrl = "https://api.bridge.xyz/v0"
export const sandboxBaseUrl = "https://api.sandbox.bridge.xyz/v0"

const ConfigInput = Schema.Struct({
	apiKey: Schema.Redacted(Schema.NonEmptyString),
	environment: Schema.optionalKey(Schema.Literals(["production", "sandbox"])),
	baseUrl: Schema.optionalKey(Schema.Union([Schema.String, Schema.instanceOf(URL)])),
	timeoutMs: Schema.optionalKey(Schema.Number.check(Schema.isFinite()).check(Schema.isGreaterThan(0)))
})

/**
 * Validates and normalizes public configuration without including user-supplied
 * key or URL values in failures.
 */
export const resolveConfig = (input: BridgeConfig): Result.Result<ResolvedBridgeConfig, BridgeConfigurationError> => {
	const decoded = Schema.decodeUnknownResult(ConfigInput)(input)
	if (Result.isFailure(decoded)) {
		return Result.fail(new BridgeConfigurationError({ field: "configuration" }))
	}

	const config = decoded.success
	const rawBaseUrl = config.baseUrl ?? (config.environment === "sandbox" ? sandboxBaseUrl : productionBaseUrl)
	let baseUrl: URL
	try {
		baseUrl = new URL(rawBaseUrl)
	} catch {
		return Result.fail(new BridgeConfigurationError({ field: "baseUrl" }))
	}

	if (
		(baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") ||
		baseUrl.username.length > 0 ||
		baseUrl.password.length > 0 ||
		baseUrl.search.length > 0 ||
		baseUrl.hash.length > 0
	) {
		return Result.fail(new BridgeConfigurationError({ field: "baseUrl" }))
	}

	baseUrl.pathname = baseUrl.pathname.replace(/\/+$/, "")
	return Result.succeed({
		apiKey: config.apiKey,
		baseUrl: baseUrl.toString().replace(/\/$/, ""),
		timeoutMs: config.timeoutMs
	})
}
