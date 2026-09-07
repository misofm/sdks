// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Browser playback of a `miso-hls/1` transcode served out of a Walrus Quilt.
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
import { MASTER_PLAYLIST, quiltItemUrl } from "./index.ts";

type HlsConstructor = typeof HlsType;
type HlsModule = { default: HlsConstructor };

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
  #hlsModule: Promise<HlsModule> | null = null;

  constructor(options: HlsPlayerOptions) {
    this.#baseUrl = options.baseUrl;
    this.#loadHls =
      options.loadHls ?? (() => import("hls.js/light") as unknown as Promise<HlsModule>);
    this.#mseUsable = options.mseUsable ?? defaultMseUsable;
  }

  /** The track's HLS entry point: its master playlist inside the Quilt. */
  masterPlaylistUrl(quiltId: string): string {
    return quiltItemUrl(this.#baseUrl, quiltId, MASTER_PLAYLIST);
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
      hls = new Hls();
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
