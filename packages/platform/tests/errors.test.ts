// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// `src/errors.ts`'s own taxonomy: every class is a `Schema.TaggedError`
// declaring `outcome` (per `docs/extensions.md` §2), and `SuiError.toJson`
// works on a platform-owned error the same way it does on sui-effect's own
// (B4, misofm/sdks#35 verification — the acceptance criterion this
// package's own errors had no test for).

import { describe, expect, test } from "bun:test";
import { SuiError } from "@unconfirmed/sui-effect";
import {
  MisoNetworkMismatchError,
  OperationsUnavailableError,
  RecordSalesUnavailableError,
} from "../src/errors.ts";

describe("SuiError.toJson on a platform error", () => {
  test("RecordSalesUnavailableError: a plain JSON-safe record with its own fields", () => {
    const error = new RecordSalesUnavailableError({ reason: "legacy deployment" });
    const json = SuiError.toJson(error);
    expect(() => JSON.stringify(json)).not.toThrow();
    expect(json).toMatchObject({ _tag: "RecordSalesUnavailableError", reason: "legacy deployment" });
  });

  test("OperationsUnavailableError: same contract", () => {
    const error = new OperationsUnavailableError({ reason: "no Vault operations deployment was configured" });
    const json = SuiError.toJson(error);
    expect(JSON.parse(JSON.stringify(json))).toMatchObject({
      _tag: "OperationsUnavailableError",
      reason: "no Vault operations deployment was configured",
    });
  });

  test("MisoNetworkMismatchError: SuiError.outcome honours the platform-declared outcome", () => {
    const error = new MisoNetworkMismatchError({ clientNetwork: "mainnet", deploymentNetwork: "testnet" });
    expect(SuiError.outcome(error)).toBe(error.outcome);
    const json = SuiError.toJson(error);
    expect(json).toMatchObject({ _tag: "MisoNetworkMismatchError", clientNetwork: "mainnet", deploymentNetwork: "testnet" });
  });
});
