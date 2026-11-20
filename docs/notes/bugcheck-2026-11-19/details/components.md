> Review-chunk evidence. The consolidated [coverage](../COVERAGE.md) and [validation](../VALIDATION.md) are authoritative for final completion and executed checks. References to scratch tests identify the original local runs; retained evidence is indexed in [evidence](../evidence/INDEX.md).

# Component and localization bugcheck

Reviewed complete production TypeScript/TSX component and localization logic on main `c977b5d6723f6822c3b5d86cd6b231712c53c395` and candidate `e22c1748a3de6eb02f5be3abe27d634b238c67c6`. The JSON companion records every path and blob. Data catalog checks are distinct from a native-language translation review.

## COMP-OPEN-01 — Regenerated receipts inherit an earlier receipt's archive success

**Severity: Medium. Status: confirmed, open on main and the latest candidate.** The privacy snapshot `137628961463fc5abd8b7927b2efe6b18a0a206a` contains the same receipt component blob as the candidate.

- Candidate source: [`ReceiptPanel.tsx` at e22](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/components/ReceiptPanel.tsx), lines 105–114, 128–138, 195–197, 210–225 and 319–320.
- Main source: [`ReceiptPanel.tsx` at c977](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/components/ReceiptPanel.tsx), same lifecycle logic, lines 102–111, 125–135, 192–194 and 207–222.

**Ordinary user path:** Validate an invoice against a verified scan, sign receipt A, and archive it. In the same panel, choose **Clear invoice binding**, validate the invoice again, then sign receipt B later. B has a distinct signature. The panel nevertheless says **Receipt archived** and disables its archive button although the archive has only received A.

**Cause:** `archive` is reset for a changed scan match or seller, but neither `invalidateInvoice()` nor `createReceipt()` resets it when the signed receipt changes. The archive completion token also survives those transitions, so a delayed archive completion for A can falsely mark B archived.

**Verification:** A scratch Vitest check uses a real signed invoice, real receipt signing and `profile="lean"`; only the local encrypted-vault writer is mocked. It verifies different A/B signatures, one archive call holding A, then fails the desired assertion because the disabled **Receipt archived** button remains for B. Test: `components-qa/receipt-regeneration.test.tsx`; output: `components-qa/receipt-regeneration.log`. This is benign local correctness testing; it uses no network or real payment.

**Fix direction:** Tie archive success and pending completion to an exact receipt signature or immutable receipt identity. Reset archive state and invalidate its completion token whenever the invoice binding or receipt changes. Add both completed-first and delayed-first archive regressions. A completed write of A must remain recorded without being attributed to B.

## Existing main defects whose corrections are present in the candidate

### COMP-FIXED-01 — Stale manifest during same-chain invoice replacement

Main `Disclosure.tsx:13–34` retains a manifest keyed only by chain ID. A transition A → no parsed chain → A can reuse the old manifest while the new load is pending. Candidate `Disclosure.tsx:13–38` binds it to the exact chain/services scope, preventing a provisional preflight with the old result. Candidate `Disclosure.manifest.test.tsx` covers this correction. No separate new implementation is needed; preserve the correction during consolidation.

### COMP-FIXED-02 — Hidden-page local QR imports are not cancelled on main

Main `CameraImporter.tsx:120–146` checks component enablement and disclosure visibility but not page visibility. Its hide handler stops camera work only. A pending pasted/image import can therefore finish after the page is hidden. Candidate adds page-visibility checks, aborts paste/image work on hide and checks immediately before delivery. Candidate `CameraImporter.visibility.test.tsx` covers the correction. Preserve this existing fix during consolidation.

## Additional verification

- Main: all 4 shipped catalogs parse; all 2,253 source keys are classified exactly once as security-sensitive or neutral; 9,012 catalog messages parse without errors.
- Candidate: all 4 shipped catalogs parse; all 2,520 source keys are classified exactly once; 10,080 catalog messages parse without errors.
- Existing candidate component and localization tests were launched with `../../node_modules/.bin/vitest run src/components src/i18n --coverage.enabled=false --maxWorkers=2`. Final audit outcome: **INCOMPLETE**. The [retained log](../evidence/components-existing-latest.log.txt) contains no completed suite summary, and no completed exit status was obtained. This is not a pass; see [validation](../VALIDATION.md). The separately completed receipt regression and catalog checks remain distinct evidence.
- New export/recovery components, invoice signer verification, archive/ledger behavior, QR rendering, printing, clipboard UI and localization logic were read. No additional confirmed open defect was established in this assignment.
- No product source or remote repository state was modified. The coordinator's completed privacy-variant review is recorded separately in the [branch-variant ledger](../review-ledgers/root-branch-variants-audit.json) and [findings index](../FINDINGS.md).
