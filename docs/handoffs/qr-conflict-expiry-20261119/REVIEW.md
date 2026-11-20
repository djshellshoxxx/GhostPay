# Independent source review

Reviewer: native agent `/root/consolidation_map`, separate from the implementer. Impact review: native agent `/root/merchant_fix`.

Reviewed implementation: `5d87d845537c4042dfa5eda5f45565e18973b2dc`, tree `d047dffc5d3c3ed70a7a25b05836f4b4232dc6fe`, against `d74af79ebabdc8cead843361c3497b46d8c421f9`.

## Decision

Approved the exact source and regression delta; no introduced blocker found. Package execution gates are recorded separately in the handoff and receipts. The reviewers performed source inspection and did not claim independent test execution or external security approval.

## Findings

- Moving `#lastActivity = now` below the conflicting-body check restores the documented unchanged-state guarantee without changing accepted-chunk or identical-duplicate refresh behavior.
- Session/total mismatches and malformed/checksum-invalid input still reject before activity refresh. The existing strict expiry comparison, reset semantics, completed-transfer return and final integrity rejection are preserved.
- The regression constructs and independently parses a CRC-valid conflict, checks session/missing state, and detects the actual behavioral defect at 101 ms. It does not assert implementation details. Reset/reassembly and accepted-duplicate/exact-deadline controls are meaningful.
- The captured RED receipt/log shows 1 failed and 12 passed, exit 1, with the failure specifically the absent `SESSION_EXPIRED`. The baseline runtime blob is retained at the regression-only commit and the test blob is identical in the repaired commit.
- Only the two assembler files and additive ownership claim changed in the frozen implementation. Dependencies, configuration, workflows, thresholds and unrelated product source are unchanged. Independent `git diff --check` passed.

## Browser impact review

The unchanged `CameraImporter` catches `CHUNK_CONFLICT`, calls `resetTransfer()`, drops the assembler instance and clears visible progress before returning failure. Camera, pasted text and decoded image input all converge on this handler. The current Pay invoice and SellerKeys backup importers therefore do not retain the conflicted transfer whose deadline was refreshed.

The existing `CameraImporter.multipart.test.tsx` conflict regression constructs a CRC-valid conflicting part and checks the transfer-cleared alert, absent progress and no payload delivery. It was read, not rerun, in this review. No application exploit or corruption claim is justified by the standalone API defect.

## Scope of ownership check

Current #278 ownership records and a bounded open-PR search showed no existing claim for the two assembler files. The historical #279 claim is limited to the web multipart helper and read-only package qualification. This is not an exhaustive semantic audit of every historical branch.
