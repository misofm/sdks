// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The client extension — Sui's recommended shape for an SDK
// (https://sdk.mystenlabs.com/sui/sdk-building), now derived rather than
// hand-maintained (misofm/sdks#35, WP6 "facade derivation"). Register it once
// and the platform layer hangs off whatever client you already have:
//
//   const client = new SuiGrpcClient({ network, baseUrl }).$extend(miso());
//
//   await client.miso.getSale({ releaseId, edition, currencyType });
//   await client.miso.protocol.getReleaseById(releaseId);
//   tx.add(client.miso.tx.purchaseRecord({ releaseId, edition, currencyType,
//     paymentAmount, expectedPricing, recipient }));
//
// `SuiExtension.fromService` walks `MisoService` once: every `Effect` member
// becomes a Promise method, `tx`/`ids`/`call`/`bcs`/`vault`/`deployment`
// (nested namespaces) are mapped recursively, and a rejection is the same
// tagged error instance an Effect caller would have caught. Namespaces follow
// the guide's convention: top-level methods read and parse, `tx` builds
// transactions without executing, `bcs` exposes the generated struct
// definitions, `ids` is the address math that replaces a registry, `call` is
// generated type-safe Move calls, `vault` is Vault/Action/plugin builders and
// reads, `protocol`/`party` are the converted `@misofm/musicos`/
// `@misofm/partyos` surfaces.
import type { ClientWithCoreApi, SuiClientRegistration } from "@mysten/sui/client";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { Effect, Layer } from "effect";
import { Sui, SuiGraphQL } from "sui-effect";
import { SuiExtension, type ExtensionFace, type PromiseFace } from "sui-effect/extension";
import { getMisoPlatformDeployment, type MisoPlatformDeployment } from "./deployments.ts";
import { Miso, type MisoService } from "./Miso.ts";

export { MisoChainIdentifierMismatchError, MisoNetworkMismatchError } from "./errors.ts";

/**
 * The type of `client.miso` after `client.$extend(miso())` — the derived
 * Promise face of {@link MisoService} plus `$ready`/`$dispose`/`dispose`.
 * Replaces the predecessor `MisoPlatformClient` class as the public name for
 * "the complete Miso client".
 */
export type MisoClient = PromiseFace<MisoService> & ExtensionFace;

/** What {@link miso} needs to know. Same options shape as the sibling extensions (`partyos()`, `musicos()`). */
export interface MisoOptions<Name extends string = "miso"> {
  /** The property the extension takes on the client: `client.<name>`. Defaults to `"miso"`. */
  readonly name?: Name;
  /** Explicit deployment. Omit to use the bundled manifest for the client's network. */
  readonly deployment?: MisoPlatformDeployment;
  /**
   * The chain identifier the node must report, and the id a `warm`
   * registration takes when the client's network is not `mainnet` or
   * `testnet` (`docs/extensions.md` §7, "Synchronous members, `$ready` and
   * `warm`" — `warm.chainId`, or `sui.chainId`, or the built-in table entry
   * for `mainnet`/`testnet`, and nothing else). Required for `miso()` to
   * build synchronously on `devnet`, `localnet`, or a custom network; omit
   * it only when the client is on `mainnet` or `testnet`, where the
   * built-in table already supplies one. Without it on an unbundled
   * network, `client.$extend(miso())` throws synchronously.
   */
  readonly chainId?: string;
  /**
   * A `SuiGraphQLClient` for the type-discovery reads (`read.*`, the catalog
   * views) that need one. Omit to register with `SuiGraphQL.layerUnavailable`
   * — every synchronous and Sui-only member still works; a GraphQL-backed
   * read rejects with `GraphQLUnavailable` instead.
   */
  readonly graphqlClient?: SuiGraphQLClient;
}

/**
 * The registration a Promise consumer passes to `client.$extend(...)`.
 *
 * ```ts
 * const client = new SuiGrpcClient({ network: "testnet" }).$extend(miso());
 * const pressing = await client.miso.getPressing(pressingId);
 * const recipe = client.miso.tx.purchaseRecord({ releaseId, edition, currencyType, paymentAmount, expectedPricing, recipient });
 * await client.miso.dispose();
 * ```
 *
 * `warm` is given because `tx`/`ids`/`call`/`bcs`/`vault`/`deployment` are
 * synchronous members a consumer may read the moment it registers, and
 * `Miso.layer` touches no network at build for a known chain id
 * (`docs/extensions.md` §7, "Synchronous members, `$ready` and `warm`").
 * `options.chainId` is forwarded to both `warm` (so `register` can build
 * synchronously without reading the chain) and `sui` (so the same id is
 * asserted against the node) — without it on a `devnet`, `localnet`, or
 * custom network, `warm` throws for any network outside the built-in
 * `mainnet`/`testnet` table.
 *
 * `ready` stays on the service, deprecated: `await client.miso.ready()`
 * keeps compiling and working as a `$ready()`-style warm-up for a consumer
 * migrating off the predecessor's own `ready()` idiom (`docs/CONVERSION.md`).
 */
export const miso = <const Name extends string = "miso">(
  options: MisoOptions<Name> = {},
): SuiClientRegistration<ClientWithCoreApi, Name, PromiseFace<MisoService> & ExtensionFace> =>
  SuiExtension.fromService(Miso, {
    name: (options.name ?? "miso") as Name,
    layer: Layer.unwrap(
      Effect.gen(function* () {
        const sui = yield* Sui;
        return Miso.layer(options.deployment ?? getMisoPlatformDeployment(sui.network));
      }),
    ).pipe(Layer.provide(options.graphqlClient ? SuiGraphQL.layer(options.graphqlClient) : SuiGraphQL.layerUnavailable)),
    ...(options.chainId === undefined ? {} : { sui: { chainId: options.chainId } }),
    warm: { chainId: options.chainId },
  });
