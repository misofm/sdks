// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import { Clock, Effect, Schema } from "effect";
import {
  BRIDGE_WEBHOOK_EVENT_CATEGORIES,
  WEBHOOK_MAX_AGE_MILLISECONDS,
  WebhookError,
  isKnownWebhookEventCategory,
  type WebhookErrorCode,
  verifyAndDecodeWebhookEvent,
  verifyWebhookSignature,
} from "../src/Webhooks.ts";
import {
  INVALID_JSON_RAW_BODY,
  INVALID_JSON_SIGNATURE_HEADER,
  VECTOR_PUBLIC_KEY_PEM,
  VECTOR_RAW_BODY,
  VECTOR_SIGNATURE_HEADER,
  VECTOR_TIMESTAMP,
} from "./fixtures/webhooks/vectors.ts";

function clockAt(nowMilliseconds: number): Clock.Clock {
  const nowNanoseconds = BigInt(nowMilliseconds) * 1_000_000n;
  return {
    currentTimeMillisUnsafe: () => nowMilliseconds,
    currentTimeMillis: Effect.succeed(nowMilliseconds),
    monotonicTimeNanosUnsafe: () => nowNanoseconds,
    monotonicTimeNanos: Effect.succeed(nowNanoseconds),
    currentTimeNanosUnsafe: () => nowNanoseconds,
    currentTimeNanos: Effect.succeed(nowNanoseconds),
    sleep: () => Effect.void,
  };
}

function runAt<A, E>(effect: Effect.Effect<A, E>, nowMilliseconds = VECTOR_TIMESTAMP): Promise<A> {
  return Effect.runPromise(Effect.provideService(effect, Clock.Clock, clockAt(nowMilliseconds)));
}

function verify(
  rawBody: Uint8Array = VECTOR_RAW_BODY,
  signatureHeader = VECTOR_SIGNATURE_HEADER,
  publicKey: string | CryptoKey = VECTOR_PUBLIC_KEY_PEM,
) {
  return verifyWebhookSignature({ rawBody, signatureHeader, publicKey });
}

function bufferSubarrayForVector() {
  const prefix = Buffer.from("request-body:");
  const backing = Buffer.concat([
    prefix,
    Buffer.from(VECTOR_RAW_BODY),
    Buffer.from(":end"),
  ]);
  const rawBody = backing.subarray(prefix.length, prefix.length + VECTOR_RAW_BODY.length);
  const amountOffset = rawBody.indexOf(Buffer.from("1.00"));
  if (amountOffset < 0) throw new Error("Webhook vector amount was not found");

  return {
    rawBody,
    mutateAmount: () => rawBody.set(Buffer.from("9.99"), amountOffset),
  };
}

async function failureOf(effect: Effect.Effect<void, WebhookError>): Promise<WebhookError> {
  return runAt(Effect.flip(effect));
}

describe("Bridge webhooks", () => {
  test("verifies the independently generated Bridge double-hash vector", async () => {
    await expect(runAt(verify())).resolves.toBeUndefined();
  });

  test("copies Buffer subarray bytes before awaiting the clock", async () => {
    const { rawBody, mutateAmount } = bufferSubarrayForVector();
    let mutatedAtClock = false;
    const clock = {
      ...clockAt(VECTOR_TIMESTAMP),
      currentTimeMillis: Effect.sync(() => {
        mutateAmount();
        mutatedAtClock = true;
        return VECTOR_TIMESTAMP;
      }),
    };

    await expect(Effect.runPromise(Effect.provideService(verify(rawBody), Clock.Clock, clock)))
      .resolves.toBeUndefined();
    expect(mutatedAtClock).toBe(true);
    expect(rawBody.toString("utf8")).toContain('"amount":"9.99"');
  });

  test("uses the exact body bytes and rejects body tampering", async () => {
    const alteredBody = VECTOR_RAW_BODY.slice();
    alteredBody[alteredBody.length - 2] = alteredBody[alteredBody.length - 2]! ^ 1;

    const error = await failureOf(verify(alteredBody));
    expect(error.code).toBe("invalid_signature");
  });

  test("accepts the exact max-age boundary and rejects older deliveries", async () => {
    await expect(runAt(verify(), VECTOR_TIMESTAMP + WEBHOOK_MAX_AGE_MILLISECONDS)).resolves.toBeUndefined();

    const expired = await failureOf(verify(
      VECTOR_RAW_BODY,
      `t=${VECTOR_TIMESTAMP - WEBHOOK_MAX_AGE_MILLISECONDS - 1},v0=${VECTOR_SIGNATURE_HEADER.split("v0=")[1]}`,
    ));
    expect(expired.code).toBe("timestamp_expired");
  });

  test("rejects future timestamps unless an explicit skew allowance covers them", async () => {
    const future = await runAt(Effect.flip(verify()), VECTOR_TIMESTAMP - 1);
    expect(future.code).toBe("timestamp_in_future");

    await expect(runAt(
      verifyWebhookSignature({
        rawBody: VECTOR_RAW_BODY,
        signatureHeader: VECTOR_SIGNATURE_HEADER,
        publicKey: VECTOR_PUBLIC_KEY_PEM,
        maxFutureSkewMilliseconds: 1,
      }),
      VECTOR_TIMESTAMP - 1,
    )).resolves.toBeUndefined();
  });

  test("strictly parses the signature header, timestamp, and base64", async () => {
    const encodedSignature = VECTOR_SIGNATURE_HEADER.split("v0=")[1]!;
    const invalidInputs: ReadonlyArray<readonly [string, WebhookErrorCode]> = [
      [`v0=${encodedSignature},t=${VECTOR_TIMESTAMP}`, "invalid_signature_header"],
      [`t=${VECTOR_TIMESTAMP},v0=${encodedSignature},v0=${encodedSignature}`, "invalid_signature_header"],
      [`t=${VECTOR_TIMESTAMP},v0=${encodedSignature} `, "invalid_base64"],
      [`t=01790164800000,v0=${encodedSignature}`, "invalid_timestamp"],
      [`t=1e3,v0=${encodedSignature}`, "invalid_timestamp"],
      [`t=9007199254740992,v0=${encodedSignature}`, "invalid_timestamp"],
      [`t=${VECTOR_TIMESTAMP},v0=AAA`, "invalid_base64"],
      [`t=${VECTOR_TIMESTAMP},v0=AB==`, "invalid_base64"],
    ];

    for (const [header, expectedCode] of invalidInputs) {
      const error = await failureOf(verify(VECTOR_RAW_BODY, header));
      expect(error.code).toBe(expectedCode);
    }
  });

  test("rejects malformed public keys without exposing cryptographic details", async () => {
    const error = await failureOf(verify(VECTOR_RAW_BODY, VECTOR_SIGNATURE_HEADER, "not a PEM key"));
    expect(error.code).toBe("invalid_public_key");
    expect(error.message).not.toContain("not a PEM key");
  });

  test("verifies before JSON and schema decoding, while preserving unknown categories", async () => {
    let decodeCalls = 0;
    const eventSchema = Schema.Struct({
      api_version: Schema.String,
      event_id: Schema.String,
      event_category: Schema.String,
      event_type: Schema.String,
      event_object_id: Schema.String,
      event_object: Schema.Struct({
        id: Schema.String,
        amount: Schema.String,
      }),
      event_object_changes: Schema.Unknown,
      event_created_at: Schema.String,
    });
    const decode = (input: unknown) => {
      decodeCalls += 1;
      return Schema.decodeUnknownEffect(eventSchema)(input);
    };

    const event = await runAt(verifyAndDecodeWebhookEvent({
      rawBody: VECTOR_RAW_BODY,
      signatureHeader: VECTOR_SIGNATURE_HEADER,
      publicKey: VECTOR_PUBLIC_KEY_PEM,
      decode,
    }));

    expect(decodeCalls).toBe(1);
    expect(event.event_category).toBe("future.category");
    expect(isKnownWebhookEventCategory(event.event_category)).toBe(false);
    expect(BRIDGE_WEBHOOK_EVENT_CATEGORIES).toContain("transfer");

    const tamperedBody = VECTOR_RAW_BODY.slice();
    tamperedBody[0] = tamperedBody[0]! ^ 1;
    const failed = await runAt(Effect.flip(verifyAndDecodeWebhookEvent({
      rawBody: tamperedBody,
      signatureHeader: VECTOR_SIGNATURE_HEADER,
      publicKey: VECTOR_PUBLIC_KEY_PEM,
      decode,
    })));
    expect(failed).toMatchObject({ _tag: "WebhookError", code: "invalid_signature" });
    expect(decodeCalls).toBe(1);
  });

  test("decodes the authenticated snapshot when a Buffer subarray changes during RSA verification", async () => {
    const { rawBody, mutateAmount } = bufferSubarrayForVector();
    const subtle = globalThis.crypto.subtle;
    const originalVerify = subtle.verify.bind(subtle);
    const originalDescriptor = Object.getOwnPropertyDescriptor(subtle, "verify");
    let mutatedDuringVerify = false;
    const verifyWithMutation: SubtleCrypto["verify"] = async (algorithm, key, signature, data) => {
      mutateAmount();
      mutatedDuringVerify = true;
      return originalVerify(algorithm, key, signature, data);
    };

    subtle.verify = verifyWithMutation;
    try {
      const event = await runAt(verifyAndDecodeWebhookEvent({
        rawBody,
        signatureHeader: VECTOR_SIGNATURE_HEADER,
        publicKey: VECTOR_PUBLIC_KEY_PEM,
        decode: Schema.decodeUnknownEffect(Schema.Struct({
          event_object: Schema.Struct({ amount: Schema.String }),
        })),
      }));

      expect(mutatedDuringVerify).toBe(true);
      expect(rawBody.toString("utf8")).toContain('"amount":"9.99"');
      expect(event.event_object.amount).toBe("1.00");
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(subtle, "verify", originalDescriptor);
      } else {
        Reflect.deleteProperty(subtle, "verify");
      }
    }
  });

  test("rejects validly signed malformed UTF-8 JSON before invoking the schema decoder", async () => {
    let decodeCalls = 0;
    const decoder = (input: unknown) => {
      decodeCalls += 1;
      return Effect.succeed(input);
    };
    const error = await runAt(Effect.flip(verifyAndDecodeWebhookEvent({
      rawBody: INVALID_JSON_RAW_BODY,
      signatureHeader: INVALID_JSON_SIGNATURE_HEADER,
      publicKey: VECTOR_PUBLIC_KEY_PEM,
      decode: decoder,
    })));

    expect(error).toMatchObject({ _tag: "WebhookError", code: "invalid_json" });
    expect(decodeCalls).toBe(0);
  });
});
