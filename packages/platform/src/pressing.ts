// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Primary Record sales. `record` owns concrete Records and edition-scoped
// Pressings; immutable `record_shop` owns per-currency Listings and payment.

import {
  deriveObjectID,
  normalizeStructTag,
  normalizeSuiAddress,
  parseStructTag,
} from "@mysten/sui/utils";
import { Effect, Option, Result, Schema } from "effect";
import { DecodeError, ObjectId, Sui, type ObjectDeleted, type ObjectUnavailable, type TransportError } from "sui-effect";
import type { TxThunk } from "./transactions.ts";
import { asU64, type U64Input } from "./vault.ts";
import * as pressingContract from "./contracts/record/pressing.ts";
import * as recordContract from "./contracts/record/record.ts";
import * as listingContract from "./contracts/record_shop/listing.ts";

const MAX_U16 = 0xffff;
const MAX_U32 = 0xffff_ffff;
const UNIT_STRUCT_KEY_BYTES = new Uint8Array([0]);

/** Fixed cross-client parity vector for the finalized Record/Record Shop
 * derived-object ABI. Outputs are literals, not initialized through the
 * derivation helpers they verify. */
export const RECORD_SALES_DERIVATION_VECTOR_V1 = {
  releaseId:
    "0x3333333333333333333333333333333333333333333333333333333333333333",
  edition: 2,
  currencyType: "0x2::sui::SUI",
  recordPackageId:
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  recordShopPackageId:
    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  pressingId:
    "0x3e74b7f16951f027684e3bc44dec1efa35a0754017417ad5d4d4131f92a20c16",
  pressingAdminCapId:
    "0xbaec8eab17a06cc3c3a5d13e4b5b636a210776bd60f86b423d245f70f8e965a6",
  listingId:
    "0x7fbf4cb7cce881a50bdc848ee65545299fec0887213524de29e039bed31e0e37",
  recordNumber: 7,
  recordId:
    "0xd492af6fc9b88d71c6674e486ab7aeca911ab797f651bae891a1cf8e54f94f1a",
} as const;

export type ListingPrice = { kind: "fixed" | "floor"; amount: U64Input };
export type ListingSwitch = "enabled" | "disabled";

function uint(label: string, value: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${label} must be an integer from 0 to ${max}`);
  }
  return value;
}

function edition(value: number): number {
  const out = uint("edition", value, MAX_U16);
  if (out === 0) throw new RangeError("edition must be greater than zero");
  return out;
}

function maxSupply(value: number | null | undefined): number | null {
  if (value == null) return null;
  const out = uint("max supply", value, MAX_U32);
  if (out === 0) throw new RangeError("max supply must be greater than zero");
  return out;
}

export function derivePressingId(
  releaseId: string,
  editionNumber: number,
  recordPackageId: string,
): string {
  const value = edition(editionNumber);
  return deriveObjectID(
    releaseId,
    `${recordPackageId}::pressing::PressingKey`,
    pressingContract.PressingKey.serialize([value]).toBytes(),
  );
}

export function derivePressingAdminCapId(
  pressingId: string,
  recordPackageId: string,
): string {
  return deriveObjectID(
    pressingId,
    `${recordPackageId}::pressing::PressingAdminCapKey`,
    UNIT_STRUCT_KEY_BYTES,
  );
}

export function deriveRecordId(
  pressingId: string,
  number: number,
  recordPackageId: string,
): string {
  const value = uint("record number", number, MAX_U32);
  if (value === 0)
    throw new RangeError("record number must be greater than zero");
  return deriveObjectID(
    pressingId,
    `${recordPackageId}::record::RecordKey`,
    recordContract.RecordKey.serialize([value]).toBytes(),
  );
}

export function deriveListingId(
  pressingId: string,
  currencyType: string,
  recordShopPackageId: string,
): string {
  return deriveObjectID(
    pressingId,
    `${recordShopPackageId}::listing::ListingKey<${normalizeStructTag(currencyType)}>`,
    UNIT_STRUCT_KEY_BYTES,
  );
}

export function deriveSaleIds(
  releaseId: string,
  editionNumber: number,
  currencyType: string,
  recordPackageId: string,
  recordShopPackageId: string,
): { pressingId: string; listingId: string } {
  const pressingId = derivePressingId(
    releaseId,
    editionNumber,
    recordPackageId,
  );
  return {
    pressingId,
    listingId: deriveListingId(pressingId, currencyType, recordShopPackageId),
  };
}

type Tx = Parameters<TxThunk>[0];

function priceArg(tx: Tx, packageId: string, price: ListingPrice) {
  const fn =
    price.kind === "fixed" ? listingContract.fixed : listingContract.floor;
  return tx.add(
    fn({
      package: packageId,
      arguments: [asU64("listing price", price.amount)],
    }),
  );
}

function stateArg(tx: Tx, packageId: string, state: ListingSwitch) {
  const fn =
    state === "enabled" ? listingContract.enabled : listingContract.disabled;
  return tx.add(fn({ package: packageId }));
}

function witnessType(recordShopPackageId: string): string {
  return `${recordShopPackageId}::witness::Witness`;
}

export interface ListingTerms {
  currencyType: string;
  price: ListingPrice;
  state?: ListingSwitch;
}

export interface OpenPressingParams {
  releaseId: string;
  releaseAdminCapId: string;
  edition: number;
  maxSupply?: number | null;
  listings: readonly ListingTerms[];
  adminCapRecipient: string;
  recordPackageId: string;
  recordShopPackageId: string;
}

/** Initial setup: create the Pressing, authorize Record Shop, open/share Listings,
 * share the Pressing, and transfer its admin capability. */
export function openPressing(p: OpenPressingParams): TxThunk {
  return (tx) => {
    const [pressing, cap] = tx.add(
      pressingContract._new({
        package: p.recordPackageId,
        arguments: [
          p.releaseId,
          p.releaseAdminCapId,
          edition(p.edition),
          maxSupply(p.maxSupply),
        ],
      }),
    );
    tx.add(
      pressingContract.authorizeDistributor({
        package: p.recordPackageId,
        arguments: [pressing!, cap!],
        typeArguments: [witnessType(p.recordShopPackageId)],
      }),
    );
    for (const terms of p.listings) {
      const listing = tx.add(
        listingContract._new({
          package: p.recordShopPackageId,
          arguments: [
            pressing!,
            cap!,
            priceArg(tx, p.recordShopPackageId, terms.price),
          ],
          typeArguments: [terms.currencyType],
        }),
      );
      if (terms.state === "disabled") {
        tx.add(
          listingContract.setState({
            package: p.recordShopPackageId,
            arguments: [
              listing,
              cap!,
              stateArg(tx, p.recordShopPackageId, "disabled"),
            ],
            typeArguments: [terms.currencyType],
          }),
        );
      }
      tx.add(
        listingContract.share({
          package: p.recordShopPackageId,
          arguments: [listing],
          typeArguments: [terms.currencyType],
        }),
      );
    }
    tx.add(
      pressingContract.share({
        package: p.recordPackageId,
        arguments: [pressing!],
      }),
    );
    tx.transferObjects([cap!], p.adminCapRecipient);
  };
}

export interface PressingAdministrationParams {
  pressingId: string;
  pressingAdminCapId: string;
  recordPackageId: string;
  recordShopPackageId: string;
}

export function authorizeRecordShop(p: PressingAdministrationParams): TxThunk {
  return (tx) => {
    tx.add(
      pressingContract.authorizeDistributor({
        package: p.recordPackageId,
        arguments: [p.pressingId, p.pressingAdminCapId],
        typeArguments: [witnessType(p.recordShopPackageId)],
      }),
    );
  };
}

export function revokeRecordShop(p: PressingAdministrationParams): TxThunk {
  return (tx) => {
    tx.add(
      pressingContract.revokeDistributor({
        package: p.recordPackageId,
        arguments: [p.pressingId, p.pressingAdminCapId],
        typeArguments: [witnessType(p.recordShopPackageId)],
      }),
    );
  };
}

export interface OpenListingParams {
  pressingId: string;
  pressingAdminCapId: string;
  terms: ListingTerms;
  recordShopPackageId: string;
}

/** Add one permanent currency Listing. Authorization is deliberately separate. */
export function openListing(p: OpenListingParams): TxThunk {
  return (tx) => {
    const listing = tx.add(
      listingContract._new({
        package: p.recordShopPackageId,
        arguments: [
          p.pressingId,
          p.pressingAdminCapId,
          priceArg(tx, p.recordShopPackageId, p.terms.price),
        ],
        typeArguments: [p.terms.currencyType],
      }),
    );
    if (p.terms.state === "disabled") {
      tx.add(
        listingContract.setState({
          package: p.recordShopPackageId,
          arguments: [
            listing,
            p.pressingAdminCapId,
            stateArg(tx, p.recordShopPackageId, "disabled"),
          ],
          typeArguments: [p.terms.currencyType],
        }),
      );
    }
    tx.add(
      listingContract.share({
        package: p.recordShopPackageId,
        arguments: [listing],
        typeArguments: [p.terms.currencyType],
      }),
    );
  };
}

export interface SetListingPriceParams {
  pressingId: string;
  currencyType: string;
  pressingAdminCapId: string;
  price: ListingPrice;
  recordShopPackageId: string;
}

export function setListingPrice(p: SetListingPriceParams): TxThunk {
  return (tx) => {
    tx.add(
      listingContract.setPrice({
        package: p.recordShopPackageId,
        arguments: [
          deriveListingId(p.pressingId, p.currencyType, p.recordShopPackageId),
          p.pressingAdminCapId,
          priceArg(tx, p.recordShopPackageId, p.price),
        ],
        typeArguments: [p.currencyType],
      }),
    );
  };
}

export interface SetListingStateParams {
  pressingId: string;
  currencyType: string;
  pressingAdminCapId: string;
  state: ListingSwitch;
  recordShopPackageId: string;
}

export function setListingState(p: SetListingStateParams): TxThunk {
  return (tx) => {
    tx.add(
      listingContract.setState({
        package: p.recordShopPackageId,
        arguments: [
          deriveListingId(p.pressingId, p.currencyType, p.recordShopPackageId),
          p.pressingAdminCapId,
          stateArg(tx, p.recordShopPackageId, p.state),
        ],
        typeArguments: [p.currencyType],
      }),
    );
  };
}

export interface PurchaseRecordParams {
  releaseId: string;
  edition: number;
  paymentAmount: U64Input;
  expectedPricing: ListingPrice;
  currencyType: string;
  recipient: string;
  recordPackageId: string;
  recordShopPackageId: string;
}

export function purchaseRecord(p: PurchaseRecordParams): TxThunk {
  return (tx) => {
    const { pressingId, listingId } = deriveSaleIds(
      p.releaseId,
      p.edition,
      p.currencyType,
      p.recordPackageId,
      p.recordShopPackageId,
    );
    const payment = tx.balance({
      balance: asU64("purchase amount", p.paymentAmount),
      type: p.currencyType,
      useGasCoin: false,
    });
    const record = tx.add(
      listingContract.purchase({
        package: p.recordShopPackageId,
        arguments: [
          listingId,
          pressingId,
          payment,
          priceArg(tx, p.recordShopPackageId, p.expectedPricing),
        ],
        typeArguments: [p.currencyType],
      }),
    );
    tx.transferObjects([record], p.recipient);
  };
}

/** One permanent record-production run derived from a release. */
export class Pressing extends Schema.Class<Pressing>("@misofm/platform/Pressing")({
  id: Schema.String,
  releaseId: Schema.String,
  edition: Schema.Number,
  supply: Schema.Number,
  maxSupply: Schema.NullOr(Schema.Number),
  distributors: Schema.Array(Schema.String),
}) {}

/** One permanent currency offer derived from a Pressing. */
export class Listing extends Schema.Class<Listing>("@misofm/platform/Listing")({
  id: Schema.String,
  releaseId: Schema.String,
  pressingId: Schema.String,
  pricing: Schema.Struct({
    kind: Schema.Literals(["fixed", "floor"]),
    amount: Schema.String,
  }),
  state: Schema.Literals(["enabled", "disabled"]),
  currencyType: Schema.String,
}) {}

/**
 * One purchased copy of a Pressing. Named `PressingRecord`, not `Record` — the
 * Move type is `record::Record`, but `Record` collides with TypeScript's
 * built-in `Record<K, V>` utility type, which this codebase uses constantly.
 */
export class PressingRecord extends Schema.Class<PressingRecord>("@misofm/platform/PressingRecord")({
  id: Schema.String,
  releaseId: Schema.String,
  pressingId: Schema.String,
  edition: Schema.Number,
  number: Schema.Number,
  purchaseCurrency: Schema.String,
  purchasePrice: Schema.String,
  purchasedBy: Schema.String,
  purchasedTimestampMs: Schema.String,
}) {}

function sameId(a: string, b: string): boolean {
  return normalizeSuiAddress(a) === normalizeSuiAddress(b);
}

function requireId(label: string, actual: string, expected: string): void {
  if (!sameId(actual, expected))
    throw new Error(`${label} ${actual} does not match expected ${expected}`);
}

function requireListingCurrency(
  type: string,
  recordShopPackageId: string,
): string {
  const actual = normalizeStructTag(type);
  const tag = parseStructTag(actual);
  if (
    tag.address !== normalizeSuiAddress(recordShopPackageId) ||
    tag.module !== "listing" ||
    tag.name !== "Listing" ||
    tag.typeParams.length !== 1
  )
    throw new Error(
      `Listing has type ${actual}, not the configured Record Shop Listing<Currency>`,
    );
  return normalizeStructTag(tag.typeParams[0]!);
}

function enumKind(
  value: { $kind?: string } & Record<string, unknown>,
  names: readonly string[],
): string {
  for (const name of names)
    if (value.$kind === name || Object.hasOwn(value, name)) return name;
  throw new Error(`unknown enum variant; expected ${names.join(" or ")}`);
}

function parsePricing(value: unknown): { kind: "fixed" | "floor"; amount: string } {
  if (!value || typeof value !== "object")
    throw new Error("Listing has malformed pricing");
  const v = value as { $kind?: string; Fixed?: string; Floor?: string };
  const kind = enumKind(v as never, ["Fixed", "Floor"]);
  const amount = kind === "Fixed" ? v.Fixed : v.Floor;
  if (amount == null || BigInt(amount) <= 0n)
    throw new Error("Listing has invalid pricing amount");
  return { kind: kind === "Fixed" ? "fixed" : "floor", amount };
}

/** Raw BCS-parse -> camelCase mapper; `Schema.decodeUnknownEffect` (via `decodeBcs`) validates and constructs `Pressing`. */
function mapPressing(pressingId: string, recordPackageId: string, content: Uint8Array): typeof Pressing.Encoded {
  const parsed = pressingContract.Pressing.parse(content);
  requireId("Pressing UID", parsed.id, pressingId);
  requireId(
    "Pressing derived id",
    pressingId,
    derivePressingId(parsed.release_id, parsed.edition, recordPackageId),
  );
  return {
    id: pressingId,
    releaseId: parsed.release_id,
    edition: parsed.edition,
    supply: parsed.supply,
    maxSupply: parsed.max_supply,
    distributors: parsed.distributors.contents.map((item) => normalizeStructTag(item.name)),
  };
}

function mapListing(
  listingId: string,
  recordShopPackageId: string,
  currencyType: string,
  content: Uint8Array,
): typeof Listing.Encoded {
  const parsed = listingContract.Listing.parse(content);
  requireId("Listing UID", parsed.id, listingId);
  requireId(
    "Listing derived id",
    listingId,
    deriveListingId(parsed.pressing_id, currencyType, recordShopPackageId),
  );
  const state = enumKind(parsed.state as never, ["Enabled", "Disabled"]);
  return {
    id: listingId,
    releaseId: parsed.release_id,
    pressingId: parsed.pressing_id,
    pricing: parsePricing(parsed.pricing),
    state: state === "Enabled" ? "enabled" : "disabled",
    currencyType,
  };
}

function mapRecord(recordId: string, recordPackageId: string, content: Uint8Array): typeof PressingRecord.Encoded {
  const parsed = recordContract.Record.parse(content);
  requireId("Record UID", parsed.id, recordId);
  requireId(
    "Record derived id",
    recordId,
    deriveRecordId(parsed.pressing_id, parsed.number, recordPackageId),
  );
  return {
    id: recordId,
    releaseId: parsed.release_id,
    pressingId: parsed.pressing_id,
    edition: parsed.edition,
    number: parsed.number,
    purchaseCurrency: normalizeStructTag(parsed.purchase_currency.name),
    purchasePrice: parsed.purchase_price,
    purchasedBy: parsed.purchased_by,
    purchasedTimestampMs: parsed.purchased_timestamp_ms,
  };
}

/** Fails with a typed `DecodeError` unless `actualType` is `expectedType` (both normalized). */
function checkType(objectId: string, actualType: string, expectedType: string): Effect.Effect<void, DecodeError> {
  const actual = normalizeStructTag(actualType);
  const expected = normalizeStructTag(expectedType);
  if (actual === expected) return Effect.void;
  return Effect.fail(
    new DecodeError({ objectId: ObjectId.make(objectId), expectedType: expected, issue: `expected ${expected}, found ${actual}` }),
  );
}

/**
 * Fails with a typed `DecodeError` unless `type` is `recordShopPackageId`'s
 * `listing::Listing<Currency>`; returns the currency type argument.
 */
function assertListingType(objectId: string, type: string, recordShopPackageId: string): Effect.Effect<string, DecodeError> {
  return Effect.try({
    try: () => requireListingCurrency(type, recordShopPackageId),
    catch: () =>
      new DecodeError({
        objectId: ObjectId.make(objectId),
        expectedType: `${normalizeSuiAddress(recordShopPackageId)}::listing::Listing<Currency>`,
        issue: `actual type ${normalizeStructTag(type)} is not a Listing<Currency> of this Record Shop package`,
      }),
  });
}

/**
 * Wraps a possibly-throwing raw-bytes mapper (BCS parse plus the internal
 * derived-id consistency checks `require Id` performs) into a typed
 * `DecodeError`, then validates the mapped shape against the domain
 * `Schema`. Mirrors the predecessor `@misofm/effect`-era `decodeBcs`'s two
 * stages, now producing sui-effect's `DecodeError` instead of
 * `BcsDecodeError`.
 */
function decodeInto<A, I>(map: () => I, domain: Schema.Codec<A, I>, objectId: string, expectedType: string): Effect.Effect<A, DecodeError> {
  return Effect.try({
    try: map,
    catch: (cause) => new DecodeError({ objectId: ObjectId.make(objectId), expectedType, issue: cause instanceof Error ? cause.message : String(cause) }),
  }).pipe(
    Effect.flatMap((encoded) =>
      Schema.decodeUnknownEffect(domain)(encoded).pipe(
        Effect.mapError(
          (issue) =>
            new DecodeError({
              objectId: ObjectId.make(objectId),
              expectedType,
              issue: issue instanceof Error ? issue.message : String(issue),
            }),
        ),
      ),
    ),
  );
}

/** One permanent pressing by id, or `null` when no such Pressing exists. */
export const getPressing = Effect.fn("getPressing")(function* (
  pressingId: string,
  recordPackageId: string,
): Effect.fn.Return<Pressing | null, DecodeError | ObjectUnavailable | TransportError, Sui> {
  const sui = yield* Sui;
  const found = yield* sui.getObjectOption(ObjectId.make(pressingId));
  if (Option.isNone(found)) return null;
  const { content, type } = found.value;
  const expectedType = `${recordPackageId}::pressing::Pressing`;
  yield* checkType(pressingId, type, expectedType);
  return yield* decodeInto(() => mapPressing(pressingId, recordPackageId, content), Pressing, pressingId, expectedType);
});

/** One currency-specific listing by id, or `null` when no such Listing exists. */
export const getListing = Effect.fn("getListing")(function* (
  listingId: string,
  recordShopPackageId: string,
): Effect.fn.Return<Listing | null, DecodeError | ObjectUnavailable | TransportError, Sui> {
  const sui = yield* Sui;
  const found = yield* sui.getObjectOption(ObjectId.make(listingId));
  if (Option.isNone(found)) return null;
  const { content, type } = found.value;
  const currencyType = yield* assertListingType(listingId, type, recordShopPackageId);
  return yield* decodeInto(
    () => mapListing(listingId, recordShopPackageId, currencyType, content),
    Listing,
    listingId,
    `${recordShopPackageId}::listing::Listing<Currency>`,
  );
});

/** One purchased copy by id, or `null` when no such Record exists. */
export const getRecord = Effect.fn("getRecord")(function* (
  recordId: string,
  recordPackageId: string,
): Effect.fn.Return<PressingRecord | null, DecodeError | ObjectUnavailable | TransportError, Sui> {
  const sui = yield* Sui;
  const found = yield* sui.getObjectOption(ObjectId.make(recordId));
  if (Option.isNone(found)) return null;
  const { content, type } = found.value;
  const expectedType = `${recordPackageId}::record::Record`;
  yield* checkType(recordId, type, expectedType);
  return yield* decodeInto(() => mapRecord(recordId, recordPackageId, content), PressingRecord, recordId, expectedType);
});

export interface GetSaleParams {
  releaseId: string;
  edition: number;
  currencyType: string;
  recordPackageId: string;
  recordShopPackageId: string;
}

/**
 * A missing/deleted object is a legitimate `null` half of a sale (the
 * Pressing has not been made yet, or that currency was never listed); any
 * other per-item failure (`ObjectUnavailable`) is not — it means the node
 * could not say what happened, and misofm/sdks#35's WP2 names this exact
 * behaviour change: unlike the predecessor's `getObjectsContent` (which
 * silently dropped every kind of per-item failure into "missing"), that now
 * fails the whole read typed instead of being folded into `null`.
 */
function nullableObject<E extends { readonly _tag: string }>(
  result: Result.Result<{ readonly content: Uint8Array; readonly type: string }, E>,
): Effect.Effect<{ readonly content: Uint8Array; readonly type: string } | null, Exclude<E, { readonly _tag: "ObjectNotFound" | "ObjectDeleted" }>> {
  if (Result.isSuccess(result)) return Effect.succeed(result.success);
  const failure = result.failure;
  if (failure._tag === "ObjectNotFound" || failure._tag === "ObjectDeleted") return Effect.succeed(null);
  return Effect.fail(failure as never);
}

/** A Pressing and its currency-specific Listing, read in one chunked `sui.getObjects`. Either half may be `null`. */
export const getSale = Effect.fn("getSale")(function* (
  p: GetSaleParams,
): Effect.fn.Return<{ pressing: Pressing | null; listing: Listing | null }, DecodeError | ObjectDeleted | ObjectUnavailable | TransportError, Sui> {
  const { pressingId, listingId } = deriveSaleIds(
    p.releaseId,
    p.edition,
    p.currencyType,
    p.recordPackageId,
    p.recordShopPackageId,
  );
  const sui = yield* Sui;
  const [pressingResult, listingResult] = yield* sui.getObjects([ObjectId.make(pressingId), ObjectId.make(listingId)]);

  const pressingFound = yield* nullableObject(pressingResult!);
  let pressing: Pressing | null = null;
  if (pressingFound) {
    const expectedType = `${p.recordPackageId}::pressing::Pressing`;
    yield* checkType(pressingId, pressingFound.type, expectedType);
    pressing = yield* decodeInto(() => mapPressing(pressingId, p.recordPackageId, pressingFound.content), Pressing, pressingId, expectedType);
    requireId("Sale pressing release", pressing.releaseId, p.releaseId);
  }

  const listingFound = yield* nullableObject(listingResult!);
  let listing: Listing | null = null;
  if (listingFound) {
    const currencyType = yield* assertListingType(listingId, listingFound.type, p.recordShopPackageId);
    listing = yield* decodeInto(
      () => mapListing(listingId, p.recordShopPackageId, currencyType, listingFound.content),
      Listing,
      listingId,
      `${p.recordShopPackageId}::listing::Listing<Currency>`,
    );
    requireId("Sale listing release", listing.releaseId, p.releaseId);
    requireId("Sale listing pressing", listing.pressingId, pressingId);
    if (listing.currencyType !== normalizeStructTag(p.currencyType)) {
      throw new Error(
        `Sale listing currency ${listing.currencyType} does not match requested ${normalizeStructTag(p.currencyType)}`,
      );
    }
  }

  return { pressing, listing };
});
