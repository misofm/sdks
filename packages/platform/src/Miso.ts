// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The `Miso` service: the sui-effect extension replacing the hand-written
 * `MisoPlatformClient` class (misofm/sdks#35). This is the WP1 SKELETON only
 * — `deployment`/`network`/`chainId`, the exact-chain startup check, and
 * `protocol`/`party` bound to the converted `Musicos`/`Partyos` services.
 *
 * Everything else the issue's target `MisoService` interface names —
 * `getPressing`/`getListing`/`getRecord`/`getSale`, `ids.*`, `tx.*`,
 * `call`/`bcs`, `vault`, `createShareCurrency`, `publishCatalog`, `read.*`,
 * `events` — is stage 2/3 scope (WP3-WP6; see `docs/CONVERSION-STATUS.md`).
 * `party` is bound to the raw `Partyos` service for now, not the richer
 * `MisoPartyService` (extension reads, `tx`, `call`, `bcs`) WP3 adds.
 *
 * Per sui-effect's `docs/extensions.md` ("converting an existing facade"):
 * `Musicos`/`Partyos` are dependencies already extended elsewhere, so this
 * service `Layer.provide`s their own `layer(...)` inside its own so the
 * requirement channel stays `Sui` and never leaks `Musicos | Partyos` to a
 * consumer that only asked for `Miso`.
 */
import { Config, Context, Effect, Layer } from "effect";
import { Musicos, type MusicosDeploymentInvalid, type MusicosService } from "@misofm/musicos";
import { Partyos, type PartyosDeploymentError, type PartyosService } from "@misofm/partyos";
import { Sui } from "sui-effect";
import {
  getMisoPlatformDeployment,
  MISO_PLATFORM_DEPLOYMENTS,
  normalizeMisoPlatformDeployment,
  type MisoPlatformDeployment,
} from "./deployments.ts";
import { MisoChainIdentifierMismatchError, MisoNetworkMismatchError, MisoPlatformDeploymentInvalidError } from "./errors.ts";

/** Everything {@link Miso.layer} (and {@link Miso.layerConfig}) can fail with, at build time. */
export type MisoLayerError =
  | MisoNetworkMismatchError
  | MisoChainIdentifierMismatchError
  | MusicosDeploymentInvalid
  | PartyosDeploymentError;

export interface MisoService {
  /** The exact deployment this instance was built with. */
  readonly deployment: MisoPlatformDeployment;
  /** The network this deployment is for (`deployment.network`, kept as a direct member per the issue's target shape). */
  readonly network: MisoPlatformDeployment["network"];
  /** The chain identifier this instance was validated against (`deployment.chainIdentifier`). */
  readonly chainId: string;
  /**
   * The converted `@misofm/musicos` protocol service, always present (unlike
   * the predecessor's `client.miso.protocol`, which was `undefined` without
   * a protocol deployment — every `MisoPlatformDeployment` has one).
   */
  readonly protocol: MusicosService;
  /**
   * The converted `@misofm/partyos` core service.
   *
   * TODO(stage 2, WP3 "party and protocol composition"): replace with the
   * richer `MisoPartyService` — the 7 core delegations kept, plus the
   * platform's own party EXTENSION reads (profile/media/roles/tags/genres/
   * ctas/links, today's `party/queries.ts`) and `tx`/`call`/`bcs` bound to
   * `deployment.party`.
   */
  readonly party: PartyosService;
}

const make = (deployment: MisoPlatformDeployment): Effect.Effect<MisoService, MisoNetworkMismatchError | MisoChainIdentifierMismatchError, Sui | Musicos | Partyos> =>
  Effect.gen(function* () {
    const sui = yield* Sui;
    // The exact-ledger check `MisoPlatformClient#ready()` used to perform at
    // first use, moved to layer build (the issue's target shape: "a
    // caller's first call builds the runtime; a mismatch rejects it with
    // MisoChainIdentifierMismatchError instead of ready()").
    if (sui.network !== deployment.network) {
      return yield* new MisoNetworkMismatchError({ clientNetwork: sui.network, deploymentNetwork: deployment.network });
    }
    if (sui.chainId !== deployment.chainIdentifier) {
      return yield* new MisoChainIdentifierMismatchError({ actual: sui.chainId, expected: deployment.chainIdentifier });
    }
    const protocol = yield* Musicos;
    const party = yield* Partyos;
    return { deployment, network: deployment.network, chainId: deployment.chainIdentifier, protocol, party };
  });

/** `make`, without the exact-chain check — what {@link Miso.layerTest} builds over. */
const makeUnchecked = (deployment: MisoPlatformDeployment): Effect.Effect<MisoService, never, Sui | Musicos | Partyos> =>
  Effect.gen(function* () {
    const sui = yield* Sui;
    const protocol = yield* Musicos;
    const party = yield* Partyos;
    return { deployment, network: deployment.network, chainId: sui.chainId, protocol, party };
  });

/**
 * The Miso platform service: `Pressing`/`Listing`/`Record` reads, PTB
 * fragments, and the converted `protocol`/`party` object-model services,
 * built on `Sui`. Identifier `"@misofm/platform/Miso"`, never changes after
 * publication.
 */
export class Miso extends Context.Service<Miso, MisoService>()("@misofm/platform/Miso") {
  /**
   * The live layer, bound to `deployment`. Composes `Musicos.layer` and
   * `Partyos.layer` over the same `Sui` internally, so the requirement stays
   * `Sui` (WP1 skeleton — no member here reads `SuiGraphQL` yet; stage 2/3
   * adds the catalog/read surface that does, per `docs/CONVERSION-STATUS.md`).
   *
   * Fails with: `MisoNetworkMismatchError`, `MisoChainIdentifierMismatchError`
   * (the client's `sui.network`/`sui.chainId` do not match `deployment`),
   * plus whatever `Musicos.layer`/`Partyos.layer` fail with for a structurally
   * invalid `deployment.protocol`/`deployment.partyos` (should not happen for
   * an already-`normalizeMisoPlatformDeployment`-validated deployment).
   */
  static readonly layer = (deployment: MisoPlatformDeployment): Layer.Layer<Miso, MisoLayerError, Sui> =>
    Layer.effect(Miso, make(deployment)).pipe(
      Layer.provide(Musicos.layer({ deployment: deployment.protocol })),
      Layer.provide(Partyos.layer({ deployment: deployment.partyos })),
    );

  /**
   * `layer`, reading `MISO_NETWORK` from the environment to pick this
   * release's bundled manifest; unset falls back to `sui.network`.
   *
   * TODO(stage 2/3): `MISO_DEPLOYMENT` (a JSON manifest path, for a custom
   * network) and `MISO_API_BASE_URL` (the `read` config's API host) per the
   * issue's target shape — deferred with the rest of the `read` surface.
   *
   * Fails with: `ConfigError`, `MisoPlatformDeploymentInvalidError` (an
   * unbundled `MISO_NETWORK`), plus everything {@link layer} fails with.
   */
  static readonly layerConfig: Layer.Layer<
    Miso,
    Config.ConfigError | MisoPlatformDeploymentInvalidError | MisoLayerError,
    Sui
  > = Layer.unwrap(
    Effect.gen(function* () {
      const configuredNetwork = yield* Config.nonEmptyString("MISO_NETWORK").pipe(Config.option);
      const network = configuredNetwork._tag === "Some" ? configuredNetwork.value : (yield* Sui).network;
      const deployment = yield* Effect.try({
        try: () => getMisoPlatformDeployment(network),
        catch: (cause) =>
          new MisoPlatformDeploymentInvalidError({ message: cause instanceof Error ? cause.message : String(cause) }),
      });
      return Miso.layer(deployment);
    }),
  );

  /**
   * The real service over a fixed manifest (the bundled testnet deployment
   * unless `state.deployment` overrides it), skipping the exact-chain check
   * `layer` performs — this is what lets a test provide any `Sui` fake
   * without also faking a matching chain id. Compose with `layerExtensionTest`
   * (or a merged `layerTest` for `Sui`) from `sui-effect/testing`. Never fails.
   */
  static readonly layerTest = (state: { readonly deployment?: MisoPlatformDeployment } = {}): Layer.Layer<Miso, never, Sui> => {
    const deployment = state.deployment ?? MISO_PLATFORM_DEPLOYMENTS.testnet;
    return Layer.effect(Miso, makeUnchecked(deployment)).pipe(
      Layer.provide(Musicos.layerTest({ packageId: deployment.protocol.musicos })),
      Layer.provide(Partyos.layerTest(deployment.partyos)),
    );
  };
}

// `normalizeMisoPlatformDeployment` stays imported (not just re-exported) so
// a future `layerConfig` `MISO_DEPLOYMENT` JSON-path addition (TODO above)
// has it in scope without another import line to remember.
export { normalizeMisoPlatformDeployment };
