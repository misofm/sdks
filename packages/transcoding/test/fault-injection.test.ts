import { afterEach, expect, test } from "bun:test";
import {
  mkdtemp,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyFileAtomic } from "../src/pipeline/finalize.js";
import { Effect, Fiber } from "effect";
import {
  inspectAndHash,
  joinedPromise,
  readBounded,
} from "../src/workspace/files.js";
import { withWorkspaceLock } from "../src/workspace/lock.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

test("atomic segment copy faults leave either no file or the complete durable file", async () => {
  for (const transition of ["file-fsync", "rename", "parent-fsync"] as const) {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), "transcoder-copy-fault-")),
    );
    roots.push(root);
    const source = join(root, "source.m4s");
    const destination = join(root, "copy.m4s");
    await writeFile(source, "complete fragment", { mode: 0o600 });
    await expect(
      copyFileAtomic(source, destination, new AbortController().signal, {
        afterTransition: (current) => {
          if (current === transition) throw new Error("injected crash");
        },
      }),
    ).rejects.toThrow("injected crash");
    if (transition === "file-fsync")
      expect(await Bun.file(destination).exists()).toBe(false);
    else expect(await Bun.file(destination).text()).toBe("complete fragment");
    expect((await readdir(root)).some((name) => name.includes(".tmp-"))).toBe(
      false,
    );
  }
});

test("atomic copy detects source mutation before promotion", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "transcoder-copy-mutation-")),
  );
  roots.push(root);
  const source = join(root, "source.m4s");
  const destination = join(root, "copy.m4s");
  await writeFile(source, "complete fragment", { mode: 0o600 });
  await expect(
    copyFileAtomic(source, destination, new AbortController().signal, {
      afterTransition: async (transition) => {
        if (transition === "file-fsync")
          await writeFile(source, "corrupt fragment", { mode: 0o600 });
      },
    }),
  ).rejects.toBeDefined();
  expect(await Bun.file(destination).exists()).toBe(false);
  expect((await readdir(root)).some((name) => name.includes(".tmp-"))).toBe(
    false,
  );
});

test("already-aborted copy creates no destination or temporary", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "transcoder-copy-cancel-")),
  );
  roots.push(root);
  const source = join(root, "source.m4s");
  const destination = join(root, "copy.m4s");
  await writeFile(source, "fragment", { mode: 0o600 });
  const controller = new AbortController();
  controller.abort();
  await expect(
    copyFileAtomic(source, destination, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(await Bun.file(destination).exists()).toBe(false);
  expect((await readdir(root)).some((name) => name.includes(".tmp-"))).toBe(
    false,
  );
});

test("in-flight cancellation removes the partial atomic copy", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "transcoder-copy-inflight-cancel-")),
  );
  roots.push(root);
  const source = join(root, "source.m4s");
  const destination = join(root, "copy.m4s");
  await writeFile(source, Buffer.alloc(256 * 1024, 7), { mode: 0o600 });
  const controller = new AbortController();
  await expect(
    copyFileAtomic(source, destination, controller.signal, {
      afterChunk: () => controller.abort(),
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(await Bun.file(destination).exists()).toBe(false);
  expect((await readdir(root)).some((name) => name.includes(".tmp-"))).toBe(
    false,
  );
});

test("interruption joins an in-flight native copy before releasing its workspace lock", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "transcoder-copy-join-")),
  );
  roots.push(root);
  const source = join(root, "source.m4s");
  const destination = join(root, "copy.m4s");
  await writeFile(source, Buffer.alloc(128 * 1024, 7));
  const started = Promise.withResolvers<void>();
  const aborted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const fiber = Effect.runFork(
    withWorkspaceLock(root, "test-copy", () =>
      joinedPromise((signal) => {
        signal.addEventListener("abort", () => aborted.resolve(), {
          once: true,
        });
        return copyFileAtomic(source, destination, signal, {
          afterChunk: async () => {
            started.resolve();
            await release.promise;
          },
        });
      }),
    ),
  );
  await started.promise;
  const interrupted = Effect.runPromise(Fiber.interrupt(fiber));
  await aborted.promise;
  expect(await Bun.file(join(root, ".transcoder.lock")).exists()).toBe(true);
  release.resolve();
  await interrupted;
  expect((await readdir(root)).sort()).toEqual(["source.m4s"]);
});

test("shared file reads and hashes reject symlinks and byte-limit violations", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "transcoder-bounded-files-")),
  );
  roots.push(root);
  const source = join(root, "source");
  const linked = join(root, "linked");
  await writeFile(source, "abcd");
  await symlink(source, linked);
  for (const operation of [readBounded, inspectAndHash]) {
    await expect(operation(linked)).rejects.toBeDefined();
    await expect(operation(source, 3)).rejects.toBeInstanceOf(RangeError);
    await expect(operation(root)).rejects.toBeDefined();
  }
  expect(await readBounded(source, 4)).toEqual(Buffer.from("abcd"));
  expect((await inspectAndHash(source, 4)).bytes).toBe(4);
});
