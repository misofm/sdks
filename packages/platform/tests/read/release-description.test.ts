import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { bcs } from "@mysten/sui/bcs";
import { contracts } from "@misofm/musicos";
import { SuiGraphQL } from "@unconfirmed/sui-effect";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { layerTest, type FakeObject } from "@unconfirmed/sui-effect/testing";
import * as extension from "../../src/contracts/release_description/release_description.ts";
import { releaseDescriptionFieldId } from "../../src/release-extensions.ts";
import { getReleaseDetail, getReleaseResources } from "../../src/read/catalog.ts";
import { misoConfig } from "../../src/read/config.ts";

const RELEASE = `0x${"11".repeat(32)}`;
const config = misoConfig("testnet");
const FIELD = releaseDescriptionFieldId(RELEASE, config.protocol.releaseDescription);
const DESCRIPTION = "Behind the songs.\n制作の物語。";
const Field = bcs.struct("Field", { id: bcs.Address, name: extension.ExtensionKey, value: bcs.string() });
function objects(description: string | null): FakeObject[] {
  return [
    { objectId: RELEASE, type: `${config.deployment.musicos}::release::Release`, version: 1n,
      content: contracts.release.Release.serialize({ id: RELEASE, state: { Published: 123n }, title: "Release", tracks: [] }).toBytes() },
    ...(description === null ? [] : [{ objectId: FIELD, type: "0x2::dynamic_field::Field", version: 1n,
      content: Field.serialize({ id: FIELD, name: [false], value: description }).toBytes() }]),
  ];
}
const graphql = { query: async () => { throw new Error("Empty release must not query GraphQL"); } } as unknown as SuiGraphQLClient;
for (const description of [DESCRIPTION, null]) {
  test(`release detail includes ${description === null ? "null for absent description" : "the UTF-8 description with line breaks"}`, async () => {
    const result = await Effect.runPromise(Effect.provide(getReleaseDetail(RELEASE, config),
      Layer.mergeAll(layerTest({ objects: objects(description) }), SuiGraphQL.layer(graphql)), { local: true }));
    expect(result.description).toBe(description);
    expect(result.title).toBe("Release");
  });
}
test("description is only included in selected release resources", async () => {
  const result = await Effect.runPromise(Effect.provide(getReleaseResources(RELEASE, config), layerTest({ objects: objects(DESCRIPTION) }), { local: true }));
  expect(result).not.toHaveProperty("description");
});
