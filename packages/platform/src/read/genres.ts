// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { toPromise, tryPromise, workflow, type SdkError } from "@misofm/utils/effect";
import { Effect } from "effect";
//
// Genre name resolution. `party.getGenres` returns `Genre` OBJECT IDS; each Genre
// object carries a screaming-snake name ("HIP_HOP"). There is no id→name table
// anywhere off-chain, so the names are read from the objects and humanized.

import type { MisoClient } from "./client.ts";

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
 * read is dropped rather than failing the artist page around it.
 */
export function resolveGenreNamesEffect(client: MisoClient, ids: string[]): Effect.Effect<string[], SdkError> {
  return workflow("resolveGenreNames", function* () {
    if (ids.length === 0) return [];
    const { objects } = yield* tryPromise("resolveGenreNames", (signal) =>
      client.protocol.core.getObjects({ signal, objectIds: ids, include: { json: true } }),
    );
    const out: string[] = [];
    for (const o of objects) {
      if (o instanceof Error) continue;
      const name = (o.json as { name?: unknown } | null)?.name;
      if (typeof name === "string" && name) out.push(humanize(name));
    }
    return out;
  }).pipe(Effect.catch(() => Effect.succeed([])));
}

export const resolveGenreNames = toPromise(resolveGenreNamesEffect);
