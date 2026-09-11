// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The `/client` subpath: `Partyos` and its derived Promise registration
// `partyos()`. The predecessor `PartyosClient` is removed entirely (see
// README's "Migrating from `PartyosClient`"), not merely absent from here.
export { Partyos, type BoundBuilders, type PartyosService } from "./Partyos.ts";
export { partyos, type PartyosOptions } from "./extension.ts";
