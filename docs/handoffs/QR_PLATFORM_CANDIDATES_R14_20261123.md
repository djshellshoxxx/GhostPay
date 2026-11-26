# GhostPay GP-BUG R14 — Native QR candidate selection

Date: 2026-11-23. Strict bug-only: Pages/local QR image decoding, no deployment, funds, contracts, protocol, new dependencies or feature additions.

## Source and task ownership

- Exact observed live `main` at selection: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
- Isolated branch: `automation/20261123T1121Z/bug/qr-reader-platform-candidates-r14`, based directly on that main commit.
- Claimed paths: `packages/qr-exchange/src/readers.ts`, new `packages/qr-exchange/src/readers.platform-candidates.test.ts`, additive `docs/ai/ACTIVE_WORK.md` entry, and this handoff.
- Claim commit: `8c520aa82c54ddd4ad72c7303a97db15842bb437`.
- Failing regression committed **before production change**: `435034fe89eebc35a0d08dc642b2c9ffe9672897`.
- Production repair commit: `82a8331566ecceca950ffa38c237ef45e4844b41`.
- Production source blob before: `caea9b8a3bbfeb9e626814e5db3882e22e568921`; after: `48bdaf66f4a9194d025e184890d3b0fed6fc6fa4`.

## Observed defect and minimal correction

`decodeQrImage()` receives a list of BarcodeDetector results but reads only `found[0]?.rawValue`. If the first detection has empty decoded text or a result longer than `MAX_SCAN_TEXT_LEN = 4096`, it returns `null` even if the second detection has a usable QR payload. This is a false negative for existing multi-code camera image decoding. The native image is decoded but the desired QR text is silently discarded.

The minimal correction, confined to the platform-detector branch of `readers.ts`, scans results in their original order, returning the first text that passes existing `boundedText`. If detections exist but none is usable, it still returns `null` (rather than changing fallback behavior); if the detector finds none, the existing jsQR fallback remains. Image cleanup and abort handling are unchanged.

## Red/green evidence and execution limits

The exact GitHub source blobs above were fetched from the base and repaired branch. A source-extracted V8 reproduction executed the native-detector selection block with an injected BarcodeDetector (not complete source/module execution). Results:

| Case | Before | After |
| --- | --- | --- |
| First detection empty; second usable | null (incorrect) | valid-second-qr |
| First detection longer than 4096; second usable | null (incorrect) | valid-second-qr |
| First and second usable | first | first |
| All detections unusable | null | null |
| No native detections | jsQR fallback path | same |

The standalone block executes the selected GitHub source logic with a TypeScript declaration stripped and an injected stub for helpers; it is **not** full repository Vitest, typecheck, lint, build, browser execution or an independent review. The dedicated four-case Vitest regression is committed but was not run locally because native git checkout cannot resolve `github.com`. Use hosted GitHub CI on exact PR head to verify the real package.

## Coordination and pending merge gates

- `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md` and live `docs/ai/ACTIVE_WORK.md` were consulted; the latter had no reader-file ownership claim before this additive entry.
- The live PR search returned 262 open PR numbers at preflight. Actual changed-file audits of broad owners (#238, #246, #248–254, #261–262, #264, #270, #278, #294, #302, #307, #310, #365, #372, #390, #504) did not show `readers.ts`; the large #504 integration PR lists 353 changed paths and likewise does not include it. Additional recent PR paths were inspected. **Not all 262 changed-file inventories were exhaustively retrieved**. Recheck full ownership before merge. In particular #294/#302/#307 own `assembler.ts`, which this branch does not touch.
- PR #390 current head `b655bc273a6704c9c140287b8adcdf4085b91882`: five exact-head Actions workflows completed successfully, 39 check-runs completed with no failures (four skipped), Snyk success, zero submitted GitHub reviews, GitHub mergeable false. No owner branch mutation or conflict workaround attempted.
- Integration metadata ref `automation/ghostpay-integration-lock` at `082e754f44944ebb4be283f89176b966bf8f7b4f`, generation 12, status `released`, **not acquired** by this worker.
- **DRAFT / not qualified to merge.** Pending all exact-head Actions/security checks GREEN, applicable actual browser coverage, independently submitted review, current main/branch/reviewer/dependency reconciliation, complete open-PR changed-file preflight and legitimate integration-lease ownership. PR creation and hosted outcomes can be appended as PR comments; never rewrite source-pinned historical observations.
- No main merge, owner-branch update, lock takeover, real-world attack, contract/fund action, release or deployment.
