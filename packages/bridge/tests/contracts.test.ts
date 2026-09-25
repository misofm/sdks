import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as HttpClient from "effect/unstable/http/HttpClient"
import { Bridge } from "../src/Bridge.js"
import * as BridgeSchemas from "../src/generated/BridgeApi"
import { controlledHttpClient, requestJson } from "./support/controlled-http"
import {
	isRecord,
	listOperations
} from "./support/openapi"

type FormerNeverModelName =
	| "ExternalAccountResponse"
	| "CreateExternalAccountInput"
	| "CreateLiquidationAddressResponse"
	| "FeeExternalAccount"
	| "CreateFeeExternalAccountInput"
	| "CardAccount"

interface ContractFixtures {
	readonly customer: unknown
	readonly kycLink: unknown
	readonly wallet: unknown
	readonly externalAccount: unknown
	readonly transfer: unknown
	readonly webhook: unknown
	readonly responses: Readonly<Record<string, unknown>>
}

interface MajorFamilyFixtures {
	readonly liquidationAddressRequest: unknown
	readonly liquidationAddressResponse: unknown
	readonly cardAccountRequest: unknown
	readonly cardAccountResponse: unknown
	readonly cardFreezeResponse: unknown
	readonly prefundedAccount: unknown
	readonly webhooks: unknown
	readonly developerFees: unknown
	readonly countries: unknown
}

interface NestedResponseFixtures {
	readonly endorsement: unknown
	readonly virtualAccountInstructions: Readonly<Record<string, unknown>>
	readonly cardProgramSummary: unknown
	readonly deactivateResponse: unknown
}

const flow = JSON.parse(
	await Bun.file(new URL("./fixtures/contracts/representative-flow.json", import.meta.url)).text()
) as ContractFixtures
const formerNeverModelFixtures = JSON.parse(
	await Bun.file(new URL("./fixtures/contracts/never-models.json", import.meta.url)).text()
) as Record<FormerNeverModelName, unknown>
const familyFixtures = JSON.parse(
	await Bun.file(new URL("./fixtures/contracts/major-families.json", import.meta.url)).text()
) as MajorFamilyFixtures
const nestedResponseFixtures = JSON.parse(
	await Bun.file(new URL("./fixtures/nested-response-schemas.json", import.meta.url)).text()
) as NestedResponseFixtures
const rawSpec = JSON.parse(
	await Bun.file(new URL("../openapi/bridge-2026-09-23.json", import.meta.url)).text()
) as unknown

const componentExampleValue = (name: string): unknown => {
	const components = isRecord(rawSpec) && isRecord(rawSpec.components) ? rawSpec.components : {}
	const examples = isRecord(components.examples) ? components.examples : {}
	const example = examples[name]
	if (!isRecord(example) || !("value" in example)) {
		throw new Error(`Expected pinned OpenAPI component example ${name}`)
	}
	return example.value
}

const responseExampleValue = (path: string, method: string, status: string, name: string): unknown => {
	const paths = isRecord(rawSpec) && isRecord(rawSpec.paths) ? rawSpec.paths : {}
	const pathItem = isRecord(paths[path]) ? paths[path] : {}
	const operation = isRecord(pathItem[method]) ? pathItem[method] : {}
	const responses = isRecord(operation.responses) ? operation.responses : {}
	const response = isRecord(responses[status]) ? responses[status] : {}
	const content = isRecord(response.content) ? response.content : {}
	const json = isRecord(content["application/json"]) ? content["application/json"] : {}
	const examples = isRecord(json.examples) ? json.examples : {}
	const example = examples[name]
	if (!isRecord(example) || !("value" in example)) {
		throw new Error(`Expected pinned OpenAPI response example ${method.toUpperCase()} ${path} ${status} ${name}`)
	}
	return example.value
}

const schemaReferences = (value: unknown, into = new Set<string>()): Set<string> => {
	if (Array.isArray(value)) {
		for (const item of value) schemaReferences(item, into)
	} else if (isRecord(value)) {
		if (typeof value.$ref === "string" && value.$ref.startsWith("#/components/schemas/")) {
			into.add(value.$ref.slice("#/components/schemas/".length))
		}
		for (const nested of Object.values(value)) schemaReferences(nested, into)
	}
	return into
}

const keyOf = (method: string, path: string): string => `${method} ${path}`

const fixtureBridgeLayer = (client: HttpClient.HttpClient) =>
	Bridge.layer({
		apiKey: Redacted.make("sk-test-bridge-contract-fixture"),
		baseUrl: "https://bridge.fixture/v0"
	}).pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, client)))

const requireStringField = (value: unknown, key: string): string => {
	if (!isRecord(value) || typeof value[key] !== "string") throw new Error(`Expected fixture field ${key} to be a string`)
	return value[key]
}

type UsAchExternalAccountInput = Extract<
	BridgeSchemas.CreateExternalAccountInput,
	{ readonly currency: "usd"; readonly account_type: "us" }
>

const isUsAchExternalAccountInput = (
	value: BridgeSchemas.CreateExternalAccountInput
): value is UsAchExternalAccountInput =>
	isRecord(value) && value.currency === "usd" && value.account_type === "us"

const repairedModelCases: ReadonlyArray<{
	readonly name: FormerNeverModelName
	readonly schema: Schema.Constraint
	readonly operations: ReadonlyArray<string>
}> = [
	{
		name: "ExternalAccountResponse",
		schema: BridgeSchemas.ExternalAccountResponse,
		operations: [
			"delete /customers/{customerID}/external_accounts/{externalAccountID}",
			"get /customers/{customerID}/external_accounts",
			"get /customers/{customerID}/external_accounts/{externalAccountID}",
			"get /external_accounts",
			"post /customers/{customerID}/external_accounts",
			"post /customers/{customerID}/external_accounts/{externalAccountID}/deactivate",
			"post /customers/{customerID}/external_accounts/{externalAccountID}/reactivate",
			"put /customers/{customerID}/external_accounts/{externalAccountID}"
		]
	},
	{
		name: "CreateExternalAccountInput",
		schema: BridgeSchemas.CreateExternalAccountInput,
		operations: ["post /customers/{customerID}/external_accounts"]
	},
	{
		name: "CreateLiquidationAddressResponse",
		schema: BridgeSchemas.CreateLiquidationAddressResponse,
		operations: ["post /customers/{customerID}/liquidation_addresses"]
	},
	{
		name: "FeeExternalAccount",
		schema: BridgeSchemas.FeeExternalAccount,
		operations: ["get /developer/fee_external_account", "post /developer/fee_external_account"]
	},
	{
		name: "CreateFeeExternalAccountInput",
		schema: BridgeSchemas.CreateFeeExternalAccountInput,
		operations: ["post /developer/fee_external_account"]
	},
	{
		name: "CardAccount",
		schema: BridgeSchemas.CardAccount,
		operations: [
			"get /customers/{customerID}/card_accounts",
			"get /customers/{customerID}/card_accounts/{cardAccountID}",
			"post /customers/{customerID}/card_accounts",
			"put /customers/{customerID}/card_accounts/{cardAccountID}"
		]
	}
]

const expectedRepairedModelUses: Record<FormerNeverModelName, ReadonlyArray<string>> = {
	ExternalAccountResponse: [
		"delete /customers/{customerID}/external_accounts/{externalAccountID}",
		"get /customers/{customerID}/external_accounts",
		"get /customers/{customerID}/external_accounts/{externalAccountID}",
		"get /external_accounts",
		"post /customers/{customerID}/external_accounts",
		"post /customers/{customerID}/external_accounts/{externalAccountID}/deactivate",
		"post /customers/{customerID}/external_accounts/{externalAccountID}/reactivate",
		"put /customers/{customerID}/external_accounts/{externalAccountID}"
	],
	CreateExternalAccountInput: ["post /customers/{customerID}/external_accounts"],
	CreateLiquidationAddressResponse: ["post /customers/{customerID}/liquidation_addresses"],
	FeeExternalAccount: ["get /developer/fee_external_account", "post /developer/fee_external_account"],
	CreateFeeExternalAccountInput: ["post /developer/fee_external_account"],
	CardAccount: [
		"get /customers/{customerID}/card_accounts",
		"get /customers/{customerID}/card_accounts/{cardAccountID}",
		"post /customers/{customerID}/card_accounts",
		"put /customers/{customerID}/card_accounts/{cardAccountID}"
	]
}

describe("Bridge contract fixtures", () => {
	test("the Miso customer → KYC → wallet → transfer request shapes decode from generated schemas", () => {
		expect(Schema.is(BridgeSchemas.PostCustomersRequestJson)(flow.customer)).toBe(true)
		expect(Schema.is(BridgeSchemas.PostKycLinksRequestJson)(flow.kycLink)).toBe(true)
		expect(Schema.is(BridgeSchemas.PostCustomersByCustomerIDWalletsRequestJson)(flow.wallet)).toBe(true)
		expect(Schema.is(BridgeSchemas.PostTransfersRequestJson)(flow.transfer)).toBe(true)
	})

	test("the webhook example accepts a populated event object and changes map", () => {
		expect(Schema.is(BridgeSchemas.WebhookEvent)(flow.webhook)).toBe(true)
		if (isRecord(flow.webhook)) {
			expect(Schema.is(BridgeSchemas.WebhookEvent)({ ...flow.webhook, event_type: "customer.created" })).toBe(false)
		}
		if (isRecord(flow.transfer)) {
			expect(Schema.is(BridgeSchemas.PostTransfersRequestJson)({ ...flow.transfer, amount: 12.34 })).toBe(false)
		}
		expect(Schema.is(BridgeSchemas.PostCustomersByCustomerIDCardAccountsRequestJson)({
			currency: "usd",
			chain: "ethereum"
		})).toBe(false)
	})

	test("published customer examples decode while unresolved response examples remain rejected", () => {
		const businessCustomer = componentExampleValue("SuccessfulCustomerResponse2")
		expect(Schema.is(BridgeSchemas.Customer)(businessCustomer)).toBe(true)
		if (isRecord(businessCustomer)) {
			// The output-only overlay admits the exact published nullable surname and
			// structured completed requirement, while the create request remains strict.
			expect(businessCustomer.last_name).toBeNull()
		}
		if (isRecord(flow.customer)) {
			expect(Schema.is(BridgeSchemas.PostCustomersRequestJson)({ ...flow.customer, last_name: null })).toBe(false)
		}

		const noCustomers = responseExampleValue("/customers", "get", "200", "NoCustomersFound")
		expect(Schema.is(BridgeSchemas.GetCustomers200)(noCustomers)).toBe(true)
		const customersFound = responseExampleValue("/customers", "get", "200", "CustomersFound")
		expect(Schema.is(BridgeSchemas.GetCustomers200)(customersFound)).toBe(true)

		const transfer = componentExampleValue("AchOfframpTransferResponse")
		expect(Schema.is(BridgeSchemas.PostTransfers201)(transfer)).toBe(false)
		if (isRecord(transfer)) {
			// The documented sample otherwise matches TransferResponse; its missing required currency is the conflict.
			expect(Schema.is(BridgeSchemas.PostTransfers201)({ ...transfer, currency: "usd" })).toBe(true)
		}

		const pendingVerification = responseExampleValue(
			"/customers/{customerID}/external_accounts/{externalAccountID}/verify",
			"post",
			"200",
			"PendingIbanVerification"
		)
		expect(Schema.is(BridgeSchemas.PostCustomersByCustomerIDExternalAccountsByExternalAccountIDVerify200)(pendingVerification)).toBe(false)

		const virtualAccount = responseExampleValue("/customers/{customerID}/virtual_accounts", "post", "200", "us")
		expect(Schema.is(BridgeSchemas.PostCustomersByCustomerIDVirtualAccounts200)(virtualAccount)).toBe(false)

		const kycLink = componentExampleValue("SuccessfulKycLinkCreateResponse")
		expect(Schema.is(BridgeSchemas.PostKycLinks200)(kycLink)).toBe(true)
		if (isRecord(kycLink)) expect(kycLink.kyc_status).toBe("not_started")

		const createdWallet = componentExampleValue("SuccessfulBridgeWalletCreateResponse")
		expect(Schema.is(BridgeSchemas.PostCustomersByCustomerIDWallets201)(createdWallet)).toBe(true)
		const walletList = componentExampleValue("SuccessfulBridgeWalletListResponse")
		expect(Schema.is(BridgeSchemas.GetCustomersByCustomerIDWallets200)(walletList)).toBe(true)
		const wallet = componentExampleValue("SuccessfulBridgeWalletGetResponse")
		expect(Schema.is(BridgeSchemas.GetCustomersByCustomerIDWalletsByBridgeWalletID200)(wallet)).toBe(true)
	})

	test("T1b nested response fixtures decode through the public generated schemas", () => {
		expect(Schema.is(BridgeSchemas.Customer)({ endorsements: [nestedResponseFixtures.endorsement] })).toBe(true)
		if (isRecord(nestedResponseFixtures.endorsement)) {
			const requirements = isRecord(nestedResponseFixtures.endorsement.requirements)
				? nestedResponseFixtures.endorsement.requirements
				: {}
			expect(Schema.is(BridgeSchemas.Customer)({
				endorsements: [{
					...nestedResponseFixtures.endorsement,
					requirements: { ...requirements, missing: null }
				}]
			})).toBe(true)
			expect(Schema.is(BridgeSchemas.Customer)({
				endorsements: [{
					...nestedResponseFixtures.endorsement,
					requirements: { ...requirements, issues: [{ id_front_photo: 404 }] }
				}]
			})).toBe(false)
		}

		const railNames = ["us", "eu", "mx", "br", "gb", "co"]
		expect(Object.keys(nestedResponseFixtures.virtualAccountInstructions).sort()).toEqual(railNames.sort())
		for (const instructions of Object.values(nestedResponseFixtures.virtualAccountInstructions)) {
			expect(Schema.is(BridgeSchemas.VirtualAccountResponse)({ source_deposit_instructions: instructions })).toBe(true)
		}

		expect(Schema.is(BridgeSchemas.CardProgramSummary)(nestedResponseFixtures.cardProgramSummary)).toBe(true)
		if (isRecord(nestedResponseFixtures.cardProgramSummary)) {
			expect(Schema.is(BridgeSchemas.CardProgramSummary)({
				...nestedResponseFixtures.cardProgramSummary,
				provisioned_cards_by_country: { USA: "123" }
			})).toBe(false)
			expect(Schema.is(BridgeSchemas.CardProgramSummary)({
				...nestedResponseFixtures.cardProgramSummary,
				transaction_volume_by_country: { USA: 7.04 }
			})).toBe(false)
		}
		expect(Schema.is(BridgeSchemas.PostCustomersByCustomerIDVirtualAccountsByVirtualAccountIDDeactivate200)(
			nestedResponseFixtures.deactivateResponse
		)).toBe(true)
	})

	test("the generated client carries the Miso customer → KYC → wallet/external account → transfer → webhook path", async () => {
		const responseFixtures = [
			{ method: "POST", path: "/v0/customers", status: 201, body: flow.responses.customer },
			{ method: "POST", path: "/v0/kyc_links", status: 200, body: flow.responses.kycLink },
			{ method: "POST", path: "/v0/customers/custfixture01/wallets", status: 201, body: flow.responses.wallet },
			{
				method: "POST",
				path: "/v0/customers/custfixture01/external_accounts",
				status: 201,
				body: formerNeverModelFixtures.ExternalAccountResponse
			},
			{ method: "POST", path: "/v0/transfers", status: 201, body: flow.responses.transfer },
			{
				method: "GET",
				path: "/v0/webhooks/wep_c0ffee1234/events",
				body: { data: [flow.webhook] }
			}
		] as const
		const fake = controlledHttpClient(responseFixtures)
		const customerPayload = Schema.decodeUnknownSync(BridgeSchemas.PostCustomersRequestJson)(flow.customer)
		if (customerPayload.type !== "individual") {
			throw new Error("The Miso workflow fixture must be the individual-customer request variant")
		}
		const kycPayload = Schema.decodeUnknownSync(BridgeSchemas.PostKycLinksRequestJson)(flow.kycLink)
		const walletPayload = Schema.decodeUnknownSync(BridgeSchemas.PostCustomersByCustomerIDWalletsRequestJson)(flow.wallet)
		const decodedExternalAccountPayload = Schema.decodeUnknownSync(BridgeSchemas.CreateExternalAccountInput)(flow.externalAccount)
		if (!isUsAchExternalAccountInput(decodedExternalAccountPayload)) {
			throw new Error("The Miso workflow fixture must be the ACH external-account request variant")
		}
		const transferAmount = requireStringField(flow.transfer, "amount")
		const webhookEvent = Schema.decodeUnknownSync(BridgeSchemas.WebhookEvent)(flow.webhook)

		const outcome = await Effect.runPromise(Effect.gen(function*() {
			const bridge = yield* Bridge
			const customer = yield* bridge.customers.postCustomers({
				headers: { "Idempotency-Key": "miso-fixture-customer" },
				payload: customerPayload
			})
			const customerID = requireStringField(customer, "id")
			const kycLink = yield* bridge.kycLinks.postKycLinks({
				headers: { "Idempotency-Key": "miso-fixture-kyc" },
				payload: kycPayload
			})
			const wallet = yield* bridge.bridgeWallets.postCustomersByCustomerIDWallets({
				params: { customerID },
				headers: { "Idempotency-Key": "miso-fixture-wallet" },
				payload: walletPayload
			})
			const walletID = requireStringField(wallet, "id")
			const externalAccount = yield* bridge.externalAccounts.postCustomersByCustomerIDExternalAccounts({
				params: { customerID },
				headers: { "Idempotency-Key": "miso-fixture-external-account" },
				payload: decodedExternalAccountPayload
			})
			const externalAccountID = requireStringField(externalAccount, "id")
			const transfer = yield* bridge.transfers.postTransfers({
				headers: { "Idempotency-Key": "miso-fixture-transfer" },
				payload: {
					on_behalf_of: customerID,
					amount: transferAmount,
					source: { currency: "usdc", payment_rail: "ethereum", bridge_wallet_id: walletID },
					destination: { currency: "usd", payment_rail: "ach", external_account_id: externalAccountID }
				} satisfies BridgeSchemas.TransferRequest
			})
			const events = yield* bridge.webhooks.getWebhooksByWebhookIDEvents({
				params: { webhookID: "wep_c0ffee1234" }
			})
			return { customer, kycLink, wallet, externalAccount, transfer, events }
		}).pipe(Effect.provide(fixtureBridgeLayer(fake.client))))

		expect(outcome.customer).toMatchObject({ id: "custfixture01", type: "individual" })
		expect(outcome.kycLink).toMatchObject({ customer_id: "custfixture01", kyc_status: "not_started" })
		expect(outcome.wallet).toMatchObject({ id: "walletfixture01", chain: "ethereum" })
		expect(outcome.externalAccount).toMatchObject({ id: "acctfixture01", active: true })
		expect(outcome.transfer).toMatchObject({ id: "transferfixture01", amount: "12.34", state: "awaiting_funds" })
		expect(outcome.events).toEqual({ data: [webhookEvent] })
		expect(fake.calls.map(({ request, url }) => [request.method, url.pathname])).toEqual([
			["POST", "/v0/customers"],
			["POST", "/v0/kyc_links"],
			["POST", "/v0/customers/custfixture01/wallets"],
			["POST", "/v0/customers/custfixture01/external_accounts"],
			["POST", "/v0/transfers"],
			["GET", "/v0/webhooks/wep_c0ffee1234/events"]
		])
		for (const call of fake.calls.slice(0, 5)) {
			expect(call.request.headers["api-key"]).toBe("sk-test-bridge-contract-fixture")
			expect(call.request.headers["idempotency-key"]).toBeTruthy()
		}
		expect(requestJson(fake.calls[0]!.request)).toEqual(flow.customer)
		expect(requestJson(fake.calls[1]!.request)).toEqual(flow.kycLink)
		expect(requestJson(fake.calls[2]!.request)).toEqual(flow.wallet)
		expect(requestJson(fake.calls[3]!.request)).toEqual(flow.externalAccount)
		expect(requestJson(fake.calls[4]!.request)).toMatchObject({
			on_behalf_of: "custfixture01",
			source: { bridge_wallet_id: "walletfixture01" },
			destination: { external_account_id: "acctfixture01" },
			amount: "12.34"
		})
	})

	test("strict fake fixtures exercise prefund, collection, cards, webhooks, developer admin, and supporting information", async () => {
		const fake = controlledHttpClient([
			{
				method: "GET",
				path: "/v0/prefunded_accounts/f15972de-4cdd-460c-9da3-34f7321bfa3f",
				body: familyFixtures.prefundedAccount
			},
			{
				method: "POST",
				path: "/v0/customers/custfixture01/liquidation_addresses",
				status: 201,
				body: familyFixtures.liquidationAddressResponse
			},
			{
				method: "POST",
				path: "/v0/customers/custfixture01/card_accounts",
				status: 201,
				body: familyFixtures.cardAccountResponse
			},
			{
				method: "POST",
				path: "/v0/customers/custfixture01/card_accounts/cardfixture01/freeze",
				body: familyFixtures.cardFreezeResponse
			},
			{ method: "GET", path: "/v0/webhooks", body: familyFixtures.webhooks },
			{ method: "GET", path: "/v0/developer/fees", body: familyFixtures.developerFees },
			{ method: "GET", path: "/v0/lists/countries", body: familyFixtures.countries }
		])
		const liquidationAddressPayload = Schema.decodeUnknownSync(BridgeSchemas.PostCustomersByCustomerIDLiquidationAddressesRequestJson)(
			familyFixtures.liquidationAddressRequest
		)
		const cardAccountPayload = Schema.decodeUnknownSync(BridgeSchemas.PostCustomersByCustomerIDCardAccountsRequestJson)(
			familyFixtures.cardAccountRequest
		)
		const expectedWebhooks = Schema.decodeUnknownSync(BridgeSchemas.GetWebhooks200)(familyFixtures.webhooks)
		const expectedDeveloperFees = Schema.decodeUnknownSync(BridgeSchemas.DeveloperFees)(familyFixtures.developerFees)
		const expectedCountries = Schema.decodeUnknownSync(BridgeSchemas.GetListsCountries200)(familyFixtures.countries)
		const results = await Effect.runPromise(Effect.gen(function*() {
			const bridge = yield* Bridge
			const prefundedAccount = yield* bridge.prefundedAccounts.getPrefundedAccountsByPrefundedAccountID({
				params: { prefundedAccountID: "f15972de-4cdd-460c-9da3-34f7321bfa3f" }
			})
			const liquidationAddress = yield* bridge.liquidationAddresses.postCustomersByCustomerIDLiquidationAddresses({
				params: { customerID: "custfixture01" },
				headers: { "Idempotency-Key": "miso-fixture-liquidation-address" },
				payload: liquidationAddressPayload
			})
			const cardAccount = yield* bridge.cards.postCustomersByCustomerIDCardAccounts({
				params: { customerID: "custfixture01" },
				headers: { "Idempotency-Key": "miso-fixture-card-account" },
				payload: cardAccountPayload
			})
			const cardFreeze = yield* bridge.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDFreeze({
				params: { customerID: "custfixture01", cardAccountID: "cardfixture01" },
				headers: { "Idempotency-Key": "miso-fixture-card-freeze" },
				payload: undefined
			})
			const webhooks = yield* bridge.webhooks.getWebhooks({})
			const developerFees = yield* bridge.developers.getDeveloperFees({})
			const countries = yield* bridge.lists.getListsCountries({})
			return { prefundedAccount, liquidationAddress, cardAccount, cardFreeze, webhooks, developerFees, countries }
		}).pipe(Effect.provide(fixtureBridgeLayer(fake.client))))

		expect(results.prefundedAccount).toMatchObject({ id: "f15972de-4cdd-460c-9da3-34f7321bfa3f", available_balance: "134.12" })
		expect(results.liquidationAddress).toMatchObject({ id: "lafixture01", destination_currency: "usd" })
		expect(results.cardAccount).toMatchObject({ id: "cardfixture01", status: "active" })
		expect(results.cardFreeze).toMatchObject({ status: "freeze_created", card_account_id: "cardfixture01" })
		expect(results.webhooks).toEqual(expectedWebhooks)
		expect(results.developerFees).toEqual(expectedDeveloperFees)
		expect(results.countries).toEqual(expectedCountries)
		expect(fake.calls.map(({ request, url }) => [request.method, url.pathname])).toEqual([
			["GET", "/v0/prefunded_accounts/f15972de-4cdd-460c-9da3-34f7321bfa3f"],
			["POST", "/v0/customers/custfixture01/liquidation_addresses"],
			["POST", "/v0/customers/custfixture01/card_accounts"],
			["POST", "/v0/customers/custfixture01/card_accounts/cardfixture01/freeze"],
			["GET", "/v0/webhooks"],
			["GET", "/v0/developer/fees"],
			["GET", "/v0/lists/countries"]
		])
		expect(requestJson(fake.calls[1]!.request)).toEqual(familyFixtures.liquidationAddressRequest)
		expect(requestJson(fake.calls[2]!.request)).toEqual(familyFixtures.cardAccountRequest)
		for (const call of [fake.calls[1], fake.calls[2], fake.calls[3]]) {
			expect(call?.request.headers["api-key"]).toBe("sk-test-bridge-contract-fixture")
			expect(call?.request.headers["idempotency-key"]).toBeTruthy()
		}
		expect(fake.calls[3]!.request.body._tag).toBe("Empty")
		expect(fake.calls[3]!.request.headers["content-type"]).toBeUndefined()
	})

	test("documented external-account rail examples decode in their request and response directions", () => {
		const components = isRecord(rawSpec) && isRecord(rawSpec.components) ? rawSpec.components : {}
		const examples = isRecord(components.examples) ? components.examples : {}
		const requestExamples = [
			"CreateAchExternalAccountRequest",
			"CreateIbanExternalAccountRequest",
			"CreateClabeExternalAccountRequest",
			"CreatePixExternalAccountRequest",
			"CreateBrCodeExternalAccountRequest",
			"CreateBreBExternalAccountRequest",
			"CreateCoBankTransferExternalAccountRequest"
		]
		const responseExamples = [
			"SuccessfulExternalAccountResponse",
			"SuccessfulFeeExternalAccountResponse",
			"SuccessfulIbanExternalAccountResponse",
			"SuccessfulPixKeyExternalAccountResponse",
			"SuccessfulBrCodeExternalAccountResponse",
			"SuccessfulBreBExternalAccountResponse",
			"SuccessfulCoBankTransferExternalAccountResponse",
			"SuccessfulClabeExternalAccountResponse"
		]

		for (const name of requestExamples) {
			const example = examples[name]
			expect(isRecord(example) && "value" in example).toBe(true)
			if (isRecord(example)) expect(Schema.is(BridgeSchemas.CreateExternalAccountInput)(example.value)).toBe(true)
		}
		for (const name of responseExamples) {
			const example = examples[name]
			expect(isRecord(example) && "value" in example).toBe(true)
			if (isRecord(example)) {
				const schema = name === "SuccessfulFeeExternalAccountResponse"
					? BridgeSchemas.FeeExternalAccount
					: BridgeSchemas.ExternalAccountResponse
				expect(Schema.is(schema)(example.value)).toBe(true)
			}
		}
	})

	test("the documented SEPA liquidation-address response example decodes", () => {
		const components = isRecord(rawSpec) && isRecord(rawSpec.components) ? rawSpec.components : {}
		const examples = isRecord(components.examples) ? components.examples : {}
		const example = examples.SuccessfulSepaLiquidationAddressCreateResponse
		expect(isRecord(example) && "value" in example).toBe(true)
		if (isRecord(example)) {
			expect(Schema.is(BridgeSchemas.CreateLiquidationAddressResponse)(example.value)).toBe(true)
		}
	})

	test("the original top-level Schema.Never cases map to the exact repaired operation sites", () => {
		const actualUses = new Map<FormerNeverModelName, Array<string>>()
		for (const { method, path, operation } of listOperations(rawSpec)) {
			const refs = schemaReferences(operation)
			for (const { name } of repairedModelCases) {
				if (refs.has(name)) {
					const uses = actualUses.get(name) ?? []
					uses.push(keyOf(method, path))
					actualUses.set(name, uses)
				}
			}
		}

		for (const { name } of repairedModelCases) {
			expect((actualUses.get(name) ?? []).sort()).toEqual([...expectedRepairedModelUses[name]])
		}
	})

	for (const { name, schema, operations } of repairedModelCases) {
		test(`${name} accepts its documented non-empty fixture (${operations.join(", ")})`, () => {
			const fixture = name === "CreateExternalAccountInput" ? flow.externalAccount : formerNeverModelFixtures[name]
			expect(Schema.is(schema)(fixture)).toBe(true)
		})
	}
})
