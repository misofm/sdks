// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Fixed RSA/SHA-256 vector generated independently with OpenSSL 3.0.13. The
 * command hashes `${timestamp}.${rawBody}` once, then applies SHA-256 again as
 * the message hash used by RSASSA-PKCS1-v1_5, matching Bridge's documented
 * double-hash verification behavior. The ephemeral signing key was not kept.
 */
export const VECTOR_TIMESTAMP = 1_790_164_800_000;

export const VECTOR_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4l2axQeHdGUkGj7d7Gwo
o1yH6gaN045ZrDRA4uNQ8IyVWeZm7E/ewLDlC9eKgwA8e65ydhEsFN6WZq+Bcg/x
SiYvZGHILGWSWWunF0NS93b6HYtxN4+ksEMWp73ygdulENUDyinqreVbmggvOE8R
xu50eKz1xi8qxLtAJ4vHcY+UNCeC2Pzp0ee6H4MDyM33NjM04VqPJPJG1rvHE9qc
4qkJ5sIqZwGWy62IrA+rCezVCeoy+3F35JUGwtJ1gz/MnAWY9MDRgeA6j1FQV+53
9Ln56lIqBbGb3XZ3otKpUDer1KYBlvUjCkuKi8S903Q6Q3/XMGWkjGB9CVzm4/OE
NQIDAQAB
-----END PUBLIC KEY-----`;

/** Exact compact UTF-8 JSON bytes covered by `VECTOR_SIGNATURE_HEADER`. */
export const VECTOR_RAW_BODY = new TextEncoder().encode(
  '{"api_version":"v0","event_id":"wh_vector_01","event_category":"future.category","event_type":"future.action","event_object_id":"obj_01","event_object":{"id":"obj_01","amount":"1.00"},"event_object_changes":{},"event_created_at":"2026-09-23T12:00:00.000Z"}',
);

export const VECTOR_SIGNATURE_HEADER =
  "t=1790164800000,v0=f05VS1XsuXo58+egI8TvaX3rkMVXYw/R3HTsCtp2N67/948K80u1uatt65q5sS40tExwpR07BraZKexdu8j3gCJ+5KTW4HfjM20+xDdtP8RM3CyDOOevVtVbtBCymLpOC+Z5Xk7jl+zjZX6XIYXxTCkflG3j5Tx3QPEK14LVtMHHz1jMveNz3UOcK+Vikq6KMuGS4z8jcsrx8Y5cNwHFGKp8oqkIBEgiMyq2Xdf2UoU4TMXm9HKLXjq+SPxOkPu6AKbuCgHl93sOqJWPl2dIoMSoAjxsWIwRIJA0PprQYN21a6717YMx7w8YNMgmKyl9i/NKymHfAWBFoqPjxatDrw==";

/** A second independently signed body proves signature-before-JSON ordering. */
export const INVALID_JSON_RAW_BODY = new TextEncoder().encode("not-json");
export const INVALID_JSON_SIGNATURE_HEADER =
  "t=1790164800000,v0=jv54upM4TaTn5IJdjWStDL9bsPGARVi+IP3yrdabZc/qwRCF7qzdWxRwi5X/fyiLQBOTgqPAMrFSryGyksxJ088CgvAXXLV7voTmBvEXnOcavpqwRfwjv4rcgpohzeRJIAhXskomWv3mUjC0qUYatn0BMaa1v/Vhl+j6r5y3zU5feywWS1+8A/7XI5BKKD+YDtv+e3SteR+9LfdM+n656uuaUsJDhPSHNFMBAu871Rd99yRn54ELe9XOfDKU2o2e4M982EueVYsCSh+2RQNgcEEfI9X0TAY+1N9f2a44wLwXX2KnufMISts/dOYku2emyqJycpeZpx8iHxFQm4/IOw==";
