// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Two consumers of `@misofm/musicos`, side by side: Effect code composing
// `Musicos` directly, and Promise code through the derived `musicos()` face.
// Typechecked (see `../tsconfig.json`'s `include`); never run.

import { SuiGrpcClient } from "@mysten/sui/grpc"
import { Effect } from "effect"
import { ObjectId, Sui, SuiCore, SuiAddress } from "@unconfirmed/sui-effect"
import { Musicos, musicos } from "../src/index.ts"

// --- Effect ---

const readRelease = (releaseId: ObjectId, registryId: ObjectId) =>
  Effect.gen(function* () {
    const service = yield* Musicos
    const release = yield* service.getReleaseById(releaseId)
    const registry = yield* service.getReleaseRegistryById(registryId)
    return { release, registry }
  })

export const runEffect = (releaseId: ObjectId, registryId: ObjectId, baseUrl: string) =>
  readRelease(releaseId, registryId).pipe(
    Effect.provide(Musicos.layer()),
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
  const client = new SuiGrpcClient({ network: "testnet", baseUrl }).$extend(musicos())
  const release = await client.musicos.getReleaseById(ObjectId.make(releaseId))
  const derivedId = await client.musicos.view.deriveTargetReleaseId({
    sender: SuiAddress.make(sender),
    recordingIds: recordingIds.map((id) => ObjectId.make(id)),
    splitBps,
    nonce,
    releaseRegistryId: ObjectId.make(registryId)
  })
  await client.musicos.dispose()
  return { release, derivedId }
}
