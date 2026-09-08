// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Genre name resolution. `party.getGenres` returns `Genre` OBJECT IDS; each Genre
// object carries a screaming-snake name ("HIP_HOP"). There is no id→name table
// anywhere off-chain, so the names are read from the objects and humanized.

import { Effect } from "effect";
import { getObjectsContent, type SuiClient } from "@misofm/effect";
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
 * failing the artist page around it.
 */
export const resolveGenreNames = Effect.fn("resolveGenreNames")(function* (
  ids: string[],
): Effect.fn.Return<string[], never, SuiClient> {
  if (ids.length === 0) return [];
  return yield* getObjectsContent(ids).pipe(
    Effect.map((contentById) => {
      const out: string[] = [];
      for (const { content } of contentById.values()) {
        try {
          const name = GenreBcs.parse(content).name;
          if (name) out.push(humanize(name));
        } catch {
          // Malformed content — drop this genre rather than fail the page.
        }
      }
      return out;
    }),
    Effect.catch(() => Effect.succeed([])),
  );
});
