// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { Effect } from "effect";
import { startLevelIndex } from "../src/index.ts";
import { HLS_COLD_ORIGIN_DEFAULTS, HlsPlayer, acquirePlayer, mergeHlsConfig } from "../src/player.ts";
import type { PlayerError } from "../src/errors.ts";

interface FakeAudio {
  crossOrigin: string | null;
  src: string;
  played: number;
  rejectPlay: boolean;
  removed: boolean;
  loaded: number;
  canPlayType(type: string): string;
  play(): Promise<void>;
  removeAttribute(name: string): void;
  load(): void;
}

function fakeAudio(native: boolean, rejectPlay = false): FakeAudio {
  return {
    crossOrigin: null,
    src: "",
    played: 0,
    rejectPlay,
    removed: false,
    loaded: 0,
    canPlayType: () => (native ? "maybe" : ""),
    play() {
      this.played += 1;
      return this.rejectPlay ? Promise.reject(new Error("blocked")) : Promise.resolve();
    },
    removeAttribute(name: string) {
      if (name === "src") this.removed = true;
    },
    load() {
      this.loaded += 1;
    },
  };
}

class FakeHls {
  static supported = true;
  static instances: FakeHls[] = [];
  static Events = { ERROR: "hlsError" } as const;
  static isSupported() {
    return FakeHls.supported;
  }
  handlers = new Map<string, (event: string, data: { fatal: boolean }) => void>();
  source: string | null = null;
  attached: unknown = null;
  destroyed = false;
  config: Record<string, unknown>;
  constructor(config: Record<string, unknown> = {}) {
    this.config = config;
    FakeHls.instances.push(this);
  }
  on(event: string, handler: (event: string, data: { fatal: boolean }) => void) {
    this.handlers.set(event, handler);
  }
  loadSource(url: string) {
    this.source = url;
  }
  attachMedia(audio: unknown) {
    this.attached = audio;
  }
  destroy() {
    this.destroyed = true;
  }
  fail(fatal: boolean) {
    this.handlers.get("hlsError")?.("hlsError", { fatal });
  }
}

const loader = () => Promise.resolve({ default: FakeHls as never });
const BASE = "https://stream.miso.fm";
const QUILT = "Vw3O_abc-";

test("the master playlist URL is the Quilt's master.m3u8 item", () => {
  const player = new HlsPlayer({ baseUrl: BASE, loadHls: loader, mseUsable: () => true });
  expect(player.masterPlaylistUrl(QUILT)).toBe(`${BASE}/v1/blobs/by-quilt-id/${QUILT}/master.m3u8`);
});

test("without MSE the element gets the playlist directly and play errors surface", async () => {
  const player = new HlsPlayer({ baseUrl: BASE, loadHls: loader, mseUsable: () => false });
  const audio = fakeAudio(true, true);
  const errors: PlayerError[] = [];
  const stream = player.open(audio as unknown as HTMLAudioElement, QUILT, (error) => errors.push(error));
  expect(audio.crossOrigin).toBe("anonymous");
  expect(audio.src).toBe(player.masterPlaylistUrl(QUILT));
  stream.play();
  await Promise.resolve();
  await Promise.resolve();
  expect(audio.played).toBe(1);
  expect(errors).toHaveLength(1);
  expect(errors[0]!.reason).toBe("media");
});

test("with MSE hls.js attaches lazily, replays a remembered play, and reports fatal errors", async () => {
  FakeHls.instances = [];
  const player = new HlsPlayer({ baseUrl: BASE, loadHls: loader, mseUsable: () => true });
  const audio = fakeAudio(false);
  const errors: PlayerError[] = [];
  const stream = player.open(audio as unknown as HTMLAudioElement, QUILT, (error) => errors.push(error));
  stream.play(); // before attach: remembered
  await Promise.resolve();
  await Promise.resolve();
  const hls = FakeHls.instances[0]!;
  expect(hls.source).toBe(player.masterPlaylistUrl(QUILT));
  expect(hls.attached).toBe(audio);
  expect(audio.played).toBe(1);
  hls.fail(false);
  expect(errors).toHaveLength(0);
  hls.fail(true);
  expect(errors).toHaveLength(1);
  expect(errors[0]!.reason).toBe("fatal");
  expect(hls.destroyed).toBe(true);
  stream.destroy();
});

test("a failed engine load reports a PlayerError with reason engine-load", async () => {
  const failingLoader = () => Promise.reject(new Error("chunk load failed"));
  const player = new HlsPlayer({ baseUrl: BASE, loadHls: failingLoader, mseUsable: () => true });
  const errors: PlayerError[] = [];
  const stream = player.open(fakeAudio(false) as unknown as HTMLAudioElement, QUILT, (error) => errors.push(error));
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(errors).toHaveLength(1);
  expect(errors[0]!.reason).toBe("engine-load");
  stream.destroy();
});

test("hls.js is constructed with the cold-origin defaults, and a caller override wins", async () => {
  FakeHls.instances = [];
  const player = new HlsPlayer({ baseUrl: BASE, loadHls: loader, mseUsable: () => true });
  const stream = player.open(fakeAudio(false) as unknown as HTMLAudioElement, QUILT);
  await Promise.resolve();
  await Promise.resolve();
  const hls = FakeHls.instances[0]!;
  expect(hls.config.startLevel).toBe(startLevelIndex());
  expect(hls.config.maxBufferLength).toBe(HLS_COLD_ORIGIN_DEFAULTS.maxBufferLength);
  expect(hls.config.fragLoadPolicy).toEqual(HLS_COLD_ORIGIN_DEFAULTS.fragLoadPolicy);
  expect(hls.config.playlistLoadPolicy).toEqual(HLS_COLD_ORIGIN_DEFAULTS.playlistLoadPolicy);
  expect((hls.config.playlistLoadPolicy as { default: { maxTimeToFirstByteMs: number } }).default.maxTimeToFirstByteMs).toBe(
    20_000,
  );
  expect(hls.config.manifestLoadPolicy).toBeUndefined();
  stream.destroy();

  FakeHls.instances = [];
  const overriding = new HlsPlayer({
    baseUrl: BASE,
    loadHls: loader,
    mseUsable: () => true,
    hlsConfig: { startLevel: 0 },
  });
  overriding.open(fakeAudio(false) as unknown as HTMLAudioElement, QUILT);
  await Promise.resolve();
  await Promise.resolve();
  expect(FakeHls.instances[0]!.config.startLevel).toBe(0);
});

test("warm delegates to warmTrack against the player's own base URL", async () => {
  const player = new HlsPlayer({ baseUrl: BASE, loadHls: loader, mseUsable: () => true });
  const calls: string[] = [];
  const fetchImpl = ((url: string) => {
    calls.push(url);
    return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) } as Response);
  }) as typeof fetch;
  await Effect.runPromise(player.warm(QUILT, { segments: 0, fetch: fetchImpl }));
  expect(calls).toEqual([
    `${BASE}/v1/blobs/by-quilt-id/${QUILT}/master.m3u8`,
    `${BASE}/v1/blobs/by-quilt-id/${QUILT}/aac-256.m3u8`,
    `${BASE}/v1/blobs/by-quilt-id/${QUILT}/aac-256-init.mp4`,
  ]);
});

test("acquirePlayer's acquire runs synchronously, so play() is safe inside the acquiring gesture", () => {
  FakeHls.instances = [];
  const player = new HlsPlayer({ baseUrl: BASE, loadHls: loader, mseUsable: () => false });
  const audio = fakeAudio(true);

  // Effect.runSync throws if the program ever suspends; it succeeding proves
  // acquisition and play() both happen in the same synchronous call stack,
  // as a user gesture (e.g. iOS's play-must-follow-a-tap rule) requires.
  Effect.runSync(
    Effect.scoped(
      Effect.gen(function* () {
        const stream = yield* acquirePlayer({ player, audio: audio as unknown as HTMLAudioElement, quiltId: QUILT });
        stream.play();
      }),
    ),
  );
  expect(audio.played).toBe(1);
});

test("acquirePlayer's release detaches hls.js and clears the media element", async () => {
  FakeHls.instances = [];
  const player = new HlsPlayer({ baseUrl: BASE, loadHls: loader, mseUsable: () => true });
  const audio = fakeAudio(false);

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const stream = yield* acquirePlayer({ player, audio: audio as unknown as HTMLAudioElement, quiltId: QUILT });
        stream.play();
        yield* Effect.promise(() => Promise.resolve());
        yield* Effect.promise(() => Promise.resolve());
      }),
    ),
  );

  expect(audio.removed).toBe(true);
  expect(audio.loaded).toBe(1);
});

test("destroying before hls.js resolves never attaches", async () => {
  FakeHls.instances = [];
  let resolveLoad: (m: { default: never }) => void = () => {};
  const slow = () => new Promise<{ default: never }>((resolve) => { resolveLoad = resolve; });
  const player = new HlsPlayer({ baseUrl: BASE, loadHls: slow, mseUsable: () => true });
  const stream = player.open(fakeAudio(false) as unknown as HTMLAudioElement, QUILT);
  stream.destroy();
  resolveLoad({ default: FakeHls as never });
  await Promise.resolve();
  await Promise.resolve();
  expect(FakeHls.instances).toHaveLength(0);
});

test("mergeHlsConfig keeps default retry sub-objects when only one leaf is overridden", () => {
  const merged = mergeHlsConfig(HLS_COLD_ORIGIN_DEFAULTS, {
    fragLoadPolicy: { default: { maxTimeToFirstByteMs: 5_000 } },
  });
  expect(merged.fragLoadPolicy).toEqual({
    default: {
      maxTimeToFirstByteMs: 5_000,
      maxLoadTimeMs: HLS_COLD_ORIGIN_DEFAULTS.fragLoadPolicy!.default.maxLoadTimeMs,
      timeoutRetry: HLS_COLD_ORIGIN_DEFAULTS.fragLoadPolicy!.default.timeoutRetry,
      errorRetry: HLS_COLD_ORIGIN_DEFAULTS.fragLoadPolicy!.default.errorRetry,
    },
  });
});

test("mergeHlsConfig merges a partial retry sub-object leaf by leaf, caller winning", () => {
  const merged = mergeHlsConfig(HLS_COLD_ORIGIN_DEFAULTS, {
    fragLoadPolicy: { default: { timeoutRetry: { maxNumRetry: 1 } } },
  });
  const defaultTimeoutRetry = HLS_COLD_ORIGIN_DEFAULTS.fragLoadPolicy!.default.timeoutRetry!;
  expect((merged.fragLoadPolicy as { default: { timeoutRetry: unknown } }).default.timeoutRetry).toEqual({
    maxNumRetry: 1,
    retryDelayMs: defaultTimeoutRetry.retryDelayMs,
    maxRetryDelayMs: defaultTimeoutRetry.maxRetryDelayMs,
  });
});

test("mergeHlsConfig replaces a top-level scalar key entirely", () => {
  const merged = mergeHlsConfig(HLS_COLD_ORIGIN_DEFAULTS, { maxBufferLength: 30 });
  expect(merged.maxBufferLength).toBe(30);
  expect(merged.fragLoadPolicy).toEqual(HLS_COLD_ORIGIN_DEFAULTS.fragLoadPolicy);
});

test("mergeHlsConfig passes an unrelated key through untouched", () => {
  const merged = mergeHlsConfig(HLS_COLD_ORIGIN_DEFAULTS, { debug: true });
  expect(merged.debug).toBe(true);
  expect(merged.startLevel).toBe(HLS_COLD_ORIGIN_DEFAULTS.startLevel);
});
