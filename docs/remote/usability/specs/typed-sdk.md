# Spec: typed SDK (@ghostpay/sdk)
## Requirements
- R1 `createClient({baseUrl?, fetch?, apiKey?, now?, onEvent?})`: construction does no network I/O, reads no storage, starts no timers. baseUrl must be https (http only for loopback), without credentials/query/fragment.
- R2 Invoice helpers wrap `@ghostpay/invoice-schema`: `buildInvoice`, `signInvoiceWith`, `encodeInvoiceLink` (optional pay-page baseUrl, optional encryption), `parseInvoiceLink`, immutable `invoiceBuilder`.
- R3 Strict typed errors (`SdkError` subclasses with stable `code`); messages are fixed strings and never echo input, bodies, keys or fragments.
- R4 Merchant API client (`health`, `registerInvoice`, `getInvoiceStatus`, `listPayments`): injected fetch, strict response validation (exact keys, integer strings for money, 1 MiB cap, strict JSON), local argument validation before any fetch, AbortSignal support.
- R5 React adapter via `createReactHooks(React)`; package never imports react.
- R6 ESM, `sideEffects:false`, named exports only.
## Acceptance tests
No fetch on construct/build/sign/link/parse/verify (global fetch trapped); http remote rejected; credentials in URL rejected; path-traversal nonce rejected before fetch; non-2xx hides body; fetch rejection vs abort; oversize/dup-key/extra-key/float/wrong-type responses rejected; roundtrip plain+encrypted; invalid signature refused at link time; hooks idle/loading/done, stale discard, cleanup unsubscribes.
