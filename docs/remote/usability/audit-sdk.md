# Audit: @ghostpay/sdk
## Threat model
Untrusted: invoice links (attacker-authored), merchant API responses (compromised/misconfigured server), listener code, baseUrl strings. Assets: signing keys, link fragment (bearer secret), API key, payer decision integrity.
## Findings and fixes
- F1 Forged `signerPinned=true` with an invalid signature could have surfaced as trusted: trust is re-derived from signature validity first (tested).
- F2 Path injection via nonce (`../`): nonce validated `^[0-9a-f]{32}$` before fetch (tested, zero fetch calls).
- F3 Error/event leakage: errors are fixed strings; events asserted not to contain memo, line items, fragment prefix or nonce; API key only in Authorization header.
- F4 Response confusion: exact-key validation, integer-string money, strict JSON (dup keys/floats rejected), 1 MiB cap, non-2xx body discarded.
- F5 Unexpected exception inside `verifyFragment` could have surfaced as a throw leaving a UI in limbo: mapped to `parsed:false`/`UNKNOWN`, never a verdict (fail closed).
- F6 Plain-http baseUrl would leak the API key: https required except loopback; credentials/query/fragment refused.
- F7 Lint found method-style React types (unbound-method); switched to function properties.
## Honest limits
- `ok:true` means no known problem, not a safe seller; seller identity depends on the caller's pinning source.
- Expiry uses the caller's clock; a wrong payer clock changes the verdict (documented, advisory per ADR-0003).
- Test-mode constants are duplicated from sandbox (dependency rule); drift is guarded only by review.
- The JSON Schema cannot express curve-point, NFC or code-point rules; `validateInvoice` stays authoritative.
- Merchant API server is not implemented here (OpenAPI is documentation); the OpenAPI file is checked by string assertions, not a validator, as no new deps are allowed.
- React hooks tested against a hand-written hook runtime, not real React. `AbortSignal` cancellation relies on the injected fetch honouring it.
- Coverage: 99.6% statements / 97.8% branches; thresholds unchanged.
