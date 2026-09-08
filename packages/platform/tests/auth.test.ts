// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  AUTHORIZATION_MAX_AGE_MS,
  MISO_AUTH_HEADERS,
  MisoAuthError,
  authenticatedFetch,
  buildApiAuthorizationPayload,
  createAuthorizationHeaders,
  type AuthorizationChallenge,
} from "../src/auth.ts";

const ADDRESS = `0x${"12".repeat(32)}`;
const NOW = Date.parse("2026-08-17T07:00:00.000Z");

function challenge(
  method = "PUT",
  path = "/platform/usernames/alice",
  nowMs = NOW,
): AuthorizationChallenge {
  const issuedAt = new Date(nowMs).toISOString();
  const fields = { method, path, address: ADDRESS, network: "testnet" as const, issuedAt };
  return {
    ...fields,
    payload: buildApiAuthorizationPayload(fields),
    expiresAt: new Date(nowMs + AUTHORIZATION_MAX_AGE_MS).toISOString(),
  };
}

describe("auth contract", () => {
  test("builds the byte-exact personal message", () => {
    expect(challenge().payload).toBe([
      "miso.fm API authorization v1",
      "",
      "Method: PUT",
      "Path: /platform/usernames/alice",
      `Address: ${ADDRESS}`,
      "Network: testnet",
      "Issued At: 2026-08-17T07:00:00.000Z",
    ].join("\n"));
  });

  test("validates the challenge before signing and returns all required headers", async () => {
    let signed = "";
    const result = await Effect.runPromise(createAuthorizationHeaders({
      apiUrl: "https://api.testnet.miso.fm/platform/usernames/alice",
      token: "oidc-token",
      address: ADDRESS,
      method: "put",
      path: "/platform/usernames/alice",
      network: "testnet",
      nowMs: NOW,
      signer: {
        async signPersonalMessage(message) {
          signed = new TextDecoder().decode(message);
          return { signature: "sui-signature" };
        },
      },
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.testnet.miso.fm/platform/auth/challenge");
        expect(init?.method).toBe("POST");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer oidc-token");
        return Response.json(challenge());
      },
    }));

    expect(signed).toBe(challenge().payload);
    expect(result.headers.get("authorization")).toBe("Bearer oidc-token");
    expect(result.headers.get(MISO_AUTH_HEADERS.address)).toBe(ADDRESS);
    expect(result.headers.get(MISO_AUTH_HEADERS.signature)).toBe("sui-signature");
    expect(result.headers.get(MISO_AUTH_HEADERS.issuedAt)).toBe("2026-08-17T07:00:00.000Z");
  });

  test("does not sign a challenge for another path", async () => {
    let signCalls = 0;
    const error = await Effect.runPromise(
      createAuthorizationHeaders({
        apiUrl: "https://api.testnet.miso.fm/platform/usernames/alice",
        token: "oidc-token",
        address: ADDRESS,
        method: "PUT",
        path: "/platform/usernames/alice",
        network: "testnet",
        nowMs: NOW,
        signer: {
          async signPersonalMessage() {
            signCalls += 1;
            return { signature: "must-not-run" };
          },
        },
        fetch: async () => Response.json(challenge("PUT", "/platform/usernames/bob")),
      }).pipe(Effect.flip),
    );
    expect(error).toMatchObject({ code: "invalid_challenge" });
    expect(signCalls).toBe(0);
  });

  test("performs the mutation only after signing", async () => {
    const calls: string[] = [];
    const nowMs = Date.now();
    const response = await Effect.runPromise(authenticatedFetch(
      "https://api.testnet.miso.fm/platform/usernames/alice",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        auth: {
          token: "oidc-token",
          address: ADDRESS,
          network: "testnet",
          signer: {
            async signPersonalMessage() {
              calls.push("sign");
              return { signature: "sui-signature" };
            },
          },
        },
        fetch: async (input, init) => {
          const url = String(input);
          if (url.endsWith("/platform/auth/challenge")) {
            calls.push("challenge");
            return Response.json(challenge("PUT", "/platform/usernames/alice", nowMs));
          }
          calls.push("mutation");
          const headers = new Headers(init?.headers);
          expect(headers.get(MISO_AUTH_HEADERS.signature)).toBe("sui-signature");
          expect(headers.get("content-type")).toBe("application/json");
          return Response.json({ ok: true });
        },
      },
    ));
    expect(response.ok).toBe(true);
    expect(calls).toEqual(["challenge", "sign", "mutation"]);
  });

  test("surfaces a rejected challenge without invoking the signer", async () => {
    let signed = false;
    const error = await Effect.runPromise(
      createAuthorizationHeaders({
        apiUrl: "https://api.testnet.miso.fm/platform/usernames/alice",
        token: "expired-token",
        address: ADDRESS,
        method: "PUT",
        path: "/platform/usernames/alice",
        signer: {
          async signPersonalMessage() {
            signed = true;
            return { signature: "unexpected" };
          },
        },
        fetch: async () => Response.json(
          { error: { message: "Sign in again." } },
          { status: 401 },
        ),
      }).pipe(Effect.flip),
    );
    expect(error).toBeInstanceOf(MisoAuthError);
    expect(error).toMatchObject({ code: "challenge_rejected", status: 401, message: "Sign in again." });
    expect(signed).toBe(false);
  });
});
