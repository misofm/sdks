import { describe, expect, test } from "bun:test"
import * as Schema from "effect/Schema"
import * as GeneratedApi from "../src/generated/BridgeApi"
import {
	CardAccount,
	CreateBridgeWallet,
	Customer,
	DeveloperFees,
	Error,
	GetListsCountries200,
	LiquidationAddress,
	PostCardFreezeInput,
	PostCustomersByCustomerIDCardAccountsRequestJson,
	PostCustomersByCustomerIDLiquidationAddressesRequestJson,
	PostCustomersByCustomerIDWalletsRequestJson,
	PostKycLinksRequestJson,
	PostCustomersRequestJson,
	PostTransfersRequestJson,
	PrefundedAccount,
	TransferRequest,
	TransferResponse,
	WebhookEvent
} from "../src/generated/BridgeApi"

interface FlowFixtures {
	readonly customer: unknown
	readonly kycLink: unknown
	readonly wallet: unknown
	readonly transfer: unknown
	readonly webhook: unknown
	readonly responses: Readonly<Record<string, unknown>>
}

interface MajorFamilyFixtures {
	readonly liquidationAddressRequest: unknown
	readonly liquidationAddressResponse: unknown
	readonly cardAccountRequest: unknown
	readonly cardAccountResponse: unknown
	readonly prefundedAccount: unknown
	readonly developerFees: unknown
	readonly countries: unknown
}

interface NestedResponseFixtures {
	readonly endorsement: unknown
}

interface RawBridgeSpec {
	readonly components: {
		readonly schemas: Readonly<Record<string, unknown>>
	}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)

const flow = JSON.parse(
	await Bun.file(new URL("./fixtures/contracts/representative-flow.json", import.meta.url)).text()
) as FlowFixtures
const families = JSON.parse(
	await Bun.file(new URL("./fixtures/contracts/major-families.json", import.meta.url)).text()
) as MajorFamilyFixtures
const nested = JSON.parse(
	await Bun.file(new URL("./fixtures/nested-response-schemas.json", import.meta.url)).text()
) as NestedResponseFixtures
const rawSpec = JSON.parse(
	await Bun.file(new URL("../openapi/bridge-2026-09-23.json", import.meta.url)).text()
) as RawBridgeSpec

describe("Bridge generated object schemas", () => {
	test("Miso flow and official family fixtures decode across request and response models", () => {
		expect(Schema.is(PostCustomersRequestJson)(flow.customer)).toBe(true)
		expect(Schema.is(PostKycLinksRequestJson)(flow.kycLink)).toBe(true)
		expect(Schema.is(PostCustomersByCustomerIDWalletsRequestJson)(flow.wallet)).toBe(true)
		expect(Schema.is(PostTransfersRequestJson)(flow.transfer)).toBe(true)
		expect(Schema.is(Customer)(flow.responses.customer)).toBe(true)
		expect(Schema.is(TransferResponse)(flow.responses.transfer)).toBe(true)
		expect(Schema.is(WebhookEvent)(flow.webhook)).toBe(true)

		expect(Schema.is(PostCustomersByCustomerIDLiquidationAddressesRequestJson)(families.liquidationAddressRequest)).toBe(true)
		expect(Schema.is(LiquidationAddress)(families.liquidationAddressResponse)).toBe(true)
		expect(Schema.is(PostCustomersByCustomerIDCardAccountsRequestJson)(families.cardAccountRequest)).toBe(true)
		expect(Schema.is(CardAccount)(families.cardAccountResponse)).toBe(true)
		expect(Schema.is(PrefundedAccount)(families.prefundedAccount)).toBe(true)
		expect(Schema.is(DeveloperFees)(families.developerFees)).toBe(true)
		expect(Schema.is(GetListsCountries200)(families.countries)).toBe(true)
	})

	test("object-shaped requests and responses reject primitive JSON at the top level", () => {
		for (const value of [null, "primitive", 1, true, []]) {
			expect(Schema.is(Customer)(value)).toBe(false)
			expect(Schema.is(TransferRequest)(value)).toBe(false)
			expect(Schema.is(CreateBridgeWallet)(value)).toBe(false)
			expect(Schema.is(Error)(value)).toBe(false)
			expect(Schema.is(PostCardFreezeInput)(value)).toBe(false)
		}
		expect(Schema.is(CreateBridgeWallet)({ chain: "ethereum" })).toBe(true)
		expect(Schema.is(CreateBridgeWallet)({ chain: "ethereum", upstream_addition: "accepted" })).toBe(true)
		expect(Schema.is(CreateBridgeWallet)({})).toBe(false)
		expect(Schema.is(PostCardFreezeInput)({ initiator: "customer", reason: "other" })).toBe(true)
		expect(Schema.is(PostCardFreezeInput)({ initiator: "bridge", reason: "other" })).toBe(false)
	})

	test("every exported component object missing an upstream type rejects primitives", () => {
		const generated = GeneratedApi as unknown as Readonly<Record<string, unknown>>
		const primitiveValues = [null, "primitive", 1, true, []]
		let checked = 0

		for (const [name, rawSchema] of Object.entries(rawSpec.components.schemas)) {
			if (!isRecord(rawSchema) || "type" in rawSchema ||
				!("properties" in rawSchema || Array.isArray(rawSchema.required))) continue
			const schema = generated[name]
			if (schema === undefined) continue
			checked += 1
			const rejectedValues = primitiveValues.filter((value) => value !== null || rawSchema.nullable !== true)
			for (const value of rejectedValues) {
				expect(Schema.is(schema as Schema.Constraint)(value), `${name} should reject ${String(value)}`).toBe(false)
			}
		}

		expect(checked).toBeGreaterThan(50)
	})

	test("nested request and response object schemas reject primitive values", () => {
		const endorsement = nested.endorsement as Record<string, unknown>
		const customer = { id: "custfixture01", endorsements: [endorsement] }
		expect(Schema.is(Customer)(customer)).toBe(true)
		expect(Schema.is(Customer)({ ...customer, endorsements: ["not-an-endorsement"] })).toBe(false)
		expect(Schema.is(Customer)({ ...customer, middle_name: null })).toBe(true)

		expect(Schema.is(PostTransfersRequestJson)({
			...(flow.transfer as Record<string, unknown>),
			source: "not-an-object"
		})).toBe(false)
		expect(Schema.is(TransferResponse)({
			...(flow.responses.transfer as Record<string, unknown>),
			destination: "not-an-object"
		})).toBe(false)
	})
})
