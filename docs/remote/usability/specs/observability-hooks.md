# Spec: observability hooks
## Requirements
- R1 Local-only: `client.on(listener)` / `onEvent`; the SDK has no transport, no analytics, no third-party calls.
- R2 Typed `SdkEvent` union: invoice.built/signed/linked/verified/rejected, http.request/response/error. Payloads are codes, counts, booleans, route templates and durations only.
- R3 Never included: fragments, keys, memo, line items, nonces, API keys, URLs with identifiers, response bodies.
- R4 A throwing listener cannot break the SDK call or other listeners (counted via `listenerErrors()`); unsubscribe is idempotent and safe during emit.
## Acceptance tests
Events sequence for build/sign/link/verify; serialized events contain none of memo text, line-item text, `gpi=v1`, nonce; listener throw isolation; unsubscribe during emit.
