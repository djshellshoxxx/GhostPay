# Bitcoin spent-output detection and private scanning

## Qualification status

Implementation is committed in [PR #244](https://github.com/djshellshoxxx/GhostPay/pull/244), branch
`chatgpt/btc-spent-private-scan-20261118`. The independently reviewed source is published at
`4a878e302beac5cca52d20e17cdd756f3fbebb0d`, incorporating main
`58d89b39b27a66454ebf392bcd35d5c68b57b2f8`. **The PR remains a draft while the final CI matrix is pending.**
No merge into `main`, deployment, release, contract, transaction-construction, recovery or unrelated dependency change
is part of this feature. The [validation report](VALIDATION.md) records exact source identities and results.

Source inputs: initial main `dfc75ef2087fa6463ae59e0818abec01796c578d` and the unchanged implementation of
[PR #219](https://github.com/djshellshoxxx/GhostPay/pull/219), head
`9617e8572f9bc414410bd937b0e7718d0c5bd55c`. Original #219 CI passed at that original head; those passes do not
qualify this continuation. The original commit is preserved in this branch's ancestry.

## Implemented corrections

- Preserve local `getSpends` extraction, source wrappers and the `local | provider | unknown` result contract.
- Derive coinbase identity and consumed outpoints from committed transaction data; reject contradictory provider metadata.
- Track compatible continuous local input coverage in encrypted Bitcoin state; legacy, partial and unwatched historical
  discoveries remain unknown. Unknown results stay visible but cannot be selected for a sweep.
- Preserve the earliest canonical spend proof, reject replayed confirmed outpoints, and remove orphaned evidence on rollback.
- Retain a coverage-tip hash for resumed results, invalidate results after forks or incomplete header refreshes, and clear stale counts.
- Enforce explicit outpoint consent at both worker and main-thread transport boundaries; light-only proof requests have a separate gate.
- Require explicit provider consent before light-mode scanning. Revocation cancels the worker, closes transport and clears results.
- Reject late header/worker results after wallet, source, network, mode or lock changes; validate results against the active request and headers.
- Enforce the 10,000-output limit even when many outputs share a tweak buffer; retain existing block/response/recovery bounds.
- Preserve reviewed-English fallback for security disclosures and the full/lean build boundary.

Every confirmed behavioral defect has a failing regression followed by a fix; the independent reviewer also found
and checked follow-up edge cases. See [the acceptance matrix](ACCEPTANCE_MATRIX.md) for initial status and scope.
The [independent review](INDEPENDENT_REVIEW.md) records seven principal findings plus follow-up edge cases,
their fixes and independently executed tests. The [changed-file map](FILE_MAP.md) maps every file to the user's
acceptance criteria. Neither source review nor authored browser tests are presented as a professional external audit.

## Observed qualification and final correction

The earlier local integration commit `3f4811afbfbdd5fa2fd2fbdd9afdac86f976668a`, earlier published implementation `ef08170a83d86d194b8ce4186299e791027e461e`, and
hosted PR merge `278b1d5afcbc5056fd096ea52e34feaaeedfdb4e` share exact Git tree
`0074dde6081e45188c45feb39503c64243ef99b8`. The results below retain that original source identity.

Hosted lint then identified ten unsafe typed accesses in the worker-result validator. The correction at local
`10c3993d4d7a215c57b936ee2b1967741d247675` / published `4a878e302beac5cca52d20e17cdd756f3fbebb0d` adds only three callback type
annotations. Two independent comparisons confirm byte-identical emitted JavaScript; every runtime guard and
behavioral test remains unchanged. All 28 changed web files pass focused lint, and all 29 worker regressions
pass after the correction. Fresh full qualification is requested for the corrected candidate. Packet changes
after that source commit are documentation/evidence only.

| Check on that combined source | Result |
| --- | --- |
| Secrets, catalog completeness and translation-key extraction | Passed; no missing keys or catalog errors. |
| Pages tooling | 72 passed locally and hosted; 0 failed/skipped. |
| Network egress checks | 23 passed locally; 0 failed/skipped. |
| Hosted clean libraries, Pages web typecheck/build/bundle scan/site verification | Passed; verified 16-file DEMO site. |
| Pages Chromium against local anvil | 16 passed. This is lean compatibility evidence. |
| Bitcoin regtest integration | All 9 Bitcoin steps passed; existing integration workflow passed. |
| Beta acceptance, CLI operator qualification, hosting kit | Hosted workflows passed. |
| Local Node22 whole Bitcoin package | 566 passed, 1 existing large-header stress timeout, 0 skipped; coverage was not emitted. Package lint and typecheck passed. |
| Earlier whole-workspace typecheck / lean Chromium | Passed / 71 passed and 5 intentional skips. |
| Earlier whole-workspace lint | Ten callback-typing diagnostics; corrected as described above. |
| Corrected-candidate Bitcoin/web coverage, whole-workspace typecheck/lint/build and full/lean Chromium | Fresh qualification pending in the existing CI matrix. |

Independent source-review selections separately passed 119 tests in 12 files. Earlier Esplora, header,
scanner/state and UI regressions and all unsuccessful local attempts are retained with their original pins in
the validation report; they are not renamed as final combined-source passes. Local Chromium could not launch
because socket creation was denied. The original test deadlines and coverage thresholds remain unchanged.

The full profile's new browser cases cover default local privacy, opt-in/revocation, unknown legacy records,
fresh rescanning, later spending and repeated encrypted reload. The lean case verifies that Bitcoin remains
absent. Full-profile Bitcoin runtime cases still require successful execution in the corrected candidate's hosted job.
The earlier lean run executed and passed the new Bitcoin-exclusion case.

## User-visible evidence semantics

| Status | Meaning | Sweep selection |
| --- | --- | --- |
| `local` | Applicable confirmed-block inputs cover the output through the latest tip known to the scan; no optional outpoint query | Available only while the complete checked-header coverage still matches |
| `provider` | Explicitly authorized server report for candidate outpoints | Available subject to existing header/review gates; the report remains unproven |
| `unknown` | Partial range, legacy gap, newly rediscovered unwatched history, or invalidated coverage | Disabled until refreshed |

Local scanning does not detect all mempool spends and cannot establish that a provider supplied the globally best
chain. A broadcast can still be refused. One authorized provider check does not manufacture local historical
coverage. The [Bitcoin guide](../../user/bitcoin-silent-payments.md) explains resumption, fresh local rescans,
provider disclosure and reorganization behavior.

## Integration boundary

PR #238 at `198aa5baff22272453733a0f3dcfcac0e0994eec` contains an overlapping independent
`watchOutput`/`spendStatus` implementation with automatic provider fallback. Future consolidation must explicitly
reconcile its BTC paths with this #219 continuation, preserving the explicit-consent and unknown-state rules.
This branch does not merge general consolidation, PR #235 seller checkpoints, Spec18, other chains, browser-wide
isolation, Mythril or contract work.

Bitcoin remains in the full web profile. The lean GitHub Pages profile deliberately excludes it; lean browser
acceptance must verify absence of the BTC surface/traffic instead of activating a new deployment feature.
Overall GhostPay release readiness and external-node/device acceptance remain separate determinations.
