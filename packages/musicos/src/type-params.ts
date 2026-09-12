// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure helpers for reading a generic Move type's parameters off its
// on-chain tag. Used by `Musicos` to recover a share type that only exists as
// a phantom type parameter (never stored in BCS content), and kept as
// standalone exports because platform composes them directly.

/**
 * Extracts the type parameter `T` from `package::module::Type<T>`. For multi-
 * parameter types this returns everything between the outer angle brackets —
 * use {@link extractTypeParams2} to split two top-level parameters.
 */
export function extractTypeParam(objectType: string): string {
  const match = objectType.match(/<(.+)>$/);
  if (!match?.[1])
    throw new Error(`Could not extract type parameter from: ${objectType}`);
  return match[1];
}

/** Splits the two top-level type parameters of `pkg::mod::Type<A, B>`. */
export function extractTypeParams2(objectType: string): [string, string] {
  const inner = extractTypeParam(objectType);
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "<") depth++;
    else if (ch === ">") depth--;
    else if (ch === "," && depth === 0)
      return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
  }
  throw new Error(`Expected two type parameters in: ${objectType}`);
}
