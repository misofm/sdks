// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Data, Effect } from "effect";

/** A foreign failure with a named operation and its original rejection value. */
export class SdkError extends Data.TaggedError("SdkError")<{
  readonly operation: string;
  readonly cause: unknown;
  readonly message: string;
}> {
  constructor(operation: string, cause: unknown) {
    super({ operation, cause, message: cause instanceof Error ? cause.message : String(cause) });
  }
}

const error = (operation: string, cause: unknown): SdkError =>
  cause instanceof SdkError ? cause : new SdkError(operation, cause);

/** Suspend a throwing synchronous leaf into the typed failure channel. */
export function trySync<A>(operation: string, evaluate: () => A): Effect.Effect<A, SdkError> {
  return Effect.try({ try: evaluate, catch: (cause) => error(operation, cause) });
}

/** Suspend a foreign Promise leaf; pass the supplied signal to cancellable I/O. */
export function tryPromise<A>(
  operation: string,
  evaluate: (signal: AbortSignal) => PromiseLike<A>,
): Effect.Effect<A, SdkError> {
  return Effect.tryPromise({ try: evaluate, catch: (cause) => error(operation, cause) });
}

/** Compose SDK leaves and capture synchronous codec/validation exceptions.
 * Interruption remains interruption; only thrown defects enter the failure channel.
 */
export function workflow<A>(
  operation: string,
  body: () => Generator<Effect.Effect<unknown, SdkError>, A, never>,
): Effect.Effect<A, SdkError> {
  return Effect.gen(body).pipe(Effect.catchDefect((cause) => Effect.fail(error(operation, cause))));
}

/** Run only at a public Promise boundary, preserving foreign rejection identity. */
export function runPromise<A, E>(program: Effect.Effect<A, E>, options?: Effect.RunOptions): Promise<A> {
  return Effect.runPromise(Effect.mapError(program, (cause) => cause instanceof SdkError ? cause.cause : cause), options);
}

/** Preserve an operation's labeled arguments and result in a reusable Promise adapter. */
export function toPromise<Args extends unknown[], A, E>(
  operation: (...args: Args) => Effect.Effect<A, E>,
): (...args: Args) => Promise<A> {
  return (...args) => runPromise(operation(...args));
}
