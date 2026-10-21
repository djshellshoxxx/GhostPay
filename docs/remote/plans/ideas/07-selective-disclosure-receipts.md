# Plan: 07 selective-disclosure receipts and auditor pack (idea B6)

Spec: `docs/specs/ideas/07-selective-disclosure-receipts.md`. Branch `claude/remote-extensions-3`, 2026-10-21. Estimates are single-engineer days, unverified guesses. Roles: CORE = packages/core-crypto, RC = new `packages/receipts`, WEB = apps/web, CA = chain-adapters, DOC = docs/ADR.

## Preconditions
- Spec 02 landed or at least its `DetectedPayment` (txHash, logIndex, blockNumber, finality) and verified-amount rules, because issuing needs the tx hash and Tier 1 reuses the payment verification.
- Spec 01 for pinned announcer/router; spec 09 token allowlist.
- ADR-0021 (draft): "Per-payment shared-secret disclosure with DLEQ and stealth-key attestation; no view-key export." Must cover grades, the M' fabrication boundary, and the rejected items. DOC, 1.5 d.

## Milestones
| M | Work | Owner | Days | Exit gate |
|---|---|---|---|---|
| M0 | ADR-0021; privacy-limits wording draft | DOC | 1.5 | ADR merged |
| M1 | core-crypto: `sharedSecretPoint`, `proveSharedSecret`, `verifySharedSecret`, `stealthFromSharedSecret`; KATs `receipt-001..`; counting-RNG nonce test; cross-check with independent implementation | CORE | 3 | Vectors reproduced by second implementation; never-throws property test |
| M2 | `receipts` package: types, strict codec, `receiptHash`, typed-data builder, `verifyReceiptOffline`, pack verify and CSV (injection-safe) | RC | 3 | Forgery matrix tests (spec s9) all pass |
| M3 | Tier 1 chain verification: tx receipt, Announcement log decode via `validateAnnouncementLog`, router/Transfer cross-check, native "consistent with", reorg/finality, two-RPC cross-check | CA, RC | 3 | Anvil e2e: real router payment green; spoof/no-transfer/native cases correct |
| M4 | Issuer UI: Create receipt dialog, reveals checklist generated from the object, single-receipt QR/file, pack builder from tags/filters, finality gating, tx-hash lookup | WEB | 3 | Playwright: checklist equals file contents; secrets-absent privacy regression |
| M5 | Verifier page (`verifier.html` + `/verify`): Tier 0 offline, Tier 1 with user RPC, pin inputs, challenge generator, verified-vs-attested layout, mandatory "not proven" list, print/CSV | WEB | 3 | Offline run works with network blocked; egress test passes |
| M6 | Watch-only integration: `receipt-attest` action in the spec-06 protocol and signer UI (after spec 06 M3) | WEB, SP | 2 | Offline-signed receipt verifies same as local |
| M7 | Docs: user guide for sellers and auditors, privacy-limits additions, threat-model entries (bearer receipt, wash payments, no completeness) | DOC | 1.5 | Reviewed against spec s7-s9 |
| M8 | Self-review and audit prep (spec s17 checklist) | all | 2 | Findings logged in `docs/reviews/` |
| P2 | (Phase 2, separate PR) payer proofs: `deriveStealthPaymentWithEphemeral`, `.gpproof` download in pay flow, payer receipt build/verify | CORE, WEB | 4 | Payer proof never verifies as payee proof and vice versa |
Total about 22 d for phase 1 including docs (spec estimates 15 d of engineering plus docs and integration), phase 2 +4 d.

## Order
M0 -> M1 -> M2 -> (M3, M4 in parallel) -> M5 -> M7 -> M8; M6 after spec 06 M3; P2 last.

## Test gates (each PR)
Unit with KATs; property/fuzz for parsers and verifier; anvil e2e; Playwright; egress/bundle scan; lint. Crypto PRs (M1) need a second reviewer before merge.

## Risks
| Risk | Mitigation |
|---|---|
| Users read a receipt as proof of identity, completeness or funds | Verified/attested split, fixed "not proven" panel, docs, default `control` grade only |
| Receipts forwarded to others (bearer) | Audience, expiry, challenge mode; stated plainly; no revocation |
| DLEQ implementation bug or nonce reuse leaking the view key | KATs, second implementation, counting-RNG test, audit of M1 before M4 ships |
| Tx hash lookup leaks interest to RPC | Documented; user's own RPC option; reuse scanning RPC |
| Native payments cannot be log-verified | Reported as "consistent with" only |
| Pressure to add "export view key" | ADR rejects; documented migrate-and-disclose procedure only |

## Rollback / flags
Additive feature behind flag `receipts`; no change to existing storage or contracts. Verifier is a separate page; removal is deletion.

## Definition of done
Spec s15 all ticked; audit checklist s17 ticked or tracked; ADR-0021 merged; user and privacy docs published.
