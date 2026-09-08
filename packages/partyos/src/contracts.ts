// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Barrel for the codegen-generated, ABI-bound bindings (BCS structs + type-safe
// Move calls). Re-exported from the package root as the `contracts` namespace.
//
// The generated default `@local-pkg/partyos` identity is a source label only:
// callers must inject the exact published address through `PartyDeployment`
// before building a transaction.

import * as rawParty from "./contracts/partyos/party.ts";

type PublicModule<M extends object, K extends readonly (keyof M)[]> = Omit<M, K[number]>;
function withoutUnsafeCalls<M extends object, K extends readonly (keyof M)[]>(
  module: M,
  keys: K,
): PublicModule<M, K> {
  return Object.fromEntries(
    Object.entries(module).filter(([key]) => !keys.includes(key as keyof M)),
  ) as PublicModule<M, K>;
}

/**
 * Public Move functions that return references. A PTB can borrow internally,
 * but a Move-call command result cannot carry a reference to a later command,
 * so they are kept out of the curated barrel and the client's `call` namespace.
 */
export const PARTY_REF_RETURNING_CALLS = ["groupMembers", "uid", "uidMut"] as const;

/** Party core (BCS codecs remain available; PTB-inaccessible references do not). */
export const party = withoutUnsafeCalls(rawParty, PARTY_REF_RETURNING_CALLS);
