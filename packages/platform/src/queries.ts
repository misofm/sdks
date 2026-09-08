// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Shared read plumbing for the platform reads.

// `isNotFound` is the protocol SDK's — the not-found taxonomy is a property of
// the Sui transports, not of any one package's objects, so it is defined once in
// `@misofm/musicos` and re-exported here for the platform readers.
export { isNotFound } from "@misofm/musicos";
