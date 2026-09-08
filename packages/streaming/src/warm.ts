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
import {
  MAX_SEGMENTS_PER_RENDITION,
  START_RENDITION,
  quiltItemUrl,
  warmIdentifiers,
  type RenditionId,
} from "./index.ts";
import { WarmError } from "./errors.ts";

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
  /** Fetch implementation to use. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Fetch one item and drain its body to completion so the cache keeps it,
 * regardless of status: a warm must never fail for a missing item (a
 * non-2xx response), only for a network-level failure (offline, CORS
 * failure, DNS), which becomes a {@link WarmError}. `signal` is the fiber's
 * own interruption signal, wired in by `Effect.tryPromise`: interrupting the
 * fiber this runs on aborts the in-flight fetch.
 */
function warmItem(doFetch: typeof fetch, url: string): Effect.Effect<void, WarmError> {
  return Effect.tryPromise({
    try: (signal) =>
      doFetch(url, { mode: "cors", credentials: "omit", signal }).then((response) => response.arrayBuffer()),
    catch: (cause) => new WarmError({ url, cause }),
  }).pipe(Effect.asVoid);
}

/**
 * Prime the browser cache and the delivery edge for a track's first
 * moments: fetches the master playlist, `options.rendition`'s playlist, its
 * init segment, and its first `options.segments` media segments,
 * concurrently, in `cors`/`omit` mode, reading every body to completion so
 * the cache keeps them.
 *
 * A missing item (a non-2xx response) is not an error: this effect never
 * fails for that. A network-level failure fetching one item (offline, CORS
 * failure, DNS) is tolerated the same way — it must not sink its siblings'
 * warming — so it is caught per item and never surfaces here; see
 * {@link WarmError}. Interrupt the fiber this runs on (`Fiber.interrupt`,
 * or a `Scope`/`Effect.timeout` closing) to cancel every in-flight fetch;
 * there is no separate cancellation error to catch.
 */
export function warmTrack(baseUrl: string, quiltId: string, options: WarmOptions = {}): Effect.Effect<void> {
  return Effect.suspend(() => {
    const segments = options.segments ?? DEFAULT_WARM_SEGMENTS;
    const rendition = options.rendition ?? START_RENDITION;
    const doFetch = options.fetch ?? fetch;
    const identifiers = warmIdentifiers(segments, rendition);

    return Effect.forEach(
      identifiers,
      (identifier) => warmItem(doFetch, quiltItemUrl(baseUrl, quiltId, identifier)).pipe(Effect.catch(() => Effect.void)),
      { concurrency: "unbounded", discard: true },
    );
  });
}
