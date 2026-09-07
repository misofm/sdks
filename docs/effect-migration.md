# Effect SDK migration

Tracking audit: [misofm/sdks#23](https://github.com/misofm/sdks/issues/23).
All SDKs use the exact Effect v4 release candidate `4.0.0-rc.112`.
Install that version alongside an SDK when composing its Effect APIs. Use
TypeScript 5.9 or newer. Transcoding also requires the matching
`@effect/platform-node` release candidate.

## Compose workflows

Domain reads use `get`, raw HTTP uses `fetch`, transaction construction uses
`build`, and submission uses `execute` or `signAndExecute`. Effect programs add
the suffix `Effect`; existing Promise names and synchronous builders remain.

```ts
import { Effect } from "effect";
import { getCompositionsByIdsEffect } from "@misofm/protocol/queries";
import { runPromise } from "@misofm/utils/effect";

// client is a configured Mysten ClientWithCoreApi.
const program = Effect.gen(function* () {
  const compositions = yield* getCompositionsByIdsEffect(client, compositionIds);
  return Object.values(compositions).map((composition) => composition.title);
});
const titles = await runPromise(program);
```

Inside workflows, yield another Effect directly. Execute the runtime once at
the application or Promise boundary. Use bounded `Effect.forEach` for
independent work and sequential generators when steps share mutable state.
Transaction thunks mutate the same transaction and must execute sequentially.
Synchronous parsers and transaction command builders remain synchronous.

## Failures and cancellation

Protocol, platform, and streaming foreign operations expose `SdkError` with
`_tag: "SdkError"`, a named `operation`, and the original `cause`. Domain error
objects remain inspectable through the cause. Authentication workflows expose
`AuthorizationError = MisoAuthError | SdkError`, keeping domain failures directly
discriminable by their existing error codes.
`@misofm/utils/effect`'s `runPromise` restores original rejection values for
existing Promise callers. `Effect.runPromise` directly exposes the Effect
failure instead. Transcoding retains its existing domain error union.

```ts
const observed = program.pipe(Effect.tapError((error) =>
  Effect.logError(error.operation, error.cause)));
```

Missing optional extensions return `null`; established collection readers use
empty collections for absence. Transport failures retain each operation's
documented propagation or optional-enrichment policy. Required object reads
still fail on missing objects. Repeated pagination cursors fail clearly.

Cancellation interrupts Effect composition. Foreign I/O is aborted only where
its adapter supports and forwards a signal. Streaming warm operations forward
the signal through fetch and body draining. Transcoding joins native work
before releasing locks or cleaning staging directories. Cancellation never
implies that a submitted blockchain transaction was rolled back: reconcile
ambiguous transaction outcomes before deciding what to do next. SDK submission
and authenticated mutations do not retry automatically.

## Downstream considerations

- Add the exact Effect peer and use TypeScript 5.9+. Keep Effect package
  versions synchronized.
- The new `@misofm/utils@0.1.0` package must be published before dependent SDK
  releases. Platform and transcoding now use streaming `0.2.0` consistently.
- Protocol blob-ID decoding now follows the same strict canonical base64url
  policy as platform: no padding, alternate spelling, or trailing unused bits.
- Streaming warms at most six items concurrently by default; `concurrency`
  allows callers to choose another positive safe integer. Non-2xx responses
  are still drained without an HTTP-status failure.
- Share publishing and initialization default to eight concurrent batches;
  the trailing options argument accepts `concurrency`. Invalid batch limits
  and non-integer publication counts fail before submission. Started batches
  finish their submission and completion callback before interruption returns.
- Player engine-load failures can be retried. Reusing an audio element closes
  the previous stream; stale handles cannot clear its replacement's source.
  Native `play()` still runs synchronously to preserve browser user gestures.

Import streaming constants from its root and browser playback from `/player`.
`hls.js` remains an optional peer; install it when using the player and its
types. Utilities' `/effect` entry point is separate from pure numeric and
encoding entry points. No Node filesystem code is added to browser utilities.

## Verification

Run `bun run typecheck`, `bun run test`, `bun run build`, then
`bun run test:consumer`. The last check installs tarballs in a fresh temporary
directory, checks every explicit entry point with TypeScript 5.9 and strict
library checking, and imports them using Node. Generated protocol contract
bindings are excluded from manual refactoring.

Transcoding's pinned FFmpeg byte-golden and real browser checks run separately
in `.github/workflows/transcoding-ffmpeg.yml`; unit tests do not substitute for
that environment.
