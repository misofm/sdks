# Bridge OpenAPI inputs

`bridge-2026-09-23.json` is the unmodified official Bridge OpenAPI document
retrieved from:

<https://withbridge-image1-sv-usw2-monorail-openapi.s3.amazonaws.com/latest.json>

- Retrieved: 2026-09-23
- SHA-256: `e8aee6cee1b5518d81f384c8b718dd9d9154dd9eb55345ff73d8b8dbe88327f2`
- OpenAPI: 3.0.2
- Paths: 100
- Operations: 134
- Component schemas: 263

`operation-manifest.json` supplies stable `operationId` values and concise
client group keys because the source document does not define any operation IDs.
The group keys map the upstream tag names to lower-camel-case properties on the
generated `HttpApiClient`.

`normalization-overlay.json` records narrow corrections needed to preserve the
published contracts through rc.112 generation. It references the existing
`DeveloperFees` response schema where `POST /developer/fees` has an example but
no schema, supplies implied object types for composed models, and makes four
card-account request bodies' OpenAPI-default `required: false` explicit. It
also records the following contract-specific normalizations:

- The pinned spec has 123 non-composed component-schema nodes with `properties`
  or `required` but no `type: object`; 9 were already covered by explicit
  overlay entries. The overlay lists the remaining 114 JSON Pointers, and the
  generator checks that list against the raw snapshot before applying it. Each
  correction adds only `type: object` and, when omitted, the OpenAPI-default
  `additionalProperties: true`. Required fields, enums, nullability, and
  composition stay as published. This prevents these models from accepting
  primitive JSON values while keeping object fields open.

- The shared bank-account components mark input and output fields with
  `writeOnly`/`readOnly` but require both directions at once. The overlay keeps
  output-required fields on the original components, creates request variants
  with writable required fields, and retargets only create-request references.
  The fee-account create schema is similarly copied from the US response
  variant and points to the request-side bank contract.
- The fee-account schema lists `customer_id` and an undeclared `account_name`
  as required even though its published success example omits both. The
  response overlay keeps the declared fields but does not synthesize missing
  required properties.
- Card-account responses allow the `bridge` freeze initiator, while the shared
  freeze request enum remains restricted to `customer` and `developer`.
- Webhook event payloads are resource-specific JSON objects, so their
  `event_object` and `event_object_changes` maps remain open JSON values rather
  than impossible records with `never` values.
- Customer endorsement requirements publish `missing` and `issues` objects
  without `additionalProperties`; successful examples show `missing` as both
  `null` and an `all_of` breakdown, while the `issues` description specifies
  field-to-string issue-code maps. The overlay preserves the observed null
  alternative, keeps non-null missing values JSON-compatible, and types
  issue-code values as strings. `CardProgramSummary` similarly omits map value
  schemas despite examples: country counts are integers and country transaction
  volumes are decimal strings, so the overlay records those per-map types.
- The published successful business-customer example has `last_name: null` and
  a structured `endorsements[].requirements.complete` entry alongside strings;
  both successful `GET /customers` examples omit `count`. These response-side
  discrepancies are modeled narrowly: `Customer.last_name` is nullable, the
  completed-requirement object has exactly `associated_person` and string-array
  `items`, and only the list response's integer `count` is optional. Create and
  update payload schemas remain separate and unchanged.
- The six `VirtualAccountSourceDepositInstructions` alternatives use `allOf`
  object compositions whose roots omit `type: object`. The shared bank fields
  and rail-specific branches also rely on OpenAPI's default-open
  `additionalProperties` behavior. The overlay makes those exact roots and
  branches explicit for the pinned generator. `VirtualAccountResponse` also
  omits its implied object type, and the deactivate operation wraps it in
  another untyped `allOf` response with an example-only `status` property;
  normalizing the response and branch keeps the inherited response fields and
  the existing activation-status enum typed.
- A nullable liquidation fee-percent schema has a string-only example; rc.112
  copies that example to its null union branch, causing a TypeScript error.
  The overlay removes only that ambiguous example metadata and keeps the
  original numeric-string constraints and nullability.

Two generated PDF body schemas also receive exact, guarded
string-to-`Uint8Array` corrections because `HttpApiSchema.asUint8Array` requires
bytes on the encoded side. Each generated override must match one exact
generator declaration or generation fails. All adjustments are applied in
memory; the raw snapshot and operation manifest remain byte-pinned and
unchanged.

Generation applies the overlay and manifest in memory. The raw snapshot remains
unchanged and the generated output is reproducible offline with the pinned
development toolchain.

The generator also reverses the payload schema order for those four optional
card-account POST operations. In rc.112, encoding their generated union with
`HttpApiSchema.NoContent` first can turn a supplied JSON object into
`undefined`; putting that operation's request schema first preserves the body
while retaining the no-content alternative. This guarded output correction
changes neither the public request type nor the pinned OpenAPI inputs.
