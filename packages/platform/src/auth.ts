// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { toPromise, SdkError, tryPromise } from "@misofm/utils/effect";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { Effect } from "effect";

export type AuthNetwork = "testnet" | "mainnet";

export interface ApiAuthorizationFields {
  method: string;
  path: string;
  address: string;
  network: AuthNetwork;
  issuedAt: string;
}

export interface AuthorizationChallenge extends ApiAuthorizationFields {
  payload: string;
  expiresAt: string;
}

export interface PersonalMessageSigner {
  signPersonalMessage(message: Uint8Array): Promise<{ signature: string; bytes?: string }>;
}

export const AUTHORIZATION_MAX_AGE_MS = 5 * 60 * 1_000;
export const AUTHORIZATION_FUTURE_SKEW_MS = 60 * 1_000;

export const MISO_AUTH_HEADERS = {
  address: "X-Sui-Address",
  signature: "X-Sui-Signature",
  issuedAt: "X-Sui-Issued-At",
} as const;

export type MisoAuthErrorCode =
  | "invalid_target"
  | "challenge_rejected"
  | "invalid_challenge"
  | "signing_failed";

export class MisoAuthError extends Error {
  readonly code: MisoAuthErrorCode;
  readonly status?: number;

  constructor(code: MisoAuthErrorCode, message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "MisoAuthError";
    this.code = code;
    this.status = options.status;
  }
}

/** The byte-exact Sui personal message required for an authenticated API mutation. */
export function buildApiAuthorizationPayload(fields: ApiAuthorizationFields): string {
  return [
    "miso.fm API authorization v1",
    "",
    `Method: ${fields.method.toUpperCase()}`,
    `Path: ${fields.path}`,
    `Address: ${fields.address}`,
    `Network: ${fields.network}`,
    `Issued At: ${fields.issuedAt}`,
  ].join("\n");
}

export function isValidAuthorizationTarget(method: string, path: string): boolean {
  return (
    ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase()) &&
    path.startsWith("/platform/") &&
    path.length <= 2_048 &&
    !/[\r\n?#]/.test(path)
  );
}

/** Accept only fresh timestamps in one canonical spelling. */
export function parseFreshAuthorizationIssuedAt(input: unknown, nowMs: number = Date.now()): string | null {
  if (typeof input !== "string") return null;
  const issuedAtMs = Date.parse(input);
  if (!Number.isFinite(issuedAtMs)) return null;
  if (
    issuedAtMs > nowMs + AUTHORIZATION_FUTURE_SKEW_MS ||
    nowMs - issuedAtMs > AUTHORIZATION_MAX_AGE_MS
  ) {
    return null;
  }
  const canonical = new Date(issuedAtMs).toISOString();
  return input === canonical ? canonical : null;
}

function target(method: string, path: string): { method: string; path: string } {
  const normalized = { method: method.toUpperCase(), path };
  if (!isValidAuthorizationTarget(normalized.method, normalized.path)) {
    throw new MisoAuthError("invalid_target", "Authenticated requests require a mutation under /platform/.");
  }
  return normalized;
}

function parseChallenge(
  input: unknown,
  expected: { method: string; path: string; address: string; network?: AuthNetwork; nowMs?: number },
): AuthorizationChallenge {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new MisoAuthError("invalid_challenge", "The API returned an invalid authorization challenge.");
  }
  const body = input as Partial<Record<keyof AuthorizationChallenge, unknown>>;
  if (
    typeof body.payload !== "string" ||
    typeof body.method !== "string" ||
    typeof body.path !== "string" ||
    typeof body.address !== "string" ||
    typeof body.network !== "string" ||
    typeof body.issuedAt !== "string" ||
    typeof body.expiresAt !== "string" ||
    !isValidSuiAddress(body.address) ||
    (body.network !== "testnet" && body.network !== "mainnet")
  ) {
    throw new MisoAuthError("invalid_challenge", "The API returned an invalid authorization challenge.");
  }

  const nowMs = expected.nowMs ?? Date.now();
  const issuedAt = parseFreshAuthorizationIssuedAt(body.issuedAt, nowMs);
  const expiresAtMs = Date.parse(body.expiresAt);
  const canonicalAddress = normalizeSuiAddress(body.address);
  const expectedAddress = normalizeSuiAddress(expected.address);
  const challenge: AuthorizationChallenge = {
    payload: body.payload,
    method: body.method,
    path: body.path,
    address: canonicalAddress,
    network: body.network,
    issuedAt: body.issuedAt,
    expiresAt: body.expiresAt,
  };
  const canonicalExpiresAt = Number.isFinite(expiresAtMs) ? new Date(expiresAtMs).toISOString() : "";

  if (
    !issuedAt ||
    body.method !== expected.method ||
    body.path !== expected.path ||
    canonicalAddress !== expectedAddress ||
    (expected.network !== undefined && body.network !== expected.network) ||
    body.expiresAt !== canonicalExpiresAt ||
    expiresAtMs <= nowMs ||
    expiresAtMs > Date.parse(issuedAt) + AUTHORIZATION_MAX_AGE_MS ||
    body.payload !== buildApiAuthorizationPayload(challenge)
  ) {
    throw new MisoAuthError("invalid_challenge", "The authorization challenge did not match this request.");
  }
  return challenge;
}

function responseMessage(response: Response, input: unknown): string {
  const body = input as {
    error?: { message?: unknown } | string;
    message?: unknown;
  } | null;
  if (body?.error && typeof body.error === "object" && typeof body.error.message === "string")
    return body.error.message;
  if (typeof body?.error === "string") return body.error;
  if (typeof body?.message === "string") return body.message;
  return `Authorization challenge failed (${response.status}).`;
}

export type AuthorizationError = MisoAuthError | SdkError;
function authSync<A>(evaluate: () => A): Effect.Effect<A, AuthorizationError> {
  return Effect.try({
    try: evaluate,
    catch: (cause) => (cause instanceof MisoAuthError ? cause : new SdkError("authorization", cause)),
  });
}

function requestSignal(caller: AbortSignal | null | undefined, fiber: AbortSignal): AbortSignal {
  return caller ? AbortSignal.any([caller, fiber]) : fiber;
}

export interface RequestAuthorizationChallengeOptions {
  apiUrl: string | URL;
  token: string;
  address: string;
  method: string;
  path: string;
  network?: AuthNetwork;
  challengeUrl?: string | URL;
  fetch?: typeof globalThis.fetch;
  nowMs?: number;
  signal?: AbortSignal | null;
}

/** Ask Miso to verify the Enoki account and issue the exact message to sign. */
export function requestAuthorizationChallengeEffect(
  options: RequestAuthorizationChallengeOptions,
): Effect.Effect<AuthorizationChallenge, AuthorizationError> {
  return Effect.gen(function* () {
    const expected = yield* authSync(() => target(options.method, options.path));
    if (!options.token || !isValidSuiAddress(options.address)) {
      return yield* Effect.fail(
        new MisoAuthError("challenge_rejected", "A valid Enoki token and Sui address are required."),
      );
    }
    const apiUrl = yield* authSync(() => new URL(options.apiUrl));
    const challengeUrl = yield* authSync(() =>
      options.challengeUrl === undefined
        ? new URL("/platform/auth/challenge", apiUrl.origin)
        : new URL(options.challengeUrl, apiUrl),
    );
    const fetcher = options.fetch ?? globalThis.fetch;
    // The transport owns the response body until decoding completes, so one
    // cancellation signal spans both headers and body consumption.
    const { response, body } = yield* tryPromise("authorization.challenge", async (signal) => {
      const linked = requestSignal(options.signal, signal);
      const response = await fetcher(challengeUrl, {
        signal: linked,
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.token}`,
          [MISO_AUTH_HEADERS.address]: normalizeSuiAddress(options.address),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(expected),
      });
      const body: unknown = await response.json().catch((cause: unknown) => {
        if (linked.aborted) throw cause;
        return null;
      });
      return { response, body };
    });
    if (!response.ok) {
      return yield* Effect.fail(
        new MisoAuthError("challenge_rejected", responseMessage(response, body), { status: response.status }),
      );
    }
    return yield* authSync(() =>
      parseChallenge(body, {
        ...expected,
        address: options.address,
        network: options.network,
        nowMs: options.nowMs,
      }),
    );
  });
}

export const requestAuthorizationChallenge = toPromise(requestAuthorizationChallengeEffect);

export interface CreateAuthorizationHeadersOptions extends RequestAuthorizationChallengeOptions {
  signer: PersonalMessageSigner;
}

/** Verify the challenge locally, sign it as a Sui personal message, and produce API headers. */
export function createAuthorizationHeadersEffect(
  options: CreateAuthorizationHeadersOptions,
): Effect.Effect<{ challenge: AuthorizationChallenge; headers: Headers }, AuthorizationError> {
  return Effect.gen(function* () {
    const challenge = yield* requestAuthorizationChallengeEffect(options);
    const { signature } = yield* Effect.tryPromise({
      try: () => options.signer.signPersonalMessage(new TextEncoder().encode(challenge.payload)),
      catch: (cause) => new MisoAuthError("signing_failed", "The authorization request was not signed.", { cause }),
    });
    if (!signature) {
      return yield* Effect.fail(
        new MisoAuthError("signing_failed", "The signer returned an empty authorization signature."),
      );
    }
    return yield* authSync(() => ({
      challenge,
      headers: new Headers({
        Authorization: `Bearer ${options.token}`,
        [MISO_AUTH_HEADERS.address]: challenge.address,
        [MISO_AUTH_HEADERS.signature]: signature,
        [MISO_AUTH_HEADERS.issuedAt]: challenge.issuedAt,
      }),
    }));
  });
}

export const createAuthorizationHeaders = toPromise(createAuthorizationHeadersEffect);

export interface AuthenticatedFetchOptions extends RequestInit {
  auth: {
    token: string;
    address: string;
    signer: PersonalMessageSigner;
    network?: AuthNetwork;
  };
  challengeUrl?: string | URL;
  fetch?: typeof globalThis.fetch;
}

/** Perform a protected Miso API mutation with a fresh Enoki-verified Sui signature. */
export function authenticatedFetchEffect(
  input: string | URL,
  options: AuthenticatedFetchOptions,
): Effect.Effect<Response, AuthorizationError> {
  return Effect.gen(function* () {
    const { auth, challengeUrl, fetch: fetchOption, ...init } = options;
    const url = yield* authSync(() => new URL(input));
    const method = (init.method ?? "").toUpperCase();
    if (url.search || url.hash) {
      return yield* Effect.fail(
        new MisoAuthError("invalid_target", "Authenticated request URLs cannot include a query or fragment."),
      );
    }
    const fetcher = fetchOption ?? globalThis.fetch;
    const authorization = yield* createAuthorizationHeadersEffect({
      apiUrl: url,
      challengeUrl,
      fetch: fetcher,
      token: auth.token,
      address: auth.address,
      signer: auth.signer,
      network: auth.network,
      method,
      path: url.pathname,
      signal: init.signal,
    });
    const headers = yield* authSync(() => {
      const headers = new Headers(init.headers);
      authorization.headers.forEach((value, name) => headers.set(name, value));
      return headers;
    });
    return yield* tryPromise("authorization.mutation", (signal) =>
      fetcher(url, { ...init, method, headers, signal: requestSignal(init.signal, signal) }),
    );
  });
}

export const authenticatedFetch = toPromise(authenticatedFetchEffect);
