// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * BCS decoders for object-model execution events. Each decoder preserves the
 * generated Move field names and nested layouts exactly, which is the safe
 * indexer boundary; camelCase convenience parsers live in `parsers.ts`.
 */

import type { BcsParser } from "@misofm/effect";
import * as composition from "./contracts/musicos/composition.ts";
import * as recording from "./contracts/musicos/recording.ts";
import * as release from "./contracts/musicos/release.ts";

/** Decode raw event BCS with the corresponding generated codec. */
export function decodeEvent<T>(codec: BcsParser<T>, bytes: Uint8Array): T {
  return codec.parse(bytes);
}

function decoder<T>(codec: BcsParser<T>) {
  return (bytes: Uint8Array): T => decodeEvent(codec, bytes);
}

/**
 * Event decoder registry grouped by package responsibility. These decoders
 * preserve generated raw snake_case fields and BCS layouts. The camelCase
 * convenience wrappers live in `parsers.ts`; the legacy grant entry remains
 * available for historical events but is dormant in current recording creation.
 */
export const eventParsers = {
  core: {
    compositionCreated: decoder(composition.CompositionCreatedEvent),
    compositionPublished: decoder(composition.CompositionPublishedEvent),
    recordingCreated: decoder(recording.RecordingCreatedEvent),
    recordingPublished: decoder(recording.RecordingPublishedEvent),
    compositionSharesGranted: decoder(recording.CompositionSharesGrantedEvent),
    releaseCreated: decoder(release.ReleaseCreatedEvent),
    releasePublished: decoder(release.ReleasePublishedEvent),
    releaseRegistryCreated: decoder(release.ReleaseRegistryCreatedEvent),
  },
} as const;
