// Compile-only examples: these calls are never run and have no live credentials.
import type { BridgeClient } from "../src/Bridge"

export const typecheckRepresentativeFlow = (client: BridgeClient): void => {
	client.customers.postCustomers({
		headers: { "Idempotency-Key": "fixture-customer-create" },
		payload: {
			type: "individual",
			first_name: "Miso",
			last_name: "Fixture",
			email: "miso.fixture@example.invalid"
		}
	})
	client.kycLinks.postKycLinks({
		headers: { "Idempotency-Key": "fixture-kyc-link" },
		payload: {
			type: "individual",
			full_name: "Miso Fixture",
			email: "miso.fixture@example.invalid"
		}
	})
	client.bridgeWallets.postCustomersByCustomerIDWallets({
		params: { customerID: "custfixture01" },
		headers: { "Idempotency-Key": "fixture-wallet-create" },
		payload: { chain: "ethereum" }
	})
	client.transfers.postTransfers({
		headers: { "Idempotency-Key": "fixture-transfer-create" },
		payload: {
			on_behalf_of: "custfixture01",
			amount: "12.34",
			source: { currency: "usdc", payment_rail: "ethereum", bridge_wallet_id: "walletfixture01" },
			destination: { currency: "usd", payment_rail: "ach", external_account_id: "acctfixture01" }
		}
	})
	client.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDEphemeralKeys({
		params: { customerID: "custfixture01", cardAccountID: "cardfixture01" },
		headers: { "Idempotency-Key": "fixture-ephemeral-key" },
		payload: undefined
	})
	client.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDFreeze({
		params: { customerID: "custfixture01", cardAccountID: "cardfixture01" },
		headers: { "Idempotency-Key": "fixture-card-freeze" },
		payload: undefined
	})
	client.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDUnfreeze({
		params: { customerID: "custfixture01", cardAccountID: "cardfixture01" },
		headers: { "Idempotency-Key": "fixture-card-unfreeze" },
		payload: undefined
	})
	client.cards.postCustomersByCustomerIDCardAccountsByCardAccountIDCreateMobileWalletProvisioningRequest({
		params: { customerID: "custfixture01", cardAccountID: "cardfixture01" },
		headers: { "Idempotency-Key": "fixture-wallet-provisioning" },
		payload: undefined
	})
	client.liquidationAddresses.postCustomersByCustomerIDLiquidationAddresses({
		params: { customerID: "custfixture01" },
		headers: { "Idempotency-Key": "fixture-liquidation-address" },
		payload: {
			currency: "usdc",
			chain: "ethereum",
			external_account_id: "acctfixture01",
			destination_payment_rail: "ach",
			destination_currency: "usd"
		}
	})
}

export const typecheckRejectedWireShapes = (client: BridgeClient): void => {
	client.transfers.postTransfers({
		headers: { "Idempotency-Key": "fixture-invalid-decimal" },
		payload: {
			on_behalf_of: "custfixture01",
			// @ts-expect-error Bridge decimal wire amounts are strings, never JavaScript numbers.
			amount: 12.34,
			source: { currency: "usdc", payment_rail: "ethereum", bridge_wallet_id: "walletfixture01" },
			destination: { currency: "usd", payment_rail: "ach", external_account_id: "acctfixture01" }
		}
	})
	client.cards.postCustomersByCustomerIDCardAccounts({
		params: { customerID: "custfixture01" },
		headers: { "Idempotency-Key": "fixture-invalid-card-currency" },
		payload: {
			// @ts-expect-error Card account currency is constrained by the upstream literal union.
			currency: "usd",
			chain: "ethereum"
		}
	})
}
