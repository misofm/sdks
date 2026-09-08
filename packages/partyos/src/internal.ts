// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The single boundary between generated BCS-parse output (snake_case, Move-shaped)
// and the public camelCase types.

import { fromBase64 } from "@mysten/sui/utils";
import type { Party } from "./types.ts";

// deno-lint-ignore no-explicit-any -- generated parse output is loosely typed
export function mapParty(id: string, d: any): Party {
  const kind = d.kind;
  const createdAtMs = Number(d.created_at_ms);
  // PartyKind is `Individual | Group(VecSet<ID>)`. The enum parses to
  // `{ $kind, Individual? , Group? }`; Group's payload is a VecSet `{ contents }`.
  const groupPayload = kind?.Group ?? (kind?.$kind === "Group" ? kind.value : undefined);
  if (groupPayload !== undefined) {
    const contents = groupPayload?.contents ?? groupPayload ?? [];
    const members = (Array.isArray(contents) ? contents : []).map((m: unknown) =>
      typeof m === "string" ? m : (m as { id?: string })?.id ?? String(m),
    );
    return { id, kind: "group", name: d.name, members, createdAtMs };
  }
  return { id, kind: "individual", name: d.name, createdAtMs };
}

/** Normalizes a dynamic-field key's BCS bytes (Uint8Array or base64 string). */
export function keyBytes(bcs: unknown): Uint8Array {
  return typeof bcs === "string" ? fromBase64(bcs) : (bcs as Uint8Array);
}
