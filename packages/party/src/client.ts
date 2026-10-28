// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The `/client` subpath: `PartyProtocol` and its derived Promise registration
// `partyProtocol()`. The predecessor `PartyosClient` is removed entirely (see
// README's "Migrating from `PartyosClient`"), not merely absent from here.
export { PartyProtocol, type BoundBuilders, type PartyProtocolService } from "./PartyProtocol.ts";
export { partyProtocol, type PartyProtocolOptions } from "./extension.ts";
