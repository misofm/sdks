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
import type { HlsConfig } from "hls.js";
import { Effect, Fiber } from "effect";
import { tryPromise, trySync } from "@misofm/utils/effect";
import { MASTER_PLAYLIST, quiltItemUrl, startLevelIndex } from "./index.ts";
import { warmTrack, type WarmOptions } from "./warm.ts";

type HlsConstructor = typeof HlsType;
type HlsModule = { default: HlsConstructor };
const audioOwners = new WeakMap<HTMLAudioElement, AudioStream>();

/**
 * Defaults tuned for playback off a Walrus aggregator origin: a cold segment
 * costs ~2.7 s (2.2 s time-to-first-byte), a warm one ~0.1 s. Every field not
 * called out below is hls.js's own default, restated so the object is
 * complete; see `node_modules/hls.js/dist/hls.d.ts` for `LoadPolicy`'s shape.
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
};

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
  readonly hlsConfig?: Partial<HlsConfig>;
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
  readonly #hlsConfig: Partial<HlsConfig>;
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

  getMasterPlaylistUrl(quiltId: string): string { return this.masterPlaylistUrl(quiltId); }
  warmTrack(quiltId: string, options?: WarmOptions): Promise<void> { return this.warm(quiltId, options); }
  preloadEngine(onError?: () => void): void { this.preload(onError); }
  openStream(audio: HTMLAudioElement, quiltId: string, onError?: () => void): AudioStream {
    return this.open(audio, quiltId, onError);
  }

  /**
   * Prime the browser cache and delivery edge for a track's first moments,
   * ahead of `open`. Delegates to `warmTrack`; see `@misofm/streaming/warm`.
   */
  warm(quiltId: string, options?: WarmOptions): Promise<void> {
    return warmTrack(this.#baseUrl, quiltId, options);
  }

  /** Warm the hls.js chunk on browsers that will use it. SSR-safe no-op. */
  preload(onError?: () => void): void {
    if (typeof document === "undefined") return;
    if (this.#mseUsable()) Effect.runFork(tryPromise("player.preload", () => this.#engine()).pipe(
      Effect.catchCause(() => Effect.sync(() => onError?.())),
    ));
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
    audioOwners.get(audio)?.destroy();
    // The native path fetches the playlist and segments through the element,
    // a no-cors request that COEP: require-corp blocks. Asking for CORS keeps
    // isolation intact; it is harmless on the hls.js path.
    audio.crossOrigin = "anonymous";
    let destroyed = false;
    let wantPlay = false;
    let ready = false;
    let hls: HlsType | null = null;
    let startup: Fiber.Fiber<void> | undefined;
    const report = () => { if (!destroyed) onError?.(); };
    const play = () => {
      if (destroyed) return;
      // Invoke directly: wrapping this in an Effect would lose iOS user activation.
      try { void audio.play().catch(report); } catch { report(); }
    };
    const stream: AudioStream = {
      play: () => {
        if (destroyed) return;
        wantPlay = true;
        if (ready) play();
      },
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        if (startup) Effect.runFork(Fiber.interrupt(startup));
        hls?.destroy();
        hls = null;
        if (audioOwners.get(audio) === stream) {
          audioOwners.delete(audio);
          audio.removeAttribute?.("src");
          audio.load?.();
        }
      },
    };
    audioOwners.set(audio, stream);
    if (!this.#mseUsable()) {
      if (canPlayNatively(audio)) audio.src = url;
      ready = true;
      return stream;
    }
    const engine = () => this.#engine();
    const config = this.#hlsConfig;
    startup = Effect.runFork(Effect.gen(function*() {
      const { default: Hls } = yield* tryPromise("player.loadEngine", engine);
      yield* trySync("player.attach", () => {
        if (destroyed || audioOwners.get(audio) !== stream) return;
        if (!Hls.isSupported()) {
          if (canPlayNatively(audio)) {
            audio.src = url;
            ready = true;
            if (wantPlay) play();
          } else {
            report();
          }
          return;
        }
        hls = new Hls({ ...HLS_COLD_ORIGIN_DEFAULTS, ...config });
        hls.on(Hls.Events.ERROR, (_event: unknown, data: { fatal: boolean }) => {
          if (data.fatal) {
            hls?.destroy();
            hls = null;
            ready = false;
            report();
          }
        });
        hls.loadSource(url);
        hls.attachMedia(audio);
        ready = true;
        if (wantPlay) play();
      });
    }).pipe(Effect.catchCause(() => Effect.sync(() => {
      hls?.destroy();
      hls = null;
      ready = false;
      report();
    }))));
    return stream;
  }

  #engine(): Promise<HlsModule> {
    if (!this.#hlsModule) {
      const pending = this.#loadHls();
      this.#hlsModule = pending;
      void pending.catch(() => {
        if (this.#hlsModule === pending) this.#hlsModule = null;
      });
    }
    return this.#hlsModule;
  }
}
