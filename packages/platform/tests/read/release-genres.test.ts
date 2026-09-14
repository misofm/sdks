import { expect, test } from "bun:test";
import { bcs } from "@mysten/sui/bcs";
import { Effect, Layer } from "effect";
import { contracts } from "@misofm/musicos";
import { SuiGraphQL } from "@unconfirmed/sui-effect";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { layerTest, type FakeObject } from "@unconfirmed/sui-effect/testing";
import * as genreContract from "../../src/contracts/genre/genre.ts";
import * as releaseGenreContract from "../../src/contracts/release_genre/release_genre.ts";
import { releaseGenresFieldId } from "../../src/genre.ts";
import { getReleaseDetail } from "../../src/read/catalog.ts";
import { misoConfig } from "../../src/read/config.ts";

const RELEASE = `0x${"11".repeat(32)}`;
const ELECTRONIC = `0x${"22".repeat(32)}`;
const ALTERNATIVE = `0x${"33".repeat(32)}`;
const config = misoConfig("testnet");
const FIELD = releaseGenresFieldId(RELEASE, config.protocol.releaseGenre);
const ReleaseGenresField = bcs.struct("Field", {
  id: bcs.Address,
  name: releaseGenreContract.ExtensionKey,
  value: bcs.vector(bcs.Address),
});
const graphql = {
  query: async () => {
    throw new Error("Empty release must not query GraphQL");
  },
} as unknown as SuiGraphQLClient;

function baseObjects(): FakeObject[] {
  return [
    {
      objectId: RELEASE,
      type: `${config.deployment.musicos}::release::Release`,
      version: 1n,
      content: contracts.release.Release.serialize({
        id: RELEASE,
        state: { Published: 123n },
        title: "Release",
        tracks: [],
      }).toBytes(),
    },
  ];
}

test("release detail resolves ordered genre names with the primary first", async () => {
  const objects: FakeObject[] = [
    ...baseObjects(),
    {
      objectId: FIELD,
      type: "0x2::dynamic_field::Field",
      version: 1n,
      content: ReleaseGenresField.serialize({
        id: FIELD,
        name: [false],
        value: [ELECTRONIC, ALTERNATIVE],
      }).toBytes(),
    },
    {
      objectId: ELECTRONIC,
      type: `${config.protocol.genre}::genre::Genre`,
      version: 1n,
      content: genreContract.Genre.serialize({
        id: ELECTRONIC,
        name: "ELECTRONIC",
      }).toBytes(),
    },
    {
      objectId: ALTERNATIVE,
      type: `${config.protocol.genre}::genre::Genre`,
      version: 1n,
      content: genreContract.Genre.serialize({
        id: ALTERNATIVE,
        name: "ALTERNATIVE",
      }).toBytes(),
    },
  ];
  const result = await Effect.runPromise(
    Effect.provide(
      getReleaseDetail(RELEASE, config),
      Layer.mergeAll(layerTest({ objects }), SuiGraphQL.layer(graphql)),
      { local: true },
    ),
  );
  expect(result.genres).toEqual(["Electronic", "Alternative"]);
});

test("release detail defaults to no genres when the extension is absent", async () => {
  const result = await Effect.runPromise(
    Effect.provide(
      getReleaseDetail(RELEASE, config),
      Layer.mergeAll(layerTest({ objects: baseObjects() }), SuiGraphQL.layer(graphql)),
      { local: true },
    ),
  );
  expect(result.genres).toEqual([]);
});
