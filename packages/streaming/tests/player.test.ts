// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { HlsPlayer } from "../src/player.ts";

interface FakeAudio {
  crossOrigin: string | null;
  src: string;
  played: number;
  rejectPlay: boolean;
  canPlayType(type: string): string;
  play(): Promise<void>;
}

function fakeAudio(native: boolean, rejectPlay = false): FakeAudio {
  return {
    crossOrigin: null,
    src: "",
    played: 0,
    rejectPlay,
    canPlayType: () => (native ? "maybe" : ""),
    play() {
      this.played += 1;
      return this.rejectPlay ? Promise.reject(new Error("blocked")) : Promise.resolve();
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
  constructor() {
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
  let errors = 0;
  const stream = player.open(audio as unknown as HTMLAudioElement, QUILT, () => errors++);
  expect(audio.crossOrigin).toBe("anonymous");
  expect(audio.src).toBe(player.masterPlaylistUrl(QUILT));
  stream.play();
  await Promise.resolve();
  await Promise.resolve();
  expect(audio.played).toBe(1);
  expect(errors).toBe(1);
});

test("with MSE hls.js attaches lazily, replays a remembered play, and reports fatal errors", async () => {
  FakeHls.instances = [];
  const player = new HlsPlayer({ baseUrl: BASE, loadHls: loader, mseUsable: () => true });
  const audio = fakeAudio(false);
  let errors = 0;
  const stream = player.open(audio as unknown as HTMLAudioElement, QUILT, () => errors++);
  stream.play(); // before attach: remembered
  await Promise.resolve();
  await Promise.resolve();
  const hls = FakeHls.instances[0]!;
  expect(hls.source).toBe(player.masterPlaylistUrl(QUILT));
  expect(hls.attached).toBe(audio);
  expect(audio.played).toBe(1);
  hls.fail(false);
  expect(errors).toBe(0);
  hls.fail(true);
  expect(errors).toBe(1);
  expect(hls.destroyed).toBe(true);
  stream.destroy();
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
