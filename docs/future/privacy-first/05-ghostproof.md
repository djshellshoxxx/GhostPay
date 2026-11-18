# FUTURE ONLY — GhostProof: selective-disclosure payment evidence

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Allow independently verifiable evidence for chosen payments without exposing view/spend keys or the rest of a recipient's history.

## Proposed user workflow

- Issuer selects finalized payments and optionally individual invoice fields
- UI previews audience, fields, expiry, challenges and disclosure implications
- Verifier checks cryptography offline and optionally chain facts using their own RPC

## Future requirements and interfaces

- Build on the existing independent proof design; do not invent a new scheme without acceptance and external review
- Version and domain separate proofs; bind chain, asset, transaction, recipient control and verifier challenge
- Distinguish proof of observed payment from proof of invoice settlement or fiat receipt
- No proof registry, mandatory verifier account or full-history view-key export

## Privacy boundary and information that remains observable

- Receipt files can be redistributed by anyone who possesses them unless recipient-encrypted
- Public chain data in a proof is inherently disclosed
- Issuer-selected disclosures do not prove completeness of financial history

## Future acceptance and security tests

- Fake ownership, wrong chain, tampered amount, challenge replay and missing finality rejected
- Offline verifier makes zero network calls; optional RPC is labeled
- Independent cryptographic vectors and third-party review before activation

## Dependencies and promotion criteria

Confirmed transaction proof, receipt signing and external cryptographic review.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [07-selective-disclosure-receipts.md](../../specs/ideas/07-selective-disclosure-receipts.md)
- [receipts.md](../../remote/usability/specs/receipts.md)
