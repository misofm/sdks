// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// What one record sale actually was, read back from its transaction.
//
// The transaction digest plus Record ID is the receipt's identity: everything shown is
// re-derived from chain state, so a receipt link survives a refresh, a deep link,
// or a share to another device. `listing::purchase` emits `RecordSoldEvent` carrying
// the copy that was minted, its number in the run, and what the buyer paid.
//
// Two reads, in order, because a receipt is opened at two very different ages:
//   fullnode  the fresh path — usually the instant the transaction lands, possibly
//             before this node has it, hence `waitForTransaction`.
//   indexer   the old path — GraphQL keeps transactions the fullnode has pruned.
//             This is what makes a months-old receipt link still open.
//
// Where the money goes is PRESENTATIONAL, not a second on-chain fact: `purchase`
// forwards the whole payment to the release's funds accumulator (there is no
// platform fee), and the royalty layer splits it downstream by the same terms this
// read walks. We show the buyer that arithmetic, in the same truncating integer
// math the chain does.

import * as listingContract from "../contracts/record_shop/listing.ts";
import {
  extractTypeParams2,
  getCompositionsByIds,
} from "@misofm/musicos";
import { normalizeStructTag, normalizeSuiAddress } from "@mysten/sui/utils";
import { Effect } from "effect";
import { SuiClient, SuiGraphQL, SuiRpcError, type BcsDecodeError, type ObjectTypeMismatchError } from "@misofm/effect";
import { getPressingDetail } from "./catalog.ts";
import { int } from "./internal/scalars.ts";
import { requireRecordSalesDeployment } from "../deployments.ts";
import { MalformedRecordSoldEventError, ReceiptNotFoundError, ReleaseNotFoundError, RecordPurchaseNotFoundError } from "../errors.ts";
import type { MisoConfig } from "./config.ts";
import type { Price, PressingDetail, PurchaseReceipt, RecordSale, TrackRoyalty } from "./types.ts";
import { getWorkAddressesByShareTypes } from "./works.ts";

const BPS = 10_000n;
const U64_MAX = (1n << 64n) - 1n;

/** `record_shop::listing::RecordSoldEvent<Currency>`. */
const RECORD_SOLD_EVENT_NAME = "listing::RecordSoldEvent";

/**
 * How long to wait for the fullnode to have the transaction before falling back
 * to the indexer. Propagation is p95 ~330ms, so this only ever runs long for a
 * digest the node genuinely doesn't have.
 */
const FULLNODE_WAIT_MS = 5_000;

/** Composition royalty rate (bps) per recording id. Sparse — an unresolved parent has no entry. */
type CompositionRates = Record<string, number | undefined>;

function coerceU64(v: unknown): bigint | null {
  const value = typeof v === "bigint"
    ? v
    : typeof v === "number" && Number.isSafeInteger(v)
      ? BigInt(v)
      : typeof v === "string" && /^\d+$/.test(v)
        ? BigInt(v)
        : null;
  return value !== null && value >= 0n && value <= U64_MAX ? value : null;
}

function priceFromUnknown(value: unknown): Price | null {
  if (!value || typeof value !== "object") return null;
  const variants = value as {
    $kind?: string;
    Fixed?: unknown;
    Floor?: unknown;
  };
  const fixed = variants.$kind === "Fixed" || Object.hasOwn(variants, "Fixed");
  const floor = variants.$kind === "Floor" || Object.hasOwn(variants, "Floor");
  if (fixed === floor) return null;
  const amount = coerceU64(fixed ? variants.Fixed : variants.Floor);
  return amount == null || amount <= 0n
    ? null
    : { kind: fixed ? "fixed" : "floor", amount: amount.toString() };
}

function typeName(value: unknown): string | null {
  const raw = typeof value === "string"
    ? value
    : value && typeof value === "object"
      ? (value as Record<string, unknown>).name
      : null;
  if (typeof raw !== "string" || !raw) return null;
  try { return normalizeStructTag(raw); } catch { return null; }
}

function positiveU32(value: unknown): number | null {
  const bigint = coerceU64(value);
  return bigint == null || bigint <= 0n || bigint > 0xffff_ffffn
    ? null
    : Number(bigint);
}

function positiveU16(value: unknown): number | null {
  const number = positiveU32(value);
  return number == null || number > 0xffff ? null : number;
}

function validPricingRelationship(purchasePrice: bigint, pricing: Price): boolean {
  const configured = BigInt(pricing.amount);
  return pricing.kind === "fixed"
    ? purchasePrice === configured
    : purchasePrice >= configured;
}

/**
 * The event's JSON projection — the fallback for transports that surface `json`
 * but no BCS. Field names are the Move ones (snake_case).
 */
function saleFromJson(
  json: Record<string, unknown>,
  currencyType: string,
): RecordSale | null {
  const edition = positiveU16(json.edition);
  const number = positiveU32(json.number);
  const purchasePrice = coerceU64(json.purchase_price);
  const purchasedTimestampMs = coerceU64(json.purchased_timestamp_ms);
  const recordId = json.record_id;
  const pricing = priceFromUnknown(json.pricing);
  const embeddedCurrency = typeName(json.purchase_currency);
  if (
    edition == null ||
    number == null ||
    purchasePrice == null || purchasePrice <= 0n ||
    purchasedTimestampMs == null ||
    !pricing || !validPricingRelationship(purchasePrice, pricing) ||
    embeddedCurrency !== currencyType ||
    typeof recordId !== "string" || !recordId ||
    typeof json.listing_id !== "string" || !json.listing_id ||
    typeof json.pressing_id !== "string" || !json.pressing_id ||
    typeof json.release_id !== "string" || !json.release_id ||
    typeof json.purchased_by !== "string" || !json.purchased_by
  ) return null;
  return {
    listingId: json.listing_id,
    pressingId: json.pressing_id,
    releaseId: json.release_id,
    recordId,
    edition,
    number,
    purchaseCurrency: embeddedCurrency,
    purchasePrice: purchasePrice.toString(),
    pricing,
    currencyType,
    purchasedBy: json.purchased_by,
    purchasedTimestampMs: purchasedTimestampMs.toString(),
  };
}

/**
 * Whether `eventType` is this deployment's `listing::RecordSoldEvent<Currency>`.
 *
 * Event BCS is structural, so a same-shaped event from another package must never
 * be decoded as a Miso sale. Normalize both package/type tags and require exactly
 * one (possibly nested) currency type argument.
 */
export function recordSoldCurrencyType(
  eventType: string,
  recordShopPackageId: string,
): string | null {
  let tag: string;
  try {
    tag = normalizeStructTag(eventType);
  } catch {
    return null;
  }

  const prefix = `${normalizeSuiAddress(recordShopPackageId)}::${RECORD_SOLD_EVENT_NAME}`;
  if (!tag.startsWith(`${prefix}<`) || !tag.endsWith(">")) return null;

  const typeArgument = tag.slice(prefix.length + 1, -1);
  if (!typeArgument) return null;
  let depth = 0;
  for (const char of typeArgument) {
    if (char === "<") depth += 1;
    else if (char === ">") {
      depth -= 1;
      if (depth < 0) return null;
    } else if (char === "," && depth === 0) {
      return null;
    }
  }
  return depth === 0 ? typeArgument : null;
}

export function isRecordSoldEventType(
  eventType: string,
  recordShopPackageId: string,
): boolean {
  return recordSoldCurrencyType(eventType, recordShopPackageId) !== null;
}

/**
 * The sale a transaction recorded, or null if it emitted none. BCS is the stable
 * shape (a JSON projection's field names vary by transport), so it is tried first.
 */
export function findRecordSales(
  events: {
    eventType: string;
    bcs: Uint8Array;
    json: Record<string, unknown> | null;
  }[],
  recordShopPackageId: string,
): RecordSale[] {
  const sales: RecordSale[] = [];
  for (const e of events) {
    const currencyType = recordSoldCurrencyType(
      e.eventType,
      recordShopPackageId,
    );
    if (!currencyType) continue;
    try {
      // The generated struct decodes addresses to 0x-hex and u64s to decimal strings.
      const s = listingContract.RecordSoldEvent.parse(e.bcs);
      const pricing = priceFromUnknown(s.pricing);
      const embeddedCurrency = typeName(s.purchase_currency);
      const purchasePrice = BigInt(s.purchase_price);
      if (
        !pricing || embeddedCurrency !== currencyType ||
        !validPricingRelationship(purchasePrice, pricing) ||
        s.edition <= 0 || s.number <= 0
      ) throw new MalformedRecordSoldEventError({ reason: "malformed canonical RecordSoldEvent" });
      sales.push({
        listingId: s.listing_id,
        pressingId: s.pressing_id,
        releaseId: s.release_id,
        recordId: s.record_id,
        edition: s.edition,
        number: s.number,
        purchaseCurrency: embeddedCurrency,
        purchasePrice: s.purchase_price,
        pricing,
        currencyType,
        purchasedBy: s.purchased_by,
        purchasedTimestampMs: s.purchased_timestamp_ms,
      });
      continue;
    } catch (error) {
      // Never reinterpret malformed canonical BCS through a looser JSON view.
      if (e.bcs.length > 0) {
        if (error instanceof MalformedRecordSoldEventError) throw error;
        throw new MalformedRecordSoldEventError({
          reason: `malformed canonical RecordSoldEvent BCS: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    const fromJson = e.json && saleFromJson(e.json, currencyType);
    if (!fromJson) throw new MalformedRecordSoldEventError({ reason: "malformed canonical RecordSoldEvent JSON" });
    sales.push(fromJson);
  }
  return sales;
}

/** Select one canonical sale by its Record ID. Selection is always explicit. */
export function findRecordSale(
  events: Parameters<typeof findRecordSales>[0],
  recordShopPackageId: string,
  recordId: string,
): RecordSale | null {
  const sales = findRecordSales(events, recordShopPackageId);
  return sales.find(
    (sale) => normalizeSuiAddress(sale.recordId) === normalizeSuiAddress(recordId),
  ) ?? null;
}

/** Every canonical sale, read from the fullnode in event order. */
const salesFromFullnode = Effect.fn("salesFromFullnode")(function* (
  txDigest: string,
  config: MisoConfig,
): Effect.fn.Return<
  RecordSale[],
  ReceiptNotFoundError | RecordPurchaseNotFoundError | MalformedRecordSoldEventError | SuiRpcError,
  SuiClient
> {
  const client = yield* SuiClient;
  const result = yield* Effect.tryPromise({
    try: (signal) =>
      client.core.waitForTransaction({
        digest: txDigest,
        include: { events: true },
        timeout: FULLNODE_WAIT_MS,
        signal,
      }),
    catch: (cause) => new SuiRpcError({ operation: "waitForTransaction", cause }),
  });
  if (result.$kind !== "Transaction" || !result.Transaction.status.success) {
    return yield* new ReceiptNotFoundError({ digest: txDigest });
  }
  const sales = requireRecordSalesDeployment(config.recordSales);
  // `findRecordSales` only ever throws `MalformedRecordSoldEventError`.
  const found = yield* Effect.try({
    try: () => findRecordSales(result.Transaction.events, sales.recordShopPackageId),
    catch: (cause) => cause as MalformedRecordSoldEventError,
  });
  if (found.length === 0) return yield* new RecordPurchaseNotFoundError({ digest: txDigest });
  return found;
});

const TX_EVENTS_QUERY = `query TransactionEvents($digest: String!) {
  transaction(digest: $digest) {
    effects {
      status
      events { nodes { contents { type { repr } json } } }
    }
  }
}`;

interface TxEventsResult {
  transaction: {
    effects: {
      status: string;
      events: { nodes: { contents: { type: { repr: string }; json: unknown } | null }[] } | null;
    } | null;
  } | null;
}

/** Every canonical sale, read from the GraphQL indexer in event order. */
const salesFromIndexer = Effect.fn("salesFromIndexer")(function* (
  txDigest: string,
  config: MisoConfig,
): Effect.fn.Return<
  RecordSale[],
  ReceiptNotFoundError | RecordPurchaseNotFoundError | MalformedRecordSoldEventError | SuiRpcError,
  SuiGraphQL
> {
  const client = yield* SuiGraphQL;
  const { data, errors } = yield* Effect.tryPromise({
    try: () =>
      client.query<TxEventsResult, { digest: string }>({
        query: TX_EVENTS_QUERY,
        variables: { digest: txDigest },
      }),
    catch: (cause) => new SuiRpcError({ operation: "transactionEvents", cause }),
  });
  if (errors?.length) {
    return yield* new SuiRpcError({
      operation: "transactionEvents",
      cause: new AggregateError(errors.map((e) => new Error(e.message)), "Transaction events query failed"),
    });
  }

  const effects = data?.transaction?.effects;
  if (!effects) return yield* new ReceiptNotFoundError({ digest: txDigest });
  if (effects.status !== "SUCCESS") return yield* new ReceiptNotFoundError({ digest: txDigest });

  const salesDeployment = requireRecordSalesDeployment(config.recordSales);
  const sales: RecordSale[] = [];
  for (const node of effects.events?.nodes ?? []) {
    const contents = node.contents;
    if (!contents) continue;
    const currencyType = recordSoldCurrencyType(
      contents.type.repr,
      salesDeployment.recordShopPackageId,
    );
    if (!currencyType) continue;
    const sale =
      typeof contents.json === "object" && contents.json !== null
        ? saleFromJson(contents.json as Record<string, unknown>, currencyType)
        : null;
    if (!sale) return yield* new MalformedRecordSoldEventError({ digest: txDigest, reason: "malformed canonical RecordSoldEvent JSON" });
    sales.push(sale);
  }
  if (sales.length > 0) return sales;
  return yield* new RecordPurchaseNotFoundError({ digest: txDigest });
});

const salesFromChain = Effect.fn("salesFromChain")(function* (
  txDigest: string,
  config: MisoConfig,
): Effect.fn.Return<
  RecordSale[],
  ReceiptNotFoundError | RecordPurchaseNotFoundError | MalformedRecordSoldEventError | SuiRpcError,
  SuiClient | SuiGraphQL
> {
  return yield* salesFromFullnode(txDigest, config).pipe(
    Effect.catchIf(
      (error): error is ReceiptNotFoundError | RecordPurchaseNotFoundError | SuiRpcError =>
        error._tag !== "MalformedRecordSoldEventError",
      () => salesFromIndexer(txDigest, config),
    ),
  );
});

/**
 * Each recording's parent composition royalty rate, in basis points, keyed by
 * recording id.
 *
 * A `Recording<RecordingShare, CompositionShare>` names its parent by SHARE TYPE,
 * not by id, so the hop is: recording type tag → composition share type →
 * (GraphQL) composition id → (Core) the composition's `royaltyRate`.
 *
 * Best-effort by design: any failure returns the rates resolved so far, and the
 * receipt drops to a track-level breakdown rather than failing the whole page.
 */
const compositionRatesByRecording = Effect.fn("compositionRatesByRecording")(function* (
  recordingIds: string[],
  config: MisoConfig,
): Effect.fn.Return<CompositionRates, SuiRpcError | BcsDecodeError, SuiClient | SuiGraphQL> {
  if (recordingIds.length === 0) return {};

  const client = yield* SuiClient;
  const shareTypeByRecording: Record<string, string> = {};
  const { objects } = yield* Effect.tryPromise({
    try: (signal) => client.core.getObjects({ objectIds: [...new Set(recordingIds)], signal }),
    catch: (cause) => new SuiRpcError({ operation: "getObjects", cause }),
  });
  for (const obj of objects) {
    if (obj instanceof Error || !obj.type) continue;
    try {
      const [, compositionShareType] = extractTypeParams2(obj.type);
      shareTypeByRecording[obj.objectId] = compositionShareType;
    } catch {
      // A recording type we can't read the parent off — skip this track.
    }
  }

  const shareTypes = Object.values(shareTypeByRecording);
  if (shareTypes.length === 0) return {};

  const addresses = yield* getWorkAddressesByShareTypes(
    { compositions: shareTypes, recordings: [] },
    config.deployment.musicos,
  );
  const compositionIds = Object.values(addresses.compositions).filter((id): id is string => !!id);
  const compositions = yield* getCompositionsByIds(compositionIds);

  const rates: CompositionRates = {};
  for (const [recordingId, shareType] of Object.entries(shareTypeByRecording)) {
    const compositionId = addresses.compositions[shareType];
    const composition = compositionId ? compositions[compositionId] : undefined;
    if (composition) rates[recordingId] = int(composition.royaltyRate.value);
  }
  return rates;
});

/**
 * Split `paid` across the release's tracks by their `splitBps`, then split each
 * track's share between its composition and its recording. All BigInt — the same
 * truncating integer math the on-chain royalty layer does, so the numbers shown
 * are the numbers paid.
 */
export function breakdown(
  tracks: PressingDetail["release"]["tracks"],
  paid: string,
  compositionRates: CompositionRates,
): TrackRoyalty[] {
  const paidUnits = BigInt(paid);
  return tracks.map((track) => {
    const amount = (paidUnits * BigInt(track.splitBps)) / BPS;
    const rate = compositionRates[track.recordingId];
    const base = {
      no: track.no,
      title: track.title,
      recordingId: track.recordingId,
      splitBps: track.splitBps,
      amount: amount.toString(),
    };
    if (rate == null) return { ...base, composition: null, recording: null };
    const composition = (amount * BigInt(rate)) / BPS;
    return { ...base, composition: composition.toString(), recording: (amount - composition).toString() };
  });
}

/**
 * The receipt for `txDigest`. The event identifies the exact immutable Pressing
 * and Listing; callers cannot accidentally reinterpret a Pressing id as an
 * obsolete sale-object id.
 *
 * The sale identifies the Pressing before its detail is fetched. `null` only when
 * that immutable Pressing cannot be read; it is never superseded or destroyed.
 */
type ReceiptError =
  | ReceiptNotFoundError
  | RecordPurchaseNotFoundError
  | MalformedRecordSoldEventError
  | ObjectTypeMismatchError
  | ReleaseNotFoundError
  | BcsDecodeError
  | SuiRpcError;

const hydratePurchaseReceipt = Effect.fn("hydratePurchaseReceipt")(function* (
  sale: RecordSale,
  config: MisoConfig,
): Effect.fn.Return<
  PurchaseReceipt | null,
  ObjectTypeMismatchError | ReleaseNotFoundError | BcsDecodeError | SuiRpcError,
  SuiClient | SuiGraphQL
> {
  const detail = yield* getPressingDetail(sale.pressingId, config);
  if (!detail) return null;

  // Best-effort: a failed composition lookup costs the sub-rows, not the page.
  const rates = yield* compositionRatesByRecording(
    detail.release.tracks.map((t) => t.recordingId),
    config,
  ).pipe(Effect.catch(() => Effect.succeed({} as CompositionRates)));

  return {
    sale,
    detail,
    price: sale.pricing.amount,
    tracks: breakdown(detail.release.tracks, sale.purchasePrice, rates),
  };
});

/** Read and hydrate every canonical Record sale in transaction event order. */
export const getPurchaseReceipts = Effect.fn("getPurchaseReceipts")(function* (
  txDigest: string,
  config: MisoConfig,
): Effect.fn.Return<PurchaseReceipt[], ReceiptError, SuiClient | SuiGraphQL> {
  const sales = yield* salesFromChain(txDigest, config);
  const hydrated = yield* Effect.forEach(sales, (sale) => hydratePurchaseReceipt(sale, config), {
    concurrency: "unbounded",
  });
  if (hydrated.some((receipt) => receipt === null)) {
    throw new Error(`A canonical Record sale in transaction ${txDigest} references an unreadable Pressing`);
  }
  return hydrated as PurchaseReceipt[];
});

/** Read one canonical receipt selected by its Record ID. Selection is mandatory:
 * one transaction may purchase multiple Records from the same Pressing. */
export const getPurchaseReceipt = Effect.fn("getPurchaseReceipt")(function* (
  txDigest: string,
  recordId: string,
  config: MisoConfig,
): Effect.fn.Return<PurchaseReceipt | null, ReceiptError, SuiClient | SuiGraphQL> {
  const sales = yield* salesFromChain(txDigest, config);
  const wanted = normalizeSuiAddress(recordId);
  const sale = sales.find((candidate) => normalizeSuiAddress(candidate.recordId) === wanted);
  return sale ? yield* hydratePurchaseReceipt(sale, config) : null;
});
