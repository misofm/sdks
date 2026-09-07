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
export async function warmTrack(baseUrl: string, quiltId: string, options: WarmOptions = {}): Promise<void> {
  const segments = options.segments ?? DEFAULT_WARM_SEGMENTS;
  const rendition = options.rendition ?? START_RENDITION;
  const doFetch = options.fetch ?? fetch;
  const identifiers = warmIdentifiers(segments, rendition);

  await Promise.all(
    identifiers.map(async (identifier) => {
      const url = quiltItemUrl(baseUrl, quiltId, identifier);
      const response = await doFetch(url, { mode: "cors", credentials: "omit", signal: options.signal });
      // Drain the body regardless of status: a warm must never throw for a
      // missing item, and even an error response's body must be fully read
      // for the browser to keep the cache entry.
      await response.arrayBuffer();
    }),
  );
}
