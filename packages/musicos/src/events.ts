// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Raw BCS decoders for object-model execution events, grouped by package
 * responsibility. Each one preserves the generated Move field names and
 * nested layouts exactly — the safe indexer boundary — and fails with
 * `DecodeError` instead of throwing. The camelCase convenience decoders live
 * in `parsers.ts`.
 */
import type { Schema } from "effect";
import { Effect } from "effect";
import { DecodeError, type Event } from "@unconfirmed/sui-effect";
import { SuiSchema } from "@unconfirmed/sui-effect";
import * as schema from "./schema.ts";
import { matchesEventSuffix, type EventDecoder } from "./parsers.ts";

function decoder<T>(codec: Schema.Codec<T, Uint8Array>, suffix: string): EventDecoder<T> {
  return ((input: Uint8Array | Event) => {
    if (input instanceof Uint8Array) {
      return SuiSchema.decode(codec, input);
    }
    if (!matchesEventSuffix(input.eventType, suffix)) {
      return Effect.fail(
        new DecodeError({ expectedType: suffix, issue: `event type ${input.eventType} does not name ${suffix}` }),
      );
    }
    return SuiSchema.decode(codec, input.bcs, { actualType: input.eventType });
  }) as EventDecoder<T>;
}

/**
 * Event decoder registry grouped by package responsibility. Raw generated
 * snake_case fields and BCS layouts; the camelCase convenience wrappers live
 * in `parsers.ts`. The legacy grant entry remains decodable for historical
 * events but is dormant in current recording creation.
 */
export const eventParsers = {
  core: {
    compositionCreated: decoder(schema.compositionCreatedEventContent, "composition::CompositionCreatedEvent"),
    compositionPublished: decoder(schema.compositionPublishedEventContent, "composition::CompositionPublishedEvent"),
    recordingCreated: decoder(schema.recordingCreatedEventContent, "recording::RecordingCreatedEvent"),
    recordingPublished: decoder(schema.recordingPublishedEventContent, "recording::RecordingPublishedEvent"),
    compositionSharesGranted: decoder(schema.compositionSharesGrantedEventContent, "recording::CompositionSharesGrantedEvent"),
    releaseCreated: decoder(schema.releaseCreatedEventContent, "release::ReleaseCreatedEvent"),
    releasePublished: decoder(schema.releasePublishedEventContent, "release::ReleasePublishedEvent"),
    releaseRegistryCreated: decoder(schema.releaseRegistryCreatedEventContent, "release::ReleaseRegistryCreatedEvent"),
  },
} as const;

// ============================================================================
// Deprecated compatibility
// ============================================================================
//
// `decodeEvent` and `BcsParser` never depended on `@misofm/effect`'s Sui
// wiring — they are a generic "run a `{ parse }` codec over bytes" pair that
// platform's OWN generated event codecs use for typing, independent of
// anything musicos decodes for itself. The issue that converted this package
// (misofm/sdks#34) retired both from musicos's own vocabulary in favour of
// `SuiSchema.decode`, but platform still imports them from
// `@misofm/musicos/events` / `@misofm/musicos/queries` (`packages/platform/src/events.ts`),
// and platform's own conversion is a separate issue (#35). Kept, deprecated,
// until then.

/** @deprecated A `{ parse }` codec, e.g. a generated `MoveStruct` or `MoveEnum`. Kept for platform's own event codecs; not used by musicos itself. */
export interface BcsParser<T> {
  parse(bytes: Uint8Array): T;
}

/** @deprecated Use `SuiSchema.decode` from `sui-effect`. Kept for platform's own event codecs; not used by musicos itself. */
export function decodeEvent<T>(codec: BcsParser<T>, bytes: Uint8Array): T {
  return codec.parse(bytes);
}
