// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Barrel for the codegen-generated, ABI-bound bindings (BCS structs + type-safe
// Move calls). Re-exported from the package root as the `contracts` namespace.

// Every package here is generated from the current first-party Move source. The
// generated default `@local-pkg/*` identities are source labels only: callers
// must inject exact published addresses through `MisoDeployment` before building
// a transaction. Do not use a historic package ID as a substitute for a fresh
// deployment.

type PublicModule<M extends object, K extends readonly (keyof M)[]> = Omit<M, K[number]>;
function withoutUnsafeCalls<M extends object, K extends readonly (keyof M)[]>(
  module: M,
  keys: K,
): PublicModule<M, K> {
  return Object.fromEntries(Object.entries(module).filter(([key]) => !keys.includes(key as keyof M))) as PublicModule<M, K>;
}

import * as rawComposition from "./contracts/musicos/composition.ts";
import * as rawRecording from "./contracts/musicos/recording.ts";
import * as rawRelease from "./contracts/musicos/release.ts";

// Object model core (BCS codecs remain available; PTB-inaccessible references do not).
export const composition = withoutUnsafeCalls(rawComposition, ["title", "uid", "uidMut"] as const);
export const recording = withoutUnsafeCalls(rawRecording, ["uid", "uidMut"] as const);
export const release = withoutUnsafeCalls(rawRelease, ["title", "tracks", "uid", "uidMut"] as const);
export * as track from "./contracts/musicos/track.ts";
