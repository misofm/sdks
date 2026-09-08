// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { eventParsers } from "../src/events.ts";
import { ReleaseRegistryCreatedEvent } from "../src/contracts/musicos/release.ts";

const A = "0x" + "12".repeat(32);
const B = "0x" + "34".repeat(32);

test("core-registry event decoder round-trips the current ABI", () => {
  const registry = ReleaseRegistryCreatedEvent.serialize({
    registry_id: A,
    created_by: B,
  }).toBytes();

  expect(eventParsers.core.releaseRegistryCreated(registry)).toEqual({
    registry_id: A,
    created_by: B,
  });
});
