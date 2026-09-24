// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Clock, Data, Effect } from "effect";

/** Bridge's signature header name. */
export const BRIDGE_WEBHOOK_SIGNATURE_HEADER = "X-Webhook-Signature";

/** Bridge recommends rejecting webhook deliveries older than ten minutes. */
export const WEBHOOK_MAX_AGE_MILLISECONDS = 10 * 60 * 1_000;

/** By default, a signature timestamp may not be ahead of the active Effect Clock. */
export const WEBHOOK_MAX_FUTURE_SKEW_MILLISECONDS = 0;

/** Event categories currently listed in Bridge's event structure guide. */
export const BRIDGE_WEBHOOK_EVENT_CATEGORIES = [
  "customer",
  "kyc_link",
  "liquidation_address.drain",
  "static_memo.activity",
  "transfer",
  "virtual_account.activity",
  "bridge_wallet.activity",
  "card_account",
  "card_transaction",
  "posted_card_account_transaction",
  "card_withdrawal",
  // Preserve the spelling in Bridge's event structure guide.
  "external_acccount",
  "rfi",
] as const;

export type KnownWebhookEventCategory = (typeof BRIDGE_WEBHOOK_EVENT_CATEGORIES)[number];

/**
 * A known category, or any future category Bridge may add. Callers should
 * preserve and deliberately handle unknown strings instead of rejecting them.
 */
export type WebhookEventCategory = KnownWebhookEventCategory | (string & {});

/**
 * The stable envelope documented by Bridge. Event type is deliberately a
 * string: Bridge's examples use both qualified and unqualified values.
 */
export interface WebhookEventEnvelope<EventObject = unknown> {
  readonly api_version: string;
  readonly event_id: string;
  readonly event_category: WebhookEventCategory;
  readonly event_type: string;
  readonly event_object_id?: string;
  readonly event_object_status?: string;
  readonly event_object: EventObject;
  readonly event_object_changes?: unknown;
  readonly event_created_at: string;
}

export function isKnownWebhookEventCategory(value: string): value is KnownWebhookEventCategory {
  return (BRIDGE_WEBHOOK_EVENT_CATEGORIES as readonly string[]).includes(value);
}

export type WebhookErrorCode =
  | "invalid_signature_header"
  | "invalid_timestamp"
  | "timestamp_expired"
  | "timestamp_in_future"
  | "invalid_base64"
  | "invalid_public_key"
  | "invalid_signature"
  | "web_crypto_unavailable"
  | "crypto_operation_failed"
  | "invalid_json";

/** Safe, structured webhook validation failure. It never includes payloads or keys. */
export class WebhookError extends Data.TaggedError("WebhookError")<{
  readonly code: WebhookErrorCode;
}> {
  override get message(): string {
    switch (this.code) {
      case "invalid_signature_header":
        return "Bridge webhook signature header is malformed.";
      case "invalid_timestamp":
        return "Bridge webhook timestamp is invalid.";
      case "timestamp_expired":
        return "Bridge webhook timestamp is outside the allowed age.";
      case "timestamp_in_future":
        return "Bridge webhook timestamp is too far in the future.";
      case "invalid_base64":
        return "Bridge webhook signature is not canonical base64.";
      case "invalid_public_key":
        return "Bridge webhook public key is invalid.";
      case "invalid_signature":
        return "Bridge webhook signature does not match the raw body.";
      case "web_crypto_unavailable":
        return "This runtime does not provide Web Crypto SubtleCrypto.";
      case "crypto_operation_failed":
        return "Bridge webhook cryptographic verification failed.";
      case "invalid_json":
        return "Verified Bridge webhook body is not valid UTF-8 JSON.";
    }
  }
}

export type WebhookPublicKey = string | CryptoKey;

export interface VerifyWebhookSignatureOptions {
  /** The exact request body bytes before any text or JSON decoding. */
  readonly rawBody: Uint8Array;
  readonly signatureHeader: string;
  /** PEM SubjectPublicKeyInfo, or a Web Crypto RSA-SHA256 public CryptoKey. */
  readonly publicKey: WebhookPublicKey;
  /** Defaults to Bridge's recommended ten minutes. */
  readonly maxAgeMilliseconds?: number;
  /** Defaults to zero; set explicitly only for a known clock-skew policy. */
  readonly maxFutureSkewMilliseconds?: number;
}

export interface VerifyAndDecodeWebhookEventOptions<Event, DecodeError, Requirements> extends
  VerifyWebhookSignatureOptions
{
  /**
   * A schema decoder such as `Schema.decodeUnknownEffect(BridgeWebhookEvent)`.
   * It runs only after the signature over `rawBody` has passed verification.
   */
  readonly decode: (input: unknown) => Effect.Effect<Event, DecodeError, Requirements>;
}

interface ParsedSignature {
  readonly timestampText: string;
  readonly timestampMilliseconds: number;
  readonly signature: Uint8Array;
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SIGNATURE_HEADER_PATTERN = /^t=([^,]+),v0=([^,]*)$/;
const PEM_PUBLIC_KEY_PATTERN = /^-----BEGIN PUBLIC KEY-----[\t\r\n ]*([A-Za-z0-9+/=\t\r\n ]+)[\t\r\n ]*-----END PUBLIC KEY-----$/;

function encodeBase64(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    output += BASE64_ALPHABET[first >>> 2];
    output += BASE64_ALPHABET[((first & 0b00000011) << 4) | ((second ?? 0) >>> 4)];
    output += second === undefined
      ? "=="
      : third === undefined
        ? `${BASE64_ALPHABET[(second & 0b00001111) << 2]}=`
        : `${BASE64_ALPHABET[((second & 0b00001111) << 2) | (third >>> 6)]}${BASE64_ALPHABET[third & 0b00111111]}`;
  }
  return output;
}

function decodeBase64Strict(value: string): Uint8Array | undefined {
  if (value.length === 0 || value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) return undefined;

  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const output = new Uint8Array((value.length / 4) * 3 - padding);
  let outputIndex = 0;

  for (let index = 0; index < value.length; index += 4) {
    const first = BASE64_ALPHABET.indexOf(value[index]!);
    const second = BASE64_ALPHABET.indexOf(value[index + 1]!);
    const thirdChar = value[index + 2]!;
    const fourthChar = value[index + 3]!;
    const third = thirdChar === "=" ? 0 : BASE64_ALPHABET.indexOf(thirdChar);
    const fourth = fourthChar === "=" ? 0 : BASE64_ALPHABET.indexOf(fourthChar);

    output[outputIndex++] = (first << 2) | (second >>> 4);
    if (thirdChar !== "=") output[outputIndex++] = ((second & 0b00001111) << 4) | (third >>> 2);
    if (fourthChar !== "=") output[outputIndex++] = ((third & 0b00000011) << 6) | fourth;
  }

  // Re-encoding also rejects nonzero unused padding bits.
  return encodeBase64(output) === value ? output : undefined;
}

function parseSignatureHeader(header: string): ParsedSignature | WebhookError {
  const match = SIGNATURE_HEADER_PATTERN.exec(header);
  if (!match) return new WebhookError({ code: "invalid_signature_header" });

  const timestampText = match[1]!;
  if (!/^(?:0|[1-9][0-9]*)$/.test(timestampText)) {
    return new WebhookError({ code: "invalid_timestamp" });
  }
  const timestampMilliseconds = Number(timestampText);
  if (!Number.isSafeInteger(timestampMilliseconds)) {
    return new WebhookError({ code: "invalid_timestamp" });
  }

  const signature = decodeBase64Strict(match[2]!);
  if (!signature) return new WebhookError({ code: "invalid_base64" });

  return { timestampText, timestampMilliseconds, signature };
}

function pemToSpki(publicKey: string): Uint8Array | undefined {
  const match = PEM_PUBLIC_KEY_PATTERN.exec(publicKey.trim());
  if (!match) return undefined;
  return decodeBase64Strict(match[1]!.replace(/[\t\r\n ]/g, ""));
}

function isWebhookError(value: ParsedSignature | WebhookError): value is WebhookError {
  return value instanceof WebhookError;
}

function validWindow(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isCompatibleCryptoKey(key: CryptoKey): boolean {
  const algorithm = key.algorithm as CryptoKey["algorithm"] & {
    readonly hash?: { readonly name?: unknown };
  };
  return key.type === "public" &&
    key.algorithm.name === "RSASSA-PKCS1-v1_5" &&
    algorithm.hash?.name === "SHA-256" &&
    key.usages.includes("verify");
}

/**
 * Verify the Bridge webhook header against the byte-exact request body.
 * Bridge hashes `timestamp + "." + rawBody`, then uses RSA PKCS#1 v1.5 with
 * SHA-256 to verify that digest. Web Crypto hashes its verification input, so
 * passing the first digest intentionally reproduces Bridge's published
 * double-hash behavior.
 */
export const verifyWebhookSignature = Effect.fn("Bridge.Webhooks.verifySignature")(
  function* (
    options: VerifyWebhookSignatureOptions,
  ): Effect.fn.Return<void, WebhookError> {
    const rawBody = new Uint8Array(options.rawBody);
    const parsed = parseSignatureHeader(options.signatureHeader);
    if (isWebhookError(parsed)) return yield* parsed;

    const maxAgeMilliseconds = options.maxAgeMilliseconds ?? WEBHOOK_MAX_AGE_MILLISECONDS;
    const maxFutureSkewMilliseconds = options.maxFutureSkewMilliseconds ?? WEBHOOK_MAX_FUTURE_SKEW_MILLISECONDS;
    if (!validWindow(maxAgeMilliseconds) || !validWindow(maxFutureSkewMilliseconds)) {
      return yield* new WebhookError({ code: "invalid_timestamp" });
    }

    const now = yield* Clock.currentTimeMillis;
    if (parsed.timestampMilliseconds < now - maxAgeMilliseconds) {
      return yield* new WebhookError({ code: "timestamp_expired" });
    }
    if (parsed.timestampMilliseconds > now + maxFutureSkewMilliseconds) {
      return yield* new WebhookError({ code: "timestamp_in_future" });
    }

    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return yield* new WebhookError({ code: "web_crypto_unavailable" });

    let publicKey: CryptoKey;
    if (typeof options.publicKey === "string") {
      const spki = pemToSpki(options.publicKey);
      if (!spki) return yield* new WebhookError({ code: "invalid_public_key" });
      const spkiBuffer = new ArrayBuffer(spki.length);
      new Uint8Array(spkiBuffer).set(spki);
      publicKey = yield* Effect.tryPromise({
        try: () => subtle.importKey(
          "spki",
          spkiBuffer,
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
          false,
          ["verify"],
        ),
        catch: () => new WebhookError({ code: "invalid_public_key" }),
      });
    } else {
      if (!isCompatibleCryptoKey(options.publicKey)) {
        return yield* new WebhookError({ code: "invalid_public_key" });
      }
      publicKey = options.publicKey;
    }

    const timestampBytes = new TextEncoder().encode(parsed.timestampText);
    const signedBytes = new Uint8Array(timestampBytes.length + 1 + rawBody.length);
    signedBytes.set(timestampBytes, 0);
    signedBytes[timestampBytes.length] = 0x2e;
    signedBytes.set(rawBody, timestampBytes.length + 1);

    const digest = yield* Effect.tryPromise({
      try: () => subtle.digest("SHA-256", signedBytes),
      catch: () => new WebhookError({ code: "crypto_operation_failed" }),
    });
    const signatureBuffer = new ArrayBuffer(parsed.signature.length);
    new Uint8Array(signatureBuffer).set(parsed.signature);
    const verified = yield* Effect.tryPromise({
      try: () => subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signatureBuffer, digest),
      catch: () => new WebhookError({ code: "crypto_operation_failed" }),
    });
    if (!verified) return yield* new WebhookError({ code: "invalid_signature" });
  },
);

/**
 * Verify first, then decode the authenticated JSON through a caller-supplied
 * Effect Schema decoder. The raw-body snapshot is used for both verification
 * and JSON parsing, so later caller mutations cannot change the decoded event.
 */
export function verifyAndDecodeWebhookEvent<Event, DecodeError = never, Requirements = never>(
  options: VerifyAndDecodeWebhookEventOptions<Event, DecodeError, Requirements>,
): Effect.Effect<Event, WebhookError | DecodeError, Requirements> {
  const rawBody = new Uint8Array(options.rawBody);
  return Effect.gen(function* () {
    yield* verifyWebhookSignature({ ...options, rawBody });
    const input = yield* Effect.try({
      try: () => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody)) as unknown,
      catch: () => new WebhookError({ code: "invalid_json" }),
    });
    return yield* options.decode(input);
  });
}
