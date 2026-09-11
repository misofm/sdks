// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Every own error musicos declares: round-trips through its schema (so it
// survives a log line, an RPC response, or a journal entry the way
// sui-effect's own errors do) and declares an `outcome`.

import { describe, expect, test } from "bun:test";
import { TestSchema } from "effect/testing";
import { SuiAddress } from "sui-effect";
import { MusicosDeploymentInvalid, MusicosTreasuryCapNotFound } from "../src/errors.ts";

describe("MusicosTreasuryCapNotFound", () => {
  const owner = SuiAddress.make(`0x${"a".repeat(64)}`);
  const shareType = "0xabc::share::Share";
  const error = new MusicosTreasuryCapNotFound({ shareType, owner });

  test("round-trips through its schema", async () => {
    const asserts = new TestSchema.Asserts(MusicosTreasuryCapNotFound);
    await asserts.decoding().succeed({ _tag: "musicos/TreasuryCapNotFound", shareType, owner }, error);
    await asserts.encoding().succeed(error, { _tag: "musicos/TreasuryCapNotFound", shareType, owner });
  });

  test("toJson output is JSON", () => {
    const json = JSON.stringify(error);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json)).toMatchObject({ _tag: "musicos/TreasuryCapNotFound", shareType, owner });
  });

  test("declares outcome not_applied — nothing was submitted", () => {
    expect(error.outcome).toBe("not_applied");
    expect(error._tag).toBe("musicos/TreasuryCapNotFound");
    expect(error).toBeInstanceOf(MusicosTreasuryCapNotFound);
  });
});

describe("MusicosDeploymentInvalid", () => {
  const message = "no verified Miso deployment is bundled for network \"localnet\"";
  const error = new MusicosDeploymentInvalid({ message });

  test("round-trips through its schema", async () => {
    const asserts = new TestSchema.Asserts(MusicosDeploymentInvalid);
    await asserts.decoding().succeed({ _tag: "musicos/DeploymentInvalid", message }, error);
    await asserts.encoding().succeed(error, { _tag: "musicos/DeploymentInvalid", message });
  });

  test("toJson output is JSON", () => {
    const json = JSON.stringify(error);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json)).toMatchObject({ _tag: "musicos/DeploymentInvalid", message });
  });

  test("declares outcome not_applied — nothing was even built", () => {
    expect(error.outcome).toBe("not_applied");
    expect(error._tag).toBe("musicos/DeploymentInvalid");
  });
});
