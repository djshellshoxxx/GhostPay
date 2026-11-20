# Generation 5: zero-payment merchant-ledger tolerance repair

**A confirmed existing library defect is fixed and passes its original package gates. Independent generation 6 review is separate.** This is a focused follow-up to the currently qualifying Pages candidate, not a claim that a browser payment path was repaired.

## Necessity and provenance

Candidate `3dc86fbc49e919e664230b63dae372ff79430fc5` and observed main `c977b5d6723f6822c3b5d86cd6b231712c53c395` contain the same reconciliation source blob `9e8b5e310e0c445c954e43de3ad712a1a88512b2`. A nonzero invoice with no counted payment was reported as `paid` when the caller's absolute or percentage tolerance covered its amount. Rejected, zero, wrong-currency or late observations could not contribute value, but an oversized tolerance still produced that settled status. Downstream callers could therefore receive a misleading accounting status; no unauthorized fund transfer or current Pages exposure is established.

The missing fix was already present in mixed-scope upstream commit `6db114920589a38dbbb5d52f45bb7a52be98d9b6`, authored by Claude, retained on `security/mythril-full-remediation-20261118` at `16c48521f99903ccd2e584df5d00a9dec5ef754c`. This lane selectively recovers its exact production guard and original regression, retaining attribution, without importing its other workflow, dependency, audit or policy changes.

The fixed production blob `5ca846c8e38c4a99343c2cb979f42f8f03883b8a` is byte-identical to that upstream implementation. The added condition requires a positive counted amount before tolerance can settle a nonzero invoice. Zero-due invoices retain the existing settled result. Expired unpaid invoices report `expired`; unexpired unpaid invoices report `unmatched`. Accepted positive payments retain the existing tolerance behavior.

## Commit and source sequence

- `265265fd`: isolated ownership claim.
- `59120724`: unchanged upstream regression, with old production source retained for RED execution.
- `0d72fc86`: explicit zero-due and rejected/late-observation boundaries.
- `d694ce1c98056690fd104c08f80e9c7190e779e4`: exact production guard extraction with original author/provenance.
- `13bb06ef67e2088a5b8f1e074a05c3aee5a1a2f2`: narrow R4 status-precedence clarification suggested by the independent reviewer. Product/test sources remain unchanged.

## Executed evidence

| Check | Actual result |
| --- | --- |
| Original upstream regression with unchanged candidate runtime | 27 passed, 1 failed, 0 skipped; failure expected `unmatched`, received `paid` |
| Added boundary tests with unchanged runtime | 28 passed, 2 failed, 0 skipped; zero-due control already passed |
| Original full package coverage on repaired runtime | 30 passed, 0 failed, 0 skipped |
| Coverage | Statements 100% (175/175); branches 99.32% (147/148); functions 100% (40/40); lines 100% (149/149) |
| Original typecheck, lint and build | Exit 0 each; build includes the invoice-schema prerequisite |

Node 22.23.4/npm 10.9.11 and the root's pinned installed dependencies were reused through a `node_modules` symlink. Original Vitest configuration and coverage thresholds (95/90/95/95) were unchanged; one worker bounded resources. The package's existing app currency-table check actually ran, with no skipped test. Logs, source hashes and complete commands are in [RECEIPT.json](RECEIPT.json). A preparatory Git path error did not modify source and was corrected before the production commit.

## Consumer and scope assessment

The repository's only declared dependent package is `@ghostpay/cli`. Its command imports accounting export helpers and types; its top-level error handler imports `LedgerError`. No production caller of this exported `reconcile` function was found. The static web application has its own reconciliation implementation and imports neither this package nor this function. Tests exercise the public library API directly. No UI feature, transaction, fee, cryptography, dependency, workflow, deployment or release policy is changed.

## Handoff

Branch: `fix/ghostpay-ledger-zero-payment-20261119`. Worktree: `/workspace/scratch/0a7bc3583588/GhostPay-ledger-zero-payment`. Root owns separate focused publication and integration; the broad generation 5 branch matrix is on another documentation-only branch. Fresh reviewer `merchant_review_gen6` independently reproduces the behavior and verifies the exact final source. Do not combine this result with the already running PR #278 source or infer its hosted acceptance.
