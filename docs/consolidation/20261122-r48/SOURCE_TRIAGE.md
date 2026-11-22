# GhostPay R48 — immutable-source donor recovery triage
Checked UTC: 2026-11-22T21:08:47.653Z. Main `eb59d93cffed7848c4aac37d0e9650b87239c6da`; owned recovery PR #372 exact source `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`. No application commit or main merge.

## Scope and method

Compared the historic head SHA of 13 branch donors to PR #372 with GitHub's immutable commit comparison and then read complete recursive Git trees (`truncated:false`). Compared complete blob-path identities and blob SHAs, not Github's 300-file compare output. All 13 are ancestors of #372; **ancestry does not prove the latest tree still contains every donor file or behavior**. In fact, ten of the 13 have 3–14 files present in the historical donor but absent from #372. Those ten remain unresolved, including recovered Mythril and privacy-test donors.

## Four finalized *branch dispositions*, not production completion

| Branch @ SHA | Evidentiary result | Disposition |
| --- | --- | --- |
| `audit/ct-c-2-fee-event-forensics-20261121` @ `4bfaffa5d44f70e86cd63a026a6d919e95cc1d2b` | Main comparison 2 commits ahead, 0 behind, exactly two changed paths: `packages/confidential-contracts/test/fee-log.forensics.test.ts` plus handoff; PR #442 explicitly says diagnostic only and **DO NOT MERGE** | Diagnostic/audit only; does not resolve #414 privacy evidence |
| `feature/ghostpay-invoice-file-completion-20261120` @ `7de737b5c8c5fc02086ba0030d78c181d239590c` | Owned #372 descends by 686 commits with 0 behind; all 3,996 donor blob paths remain present in #372; 7 browser-relevant blobs identical and 20 modified after donor | In owned, **unmerged** recovery stack; pending later behavior, browser and security gates |
| `integration/ghostpay-idle-session-20261120-r2` @ `f5e04a30bd538b5dba6202885c8e1c3cceb31fa3` | Owned #372 descends by 566 commits with 0 behind; all 4,084 donor blob paths remain; 38 browser-relevant blobs identical and 33 modified after donor | In owned, **unmerged** recovery stack; pending later behavior, browser and security gates |
| `chatgpt/ghostpay-idle-lifecycle-qualified-20261119` @ `d5fe06e7a7b383da1726c4d38165c824e996b9db` | Owned #372 descends by 752 commits with 0 behind; all 3,906 donor blob paths remain; 3 browser-relevant blobs identical and 27 modified after donor | In owned, **unmerged** recovery stack; pending later behavior, browser and security gates |

For the invoice-file donor, the exact `PaymentRequestDownload.tsx`, `PaymentRequestDownload.test.tsx`, `PaymentRequestFileInput.tsx`, `PaymentRequestFileInput.test.tsx`, `requestFileInterop.test.ts` and `payment-request-file.spec.ts` blobs still match #372. More recent changes to `CreateInvoice.tsx`, locale catalogs and i18n contracts require owner qualification. For idle-session donors, `idle-session.spec.ts` and selected exact source/test blobs remain, while `AppShell.tsx`, receipt and privacy-related code changed downstream. No exact functional equivalence is implied.

These four donor *dispositions* are final for this snapshot. Mainline integration of the three runtime features remains **open**, owned by PR #372, and must not be counted as a main merge or release.

## Ten ancestors requiring further semantic/source review

Historical `chatgpt/ghostpay-idle-lifecycle-20261119` has 3 donor-only paths including `apps/relayer/src/privacy.test.ts` and unwired Mythril disposition tooling. `codex/ghostpay-private-scan-lint-20261119`, `codex/ghostpay-export-authorization-20261119` and `repair/ghostpay-native-fee-recovered-20261119` have 11 donor-only paths each, including CLI/relayer regression tests and `ReturnBombStealth.sol` mock. `repair/ghostpay-analyzer-recovered-20261119`, `repair/ghostpay-final-lint-20261119`, `repair/ghostpay-qr-surrogates-20261119`, `work/ghostpay-required-v1-candidate-20261120`, `snapshot/ghostpay-privacy-8be15289-20261120` and `work/ghostpay-required-v11-candidate-20261120` each have 14 donor-only paths, including `packages/contracts/scripts/capture-mythril-evidence.py` and `scripts/tests/mythril-completeness.test.mjs`. The donor-only paths may be valuable but are **not merged or safe to import wholesale**; #372 owns recovery and native security qualification. Prior finding on #372: https://github.com/djshellshoxxx/GhostPay/pull/372#issuecomment-7084942885. Tests absent from a descendant do not prove regressions by themselves; inspect each test against the current requirements before proposing a focused addition.

## Verification, ownership and live gates

- Complete branch pagination: `100/100/100/100/100/49/0` = 549. Independent SHA-bearing `GET /git/matching-refs/heads/`: 549 exact matches, zero mismatches.
- Open PR pagination: `100/100/41/0` = 241, with 94 stacked. Two new BUG-only PRs #481 (main target) and #482 (stacked) preserve existing owners.
- Finalized classifications: 303 → 307. New branches: +2. 549 total → **242 unresolved** semantic branch dispositions. 13 ancestry reviews do **not** mean 13 resolved cases.
- Independently read non-main `refs/heads/automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`: **held**, generation 11, owner `994a0d214fb9-root-r3`. Lease timestamp has expired but expiry alone **never** grants takeover. No mutation.
- PR #372 hosted exact-head checks: CI, Pages, Beta, Integration, CLI and Hosting kit passed; **Tor static hosting** and **Contract analysis** failed. The stacked Tor correction #436 does not automatically qualify parent. No independent approval or full native/browser security qualification.
- BUG-only PR #480 CI is still failed at exact head `9bc3013e36bd0d245b54cbc5367d225ea4e6668d`; do not modify owner's source.
- Protection endpoint returns 403 (integration permission), so enforcement cannot be verified here.
- No local Git checkout could run: `git ls-remote` failed DNS resolution for github.com. Source inspection used connected authenticated GitHub API; no fresh local Vitest/TS/lint/build/Playwright results are asserted.

Next independent work: investigate source-level donor-only tests against the latest owned recovery head, prioritize failure-coverage gaps in Mythril and export/privacy paths, coordinate with #372 owner before any integration, and continue uncapped comparisons of the remaining 242 unresolved histories. Retain the 59 historically capped donor obligation until individually classified; do not erase it based on structural ancestor counts.
