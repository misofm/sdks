// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { toPromise, tryPromise, workflow, type SdkError } from "@misofm/utils/effect";
import { Effect } from "effect";

// Primary Record sales. `miso_record` owns concrete Records and edition-scoped
// Pressings; immutable `miso_record_shop` owns per-currency Listings and payment.

import * as pressingContract from "@misofm/protocol/contracts/miso_record/pressing";
import * as recordContract from "@misofm/protocol/contracts/miso_record/record";
import * as listingContract from "@misofm/protocol/contracts/miso_record_shop/listing";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import {
  deriveObjectID,
  normalizeStructTag,
  normalizeSuiAddress,
  parseStructTag,
} from "@mysten/sui/utils";
import { isNotFound } from "./queries.ts";
import type { TxThunk } from "./transactions.ts";
import { asU64, type U64Input } from "./vault.ts";

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

export interface PressingView {
  id: string;
  releaseId: string;
  edition: number;
  supply: number;
  maxSupply: number | null;
  distributors: string[];
}

export interface ListingView {
  id: string;
  releaseId: string;
  pressingId: string;
  pricing: { kind: "fixed" | "floor"; amount: string };
  state: ListingSwitch;
  currencyType: string;
}

export interface RecordView {
  id: string;
  releaseId: string;
  pressingId: string;
  edition: number;
  number: number;
  purchaseCurrency: string;
  purchasePrice: string;
  purchasedBy: string;
  purchasedTimestampMs: string;
}

function fetchEffect(
  client: ClientWithCoreApi,
  objectId: string,
): Effect.Effect<{ content: Uint8Array; type: string } | null, SdkError> {
  return workflow("fetch", function* () {
    const { object } = yield* tryPromise("fetch", (signal) =>
      client.core.getObject({ signal, objectId, include: { content: true } }),
    );
    if (!object) return null;
    if (!object.content || !object.type) throw new Error(`object ${objectId} has no BCS content or full type`);
    return { content: object.content, type: object.type };
  }).pipe(Effect.catch((error) => (isNotFound(error.cause) ? Effect.succeed(null) : Effect.fail(error))));
}

function sameId(a: string, b: string): boolean {
  return normalizeSuiAddress(a) === normalizeSuiAddress(b);
}

function requireId(label: string, actual: string, expected: string): void {
  if (!sameId(actual, expected))
    throw new Error(`${label} ${actual} does not match expected ${expected}`);
}

function requireExactType(type: string, expected: string, label: string): void {
  const actual = normalizeStructTag(type);
  const normalizedExpected = normalizeStructTag(expected);
  if (actual !== normalizedExpected)
    throw new Error(
      `${label} has type ${actual}, expected ${normalizedExpected}`,
    );
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

function parsePricing(value: unknown): ListingView["pricing"] {
  if (!value || typeof value !== "object")
    throw new Error("Listing has malformed pricing");
  const v = value as { $kind?: string; Fixed?: string; Floor?: string };
  const kind = enumKind(v as never, ["Fixed", "Floor"]);
  const amount = kind === "Fixed" ? v.Fixed : v.Floor;
  if (amount == null || BigInt(amount) <= 0n)
    throw new Error("Listing has invalid pricing amount");
  return { kind: kind === "Fixed" ? "fixed" : "floor", amount };
}

function parsePressing(
  pressingId: string,
  content: Uint8Array,
  type: string,
  recordPackageId: string,
): PressingView {
  requireExactType(type, `${recordPackageId}::pressing::Pressing`, "Pressing");
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
    distributors: parsed.distributors.contents.map((item) =>
      normalizeStructTag(item.name),
    ),
  };
}

function parseListing(
  listingId: string,
  content: Uint8Array,
  type: string,
  recordShopPackageId: string,
): ListingView {
  const currencyType = requireListingCurrency(type, recordShopPackageId);
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

function parseRecord(
  recordId: string,
  content: Uint8Array,
  type: string,
  recordPackageId: string,
): RecordView {
  requireExactType(type, `${recordPackageId}::record::Record`, "Record");
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

export function getPressingEffect(
  client: ClientWithCoreApi,
  pressingId: string,
  recordPackageId: string,
): Effect.Effect<PressingView | null, SdkError> {
  return workflow("getPressing", function* () {
    const got = yield* fetchEffect(client, pressingId);
    return got ? parsePressing(pressingId, got.content, got.type, recordPackageId) : null;
  });
}

export const getPressing = toPromise(getPressingEffect);

export function getListingEffect(
  client: ClientWithCoreApi,
  listingId: string,
  recordShopPackageId: string,
): Effect.Effect<ListingView | null, SdkError> {
  return workflow("getListing", function* () {
    const got = yield* fetchEffect(client, listingId);
    return got ? parseListing(listingId, got.content, got.type, recordShopPackageId) : null;
  });
}

export const getListing = toPromise(getListingEffect);

export function getRecordEffect(
  client: ClientWithCoreApi,
  recordId: string,
  recordPackageId: string,
): Effect.Effect<RecordView | null, SdkError> {
  return workflow("getRecord", function* () {
    const got = yield* fetchEffect(client, recordId);
    return got ? parseRecord(recordId, got.content, got.type, recordPackageId) : null;
  });
}

export const getRecord = toPromise(getRecordEffect);

export interface GetSaleParams {
  releaseId: string;
  edition: number;
  currencyType: string;
  recordPackageId: string;
  recordShopPackageId: string;
}

export function getSaleEffect(
  client: ClientWithCoreApi,
  p: GetSaleParams,
): Effect.Effect<{ pressing: PressingView | null; listing: ListingView | null }, SdkError> {
  return workflow("getSale", function* () {
    const { pressingId, listingId } = deriveSaleIds(
      p.releaseId,
      p.edition,
      p.currencyType,
      p.recordPackageId,
      p.recordShopPackageId,
    );
    const { objects } = yield* tryPromise("getSale", (signal) =>
      client.core.getObjects({ signal, objectIds: [pressingId, listingId], include: { content: true } }),
    );
    const [pressingObject, listingObject] = objects;
    if (pressingObject instanceof Error && !isNotFound(pressingObject)) throw pressingObject;
    if (listingObject instanceof Error && !isNotFound(listingObject)) throw listingObject;
    const pressing =
      !pressingObject || pressingObject instanceof Error
        ? null
        : parseBatchPressing(pressingId, pressingObject.content, pressingObject.type, p.recordPackageId);
    const listing =
      !listingObject || listingObject instanceof Error
        ? null
        : parseBatchListing(listingId, listingObject.content, listingObject.type, p.recordShopPackageId);
    if (pressing) requireId("Sale pressing release", pressing.releaseId, p.releaseId);
    if (listing) {
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
}

export const getSale = toPromise(getSaleEffect);

function parseBatchPressing(
  id: string,
  content: Uint8Array | undefined,
  type: string | undefined,
  packageId: string,
): PressingView {
  if (!content || !type)
    throw new Error(`Pressing ${id} has no BCS content or full type`);
  return parsePressing(id, content, type, packageId);
}

function parseBatchListing(
  id: string,
  content: Uint8Array | undefined,
  type: string | undefined,
  packageId: string,
): ListingView {
  if (!content || !type)
    throw new Error(`Listing ${id} has no BCS content or full type`);
  return parseListing(id, content, type, packageId);
}
