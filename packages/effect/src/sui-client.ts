// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The Sui client services every `@misofm/*` SDK reaches through the Requirements
// channel instead of a `client` parameter. There is exactly one `SuiClient`
// service tag (and one `SuiGraphQL` tag) across the SDKs, so a program built
// from primitives in different packages still needs only one `Layer.provide`.

import { Context, Layer } from "effect";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";

/** The unified Core API client (gRPC / JSON-RPC / GraphQL transports all satisfy it). */
export class SuiClient extends Context.Service<SuiClient, ClientWithCoreApi>()("@misofm/effect/SuiClient") {
  /** Provides a concrete `ClientWithCoreApi` as the `SuiClient` service. */
  static layer(client: ClientWithCoreApi): Layer.Layer<SuiClient> {
    return Layer.succeed(SuiClient, client);
  }
}

/** The optional GraphQL client, required only by type-discovery reads. */
export class SuiGraphQL extends Context.Service<SuiGraphQL, SuiGraphQLClient>()("@misofm/effect/SuiGraphQL") {
  /** Provides a concrete `SuiGraphQLClient` as the `SuiGraphQL` service. */
  static layer(client: SuiGraphQLClient): Layer.Layer<SuiGraphQL> {
    return Layer.succeed(SuiGraphQL, client);
  }
}
