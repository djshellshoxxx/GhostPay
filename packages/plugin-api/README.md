# Plugin API

Statically bundled, reviewed plugin hooks receive the intersection of manifest requests and host grants. Registration order does not affect evaluation order. See the [spec](../../docs/remote/usability/specs/plugin-api.md) and the [offline reference host](../../examples/plugin-conformance/README.md).

## Storage and lifetime contract

Use **one shared `StoragePort` object for each backing store in one JavaScript realm**. Mutations for a plugin namespace are serialized across contexts and registries using that port. Different plugin namespaces remain independent. Multiple wrappers over the same store, other processes/realms, and direct external writers require host-level serialization covering the whole operation; the simple port interface has no transaction primitive. This package does not establish cross-process quotas or database atomicity.

Host methods must settle only after their reads/effects finish. Keys and bounded unique indexes are validated; a new index entry is reserved before writing its value, and a value is deleted before its reservation is removed. A failed/partial write can therefore leave a conservative reservation. Retry the same key or delete it through a fresh context. Do not delete/rebuild a corrupt index independently while retaining old values: that could undercount the store. Host administrators must recover both consistently. A store that lies about completion, loses committed data or alters indexes is outside the port guarantee.

Reads and mutations check revocation after awaited host work. Queued mutations cannot begin after revocation; a late read cannot deliver its result. A write, delete or network request already handed to the host may still commit; rejection after revocation cannot undo it. Plugins and hosts must treat such effects as potentially applied. Index-before-value ordering intentionally retains conservative reservations in this case.

Contexts are frozen and revoked on hook completion/timeout. They are capability discipline, **not CPU/memory isolation**. Same-realm plugins can reach globals, and a Promise timeout cannot stop a synchronous infinite loop. Do not load untrusted remote code or describe this package as an arbitrary-code sandbox.

## Qualification

From the workspace root:

```sh
npm ci --ignore-scripts
npm run build -w @ghostpay/plugin-api
npm run typecheck -w @ghostpay/plugin-api
npm run lint -w @ghostpay/plugin-api
npm test -w @ghostpay/plugin-api
node --test examples/plugin-conformance/conformance.test.mjs
```

The tests exercise capability intersection, deterministic evaluation, required-plugin failure, explicit privacy downgrade acknowledgement, delayed/queued revocation, partial failures, corrupt indexes and shared-port quota concurrency. The reference host is offline and in memory; it does not qualify durable storage or application integration.
