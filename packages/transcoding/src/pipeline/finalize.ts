import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  mkdir,
  open,
  readdir,
  rename,
  rmdir,
  unlink,
} from "node:fs/promises";
import { basename, join } from "node:path";

import { Effect } from "effect";
import {
  CODEC,
  MASTER_PLAYLIST,
  MEDIA_CONTENT_TYPE,
  PLAYLIST_CONTENT_TYPE,
  renditionPlaylistIdentifier,
} from "@misofm/streaming";

import { ArtifactValidationError, WorkspaceIoError } from "../errors.js";
import { calculateBandwidth } from "../hls/bandwidth.js";
import { renderMasterPlaylist } from "../hls/master.js";
import { parsePlaintextMediaPlaylist } from "../hls/playlist.js";
import {
  RENDITIONS,
  type FileDescriptor,
  type FinalizeRequest,
  type RenditionDescriptor,
  type SegmentDescriptor,
  type TranscodeArtifact,
} from "../model.js";
import {
  assertNoSymlinkComponentsPromise,
  atomicWriteFilePromise,
} from "../workspace/atomic-file.js";
import { promoteWorkspaceDirectory } from "../workspace/state.js";
import { verifyArtifact } from "./verify.js";

import {
  inspectAndHash,
  readBounded,
  joinedPromise,
  MAX_ARTIFACT_FILE_BYTES,
} from "../workspace/files.js";
const MAX_FILE_CONCURRENCY = 16;
const AUDIO_CONTENT_TYPE = MEDIA_CONTENT_TYPE;

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted)
    throw new DOMException("Operation interrupted", "AbortError");
};

const failure = (subject: string, message: string) =>
  new ArtifactValidationError({
    code: "ARTIFACT_VALIDATION",
    phase: "finalize",
    subject,
    message,
  });

const removeTree = async (path: string): Promise<void> => {
  try {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await removeTree(child);
      else await unlink(child);
    }
    await rmdir(path);
  } catch {
    /* cleanup must not hide the original failure */
  }
};

export type FileCopyTransition = "file-fsync" | "rename" | "parent-fsync";

/** @internal Exported only for durable-transition fault injection. */
export const copyFileAtomic = async (
  sourcePath: string,
  destinationPath: string,
  signal: AbortSignal,
  hooks: {
    readonly afterTransition?: (
      transition: FileCopyTransition,
    ) => void | Promise<void>;
    readonly afterChunk?: (copiedBytes: number) => void | Promise<void>;
  } = {},
): Promise<{ readonly bytes: number; readonly sha256: string }> => {
  throwIfAborted(signal);
  const input = await open(
    sourcePath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  const temporary = `${destinationPath}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  let output: Awaited<ReturnType<typeof open>> | undefined;
  const hash = createHash("sha256");
  let copiedBytes = 0;
  try {
    const metadata = await input.stat();
    if (
      !metadata.isFile() ||
      metadata.size < 1 ||
      metadata.size > MAX_ARTIFACT_FILE_BYTES
    )
      throw new RangeError("source size outside supported bounds");
    output = await open(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    const buffer = Buffer.allocUnsafe(64 * 1024);
    while (true) {
      throwIfAborted(signal);
      const { bytesRead } = await input.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      copiedBytes += bytesRead;
      if (copiedBytes > metadata.size)
        throw new RangeError("source grew during copy");
      hash.update(buffer.subarray(0, bytesRead));
      let written = 0;
      while (written < bytesRead) {
        const result = await output.write(
          buffer,
          written,
          bytesRead - written,
          null,
        );
        if (result.bytesWritten === 0) throw new RangeError("short write");
        written += result.bytesWritten;
      }
      await hooks.afterChunk?.(copiedBytes);
    }
    if (copiedBytes !== metadata.size)
      throw new RangeError("source shrank during copy");
    await output.sync();
    await hooks.afterTransition?.("file-fsync");
  } catch (error) {
    await output?.close().catch(() => undefined);
    await input.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  } finally {
    await input.close().catch(() => undefined);
    await output?.close().catch(() => undefined);
  }
  try {
    const copied = { bytes: copiedBytes, sha256: hash.digest("hex") };
    const current = await inspectAndHash(sourcePath);
    if (current.bytes !== copied.bytes || current.sha256 !== copied.sha256)
      throw new Error("source changed during copy");
    throwIfAborted(signal);
    await rename(temporary, destinationPath);
    await hooks.afterTransition?.("rename");
    const parent = await open(join(destinationPath, ".."), constants.O_RDONLY);
    try {
      await parent.sync();
      await hooks.afterTransition?.("parent-fsync");
    } finally {
      await parent.close();
    }
    return copied;
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
};

const descriptor = (
  rootPath: string,
  identifier: string,
  measured: { bytes: number; sha256: string },
): FileDescriptor => ({
  identifier,
  path: join(rootPath, identifier),
  contentType: identifier.endsWith(".m3u8")
    ? PLAYLIST_CONTENT_TYPE
    : AUDIO_CONTENT_TYPE,
  ...measured,
});

const readRenditions = (
  rootPath: string,
  descriptorPath: string,
  request: FinalizeRequest,
  concurrency: number,
) =>
  Effect.gen(function* () {
    const renditions: RenditionDescriptor[] = [];
    for (const rendition of RENDITIONS) {
      const playlistIdentifier = renditionPlaylistIdentifier(rendition.id);
      const parsed = parsePlaintextMediaPlaylist(
        yield* joinedPromise(() =>
          readBounded(join(rootPath, playlistIdentifier), 1_048_576),
        ),
      );
      const playlist = descriptor(
        descriptorPath,
        playlistIdentifier,
        yield* joinedPromise(() =>
          inspectAndHash(join(rootPath, playlistIdentifier)),
        ),
      );
      const init = descriptor(
        descriptorPath,
        parsed.mapIdentifier,
        yield* joinedPromise(() =>
          inspectAndHash(join(rootPath, parsed.mapIdentifier)),
        ),
      );
      const segments = yield* Effect.forEach(
        parsed.segments,
        (segment) =>
          joinedPromise(() =>
            inspectAndHash(join(rootPath, segment.identifier)),
          ).pipe(
            Effect.map(
              (measured): SegmentDescriptor => ({
                ...descriptor(descriptorPath, segment.identifier, measured),
                contentType: AUDIO_CONTENT_TYPE,
                sequence: segment.sequence,
                durationMs: segment.durationMs,
              }),
            ),
          ),
        { concurrency },
      );
      renditions.push({
        id: rendition.id,
        codec: CODEC,
        nominalBitrate: rendition.nominalBitrate,
        ...calculateBandwidth(segments),
        sampleRateHz: request.prepared.sampleRateHz,
        channels: 2,
        playlist,
        init,
        segments,
      });
    }
    return renditions;
  });

const buildArtifact = (
  rootPath: string,
  transcodeDigest: string,
  request: FinalizeRequest,
  concurrency: number,
) =>
  Effect.gen(function* () {
    const renditions = yield* readRenditions(
      rootPath,
      rootPath,
      request,
      concurrency,
    );
    const masterPlaylist = descriptor(
      rootPath,
      MASTER_PLAYLIST,
      yield* joinedPromise(() =>
        inspectAndHash(join(rootPath, MASTER_PLAYLIST)),
      ),
    );
    const files = [
      masterPlaylist,
      ...renditions.flatMap((item) => [
        item.playlist,
        item.init,
        ...item.segments,
      ]),
    ];
    return {
      transcodeDigest,
      rootPath,
      segmentTargetMs: request.prepared.segmentTargetMs,
      masterPlaylist,
      files,
      renditions,
      toolchain: request.prepared.toolchain,
      audio: request.prepared.audio,
    };
  });

const transcodeIdentity = (request: FinalizeRequest) =>
  Effect.gen(function* () {
    const hash = createHash("sha256");
    hash.update("miso.transcoder.hls-artifact/1\0");
    hash.update(request.prepared.resultDigest);
    for (const rendition of RENDITIONS) {
      const parsed = parsePlaintextMediaPlaylist(
        yield* joinedPromise(() =>
          readBounded(
            join(request.prepared.rootPath, `${rendition.id}.m3u8`),
            1_048_576,
          ),
        ),
      );
      for (const identifier of [
        `${rendition.id}.m3u8`,
        parsed.mapIdentifier,
        ...parsed.segments.map((item) => item.identifier),
      ]) {
        const value = yield* joinedPromise(() =>
          inspectAndHash(join(request.prepared.rootPath, identifier)),
        );
        hash.update(`\0${identifier}\0${value.bytes}\0${value.sha256}`);
      }
    }
    return hash.digest("hex");
  });

const finalize = (request: FinalizeRequest, concurrency: number) =>
  Effect.gen(function* () {
    const transcodeDigest = yield* transcodeIdentity(request);
    const generations = join(
      request.prepared.rootPath,
      "..",
      "..",
      "generations",
    );
    yield* joinedPromise(() =>
      assertNoSymlinkComponentsPromise(join(generations, "..")),
    );
    yield* joinedPromise(() =>
      mkdir(generations, { recursive: true, mode: 0o700 }),
    );
    yield* joinedPromise(() => chmod(generations, 0o700));
    const target = join(generations, transcodeDigest);
    const existing = yield* buildArtifact(
      target,
      transcodeDigest,
      request,
      concurrency,
    ).pipe(
      Effect.catch((error) =>
        error instanceof Error && "code" in error && error.code === "ENOENT"
          ? Effect.succeed(undefined)
          : Effect.fail(error),
      ),
    );
    if (existing !== undefined) {
      if (request.fresh === true)
        return yield* Effect.fail(
          failure(target, "Fresh transcode requires explicit cleanup"),
        );
      return yield* verifyArtifact(existing);
    }
    const temporary = join(
      generations,
      `.tmp-${process.pid}-${randomBytes(8).toString("hex")}`,
    );
    return yield* Effect.acquireUseRelease(
      Effect.uninterruptible(
        joinedPromise(() => mkdir(temporary, { mode: 0o700 })),
      ),
      () =>
        Effect.gen(function* () {
          const copyIdentifiers: string[] = [];
          const descriptors = yield* readRenditions(
            request.prepared.rootPath,
            target,
            request,
            concurrency,
          );
          for (const rendition of RENDITIONS) {
            const playlistIdentifier = renditionPlaylistIdentifier(
              rendition.id,
            );
            const playlistBytes = yield* joinedPromise(() =>
              readBounded(
                join(request.prepared.rootPath, playlistIdentifier),
                1_048_576,
              ),
            );
            const parsed = parsePlaintextMediaPlaylist(playlistBytes);
            copyIdentifiers.push(
              parsed.mapIdentifier,
              ...parsed.segments.map((item) => item.identifier),
            );
            yield* joinedPromise(() =>
              atomicWriteFilePromise(
                join(temporary, playlistIdentifier),
                playlistBytes,
              ),
            );
          }
          yield* Effect.forEach(
            copyIdentifiers,
            (identifier) =>
              joinedPromise((signal) =>
                copyFileAtomic(
                  join(request.prepared.rootPath, identifier),
                  join(temporary, identifier),
                  signal,
                ),
              ),
            { concurrency },
          );
          yield* joinedPromise(() =>
            atomicWriteFilePromise(
              join(temporary, "master.m3u8"),
              renderMasterPlaylist(descriptors),
            ),
          );
          yield* promoteWorkspaceDirectory(temporary, target);
          return yield* verifyArtifact(
            yield* buildArtifact(target, transcodeDigest, request, concurrency),
          );
        }),
      () => Effect.promise(() => removeTree(temporary)),
    );
  });

export const finalizeTranscode = (
  request: FinalizeRequest,
): Effect.Effect<
  TranscodeArtifact,
  ArtifactValidationError | WorkspaceIoError
> =>
  Effect.suspend(() => {
    const concurrency = request.fileConcurrency ?? 4;
    if (
      !Number.isSafeInteger(concurrency) ||
      concurrency < 1 ||
      concurrency > MAX_FILE_CONCURRENCY
    )
      return Effect.fail(
        failure(
          "fileConcurrency",
          "File concurrency is outside the supported range",
        ),
      );
    return finalize(request, concurrency).pipe(
      Effect.catchDefect((error) => Effect.fail(error)),
      Effect.mapError((error) =>
        error instanceof ArtifactValidationError ||
        error instanceof WorkspaceIoError
          ? error
          : failure(
              basename(request.prepared.rootPath),
              "Transcode finalization failed",
            ),
      ),
    );
  });
