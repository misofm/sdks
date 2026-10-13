// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Golden vectors for the two party-creation recipes, built fully offline:
// no client, no network, no object resolution. `fixtures/party.golden.json`
// holds the exact sponsored TransactionData bytes and digests that
// `createIndividualParty` / `createGroupParty` produced at
// misofm/sdks@56af6a7 (the last release on the rc.112 stack); this test pins
// that the Effect 4.0.x port builds byte-identical transactions, so a consumer
// that reproduces them in another language (the Rust platform, platform-ts)
// keeps matching.

import { Transaction } from "@mysten/sui/transactions";
import { toBase64 } from "@mysten/sui/utils";
import { describe, expect, test } from "bun:test";
import { PARTYOS_DEPLOYMENTS } from "../src/deployments.ts";
import { createGroupParty, createIndividualParty } from "../src/transactions.ts";
import golden from "./fixtures/party.golden.json" with { type: "json" };

interface Vector {
  readonly name: string;
  readonly network: "mainnet" | "testnet";
  readonly kind: "individual" | "group";
  readonly partyName: string;
  readonly recipient: string;
  readonly sender: string;
  readonly sponsor: string;
  readonly gasPrice: string;
  readonly gasBudget: string;
  readonly minEpoch: string;
  readonly maxEpoch: string;
  readonly nonce: number;
  readonly chain: string;
  readonly transaction: string;
  readonly digest: string;
}

const vectors = golden.vectors as readonly Vector[];

const build = (v: Vector): Transaction => {
  const tx = new Transaction();
  const partyPackageId = PARTYOS_DEPLOYMENTS[v.network].partyos;
  const params = { name: v.partyName, recipient: v.recipient, partyPackageId };
  (v.kind === "individual" ? createIndividualParty(params) : createGroupParty(params))(tx);
  tx.setSender(v.sender);
  tx.setGasOwner(v.sponsor);
  tx.setGasPrice(v.gasPrice);
  tx.setGasBudget(v.gasBudget);
  tx.setGasPayment([]);
  tx.setExpiration({
    ValidDuring: {
      minEpoch: v.minEpoch,
      maxEpoch: v.maxEpoch,
      minTimestamp: null,
      maxTimestamp: null,
      chain: v.chain,
      nonce: v.nonce,
    },
  });
  return tx;
};

describe("party recipes: golden vectors", () => {
  test("the fixture carries all four vectors", () => {
    expect(vectors.map((v) => v.name)).toEqual([
      "individual-mainnet",
      "group-testnet",
      "unicode-name",
      "max-length-name",
    ]);
  });

  for (const v of vectors) {
    test(`${v.name}: bytes and digest are identical, built offline`, async () => {
      const tx = build(v);
      const bytes = await tx.build();
      expect(toBase64(bytes)).toBe(v.transaction);
      expect(await tx.getDigest()).toBe(v.digest);
    });
  }
});
