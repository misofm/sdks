import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { Effect } from "effect";

export const MAX_ARTIFACT_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_PLAYLIST_BYTES = 1_048_576;

/** Native leaves must settle before their enclosing scope releases locks or staging. */
export const joinedPromise = <A>(
  operation: (signal: AbortSignal) => Promise<A>,
): Effect.Effect<A, unknown> =>
  Effect.callback<A, unknown>((resume, signal) => {
    const worker = Promise.resolve().then(() => operation(signal));
    void worker.then(
      (value) => resume(Effect.succeed(value)),
      (error) => resume(Effect.fail(error)),
    );
    return Effect.promise(() =>
      worker.then(
        () => undefined,
        () => undefined,
      ),
    );
  });

type FileFailure = (kind: "bounds" | "grew" | "changed") => Error;
const defaultFailure: FileFailure = (kind) => new RangeError(`File ${kind}`);

/** No-follow, bounded native reads; every opened handle is closed before settlement. */
export const inspectAndHash = async (
  path: string,
  maximum = MAX_ARTIFACT_FILE_BYTES,
  failure: FileFailure = defaultFailure,
  minimum = 1,
): Promise<{ bytes: number; sha256: string }> => {
  const handle = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const metadata = await handle.stat();
    if (
      !metadata.isFile() ||
      metadata.size < minimum ||
      metadata.size > maximum
    )
      throw failure("bounds");
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of handle.createReadStream({
      autoClose: false,
      highWaterMark: 64 * 1024,
    })) {
      bytes += chunk.byteLength;
      if (bytes > metadata.size) throw failure("grew");
      hash.update(chunk);
    }
    if (bytes !== metadata.size) throw failure("changed");
    return { bytes, sha256: hash.digest("hex") };
  } finally {
    await handle.close();
  }
};

export const readBounded = async (
  path: string,
  maximum = MAX_PLAYLIST_BYTES,
  failure: FileFailure = defaultFailure,
): Promise<Buffer> => {
  const handle = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size < 1 || metadata.size > maximum)
      throw failure("bounds");
    const bytes = Buffer.allocUnsafe(metadata.size);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        null,
      );
      if (result.bytesRead === 0) throw failure("changed");
      offset += result.bytesRead;
    }
    if ((await handle.read(Buffer.alloc(1), 0, 1, null)).bytesRead !== 0)
      throw failure("changed");
    return bytes;
  } finally {
    await handle.close();
  }
};
