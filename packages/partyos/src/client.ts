// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The `/client` subpath: `Partyos` and its derived Promise registration
// `partyos()`. (The predecessor `PartyosClient` — still exported from the
// package root for `@misofm/platform`, see `./legacy-client.ts` — is not
// re-exported here: `/client` is the target shape's surface.)
export { Partyos, type BoundBuilders, type PartyosService } from "./Partyos.ts";
export { partyos, type PartyosOptions } from "./extension.ts";
