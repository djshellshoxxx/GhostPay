# BUG-ONLY — uppercase confusable local handle diagnostic

Date: 2026-11-25 UTC (November 24 Pacific). Base main: `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`. Branch: `automation/20261125T0120Z/bug/ux-links-handle-confusable-case`.

## Reproduction and root cause

The documented existing checkHandle diagnostic distinguishes mapped confusable characters from other non-ASCII input. Its map stores lowercase characters but looks up the original character. Synthetic uppercase Cyrillic A (U+0410), Greek Omicron (U+039F) and Greek Rho (U+03A1) are rejected as NON_ASCII; their mapped lowercase counterparts are rejected as CONFUSABLE_NON_ASCII. The fix lowercases the character for that existing map lookup only. The rejection policy, ASCII canonicalization and reserved/skeleton behavior are unchanged. No acceptance bypass or demonstrated Pages reachability or funds impact.

## Exact provenance

- Ownership claim: `77d369950703e99ae84a520717c842409df629b4`.
- Regression-only commit: `299f6ca87969df0d028a48b5244c3191fb83622e`.
- Minimal production fix: `6e61caec093b7dcf46481ea5863cca14d724fe90`.
- Original source blob: `c325f1ee544da5f9f75ac7bc400b961deee63033`.
- Repaired source blob: `65dde2f5ebf53ff35993af77e2c6f1d4e63afa49`.
- Regression test blob: `21f1a9b3d846d9cfa9c4891a0d6a181c2919264b`.

All three unique source/test blob hashes recomputed using Git's UTF-8 blob framing and SHA-1; hashes matched. Regression-first execution of the actual committed test bodies with imports and TypeScript syntax removed, V8 assertion shims: baseline 1/3 test bodies passed (2 failed), repaired 3/3 passed (9 assertions). Eighteen additional neighboring classification cases passed. The two failure bodies short-circuit at their first failed assertion on the baseline. A separate nine-input original/repaired probe confirmed all three uppercase variants, lowercase counterparts and controls. This is not native Vitest, full repository or browser testing. Native Node 22.16.0 is available, but git ls-remote failed DNS resolution of github.com; no full checkout/test run claimed.

## Coordination and remaining gates

All 246 discovered open PR changed-file inventories inspected (date-partitioned search; failed #302 request successfully retried); existing handle.test.ts is touched by #224/#238/#262/#264/#278/#372 and was preserved. No production or new-regression file owner found. Full main ACTIVE_WORK registry checked. Generation-20 integration lease released (metadata commit `4fe0656517a03cb7a39d4e248187c76ffaa3238a`); not acquired. No other branch modified. One sequential implementation worker; no separate independent verifier available. Keep draft until exact-head required hosted CI, applicable native browser checks, independent review, ownership/dependency recheck and legitimate integration lease are satisfied. No deployment, contracts, live payment activity, dependency changes or main merge.

PR #390 rechecked: closed/merged at `377c0216d451f1576f199ec0223aafadd9243002`; original PR head `b655bc273a6704c9c140287b8adcdf4085b91882`: five workflow runs successful, 32 successful jobs, three skipped, Snyk success, no submitted independent reviews. No additional repair to that closed branch authorized or required by current evidence. PR #631 remains blocked by the unrelated hosted web-test failure; #595 remains unmerged with four successful workflows. PR #633 remains draft with five successful workflows.
