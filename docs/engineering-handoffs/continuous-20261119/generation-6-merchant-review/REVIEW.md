# Generation 6 independent merchant-ledger review

**Approve the exact extracted implementation `d694ce1c98056690fd104c08f80e9c7190e779e4` for focused integration. No product blocker was found.** The original zero-payment defect was independently reproduced, the correction passes the original package coverage gate, and additional independent boundary probes pass. This is an existing pure API repair, not a demonstrated lean-browser defect or whole-beta qualification.

## Source and necessity

- Repository: `djshellshoxxx/GhostPay`.
- Reviewer: fresh `merchant_review_gen6`, separate from `remaining_unique_gen5` and its implementing worktree.
- Review base: `3dc86fbc49e919e664230b63dae372ff79430fc5`; isolated branch `review/ghostpay-merchant-gen6-20261119`; ownership claim `91420f25`.
- Live main observed during review: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Live existing candidate: `d74af79ebabdc8cead843361c3497b46d8c421f9`.
- Source branch: `security/mythril-full-remediation-20261118`, observed `16c48521f99903ccd2e584df5d00a9dec5ef754c`.
- Original mixed-scope upstream commit: `6db114920589a38dbbb5d52f45bb7a52be98d9b6`. The implementation selects only its merchant-ledger change; it does not justify merging the rest of that branch.

Main and the reviewed candidate have the identical original `reconcile.ts` blob `9e8b5e310e0c445c954e43de3ad712a1a88512b2`. The fixed source is exactly upstream blob `5ca846c8e38c4a99343c2cb979f42f8f03883b8a`. Final reviewed test blob is `ee0270fc` (full identity and SHA-256 values are in [source-pins.json](evidence/source-pins.json)).

The original status expression accepted `counted + tolerance >= due`. Consequently, a nonzero invoice could become `paid` without any counted payment when absolute tolerance was at least the amount due, or relative tolerance reached 10,000 basis points. Rejected, ambiguous or late observations could leave the sum at zero and still receive the same erroneous status.

The correction additionally requires `due === 0n || counted > 0n`. This is the right quantity to inspect: accepted payment amounts are strictly parsed, nonnegative integer strings; zero rows are rejected; only observations strictly before expiry enter the sum. A positive sum therefore represents actual accepted positive payment value. The change does not reinterpret an arbitrary observation count, a late-payment list or an unmatched row as payment.

## Semantic assessment

The existing original suite explicitly requires a zero-due invoice with no payments to be settled. That is preserved. The earlier overpayment branch also retains precedence: a positive payment to a zero-due invoice is still `over` when it exceeds tolerance.

A genuine positive payment can still settle an invoice under a large configured tolerance, including after the invoice expires if the payment itself was observed before expiry. That follows the caller's tolerance policy. The patch does not add a tolerance cap or claim that a one-unit payment is sufficient under every policy.

After the corrected paid check fails, the existing current-time expiry check still selects `expired`; otherwise a zero sum selects `unmatched`. No amount parsing, invoice matching, currency comparison, duplicate ordering, expiry boundary, report field, accounting export, dependency or package configuration changes.

Within the checked repository, the only package source imports are CLI `commands/export.ts` and `run.ts`. They consume accounting export helpers/types and `LedgerError`; neither imports or calls this `reconcile` function. The browser uses a separate reconciliation implementation and has no import of this package. This limits the demonstrated current application impact; it does not make the exported pure function correct or remove the value of repairing it.

The existing reconciliation specification's R4 has overlapping shorthand for `paid` and `unmatched` when tolerance exceeds the entire invoice. A narrow clarification was requested from the implementer: state the positive counted-value requirement for nonzero invoices and preserve the zero-due exception. This documentation issue does not invalidate the reviewed guard.

## Independent execution

All checks used Node 22.23.4, npm 10.9.11, the unchanged package configuration and one Vitest worker. The checkout reused the coordinator's installed dependency graph through a `node_modules` symlink. Tests exercised this checkout's local source; unchanged invoice-schema imports resolved through the existing compiled dependency. The normal build separately rebuilt invoice-schema and merchant-ledger outputs in the review worktree.

| Check | Actual result |
| --- | --- |
| Exact final test source with unchanged product | **28 passed, 2 failed, 0 skipped** |
| Identical final test source with reviewed correction, original full coverage command | **30 passed, 0 failed, 0 skipped**, exit 0 |
| Seven independent probes with unchanged product | **2 passed, 5 failed, 0 skipped** |
| Same seven probes with correction | **7 passed, 0 failed, 0 skipped**, exit 0 |
| Original package typecheck, including temporary probes | Exit 0 |
| Original package typed lint, including temporary probes | Exit 0 |
| Normal package build, including invoice-schema prerequisite | Exit 0 |

The original full coverage result is **100% statements (175/175), 99.32% branches (147/148), 100% functions (40/40), and 100% lines (149/149)**. The existing 95/90/95/95 thresholds were not changed. The seven extra probes ran separately after the full package coverage result; no single 37-test full-suite run is claimed.

The two failures in the supplied final tests are the original oversized-tolerance regression and the additional rejected/late-observation regression. The zero-due control already passes on baseline.

The independent probes cover:

1. Empty observations at exact and above-due absolute tolerance, and at 10,000/20,000 basis points.
2. A positive amount-only observation ambiguous between two invoices, leaving neither settled.
3. A zero-value rejected first observation followed by a positive duplicate with the same ID, still leaving no counted value.
4. A unique genuine amount-only payment within tolerance, observed before expiry and reconciled at expiry.
5. An observation at the exact expiry instant, which remains uncounted under relative tolerance.
6. Zero-due settlement and overpayment precedence.
7. Large bigint amounts beyond Number precision.

The probes are preserved as [source evidence](evidence/reconcile.gen6-review.test.ts.txt); they were removed from the product test tree after execution. Product and supplied test substitutions were also restored to the review branch's original base before this evidence commit. No runtime or package-test changes are committed by this reviewer.

### Reviewer setup error retained

The first staging command used the package working directory with repository-relative paths, so it failed to copy the new test file. A subsequent command in that initial shell still ran the **27 original cases**, all passing. That run is retained as `baseline-original-control.json` and is **not** the RED reproduction. The corrected staging command verified the original product blob and final test source before the independent **28/2** baseline run. This error did not change production code or any test expectation.

[RECEIPT.json](RECEIPT.json) records commands, exits, result counts, unchanged control blobs, dependency provenance and verified raw/compressed log hashes. Complete JSON assertion reports and compressed logs remain under `evidence/`. Eight configuration/lockfile control paths are identical between the reviewed base and fix.

## Handoff and limits

Root owns publication, integration order and final combined acceptance. Preserve this repair as a focused existing-code correction; do not turn it into a feature activation, payment-policy redesign or reason to merge unrelated upstream work. If the implementation source changes, compare exact blobs and rerun affected checks before carrying forward this approval.

No remote reference, PR, workflow, fee, dependency, deployment, contract or release gate was changed. No hosted/browser/wallet result or engineering fixed point is claimed.
