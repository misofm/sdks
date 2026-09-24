import * as OpenApiGenerator from "@effect/openapi-generator/OpenApiGenerator"
import * as OpenApiPatch from "@effect/openapi-generator/OpenApiPatch"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import type { OpenAPISpec } from "effect/unstable/httpapi/OpenApi"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

const packageRoot = resolve(import.meta.dir, "..")
const sourcePath = resolve(packageRoot, "openapi/bridge-2026-09-23.json")
const manifestPath = resolve(packageRoot, "openapi/operation-manifest.json")
const overlayPath = resolve(packageRoot, "openapi/normalization-overlay.json")
const warningBaselinePath = resolve(packageRoot, "openapi/generator-warnings.json")
const generatedPath = resolve(packageRoot, "src/generated/BridgeApi.ts")

export const BRIDGE_SPEC_SHA256 = "e8aee6cee1b5518d81f384c8b718dd9d9154dd9eb55345ff73d8b8dbe88327f2"
export const BRIDGE_OPERATION_COUNT = 134
export const BRIDGE_PATH_COUNT = 100
export const BRIDGE_SCHEMA_COUNT = 263

const methods = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const
type HttpMethod = (typeof methods)[number]

interface OperationEntry {
  readonly method: HttpMethod
  readonly path: string
  readonly operationId: string
  readonly group: string
}

interface OperationManifest {
  readonly sourceSha256: string
  readonly groups: Readonly<Record<string, string>>
  readonly operations: ReadonlyArray<OperationEntry>
}

interface GeneratorWarning {
  readonly code: string
  readonly message: string
  readonly path?: string
  readonly method?: string
  readonly operationId?: string
}

interface NormalizationOverlay {
  readonly patches: unknown
  readonly objectSchemas: ReadonlyArray<{
    readonly pointer: string
    readonly reason: string
  }>
  readonly propertyObjectSchemas: {
    readonly reason: string
    readonly pointers: ReadonlyArray<string>
  }
  readonly schemaVariants: ReadonlyArray<{
    readonly source: string
    readonly input: string
    readonly outputRequired?: ReadonlyArray<string>
    readonly inputRequired?: ReadonlyArray<string>
    readonly requestRefs: ReadonlyArray<string>
    readonly inputRefOverrides: ReadonlyArray<{
      readonly pointer: string
      readonly schema: string
    }>
    readonly reason: string
  }>
  readonly generatedSchemaOverrides: ReadonlyArray<{
    readonly name: string
    readonly fromType: string
    readonly type: string
    readonly fromSchema: string
    readonly schema: string
    readonly reason: string
  }>
}

interface WarningBaseline {
  readonly items: ReadonlyArray<GeneratorWarning>
  readonly review: Readonly<Record<string, string>>
}

export interface BridgeGeneration {
  readonly sourceHash: string
  readonly operationCount: number
  readonly generatedOperationCount: number
  readonly pathCount: number
  readonly schemaCount: number
  readonly output: string
  readonly warnings: ReadonlyArray<GeneratorWarning>
}

const GROUP_IDS_BY_TAG: Readonly<Record<string, string>> = {
  "API Keys": "apiKeys",
  "Associated Persons": "associatedPersons",
  "Batch Settlements": "batchSettlements",
  "Bridge Wallets": "bridgeWallets",
  Cards: "cards",
  "Crypto Return Policies": "cryptoReturnPolicies",
  Customers: "customers",
  "Developer Fees": "developerFees",
  Developers: "developers",
  "Exchange Rates": "exchangeRates",
  "External Accounts": "externalAccounts",
  "Fiat Payout Configuration": "fiatPayoutConfiguration",
  "Funds Requests": "fundsRequests",
  "KYC Links": "kycLinks",
  "Liquidation Addresses": "liquidationAddresses",
  Lists: "lists",
  Plaid: "plaid",
  "Prefunded Accounts": "prefundedAccounts",
  RFIs: "rfis",
  Rewards: "rewards",
  Sandbox: "sandbox",
  "Static Memos": "staticMemos",
  Transfers: "transfers",
  "Travel Rule": "travelRule",
  "Virtual Accounts": "virtualAccounts",
  Webhooks: "webhooks"
}

const OPTIONAL_CARD_PAYLOAD_UNIONS = [
  {
    operationId: "postCustomersByCustomerIDCardAccountsByCardAccountIDEphemeralKeys",
    requestSchema: "PostCustomersByCustomerIDCardAccountsByCardAccountIDEphemeralKeysRequestJson"
  },
  {
    operationId: "postCustomersByCustomerIDCardAccountsByCardAccountIDFreeze",
    requestSchema: "PostCustomersByCustomerIDCardAccountsByCardAccountIDFreezeRequestJson"
  },
  {
    operationId: "postCustomersByCustomerIDCardAccountsByCardAccountIDUnfreeze",
    requestSchema: "PostCustomersByCustomerIDCardAccountsByCardAccountIDUnfreezeRequestJson"
  },
  {
    operationId: "postCustomersByCustomerIDCardAccountsByCardAccountIDCreateMobileWalletProvisioningRequest",
    requestSchema: "PostCustomersByCustomerIDCardAccountsByCardAccountIDCreateMobileWalletProvisioningRequestRequestJson"
  }
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const fail = (message: string): never => {
  throw new Error(`[Bridge codegen] ${message}`)
}

const sha256 = async (input: Uint8Array): Promise<string> => {
  const digestInput = new Uint8Array(input.byteLength)
  digestInput.set(input)
  const digest = await crypto.subtle.digest("SHA-256", digestInput)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

const parseJson = (text: string, source: string): unknown => {
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return fail(`could not parse ${source}: ${reason}`)
  }
}

const readObject = async (path: string): Promise<Record<string, unknown>> => {
  const content = await readFile(path, "utf8")
  const parsed = parseJson(content, path)
  if (!isRecord(parsed)) return fail(`${path} must contain a JSON object`)
  return parsed
}

const assertSourceSnapshot = async (): Promise<{ readonly text: string; readonly hash: string }> => {
  const bytes = await readFile(sourcePath)
  const hash = await sha256(bytes)
  if (hash !== BRIDGE_SPEC_SHA256) {
    return fail(`raw Bridge spec checksum mismatch: expected ${BRIDGE_SPEC_SHA256}, got ${hash}`)
  }
  return { text: new TextDecoder().decode(bytes), hash }
}

const methodOrder = new Map<HttpMethod, number>(methods.map((method, index) => [method, index]))

const methodIsValid = (value: unknown): value is HttpMethod =>
  typeof value === "string" && methods.some((method) => method === value)

const pascalSegment = (value: string): string => {
  const words = value.match(/[A-Za-z0-9]+/g) ?? []
  return words.map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`).join("")
}

const operationIdFor = (method: HttpMethod, path: string): string => {
  const suffix = path.split("/").filter(Boolean).map((segment) => {
    if (segment.startsWith("{") && segment.endsWith("}")) {
      return `By${pascalSegment(segment.slice(1, -1))}`
    }
    return pascalSegment(segment)
  }).join("")
  const prefix = method === "get" ? "get" : `${method.slice(0, 1).toLowerCase()}${method.slice(1)}`
  return `${prefix}${suffix}`
}

const listRawOperations = (spec: Record<string, unknown>): ReadonlyArray<{
  readonly path: string
  readonly method: HttpMethod
  readonly tags: ReadonlyArray<string>
}> => {
  const paths = spec.paths
  if (!isRecord(paths)) return fail("raw spec has no paths object")
  const operations: Array<{ path: string; method: HttpMethod; tags: ReadonlyArray<string> }> = []
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) continue
    for (const [methodValue, operationValue] of Object.entries(pathItem)) {
      if (!methodIsValid(methodValue) || !isRecord(operationValue)) continue
      const rawTags = operationValue.tags
      const tags = Array.isArray(rawTags) ? rawTags.filter((tag): tag is string => typeof tag === "string") : []
      operations.push({ path, method: methodValue, tags })
    }
  }
  return operations.sort((left, right) =>
    left.path.localeCompare(right.path) || (methodOrder.get(left.method)! - methodOrder.get(right.method)!)
  )
}

const makeOperationManifest = (
  spec: Record<string, unknown>,
  sourceHash: string
): OperationManifest => {
  const operations = listRawOperations(spec)
  if (operations.length !== BRIDGE_OPERATION_COUNT) {
    return fail(`raw snapshot has ${operations.length} operations, expected ${BRIDGE_OPERATION_COUNT}`)
  }
  const groups: Record<string, string> = {}
  for (const operation of operations) {
    if (operation.tags.length !== 1) {
      return fail(`${operation.method.toUpperCase()} ${operation.path} must have exactly one upstream tag`)
    }
    const sourceTag = operation.tags[0]!
    const group = GROUP_IDS_BY_TAG[sourceTag]
    if (group === undefined) return fail(`no stable group key is defined for upstream tag ${sourceTag}`)
    groups[sourceTag] = group
  }
  const entries: Array<OperationEntry> = operations.map(({ method, path, tags }) => ({
    method,
    path,
    operationId: operationIdFor(method, path),
    group: GROUP_IDS_BY_TAG[tags[0]!]!
  }))
  const operationIds = new Set(entries.map((entry) => entry.operationId))
  if (operationIds.size !== entries.length) return fail("generated operation IDs are not unique")
  return {
    sourceSha256: sourceHash,
    groups: Object.fromEntries(Object.entries(groups).sort(([left], [right]) => left.localeCompare(right))),
    operations: entries
  }
}

const readManifest = (value: unknown): OperationManifest => {
  if (!isRecord(value) || typeof value.sourceSha256 !== "string" || !isRecord(value.groups) || !Array.isArray(value.operations)) {
    return fail("operation manifest must contain sourceSha256, groups, and operations")
  }
  const groups: Record<string, string> = {}
  for (const [tag, group] of Object.entries(value.groups)) {
    if (typeof group !== "string" || !/^[a-z][A-Za-z0-9]*$/.test(group)) {
      return fail(`invalid stable group key for ${tag}`)
    }
    groups[tag] = group
  }
  const operations: Array<OperationEntry> = []
  for (const [index, entry] of value.operations.entries()) {
    if (!isRecord(entry) || !methodIsValid(entry.method) || typeof entry.path !== "string" ||
      typeof entry.operationId !== "string" || typeof entry.group !== "string") {
      return fail(`invalid operation manifest entry at index ${index}`)
    }
    operations.push({
      method: entry.method,
      path: entry.path,
      operationId: entry.operationId,
      group: entry.group
    })
  }
  return { sourceSha256: value.sourceSha256, groups, operations }
}

const validateManifest = (manifest: OperationManifest, rawSpec: Record<string, unknown>, sourceHash: string): void => {
  if (manifest.sourceSha256 !== sourceHash) return fail("operation manifest is pinned to a different raw spec checksum")
  if (manifest.operations.length !== BRIDGE_OPERATION_COUNT) {
    return fail(`operation manifest has ${manifest.operations.length} entries, expected ${BRIDGE_OPERATION_COUNT}`)
  }
  const rawOperations = listRawOperations(rawSpec)
  const byKey = new Map(manifest.operations.map((entry) => [`${entry.method} ${entry.path}`, entry]))
  if (byKey.size !== manifest.operations.length) return fail("operation manifest contains duplicate method/path entries")
  if (new Set(manifest.operations.map((entry) => entry.operationId)).size !== manifest.operations.length) {
    return fail("operation manifest contains duplicate operation IDs")
  }
  if (rawOperations.length !== byKey.size) return fail("operation manifest does not exactly cover the raw operation surface")
  for (const operation of rawOperations) {
    const key = `${operation.method} ${operation.path}`
    const entry = byKey.get(key)
    if (entry === undefined) return fail(`operation manifest is missing ${operation.method.toUpperCase()} ${operation.path}`)
    const sourceTag = operation.tags[0]
    if (sourceTag === undefined || manifest.groups[sourceTag] !== entry.group) {
      return fail(`operation manifest group mismatch for ${operation.method.toUpperCase()} ${operation.path}`)
    }
  }
  const rawTags = new Set(rawOperations.flatMap((operation) => operation.tags))
  if (rawTags.size !== Object.keys(manifest.groups).length || [...rawTags].some((tag) => manifest.groups[tag] === undefined)) {
    return fail("operation manifest groups do not exactly cover the upstream tags")
  }
  const normalizedGroups = new Set(Object.values(manifest.groups))
  if (normalizedGroups.size !== Object.values(manifest.groups).length) return fail("stable group keys must be unique")
}

const normalizeSpec = (
  patched: Schema.Json,
  manifest: OperationManifest
): Record<string, unknown> => {
  const spec: unknown = JSON.parse(JSON.stringify(patched)) as unknown
  if (!isRecord(spec) || !isRecord(spec.paths)) return fail("normalized OpenAPI document has no paths object")
  const entryByKey = new Map(manifest.operations.map((entry) => [`${entry.method} ${entry.path}`, entry]))
  let count = 0
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!isRecord(pathItem)) continue
    for (const [methodValue, operationValue] of Object.entries(pathItem)) {
      if (!methodIsValid(methodValue) || !isRecord(operationValue)) continue
      const entry = entryByKey.get(`${methodValue} ${path}`)
      if (entry === undefined) return fail(`normalized spec has no manifest entry for ${methodValue.toUpperCase()} ${path}`)
      operationValue.operationId = entry.operationId
      operationValue.tags = [entry.group]
      if (operationValue["x-hidden"] === true) {
        const summary = typeof operationValue.summary === "string" ? operationValue.summary : entry.operationId
        operationValue.summary = `[Upstream x-hidden] ${summary}`
      } else if (operationValue.deprecated === true) {
        const summary = typeof operationValue.summary === "string" ? operationValue.summary : entry.operationId
        operationValue.summary = `[Deprecated upstream] ${summary}`
      }
      count += 1
    }
  }
  if (count !== BRIDGE_OPERATION_COUNT) return fail(`normalized ${count} operations, expected ${BRIDGE_OPERATION_COUNT}`)
  if (Array.isArray(spec.tags)) {
    for (const tag of spec.tags) {
      if (!isRecord(tag) || typeof tag.name !== "string") continue
      const group = manifest.groups[tag.name]
      if (group !== undefined) tag.name = group
    }
  }
  return spec
}

const readOverlay = async (): Promise<NormalizationOverlay> => {
  const parsed = await readObject(overlayPath)
  if (!Array.isArray(parsed.patches)) return fail("normalization overlay must contain a patches array")
  if (!Array.isArray(parsed.objectSchemas)) return fail("normalization overlay must contain objectSchemas")
  const objectSchemas: Array<NormalizationOverlay["objectSchemas"][number]> = []
  const objectSchemaPointers = new Set<string>()
  for (const [index, value] of parsed.objectSchemas.entries()) {
    if (!isRecord(value) || typeof value.pointer !== "string" || !value.pointer.startsWith("/") ||
      typeof value.reason !== "string" || value.reason.trim().length === 0) {
      return fail(`invalid object schema normalization at index ${index}`)
    }
    if (objectSchemaPointers.has(value.pointer)) return fail(`duplicate object schema normalization for ${value.pointer}`)
    objectSchemaPointers.add(value.pointer)
    objectSchemas.push({ pointer: value.pointer, reason: value.reason })
  }
  if (!isRecord(parsed.propertyObjectSchemas) || typeof parsed.propertyObjectSchemas.reason !== "string" ||
    parsed.propertyObjectSchemas.reason.trim().length === 0 || !Array.isArray(parsed.propertyObjectSchemas.pointers)) {
    return fail("normalization overlay must contain propertyObjectSchemas with a reason and pointers")
  }
  const propertyObjectSchemaPointers: Array<string> = []
  const propertyObjectSchemaPointerSet = new Set<string>()
  for (const [index, pointer] of parsed.propertyObjectSchemas.pointers.entries()) {
    if (typeof pointer !== "string" || !pointer.startsWith("/")) {
      return fail(`invalid property object schema pointer at index ${index}`)
    }
    if (propertyObjectSchemaPointerSet.has(pointer)) {
      return fail(`duplicate property object schema pointer ${pointer}`)
    }
    propertyObjectSchemaPointerSet.add(pointer)
    propertyObjectSchemaPointers.push(pointer)
  }
  if (JSON.stringify(propertyObjectSchemaPointers) !== JSON.stringify([...propertyObjectSchemaPointers].sort())) {
    return fail("property object schema pointers must be sorted for deterministic review")
  }
  if (!Array.isArray(parsed.schemaVariants)) return fail("normalization overlay must contain schemaVariants")
  const schemaVariants: Array<NormalizationOverlay["schemaVariants"][number]> = []
  const inputSchemaNames = new Set<string>()
  for (const [index, value] of parsed.schemaVariants.entries()) {
    if (!isRecord(value) || typeof value.source !== "string" || typeof value.input !== "string" ||
      typeof value.reason !== "string" || value.reason.trim().length === 0 || !Array.isArray(value.requestRefs) ||
      !Array.isArray(value.inputRefOverrides)) {
      return fail(`invalid schema variant at index ${index}`)
    }
    if (inputSchemaNames.has(value.input)) return fail(`duplicate input schema variant ${value.input}`)
    inputSchemaNames.add(value.input)
    const readRequired = (name: "inputRequired" | "outputRequired"): ReadonlyArray<string> | undefined => {
      const required = value[name]
      if (required === undefined) return undefined
      if (!Array.isArray(required) || required.some((field) => typeof field !== "string")) {
        return fail(`${name} for ${value.source} must contain only property names`)
      }
      return required as Array<string>
    }
    const requestRefs: Array<string> = []
    for (const [refIndex, pointer] of value.requestRefs.entries()) {
      if (typeof pointer !== "string" || !pointer.startsWith("/")) {
        return fail(`invalid request reference pointer at ${value.source}[${refIndex}]`)
      }
      requestRefs.push(pointer)
    }
    const inputRefOverrides: Array<NormalizationOverlay["schemaVariants"][number]["inputRefOverrides"][number]> = []
    for (const [refIndex, override] of value.inputRefOverrides.entries()) {
      if (!isRecord(override) || typeof override.pointer !== "string" || !override.pointer.startsWith("/") ||
        typeof override.schema !== "string") {
        return fail(`invalid cloned reference override at ${value.source}[${refIndex}]`)
      }
      inputRefOverrides.push({ pointer: override.pointer, schema: override.schema })
    }
    schemaVariants.push({
      source: value.source,
      input: value.input,
      ...(readRequired("outputRequired") === undefined ? {} : { outputRequired: readRequired("outputRequired")! }),
      ...(readRequired("inputRequired") === undefined ? {} : { inputRequired: readRequired("inputRequired")! }),
      requestRefs,
      inputRefOverrides,
      reason: value.reason
    })
  }
  if (!Array.isArray(parsed.generatedSchemaOverrides)) {
    return fail("normalization overlay must contain generatedSchemaOverrides")
  }
  const generatedSchemaOverrides: Array<NormalizationOverlay["generatedSchemaOverrides"][number]> = []
  for (const [index, value] of parsed.generatedSchemaOverrides.entries()) {
    if (!isRecord(value) || typeof value.name !== "string" || typeof value.fromType !== "string" ||
      typeof value.type !== "string" || typeof value.fromSchema !== "string" ||
      typeof value.schema !== "string" || typeof value.reason !== "string" || value.reason.trim().length === 0) {
      return fail(`invalid generated schema override at index ${index}`)
    }
    generatedSchemaOverrides.push({
      name: value.name,
      fromType: value.fromType,
      type: value.type,
      fromSchema: value.fromSchema,
      schema: value.schema,
      reason: value.reason
    })
  }
  return {
    patches: parsed.patches,
    objectSchemas,
    propertyObjectSchemas: {
      reason: parsed.propertyObjectSchemas.reason,
      pointers: propertyObjectSchemaPointers
    },
    schemaVariants,
    generatedSchemaOverrides
  }
}

const pointerSegments = (pointer: string): ReadonlyArray<string> =>
  pointer.split("/").slice(1).map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))

const resolvePointer = (value: unknown, pointer: string, source: string): unknown => {
  let current = value
  for (const segment of pointerSegments(pointer)) {
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return fail(`${source}: pointer ${pointer} does not resolve`)
      current = current[index]
    } else if (isRecord(current) && segment in current) {
      current = current[segment]
    } else {
      return fail(`${source}: pointer ${pointer} does not resolve`)
    }
  }
  return current
}

const setPointer = (value: unknown, pointer: string, replacement: unknown, source: string): void => {
  const segments = [...pointerSegments(pointer)]
  const leaf = segments.pop()
  if (leaf === undefined) return fail(`${source}: cannot replace the document root`)
  const parentPointer = `/${segments.map((segment) => segment.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`
  const parent = segments.length === 0 ? value : resolvePointer(value, parentPointer, source)
  if (Array.isArray(parent)) {
    const index = Number(leaf)
    if (!Number.isInteger(index) || index < 0 || index >= parent.length) return fail(`${source}: pointer ${pointer} does not resolve`)
    parent[index] = replacement
  } else if (isRecord(parent) && leaf in parent) {
    parent[leaf] = replacement
  } else {
    return fail(`${source}: pointer ${pointer} does not resolve`)
  }
}

const collectPropertyObjectSchemaPointers = (
  rawSpec: unknown,
  explicitlyNormalizedPointers: ReadonlySet<string>
): ReadonlyArray<string> => {
  if (!isRecord(rawSpec) || !isRecord(rawSpec.components) || !isRecord(rawSpec.components.schemas)) {
    return fail("raw spec components.schemas must be an object")
  }
  const pointers: Array<string> = []
  const visit = (value: unknown, pointer: string): void => {
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) visit(item, `${pointer}/${index}`)
      return
    }
    if (!isRecord(value)) return
    const hasObjectFields = "properties" in value || Array.isArray(value.required)
    const isComposed = "allOf" in value || "oneOf" in value || "anyOf" in value
    if (hasObjectFields && !("type" in value) && !isComposed && !explicitlyNormalizedPointers.has(pointer)) {
      pointers.push(pointer)
    }
    for (const [key, nested] of Object.entries(value)) {
      const escapedKey = key.replace(/~/g, "~0").replace(/\//g, "~1")
      visit(nested, `${pointer}/${escapedKey}`)
    }
  }
  for (const [name, schema] of Object.entries(rawSpec.components.schemas)) {
    const escapedName = name.replace(/~/g, "~0").replace(/\//g, "~1")
    visit(schema, `/components/schemas/${escapedName}`)
  }
  return pointers.sort()
}

const applyOverlay = (rawSpec: unknown, overlay: NormalizationOverlay): Schema.Json => {
  const document = Schema.decodeUnknownSync(Schema.Json)(rawSpec)
  const explicitlyNormalizedPointers = new Set(overlay.objectSchemas.map(({ pointer }) => pointer))
  const discoveredPropertyObjectSchemaPointers = collectPropertyObjectSchemaPointers(rawSpec, explicitlyNormalizedPointers)
  if (JSON.stringify(discoveredPropertyObjectSchemaPointers) !== JSON.stringify(overlay.propertyObjectSchemas.pointers)) {
    return fail(
      `property object schema inventory changed; found ${discoveredPropertyObjectSchemaPointers.length} pointers, overlay records ${overlay.propertyObjectSchemas.pointers.length}; review openapi/normalization-overlay.json`
    )
  }
  const objectSchemaPatches = overlay.objectSchemas.flatMap(({ pointer, reason }) => [
    { op: "add" as const, path: `${pointer}/type`, value: "object", description: reason },
    { op: "add" as const, path: `${pointer}/additionalProperties`, value: true, description: reason }
  ])
  const propertyObjectSchemaPatches = overlay.propertyObjectSchemas.pointers.flatMap((pointer) => {
    const node = resolvePointer(rawSpec, pointer, "property object schema normalization")
    if (!isRecord(node)) return fail(`property object schema ${pointer} is not an object`)
    return [
      { op: "add" as const, path: `${pointer}/type`, value: "object", description: overlay.propertyObjectSchemas.reason },
      ...("additionalProperties" in node ? [] : [{
        op: "add" as const,
        path: `${pointer}/additionalProperties`,
        value: true,
        description: overlay.propertyObjectSchemas.reason
      }])
    ]
  })
  const patch = Schema.decodeUnknownSync(OpenApiPatch.JsonPatchDocument)([
    ...(overlay.patches as ReadonlyArray<unknown>),
    ...objectSchemaPatches,
    ...propertyObjectSchemaPatches
  ])
  const patched = Effect.runSync(OpenApiPatch.applyPatches([
    { source: "openapi/normalization-overlay.json", patch }
  ], document))
  const normalized = Schema.decodeUnknownSync(Schema.Json)(patched)
  const components = resolvePointer(normalized, "/components/schemas", "normalization overlay")
  if (!isRecord(components)) return fail("raw spec components.schemas must be an object")
  for (const variant of overlay.schemaVariants) {
    const sourceSchema = components[variant.source]
    if (!isRecord(sourceSchema)) return fail(`schema variant source ${variant.source} is missing or is not an object`)
    if (components[variant.input] !== undefined) return fail(`schema variant ${variant.input} already exists in the raw spec`)
    const inputSchema = structuredClone(sourceSchema)
    if (variant.outputRequired !== undefined) {
      if (!Array.isArray(sourceSchema.required)) return fail(`schema variant source ${variant.source} has no required array`)
      sourceSchema.required = [...variant.outputRequired]
    }
    if (variant.inputRequired !== undefined) inputSchema.required = [...variant.inputRequired]
    for (const override of variant.inputRefOverrides) {
      setPointer(inputSchema, override.pointer, `#/components/schemas/${override.schema}`, `${variant.input} reference override`)
    }
    components[variant.input] = inputSchema
    for (const pointer of variant.requestRefs) {
      setPointer(normalized, pointer, `#/components/schemas/${variant.input}`, `${variant.input} request reference`)
    }
  }
  return Schema.decodeUnknownSync(Schema.Json)(normalized)
}

const generateSource = (spec: Record<string, unknown>): {
  readonly output: string
  readonly warnings: ReadonlyArray<GeneratorWarning>
} => {
  const warnings: Array<GeneratorWarning> = []
  const output = Effect.runSync(Effect.gen(function*() {
    const generator = yield* OpenApiGenerator.OpenApiGenerator
    return yield* generator.generate(spec as unknown as OpenAPISpec, {
      name: "BridgeApi",
      format: "httpapi",
      onWarning: (warning) => {
        warnings.push({
          code: warning.code,
          message: warning.message,
          ...(warning.path === undefined ? {} : { path: warning.path }),
          ...(warning.method === undefined ? {} : { method: warning.method }),
          ...(warning.operationId === undefined ? {} : { operationId: warning.operationId })
        })
      }
    })
  }).pipe(Effect.provide(OpenApiGenerator.layerTransformerSchema)))
  return { output: `${output.trimEnd()}\n`, warnings }
}

const applyGeneratedSchemaOverrides = (
  output: string,
  overrides: NormalizationOverlay["generatedSchemaOverrides"]
): string => {
  let normalized = output
  for (const override of overrides) {
    const typeBefore = `export type ${override.name} = ${override.fromType}`
    const typeAfter = `export type ${override.name} = ${override.type}`
    const schemaBefore = `export const ${override.name} = ${override.fromSchema}`
    const schemaAfter = `export const ${override.name} = ${override.schema}`
    for (const [before, after] of [[typeBefore, typeAfter], [schemaBefore, schemaAfter]] as const) {
      const first = normalized.indexOf(before)
      if (first < 0 || normalized.indexOf(before, first + before.length) >= 0) {
        return fail(`generated schema override ${override.name} did not match one exact declaration`)
      }
      normalized = normalized.slice(0, first) + after + normalized.slice(first + before.length)
    }
  }
  return normalized
}

// rc.112's union encoder can select NoContent and erase supplied JSON objects when it is first.
const applyOptionalCardPayloadUnionOrder = (output: string): string => {
  const noContentFirst = /payload: \[HttpApiSchema\.NoContent,/g
  const noContentFirstCount = output.match(noContentFirst)?.length ?? 0
  if (noContentFirstCount !== OPTIONAL_CARD_PAYLOAD_UNIONS.length) {
    return fail(`expected ${OPTIONAL_CARD_PAYLOAD_UNIONS.length} optional card payload unions with NoContent first, found ${noContentFirstCount}`)
  }

  let normalized = output
  for (const { operationId, requestSchema } of OPTIONAL_CARD_PAYLOAD_UNIONS) {
    const endpoint = `HttpApiEndpoint.post("${operationId}", `
    const endpointIndex = normalized.indexOf(endpoint)
    if (endpointIndex < 0 || normalized.indexOf(endpoint, endpointIndex + endpoint.length) >= 0) {
      return fail(`optional card payload correction did not match one exact endpoint: ${operationId}`)
    }

    const lineEnd = normalized.indexOf("\n", endpointIndex)
    const before = `payload: [HttpApiSchema.NoContent, ${requestSchema}]`
    const after = `payload: [${requestSchema}, HttpApiSchema.NoContent]`
    const payloadIndex = normalized.indexOf(before, endpointIndex)
    if (payloadIndex < endpointIndex || payloadIndex + before.length > lineEnd ||
      normalized.indexOf(before) !== payloadIndex || normalized.indexOf(after) >= 0) {
      return fail(`optional card payload correction did not match one exact payload union: ${operationId}`)
    }
    normalized = normalized.slice(0, payloadIndex) + after + normalized.slice(payloadIndex + before.length)
  }

  if ((normalized.match(noContentFirst)?.length ?? 0) !== 0) {
    return fail("optional card payload correction left a NoContent-first payload union")
  }
  return normalized
}

const warningKey = (warning: GeneratorWarning): string => JSON.stringify({
  code: warning.code,
  path: warning.path ?? null,
  method: warning.method ?? null,
  operationId: warning.operationId ?? null,
  message: warning.message
})

const readWarningBaseline = async (): Promise<WarningBaseline> => {
  const parsed = await readObject(warningBaselinePath)
  if (!Array.isArray(parsed.items) || !isRecord(parsed.review)) {
    return fail("generator-warnings.json must contain items and review")
  }
  const items: Array<GeneratorWarning> = []
  for (const [index, warning] of parsed.items.entries()) {
    if (!isRecord(warning) || typeof warning.code !== "string" || typeof warning.message !== "string") {
      return fail(`invalid reviewed generator warning at index ${index}`)
    }
    items.push(warning as unknown as GeneratorWarning)
  }
  const review: Record<string, string> = {}
  for (const [code, explanation] of Object.entries(parsed.review)) {
    if (typeof explanation !== "string" || explanation.trim().length === 0) {
      return fail(`generator warning review for ${code} must explain its handling`)
    }
    review[code] = explanation
  }
  return { items, review }
}

const assertWarningsReviewed = (warnings: ReadonlyArray<GeneratorWarning>, baseline: WarningBaseline): void => {
  const expected = baseline.items.map(warningKey).sort()
  const actual = warnings.map(warningKey).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return fail(`generator warning set changed; found ${warnings.length} warnings, baseline has ${baseline.items.length}`)
  }
  const codes = new Set(warnings.map((warning) => warning.code))
  for (const code of codes) {
    if (baseline.review[code] === undefined) return fail(`generator warning code ${code} has no review rationale`)
  }
}

export const generateBridgeApi = async (): Promise<BridgeGeneration> => {
  const snapshot = await assertSourceSnapshot()
  const rawSpec = parseJson(snapshot.text, sourcePath)
  if (!isRecord(rawSpec) || !isRecord(rawSpec.components) || !isRecord(rawSpec.components.schemas)) {
    return fail("official Bridge spec is missing components.schemas")
  }
  if (!isRecord(rawSpec.paths) || Object.keys(rawSpec.paths).length !== BRIDGE_PATH_COUNT) {
    return fail(`official Bridge spec must contain ${BRIDGE_PATH_COUNT} paths`)
  }
  if (Object.keys(rawSpec.components.schemas).length !== BRIDGE_SCHEMA_COUNT) {
    return fail(`official Bridge spec must contain ${BRIDGE_SCHEMA_COUNT} component schemas`)
  }
  const manifest = readManifest(parseJson(await readFile(manifestPath, "utf8"), manifestPath))
  validateManifest(manifest, rawSpec, snapshot.hash)
  const overlay = await readOverlay()
  const patched = applyOverlay(rawSpec, overlay)
  const normalized = normalizeSpec(patched, manifest)
  const generated = generateSource(normalized)
  const schemaOverrides = applyGeneratedSchemaOverrides(generated.output, overlay.generatedSchemaOverrides)
  const payloadUnionOrder = applyOptionalCardPayloadUnionOrder(schemaOverrides)
  // The upstream generator currently leaves trailing spaces on endpoint
  // annotation lines. Normalize them here so regeneration stays deterministic
  // and the committed output passes repository whitespace checks.
  const output = `${payloadUnionOrder.replace(/[ \t]+$/gm, "").trimEnd()}\n`
  const generatedOperationCount = (output.match(/HttpApiEndpoint\.(?:get|put|post|delete|options|head|patch|trace)\(/g) ?? []).length
  if (generatedOperationCount !== BRIDGE_OPERATION_COUNT) {
    return fail(`generator emitted ${generatedOperationCount} endpoints, expected ${BRIDGE_OPERATION_COUNT}`)
  }
  return {
    sourceHash: snapshot.hash,
    operationCount: manifest.operations.length,
    generatedOperationCount,
    pathCount: Object.keys(rawSpec.paths).length,
    schemaCount: Object.keys(rawSpec.components.schemas).length,
    output,
    warnings: generated.warnings
  }
}

const bootstrapOperationManifest = async (): Promise<void> => {
  const snapshot = await assertSourceSnapshot()
  const rawSpec = parseJson(snapshot.text, sourcePath)
  if (!isRecord(rawSpec)) return fail("official Bridge spec must be an object")
  const manifest = makeOperationManifest(rawSpec, snapshot.hash)
  const output = `${JSON.stringify(manifest, null, 2)}\n`
  await writeFile(manifestPath, output)
  console.log(`Wrote ${manifest.operations.length} stable operation IDs across ${Object.keys(manifest.groups).length} groups.`)
}

const writeWarningBaseline = async (warnings: ReadonlyArray<GeneratorWarning>): Promise<void> => {
  const prior = await readWarningBaseline().catch(() => ({ items: [], review: {} }))
  const output = `${JSON.stringify({ items: warnings, review: prior.review }, null, 2)}\n`
  await writeFile(warningBaselinePath, output)
  console.log(`Recorded ${warnings.length} generator warning instances for review.`)
}

const main = async (): Promise<void> => {
  const args = new Set(process.argv.slice(2))
  if (args.has("--write-operation-manifest")) {
    await bootstrapOperationManifest()
    return
  }
  const checkOnly = args.has("--check")
  const updateWarnings = args.has("--update-warning-baseline")
  const generation = await generateBridgeApi()
  if (updateWarnings) {
    await writeWarningBaseline(generation.warnings)
  } else {
    const baseline = await readWarningBaseline()
    assertWarningsReviewed(generation.warnings, baseline)
  }
  const current = await Bun.file(generatedPath).text().catch(() => "")
  if (checkOnly) {
    if (current !== generation.output) return fail("src/generated/BridgeApi.ts is stale; run `bun run generate`")
    console.log(`Bridge API generation is current (${generation.generatedOperationCount} endpoints, ${generation.schemaCount} schemas).`)
    return
  }
  await mkdir(dirname(generatedPath), { recursive: true })
  await writeFile(generatedPath, generation.output)
  console.log(`Generated Bridge API (${generation.generatedOperationCount} endpoints, ${generation.schemaCount} schemas).`)
}

if (import.meta.main) {
  await main()
}
