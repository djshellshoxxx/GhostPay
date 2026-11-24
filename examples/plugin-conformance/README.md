# Offline plugin reference host

This small test host imports the compiled plugin API, registers only reviewed static fixture functions and uses one shared in-memory storage port. It makes no network requests and handles no funds or secrets.

Run from the workspace root on Node >=22:

```sh
npm ci --ignore-scripts
npm run build -w @ghostpay/plugin-api
node --test examples/plugin-conformance/conformance.test.mjs
```

The executable assertions cover grant intersection, revocation after hook completion, privacy downgrade acknowledgement, concurrent hook evaluations sharing a quota/index, and required-plugin failure. Package tests additionally inject delayed host calls, revocation, partial writes and corrupt indexes. See the [port/lifetime contract](../../packages/plugin-api/README.md) before adapting this example.

There is no persistent storage here and no multi-process atomicity claim. A production host must supply and qualify those separately. Same-realm capability checks and Promise timeouts do not isolate arbitrary code or stop CPU-bound loops.
