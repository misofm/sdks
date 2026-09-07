// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { MAX_SEGMENTS_PER_RENDITION, quiltItemUrl } from "../src/index.ts";
import { warmTrack } from "../src/warm.ts";
import { warmTrackEffect } from "../src/warm.ts";
import { Effect, Fiber } from "effect";

const BASE = "https://stream.miso.fm";
const QUILT = "Vw3O_abc-";

function fakeResponse(ok = true): Response {
  return {
    ok,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as Response;
}

test("warmTrack fetches the master playlist, rendition playlist, init, and N segments concurrently", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let resolved = 0;
  const fetchImpl = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Promise<Response>((resolve) => {
      queueMicrotask(() => {
        resolved += 1;
        resolve(fakeResponse());
      });
    });
  }) as typeof fetch;

  const promise = warmTrack(BASE, QUILT, { segments: 2, rendition: "aac-256", fetch: fetchImpl });
  // All five fetches (master, playlist, init, 2 segments) must have been
  // issued synchronously, before any resolves.
  expect(calls).toHaveLength(5);
  expect(resolved).toBe(0);
  await promise;
  expect(resolved).toBe(5);

  const urls = calls.map((c) => c.url);
  expect(urls).toEqual([
    quiltItemUrl(BASE, QUILT, "master.m3u8"),
    quiltItemUrl(BASE, QUILT, "aac-256.m3u8"),
    quiltItemUrl(BASE, QUILT, "aac-256-init.mp4"),
    quiltItemUrl(BASE, QUILT, "aac-256-00000.m4s"),
    quiltItemUrl(BASE, QUILT, "aac-256-00001.m4s"),
  ]);
});

test("warmTrack requests cors/omit mode and drains every body", async () => {
  let drained = 0;
  const fetchImpl = (async () => ({
    ok: true,
    arrayBuffer: () => {
      drained += 1;
      return Promise.resolve(new ArrayBuffer(0));
    },
  })) as unknown as typeof fetch;
  const seenInit: RequestInit[] = [];
  const wrapped = ((url: string, init: RequestInit) => {
    seenInit.push(init);
    return fetchImpl(url, init);
  }) as typeof fetch;

  await warmTrack(BASE, QUILT, { segments: 1, fetch: wrapped });

  expect(drained).toBe(4); // master playlist + rendition playlist + init + 1 segment
  for (const init of seenInit) {
    expect(init.mode).toBe("cors");
    expect(init.credentials).toBe("omit");
  }
});

test("warmTrack tolerates a non-2xx response instead of throwing", async () => {
  const fetchImpl = (async () => fakeResponse(false)) as unknown as typeof fetch;
  await expect(warmTrack(BASE, QUILT, { segments: 0, fetch: fetchImpl })).resolves.toBeUndefined();
});

test("warmTrack rejects with the AbortError when its signal is aborted", async () => {
  const controller = new AbortController();
  const fetchImpl = ((_url: string, init: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  }) as unknown as typeof fetch;

  const promise = warmTrack(BASE, QUILT, { fetch: fetchImpl, signal: controller.signal });
  controller.abort();
  await expect(promise).rejects.toThrow(/aborted/i);
});

test("warmTrack validates segments", async () => {
  await expect(warmTrack(BASE, QUILT, { segments: -1 })).rejects.toThrow(RangeError);
  await expect(warmTrack(BASE, QUILT, { segments: 1.5 })).rejects.toThrow(RangeError);
  await expect(warmTrack(BASE, QUILT, { segments: MAX_SEGMENTS_PER_RENDITION + 1 })).rejects.toThrow(RangeError);
});

test("warmTrack with segments: 0 still fetches the playlists and init", async () => {
  const calls: string[] = [];
  const fetchImpl = ((url: string) => {
    calls.push(url);
    return Promise.resolve(fakeResponse());
  }) as unknown as typeof fetch;
  await warmTrack(BASE, QUILT, { segments: 0, fetch: fetchImpl });
  expect(calls).toEqual([
    quiltItemUrl(BASE, QUILT, "master.m3u8"),
    quiltItemUrl(BASE, QUILT, "aac-256.m3u8"),
    quiltItemUrl(BASE, QUILT, "aac-256-init.mp4"),
  ]);
});

test("warming bounds fetch-and-drain concurrency and preserves rejection identity", async () => {
  let active = 0;
  let peak = 0;
  let drained = 0;
  const fetchImpl = (async () => {
    peak = Math.max(peak, ++active);
    return { arrayBuffer: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      drained++;
      return new ArrayBuffer(0);
    } } as Response;
  }) as unknown as typeof fetch;
  await warmTrack(BASE, QUILT, { segments: 20, concurrency: 3, fetch: fetchImpl });
  expect(peak).toBe(3);
  expect(drained).toBe(23);
  const failure = { reason: "foreign fetch failure" };
  await expect(warmTrack(BASE, QUILT, { fetch: (() => Promise.reject(failure)) as unknown as typeof fetch })).rejects.toBe(failure);
  await expect(warmTrack(BASE, QUILT, { concurrency: 0 })).rejects.toBeInstanceOf(RangeError);
});

test("Effect interruption aborts the signal while response bodies are being drained", async () => {
  const signals: AbortSignal[] = [];
  const fetchImpl = (async (_url, init) => {
    const signal = init!.signal!;
    signals.push(signal);
    return { arrayBuffer: () => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }) } as Response;
  }) as typeof fetch;
  const fiber = Effect.runFork(warmTrackEffect(BASE, QUILT, { fetch: fetchImpl, concurrency: 2 }));
  await Promise.resolve();
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(signals).toHaveLength(2);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});
