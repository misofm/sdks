// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { Effect } from "effect";
import { MisoAuthError, type MisoAuthErrorCode } from "./errors.ts";

export type { MisoAuthErrorCode };
export { MisoAuthError };

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

const target = Effect.fn("target")(function* (
  method: string,
  path: string,
): Effect.fn.Return<{ method: string; path: string }, MisoAuthError> {
  const normalized = { method: method.toUpperCase(), path };
  if (!isValidAuthorizationTarget(normalized.method, normalized.path)) {
    return yield* new MisoAuthError({
      code: "invalid_target",
      reason: "Authenticated requests require a mutation under /platform/.",
    });
  }
  return normalized;
});

const parseChallenge = Effect.fn("parseChallenge")(function* (
  input: unknown,
  expected: { method: string; path: string; address: string; network?: AuthNetwork; nowMs?: number },
): Effect.fn.Return<AuthorizationChallenge, MisoAuthError> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return yield* new MisoAuthError({
      code: "invalid_challenge",
      reason: "The API returned an invalid authorization challenge.",
    });
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
    return yield* new MisoAuthError({
      code: "invalid_challenge",
      reason: "The API returned an invalid authorization challenge.",
    });
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
    return yield* new MisoAuthError({
      code: "invalid_challenge",
      reason: "The authorization challenge did not match this request.",
    });
  }
  return challenge;
});

function responseMessage(response: Response): Effect.Effect<string> {
  return Effect.tryPromise(() => response.clone().json()).pipe(
    Effect.map((body) => body as { error?: { message?: unknown } | string; message?: unknown } | null),
    Effect.orElseSucceed(() => null),
    Effect.map((body) => {
      if (typeof body?.error === "object" && typeof body.error.message === "string") return body.error.message;
      if (typeof body?.error === "string") return body.error;
      if (typeof body?.message === "string") return body.message;
      return `Authorization challenge failed (${response.status}).`;
    }),
  );
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
}

/** Ask Miso to verify the Enoki account and issue the exact message to sign. */
export const requestAuthorizationChallenge = Effect.fn("requestAuthorizationChallenge")(function* (
  options: RequestAuthorizationChallengeOptions,
): Effect.fn.Return<AuthorizationChallenge, MisoAuthError> {
  const expected = yield* target(options.method, options.path);
  if (!options.token || !isValidSuiAddress(options.address)) {
    return yield* new MisoAuthError({
      code: "challenge_rejected",
      reason: "A valid Enoki token and Sui address are required.",
    });
  }
  const apiUrl = new URL(options.apiUrl);
  const challengeUrl = options.challengeUrl === undefined
    ? new URL("/platform/auth/challenge", apiUrl.origin)
    : new URL(options.challengeUrl, apiUrl);
  const fetcher = options.fetch ?? globalThis.fetch;
  const response = yield* Effect.tryPromise({
    try: (signal) =>
      fetcher(challengeUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.token}`,
          [MISO_AUTH_HEADERS.address]: normalizeSuiAddress(options.address),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(expected),
        signal,
      }),
    catch: (cause) => new MisoAuthError({ code: "challenge_rejected", reason: "The authorization challenge request failed.", cause }),
  });
  if (!response.ok) {
    const reason = yield* responseMessage(response);
    return yield* new MisoAuthError({ code: "challenge_rejected", reason, status: response.status });
  }
  const body = yield* Effect.tryPromise(() => response.json()).pipe(Effect.orElseSucceed(() => null));
  return yield* parseChallenge(body, {
    ...expected,
    address: options.address,
    network: options.network,
    nowMs: options.nowMs,
  });
});

export interface CreateAuthorizationHeadersOptions extends RequestAuthorizationChallengeOptions {
  signer: PersonalMessageSigner;
}

/** Verify the challenge locally, sign it as a Sui personal message, and produce API headers. */
export const createAuthorizationHeaders = Effect.fn("createAuthorizationHeaders")(function* (
  options: CreateAuthorizationHeadersOptions,
): Effect.fn.Return<{ challenge: AuthorizationChallenge; headers: Headers }, MisoAuthError> {
  const challenge = yield* requestAuthorizationChallenge(options);
  const signature = yield* Effect.tryPromise({
    try: () => options.signer.signPersonalMessage(new TextEncoder().encode(challenge.payload)),
    catch: (cause) => new MisoAuthError({ code: "signing_failed", reason: "The authorization request was not signed.", cause }),
  }).pipe(Effect.map((signed) => signed.signature));
  if (!signature) {
    return yield* new MisoAuthError({
      code: "signing_failed",
      reason: "The signer returned an empty authorization signature.",
    });
  }
  return {
    challenge,
    headers: new Headers({
      Authorization: `Bearer ${options.token}`,
      [MISO_AUTH_HEADERS.address]: challenge.address,
      [MISO_AUTH_HEADERS.signature]: signature,
      [MISO_AUTH_HEADERS.issuedAt]: challenge.issuedAt,
    }),
  };
});

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
export const authenticatedFetch = Effect.fn("authenticatedFetch")(function* (
  input: string | URL,
  options: AuthenticatedFetchOptions,
): Effect.fn.Return<Response, MisoAuthError> {
  const { auth, challengeUrl, fetch: fetchOption, ...init } = options;
  const url = new URL(input);
  const method = (init.method ?? "").toUpperCase();
  if (url.search || url.hash) {
    return yield* new MisoAuthError({
      code: "invalid_target",
      reason: "Authenticated request URLs cannot include a query or fragment.",
    });
  }
  const fetcher = fetchOption ?? globalThis.fetch;
  const authorization = yield* createAuthorizationHeaders({
    apiUrl: url,
    challengeUrl,
    fetch: fetcher,
    token: auth.token,
    address: auth.address,
    signer: auth.signer,
    network: auth.network,
    method,
    path: url.pathname,
  });
  const headers = new Headers(init.headers);
  authorization.headers.forEach((value, name) => headers.set(name, value));
  return yield* Effect.tryPromise({
    try: (signal) => fetcher(url, { ...init, method, headers, signal }),
    catch: (cause) => new MisoAuthError({ code: "invalid_target", reason: "The authenticated request failed.", cause }),
  });
});
