import type * as Effect from "effect/Effect"
import type { Redacted } from "effect/Redacted"

import type { BridgeClient, BridgeHttpClientResponse } from "../src/Bridge.js"
import type { BridgeClientError } from "../src/Errors.js"
import type { BridgeConfig } from "../src/Config.js"
import type {
	GetCustomers200,
	PostCustomersByCustomerIDCardAccountsByCardAccountIDStatementsPeriodPdf200ApplicationPdf
} from "../src/generated/BridgeApi.js"

declare const client: BridgeClient

const customerList = client.customers.getCustomers({ query: {} })
const customerListType: Effect.Effect<GetCustomers200, BridgeClientError> = customerList

const customerListWithResponse = client.customers.getCustomers({
	query: {},
	responseMode: "decoded-and-response"
})
const customerListWithResponseType: Effect.Effect<
[GetCustomers200, BridgeHttpClientResponse],
	BridgeClientError
> = customerListWithResponse

const statementPdf = client.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDStatementsPeriodPdf({
	params: { customerID: "cus_test", cardAccountID: "cca_test", period: "2026-09" }
})
const statementPdfType: Effect.Effect<
	PostCustomersByCustomerIDCardAccountsByCardAccountIDStatementsPeriodPdf200ApplicationPdf,
	BridgeClientError
> = statementPdf

client.bridgeWallets.postCustomersByCustomerIDWallets({
	params: { customerID: "cus_test" },
	headers: { "Idempotency-Key": "caller-owned-stable-key" },
	payload: { chain: "base" }
})

// @ts-expect-error Wallet creation requires the caller's declared idempotency header.
client.bridgeWallets.postCustomersByCustomerIDWallets({ params: { customerID: "cus_test" }, payload: { chain: "base" } })

// @ts-expect-error Bridge explicitly forbids Idempotency-Key on POST /api_keys.
client.apiKeys.postApiKeys({ payload: { scopes: ["customer:read"] }, headers: { "Idempotency-Key": "not-allowed" } })

// @ts-expect-error credentials must be redacted before entering Bridge configuration.
const unsafeConfig: BridgeConfig = { apiKey: "sk-live-never-in-source" }

declare const apiKey: Redacted<string>
const safeConfig: BridgeConfig = { apiKey, environment: "sandbox" }

void customerListType
void customerListWithResponseType
void statementPdfType
void unsafeConfig
void safeConfig
