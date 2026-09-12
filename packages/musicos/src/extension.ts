// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The Promise face, derived rather than maintained. `SuiExtension.fromService`
 * walks `MusicosService` once: every `Effect` member becomes a Promise
 * method, `view` (a nested namespace) is mapped recursively, and a rejection
 * is the same tagged error instance an Effect caller would have caught.
 */
import type { ClientWithCoreApi, SuiClientRegistration } from "@mysten/sui/client";
import { SuiExtension, type ExtensionFace, type PromiseFace } from "@unconfirmed/sui-effect/extension";
import { Musicos, type MusicosOptions, type MusicosService } from "./Musicos.ts";

/**
 * The registration a Promise consumer passes to `client.$extend(...)`.
 *
 * ```ts
 * const client = new SuiGrpcClient({ network: "testnet", baseUrl }).$extend(musicos());
 * const release = await client.musicos.getReleaseById(id);
 * ```
 *
 * `register(client)` does no work until the first call. `Musicos` has two
 * synchronous members, `packageId` and `deployment`: read either before the
 * first `await`, and the placeholder throws `ExtensionNotReady`, naming
 * itself. `warm` is deliberately not the default here — it also pins the
 * chain identifier without asking the node, and on `devnet`, `localnet` or a
 * custom network with no table entry `warm` throws at registration unless a
 * `chainId` is given, which would surprise a consumer testing against a local
 * validator. `await client.musicos.$ready()` once after `$extend` makes both
 * fields real from then on; a consumer that wants them synchronously from the
 * moment it registers, and knows its chain identifier or is on `mainnet` /
 * `testnet`, may still register with
 * `SuiExtension.fromService(Musicos, { name: "musicos", layer: Musicos.layer(options), warm: {} })`
 * directly.
 */
export const musicos = (
  options?: MusicosOptions,
): SuiClientRegistration<ClientWithCoreApi, "musicos", PromiseFace<MusicosService> & ExtensionFace> =>
  SuiExtension.fromService(Musicos, { name: "musicos", layer: Musicos.layer(options) });
