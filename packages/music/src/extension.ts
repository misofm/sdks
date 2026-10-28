// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The Promise face, derived rather than maintained. `SuiExtension.fromService`
 * walks `MusicProtocolService` once: every `Effect` member becomes a Promise
 * method, `view` (a nested namespace) is mapped recursively, and a rejection
 * is the same tagged error instance an Effect caller would have caught.
 */
import type { ClientWithCoreApi, SuiClientRegistration } from "@mysten/sui/client";
import { SuiExtension, type ExtensionFace, type PromiseFace } from "@unconfirmed/sui-effect/extension";
import { MusicProtocol, type MusicProtocolOptions, type MusicProtocolService } from "./MusicProtocol.ts";

/**
 * The registration a Promise consumer passes to `client.$extend(...)`.
 *
 * ```ts
 * const client = new SuiGrpcClient({ network: "testnet", baseUrl }).$extend(musicProtocol());
 * const release = await client.musicProtocol.getReleaseById(id);
 * ```
 *
 * `register(client)` does no work until the first call. `MusicProtocol` has two
 * synchronous members, `packageId` and `deployment`: read either before the
 * first `await`, and the placeholder throws `ExtensionNotReady`, naming
 * itself. `warm` is deliberately not the default here — it also pins the
 * chain identifier without asking the node, and on `devnet`, `localnet` or a
 * custom network with no table entry `warm` throws at registration unless a
 * `chainId` is given, which would surprise a consumer testing against a local
 * validator. `await client.musicProtocol.$ready()` once after `$extend` makes both
 * fields real from then on; a consumer that wants them synchronously from the
 * moment it registers, and knows its chain identifier or is on `mainnet` /
 * `testnet`, may still register with
 * `SuiExtension.fromService(MusicProtocol, { name: "musicProtocol", layer: MusicProtocol.layer(options), warm: {} })`
 * directly.
 */
export const musicProtocol = (
  options?: MusicProtocolOptions,
): SuiClientRegistration<ClientWithCoreApi, "musicProtocol", PromiseFace<MusicProtocolService> & ExtensionFace> =>
  SuiExtension.fromService(MusicProtocol, { name: "musicProtocol", layer: MusicProtocol.layer(options) });
