import {
  inspectAndHash,
  readBounded,
  joinedPromise,
} from "../workspace/files.js";
import { lstat, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { Effect, Result } from "effect";
import { CODEC, MASTER_PLAYLIST } from "@misofm/streaming";

import { ArtifactValidationError } from "../errors.js";
import { calculateBandwidth } from "../hls/bandwidth.js";
import { validateMasterPlaylist } from "../hls/master.js";
import { parsePlaintextMediaPlaylist } from "../hls/playlist.js";
import {
  RENDITIONS,
  type FileDescriptor,
  type TranscodeArtifact,
  type VerifiedArtifact,
} from "../model.js";

const failure = (subject: string, message: string) =>
  new ArtifactValidationError({
    code: "ARTIFACT_VALIDATION",
    phase: "verify",
    subject,
    message,
  });

const inspect = (path: string, maximum?: number) =>
  inspectAndHash(path, maximum, (kind) =>
    failure(
      path,
      {
        bounds: "Artifact file is outside its byte limit",
        grew: "Artifact file grew during verification",
        changed: "Artifact file changed during verification",
      }[kind],
    ),
  );
const read = (path: string) =>
  readBounded(path, undefined, (kind) =>
    failure(
      path,
      kind === "bounds"
        ? "Playlist is outside its byte limit"
        : "Playlist changed during verification",
    ),
  );

const sameDescriptor = (
  actual: FileDescriptor,
  expected: FileDescriptor,
): boolean =>
  actual.identifier === expected.identifier &&
  actual.path === expected.path &&
  actual.contentType === expected.contentType &&
  actual.bytes === expected.bytes &&
  actual.sha256 === expected.sha256;

const verify = (artifact: TranscodeArtifact) =>
  Effect.gen(function* () {
    if (!/^[0-9a-f]{64}$/u.test(artifact.transcodeDigest))
      throw failure("transcodeDigest", "Transcode digest is invalid");
    if (
      !isAbsolute(artifact.rootPath) ||
      resolve(artifact.rootPath) !== artifact.rootPath ||
      (yield* joinedPromise(() => realpath(artifact.rootPath))) !==
        artifact.rootPath
    )
      throw failure(artifact.rootPath, "Artifact root path is not canonical");
    const root = yield* joinedPromise(() => lstat(artifact.rootPath));
    if (!root.isDirectory() || root.isSymbolicLink())
      throw failure(
        artifact.rootPath,
        "Artifact root must be a real directory",
      );
    const expectedIdentifiers = [
      MASTER_PLAYLIST,
      ...artifact.renditions.flatMap((item) => [
        item.playlist.identifier,
        item.init.identifier,
        ...item.segments.map((segment) => segment.identifier),
      ]),
    ];
    if (
      new Set(expectedIdentifiers).size !== expectedIdentifiers.length ||
      artifact.files.length !== expectedIdentifiers.length
    )
      throw failure(
        artifact.rootPath,
        "Artifact descriptors are duplicated or incomplete",
      );
    const actualEntries = (yield* joinedPromise(() =>
      readdir(artifact.rootPath, { withFileTypes: true }),
    ))
      .map((entry) => {
        if (!entry.isFile() || entry.isSymbolicLink())
          throw failure(entry.name, "Artifact entries must be regular files");
        return entry.name;
      })
      .sort();
    if (actualEntries.join("\0") !== [...expectedIdentifiers].sort().join("\0"))
      throw failure(artifact.rootPath, "Artifact inventory mismatch");
    if (artifact.renditions.length !== RENDITIONS.length)
      throw failure("renditions", "Rendition set is incomplete");
    // Collect every bounded read result, then report failures in descriptor order.
    const checked = yield* Effect.forEach(
      expectedIdentifiers,
      (identifier, index) =>
        Effect.gen(function* () {
          const declared = artifact.files[index];
          if (
            declared?.identifier !== identifier ||
            declared.path !== join(artifact.rootPath, identifier)
          )
            throw failure(identifier, "File order or path is not canonical");
          const measured = yield* joinedPromise(() =>
            inspect(
              declared.path,
              identifier.endsWith(".m3u8") ? 1_048_576 : undefined,
            ),
          );
          const expected: FileDescriptor = { ...declared, ...measured };
          if (!sameDescriptor(declared, expected))
            throw failure(identifier, "File size or digest mismatch");
          const contentType = identifier.endsWith(".m3u8")
            ? "application/vnd.apple.mpegurl"
            : "audio/mp4";
          if (declared.contentType !== contentType)
            throw failure(identifier, "File content type mismatch");
          return declared;
        }).pipe(
          Effect.catchDefect((error) => Effect.fail(error)),
          Effect.result,
        ),
      { concurrency: 4 },
    );
    const verifiedFiles: FileDescriptor[] = [];
    for (const result of checked) {
      if (Result.isFailure(result)) return yield* Effect.fail(result.failure);
      verifiedFiles.push(result.success);
    }
    const canonicalFiles = new Map(
      verifiedFiles.map((descriptor) => [descriptor.identifier, descriptor]),
    );
    const canonicalMaster = canonicalFiles.get(MASTER_PLAYLIST);
    if (
      canonicalMaster === undefined ||
      !sameDescriptor(artifact.masterPlaylist, canonicalMaster)
    )
      throw failure(MASTER_PLAYLIST, "Master descriptor is not canonical");
    validateMasterPlaylist(
      yield* joinedPromise(() =>
        read(join(artifact.rootPath, MASTER_PLAYLIST)),
      ),
      artifact.renditions,
    );
    const segmentCounts: number[] = [];
    for (
      let position = 0;
      position < artifact.renditions.length;
      position += 1
    ) {
      const rendition = artifact.renditions[position]!;
      const expected = RENDITIONS[position]!;
      if (
        rendition.id !== expected.id ||
        rendition.nominalBitrate !== expected.nominalBitrate ||
        rendition.codec !== CODEC ||
        (rendition.sampleRateHz !== 44_100 &&
          rendition.sampleRateHz !== 48_000) ||
        rendition.channels !== 2
      )
        throw failure(rendition.id, "Rendition ladder metadata mismatch");
      const canonicalPlaylist = canonicalFiles.get(`${rendition.id}.m3u8`);
      const canonicalInit = canonicalFiles.get(`${rendition.id}-init.mp4`);
      if (
        canonicalPlaylist === undefined ||
        canonicalInit === undefined ||
        !sameDescriptor(rendition.playlist, canonicalPlaylist) ||
        !sameDescriptor(rendition.init, canonicalInit)
      )
        throw failure(
          rendition.id,
          "Nested rendition descriptors are not canonical",
        );
      const playlist = parsePlaintextMediaPlaylist(
        yield* joinedPromise(() => read(rendition.playlist.path)),
      );
      if (
        playlist.mapIdentifier !== rendition.init.identifier ||
        playlist.segments.length !== rendition.segments.length
      )
        throw failure(rendition.id, "Playlist descriptor mismatch");
      for (
        let sequence = 0;
        sequence < playlist.segments.length;
        sequence += 1
      ) {
        const parsed = playlist.segments[sequence]!;
        const segment = rendition.segments[sequence]!;
        const canonicalSegment = canonicalFiles.get(segment.identifier);
        if (
          canonicalSegment === undefined ||
          !sameDescriptor(segment, canonicalSegment) ||
          segment.sequence !== sequence ||
          segment.identifier !==
            `${rendition.id}-${String(sequence).padStart(5, "0")}.m4s` ||
          parsed.sequence !== segment.sequence ||
          parsed.identifier !== segment.identifier ||
          parsed.durationMs !== segment.durationMs
        )
          throw failure(segment.identifier, "Segment timeline mismatch");
      }
      const bandwidth = calculateBandwidth(rendition.segments);
      if (
        bandwidth.averageBandwidth !== rendition.averageBandwidth ||
        bandwidth.peakBandwidth !== rendition.peakBandwidth
      )
        throw failure(rendition.id, "Stored-byte bandwidth mismatch");
      segmentCounts.push(rendition.segments.length);
    }
    if (!segmentCounts.every((count) => count === segmentCounts[0]))
      throw failure("renditions", "Rendition segment counts differ");
    if (
      !artifact.renditions.every(
        (rendition) =>
          rendition.sampleRateHz === artifact.renditions[0]?.sampleRateHz,
      )
    )
      throw failure("renditions", "Rendition sample rates differ");
    for (let sequence = 0; sequence < (segmentCounts[0] ?? 0); sequence += 1) {
      const durations = artifact.renditions.map(
        (item) => item.segments[sequence]?.durationMs,
      );
      if (!durations.every((duration) => duration === durations[0]))
        throw failure("renditions", "Rendition timelines differ");
    }
    return { ...artifact, files: verifiedFiles, verified: true as const };
  });

export const verifyArtifact = (
  artifact: TranscodeArtifact,
): Effect.Effect<VerifiedArtifact, ArtifactValidationError> =>
  verify(artifact).pipe(
    Effect.catchDefect((error) => Effect.fail(error)),
    Effect.mapError((error) =>
      error instanceof ArtifactValidationError
        ? error
        : failure(artifact.rootPath, "Artifact verification failed"),
    ),
  );
