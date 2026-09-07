import { readBounded, joinedPromise } from "../workspace/files.js";
import { lstat, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";

import { Effect } from "effect";

import { InvalidRequestError, WorkspaceIoError } from "../errors.js";
import type { PreparedTranscode, TranscodeArtifact } from "../model.js";
import { assertNoSymlinkComponentsPromise } from "../workspace/atomic-file.js";

const invalid = (subject: string, message: string) =>
  new InvalidRequestError({
    code: "INVALID_REQUEST",
    phase: "request",
    subject,
    message,
  });

const io = (subject: string, message: string) =>
  new WorkspaceIoError({
    code: "WORKSPACE_IO",
    phase: "workspace",
    subject,
    message,
  });

/** Explicitly removes only a validated prepared plaintext checkpoint. */
export const cleanupPreparedTranscode = (
  prepared: PreparedTranscode,
): Effect.Effect<void, InvalidRequestError | WorkspaceIoError> =>
  Effect.uninterruptible(
    Effect.gen(function* () {
      if (
        !isAbsolute(prepared.rootPath) ||
        !/^[0-9a-f]{64}$/u.test(prepared.prepareDigest) ||
        basename(prepared.rootPath) !== prepared.prepareDigest ||
        basename(dirname(prepared.rootPath)) !== "plaintext"
      ) {
        throw invalid(
          prepared.rootPath,
          "Cleanup target is not a canonical prepared plaintext directory",
        );
      }
      const exists = yield* joinedPromise(() =>
        assertNoSymlinkComponentsPromise(prepared.rootPath),
      ).pipe(
        Effect.as(true),
        Effect.catch((error) =>
          error instanceof WorkspaceIoError
            ? Effect.gen(function* () {
                yield* joinedPromise(() =>
                  assertNoSymlinkComponentsPromise(dirname(prepared.rootPath)),
                );
                const missing = yield* joinedPromise(() =>
                  lstat(prepared.rootPath),
                ).pipe(
                  Effect.as(false),
                  Effect.catch((cause) =>
                    cause instanceof Error &&
                    "code" in cause &&
                    cause.code === "ENOENT"
                      ? Effect.succeed(true)
                      : Effect.succeed(false),
                  ),
                );
                if (missing) return false;
                return yield* Effect.fail(error);
              })
            : Effect.fail(error),
        ),
      );
      if (!exists) return;
      const metadata = yield* joinedPromise(() => lstat(prepared.rootPath));
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw io(prepared.rootPath, "Cleanup target is not a safe directory");
      }
      const checkpointPath = join(prepared.rootPath, "prepared.json");
      const checkpointBytes = yield* joinedPromise(() =>
        readBounded(checkpointPath, 4_194_304, (kind) =>
          io(
            checkpointPath,
            kind === "bounds"
              ? "Cleanup checkpoint exceeds its limit"
              : "Cleanup checkpoint changed during read",
          ),
        ),
      );
      const checkpoint = JSON.parse(checkpointBytes.toString("utf8")) as Record<
        string,
        unknown
      >;
      if (
        checkpoint["schema"] !== "miso.transcoder-prepared/1" ||
        checkpoint["prepareDigest"] !== prepared.prepareDigest ||
        checkpoint["rootPath"] !== prepared.rootPath
      ) {
        throw io(
          prepared.rootPath,
          "Cleanup checkpoint does not match its target",
        );
      }
      yield* joinedPromise(() => rm(prepared.rootPath, { recursive: true }));
    }).pipe(
      Effect.catchDefect((error) => Effect.fail(error)),
      Effect.mapError((error) =>
        error instanceof InvalidRequestError ||
        error instanceof WorkspaceIoError
          ? error
          : io(prepared.rootPath, "Prepared plaintext cleanup failed"),
      ),
    ),
  );

/** Explicitly removes only a canonical verified transcode generation directory. */
export const cleanupTranscodeArtifact = (
  artifact: TranscodeArtifact,
): Effect.Effect<void, InvalidRequestError | WorkspaceIoError> =>
  Effect.uninterruptible(
    Effect.gen(function* () {
      if (
        !isAbsolute(artifact.rootPath) ||
        !/^[0-9a-f]{64}$/u.test(artifact.transcodeDigest) ||
        basename(artifact.rootPath) !== artifact.transcodeDigest ||
        basename(dirname(artifact.rootPath)) !== "generations"
      )
        throw invalid(
          artifact.rootPath,
          "Cleanup target is not a canonical transcode directory",
        );
      yield* joinedPromise(() =>
        assertNoSymlinkComponentsPromise(dirname(artifact.rootPath)),
      );
      const metadata = yield* joinedPromise(() =>
        lstat(artifact.rootPath),
      ).pipe(
        Effect.catch((error) =>
          error instanceof Error && "code" in error && error.code === "ENOENT"
            ? Effect.succeed(undefined)
            : Effect.fail(error),
        ),
      );
      if (metadata === undefined) return;
      if (!metadata.isDirectory() || metadata.isSymbolicLink())
        throw io(artifact.rootPath, "Cleanup target is not a safe directory");
      yield* joinedPromise(() => rm(artifact.rootPath, { recursive: true }));
    }).pipe(
      Effect.catchDefect((error) => Effect.fail(error)),
      Effect.mapError((error) =>
        error instanceof InvalidRequestError ||
        error instanceof WorkspaceIoError
          ? error
          : io(artifact.rootPath, "Transcode cleanup failed"),
      ),
    ),
  );
