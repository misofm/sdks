import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Stream from "effect/Stream"

import type { BridgeClient } from "../src/Bridge.js"
import {
	BridgePaginationCursorError,
	BridgePaginationLimitError,
	paginateBridge,
	paginateBridgeEffect,
	paginateBridgeRewards,
	paginateBridgeRewardsEffect,
	type BridgeCursorPage,
	type BridgeCursorQuery,
	type BridgeRewardsCursorPage,
	type BridgeRewardsCursorQuery
} from "../src/Pagination.js"

interface Item {
	readonly id: string
	readonly value: number
}

interface Reward {
	readonly date: string
	readonly amount: string
}

const customerId = (customer: unknown): string | undefined => {
	if (typeof customer !== "object" || customer === null || !("id" in customer)) return undefined
	return typeof customer.id === "string" ? customer.id : undefined
}

const generatedCustomerPages = (bridge: BridgeClient) =>
	paginateBridge({}, (query) => bridge.customers.getCustomers({ query }), { getId: customerId })

const generatedRewardPages = (bridge: BridgeClient, currency: string) =>
	paginateBridgeRewards(
		{},
		(query) => bridge.rewards.getRewardsByCurrencyHistory({ params: { currency }, query }),
		{}
	)

describe("Bridge pagination helpers", () => {
	test("adapt generated customer and rewards client methods without narrowing their types", () => {
		expect(generatedCustomerPages).toBeDefined()
		expect(generatedRewardPages).toBeDefined()
	})

	test("streams standard pages with preserved filters, a single cursor, and a 100 item maximum", async () => {
		const requests: Array<BridgeCursorQuery & { readonly customer_id: string; readonly status: string }> = []
		const filters = {
		customer_id: "cus_123",
		status: "active",
		limit: 5,
		starting_after: "filter-start"
	} as const

		const stream = paginateBridge(
			filters,
			(query): Effect.Effect<BridgeCursorPage<Item>> => {
				requests.push(query)
				if (query.starting_after === "explicit-start") {
					return Effect.succeed({
						data: [{ id: "item_1", value: 1 }, { id: "item_2", value: 2 }],
						has_more: true
					})
				}
			if (query.starting_after === "item_2") {
				return Effect.succeed({ data: [{ id: "item_3", value: 3 }] })
			}
			return Effect.succeed({ data: [], has_more: true })
			},
			{ limit: 150, cursor: "explicit-start", getId: (item) => item.id }
		)

		const items = await Effect.runPromise(Stream.runCollect(stream))

		expect(items).toEqual([
			{ id: "item_1", value: 1 },
			{ id: "item_2", value: 2 },
			{ id: "item_3", value: 3 }
		])
		expect(requests).toEqual([
			{ customer_id: "cus_123", status: "active", limit: 100, starting_after: "explicit-start" },
			{ customer_id: "cus_123", status: "active", limit: 100, starting_after: "item_2" },
			{ customer_id: "cus_123", status: "active", limit: 100, starting_after: "item_3" }
		])
	})

	test("uses the first item ID for ending_before and sends no starting_after cursor", async () => {
		const requests: Array<BridgeCursorQuery & { readonly account_id: string }> = []
		const stream = paginateBridge(
			{ account_id: "acct_456", limit: 2, ending_before: "known" },
			(query): Effect.Effect<BridgeCursorPage<Item>> => {
				requests.push(query)
				return query.ending_before === "known"
					? Effect.succeed({
						data: [{ id: "newest", value: 2 }, { id: "older", value: 1 }],
						has_more: true
					})
					: Effect.succeed({ data: [] })
			},
			{ direction: "ending_before", getId: (item) => item.id }
		)

		const items = await Effect.runPromise(Stream.runCollect(stream))

		expect(items.map((item) => item.id)).toEqual(["newest", "older"])
		expect(requests).toEqual([
			{ account_id: "acct_456", limit: 2, ending_before: "known" },
			{ account_id: "acct_456", limit: 2, ending_before: "newest" }
		])
	})

	test("rejects conflicting standard cursor directions before fetching", async () => {
		let calls = 0
		const error = await Effect.runPromise(Effect.flip(Stream.runCollect(paginateBridge(
			{ starting_after: "older", ending_before: "newer" },
			(): Effect.Effect<BridgeCursorPage<Item>> => {
				calls += 1
				return Effect.succeed({ data: [] })
			},
			{ getId: (item) => item.id }
		))))

		expect(error).toBeInstanceOf(BridgePaginationCursorError)
		expect(error).toMatchObject({ contract: "standard", kind: "conflicting_directions" })
		expect(calls).toBe(0)
	})

	test("rejects an explicit direction that conflicts with a query cursor", async () => {
		const error = await Effect.runPromise(Effect.flip(Stream.runCollect(paginateBridge(
			{ ending_before: "newer" },
			(): Effect.Effect<BridgeCursorPage<Item>> => Effect.succeed({ data: [] }),
			{ direction: "starting_after", getId: (item) => item.id }
		))))

		expect(error).toMatchObject({ contract: "standard", kind: "conflicting_directions" })
	})

	test("detects standard cursor cycles before another page is requested", async () => {
		const requests: Array<BridgeCursorQuery> = []
		const error = await Effect.runPromise(Effect.flip(Stream.runCollect(paginateBridge(
			{},
			(query): Effect.Effect<BridgeCursorPage<Item>> => {
				requests.push(query)
				if (query.starting_after === undefined) return Effect.succeed({ data: [{ id: "A", value: 1 }], has_more: true })
				if (query.starting_after === "A") return Effect.succeed({ data: [{ id: "B", value: 2 }], has_more: true })
				return Effect.succeed({ data: [{ id: "A", value: 3 }], has_more: true })
			},
			{ getId: (item) => item.id }
		))))

		expect(error).toMatchObject({ contract: "standard", kind: "cursor_cycle", cursor: "A" })
		expect(requests).toHaveLength(3)
	})

	test("stops on an empty page even if has_more is true", async () => {
		let calls = 0
		const stream = paginateBridge({}, (_query): Effect.Effect<BridgeCursorPage<Item>> => {
			calls += 1
			return Effect.succeed({ data: [], has_more: true })
		}, { getId: (item) => item.id })

		expect(await Effect.runPromise(Stream.runCollect(stream))).toEqual([])
		expect(calls).toBe(1)
	})

	test("stops after a non-empty page when has_more is false", async () => {
		let calls = 0
		const stream = paginateBridge({}, (_query): Effect.Effect<BridgeCursorPage<Item>> => {
			calls += 1
			return Effect.succeed({ data: [{ id: "only", value: 1 }], has_more: false })
		}, { getId: (item) => item.id })

		expect(await Effect.runPromise(Stream.runCollect(stream))).toEqual([{ id: "only", value: 1 }])
		expect(calls).toBe(1)
	})

	test("keeps cursor tracking local to each stream subscription", async () => {
		let calls = 0
		const stream = paginateBridge({}, (_query): Effect.Effect<BridgeCursorPage<Item>> => {
			calls += 1
			return Effect.succeed({ data: [{ id: "one", value: 1 }], has_more: false })
		}, { getId: (item) => item.id })

		const first = await Effect.runPromise(Stream.runCollect(stream))
		const second = await Effect.runPromise(Stream.runCollect(stream))

		expect(first).toEqual([{ id: "one", value: 1 }])
		expect(second).toEqual([{ id: "one", value: 1 }])
		expect(calls).toBe(2)
	})

	test("collects standard pages through the Effect helper", async () => {
		const items = await Effect.runPromise(paginateBridgeEffect(
			{},
			(): Effect.Effect<BridgeCursorPage<Item>> => Effect.succeed({ data: [{ id: "one", value: 1 }], has_more: false }),
			{ getId: (item) => item.id }
		))

		expect(items).toEqual([{ id: "one", value: 1 }])
	})

	test("streams reward cursors with preserved filters and a 90 item maximum", async () => {
		const requests: Array<BridgeRewardsCursorQuery & { readonly currency: string; readonly status: string }> = []
		const filters = { currency: "usdb", status: "distributed", limit: 3, cursor: "ignored" } as const
		const stream = paginateBridgeRewards(
			filters,
			(query): Effect.Effect<BridgeRewardsCursorPage<Reward>> => {
				requests.push(query)
				if (query.cursor === "ignored") {
					return Effect.succeed({
						data: [{ date: "2026-09-01", amount: "1.25" }],
						pagination: { has_more: true, next_cursor: "opaque-next" }
					})
				}
			return Effect.succeed({
				data: [{ date: "2026-09-02", amount: "1.50" }],
				pagination: { has_more: false, next_cursor: null }
			})
			},
			{ limit: 120 }
		)

		const rewards = await Effect.runPromise(Stream.runCollect(stream))

		expect(rewards).toEqual([
			{ date: "2026-09-01", amount: "1.25" },
			{ date: "2026-09-02", amount: "1.50" }
		])
		expect(requests).toEqual([
			{ currency: "usdb", status: "distributed", limit: 90, cursor: "ignored" },
			{ currency: "usdb", status: "distributed", limit: 90, cursor: "opaque-next" }
		])
	})

	test("stops an empty reward page even if its metadata advertises another cursor", async () => {
		let calls = 0
		const stream = paginateBridgeRewards({}, (_query): Effect.Effect<BridgeRewardsCursorPage<Reward>> => {
			calls += 1
			return Effect.succeed({
				data: [],
				pagination: { has_more: true, next_cursor: "another-page" }
			})
		})

		expect(await Effect.runPromise(Stream.runCollect(stream))).toEqual([])
		expect(calls).toBe(1)
	})

	test("collects reward pages through the Effect helper", async () => {
		const rewards = await Effect.runPromise(paginateBridgeRewardsEffect(
			{},
			(): Effect.Effect<BridgeRewardsCursorPage<Reward>> => Effect.succeed({
				data: [{ date: "2026-09-03", amount: "2.00" }],
				pagination: { has_more: false }
			})
		))

		expect(rewards).toEqual([{ date: "2026-09-03", amount: "2.00" }])
	})

	test("preserves fetch errors through the Effect helper", async () => {
		const error = { _tag: "PageFetchFailure" as const }
		const result = await Effect.runPromise(Effect.flip(paginateBridgeEffect(
			{},
			(): Effect.Effect<BridgeCursorPage<Item>, typeof error> => Effect.fail(error),
			{ getId: (item) => item.id }
		)))

		expect(result).toBe(error)
	})

	test("fails on invalid lower limits before calling the endpoint", async () => {
		let calls = 0
		const error = await Effect.runPromise(Effect.flip(Stream.runCollect(paginateBridge(
			{},
			(): Effect.Effect<BridgeCursorPage<Item>> => {
				calls += 1
				return Effect.succeed({ data: [] })
			},
			{ limit: 0, getId: (item) => item.id }
		))))

		expect(error).toBeInstanceOf(BridgePaginationLimitError)
		expect(calls).toBe(0)
	})

	test("does not fetch another page after an early take", async () => {
		let calls = 0
		const stream = paginateBridge({}, (_query): Effect.Effect<BridgeCursorPage<Item>> => {
			calls += 1
			return Effect.succeed({
				data: [{ id: "one", value: 1 }, { id: "two", value: 2 }],
				has_more: true
			})
		}, { getId: (item) => item.id })

		expect(await Effect.runPromise(Stream.runCollect(Stream.take(stream, 1)))).toEqual([{ id: "one", value: 1 }])
		expect(calls).toBe(1)
	})

	test("interrupts an in-flight page fetch", async () => {
		let signal: AbortSignal | undefined
		let signalStarted: () => void = () => undefined
		const started = new Promise<void>((resolve) => {
			signalStarted = resolve
		})
		const stream = paginateBridge({}, (_query) =>
			Effect.tryPromise({
				try: (abortSignal) => {
					signal = abortSignal
					signalStarted()
					return new Promise<BridgeCursorPage<Item>>(() => undefined)
				},
				catch: (cause) => cause
			}),
		{ getId: (item) => item.id }
		)

		const fiber = Effect.runFork(Stream.runDrain(stream))
		await started
		await Effect.runPromise(Fiber.interrupt(fiber))

		expect(signal?.aborted).toBe(true)
	})
})
