// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The single boundary between generated BCS-parse output (snake_case, Move-shaped)
// and the public camelCase types.

import { bcs } from "@mysten/sui/bcs";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import type { Role } from "./extensions/roles.ts";
import type { Cta, Media, Profile } from "./types.ts";

const u256 = bcs.u256();

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/=*$/, "").replaceAll("+", "-").replaceAll("/", "_");
}

function fromBase64Url(value: string): Uint8Array {
  let base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  while (base64.length % 4) base64 += "=";
  return fromBase64(base64);
}

export function u256ToB64Url(value: bigint | string): string {
  return toBase64Url(u256.serialize(BigInt(value)).toBytes());
}

export function b64UrlToU256(value: string): string {
  return u256.parse(fromBase64Url(value)).toString();
}

/** `CountryCode` / `LanguageCode` are single-field tuple structs → parse to a 1-element array. */
function unwrapCode(v: unknown): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? (v[0] as string) : (v as string);
}

// deno-lint-ignore no-explicit-any -- generated parse output is loosely typed
export function mapProfile(partyId: string, d: any): Profile {
  const country = unwrapCode(d.country);
  return {
    partyId,
    bioShort: d.bio_short,
    ...(d.bio_long == null ? {} : { bioLong: d.bio_long }),
    ...(country === undefined ? {} : { country }),
    languages: Array.isArray(d.languages)
      ? d.languages.map((l: unknown) => unwrapCode(l)).filter((c: unknown): c is string => Boolean(c))
      : [],
  };
}

// On-chain `Media` holds the quilt blob id as a u256 (decimal string from BCS);
// expose it in Walrus's base64url form so callers can build aggregator URLs.
// deno-lint-ignore no-explicit-any -- generated parse output is loosely typed
export function mapMedia(partyId: string, d: any): Media {
  return { partyId, quiltId: u256ToB64Url(String(d.quilt)) };
}

// The display name of each canonical `ArtistRole` variant (matches Move's
// `role_name` — note `Dj` → "DJ"). `Custom` carries its own string.
const CANONICAL_ROLE_NAMES: Record<string, string> = {
  Artist: "Artist",
  Producer: "Producer",
  Dj: "DJ",
  Composer: "Composer",
  Songwriter: "Songwriter",
  Band: "Band",
  Label: "Label",
  Collective: "Collective",
};

const CANONICAL_ROLE_KINDS: Record<string, Role["kind"]> = {
  Artist: "artist",
  Producer: "producer",
  Dj: "dj",
  Composer: "composer",
  Songwriter: "songwriter",
  Band: "band",
  Label: "label",
  Collective: "collective",
};

/** One exact role value → its compatibility display name. */
export function roleDisplayName(role: Role): string {
  if (role.kind === "custom") return role.name;
  const generatedKind = Object.entries(CANONICAL_ROLE_KINDS).find(([, kind]) => kind === role.kind)?.[0];
  return generatedKind === undefined ? role.kind : CANONICAL_ROLE_NAMES[generatedKind]!;
}

/** A party's `VecSet<ArtistRole>` → exact public role values. */
// deno-lint-ignore no-explicit-any -- generated parse output is loosely typed
export function mapRoleValues(d: any): Role[] {
  const contents = Array.isArray(d) ? d : d?.contents ?? d?.roles?.contents ?? [];
  return (Array.isArray(contents) ? contents : []).map((role: any): Role => {
    if (role?.$kind === "Custom") return { kind: "custom", name: String(role.Custom ?? role.value ?? "") };
    const kind = CANONICAL_ROLE_KINDS[role?.$kind];
    if (kind === undefined || kind === "custom") {
      throw new TypeError(`unknown ArtistRole variant ${String(role?.$kind ?? "")}`);
    }
    return { kind };
  });
}

/** A party's `VecSet<ArtistRole>` → role display names. */
// deno-lint-ignore no-explicit-any -- generated parse output is loosely typed
export function mapRoles(d: any): string[] {
  return mapRoleValues(d).map(roleDisplayName);
}

/** A party's `VecSet<String>` tag set → tag strings. */
// deno-lint-ignore no-explicit-any -- generated parse output is loosely typed
export function mapTags(d: any): string[] {
  const contents = Array.isArray(d) ? d : d?.contents ?? d?.tags?.contents ?? [];
  return (Array.isArray(contents) ? contents : []).map((t: unknown) => String(t));
}

/** A party's `VecSet<ID>` genre set → genre object id strings. */
// deno-lint-ignore no-explicit-any -- generated parse output is loosely typed
export function mapGenres(d: any): string[] {
  const contents = Array.isArray(d) ? d : d?.contents ?? d?.genres?.contents ?? [];
  return (Array.isArray(contents) ? contents : []).map((g: unknown) => String(g));
}

/** A party's `vector<Cta>` → CTA entries, preserving order (position is priority). */
// deno-lint-ignore no-explicit-any -- generated parse output is loosely typed
export function mapCtas(d: any): Cta[] {
  return (Array.isArray(d) ? d : []).map((c: any) => ({ label: String(c.label), url: String(c.url) }));
}
