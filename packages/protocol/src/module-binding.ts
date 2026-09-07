// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

type BoundMoveFunction<F> = F extends (options: infer Options) => infer Result
  ? Options extends { package?: unknown }
    ? (options: Omit<Options, "package">) => Result
    : F
  : F;
type BoundModule<M extends object, Removed extends PropertyKey> = {
  [Key in Exclude<keyof M, Removed>]: BoundMoveFunction<M[Key]>;
};

/** Share generated-module projection while retaining each client's package policy. */
export function moduleBinder(policy: "pin" | "default") {
  return function bindModulePackage<M extends object, K extends readonly (keyof M)[] = readonly []>(
    mod: M,
    packageId: string,
    unavailable: K = [] as unknown as K,
  ): BoundModule<M, K[number]> {
    const bound: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(mod)) {
      if ((unavailable as readonly string[]).includes(key)) continue;
      bound[key] = typeof value === "function"
        ? (options: { package?: string }) => (value as (input: unknown) => unknown)(
            policy === "pin" ? { ...options, package: packageId } : { package: packageId, ...options },
          )
        : value;
    }
    return bound as BoundModule<M, K[number]>;
  };
}
