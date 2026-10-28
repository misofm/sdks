// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Two consumers of `@misofm/music`, side by side: Effect code composing
// `MusicProtocol` directly, and Promise code through the derived `musicProtocol()` face.
// Typechecked (see `../tsconfig.json`'s `include`); never run.

import { SuiGrpcClient } from "@mysten/sui/grpc"
import { Effect } from "effect"
import { ObjectId, Sui, SuiCore, SuiAddress } from "@unconfirmed/sui-effect"
import { MusicProtocol, musicProtocol } from "../src/index.ts"

// --- Effect ---

const readRelease = (releaseId: ObjectId, registryId: ObjectId) =>
  Effect.gen(function* () {
    const service = yield* MusicProtocol
    const release = yield* service.getReleaseById(releaseId)
    const registry = yield* service.getReleaseRegistryById(registryId)
    return { release, registry }
  })

export const runEffect = (releaseId: ObjectId, registryId: ObjectId, baseUrl: string) =>
  readRelease(releaseId, registryId).pipe(
    Effect.provide(MusicProtocol.layer()),
    Effect.provide(Sui.layerNoDeps),
    Effect.provide(SuiCore.layerGrpc({ network: "testnet", baseUrl }))
  )

// --- Promise ---

export const runPromise = async (
  releaseId: string,
  registryId: string,
  sender: string,
  recordingIds: readonly string[],
  splitBps: readonly number[],
  nonce: number,
  baseUrl: string
) => {
  const client = new SuiGrpcClient({ network: "testnet", baseUrl }).$extend(musicProtocol())
  const release = await client.musicProtocol.getReleaseById(ObjectId.make(releaseId))
  const derivedId = await client.musicProtocol.view.deriveTargetReleaseId({
    sender: SuiAddress.make(sender),
    recordingIds: recordingIds.map((id) => ObjectId.make(id)),
    splitBps,
    nonce,
    releaseRegistryId: ObjectId.make(registryId)
  })
  await client.musicProtocol.dispose()
  return { release, derivedId }
}
