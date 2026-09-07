# @misofm/utils

Shared exact scalar, canonical encoding, and Effect boundaries for Miso SDKs.

```ts
import { asU64 } from "@misofm/utils/numeric";
import { walrusBlobIdFromU256 } from "@misofm/utils/encoding";
import { Effect } from "effect";
import { tryPromise, runPromise } from "@misofm/utils/effect";

const id = walrusBlobIdFromU256(asU64("id", "123"));
const request = tryPromise("getExample", (signal) => fetch("https://example.com", { signal }));
const response = await runPromise(request);
```

Numeric strings must be canonical unsigned decimal, and numbers must be safe
integers. The legacy `walrusU256` adapter accepts BigInt-compatible strings.
Blob IDs use exactly 32 little-endian bytes and canonical unpadded base64url.
Encoding uses the Mysten BCS primitives also exported by `@mysten/sui/utils`.

The `/effect` entry point requires exactly `effect@4.0.0-rc.112`. `trySync` and
`tryPromise` suspend foreign leaves and return a typed `SdkError` containing an
operation name and original cause. Compose leaves with `Effect.gen`, or use
`workflow` when the generator also invokes throwing codecs and validation; run once
at the public Promise boundary using `runPromise`, which restores original
rejection values for compatibility. Pass the supplied AbortSignal to foreign
I/O. Cancellation of unabortable I/O still requires an explicit joining policy
in the owning SDK. No helper retries operations.

Use `toPromise(operationEffect)` to define a Promise compatibility API while
preserving its labeled arguments and result type. Generic operations should
retain explicit generic adapters when inference cannot preserve their contract.

The root, `/numeric`, and `/encoding` entry points do not import Effect or Node
modules. SDK-specific policies belong to their owning SDK.
