// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { Effect } from "effect";
import { DeploymentError } from "@misofm/effect";
import { PartyosClient, partyos } from "../src/client.ts";
import {
  PARTYOS_DEPLOYMENTS,
  assertPartyDeployment,
  getPartyDeployment,
  validatePartyDeployment,
} from "../src/deployments.ts";

const PKG = "0x" + "a".repeat(64);

test("the bundled testnet manifest has exactly one key, partyos", () => {
  expect(Object.keys(getPartyDeployment("testnet"))).toEqual(["partyos"]);
  expect(getPartyDeployment("testnet").partyos).toBe(PARTYOS_DEPLOYMENTS.testnet.partyos);
});

test("unbundled networks and malformed manifests fail closed", () => {
  expect(() => getPartyDeployment("localnet")).toThrow(/no verified PartyOS deployment/);
  expect(() => assertPartyDeployment({ partyos: PKG, misoParty: PKG })).toThrow(/exactly these package IDs/);
  expect(() => assertPartyDeployment({ partyos: "0xabc" })).toThrow(/must be normalized/);
  expect(() => assertPartyDeployment({})).toThrow(/exactly these package IDs/);
});

test("validatePartyDeployment mirrors normalizePartyDeployment but as a typed Effect failure", async () => {
  const ok = await Effect.runPromise(validatePartyDeployment({ partyos: PKG }));
  expect(ok).toEqual({ partyos: PKG });

  const err = await Effect.runPromise(validatePartyDeployment({}).pipe(Effect.flip));
  expect(err).toBeInstanceOf(DeploymentError);
  expect(err.message).toMatch(/exactly these package IDs/);
});

test("the client extension registers under `partyos` and binds the package to every builder", async () => {
  const registration = partyos({ deployment: { partyos: PKG } });
  expect(registration.name).toBe("partyos");
  const client = registration.register({ network: "testnet", core: {} } as never);
  expect(client).toBeInstanceOf(PartyosClient);
  expect(client.deployment).toEqual({ partyos: PKG });
  expect(client.derivePartyAdminCapId("0x" + "1".repeat(64))).toMatch(/^0x[0-9a-f]{64}$/);
  expect("groupMembers" in client.call.party).toBeFalse();
  expect(typeof client.call.party.setName).toBe("function");
});
