import { beforeAll, describe, expect, test } from "bun:test"
import * as Schema from "effect/Schema"
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import {
  CardProgramSummary,
  CreateBusinessCustomerPayload,
  CreateIndividualCustomerPayload,
  Customer,
  GetCustomers200,
  PostCustomersByCustomerIDCardAccountsByCardAccountIDEphemeralKeysRequestJson,
  PostCustomersByCustomerIDCardAccountsByCardAccountIDFreezeRequestJson,
  PostCustomersByCustomerIDCardAccountsByCardAccountIDUnfreezeRequestJson,
  PostCustomersByCustomerIDCardAccountsByCardAccountIDCreateMobileWalletProvisioningRequestRequestJson,
  PostCustomersByCustomerIDVirtualAccountsByVirtualAccountIDDeactivate200,
  UpdateBusinessCustomerPayload,
  UpdateIndividualCustomerPayload,
  VirtualAccountResponse
} from "../src/generated/BridgeApi"
import {
  BRIDGE_OPERATION_COUNT,
  BRIDGE_PATH_COUNT,
  BRIDGE_SCHEMA_COUNT,
  BRIDGE_SPEC_SHA256,
  generateBridgeApi
} from "../scripts/generate.ts"

interface Warning {
  readonly code: string
  readonly message: string
  readonly path?: string
  readonly method?: string
  readonly operationId?: string
}

interface WarningBaseline {
  readonly items: ReadonlyArray<Warning>
  readonly review: Readonly<Record<string, string>>
}

const packageRoot = resolve(import.meta.dir, "..")
const generatedPath = resolve(packageRoot, "src/generated/BridgeApi.ts")
const warningBaselinePath = resolve(packageRoot, "openapi/generator-warnings.json")
const nestedFixturePath = resolve(packageRoot, "tests/fixtures/nested-response-schemas.json")
const pinnedSpecPath = resolve(packageRoot, "openapi/bridge-2026-09-23.json")

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const atPath = (value: unknown, path: ReadonlyArray<string>): unknown => {
  let current = value
  for (const key of path) {
    if (!isRecord(current) || !(key in current)) throw new Error(`Pinned Bridge snapshot is missing ${path.join(".")}`)
    current = current[key]
  }
  return current
}

const exampleValue = (value: unknown, name: string): unknown => {
  if (!isRecord(value) || !("value" in value)) throw new Error(`Pinned Bridge snapshot is missing example ${name}`)
  return value.value
}

const warningKey = (warning: Warning): string => JSON.stringify({
  code: warning.code,
  path: warning.path ?? null,
  method: warning.method ?? null,
  operationId: warning.operationId ?? null,
  message: warning.message
})

describe("Bridge contract generation", () => {
  let generated: Awaited<ReturnType<typeof generateBridgeApi>>

  beforeAll(async () => {
    generated = await generateBridgeApi()
  })

  test("pins and covers the complete official snapshot", () => {
    expect(generated.sourceHash).toBe(BRIDGE_SPEC_SHA256)
    expect(generated.pathCount).toBe(BRIDGE_PATH_COUNT)
    expect(generated.schemaCount).toBe(BRIDGE_SCHEMA_COUNT)
    expect(generated.operationCount).toBe(BRIDGE_OPERATION_COUNT)
    expect(generated.generatedOperationCount).toBe(BRIDGE_OPERATION_COUNT)
  })

  test("keeps operation groups, hidden and deprecated metadata, and concrete schemas", () => {
    expect(generated.output).toContain("export class BridgeApi extends HttpApi.make(\"BridgeApi\")")
    expect(generated.output).toContain('HttpApiGroup.make("bridgeWallets")')
    expect(generated.output).toContain('HttpApiGroup.make("developerFees")')
    expect(generated.output.match(/\[Upstream x-hidden\]/g)).toHaveLength(4)
    expect(generated.output.match(/\[Deprecated upstream\]/g)).toHaveLength(3)
    expect(generated.output).toContain("export const Customer = Schema.")
    expect(generated.output).toContain("export const DeveloperFeeConfig = Schema.")
    expect(generated.output).not.toContain("Schema.Any")
    expect(generated.output).not.toContain("Schema.Never")
  })

  test("decodes realistic non-empty fixtures for previously impossible nested response schemas", async () => {
    const fixtures = JSON.parse(await readFile(nestedFixturePath, "utf8")) as {
      readonly endorsement: unknown
      readonly virtualAccountInstructions: Readonly<Record<string, unknown>>
      readonly cardProgramSummary: Record<string, unknown>
      readonly deactivateResponse: unknown
    }

    const customer = { id: "cus123456", endorsements: [fixtures.endorsement] }
    expect(Schema.is(Customer)(customer)).toBe(true)
    const endorsement = fixtures.endorsement as {
      readonly name: string
      readonly status: string
      readonly requirements: { readonly issues: ReadonlyArray<unknown>; readonly missing: unknown }
    }
    expect(Schema.is(Customer)({
      ...customer,
      endorsements: [{
        ...endorsement,
        requirements: { ...endorsement.requirements, missing: null }
      }]
    })).toBe(true)
    expect(Schema.is(Customer)({
      ...customer,
      endorsements: [{
        ...endorsement,
        requirements: { ...endorsement.requirements, issues: [{ id_front_photo: 404 }] }
      }]
    })).toBe(false)

    const instructionNames = ["us", "eu", "mx", "br", "gb", "co"]
    expect(Object.keys(fixtures.virtualAccountInstructions).sort()).toEqual(instructionNames.sort())
    for (const instructions of Object.values(fixtures.virtualAccountInstructions)) {
      expect(Schema.is(VirtualAccountResponse)({ source_deposit_instructions: instructions })).toBe(true)
    }

    expect(Schema.is(CardProgramSummary)(fixtures.cardProgramSummary)).toBe(true)
    expect(Schema.is(CardProgramSummary)({
      ...fixtures.cardProgramSummary,
      provisioned_cards_by_country: { USA: "123" }
    })).toBe(false)
    expect(Schema.is(CardProgramSummary)({
      ...fixtures.cardProgramSummary,
      transaction_volume_by_country: { USA: 7.04 }
    })).toBe(false)

    expect(Schema.is(PostCustomersByCustomerIDVirtualAccountsByVirtualAccountIDDeactivate200)(
      fixtures.deactivateResponse
    )).toBe(true)
    expect(Schema.is(PostCustomersByCustomerIDVirtualAccountsByVirtualAccountIDDeactivate200)({
      ...(fixtures.deactivateResponse as Record<string, unknown>),
      status: "active"
    })).toBe(false)
  })

  test("decodes published customer response examples while keeping request payloads strict", async () => {
    const spec = JSON.parse(await readFile(pinnedSpecPath, "utf8")) as unknown
    const businessCustomer = exampleValue(
      atPath(spec, ["components", "examples", "SuccessfulCustomerResponse2"]),
      "SuccessfulCustomerResponse2"
    )
    const customerListExamples = atPath(spec, ["paths", "/customers", "get", "responses", "200", "content", "application/json", "examples"])
    const customersFound = exampleValue(atPath(customerListExamples, ["CustomersFound"]), "CustomersFound")
    const noCustomersFound = exampleValue(atPath(customerListExamples, ["NoCustomersFound"]), "NoCustomersFound")

    const decodedBusinessCustomer = Schema.decodeUnknownSync(Customer)(businessCustomer)
    expect(decodedBusinessCustomer.last_name).toBeNull()
    const decodedCustomerList = Schema.decodeUnknownSync(GetCustomers200)(customersFound)
    expect(decodedCustomerList.count).toBeUndefined()
    expect(decodedCustomerList.data).toHaveLength(2)
    expect(Schema.decodeUnknownSync(GetCustomers200)(noCustomersFound).data).toHaveLength(0)

    if (!isRecord(businessCustomer)) throw new Error("Published business customer example must be an object")
    expect(Schema.is(Customer)({ ...businessCustomer, last_name: 42 })).toBe(false)
    expect(Schema.is(GetCustomers200)({ data: [], count: "0" })).toBe(false)
    expect(Schema.is(Customer)({
      endorsements: [{
        name: "base",
        status: "approved",
        requirements: {
          complete: [{ associated_person: 123, items: ["first_name"] }],
          pending: [],
          missing: null,
          issues: []
        }
      }]
    })).toBe(false)
    expect(Schema.is(Customer)({
      endorsements: [{
        name: "base",
        status: "approved",
        requirements: {
          complete: [{ associated_person: "person_123" }],
          pending: [],
          missing: null,
          issues: []
        }
      }]
    })).toBe(false)

    expect(Schema.is(CreateIndividualCustomerPayload)({ type: "individual", last_name: null })).toBe(false)
    expect(Schema.is(UpdateIndividualCustomerPayload)({ type: "individual", last_name: null })).toBe(false)
    expect(Schema.is(CreateBusinessCustomerPayload)({ type: "business", business_legal_name: null })).toBe(false)
    expect(Schema.is(UpdateBusinessCustomerPayload)({ type: "business", business_legal_name: null })).toBe(false)
  })

  test("preserves optional card request bodies and encodes absent or supplied payloads", () => {
    const optionalPayloads = [
      {
        operationId: "postCustomersByCustomerIDCardAccountsByCardAccountIDEphemeralKeys",
        schemaName: "PostCustomersByCustomerIDCardAccountsByCardAccountIDEphemeralKeysRequestJson",
        schema: PostCustomersByCustomerIDCardAccountsByCardAccountIDEphemeralKeysRequestJson,
        body: { client_nonce: "nonce" }
      },
      {
        operationId: "postCustomersByCustomerIDCardAccountsByCardAccountIDFreeze",
        schemaName: "PostCustomersByCustomerIDCardAccountsByCardAccountIDFreezeRequestJson",
        schema: PostCustomersByCustomerIDCardAccountsByCardAccountIDFreezeRequestJson,
        body: { initiator: "customer", reason: "other" }
      },
      {
        operationId: "postCustomersByCustomerIDCardAccountsByCardAccountIDUnfreeze",
        schemaName: "PostCustomersByCustomerIDCardAccountsByCardAccountIDUnfreezeRequestJson",
        schema: PostCustomersByCustomerIDCardAccountsByCardAccountIDUnfreezeRequestJson,
        body: { initiator: "customer" }
      },
      {
        operationId: "postCustomersByCustomerIDCardAccountsByCardAccountIDCreateMobileWalletProvisioningRequest",
        schemaName: "PostCustomersByCustomerIDCardAccountsByCardAccountIDCreateMobileWalletProvisioningRequestRequestJson",
        schema: PostCustomersByCustomerIDCardAccountsByCardAccountIDCreateMobileWalletProvisioningRequestRequestJson,
        body: { initiator: "customer" }
      }
    ] as const

    expect(generated.output.match(/payload: \[[A-Za-z0-9]+RequestJson, HttpApiSchema\.NoContent\]/g)).toHaveLength(4)

    for (const { operationId, schemaName, schema, body } of optionalPayloads) {
      expect(generated.output).toContain(`HttpApiEndpoint.post("${operationId}"`)
      expect(generated.output).toContain(`payload: [${schemaName}, HttpApiSchema.NoContent]`)

      const payload = Schema.Union([schema, HttpApiSchema.NoContent])
      expect(Schema.is(schema)(body)).toBe(true)
      expect(Schema.is(schema)(null)).toBe(false)
      expect(Schema.is(payload)(undefined)).toBe(true)
      expect(Schema.is(payload)(body)).toBe(true)
      expect(Schema.encodeUnknownSync(payload)(undefined)).toBeUndefined()
      expect(Schema.encodeUnknownSync(payload)(body)).toEqual(body)
    }
  })

  test("matches the reviewed warning baseline and checked-in output byte for byte", async () => {
    const baseline = JSON.parse(await readFile(warningBaselinePath, "utf8")) as WarningBaseline
    const actualWarnings = generated.warnings.map(warningKey).sort()
    const expectedWarnings = baseline.items.map(warningKey).sort()
    expect(actualWarnings).toEqual(expectedWarnings)
    for (const code of new Set(generated.warnings.map(({ code }) => code))) {
      expect(baseline.review[code]?.trim().length).toBeGreaterThan(0)
    }
    expect(await readFile(generatedPath, "utf8")).toBe(generated.output)
  })
})
