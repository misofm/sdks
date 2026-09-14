import { expect, test } from "bun:test";
import { bcs } from "@mysten/sui/bcs";
import { Effect } from "effect";
import { layerTest } from "@unconfirmed/sui-effect/testing";
import { ExtensionKey, ReleaseCoverArt } from "../../src/contracts/release_cover_art/release_cover_art.ts";
import { releaseCoverFieldId } from "../../src/cover.ts";
import { readReleaseCover } from "../../src/read/catalog.ts";
import { misoConfig } from "../../src/read/config.ts";
import { u256ToB64Url } from "../../src/read/internal/walrus.ts";

test("cover read returns still and animated blob IDs without choosing a host", async () => {
  const config = misoConfig("testnet");
  const id = releaseCoverFieldId("0x1", config.protocol.releaseCoverArt);
  const blob = (blob_id: string) => ({ blob_id, confidentiality: { Unencrypted: true as const } });
  const content = bcs.struct("Field", { id: bcs.Address, name: ExtensionKey, value: ReleaseCoverArt }).serialize({
    id, name: [false], value: { cover: { still: blob("42"), animated: blob("43") }, track_covers: [[]] },
  }).toBytes();
  const cover = await Effect.runPromise(readReleaseCover("0x1", config).pipe(Effect.provide(layerTest({ objects: [
    { objectId: id, type: "0x2::dynamic_field::Field", version: 1n, content },
  ] }))));
  expect(cover).toEqual({ still: { kind: "blob", blobId: u256ToB64Url("42") }, animated: { kind: "blob", blobId: u256ToB64Url("43") } });
});
