# FUTURE ONLY — Universal private payment links and QR

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Make GhostPay payment requests shareable across supported wallets without a centralized invoice lookup or shortener.

## Proposed user workflow

- Recipient generates single-use invoice or reusable request with clear distinction
- Payer opens link, verifies signer and independently reviews exact amount, token, chain, fees and expiry
- QR, downloadable request file and link encode the same validated intent

## Future requirements and interfaces

- Extend the versioned `#gpi=v1.` encrypted fragment format additively; reject unknown critical fields
- Apply strict size limits, parse and signature checks; never auto-correct amount or destination
- Wallet handoff cannot alter chain, amount, recipient or fee without another approval
- Browser history, previews and QR scanning limitations are disclosed

## Privacy boundary and information that remains observable

- Invoice fragments are bearer secrets and can be stored by browsers or messaging apps
- Chain transactions remain public and the payer knows their derived destination
- Never send fragment plaintext to shortened-link services or analytics

## Future acceptance and security tests

- Round-trip independent QR/file/URL decoders; malformed and tampered payloads fail closed
- Network capture shows no fragment or plaintext invoice leakage to host/RPC
- Multiple sequential payment links and wallet retries preserve the original signed terms

## Dependencies and promotion criteria

Existing invoice schema, wallet adapter, address-safety and trusted manifest.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [payment-buttons.md](../../remote/usability/specs/payment-buttons.md)
- [review-and-pay-an-invoice.md](../../user/review-and-pay-an-invoice.md)
