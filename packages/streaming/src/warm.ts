// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Cache and edge warming for a `miso-hls/v1` track, ahead of playback.
 *
 * A Walrus aggregator fetch behind Cloudflare costs ~2.7 s cold (2.2 s TTFB)
 * and ~0.1 s warm; responses carry `cache-control: public, max-age=86400`
 * and CORS headers that allow reuse across requests. hls.js's XhrLoader
 * issues anonymous CORS requests with no Range header, so a prior
 * `fetch(url, { mode: "cors", credentials: "omit" })` whose body is fully
 * read shares the browser's HTTP cache entry with hls.js's later load: this
 * module does exactly that, for exactly what a player starts on.
 *
 * This is mechanics only — issuing and draining the right requests. When to
 * warm (on hover, on queue, on route) is the app's call.
 */

import { Effect } from "effect";
import { runPromise, tryPromise, trySync, type SdkError } from "@misofm/utils/effect";
import {
  MAX_SEGMENTS_PER_RENDITION,
  START_RENDITION,
  quiltItemUrl,
  warmIdentifiers,
  type RenditionId,
} from "./index.ts";

/** Number of leading media segments a warm fetches by default. */
const DEFAULT_WARM_SEGMENTS = 2;

export interface WarmOptions {
  /** Leading media segments to fetch, in addition to the playlists and init
   *  segment. Must be a non-negative integer at most
   *  {@link MAX_SEGMENTS_PER_RENDITION}. Defaults to 2. */
  segments?: number;
  /** Rendition to warm. Defaults to {@link START_RENDITION}, the rendition a
   *  player actually starts on. */
  rendition?: RenditionId;
  /** Aborts every in-flight request; `warmTrack` rejects with the resulting
   *  `AbortError`. */
  signal?: AbortSignal;
  /** Fetch implementation to use. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Maximum simultaneous fetch-and-drain operations. Defaults to 6. */
  concurrency?: number;
}

/**
 * Prime the browser cache and the delivery edge for a track's first
 * moments: fetches the master playlist, `options.rendition`'s playlist, its
 * init segment, and its first `options.segments` media segments,
 * concurrently, in `cors`/`omit` mode, reading every body to completion so
 * the cache keeps them.
 *
 * A missing item (a non-2xx response) is not an error: a warm must never
 * throw for that. An aborted `signal` does throw, with the fetch
 * implementation's `AbortError`.
 */
export function warmTrack(baseUrl: string, quiltId: string, options: WarmOptions = {}): Promise<void> {
  return runPromise(warmTrackEffect(baseUrl, quiltId, options));
}

/** Composable warming workflow; interruption aborts its fetches and body reads. */
export function warmTrackEffect(baseUrl: string, quiltId: string, options: WarmOptions = {}): Effect.Effect<void, SdkError> {
  return Effect.gen(function*() {
    const concurrency = options.concurrency ?? 6;
    const identifiers = yield* trySync("warmTrack.identifiers", () => {
      if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
        throw new RangeError("warm concurrency must be a positive safe integer");
      }
      return warmIdentifiers(options.segments ?? DEFAULT_WARM_SEGMENTS, options.rendition ?? START_RENDITION);
    });
    yield* Effect.forEach(identifiers, (identifier) => Effect.gen(function*() {
      const url = yield* trySync("warmTrack.url", () => quiltItemUrl(baseUrl, quiltId, identifier));
      // Keep one cancellation signal alive throughout fetch AND body consumption.
      yield* tryPromise("warmTrack.fetchAndDrain", async (interruption) => {
        const signal = options.signal ? AbortSignal.any([options.signal, interruption]) : interruption;
        signal.throwIfAborted();
        const response = await (options.fetch ?? fetch)(url, { mode: "cors", credentials: "omit", signal });
        signal.throwIfAborted();
        // Non-2xx bodies deliberately follow exactly the same draining policy.
        await response.arrayBuffer();
        signal.throwIfAborted();
      });
    }), { concurrency, discard: true });
  });
}
