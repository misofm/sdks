# Bridge client in a Cloudflare Worker

Bind `BRIDGE_API_KEY` as a Worker secret and optionally set `BRIDGE_ENVIRONMENT`
to `sandbox` or `production`. This handler reads the binding and constructs its
Bridge layer inside each invocation. It forwards the incoming request signal to
the Effect runner and never logs the key or upstream error body.

For a local integration smoke, the handler also accepts an optional
`BRIDGE_API_BASE_URL` binding. Point it only at a controlled test server; the
example does not derive a Bridge host from the incoming request.

The example exposes `GET /customers`; its Bridge request uses the currently
configured environment and requires an active credential at runtime. For a
real local-runtime check, build the package and run this from the monorepo root:

```sh
bun run --filter @misofm/bridge build
bun run --filter @misofm/bridge test:workerd
```

That command uses Wrangler 4.137.0, pinned as a package development dependency,
to run the handler in local workerd. It supplies a synthetic key and a temporary
local mock Bridge server, then checks the upstream method, path, key, and
successful response. It makes no request to Bridge's hosted API, requires no
Cloudflare account, and never deploys. The packed-consumer check separately
compiles and runs the Worker in Node with mocked Fetch; that check does not
exercise workerd.

To check the deployable bundle, run
`bunx --no-install wrangler deploy --dry-run --minify` from this directory. It
bundles locally and does not deploy.

The `wrangler.jsonc` documents the optional environment variable; the secret is
bound outside the file. For interactive local development, put
`BRIDGE_API_KEY=...` in an untracked `.dev.vars` file. Bind a deployed secret
through the target Worker environment's secret manager; never commit a key.
