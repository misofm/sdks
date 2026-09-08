// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The error vocabulary for `@misofm/streaming`. Each failure a caller might
// need to act on is a `Schema.TaggedError`, carrying the fields needed to
// act; a foreign failure (a rejected fetch, a fatal hls.js error) is wrapped
// with `cause: Schema.Defect()` so the original error is preserved but not
// part of the typed contract. A caller cancelling a warm interrupts the
// fiber instead of observing a typed error — see `@misofm/streaming/warm`.

import { Schema } from "effect";

/**
 * A network-level failure (offline, CORS failure, DNS) warming one item.
 * `warmTrack` catches this per item and tolerates it: one item's `WarmError`
 * never fails the whole warm, so this type surfaces only inside `warm.ts`'s
 * own per-item pipeline today. It is exported so a caller composing its own
 * warm logic on top of `@misofm/streaming`'s primitives can name the same
 * failure.
 */
export class WarmError extends Schema.TaggedError<WarmError>()("WarmError", {
  /** The item URL the failing fetch was issued against. */
  url: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A browser playback failure `HlsPlayer` cannot recover from on its own:
 * hls.js failed to load (`"engine-load"`), the native/no-MSE path's
 * `audio.play()` rejected (`"media"`), or hls.js reported a fatal error
 * (`"fatal"`). Reported the same way `HlsPlayer#open`'s `onError` callback
 * always has: this type documents the shape a caller can build their own
 * reporting on, it does not change `open`'s signature.
 */
export class PlayerError extends Schema.TaggedError<PlayerError>()("PlayerError", {
  reason: Schema.Literals(["engine-load", "media", "fatal"]),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}
