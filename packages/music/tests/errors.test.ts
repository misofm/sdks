// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Every own error @misofm/music declares: round-trips through its schema (so it
// survives a log line, an RPC response, or a journal entry the way
// sui-effect's own errors do) and declares an `outcome`.

import { describe, expect, test } from "bun:test";
import { TestSchema } from "effect/testing";
import { SuiAddress } from "@unconfirmed/sui-effect";
import { MusicProtocolDeploymentInvalid, MusicProtocolTreasuryCapNotFound } from "../src/errors.ts";

describe("MusicProtocolTreasuryCapNotFound", () => {
  const owner = SuiAddress.make(`0x${"a".repeat(64)}`);
  const shareType = "0xabc::share::Share";
  const error = new MusicProtocolTreasuryCapNotFound({ shareType, owner });

  test("round-trips through its schema", async () => {
    const asserts = new TestSchema.Asserts(MusicProtocolTreasuryCapNotFound);
    await asserts.decoding().succeed({ _tag: "music/TreasuryCapNotFound", shareType, owner }, error);
    await asserts.encoding().succeed(error, { _tag: "music/TreasuryCapNotFound", shareType, owner });
  });

  test("toJson output is JSON", () => {
    const json = JSON.stringify(error);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json)).toMatchObject({ _tag: "music/TreasuryCapNotFound", shareType, owner });
  });

  test("declares outcome not_applied — nothing was submitted", () => {
    expect(error.outcome).toBe("not_applied");
    expect(error._tag).toBe("music/TreasuryCapNotFound");
    expect(error).toBeInstanceOf(MusicProtocolTreasuryCapNotFound);
  });
});

describe("MusicProtocolDeploymentInvalid", () => {
  const message = "no verified Miso deployment is bundled for network \"localnet\"";
  const error = new MusicProtocolDeploymentInvalid({ message });

  test("round-trips through its schema", async () => {
    const asserts = new TestSchema.Asserts(MusicProtocolDeploymentInvalid);
    await asserts.decoding().succeed({ _tag: "music/DeploymentInvalid", message }, error);
    await asserts.encoding().succeed(error, { _tag: "music/DeploymentInvalid", message });
  });

  test("toJson output is JSON", () => {
    const json = JSON.stringify(error);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json)).toMatchObject({ _tag: "music/DeploymentInvalid", message });
  });

  test("declares outcome not_applied — nothing was even built", () => {
    expect(error.outcome).toBe("not_applied");
    expect(error._tag).toBe("music/DeploymentInvalid");
  });
});
