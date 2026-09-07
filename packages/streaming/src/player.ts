// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Browser playback of a `miso-hls/v1` transcode served out of a Walrus Quilt.
 *
 * hls.js drives the element through MediaSource wherever MSE can take AAC in
 * fMP4; only browsers without usable MSE get the playlist URL straight in
 * `src`. iOS Safari deliberately takes native HLS. hls.js is loaded lazily so
 * the engine ships only when playback needs it, and it is an optional peer:
 * a page that never opens a stream never pays for it.
 */

// The light build has the same class shape; its own types are not resolvable
// under bundler resolution, so type against the main entry.
import type HlsType from "hls.js";
import type { HlsConfig, LoadPolicy, LoaderConfig, RetryConfig } from "hls.js";
import { MASTER_PLAYLIST, quiltItemUrl, startLevelIndex } from "./index.ts";
import { warmTrack, type WarmOptions } from "./warm.ts";

type HlsConstructor = typeof HlsType;
type HlsModule = { default: HlsConstructor };

/** A `LoadPolicy` override good enough to merge: `default`, and inside it
 *  `timeoutRetry`/`errorRetry`, may each be partial — {@link mergeHlsConfig}
 *  fills in whatever a caller omits from the merge base. `null` for a retry
 *  sub-object means "no retry," not "unspecified," and replaces it whole. */
export type PartialLoadPolicy = {
  default?: Partial<Omit<LoaderConfig, "timeoutRetry" | "errorRetry">> & {
    timeoutRetry?: Partial<RetryConfig> | null;
    errorRetry?: Partial<RetryConfig> | null;
  };
};

/** The load policies {@link HLS_COLD_ORIGIN_DEFAULTS} provides a complete base for. */
export type DefaultedLoadPolicyKey = "fragLoadPolicy" | "playlistLoadPolicy";

/**
 * hls.js config overrides. Only the load policies the defaults provide a base
 * for accept partial objects (merged per leaf); every other `*LoadPolicy` must
 * be complete, because hls.js itself merges config shallowly and a partial
 * policy would reach it with `maxNumRetry` undefined.
 */
export type HlsConfigOverrides = Partial<Omit<HlsConfig, DefaultedLoadPolicyKey>> &
  Partial<Record<DefaultedLoadPolicyKey, PartialLoadPolicy>>;

/**
 * Defaults tuned for playback off a Walrus aggregator origin: the first play
 * is a cold master playlist, rendition playlist, init segment, and first
 * media segment — each costing ~2.7 s (2.2 s time-to-first-byte), vs. ~0.1 s
 * warm. Every field not called out below is hls.js's own default, restated
 * so the object is complete; see `node_modules/hls.js/dist/hls.d.ts` for
 * `LoadPolicy`'s shape.
 */
export const HLS_COLD_ORIGIN_DEFAULTS: Partial<HlsConfig> = {
  // Start on the rendition a warm (see `warmTrack`) actually primes, rather
  // than hls.js's own bitrate-guessing first level.
  startLevel: startLevelIndex(),
  // Buffer margin for Walrus tail latency, without prefetching half a track.
  maxBufferLength: 60,
  fragLoadPolicy: {
    default: {
      // The only deliberate change from hls.js's default (10_000 ms): a cold
      // origin's ~2.2 s TTFB can spike under load, and 10 s cuts it close.
      maxTimeToFirstByteMs: 20_000,
      maxLoadTimeMs: 120_000,
      timeoutRetry: { maxNumRetry: 4, retryDelayMs: 0, maxRetryDelayMs: 0 },
      errorRetry: { maxNumRetry: 6, retryDelayMs: 1_000, maxRetryDelayMs: 8_000 },
    },
  },
  // The master and rendition playlists are cold too, on the very first
  // request a player makes. Same TTFB bump as fragLoadPolicy; the rest is
  // hls.js's own playlistLoadPolicy default, restated.
  playlistLoadPolicy: {
    default: {
      maxTimeToFirstByteMs: 20_000,
      maxLoadTimeMs: 20_000,
      timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 },
      errorRetry: { maxNumRetry: 2, retryDelayMs: 1_000, maxRetryDelayMs: 8_000 },
    },
  },
  // manifestLoadPolicy is deliberately left at hls.js's default: its
  // maxTimeToFirstByteMs is already Infinity.
};

type PartialRetryConfig = Partial<RetryConfig> | null;
type PartialLoaderConfig = NonNullable<PartialLoadPolicy["default"]>;

function mergeRetryConfig(base: RetryConfig | null | undefined, override: PartialRetryConfig | undefined) {
  if (override === undefined) return base;
  if (override === null || base == null) return override;
  return { ...base, ...override };
}

function mergeLoaderConfig(base: LoaderConfig | undefined, override: PartialLoaderConfig | undefined) {
  if (override === undefined) return base;
  if (base === undefined) return override;
  return {
    ...base,
    ...override,
    timeoutRetry: mergeRetryConfig(base.timeoutRetry, override.timeoutRetry),
    errorRetry: mergeRetryConfig(base.errorRetry, override.errorRetry),
  };
}

function mergeLoadPolicy(base: LoadPolicy | undefined, override: PartialLoadPolicy | undefined) {
  if (override === undefined) return base;
  if (base === undefined) return override;
  return { ...base, ...override, default: mergeLoaderConfig(base.default, override.default) };
}

/**
 * Merge hls.js config `overrides` over `defaults`. Every key is a shallow
 * override except one ending in `LoadPolicy` (`fragLoadPolicy`,
 * `playlistLoadPolicy`, `manifestLoadPolicy`, `steeringManifestLoadPolicy`,
 * …): there, `default` is merged one level deeper, and inside it
 * `timeoutRetry`/`errorRetry` one level deeper still — so a caller can
 * override e.g. just `fragLoadPolicy.default.maxTimeToFirstByteMs` without
 * losing the retry sub-objects. The caller's value always wins at the leaf;
 * `null` for a retry sub-object is a whole replacement ("no retry"), not a
 * partial one. Every other key, including a whole unrelated `*LoadPolicy`
 * one the caller never mentions, passes through untouched.
 */
export function mergeHlsConfig(defaults: Partial<HlsConfig>, overrides: HlsConfigOverrides): Partial<HlsConfig> {
  const merged: Record<string, unknown> = { ...defaults };
  const defaultsRecord = defaults as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    merged[key] = key.endsWith("LoadPolicy")
      ? mergeLoadPolicy(defaultsRecord[key] as LoadPolicy | undefined, value as PartialLoadPolicy)
      : value;
  }
  return merged as Partial<HlsConfig>;
}

export interface AudioStream {
  /** Begin playback. Safe immediately after `open`: on the hls.js path the
   *  intent is remembered and play fires right after the engine attaches. */
  play(): void;
  /** Tear down the source and any hls.js instance. The element is the caller's. */
  destroy(): void;
}

export interface HlsPlayerOptions {
  /** Origin that serves Quilt items: a CDN in front of a Walrus aggregator. */
  readonly baseUrl: string;
  /** How to load hls.js. Defaults to a dynamic import of `hls.js/light`. */
  readonly loadHls?: () => Promise<HlsModule>;
  /** Whether MediaSource can take AAC fMP4 here. Defaults to a live probe. */
  readonly mseUsable?: () => boolean;
  /** hls.js config, merged over {@link HLS_COLD_ORIGIN_DEFAULTS}. Ignored on
   *  the native/no-MSE path. */
  readonly hlsConfig?: HlsConfigOverrides;
}

const MSE_TYPE = 'audio/mp4; codecs="mp4a.40.2"';

function defaultMseUsable(): boolean {
  return typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(MSE_TYPE);
}

function canPlayNatively(audio: HTMLAudioElement): boolean {
  return audio.canPlayType("application/vnd.apple.mpegurl") !== "";
}

/** One player per delivery origin; open as many streams as you like from it. */
export class HlsPlayer {
  readonly #baseUrl: string;
  readonly #loadHls: () => Promise<HlsModule>;
  readonly #mseUsable: () => boolean;
  readonly #hlsConfig: HlsConfigOverrides;
  #hlsModule: Promise<HlsModule> | null = null;

  constructor(options: HlsPlayerOptions) {
    this.#baseUrl = options.baseUrl;
    this.#loadHls =
      options.loadHls ?? (() => import("hls.js/light") as unknown as Promise<HlsModule>);
    this.#mseUsable = options.mseUsable ?? defaultMseUsable;
    this.#hlsConfig = options.hlsConfig ?? {};
  }

  /** The track's HLS entry point: its master playlist inside the Quilt. */
  masterPlaylistUrl(quiltId: string): string {
    return quiltItemUrl(this.#baseUrl, quiltId, MASTER_PLAYLIST);
  }

  /**
   * Prime the browser cache and delivery edge for a track's first moments,
   * ahead of `open`. Delegates to `warmTrack`; see `@misofm/streaming/warm`.
   */
  warm(quiltId: string, options?: WarmOptions): Promise<void> {
    return warmTrack(this.#baseUrl, quiltId, options);
  }

  /** Warm the hls.js chunk on browsers that will use it. SSR-safe no-op. */
  preload(): void {
    if (typeof document === "undefined") return;
    if (this.#mseUsable()) void this.#engine();
  }

  /**
   * Point the element at a track's stream. The native path is synchronous,
   * keeping `play()` inside the user gesture on iOS; the MSE path attaches as
   * soon as hls.js resolves. A fatal hls.js error or a rejected native play
   * reports through `onError` so the caller can reset instead of showing a
   * dead stream as playing.
   */
  open(audio: HTMLAudioElement, quiltId: string, onError?: () => void): AudioStream {
    const url = this.masterPlaylistUrl(quiltId);
    // The native path fetches the playlist and segments through the element,
    // a no-cors request that COEP: require-corp blocks. Asking for CORS keeps
    // isolation intact; it is harmless on the hls.js path.
    audio.crossOrigin = "anonymous";
    if (!this.#mseUsable()) {
      if (canPlayNatively(audio)) audio.src = url;
      return {
        play: () => void audio.play().catch(() => onError?.()),
        destroy: () => {},
      };
    }

    let destroyed = false;
    let wantPlay = false;
    let hls: HlsType | null = null;
    void this.#engine().then(({ default: Hls }) => {
      if (destroyed) return;
      if (!Hls.isSupported()) {
        if (canPlayNatively(audio)) {
          audio.src = url;
          if (wantPlay) void audio.play().catch(() => {});
        }
        return;
      }
      hls = new Hls(mergeHlsConfig(HLS_COLD_ORIGIN_DEFAULTS, this.#hlsConfig) as HlsConfig);
      hls.on(Hls.Events.ERROR, (_event: unknown, data: { fatal: boolean }) => {
        if (data.fatal) {
          hls?.destroy();
          hls = null;
          onError?.();
        }
      });
      hls.loadSource(url);
      hls.attachMedia(audio);
      if (wantPlay) void audio.play().catch(() => {});
    });
    return {
      play: () => {
        wantPlay = true;
        if (hls) void audio.play().catch(() => {});
      },
      destroy: () => {
        destroyed = true;
        hls?.destroy();
        hls = null;
      },
    };
  }

  #engine(): Promise<HlsModule> {
    return (this.#hlsModule ??= this.#loadHls());
  }
}
