// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Shared read plumbing for the platform reads.

// `isNotFound` is the protocol SDK's — the not-found taxonomy is a property of
// the Sui transports, not of any one package's objects, so it is defined once in
// `@misofm/protocol` and re-exported here for the platform readers.
export { isNotFound } from "@misofm/protocol";

import { tryPromise, workflow } from "@misofm/utils/effect";
import type { ClientWithCoreApi } from "@mysten/sui/client";

/** One bulk read for derived extension fields, with explicit malformed-field policy. */
export function readFieldsEffect<T>(
  client: ClientWithCoreApi,
  idsInput: readonly string[],
  fieldIdOf: (id: string) => string,
  parse: (content: Uint8Array) => T | null,
  malformed: "fail" | "omit" = "fail",
) {
  return workflow("readExtensionFields", function* () {
    const ids = [...new Set(idsInput)];
    const out: Partial<Record<string, T>> = {};
    if (ids.length === 0) return out;
    const { objects } = yield* tryPromise("readExtensionFields", (signal) =>
      client.core.getObjects({
        objectIds: ids.map(fieldIdOf),
        include: { content: true },
        signal,
      }),
    );
    objects.forEach((object, index) => {
      const id = ids[index];
      if (!id || object instanceof Error || !object.content) return;
      try {
        const value = parse(object.content);
        if (value !== null) out[id] = value;
      } catch (error) {
        if (malformed === "fail") throw error;
      }
    });
    return out;
  });
}
