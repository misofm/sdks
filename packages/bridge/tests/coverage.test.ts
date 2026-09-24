import { describe, expect, test } from "bun:test"
import { OpenApi } from "effect/unstable/httpapi"
import { BridgeApi } from "../src/generated/BridgeApi"
import {
  asArray,
  asRecord,
  getParameters,
  listOperations,
  responseMediaTypes,
  resolveLocalRef
} from "./support/openapi"

const rawSpec = JSON.parse(await Bun.file(new URL("../openapi/bridge-2026-09-23.json", import.meta.url)).text()) as unknown
const manifest = JSON.parse(await Bun.file(new URL("../openapi/operation-manifest.json", import.meta.url)).text()) as unknown
const generated = OpenApi.fromApi(BridgeApi) as unknown
const generatedSource = await Bun.file(new URL("../src/generated/BridgeApi.ts", import.meta.url)).text()

const manifestRecord = asRecord(manifest)
const sourceOperations = listOperations(rawSpec)
const manifestOperations = asArray(manifestRecord.operations).map(asRecord)
const generatedPaths = asRecord(asRecord(generated).paths)
const manifestByKey = new Map(
  manifestOperations.map((entry) => [`${entry.method} ${entry.path}`, entry] as const)
)

type OperationKey = `${string} ${string}`

const keyOf = (method: unknown, path: unknown): OperationKey => `${String(method)} ${String(path)}`

const requestMediaTypes = (root: unknown, value: unknown): ReadonlyArray<string> => {
  const body = value === undefined ? undefined : asRecord(resolveLocalRef(root, value))
  return body?.content === undefined ? [] : Object.keys(asRecord(body.content)).sort()
}

const openApiRefObject = (value: unknown): Record<string, unknown> => {
  const resolved = resolveLocalRef(rawSpec, value)
  return resolved === undefined ? {} : asRecord(resolved)
}

const optionalRequestBodyKeys = sourceOperations.flatMap(({ method, path, operation }) => {
  const body = openApiRefObject(operation.requestBody)
  return Object.keys(body).length > 0 && body.required !== true ? [keyOf(method, path)] : []
}).sort()

describe("Bridge operation coverage", () => {
  test("the pinned source and stable manifest cover the complete upstream operation set", () => {
    const rawPaths = asRecord(asRecord(rawSpec).paths)
    const expectedKeys = sourceOperations.map(({ method, path }) => keyOf(method, path)).sort()
    const actualKeys = manifestOperations.map((entry) => keyOf(entry.method, entry.path)).sort()
    const operationIds = manifestOperations.map((entry) => entry.operationId)

    expect(Object.keys(rawPaths)).toHaveLength(100)
    expect(sourceOperations).toHaveLength(134)
    expect(manifestByKey.size).toBe(134)
    expect(actualKeys).toEqual(expectedKeys)
    expect(new Set(operationIds).size).toBe(134)
    expect(manifestRecord.sourceSha256).toBe("e8aee6cee1b5518d81f384c8b718dd9d9154dd9eb55345ff73d8b8dbe88327f2")
  })

  test("the generated HttpApi exposes every operation with matching parameters, body media, statuses, and response media", () => {
    for (const { method, path, pathItem, operation } of sourceOperations) {
      const key = keyOf(method, path)
      const manifestEntry = manifestByKey.get(key)
      expect(manifestEntry).toBeDefined()
      if (manifestEntry === undefined) continue

      const generatedPath = asRecord(generatedPaths[path])
      const generatedOperation = asRecord(generatedPath[method])
      expect(generatedOperation.operationId).toBe(manifestEntry.operationId)
      expect(asArray(generatedOperation.tags)).toContain(manifestEntry.group)
      expect(getParameters(rawSpec, pathItem, operation)).toEqual(
        getParameters(generated, {}, generatedOperation)
      )

      const sourceBodyMedia = requestMediaTypes(rawSpec, operation.requestBody)
      const generatedBodyMedia = requestMediaTypes(generated, generatedOperation.requestBody)
      expect(generatedBodyMedia).toEqual(sourceBodyMedia)

      const sourceResponses = asRecord(operation.responses)
      const generatedResponses = asRecord(generatedOperation.responses)
      const statuses = Object.keys(sourceResponses).sort()
      expect(Object.keys(generatedResponses).sort()).toEqual(statuses)
      for (const status of statuses) {
        expect(responseMediaTypes(rawSpec, sourceResponses[status])).toEqual(
          responseMediaTypes(generated, asRecord(generatedResponses)[status])
        )
      }
    }
  })

  test("the generated schema source contains no Never placeholders", () => {
    expect([...generatedSource.matchAll(/Schema\.Never/g)]).toHaveLength(0)
  })

  test("optional card bodies stay explicitly bounded to the four upstream operations", () => {
    expect(optionalRequestBodyKeys).toEqual([
      "post /customers/{customerID}/card_accounts/{cardAccountID}/create_mobile_wallet_provisioning_request",
      "post /customers/{customerID}/card_accounts/{cardAccountID}/ephemeral_keys",
      "post /customers/{customerID}/card_accounts/{cardAccountID}/freeze",
      "post /customers/{customerID}/card_accounts/{cardAccountID}/unfreeze"
    ])
    for (const key of optionalRequestBodyKeys) {
      const operation = sourceOperations.find((entry) => keyOf(entry.method, entry.path) === key)
      expect(operation?.method).toBe("post")
      expect(operation?.operation.requestBody).toBeDefined()
      expect(operation?.path).toContain("/customers/")
    }
  })

  test("hidden and deprecated operations remain in the generated surface", () => {
    const hidden: Array<OperationKey> = []
    const deprecated: Array<OperationKey> = []
    for (const { method, path, operation } of sourceOperations) {
      if (operation["x-hidden"] === true) hidden.push(keyOf(method, path))
      if (operation.deprecated === true) deprecated.push(keyOf(method, path))
    }

    expect(hidden.sort()).toEqual([
      "get /fees/configurations",
      "get /fees/configurations/{developerFeeConfigID}",
      "post /fees/configurations",
      "put /fees/configurations/{developerFeeConfigID}"
    ])
    expect(deprecated.sort()).toEqual([
      "get /customers/{customerID}/liquidation_addresses/{liquidationAddressID}/balances",
      "post /customers/{customerID}/batch_settlement_schedules",
      "post /customers/{customerID}/card_accounts"
    ])
    for (const key of [...hidden, ...deprecated]) expect(manifestByKey.has(key)).toBe(true)
  })
})
