import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

/** The two cursor directions supported by standard Bridge list endpoints. */
export type BridgeCursorDirection = "starting_after" | "ending_before"

/** Pagination fields accepted by a standard Bridge list endpoint. */
export interface BridgeCursorQuery {
	readonly limit?: number
	readonly starting_after?: string
	readonly ending_before?: string
}

/** A response page from a standard Bridge list endpoint. */
export interface BridgeCursorPage<Item> {
	readonly data?: ReadonlyArray<Item> | undefined
	readonly has_more?: boolean | undefined
}

/** Pagination fields accepted by the stablecoin rewards history endpoint. */
export interface BridgeRewardsCursorQuery {
	readonly limit?: number
	readonly cursor?: string
}

/** A response page from the stablecoin rewards history endpoint. */
export interface BridgeRewardsCursorPage<Item> {
	readonly data?: ReadonlyArray<Item> | undefined
	readonly pagination?: {
		readonly has_more?: boolean | undefined
		readonly next_cursor?: string | null | undefined
	} | undefined
}

/** Options for the standard `starting_after` / `ending_before` paginator. */
export interface BridgeCursorOptions<Item> {
	/** Overrides the query's `limit`; defaults to its value or 100. Larger values are capped at 100. */
	readonly limit?: number
	/** Overrides the query direction. If omitted, a query cursor selects the direction; otherwise `starting_after` is used. */
	readonly direction?: BridgeCursorDirection
	/** Overrides a cursor in the query for the selected direction. */
	readonly cursor?: string
	/** Extracts the stable resource ID used by Bridge as the page cursor. */
	readonly getId: (item: Item) => string | undefined
}

/** Options for the stablecoin rewards paginator. */
export interface BridgeRewardsCursorOptions {
	/** Overrides the query's `limit`; defaults to its value or 90. Larger values are capped at 90. */
	readonly limit?: number
	/** Overrides the query's initial `cursor`. */
	readonly cursor?: string
}

/**
 * Invalid page sizes fail when the stream is consumed. Values above the
 * endpoint maximum are capped; values below one or non-integers are rejected.
 */
export class BridgePaginationLimitError extends Schema.TaggedError<BridgePaginationLimitError>()(
	"BridgePaginationLimitError",
	{
		maximum: Schema.Number,
		received: Schema.String
	}
) {}

/** Invalid cursor configuration or a cursor contract violation. */
export class BridgePaginationCursorError extends Schema.TaggedError<BridgePaginationCursorError>()(
	"BridgePaginationCursorError",
	{
		contract: Schema.Literals(["standard", "rewards"]),
		kind: Schema.Literals(["conflicting_directions", "missing_cursor", "missing_next_cursor", "cursor_cycle"]),
		cursor: Schema.optionalKey(Schema.String)
	}
) {}

type StandardCursorRequest<Filters extends object> = Omit<Filters, keyof BridgeCursorQuery> & {
	readonly limit: number
	readonly starting_after?: string
	readonly ending_before?: string
}

type RewardsCursorRequest<Filters extends object> = Omit<Filters, keyof BridgeRewardsCursorQuery> & {
	readonly limit: number
	readonly cursor?: string
}

interface CursorState {
	readonly cursor: string | undefined
	readonly seen: ReadonlySet<string>
	readonly failure: BridgePaginationCursorError | undefined
}

const cursorState = (cursor: string | undefined): CursorState => ({
	cursor,
	seen: cursor === undefined ? new Set() : new Set([cursor]),
	failure: undefined
})

const failedCursorState = (state: CursorState, failure: BridgePaginationCursorError): CursorState => ({
	...state,
	failure
})

const nextCursorState = (state: CursorState, cursor: string): CursorState => {
	const seen = new Set(state.seen)
	seen.add(cursor)
	return { cursor, seen, failure: undefined }
}

type StandardCursorSelection = {
	readonly direction: BridgeCursorDirection
	readonly cursor: string | undefined
}

const selectStandardCursor = (
	filters: BridgeCursorQuery,
	options: Pick<BridgeCursorOptions<unknown>, "direction" | "cursor">
): StandardCursorSelection | BridgePaginationCursorError => {
	const hasStartingAfter = filters.starting_after !== undefined
	const hasEndingBefore = filters.ending_before !== undefined
	if (hasStartingAfter && hasEndingBefore) {
		return new BridgePaginationCursorError({ contract: "standard", kind: "conflicting_directions" })
	}

	const filterDirection = hasStartingAfter ? "starting_after" : hasEndingBefore ? "ending_before" : undefined
	if (options.direction !== undefined && filterDirection !== undefined && options.direction !== filterDirection) {
		return new BridgePaginationCursorError({
			contract: "standard",
			kind: "conflicting_directions"
		})
	}

	const direction = options.direction ?? filterDirection ?? "starting_after"
	const cursor = options.cursor ?? filters[direction]
	return { direction, cursor }
}

const normalizeLimit = (
	requested: number | undefined,
	maximum: number
): number | BridgePaginationLimitError => {
	if (requested === undefined) return maximum
	if (!Number.isInteger(requested) || requested < 1) {
		return new BridgePaginationLimitError({ maximum, received: String(requested) })
	}
	return Math.min(requested, maximum)
}

const standardFiltersWithoutPagination = <Filters extends object>(
	filters: Filters & BridgeCursorQuery
): Omit<Filters, keyof BridgeCursorQuery> => {
	const { limit, starting_after, ending_before, ...rest } = filters
	void [limit, starting_after, ending_before]
	return rest
}

const rewardsFiltersWithoutPagination = <Filters extends object>(
	filters: Filters & BridgeRewardsCursorQuery
): Omit<Filters, keyof BridgeRewardsCursorQuery> => {
	const { limit, cursor, ...rest } = filters
	void [limit, cursor]
	return rest
}

/**
 * Lazily streams items from a standard Bridge list endpoint. The supplied
 * filters are carried to every request, and only the selected cursor is sent.
 * Each page's first or last item ID is used according to the direction. An
 * empty page or `has_more: false` ends traversal. The stream can be stopped
 * early by its consumer; later pages are not requested. Supply `getId` to
 * extract each item's stable Bridge ID; this also supports generated response
 * schemas where `id` is optional in the TypeScript type.
 * Query `limit` and cursor values are used unless the matching option overrides
 * them. Supplying both query cursor directions, or selecting a direction that
 * conflicts with a query cursor, fails with `BridgePaginationCursorError`.
 *
 * Pending card authorizations are explicitly unpaginated by Bridge and must
 * not be passed to this helper.
 */
export const paginateBridge = <
	Filters extends object,
	Item,
	E,
	R
>(
	filters: Filters & BridgeCursorQuery,
	fetchPage: (query: StandardCursorRequest<NoInfer<Filters>>) => Effect.Effect<BridgeCursorPage<Item>, E, R>,
	options: BridgeCursorOptions<Item>
): Stream.Stream<Item, E | BridgePaginationLimitError | BridgePaginationCursorError, R> => {
	const selection = selectStandardCursor(filters, options)
	if (selection instanceof BridgePaginationCursorError) return Stream.fail(selection)

	const limit = normalizeLimit(options.limit ?? filters.limit, 100)
	if (limit instanceof BridgePaginationLimitError) return Stream.fail(limit)

	const { direction, cursor: initialCursor } = selection
	const baseFilters = standardFiltersWithoutPagination(filters)
	const makeQuery = (cursor: string | undefined): StandardCursorRequest<Filters> => {
		if (direction === "starting_after") {
			return cursor === undefined
				? { ...baseFilters, limit }
				: { ...baseFilters, limit, starting_after: cursor }
		}
		return cursor === undefined
			? { ...baseFilters, limit }
			: { ...baseFilters, limit, ending_before: cursor }
	}

	return Stream.paginate<CursorState, Item, E | BridgePaginationCursorError, R>(cursorState(initialCursor), (state) => {
		if (state.failure !== undefined) return Effect.fail(state.failure)
		return Effect.map(fetchPage(makeQuery(state.cursor)), (page) => {
			const items: ReadonlyArray<Item> = page.data ?? []
			if (items.length === 0 || page.has_more === false) {
				return [items, Option.none<CursorState>()] as const
			}

			const boundaryItem = direction === "starting_after"
				? items[items.length - 1]
				: items[0]
			const nextCursor = boundaryItem === undefined ? undefined : options.getId(boundaryItem)
			if (nextCursor === undefined || nextCursor.length === 0) {
				const failure = new BridgePaginationCursorError({ contract: "standard", kind: "missing_cursor" })
				return [items, Option.some(failedCursorState(state, failure))] as const
			}
			if (state.seen.has(nextCursor)) {
				const failure = new BridgePaginationCursorError({
					contract: "standard",
					kind: "cursor_cycle",
					cursor: nextCursor
				})
				return [items, Option.some(failedCursorState(state, failure))] as const
			}
			return [items, Option.some(nextCursorState(state, nextCursor))] as const
		})
	})
}

/** Collects the standard Bridge item stream into an array. */
export const paginateBridgeEffect = <
	Filters extends object,
	Item,
	E,
	R
>(
	filters: Filters & BridgeCursorQuery,
	fetchPage: (query: StandardCursorRequest<NoInfer<Filters>>) => Effect.Effect<BridgeCursorPage<Item>, E, R>,
	options: BridgeCursorOptions<Item>
): Effect.Effect<Array<Item>, E | BridgePaginationLimitError | BridgePaginationCursorError, R> =>
	Stream.runCollect(paginateBridge(filters, fetchPage, options))

/**
 * Lazily streams daily reward records using Bridge's separate `cursor` /
 * `pagination.next_cursor` contract. The supplied query filters are carried to
 * every request. Query `limit` and initial `cursor` values are used unless the
 * matching option overrides them. Empty data or `has_more: false` ends
 * traversal. A repeated cursor, or `has_more: true` without a next cursor,
 * fails with `BridgePaginationCursorError`. The endpoint's page size is capped
 * at 90.
 */
export const paginateBridgeRewards = <
	Filters extends object,
	Item,
	E,
	R
>(
	filters: Filters & BridgeRewardsCursorQuery,
	fetchPage: (query: RewardsCursorRequest<NoInfer<Filters>>) => Effect.Effect<BridgeRewardsCursorPage<Item>, E, R>,
	options: BridgeRewardsCursorOptions = {}
): Stream.Stream<Item, E | BridgePaginationLimitError | BridgePaginationCursorError, R> => {
	const limit = normalizeLimit(options.limit ?? filters.limit, 90)
	if (limit instanceof BridgePaginationLimitError) return Stream.fail(limit)

	const initialCursor = options.cursor ?? filters.cursor
	const baseFilters = rewardsFiltersWithoutPagination(filters)
	const makeQuery = (cursor: string | undefined): RewardsCursorRequest<Filters> =>
		cursor === undefined
			? { ...baseFilters, limit }
			: { ...baseFilters, limit, cursor }

	return Stream.paginate<CursorState, Item, E | BridgePaginationCursorError, R>(cursorState(initialCursor), (state) => {
		if (state.failure !== undefined) return Effect.fail(state.failure)
		return Effect.map(fetchPage(makeQuery(state.cursor)), (page) => {
			const items: ReadonlyArray<Item> = page.data ?? []
			const nextCursor = page.pagination?.next_cursor
			if (items.length === 0 || page.pagination?.has_more === false) {
				return [items, Option.none<CursorState>()] as const
			}
			if (nextCursor == null || nextCursor.length === 0) {
				if (page.pagination?.has_more === true) {
					const failure = new BridgePaginationCursorError({ contract: "rewards", kind: "missing_next_cursor" })
					return [items, Option.some(failedCursorState(state, failure))] as const
				}
				return [items, Option.none<CursorState>()] as const
			}
			if (state.seen.has(nextCursor)) {
				const failure = new BridgePaginationCursorError({
					contract: "rewards",
					kind: "cursor_cycle",
					cursor: nextCursor
				})
				return [items, Option.some(failedCursorState(state, failure))] as const
			}
			return [items, Option.some(nextCursorState(state, nextCursor))] as const
		})
	})
}

/** Collects the Bridge rewards item stream into an array. */
export const paginateBridgeRewardsEffect = <
	Filters extends object,
	Item,
	E,
	R
>(
	filters: Filters & BridgeRewardsCursorQuery,
	fetchPage: (query: RewardsCursorRequest<NoInfer<Filters>>) => Effect.Effect<BridgeRewardsCursorPage<Item>, E, R>,
	options: BridgeRewardsCursorOptions = {}
): Effect.Effect<Array<Item>, E | BridgePaginationLimitError | BridgePaginationCursorError, R> =>
	Stream.runCollect(paginateBridgeRewards(filters, fetchPage, options))
