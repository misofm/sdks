// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// `@misofm/effect` — the shared Effect foundation for the Miso SDKs: one
// `SuiClient` service, one error vocabulary, and the read/execute primitives
// every package's queries and transaction builders are composed from.
//
// DEPRECATED: this package is superseded by sui-effect. This 0.2.0 release is
// code-identical to 0.1.1 — every export below still works exactly as before —
// but every export now carries an `@deprecated` JSDoc tag naming its sui-effect
// replacement. See README.md for the full migration table.
export * from "./errors.ts";
export * from "./sui-client.ts";
export * from "./reads.ts";
export * from "./execute.ts";
