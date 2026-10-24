# GhostPay lean release scope

**Status: owner-approved working boundary, 2026-10-24 UTC.** Documentation only; not release acceptance, an audit, or permission to enable payments or use production funds. Application baseline: `main` at `a6a2a1c5cbccb7d97c36decba78a99fa83e8a6f8`; recheck the live ref.

## One EVM path first

Close one buildable, verified local/test invoice → pay → detect/receipt → sweep → backup/restore path:
- Create, sign and open an invoice with exact chain, asset, destination, amount, fee, expiry and privacy disclosure.
- Preview the payment and wallet request; require explicit consent and preserve cancellation.
- Detect and reconcile payment; bind proof/receipt to the invoice and chain. Preserve finality/reorg and honest unknown/late-outcome behavior.
- Sweep through the reviewed direct or relayed path with nonce/outcome checks.
- Preserve key separation, encrypted backup, fresh-profile restore with the source retained, lock and stale-session/fail-closed behavior.

Select no beta network by assumption. Verify exact-head registry, chain/asset, contract availability, deployment, trust roots and release configuration first. If prerequisites are unavailable or unverified, keep payment unavailable and remain local-only, or explicitly label verified test-network dependencies. No production funds.

## Retain everything; narrow what is qualified

| Area | Lean disposition |
|---|---|
| The EVM invoice/payment/detection/receipt/sweep/key-recovery path | `beta-core` candidate, not certified done; existing core findings and acceptance gates remain open until dispositioned. |
| Tag archive/import/rotation and combined backup panel | `later-preserved`; archive-import findings gate beta only if reachable or required by a shipped dependency. Otherwise prove exclusion before deferring. |
| Bitcoin, Solana, TRON and additional network support | `later-preserved`; not included in the one-EVM support claim without separate qualification. |
| Fiat/oracles, invoice buffer-policy v2, merchant embedding/profiles, escrow, PIR/private pools, policy accounts/EIP-7702 and other extensions | `later-preserved`; separate decisions, dependencies and acceptance required. |
| Unresolved core acceptance, trust/configuration and security/recovery evidence | `blocked` until verified and reviewed. Deferred paths become `excluded-with-proof` only when source/artifact reachability evidence exists. |

This is a release boundary, not repository cleanup. No code has been isolated, disabled or removed by this document. Isolating deferred code from a future artifact is separate implementation work: prove it cannot affect the supported core, or exclude it from that artifact. Keep code, branches, specs, tests, research, provenance and history. Count duplicate capabilities once without discarding independent evidence or blindly combining implementations. Prototypes remain unqualified.

## Acceptance and next milestone

1. Follow [restart instructions](RESTART.md); verify the live source and configuration.
2. Obtain the owner-supplied private review packet before detailed core reproductions. Reproduce and disposition assigned expiry, recovery/session-lifecycle and scan-consistency cases on the exact source; unrun cases are not closed by earlier green CI.
3. Demonstrate each core flow with fake/local/test assets, including refusal, interrupted/repeated operations, recovery and honest unknown outcomes.
4. Run the existing full checks without lowering KDF, coverage, fuzz, resource, expiry or security gates. Preserve the full test matrix and [historical session evidence](SESSION_STATUS.md).
5. Require independent review of the exact supported build/flow. Deeper audit and stress/recovery review remain mandatory; no existing prerelease gate is waived. Production use additionally needs explicit owner, legal, security and network approval plus verified deployment/signing.

Do not make generic relayer auto-retry/fallback, multi-chain expansion or optional features the next task before this core milestone. Do not claim audited, production-ready, deployed, anonymous/unlinkable, real-money safe or all-chain support.
