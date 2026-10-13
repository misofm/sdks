# Changelog

All notable changes to `@misofm/transcoding`, newest first.

## 0.5.0

Moves the package from Effect `4.0.0-rc.112` to stable Effect `4.0.3` and
`@effect/platform-node` `4.0.3`, on top of `@misofm/streaming` 0.4.0. The public API and the
transcode output are unchanged: no export was added, removed or re-typed (the built `.d.ts`
files are identical to 0.4.0), the source needed no change, and the pinned-FFmpeg golden
and the cancellation test produce the same results.

### Changed (breaking)

- **Peers `effect` and `@effect/platform-node` are now `>=4.0.3 <4.1`** (were exactly
  `4.0.0-rc.112`). Release candidates are no longer supported; stay on 0.4.x for
  `effect@4.0.0-rc.112`. Move both packages together: a mixed install fails to resolve.
- Dependency `@misofm/streaming` moves to `0.4.0` (exact, as before).

### Behaviour changes to be aware of (from Effect 4.0.x)

Audit of this package: it uses no `partition`, `Effect.retry`, `Effect.timeout`, `Stream`
operator or `Schema`; its errors are `Data.TaggedError`s. It does depend on interruption
semantics (`Effect.uninterruptible`, `Effect.acquireUseRelease` for the workspace lock,
`Effect.onError` cleanup, `Fiber.interrupt` of a running transcode), which 4.0.x changed:

- Pending interruptions are preserved when an uninterruptible effect fails, and typed
  failures are dropped (defects kept) when an interruption skips recovery handlers
  (Effect #8652).
- `Effect.acquireUseRelease` releases the resource when the `use` callback throws
  synchronously (Effect #8020); `Scope.close` finalizers run uninterruptibly.
- Sibling and cleanup failures are kept alongside interruption in `Effect.forEach`
  (Effect #8585).

The ffmpeg integration test (cancel a running transcode, then acquire the workspace lock;
byte-golden artifacts under the pinned FFmpeg) passes on both the rc.112 and the 4.0.3
builds. If you wrap a transcode in your own `Effect.race`/timeout, note that losers that are
still starting are now interrupted.

### Migrating from 0.4.x

1. Move the whole Effect release train to stable together: `effect@4.0.3` and
   `@effect/platform-node@4.0.3` (and any other `@effect/*` package). Pin `4.0.x`
   explicitly; the `rc` dist-tag still points at a release candidate.
2. Nothing to change in code that imports from `@misofm/transcoding`.
3. Review `partition`/`separate` destructuring in your own code: 4.0.x returns
   `[successes, failures]`.
