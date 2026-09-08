// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { Effect, Fiber } from "effect";
import { MAX_SEGMENTS_PER_RENDITION, quiltItemUrl } from "../src/index.ts";
import { warmTrack } from "../src/warm.ts";

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

  const promise = Effect.runPromise(warmTrack(BASE, QUILT, { segments: 2, rendition: "aac-256", fetch: fetchImpl }));
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

  await Effect.runPromise(warmTrack(BASE, QUILT, { segments: 1, fetch: wrapped }));

  expect(drained).toBe(4); // master playlist + rendition playlist + init + 1 segment
  for (const init of seenInit) {
    expect(init.mode).toBe("cors");
    expect(init.credentials).toBe("omit");
  }
});

test("warmTrack tolerates a non-2xx response instead of failing", async () => {
  const fetchImpl = (async () => fakeResponse(false)) as unknown as typeof fetch;
  await expect(Effect.runPromise(warmTrack(BASE, QUILT, { segments: 0, fetch: fetchImpl }))).resolves.toBeUndefined();
});

test("warmTrack tolerates one item's network error while draining the others", async () => {
  const drained: string[] = [];
  const fetchImpl = ((url: string) => {
    if (url.endsWith("aac-256.m3u8")) {
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    return Promise.resolve({
      ok: true,
      arrayBuffer: () => {
        drained.push(url);
        return Promise.resolve(new ArrayBuffer(0));
      },
    } as unknown as Response);
  }) as unknown as typeof fetch;

  await expect(
    Effect.runPromise(warmTrack(BASE, QUILT, { segments: 1, fetch: fetchImpl })),
  ).resolves.toBeUndefined();
  expect(drained).toEqual([
    quiltItemUrl(BASE, QUILT, "master.m3u8"),
    quiltItemUrl(BASE, QUILT, "aac-256-init.mp4"),
    quiltItemUrl(BASE, QUILT, "aac-256-00000.m4s"),
  ]);
});

test("warmTrack aborts every in-flight fetch when its fiber is interrupted", async () => {
  const abortedUrls: string[] = [];
  const started: string[] = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    started.push(url);
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        abortedUrls.push(url);
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  }) as unknown as typeof fetch;

  const fiber = Effect.runFork(warmTrack(BASE, QUILT, { segments: 1, fetch: fetchImpl }));
  // Let the fetches start before interrupting.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(started).toHaveLength(4);

  await Effect.runPromise(Fiber.interrupt(fiber));

  expect(abortedUrls.sort()).toEqual([...started].sort());
});

test("warmTrack validates segments", async () => {
  await expect(Effect.runPromise(warmTrack(BASE, QUILT, { segments: -1 }))).rejects.toThrow(RangeError);
  await expect(Effect.runPromise(warmTrack(BASE, QUILT, { segments: 1.5 }))).rejects.toThrow(RangeError);
  await expect(
    Effect.runPromise(warmTrack(BASE, QUILT, { segments: MAX_SEGMENTS_PER_RENDITION + 1 })),
  ).rejects.toThrow(RangeError);
});

test("warmTrack with segments: 0 still fetches the playlists and init", async () => {
  const calls: string[] = [];
  const fetchImpl = ((url: string) => {
    calls.push(url);
    return Promise.resolve(fakeResponse());
  }) as unknown as typeof fetch;
  await Effect.runPromise(warmTrack(BASE, QUILT, { segments: 0, fetch: fetchImpl }));
  expect(calls).toEqual([
    quiltItemUrl(BASE, QUILT, "master.m3u8"),
    quiltItemUrl(BASE, QUILT, "aac-256.m3u8"),
    quiltItemUrl(BASE, QUILT, "aac-256-init.mp4"),
  ]);
});
