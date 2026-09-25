# Bridge OpenAPI notes

This SDK is based on the official [Bridge OpenAPI document](https://withbridge-image1-sv-usw2-monorail-openapi.s3.amazonaws.com/latest.json), retrieved on 2026-09-23. The committed, unmodified snapshot is `openapi/bridge-2026-09-23.json` with SHA-256 `e8aee6cee1b5518d81f384c8b718dd9d9154dd9eb55345ff73d8b8dbe88327f2` (OpenAPI 3.0.2; 100 paths; 134 operations; 263 component schemas). The stable operation IDs and lower-camel group names are in `openapi/operation-manifest.json` because the source has no `operationId` values.

The generated surface retains all 134 operations, including the four operations marked `x-hidden` under Developer Fees and the three operations marked deprecated. `tests/coverage.test.ts` compares source and generated verb/path, parameter, body media, status, and response media metadata.

## Idempotency

Bridge’s [idempotency guide](https://apidocs.bridge.xyz/api-reference/introduction/idempotence) gives general guidance for POST requests. The [Create a scoped API key endpoint](https://apidocs.bridge.xyz/api-reference/api-keys/create-a-scoped-api-key) explicitly says it does not accept `Idempotency-Key`; each call creates a new key. The OpenAPI snapshot has no such parameter on `POST /api_keys`.

The same snapshot has no `Idempotency-Key` parameter declaration on these four other POST operations:

- `POST /customers/{customerID}/external_accounts/{externalAccountID}/verify`
- `POST /plaid_exchange_public_token/{link_token}`
- `POST /customers/{customerID}/card_accounts/{cardAccountID}/statements/{period}.pdf`
- `POST /cardholders/{cardholderID}/cards/{cardID}/statements/{period}.pdf`

That is five POST operations total without a declaration, counting API key creation. The API key documentation is an explicit prohibition; the other four are omissions in the snapshot. The client does not infer a global requirement and does not add an idempotency header to operations whose generated contract has none. There are no live credentials or Bridge calls in this package’s tests.

## Customer examples and schema

The raw `Customer` schema does not declare a `type` field, while the create and list examples include `type: "individual"` or `type: "business"`. The successful business-customer response example sets `last_name` to `null` and includes a structured associated-person item in `requirements.complete`; the raw schema declares a string surname and string-only completed items. Both `GET /customers` examples omit `count`.

The normalization overlay now applies an output-only compatibility adjustment for those published shapes: `Customer.last_name` accepts `null`, `requirements.complete` accepts strings or the documented `{ associated_person, items }` object, and only the `GET /customers` response makes `count` optional. `data` remains required and `count` remains an integer when present. Create and update payload schemas stay strict, and `Customer.type` is not added to the generated static model. Tests accept the official examples and reject a nullable surname on the create request. These checks establish compatibility with the pinned examples; no live Bridge response was sampled, so they do not confirm production wire behavior. Pagination still follows the endpoint’s cursor contract and must not infer completion from an example’s missing `count`.

## Webhook event values

The `WebhookEvent.event_type` enum contains suffixes such as `created` and `updated`, while its description says values are prefixed with `event_category` and gives `customer.created` as an example. Event examples also use qualified values. Keep the schema-derived enum intact and treat the qualified-value conflict explicitly at event decoding; do not replace the enum globally with an unrestricted string. See Bridge’s [webhook event structure](https://apidocs.bridge.xyz/platform/additional-information/webhooks/structure).

## Developer Fees response schema

`POST /developer/fees` declares an `application/json` success response and includes an example with `default_liquidation_address_fee_percent`, but omits the response schema. The generation overlay adds a reference to the existing `DeveloperFees` component, which is also used by `GET /developer/fees`. This is the narrow response repair; it does not change the raw snapshot.

## Optional card request bodies

OpenAPI 3.0 treats an omitted `requestBody.required` value as `false`. Four card
operations use that default: ephemeral key creation, freeze, unfreeze, and mobile
wallet push provisioning. Their generated methods accept either the operation's
request schema or an absent payload. The client sends `payload: undefined` as an
empty HTTP body without `Content-Type`, and sends supplied payloads as JSON;
compile-time and controlled-client checks cover both forms.

The pinned Effect rc.112 `OpenApi.fromApi` projection still reports
`requestBody.required: true` for these payload unions. This is a projection
limitation only; it does not describe the generated method type or client wire
behavior. The raw snapshot remains the authority for optionality.

## Repaired and normalized schemas

The initial rc.112 generation emitted `Schema.Never` for non-empty contracts
below. That generation defect is fixed: the current generator produces concrete
schemas for the audited models, and a repository scan of the generated API finds
zero `Schema.Never` references. `tests/contracts.test.ts` pins the affected
operation use sites and decodes non-empty synthetic or documented examples.

| Repaired model | Affected operations |
| --- | --- |
| `ExternalAccountResponse` | `DELETE /customers/{customerID}/external_accounts/{externalAccountID}`; `GET /customers/{customerID}/external_accounts`; `GET /customers/{customerID}/external_accounts/{externalAccountID}`; `GET /external_accounts`; `POST /customers/{customerID}/external_accounts`; `POST /customers/{customerID}/external_accounts/{externalAccountID}/deactivate`; `POST /customers/{customerID}/external_accounts/{externalAccountID}/reactivate`; `PUT /customers/{customerID}/external_accounts/{externalAccountID}` |
| `CreateExternalAccountInput` | `POST /customers/{customerID}/external_accounts` (the eight-branch `oneOf` now generates a concrete union; seven named request examples are checked) |
| `CreateLiquidationAddressResponse` | `POST /customers/{customerID}/liquidation_addresses` |
| `FeeExternalAccount` | `GET /developer/fee_external_account`; `POST /developer/fee_external_account` |
| `CreateFeeExternalAccountInput` | `POST /developer/fee_external_account` |
| `CardAccount` | `GET /customers/{customerID}/card_accounts`; `GET /customers/{customerID}/card_accounts/{cardAccountID}`; `POST /customers/{customerID}/card_accounts`; `PUT /customers/{customerID}/card_accounts/{cardAccountID}` |

The generator also previously emitted `WebhookEvent.event_object` and
`event_object_changes` as `Record<string, never>`. They now accept JSON-valued
maps; the populated event fixture exercises both through `WebhookEvent` and the
webhook-events response. The broader regression fixtures cover the other
discovered nested shapes: current and future customer endorsement requirements
(including `missing: null`, `all_of`/`any_of`, and issue-code maps), all six
virtual-account deposit-instruction rail variants, integer country counts and
decimal-string country volumes in `CardProgramSummary`, and a populated
virtual-account deactivation response. These schema fixtures remain separate
from upstream examples that contradict the pinned schemas; see the audit below.

## Controlled contract fixtures

`tests/contracts.test.ts` runs only against a strict local `HttpClient` fake:
an unregistered method/path defects rather than silently returning a generic
success. The Miso sequence creates an individual customer and KYC link, creates a
wallet and ACH external account under the returned customer ID, creates a
decimal-string transfer using both returned resource IDs, then reads a populated
event through the webhook-events endpoint. It is a schema and client-composition
fixture, not a live onboarding or payment test: the KYC response is
`not_started`, the wallet and external account are synthetic, and the transfer
response is `awaiting_funds`. Bridge defines [`awaiting_funds` as waiting for
customer funds before processing](https://apidocs.bridge.xyz/platform/orchestration/transfers/transfer-states),
so a successful create response does not mean the transfer settled. Consumers
must handle actual KYC and endorsement state, funding, transfer transitions, and
webhook delivery and deduplication in their own flow. A second fake-client fixture covers prefunded
accounts, liquidation-address collection, card accounts, webhook registration
reads, developer fees, and country reference data. Both tests assert request
paths and bodies, auth/idempotency headers where applicable, and decoded
responses. Additional schema fixtures cover each documented external-account
rail. These tests use only synthetic keys and fixture data; they make no live
Bridge requests.

The pinned wallet create, list, and detail response examples decode against
their generated schemas, as do the documented external-account rail requests
and responses. By contrast, the six published external-account verification
responses are ambiguous under the declared overlapping `oneOf`; the generated
client can reject them even though their rail-shaped payloads are in the spec.
Card-account operations have no directly addressable `2xx` JSON response
examples in this snapshot, so the card fixture is synthetic and is not evidence
of live card-response conformance.

Compile-only contract checks accept the documented requests and optional card
bodies, while `@ts-expect-error` cases pin rejected numeric decimal amounts and
invalid card currency literals. These checks do not replace runtime schema
validation or prove backend behavior.

## Official response-example audit

For this pass, a directly addressable response example is an inline example or a
`components.examples` reference attached to an explicit `2xx`
`application/json` response in the pinned snapshot. References are resolved, and
each operation/status use is checked against its generated success schema;
reusing one component example on another operation counts as another use. This
excludes request examples, examples attached only to component schemas,
non-JSON media, and error responses. The selection contains 181 uses across 122
distinct example values; 86 uses fail their corresponding generated schema
after the output-only customer overlay accepts three previously failing uses.
`tests/contracts.test.ts` pins representative cases below, including the
remaining strict failures.

| Mismatch group | Evidence in the pinned snapshot | Classification |
| --- | --- | --- |
| Customer responses | The raw declaration has a string `last_name` and string-only `requirements.complete`; `SuccessfulCustomerResponse2` uses `last_name: null` and a structured associated-person item. Both `GET /customers` examples omit `count`. | Direct raw-spec contradictions addressed by an output-only overlay: nullable response surname, string-or-structured completed items, and optional list-response `count`. `data` stays required, create/update inputs stay strict, and no static `Customer.type` field is added. Example acceptance does not confirm live wire behavior. |
| Associated persons | The `SuccessfulAssociatedPersonResponse` timestamps are ISO strings; the component declares integer milliseconds. | Direct component/example contradiction. |
| Transfers | All published transfer examples omit top-level `currency`, which `TransferResponse` requires. Their transfer states such as `awaiting_funds` are allowed. | Unresolved response example/schema contradiction. `currency` remains required; no live Bridge response or Bridge confirmation establishes whether production omits it, so transfer wire compatibility remains unconfirmed. |
| Virtual accounts | The US operation example contains quote characters in property names; other rail examples omit schema-required properties or use `payment_rails` arrays where EU/GB declare a string. | Direct operation example/schema contradictions. The generated rail union follows the component schemas. |
| External-account verification | `AccountVerification` is a six-member `oneOf`; every member has only optional keys and permits additional properties, so each rail-keyed example matches multiple members. | Ambiguous upstream composition. The generated `oneOf` correctly rejects examples that do not match exactly one member; Bridge should make the variants exclusive or change the composition. |
| Response envelopes and shapes | The ToS-link response schema is `{ url }` but its example wraps it as `{ data: { url } }`; liquidation-address drain examples use a `count`/array envelope where the schema describes one `Drain`; the prefunded-account-history example is a `count`/array envelope where the response schema is `PrefundedAccountHistory`. | Direct operation response schema/example contradictions. |
| Other value constraints | Funds-request examples use a currency outside the declared enum; RFI examples use `bridge_action_taken` values outside its enum; liquidation-address create examples omit required `destination_payment_rail`; the static-memo history example exceeds the declared `omad` length; webhook examples use category/type values outside their enums or omit a required logs `count`. | Direct response example/schema contradictions. |

These reviewed failures point to upstream schema/example disagreement or an
ambiguous upstream `oneOf`. The implemented customer overlay accepts the
published business and list response shapes without relaxing create/update
inputs or unrelated schemas; the raw snapshot remains unchanged. The generated
`Customer` type still has no declared `type` property. Transfer response
`currency` remains required: every published transfer example omits it, but the
live response shape is unconfirmed and Bridge has not confirmed whether this is
intentional. No live Bridge calls were made, so generated-schema example checks
do not establish live wire compatibility.

KYC status is a separate flow condition: `not_started` is accepted by the KYC
schema and is not a decoding defect, but the Miso fixture must not be read as
proof that a customer completed KYC or received the endorsement needed for a
particular product.

## Pagination exceptions

The [stablecoin reward history endpoint](https://apidocs.bridge.xyz/api-reference/rewards/get-daily-reward-history-for-a-stablecoin) has its own `cursor` and `pagination.next_cursor` contract, with a maximum `limit` of 90. It is not the standard `starting_after` / `ending_before` cursor pair. The [pending card authorizations endpoint](https://apidocs.bridge.xyz/api-reference/cards/retrieve-pending-card-authorizations) is explicitly unpaginated. These routes need their own handling and must not be folded into standard list pagination.

## Webhook signature documentation

Bridge’s [signature guide](https://apidocs.bridge.xyz/platform/additional-information/webhooks/signature) specifies hashing `timestamp + "." + rawBody` with SHA-256 and then verifying the resulting digest with RSA PKCS#1 v1.5 SHA-256. The guide’s Ruby example is inconsistent with that stated algorithm. The SDK follows the guide’s prose and compatible language examples, verifies the exact raw request bytes before decoding JSON, and tests against an independently generated signature vector. Consumers remain responsible for durable event-ID deduplication.

## Source links

- [Bridge API reference](https://apidocs.bridge.xyz/api-reference/introduction/introduction)
- [Bridge documentation index](https://apidocs.bridge.xyz/llms.txt)
- [Bridge deprecation guide](https://apidocs.bridge.xyz/api-reference/introduction/deprecation)
