// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Codegen tooling now lives at the monorepo root (see `../../../scripts/`),
// unified with the runner that used to live only here. This re-export keeps
// the existing test suite (`tests/codegen-output.test.ts`) pointed at a single
// implementation instead of duplicating it.
export * from "../../../scripts/codegen-output.ts";
