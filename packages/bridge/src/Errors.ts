import * as Schema from "effect/Schema"

export class BridgeConfigurationError extends Schema.TaggedError<BridgeConfigurationError>()(
	"BridgeConfigurationError",
	{ field: Schema.Literals(["configuration", "apiKey", "baseUrl", "timeoutMs"]) }
) {}

export class BridgeHttpError extends Schema.TaggedError<BridgeHttpError>()("BridgeHttpError", {
	status: Schema.Number,
	method: Schema.String,
	requestId: Schema.optionalKey(Schema.String)
}) {}

export class BridgeTransportError extends Schema.TaggedError<BridgeTransportError>()("BridgeTransportError", {
	kind: Schema.Literals(["TransportError", "InvalidUrlError", "EncodeError", "DecodeError", "EmptyBodyError", "Unknown"]),
	method: Schema.optionalKey(Schema.String)
}) {}

export class BridgeSchemaError extends Schema.TaggedError<BridgeSchemaError>()("BridgeSchemaError", {
	phase: Schema.Literals(["request", "response"]),
	status: Schema.optionalKey(Schema.Number),
	method: Schema.optionalKey(Schema.String),
	requestId: Schema.optionalKey(Schema.String)
}) {}

export class BridgeTimeoutError extends Schema.TaggedError<BridgeTimeoutError>()("BridgeTimeoutError", {
	timeoutMs: Schema.Number
}) {}

export type BridgeClientError = BridgeHttpError | BridgeTransportError | BridgeSchemaError | BridgeTimeoutError
