import { expect, test } from "bun:test";
import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";
import { Audio } from "../src/contracts/audio/audio.ts";
import { ExtensionKey } from "../src/contracts/recording_master/recording_master.ts";
import { parseRecordingMasterContent, recordingMasterFieldId, setRecordingMaster } from "../src/recording-extensions.ts";

test("master field id is package-scoped and decodes the complete Audio", () => {
  const id = recordingMasterFieldId("0x1", "0x2");
  expect(id).toMatch(/^0x[0-9a-f]{64}$/);
  expect(id).not.toBe(recordingMasterFieldId("0x1", "0x3"));
  const value = { format: "flac", channels: 2, bit_depth: 24, sample_rate_hz: 44100, samples: "8500549", pcm_digest: Array(32).fill(1), blob_id: "42" };
  const bytes = bcs.struct("Field", { id: bcs.Address, name: ExtensionKey, value: Audio }).serialize({ id, name: [false], value }).toBytes();
  expect(parseRecordingMasterContent(bytes)).toMatchObject(value);
});

test("master builder uses exact Audio dependency and rejects malformed digest", () => {
  const params = {recordingId:"0x1",authority:{kind:"direct" as const,adminCap:"0x2"},recordingShareType:"0x3::s::S",compositionShareType:"0x4::s::S",recordingMasterPackageId:"0x5",audioPackageId:"0x6",master:{blobId:"42",format:"flac",channels:2,bitDepth:24,sampleRateHz:44100,samples:"8500549",pcmDigest:"ab".repeat(32)}};
  const tx = new Transaction(); setRecordingMaster(params)(tx);
  const calls = tx.getData().commands.flatMap(c=>c.$kind === "MoveCall" ? [c.MoveCall] : []);
  expect(calls.map(c=>`${c.module}::${c.function}`)).toEqual(["audio::new","recording_master::set_master"]);
  expect(calls[0]!.package).toBe(`0x${"6".padStart(64,"0")}`);
  const pureInputs = tx.getData().inputs.flatMap((input) =>
    input.$kind === "Pure" ? [Buffer.from(input.Pure.bytes, "base64").toString("hex")] : [],
  );
  expect(pureInputs).toContain(`2a${"00".repeat(31)}`);
  expect(()=>setRecordingMaster({...params,master:{...params.master,pcmDigest:"abc"}})).toThrow("32-byte");
});
