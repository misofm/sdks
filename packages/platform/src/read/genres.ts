// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Genre name resolution. `party.getGenres` returns `Genre` OBJECT IDS; each Genre
// object carries a screaming-snake name ("HIP_HOP"). There is no id→name table
// anywhere off-chain, so the names are read from the objects and humanized.

import { Effect, Result } from "effect";
import { ObjectId, Sui, SuiSchema } from "sui-effect";
import { Genre as GenreBcs } from "../contracts/genre/genre.ts";

/** "HIP_HOP" → "Hip Hop". */
function humanize(name: string): string {
  return name
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Resolve `Genre` object ids to display names. Best-effort: an id that fails to
 * read, or whose content does not parse as a `Genre`, is dropped rather than
 * failing the artist page around it — the WP2 behaviour change named in
 * misofm/sdks#35 ("`resolveGenreNames` on the same batch skips it") now comes
 * for free from `sui.getObjects`' per-item `Result` instead of a hand-rolled
 * `try`/`catch` around a `Map`.
 *
 * Never fails.
 */
export const resolveGenreNames = Effect.fn("resolveGenreNames")(function* (
  ids: ReadonlyArray<string>,
): Effect.fn.Return<string[], never, Sui> {
  if (ids.length === 0) return [];
  const sui = yield* Sui;
  const results = yield* sui.getObjects(ids.map((id) => ObjectId.make(id)), { schema: SuiSchema.bcs(GenreBcs) }).pipe(
    // A transport failure across the whole batch is soft here too — a genre
    // list that could not be read at all still must not fail the page it
    // decorates.
    Effect.catch(() => Effect.succeed([])),
  );
  const out: string[] = [];
  for (const result of results) {
    if (!Result.isSuccess(result)) continue;
    const name = result.success.content.name;
    if (name) out.push(humanize(name));
  }
  return out;
});
