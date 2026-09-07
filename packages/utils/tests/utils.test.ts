import { expect, test } from "bun:test";
import { Effect } from "effect";
import { asU64, asU256 } from "../src/numeric.ts";
import { base64UrlToBytes, bytesToBase64Url, walrusBlobIdFromU256, walrusBlobIdToU256, walrusU256 } from "../src/encoding.ts";
import { runPromise, SdkError, tryPromise, trySync, workflow, toPromise } from "../src/effect.ts";

test("unsigned values preserve exactness and reject ambiguous representations", () => {
  expect(asU64("n", (1n << 64n) - 1n)).toBe((1n << 64n) - 1n);
  expect(asU256("n", ((1n << 256n) - 1n).toString())).toBe((1n << 256n) - 1n);
  for (const value of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, "01", "+1", " 1", "0x1", "1e2", ""]) {
    expect(() => asU64("n", value)).toThrow();
  }
  expect(() => asU64("n", 1n << 64n)).toThrow();
  expect(() => asU256("n", 1n << 256n)).toThrow();
  expect(asU64("n", Number.MAX_SAFE_INTEGER)).toBe(BigInt(Number.MAX_SAFE_INTEGER));
  expect(walrusU256("n", "0x1")).toBe(1n);
});

test("canonical codecs round-trip every byte across partial base64 groups", () => {
  for (const size of [0, 1, 2, 3, 31, 32, 256, 257]) {
    const bytes = Uint8Array.from({ length: size }, (_, i) => i % 256);
    expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
  }
  for (const value of ["A", "AA=", "AA+", "AA/", "AB", "AAB", " AA", "AA\n"]) {
    expect(() => base64UrlToBytes(value)).toThrow(/canonical/);
  }
  expect(walrusBlobIdFromU256(1n)).toBe("AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  for (const value of [0n, 1n, 1n << 128n, (1n << 256n) - 1n]) {
    expect(walrusBlobIdToU256(walrusBlobIdFromU256(value))).toBe(value);
  }
  expect(() => walrusBlobIdToU256("AAAA")).toThrow(/32 bytes/);
});

test("Effect failures name the operation while Promise adapters preserve every rejection value", async () => {
  for (const cause of [new Error("transport"), new DOMException("cancelled", "AbortError"), "failure", undefined, null]) {
    const leaf = tryPromise("fetchRecord", async () => { throw cause; });
    const failure = await Effect.runPromise(Effect.flip(leaf));
    expect(failure).toBeInstanceOf(SdkError);
    expect(failure.operation).toBe("fetchRecord");
    expect(failure.cause).toBe(cause);
    const outcome = await runPromise(leaf).then(() => ({ ok: true }), (error: unknown) => ({ ok: false, error }));
    expect(outcome).toEqual({ ok: false, error: cause });
  }
  const existing = new SdkError("inner", new Error("failed"));
  expect(await Effect.runPromise(Effect.flip(trySync("outer", () => { throw existing; })))).toBe(existing);
});

test("Effect interruption reaches a foreign I/O signal", async () => {
  let signal: AbortSignal | undefined;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const controller = new AbortController();
  const pending = runPromise(tryPromise("wait", (value) => {
    signal = value;
    started();
    return new Promise<never>(() => {});
  }), { signal: controller.signal });
  await ready;
  controller.abort();
  await expect(pending).rejects.toBeDefined();
  expect(signal?.aborted).toBe(true);
});

test("workflow names decoder failures and preserves interruption", async () => {
  const cause = new Error("malformed bytes");
  const decode = workflow("decodeRecord", function* () {
    yield* Effect.succeed(undefined);
    throw cause;
  });
  const failure = await Effect.runPromise(Effect.flip(decode));
  expect(failure.operation).toBe("decodeRecord");
  expect(failure.cause).toBe(cause);
  const interrupted = await Effect.runPromiseExit(workflow("cancel", function* () { yield* Effect.interrupt; }));
  expect(interrupted._tag).toBe("Failure");
  if (interrupted._tag === "Failure") expect(interrupted.cause.reasons.every((reason) => reason._tag === "Interrupt")).toBe(true);
});

test("Promise adapters preserve optional arguments, defaults, and original rejection values", async () => {
  const failure = new Error("negative count");
  const operation = toPromise((label: string, count: number = 2) => trySync("repeat", () => {
    if (count < 0) throw failure;
    return label.repeat(count);
  }));
  const typed: (label: string, count?: number) => Promise<string> = operation;
  expect(await typed("a")).toBe("aa");
  expect(await typed("b", 3)).toBe("bbb");
  await expect(typed("c", -1)).rejects.toBe(failure);
});
