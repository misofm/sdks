// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * BCS decoders for object-model execution events outside the legacy core
 * convenience parsers. Each decoder preserves the generated Move field names
 * and nested layouts exactly, which is the safe indexer boundary.
 */

import type { BcsParser } from "@misofm/effect";
import * as release from "./contracts/musicos/release.ts";

/** Decode raw event BCS with the corresponding generated codec. */
export function decodeEvent<T>(codec: BcsParser<T>, bytes: Uint8Array): T {
  return codec.parse(bytes);
}

function decoder<T>(codec: BcsParser<T>) {
  return (bytes: Uint8Array): T => decodeEvent(codec, bytes);
}

/**
 * Event decoder registry grouped by package responsibility. Core publication
 * events retain camel-case wrappers in `parsers.ts`.
 */
export const eventParsers = {
  core: {
    releaseRegistryCreated: decoder(release.ReleaseRegistryCreatedEvent),
  },
} as const;
