# Spec: invoice verification API
## Requirements
- R1 `verifyInvoice(parsed, {nowSeconds, expectedChainId?, mode?})` is pure and synchronous: no network, no clock, no randomness. `verifyFragment(fragment, opts)` parses then verifies and never throws on bad input (`parsed:false` + code, no verdict).
- R2 Verdict: `ok`, `signature`, `trust` (invalid-signature | valid-signature | trusted-seller), `mayShowVerifiedSeller`, `expired`, `quoteExpired`, `secondsRemaining`, `test`, ordered `warnings[{code,severity}]`, `blockers`.
- R3 Blockers: invalid-signature, invoice-expired (exclusive at expiresAt), chain-mismatch, test-invoice-in-live-mode (default mode live), live-invoice-in-test-mode (mode test). Warnings: quote-expired, expires-soon (<300 s), unpinned-signer, test-chain-without-marker, unencrypted-private-part (info).
- R4 Trust derives from signature validity first: a forged `signerPinned` on an invalid signature yields `invalid-signature`.
- R5 `test` is true only with reserved chain id (31337-31399) AND the TEST memo marker.
## Acceptance tests
Matrix in `verify.test.ts`: unpinned/pinned/wrong pin; forged pin; expiry at -1/0 s; quote expiry; expires-soon at 300/299; chain mismatch; test/live x live/test/any; stripped marker; marker on live chain; bad clock values; tampered/garbage fragments; UNKNOWN mapping.
