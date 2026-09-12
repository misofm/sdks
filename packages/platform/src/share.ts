// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Share-currency provisioning.
//
// Every composition and every recording is backed by its own fixed-supply
// (10M @ 6dp) share currency — an independently published `share` package whose
// `INITIALIZER` constant is patched to an authorized address before publish.
// Creating one is two transactions that CANNOT share a PTB: a `moveCall` target
// must name a concrete package id, but a package published in the same PTB has no
// id until it executes, so `${pkg}::share::initialize` must run in a later tx.
//
// The bytecode is identical for every currency (only the baked-in INITIALIZER
// matters, and it is the same signer for all), so publishes are fungible: a whole
// batch can be published — up to 5 `tx.publish` per PTB (the protocol's
// `max_publish_or_upgrade_per_ptb` cap) — in one `Tx.run`. Every Publish result is
// consumed immediately by `package::make_immutable` in that same PTB, so no
// share-package UpgradeCap is ever left with the publisher. Initialization is
// likewise batched. The caller assigns packages to work slots and supplies
// per-package metadata, so each currency still gets a descriptive, work-specific
// name.
//
// Every write here goes through `Tx.run`: the three submit-on-behalf members
// (`createShareCurrency`, `publishShareCurrencies`, `initializeShareCurrencies`,
// misofm/sdks#35 WP4) take the signer as a parameter, plus an optional `gasOwner`
// and `sponsor` when the gas owner differs from the sender. `Tx.run` holds one
// sender lock per address, so what used to run concurrently through a
// `ParallelTransactionExecutor` now serializes per batch under that lock — an
// accepted behaviour change for 0.28 (parallel submission needs distinct gas
// owners, `docs/extensions.md` §5).

import { fromBase64, fromHex, toBase64 } from "@mysten/sui/utils";
import { update_constants } from "@mysten/move-bytecode-template";
import { Effect } from "effect";
import { type Executed, type Sui, type SuiAddress, type UnexpectedEffects } from "sui-effect";
import { Tx, type RunError, type Signer } from "sui-effect/tx";

import { publishShareCurrency, initializeShareCurrency, type PackageBytecode } from "./transactions.ts";
import { SHARE_TEMPLATE } from "./share-template.ts";

/** The protocol cap on Publish/Upgrade commands per programmable transaction. */
const PUBLISHES_PER_PTB = 5;
/** Initializes batched per PTB (each is one moveCall + transfer; all share the 0xc registry). */
const INITS_PER_PTB = 10;

// A bare (no type-argument) expected tag: per sui-effect's generic-Move-type
// rule, this matches every instantiation (`Currency<pkg::share::Share>` for
// any `pkg`), comparing only `address::module::name`.
const CURRENCY_TYPE = "0x2::coin_registry::Currency";
const TREASURY_CAP_TYPE = "0x2::coin::TreasuryCap";

export interface ShareCurrency {
  /** The published share package id. */
  packageId: string;
  /** The `Currency<Share>` object id. */
  currencyId: string;
  /** The fully-qualified share type, `${packageId}::share::Share`. */
  shareType: string;
  /** The `TreasuryCap<Share>` object id (held by the treasury-cap recipient). */
  treasuryCapId: string;
  /** Net gas (MIST), summed over every `Tx.run` this currency's provisioning made. Can be negative. */
  gasUsed: bigint;
}

export interface ShareCurrencyMeta {
  name: string;
  description: string;
  iconUrl?: string;
}

/** A signer to run a submit-on-behalf member as, plus a sponsor when the gas owner differs. */
export interface RunOpts {
  readonly signer: Signer;
  readonly gasOwner?: SuiAddress;
  /** The gas owner's signer. Required whenever `gasOwner` names an address that is not `signer`'s. */
  readonly sponsor?: Signer;
}

// ── Bytecode patching ────────────────────────────────────────────────────────

/**
 * Patches the `INITIALIZER` constant in the share module bytecode, replacing the
 * 32-byte zero-address placeholder with `initializerAddress`. The template is left
 * untouched; a fresh patched copy is returned. `share::initialize` asserts the
 * sender equals this address, so it must be the signer that will initialize.
 */
export function patchInitializer(template: PackageBytecode, initializerAddress: string): PackageBytecode {
  const moduleBytes = fromBase64(template.modules[0]!);

  // BCS-encoded vector<u8> of 32 zero bytes: [length=32, 0×32].
  const oldValue = new Uint8Array(33);
  oldValue[0] = 32;

  // BCS-encoded vector<u8> of the initializer's 32 address bytes.
  const newValue = new Uint8Array(33);
  newValue[0] = 32;
  newValue.set(fromHex(initializerAddress), 1);

  const patched = update_constants(moduleBytes, newValue, oldValue, "Vector(U8)");
  return { ...template, modules: [toBase64(patched)] };
}

// ── Single (sequential) ──────────────────────────────────────────────────────

export interface CreateShareCurrencyParams {
  /** The share bytecode template. Defaults to the embedded {@link SHARE_TEMPLATE}. */
  template?: PackageBytecode;
  name: string;
  description: string;
  iconUrl?: string;
  /** Address baked in as INITIALIZER; must be the signer. Defaults to the signer. */
  initializerAddress?: string;
  /** Recipient of the minted `TreasuryCap`. Defaults to the signer. */
  treasuryCapRecipient?: string;
}

/**
 * Publishes an immutable package, then initializes a fresh share currency in a
 * second tx — two `Tx.run`s, because a `moveCall` target needs the package's
 * id and a package published in the same PTB has none until it executes.
 *
 * Fails with: everything `Tx.run` does (`RunError`: `BuildError`,
 * `SimulationFailed`, `PolicyDenied`, `SigningError`, `ExecutionFailed`,
 * `NotApplied`, `SubmissionUnknown`, `JournalError`, `TransportError`), and
 * `UnexpectedEffects` when a run applied but did not create the object this
 * step expected (a Move-side change already on chain — not a "retry" outcome).
 */
export const createShareCurrency = Effect.fn("createShareCurrency")(function* (
  params: CreateShareCurrencyParams,
  opts: RunOpts,
): Effect.fn.Return<ShareCurrency, RunError | UnexpectedEffects, Sui> {
  const signerAddress = opts.signer.address;
  const initializer = params.initializerAddress ?? signerAddress;
  const recipient = params.treasuryCapRecipient ?? signerAddress;

  // Tx 1: publish the share package with the initializer baked in.
  const patched = patchInitializer(params.template ?? SHARE_TEMPLATE, initializer);
  const published = yield* Tx.run(publishShareCurrency(patched), opts);
  const packageId = String(published.packagesPublished()[0]?.id ?? "");
  if (packageId === "") {
    return yield* Effect.die(new Error("createShareCurrency: publish produced no package"));
  }

  // Tx 2: initialize → creates the Currency object + transfers the TreasuryCap.
  const initialized = yield* Tx.run(
    initializeShareCurrency({
      shareCurrencyPackageId: packageId,
      name: params.name,
      description: params.description,
      iconUrl: params.iconUrl ?? "",
      treasuryCapRecipient: recipient,
    }),
    opts,
  );
  const currency = yield* initialized.expectCreated(CURRENCY_TYPE);
  const treasuryCap = yield* initialized.expectCreated(TREASURY_CAP_TYPE);

  return {
    packageId,
    currencyId: String(currency.id),
    shareType: `${packageId}::share::Share`,
    treasuryCapId: String(treasuryCap.id),
    gasUsed: published.gasUsedTotal + initialized.gasUsedTotal,
  };
});

// ── Batched ────────────────────────────────────────────────────────────────

/** Splits an array into fixed-size chunks. */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Publishes `count` fresh, permanently immutable share-currency packages,
 * batched at ≤5 publishes per `Tx.run`. Each publish consumes its UpgradeCap
 * in the same PTB. Returns the published package ids (fungible — order is not
 * meaningful; the caller assigns them to work slots).
 *
 * Batches run as concurrent `Effect`s, but `Tx.run` holds one sender lock per
 * address, so they serialize at the submission boundary — the accepted
 * `ParallelTransactionExecutor` behaviour change for 0.28 (`docs/extensions.md`
 * §5; parallel submission needs distinct gas owners).
 *
 * Fails with: `RunError`.
 */
export const publishShareCurrencies = Effect.fn("publishShareCurrencies")(function* (
  count: number,
  opts: RunOpts & { readonly initializerAddress?: string; readonly template?: PackageBytecode },
): Effect.fn.Return<{ packageIds: string[]; gasUsed: bigint }, RunError, Sui> {
  if (count <= 0) return { packageIds: [], gasUsed: 0n };

  // One patched template, reused for every publish (identical bytecode → distinct packages).
  const initializer = opts.initializerAddress ?? opts.signer.address;
  const patched = patchInitializer(opts.template ?? SHARE_TEMPLATE, initializer);

  const batchSizes: number[] = [];
  for (let remaining = count; remaining > 0; remaining -= PUBLISHES_PER_PTB) {
    batchSizes.push(Math.min(PUBLISHES_PER_PTB, remaining));
  }

  const results = yield* Effect.forEach(
    batchSizes,
    (n) =>
      Tx.run(
        (tx) => {
          for (let i = 0; i < n; i++) publishShareCurrency(patched)(tx);
        },
        { signer: opts.signer, gasOwner: opts.gasOwner, sponsor: opts.sponsor },
      ),
    { concurrency: "unbounded" },
  );

  const packageIds = results.flatMap((executed) => executed.packagesPublished().map((ref) => String(ref.id)));
  const gasUsed = results.reduce((sum, r) => sum + r.gasUsedTotal, 0n);
  if (packageIds.length !== count) {
    return yield* Effect.die(new Error(`Expected ${count} published share packages, got ${packageIds.length}.`));
  }
  return { packageIds, gasUsed };
});

/** Re-associates one init PTB's created objects back to their packages by share type. */
function currenciesFromResult(executed: Executed, batchPkgs: readonly string[]): ShareCurrency[] {
  const currencies = executed.created(CURRENCY_TYPE);
  const treasuries = executed.created(TREASURY_CAP_TYPE);
  return batchPkgs.map((pkg) => {
    const shareType = `${pkg}::share::Share`;
    const currency = currencies.find((ref) => ref.type?.includes(shareType) === true);
    const treasury = treasuries.find((ref) => ref.type?.includes(shareType) === true);
    if (!currency) throw new Error(`No Currency<${shareType}> created during initialize.`);
    if (!treasury) throw new Error(`No TreasuryCap<${shareType}> created during initialize.`);
    return { packageId: pkg, currencyId: String(currency.id), shareType, treasuryCapId: String(treasury.id), gasUsed: 0n };
  });
}

/**
 * Initializes each published package into a `Currency<Share>` + `TreasuryCap`,
 * batched (≤10 per `Tx.run`). `metaOf` supplies each package's display
 * metadata, so a currency destined for a specific work is named for it.
 *
 * `share::initialize` is NON-idempotent (`coin_registry` registers one
 * `Currency` per type), so a batch must never be re-run. `onBatch` fires for
 * each succeeded batch as it lands, letting the caller persist it
 * immediately, before the whole call settles. If any batch fails, the ones
 * that already succeeded have already been reported through `onBatch`; this
 * then fails with that batch's own typed error (the first one encountered),
 * so a resume re-initializes only the still-missing packages.
 *
 * Fails with: `RunError`, `UnexpectedEffects` from a rejecting `onBatch`
 * effect (typed `E`), or whatever `onBatch` itself declares.
 */
export function initializeShareCurrencies<E = never>(
  packageIds: readonly string[],
  metaOf: (packageId: string) => ShareCurrencyMeta,
  opts: RunOpts & {
    readonly onBatch?: (currencies: ShareCurrency[], gasUsed: bigint) => Effect.Effect<void, E>;
  },
): Effect.Effect<{ currencies: ShareCurrency[]; gasUsed: bigint }, RunError | E, Sui> {
  return Effect.gen(function* () {
    if (packageIds.length === 0) return { currencies: [], gasUsed: 0n };

    const batches = chunk(packageIds, INITS_PER_PTB);
    // `Effect.result` per batch preserves the predecessor's partial-failure
    // tolerance: one batch's error does not cancel sibling batches already in
    // flight.
    const outcomes = yield* Effect.forEach(
      batches,
      (batchPkgs) =>
        Tx.run(
          (tx) => {
            for (const pkg of batchPkgs) {
              const meta = metaOf(pkg);
              initializeShareCurrency({
                shareCurrencyPackageId: pkg,
                name: meta.name,
                description: meta.description,
                iconUrl: meta.iconUrl ?? "",
                treasuryCapRecipient: opts.signer.address,
              })(tx);
            }
          },
          { signer: opts.signer, gasOwner: opts.gasOwner, sponsor: opts.sponsor },
        ).pipe(
          Effect.map((executed) => ({
            batchCurrencies: currenciesFromResult(executed, batchPkgs),
            gasUsed: executed.gasUsedTotal,
          })),
          Effect.flatMap(({ batchCurrencies, gasUsed }) =>
            (opts.onBatch ? opts.onBatch(batchCurrencies, gasUsed) : Effect.void).pipe(
              Effect.as({ batchCurrencies, gasUsed }),
            ),
          ),
          Effect.result,
        ),
      { concurrency: "unbounded" },
    );

    const currencies: ShareCurrency[] = [];
    let gasUsed = 0n;
    let firstFailure: RunError | E | undefined;
    for (const outcome of outcomes) {
      if (outcome._tag === "Success") {
        currencies.push(...outcome.success.batchCurrencies);
        gasUsed += outcome.success.gasUsed;
      } else if (firstFailure === undefined) {
        firstFailure = outcome.failure;
      }
    }
    if (firstFailure !== undefined) return yield* Effect.fail(firstFailure);
    return { currencies, gasUsed };
  });
}
