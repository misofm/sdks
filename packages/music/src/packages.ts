// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Package-bound generated APIs.
 *
 * `@mysten/codegen` intentionally emits `@local-pkg/*` source labels. This
 * adapter replaces those labels with the exact addresses from a complete Miso
 * deployment manifest, so applications never have to hand-write a Move target.
 */

import { normalizeMisoDeployment, type MisoDeployment } from "./deployments.ts";

import * as composition from "./contracts/musicos/composition.ts";
import * as recording from "./contracts/musicos/recording.ts";
import * as release from "./contracts/musicos/release.ts";
import * as track from "./contracts/musicos/track.ts";

type BoundMoveFunction<F> = F extends (options: infer Options) => infer Result
  ? Options extends { package?: unknown }
    ? (options: Omit<Options, "package">) => Result
    : F
  : F;
type BoundModule<M extends object, Removed extends PropertyKey> = {
  [Key in Exclude<keyof M, Removed>]: BoundMoveFunction<M[Key]>;
};
/** Generated modules mix BCS constants with transaction-builder functions. */
type CodecModule<M extends object> = {
  [Key in keyof M as M[Key] extends (...args: never[]) => unknown ? never : Key]: M[Key];
};

/** BCS-only projection: never leak Move-call builders into the `bcs` namespace. */
function codecsOnly<M extends object>(mod: M): CodecModule<M> {
  return Object.fromEntries(
    Object.entries(mod).filter(([, value]) => typeof value !== "function"),
  ) as CodecModule<M>;
}

/** Defaults a generated module's optional `package` field to `packageId`. */
export function bindModulePackage<
  M extends object,
  K extends readonly (keyof M)[] = readonly [],
>(
  mod: M,
  packageId: string,
  unavailable: K = [] as unknown as K,
): BoundModule<M, K[number]> {
  const bound: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mod)) {
    if ((unavailable as readonly string[]).includes(key)) continue;
    bound[key] =
      typeof value === "function"
        ? (options: { package?: string }) =>
            (value as (input: unknown) => unknown)({
              ...options,
              package: packageId,
            })
        : value;
  }
  return bound as BoundModule<M, K[number]>;
}

/**
 * Public Move functions that return references. A PTB can borrow internally,
 * but a Move-call command result cannot carry a reference to a later command.
 * Keep them out of `call`; use object/dynamic-field BCS queries instead.
 */
export const REF_RETURNING_CALLS = {
  composition: ["title", "uid", "uidMut"],
  recording: ["uid", "uidMut"],
  release: ["title", "tracks", "uid", "uidMut"],
} as const;

/**
 * All generated functions and BCS codecs bound to one full, verified deployment.
 *
 * The `call` namespaces construct only caller-owned PTB commands. They neither
 * set gas nor sign/execute. Query dynamic fields directly rather than using a
 * Move function whose return type is a reference: PTB command outputs cannot
 * carry references.
 */
export class MisoPackageBindings {
  readonly deployment: MisoDeployment;

  constructor(deployment: MisoDeployment) {
    this.deployment = normalizeMisoDeployment(deployment);
  }

  get call() {
    const d = this.deployment;
    return {
      core: {
        composition: bindModulePackage(composition, d.musicos, REF_RETURNING_CALLS.composition),
        recording: bindModulePackage(recording, d.musicos, REF_RETURNING_CALLS.recording),
        release: bindModulePackage(release, d.musicos, REF_RETURNING_CALLS.release),
        track: bindModulePackage(track, d.musicos),
      },
    };
  }

  /** Generated BCS codecs, grouped with the same ownership boundary as `call`. */
  get bcs() {
    return {
      core: {
        composition: codecsOnly(composition),
        recording: codecsOnly(recording),
        release: codecsOnly(release),
        track: codecsOnly(track),
      },
    };
  }
}

/** Construct complete package bindings from an explicit verified manifest. */
export function misoPackages(deployment: MisoDeployment): MisoPackageBindings {
  return new MisoPackageBindings(deployment);
}
