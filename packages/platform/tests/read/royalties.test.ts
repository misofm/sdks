import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { SuiGraphQL } from "sui-effect";
import { listRoyaltyClaims, royaltyClaimedEventType } from "../../src/read/royalties.ts";
import type { MisoConfig } from "../../src/read/config.ts";

const POOL = "0x" + "f7".repeat(32);
const SHARE = "0x" + "aa".repeat(32);
const USD = "0x" + "77".repeat(32);
const SENDER = "0x" + "ad".repeat(32);
const config = { protocol: { royaltyPool: POOL } } as unknown as MisoConfig;
const TYPE = `${POOL}::pool::RoyaltyClaimedEvent<${SHARE}::share::Share,${USD}::fakeusd::FakeUsd>`;

function edge(cursor: string, digest: string, amount: string, timestamp = "2026-09-09T11:21:54.915Z") {
  return {
    cursor,
    node: {
      timestamp,
      transaction: { digest },
      contents: {
        type: { repr: TYPE },
        // Current RoyaltyClaimedEvent JSON retains the complete rich snapshot;
        // the read projection intentionally selects only identity and reward.
        json: {
          pool_id: "0x1",
          stake_id: "0x2",
          staked_amount: "9007199254740993",
          reward_amount: amount,
          registration_debt_before: "1606938044258990275541962092341162602522202993782792835301376",
          registration_debt_after: "1606938044258990275541962092341162602522202993782792835301377",
          reward_residue_after: "3",
          stake_registration_count_after: "4",
          pool_balance_after: "5",
          staked_shares_after: "6",
          cumulative_reward_per_share_after: "7",
          carry_after: "8",
          cumulative_deposits_after: "9",
        },
      },
    },
  };
}

function graphql(result: unknown, calls: unknown[] = []) {
  return {
    query: async (request: unknown) => {
      calls.push(request);
      return { data: result };
    },
  } as unknown as SuiGraphQLClient;
}

function run(client: SuiGraphQLClient, options?: Parameters<typeof listRoyaltyClaims>[2]) {
  return Effect.runPromise(
    listRoyaltyClaims(SENDER, config, options).pipe(Effect.provide(SuiGraphQL.layer(client))),
  );
}

describe("listRoyaltyClaims", () => {
  test("filters by sender and the generic event type, newest page first", async () => {
    const calls: Array<{ variables: Record<string, unknown> }> = [];
    await run(graphql({ events: { pageInfo: { hasPreviousPage: false }, edges: [] }, serviceConfig: null }, calls), { limit: 10 });
    expect(royaltyClaimedEventType(config)).toBe(`${POOL}::pool::RoyaltyClaimedEvent`);
    expect(calls[0]?.variables).toEqual({ sender: SENDER, type: `${POOL}::pool::RoyaltyClaimedEvent`, last: 10, before: null });
  });

  test("groups a transaction's events into one claim and orders claims newest first", async () => {
    const page = await run(
      graphql({
        events: {
          pageInfo: { hasPreviousPage: false },
          edges: [edge("c1", "OLD", "100", "2026-09-09T00:30:38.316Z"), edge("c2", "NEW", "7"), edge("c3", "NEW", "5")],
        },
        serviceConfig: { availableRange: { first: { timestamp: "2026-08-13T06:09:03.736Z" } } },
      }),
    );
    expect(page.claims.map((c) => c.txDigest)).toEqual(["NEW", "OLD"]);
    expect(page.claims[0]?.entries.map((e) => e.amount)).toEqual(["7", "5"]);
    expect(page.claims[0]?.entries[0]).toMatchObject({
      poolId: "0x" + "0".repeat(63) + "1",
      shareType: `${SHARE}::share::Share`,
      currency: `${USD}::fakeusd::FakeUsd`,
    });
    expect(page.claims[0]?.timestampMs).toBe(Date.parse("2026-09-09T11:21:54.915Z"));
    expect(page.nextCursor).toBeNull();
    expect(page.availableFromMs).toBe(Date.parse("2026-08-13T06:09:03.736Z"));
  });

  test("withholds the oldest transaction on a page that has older events, and resumes just before the oldest kept one", async () => {
    const page = await run(
      graphql({
        events: {
          pageInfo: { hasPreviousPage: true },
          edges: [edge("c1", "MAYBE-PARTIAL", "1"), edge("c2", "MIDDLE", "2"), edge("c3", "NEWEST", "3")],
        },
        serviceConfig: null,
      }),
    );
    expect(page.claims.map((c) => c.txDigest)).toEqual(["NEWEST", "MIDDLE"]);
    expect(page.nextCursor).toBe("c2");
    expect(page.availableFromMs).toBeNull();
  });

  test("keeps a transaction that fills the whole page and continues before its first event", async () => {
    const page = await run(
      graphql({
        events: { pageInfo: { hasPreviousPage: true }, edges: [edge("c1", "BIG", "1"), edge("c2", "BIG", "2")] },
        serviceConfig: null,
      }),
    );
    expect(page.claims).toHaveLength(1);
    expect(page.claims[0]?.entries).toHaveLength(2);
    expect(page.nextCursor).toBe("c1");
  });

  test("fails loudly on an event of the right type with the wrong fields", async () => {
    const bad = edge("c1", "TX", "1");
    (bad.node.contents.json as Record<string, unknown>).reward_amount = "not-a-number";
    const err = await Effect.runPromise(
      listRoyaltyClaims(SENDER, config).pipe(
        Effect.provide(SuiGraphQL.layer(graphql({ events: { pageInfo: { hasPreviousPage: false }, edges: [bad] }, serviceConfig: null }))),
        Effect.flip,
      ),
    );
    expect(err._tag).toBe("MalformedRoyaltyClaimedEventError");
  });

  test("reports indexer errors as TransportError", async () => {
    const client = { query: async () => ({ data: null, errors: [{ message: "boom" }] }) } as unknown as SuiGraphQLClient;
    const err = await Effect.runPromise(
      listRoyaltyClaims(SENDER, config).pipe(Effect.provide(SuiGraphQL.layer(client)), Effect.flip),
    );
    expect(err._tag).toBe("TransportError");
  });
});
