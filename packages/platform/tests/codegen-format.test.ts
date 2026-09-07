// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";

const suiBcsImport = /^import .* from '@mysten\/sui\/bcs';$/m;
const directBcsAnchor = 'import type {} from "@mysten/bcs";';

test("generated BCS modules carry exactly one direct declaration anchor", async () => {
  const generated = new Bun.Glob("src/contracts/**/*.ts");

  for await (const path of generated.scan({
    cwd: import.meta.dir + "/../../protocol",
  })) {
    const source = await Bun.file(
      import.meta.dir + "/../../protocol/" + path,
    ).text();
    const anchorCount = source
      .split("\n")
      .filter((line) => line === directBcsAnchor).length;

    expect(anchorCount, path).toBe(suiBcsImport.test(source) ? 1 : 0);
  }
});

test("release cover bindings use the verified transitive Ori address", async () => {
  const currentOri =
    "0x51792b9adb9a5d05d7c4d74d7d0cb5aefc5639afa80c0089399cab8b99752e60";
  const retiredOris = [
    "0x340057f2174fb59e4626742dd2b46c662237837b6187450cb59e4976ce7eac78",
    "0xf35cf353a62cef01084b51a9cf3da4c64c8724685ad1862f2f8284b71bd26c1a",
  ];
  const generated = new Bun.Glob("src/contracts/**/*.ts");
  const files: string[] = [];
  let sources = "";

  for await (const path of generated.scan({
    cwd: import.meta.dir + "/../../protocol",
  })) {
    files.push(path);
    sources += await Bun.file(
      import.meta.dir + "/../../protocol/" + path,
    ).text();
  }

  expect(files).toContain(
    `src/contracts/release_cover_art/deps/${currentOri}/data.ts`,
  );
  expect(files).toContain(
    `src/contracts/release_cover_art/deps/${currentOri}/confidentiality.ts`,
  );
  expect(sources).toContain(`${currentOri}::data`);
  for (const retiredOri of retiredOris) {
    expect(files.some((path) => path.includes(retiredOri))).toBeFalse();
    expect(sources).not.toContain(retiredOri);
  }
  // The pre-split ori module is gone from every generated binding.
  expect(sources).not.toContain("::walrus_data");
});
