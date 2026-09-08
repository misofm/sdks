// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Transaction execution + effect extraction (the Signer-parameter pattern).
// This module is a thin re-export of `@misofm/effect/execute` so the
// `@misofm/musicos/execute` subpath keeps resolving for existing callers —
// the implementation is transport-agnostic and shared across every `@misofm/*`
// SDK, so there is exactly one copy of it.
export * from "@misofm/effect/execute";
