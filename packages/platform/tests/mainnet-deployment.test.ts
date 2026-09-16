import { expect, test } from "bun:test";
import evidence from "../../../releases/mainnet-v1-20260916.json";
import { MISO_PLATFORM_DEPLOYMENTS, assertMisoPlatformDeployment, requireOperationsDeployment, requireRecordSalesDeployment } from "../src/deployments.ts";
import { Transaction } from "@mysten/sui/transactions";
import { contracts } from "@misofm/partyos";

const deployment = MISO_PLATFORM_DEPLOYMENTS.mainnet;

test("every bundled Mainnet identity has verified immutable publication evidence", () => {
  assertMisoPlatformDeployment(deployment);
  requireOperationsDeployment(deployment.operations);
  requireRecordSalesDeployment(deployment.recordSales);
  const packages = new Set(Object.values(evidence.packages).map((row) => {
    expect(row.transactionStatus).toBe("success");
    expect(row.immutable).toBe(true);
    expect(row.upgradeCapCount).toBe(0);
    expect(row.unexpectedSenderOwnedObjects).toEqual([]);
    return row.packageId;
  }));
  for (const id of Object.values(evidence.externalPackages)) packages.add(id);
  const objects = new Set(Object.values(evidence.packages).flatMap((row) => row.singletonObjects.map((object) => object.objectId)));
  for (const id of [deployment.protocol.musicos, deployment.partyos.partyos, ...Object.values(deployment.packages), ...Object.values(deployment.party), deployment.recordSales.recordPackageId, deployment.recordSales.recordShopPackageId, deployment.operations.vault.packageId, ...Object.values(deployment.operations.actions), ...Object.values(deployment.operations.plugins)]) {
    expect(packages.has(id), id).toBe(true);
  }
  for (const id of [...Object.values(deployment.objects), deployment.operations.vault.registryId]) expect(objects.has(id), id).toBe(true);
  expect(deployment.packages.recordingMasterAudio).toBe(deployment.packages.audio);
});

test("Mainnet Party recipes target the verified package", () => {
  const tx = new Transaction();
  const party = contracts.party;
  const kind = party.newIndividualKind({ package: deployment.partyos.partyos })(tx);
  const cap = party._new({ package: deployment.partyos.partyos, arguments: { kind, name: "Mainnet smoke test" } })(tx);
  expect(cap).toBeDefined();
  const calls = tx.getData().commands.filter((command) => command.$kind === "MoveCall");
  expect(calls).toHaveLength(2);
  for (const command of calls) expect(command.MoveCall?.package).toBe(deployment.partyos.partyos);
});
