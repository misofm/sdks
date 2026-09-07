# @misofm/transcoding

Deterministic, storage-neutral AAC-LC fMP4 HLS transcoding for Node 22/24 and Bun 1.4. The Effect v4 library performs local computation only; callers choose how to package, upload, address, or publish its verified loose files.

The public service has three operations: `transcode(request)`, `verify(artifact)`, and `cleanup(artifact)`.

```ts
const artifact =
  yield *
  transcoder.transcode({
    inputPath: "/absolute/input.wav",
    workspacePath: "/absolute/workspace",
    ffmpegPath: "/absolute/ffmpeg",
    ffprobePath: "/absolute/ffprobe",
    profile: { maxSegmentsPerRendition: 219 },
  });
```

The result is the `miso-hls/v1` layout defined by [`@misofm/streaming`](../streaming/README.md): aligned 96/160/256 kbps AAC-LC renditions, media playlists, and a master playlist, named as that contract specifies. The transcoder imports the ladder, identifiers, and segment policy from the contract rather than restating them, and `verify` checks its output against them. `artifact.files` is stable and contains absolute paths, byte lengths, SHA-256 hashes, and content types. Verification revalidates inventory, hashes, playlists, alignment, and stored-byte bandwidth. Cleanup explicitly removes only the canonical artifact directory.

FFmpeg and FFprobe are caller-supplied and fingerprinted. Workspaces use restrictive modes, locks, durable checkpoints, atomic writes and directory promotion, interruption-safe cleanup, and deterministic `transcodeDigest` identities. The optional `maxSegmentsPerRendition` is a generic consumer constraint.

All three service methods return composable Effects; run the runtime once at the application boundary. Finalization composes identity calculation, bounded file copying, atomic promotion, and verification in the caller's fiber. `fileConcurrency` defaults to 4 and accepts integers from 1 through 16. Verification hashes at most four files concurrently and reports the first mismatch in descriptor order. Interrupting an operation joins started native file work before staging cleanup or workspace lock release; durable promotion and lock release finish without interruption. Native process interruption waits for termination, escalating to force-kill when needed.

Filesystem helpers are package-local and retain no-follow opens, regular-file checks, bounded reads, streaming hashes, and grow/shrink detection. Playlist reads reject growth beyond the size observed at open. Domain failures retain their tagged error types (`ArtifactValidationError`, `WorkspaceIoError`, and the other exported errors). Parsing and deterministic playlist rendering remain synchronous. The package uses Effect and `@effect/platform-node` 4.0.0-rc.112 and the `@misofm/streaming` 0.2.0 artifact contract.

The package never shells out to publication tools and contains no network client, credentials, package index, or provider-specific metadata.
