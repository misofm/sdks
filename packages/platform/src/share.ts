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
// `max_publish_or_upgrade_per_ptb` cap) — and run concurrently through a
// `ParallelTransactionExecutor`. Every Publish result is consumed immediately by
// `package::make_immutable` in that same PTB, so no share-package UpgradeCap is
// ever left with the publisher. Initialization is likewise batched. The caller
// assigns packages to work slots and supplies per-package metadata, so each
// currency still gets a descriptive, work-specific name.

import type { ParallelTransactionExecutor } from "@mysten/sui/transactions";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { Signer } from "@mysten/sui/cryptography";
import { fromBase64, fromHex, toBase64 } from "@mysten/sui/utils";
import { update_constants } from "@mysten/move-bytecode-template";
import {
  execThunks,
  publishedPackageId,
  allPublishedPackageIds,
  createdByType,
  allCreatedByType,
  type ExecResult,
} from "@misofm/musicos";

import { publishShareCurrency, initializeShareCurrency, type PackageBytecode } from "./transactions.ts";
import { SHARE_TEMPLATE } from "./share-template.ts";
import { executeViaExecutor } from "./execute.ts";

/** The protocol cap on Publish/Upgrade commands per programmable transaction. */
const PUBLISHES_PER_PTB = 5;
/** Initializes batched per PTB (each is one moveCall + transfer; all share the 0xc registry). */
const INITS_PER_PTB = 10;

// Address-free type markers: gRPC object types carry fully-normalized addresses
// (e.g. 0x0000…0002::coin::TreasuryCap), so we match on module::type rather than a
// short "0x2" prefix that would never match.
const CURRENCY_TYPE = "::coin_registry::Currency<";
const TREASURY_CAP_TYPE = "::coin::TreasuryCap<";

export interface ShareCurrency {
  /** The published share package id. */
  packageId: string;
  /** The `Currency<Share>` object id. */
  currencyId: string;
  /** The fully-qualified share type, `${packageId}::share::Share`. */
  shareType: string;
  /** The `TreasuryCap<Share>` object id (held by the treasury-cap recipient). */
  treasuryCapId: string;
  /** Net gas (MIST) attributed to this currency, if tracked per-item (else 0). */
  gasUsed: number;
}

export interface ShareCurrencyMeta {
  name: string;
  description: string;
  iconUrl?: string;
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

/** Publishes an immutable package, then initializes a fresh share currency in a second tx. */
export async function createShareCurrency(
  client: ClientWithCoreApi,
  signer: Signer,
  params: CreateShareCurrencyParams,
): Promise<ShareCurrency> {
  const signerAddress = signer.toSuiAddress();
  const initializer = params.initializerAddress ?? signerAddress;
  const recipient = params.treasuryCapRecipient ?? signerAddress;

  // Tx 1: publish the share package with the initializer baked in.
  const patched = patchInitializer(params.template ?? SHARE_TEMPLATE, initializer);
  const publishRes = await execThunks(client, signer, publishShareCurrency(patched));
  const packageId = publishedPackageId(publishRes);

  // Tx 2: initialize → creates the Currency object + transfers the TreasuryCap.
  const initRes = await execThunks(
    client,
    signer,
    initializeShareCurrency({
      shareCurrencyPackageId: packageId,
      name: params.name,
      description: params.description,
      iconUrl: params.iconUrl ?? "",
      treasuryCapRecipient: recipient,
    }),
  );

  return {
    packageId,
    currencyId: createdByType(initRes, CURRENCY_TYPE),
    shareType: `${packageId}::share::Share`,
    treasuryCapId: createdByType(initRes, TREASURY_CAP_TYPE),
    gasUsed: publishRes.gasUsed + initRes.gasUsed,
  };
}

// ── Batched (parallel) ─────────────────────────────────────────────────────

/** Splits an array into fixed-size chunks. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Publishes `count` fresh, permanently immutable share-currency packages, batched
 * at ≤5 publishes per PTB and run concurrently through the executor. Each publish
 * consumes its UpgradeCap in the same PTB. Returns the published package ids
 * (fungible — order is not meaningful; the caller assigns them to work slots).
 */
export async function publishShareCurrencies(
  executor: ParallelTransactionExecutor,
  initializerAddress: string,
  count: number,
  template: PackageBytecode = SHARE_TEMPLATE,
): Promise<{ packageIds: string[]; gasUsed: number }> {
  if (count <= 0) return { packageIds: [], gasUsed: 0 };

  // One patched template, reused for every publish (identical bytecode → distinct packages).
  const patched = patchInitializer(template, initializerAddress);

  const batchSizes: number[] = [];
  for (let remaining = count; remaining > 0; remaining -= PUBLISHES_PER_PTB) {
    batchSizes.push(Math.min(PUBLISHES_PER_PTB, remaining));
  }

  const results = await Promise.all(
    batchSizes.map((n) => executeViaExecutor(executor, ...Array.from({ length: n }, () => publishShareCurrency(patched)))),
  );

  const packageIds = results.flatMap(allPublishedPackageIds);
  const gasUsed = results.reduce((sum, r) => sum + r.gasUsed, 0);
  if (packageIds.length !== count) {
    throw new Error(`Expected ${count} published share packages, got ${packageIds.length}.`);
  }
  return { packageIds, gasUsed };
}

/** Re-associates one init PTB's created objects back to their packages by share type. */
function currenciesFromResult(res: ExecResult, batchPkgs: string[]): ShareCurrency[] {
  const currencies = allCreatedByType(res, CURRENCY_TYPE);
  const treasuries = allCreatedByType(res, TREASURY_CAP_TYPE);
  return batchPkgs.map((pkg) => {
    const shareType = `${pkg}::share::Share`;
    const currency = currencies.find((o) => o.objectType.includes(shareType));
    const treasury = treasuries.find((o) => o.objectType.includes(shareType));
    if (!currency) throw new Error(`No Currency<${shareType}> created during initialize.`);
    if (!treasury) throw new Error(`No TreasuryCap<${shareType}> created during initialize.`);
    return { packageId: pkg, currencyId: currency.objectId, shareType, treasuryCapId: treasury.objectId, gasUsed: 0 };
  });
}

/**
 * Initializes each published package into a `Currency<Share>` + `TreasuryCap`,
 * batched and run concurrently. `metaOf` supplies each package's display metadata,
 * so a currency destined for a specific work is named for it.
 *
 * `share::initialize` is NON-idempotent (`coin_registry` registers one `Currency`
 * per type), so a batch must never be re-run. Batches run under `Promise.allSettled`
 * and `onBatch` fires for each SUCCEEDED batch as it lands — letting the caller
 * persist that batch immediately. If any batch fails, the succeeded ones are already
 * reported and this throws, so a resume re-initializes only the still-missing packages.
 */
export async function initializeShareCurrencies(
  executor: ParallelTransactionExecutor,
  signerAddress: string,
  packageIds: string[],
  metaOf: (packageId: string) => ShareCurrencyMeta,
  onBatch?: (currencies: ShareCurrency[], gasUsed: number) => void | Promise<void>,
): Promise<{ currencies: ShareCurrency[]; gasUsed: number }> {
  if (packageIds.length === 0) return { currencies: [], gasUsed: 0 };

  const batches = chunk(packageIds, INITS_PER_PTB);
  const settled = await Promise.allSettled(
    batches.map(async (batchPkgs) => {
      const res = await executeViaExecutor(
        executor,
        ...batchPkgs.map((pkg) => {
          const meta = metaOf(pkg);
          return initializeShareCurrency({
            shareCurrencyPackageId: pkg,
            name: meta.name,
            description: meta.description,
            iconUrl: meta.iconUrl ?? "",
            treasuryCapRecipient: signerAddress,
          });
        }),
      );
      const batchCurrencies = currenciesFromResult(res, batchPkgs);
      if (onBatch) await onBatch(batchCurrencies, res.gasUsed);
      return { batchCurrencies, gasUsed: res.gasUsed };
    }),
  );

  const currencies: ShareCurrency[] = [];
  const errors: unknown[] = [];
  let gasUsed = 0;
  for (const s of settled) {
    if (s.status === "fulfilled") {
      currencies.push(...s.value.batchCurrencies);
      gasUsed += s.value.gasUsed;
    } else {
      errors.push(s.reason);
    }
  }
  if (errors.length > 0) {
    const msg = errors.map((e) => (e instanceof Error ? e.message : String(e))).join("; ");
    throw new Error(`${errors.length}/${batches.length} initialize batch(es) failed: ${msg}`);
  }
  return { currencies, gasUsed };
}
