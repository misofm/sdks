// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Royalty claim history for one address, read from the GraphQL indexer's
// event index. A claim is one transaction that emitted
// `royalty_pool::pool::RoyaltyClaimedEvent` — one event per pool the
// transaction swept — filtered by the transaction's sender, which stays the
// wallet even when gas is sponsored, and which is the same whether the claim
// went through `pool::claim_rewards` directly or through a routed stake sweep.
//
// The index is paged by event, newest last, and a page boundary can fall
// inside a transaction. Each page returned here holds only complete claims:
// when older events remain, the oldest transaction on the page is withheld
// and the next cursor points just before the oldest kept one, so the next
// page starts with the withheld transaction whole.
//
// The public indexers retain events for a bounded window (about four weeks at
// the time of writing) while keeping transactions back to genesis, so a page
// also reports the earliest checkpoint the index still covers. A caller can
// tell "no older claims" from "no older index" with it.

import { normalizeStructTag, normalizeSuiAddress, parseStructTag } from "@mysten/sui/utils";
import { Effect } from "effect";
import { GraphQLUnavailable, SuiGraphQL, TransportError } from "@unconfirmed/sui-effect";
import { MalformedRoyaltyClaimedEventError } from "../errors.ts";
import type { MisoConfig } from "./config.ts";
import type { RoyaltyClaim, RoyaltyClaimEntry, RoyaltyClaimPage } from "./types.ts";

/** The indexer caps event pages at 50. */
export const ROYALTY_CLAIMS_PAGE_LIMIT = 50;

/**
 * `GraphQLUnavailable` lets through, not folded into `TransportError` — see
 * `@misofm/musicos`'s own `queries.ts` for the same idiom: under
 * `SuiGraphQL.layerUnavailable`, every call rejects with the same
 * `GraphQLUnavailable` instance, and a caller that wants "no endpoint
 * configured" distinguished from "the endpoint answered badly" needs the
 * real tag rather than having it stand behind `cause`.
 */
const graphqlError = (method: string) => (cause: unknown): GraphQLUnavailable | TransportError =>
  cause instanceof GraphQLUnavailable ? cause : TransportError.fromUnknown(method, cause);

const CLAIMS_QUERY = `query RoyaltyClaims($sender: SuiAddress!, $type: String!, $last: Int!, $before: String) {
  events(last: $last, before: $before, filter: { sender: $sender, type: $type }) {
    pageInfo { hasPreviousPage }
    edges {
      cursor
      node { timestamp transaction { digest } contents { type { repr } json } }
    }
  }
  serviceConfig {
    availableRange(type: "Query", field: "events") { first { timestamp } }
  }
}`;

interface ClaimsQueryVariables {
  sender: string;
  type: string;
  last: number;
  before: string | null;
}

interface ClaimsQueryResult {
  events: {
    pageInfo: { hasPreviousPage: boolean };
    edges: Array<{
      cursor: string;
      node: {
        timestamp: string | null;
        transaction: { digest: string } | null;
        contents: { type: { repr: string }; json: unknown } | null;
      };
    }>;
  } | null;
  serviceConfig: {
    availableRange: { first: { timestamp: string } | null } | null;
  } | null;
}

export interface ListRoyaltyClaimsOptions {
  /** Opaque cursor from a previous page's `nextCursor`; omit for the newest page. */
  before?: string | null;
  /** Events per page, 1–50. Claims per page is at most this. */
  limit?: number;
}

/** `pkg::pool::RoyaltyClaimedEvent` — the generic name matches every `<Share, Currency>`. */
export function royaltyClaimedEventType(config: MisoConfig): string {
  return `${config.protocol.royaltyPool}::pool::RoyaltyClaimedEvent`;
}

function u64String(value: unknown): string | null {
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  return null;
}

function entryFromEvent(repr: string, json: unknown, digest: string): RoyaltyClaimEntry {
  const fail = (reason: string) => new MalformedRoyaltyClaimedEventError({ digest, reason });
  let typeParams: (string | { address: string })[];
  try {
    typeParams = parseStructTag(repr).typeParams as (string | { address: string })[];
  } catch {
    throw fail(`unparseable event type ${repr}`);
  }
  const [share, currency] = typeParams;
  if (!share || !currency) throw fail("RoyaltyClaimedEvent without <Share, Currency>");
  if (!json || typeof json !== "object") throw fail("RoyaltyClaimedEvent without JSON contents");
  const fields = json as Record<string, unknown>;
  const amount = u64String(fields.reward_amount);
  if (typeof fields.pool_id !== "string" || typeof fields.stake_id !== "string" || amount === null) {
    throw fail("RoyaltyClaimedEvent missing pool_id, stake_id or reward_amount");
  }
  return {
    poolId: normalizeSuiAddress(fields.pool_id),
    stakeId: normalizeSuiAddress(fields.stake_id),
    shareType: normalizeStructTag(share as never),
    currency: normalizeStructTag(currency as never),
    amount,
  };
}

/**
 * One page of an address's royalty claims, newest first.
 *
 * Fails with `GraphQLUnavailable` when no GraphQL endpoint is configured,
 * `TransportError` when the indexer cannot be reached or rejects the query,
 * and `MalformedRoyaltyClaimedEventError` when an event of the configured
 * type does not carry the fields this package version expects.
 */
export const listRoyaltyClaims = Effect.fn("listRoyaltyClaims")(function* (
  address: string,
  config: MisoConfig,
  options: ListRoyaltyClaimsOptions = {},
): Effect.fn.Return<RoyaltyClaimPage, GraphQLUnavailable | TransportError | MalformedRoyaltyClaimedEventError, SuiGraphQL> {
  const client = yield* SuiGraphQL;
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? ROYALTY_CLAIMS_PAGE_LIMIT), 1), ROYALTY_CLAIMS_PAGE_LIMIT);
  const { data, errors } = yield* Effect.tryPromise({
    try: () =>
      client.query<ClaimsQueryResult, ClaimsQueryVariables>({
        query: CLAIMS_QUERY,
        variables: {
          sender: normalizeSuiAddress(address),
          type: royaltyClaimedEventType(config),
          last: limit,
          before: options.before ?? null,
        },
      }),
    catch: graphqlError("royaltyClaims"),
  });
  if (errors?.length) {
    return yield* TransportError.fromUnknown(
      "royaltyClaims",
      new AggregateError(errors.map((e) => new Error(e.message)), "Royalty claims query failed"),
    );
  }

  const edges = data?.events?.edges ?? [];
  const hasOlder = data?.events?.pageInfo.hasPreviousPage ?? false;
  const availableFrom = data?.serviceConfig?.availableRange?.first?.timestamp ?? null;
  const availableFromMs = availableFrom === null ? null : Date.parse(availableFrom);

  // Group in index order (oldest first); a transaction's events are contiguous.
  const groups: Array<{ firstCursor: string; claim: RoyaltyClaim }> = [];
  for (const { cursor, node } of edges) {
    const digest = node.transaction?.digest;
    const contents = node.contents;
    if (!digest || !contents) {
      return yield* new MalformedRoyaltyClaimedEventError({ digest: digest ?? "?", reason: "event without transaction or contents" });
    }
    let entry: RoyaltyClaimEntry;
    try {
      entry = entryFromEvent(contents.type.repr, contents.json, digest);
    } catch (error) {
      return yield* (error as MalformedRoyaltyClaimedEventError);
    }
    const last = groups.at(-1);
    if (last && last.claim.txDigest === digest) {
      last.claim.entries.push(entry);
    } else {
      groups.push({
        firstCursor: cursor,
        claim: {
          txDigest: digest,
          timestampMs: node.timestamp ? Date.parse(node.timestamp) : 0,
          entries: [entry],
        },
      });
    }
  }

  let nextCursor: string | null = null;
  let kept = groups;
  if (hasOlder && groups.length > 0) {
    if (groups.length > 1) {
      // The oldest group may continue past the page start; hand it back whole
      // on the next page by starting that page just before the oldest kept one.
      kept = groups.slice(1);
      nextCursor = kept[0]!.firstCursor;
    } else {
      // One transaction fills the whole page: continue before its first event.
      nextCursor = groups[0]!.firstCursor;
    }
  }

  return {
    claims: kept.map((group) => group.claim).reverse(),
    nextCursor,
    availableFromMs: availableFromMs !== null && Number.isFinite(availableFromMs) ? availableFromMs : null,
  };
});
