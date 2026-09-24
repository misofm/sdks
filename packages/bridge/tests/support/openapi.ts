export type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "head" | "options"

export type OpenApiRecord = Record<string, unknown>

export interface OperationEntry {
  readonly method: HttpMethod
  readonly path: string
  readonly pathItem: OpenApiRecord
  readonly operation: OpenApiRecord
}

export interface ParameterEntry {
  readonly location: string
  readonly name: string
  readonly required: boolean
}

export const httpMethods: ReadonlyArray<HttpMethod> = ["get", "post", "put", "patch", "delete", "head", "options"]

export const isRecord = (value: unknown): value is OpenApiRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const asRecord = (value: unknown): OpenApiRecord => {
  if (!isRecord(value)) throw new Error("Expected an OpenAPI object")
  return value
}

export const asArray = (value: unknown): ReadonlyArray<unknown> => {
  if (!Array.isArray(value)) throw new Error("Expected an OpenAPI array")
  return value
}

export const resolveLocalRef = (root: unknown, value: unknown): unknown => {
  let current = value
  const seen = new Set<string>()
  while (isRecord(current) && typeof current.$ref === "string") {
    const ref = current.$ref
    if (!ref.startsWith("#/")) throw new Error(`Unexpected non-local OpenAPI reference: ${ref}`)
    if (seen.has(ref)) throw new Error(`Circular OpenAPI reference: ${ref}`)
    seen.add(ref)
    const segments = ref.slice(2).split("/").map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
    current = segments.reduce<unknown>((cursor, segment) => isRecord(cursor) ? cursor[segment] : undefined, root)
  }
  return current
}

export const listOperations = (spec: unknown): ReadonlyArray<OperationEntry> => {
  const paths = asRecord(asRecord(spec).paths)
  const operations: Array<OperationEntry> = []
  for (const [path, pathItemValue] of Object.entries(paths)) {
    const pathItem = asRecord(pathItemValue)
    for (const method of httpMethods) {
      const operation = pathItem[method]
      if (operation !== undefined) operations.push({ method, path, pathItem, operation: asRecord(operation) })
    }
  }
  return operations
}

export const getParameters = (root: unknown, pathItem: OpenApiRecord, operation: OpenApiRecord): ReadonlyArray<ParameterEntry> => {
  const byIdentity = new Map<string, ParameterEntry>()
  for (const parameterValue of [...asArray(pathItem.parameters ?? []), ...asArray(operation.parameters ?? [])]) {
    const parameter = asRecord(resolveLocalRef(root, parameterValue))
    const location = typeof parameter.in === "string" ? parameter.in : ""
    const name = typeof parameter.name === "string" ? parameter.name : ""
    if (location.length === 0 || name.length === 0) throw new Error("OpenAPI parameter needs a name and location")
    byIdentity.set(`${location}:${name}`, {
      location,
      name,
      required: parameter.required === true
    })
  }
  return [...byIdentity.values()].sort((left, right) =>
    left.location.localeCompare(right.location) || left.name.localeCompare(right.name)
  )
}

export const responseMediaTypes = (root: unknown, value: unknown): ReadonlyArray<string> => {
  const response = asRecord(resolveLocalRef(root, value))
  if (response.content === undefined) return []
  return Object.keys(asRecord(response.content)).sort()
}
