# UNQUALIFIED spec 02 recovery checkpoint — 2026-11-16

This is an inert partial backup following loss of the execution environment. It is not a completed feature, an integration candidate, a review approval, or a passing combined-head test report. PR #179 and all production source paths are untouched by this recovery branch.

Recovery branch: `codex/recovery-spec02-unqualified-20261116`, created from `b4be8866f6ff883fbbedc49be88b5b251a7d270e`.
Original worktree: `/workspace/scratch/340e310ace86/ghostpay-invoice-totals`.
Original branch: `codex/ghostpay-invoice-amount-reporting-20261116`, based on `b4da65f03dddac9d06b230aeb94ee49544b1db11`. No local commit was created for the new feature.

## Exact material preserved

| Recovery file | Provenance and status |
| --- | --- |
| `reconciliation-amounts.ts.txt` | Exact contents from the successfully applied initial add-file tool input for `packages/ux-vault/src/reconciliation-amounts.ts`. Contains the known review finding below. Saved as text so it is not built or exported. |
| `reconciliation-amounts.test.ts.txt` | Exact contents from the successfully applied initial add-file tool input for `packages/ux-vault/src/reconciliation-amounts.test.ts`. This is the initial 15-test suite, including 300 seeded bigint/property cases. |
| `UNCONFIRMED-conflict-fix.apply-patch.txt` | Exact final submitted apply_patch input. Its application was never confirmed: the tool cell stalled when the environment became unavailable and was terminated. It includes helper, test and registry-integration changes. The registry hunk depends on earlier UI changes that are NOT preserved here. This text is not a claim that the correction is applied or tested. |

These files were copied from original tool inputs still present in the worker's context, not reconstructed from a summary. Original absolute patch paths are deliberately retained in the unconfirmed patch record; inspect and adapt them before any future application.

## Intended behavior and independent review finding

The intended feature compares exact bigint totals of explicit seller invoice annotations with a registered invoice's expected net amount. Labels are below/equal/above, with a distinct observation count and a possible-duplicate-payment review prompt. It does not infer mismatched-amount links or claim current settlement. Only live router observations verified as final when scanned, with matching seller/chain/asset identity, can count. Pending, claimed, imported and reorg-invalidated observations are excluded.

Independent reviewer `security_notes` found a blocking robustness gap in the initial helper: conflict checks run after invoice/asset filtering. Contradictory copies of the same transaction/log with different assets or invoice annotations can therefore be filtered away and yield reassuring totals separately. Do not ship the initial helper.

The unconfirmed correction validates and deduplicates the full eligible seller/chain scope before invoice/asset aggregation, includes asset and optional annotation in event facts, rejects contradictions as unavailable, excludes imported/invalidated copies before conflict registration, and memoizes immutable indexed totals for all registrations. Additional regressions cover asset/invoice disagreement across valid record identities, missing annotations, and immutable snapshot behavior. The reviewer approved this correction at design level only; applied-source review and test results remain unavailable.

## Verification actually observed before outage

- Initial helper/test pair: `NODE_OPTIONS=--max-old-space-size=384 ../../node_modules/.bin/vitest run src/reconciliation-amounts.test.ts --maxWorkers=1` in `packages/ux-vault`: 15/15 tests passed, including 300 seeded property cases. This does not verify the later correction or this remote recovery base.
- Initial `git diff --check`: passed before the last changes; no final diff check completed.
- Locale checker after local catalog changes: 4 catalogs, 0 errors, 154 warnings. Those catalog changes are not backed up here.
- Focused web test attempts for `InvoicePaymentSummary.test.tsx`, `ReconciliationLedger.invoices.test.tsx`, and `securityKeys.test.ts`: two attempts exited 137 before results. Neither is a pass.
- Final correction/test tool call: no completion result. Application and test execution are unconfirmed.
- No final typecheck, lint, build, browser acceptance, coverage or applied-source review passed for this feature.

## Material NOT backed up by this checkpoint

The following local changes had not been committed and their complete resulting files are not included here:

- `packages/ux-vault/src/portable.ts` export addition (`export * from './reconciliation-amounts.js';`).
- `apps/web/src/components/InvoicePaymentSummary.tsx` and `InvoicePaymentSummary.test.tsx`.
- Initial registry integration in `apps/web/src/components/ReconciliationLedger.tsx` and manual-partials regression in `ReconciliationLedger.invoices.test.tsx`.
- `apps/web/locales/en.json`, `es.json`, `ja.json`, `ar.json` and `apps/web/src/i18n/securityKeys.ts` additions.
- `docs/ai/ACTIVE_WORK.md` ownership entry.
- Local amendments to `docs/specs/01-manifest-readback.md`, `docs/specs/02-scanner-robustness-and-payment-verification.md`, `docs/adr/ADR-0026-local-reconciliation-and-receipt-archive.md`, and `docs/handoffs/GHOSTPAY_SPEC_STATUS_2026-11-16.md`.

The final patch record includes a registry hunk but is not a substitute for the missing initial UI changes. The original local worktree may become available again; inspect it before rebuilding missing pieces. Do not infer a complete candidate from this backup.

## Resume requirements

1. Inspect actual remote and local heads and recover the original worktree if possible; preserve unrelated work.
2. Restore the exact initial helper/test into a new isolated worktree only as a starting point, then resolve the documented review finding. Verify the unconfirmed patch against actual source before applying anything.
3. Restore or deliberately reimplement missing UI/catalog/export changes with the stated evidence boundaries. Register owned paths before edits.
4. Run regression tests for the original conflict cases, corrected scope-wide deduplication, bigint precision, provenance/finality exclusion, no implicit linking, and manual partial links. Run changed-package/web typecheck, lint, catalog checks and applicable build/browser acceptance.
5. Obtain independent applied-source review and fresh combined-head qualification before integration. Keep this recovery branch explicitly unqualified until those steps succeed.

Spec 01 remains incomplete independently of this backup: no reviewed canonical announcer runtime hash/artifact provenance was available for a mandatory browser pin. Existing fresh readbacks were preserved; no ten-minute cache was added. Do not label all specifications met.
