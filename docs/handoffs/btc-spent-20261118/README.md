# Bitcoin spent-output detection and private scanning

## Qualification status

Implementation is committed in [PR #244](https://github.com/djshellshoxxx/GhostPay/pull/244), branch
`chatgpt/btc-spent-private-scan-20261118`. The independently reviewed source is published at
`981cc2f4395d2d76c499a5cd46387daaaa3a6b1f`, incorporating main
`58d89b39b27a66454ebf392bcd35d5c68b57b2f8`. **The PR remains a draft while the final CI matrix is pending.**
No merge into `main`, deployment, release, contract, transaction-construction, Spec18 wallet-backup/recovery or unrelated dependency change
is part of this feature. The [validation report](VALIDATION.md) records exact source identities and results.

| Current-implementation check | Recorded source | Result |
| --- | --- | --- |
| Complete Bitcoin web directory | Local `1977a500`, identical published tree at `981cc2f4` | 244 passed, 0 failed, 1 existing live-bitcoind skip; no coverage collected. |
| Worker/oracle regressions | Same local implementation | 45 passed with no skips; these are included in the complete Bitcoin selection. |
| Web TypeScript check | Same local implementation | Passed, no diagnostics. |
| Focused lint for the final two changed files | Same local implementation | Passed. |
| Full local workspace lint | Same local implementation | Failed, exit 137; five processes killed. No rule errors recorded before termination; cause unverified. |
| Pages build, artifact verification and browser | Hosted merge `d46949b9` | Clean libraries/web build and verification passed; 72 tooling tests and 16 lean/devnet browser tests passed. |
| Bitcoin regtest integration | Hosted merge `d46949b9` | All 9 steps passed. |
| CLI, Beta and Hosting compatibility | Hosted merge `d46949b9` | All workflows passed; exact repeated-platform totals and intentional skips are retained separately. |
| Core full/lean Chromium, Bitcoin/web coverage and workspace gates | Current core run `44486593963` | Pending; no completion inferred from the supplemental workflows. |

The hosted merge combines this implementation with accepted main `a36f48da`; its full source identity and
per-job checkout proofs are retained below. The PR is **not yet merge-ready** while the required core gates
remain unresolved.

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
- Require provider-authorized worker completions to retain the provider label, so malformed results cannot falsely deny an authorized disclosure.
- Enforce the 10,000-output limit even when many outputs share a tweak buffer; retain existing block/response/recovery bounds.
- Preserve reviewed-English fallback for security disclosures and the full/lean build boundary.

Every confirmed behavioral defect has a failing regression followed by a fix; the independent reviewer also found
and checked follow-up edge cases. See [the acceptance matrix](ACCEPTANCE_MATRIX.md) for initial status and scope.
The [independent review](INDEPENDENT_REVIEW.md) records eight principal findings plus follow-up edge cases,
their fixes and independently executed tests. The [changed-file map](FILE_MAP.md) maps every file to the user's
acceptance criteria. Neither source review nor authored browser tests are presented as a professional external audit.

## Latest worker-label correction

Local `1977a50010e2d72476e0de67168b4f46715aab9c` and published
`981cc2f4395d2d76c499a5cd46387daaaa3a6b1f` share tree `af61e24cb588fbf082915deac110c10cca008e70`.
A final boundary review found that the worker client rejected an unauthorized `provider` label but accepted
`local` or `unknown` after an authorized provider scan. This could falsely deny disclosure in the local-status
UI. Two regressions first make an authorized outspend request, then inject the incorrect labels. Both failed
before the one-line symmetric guard and passed afterward. All **45 worker/oracle tests across three files**
and focused ESLint pass. Independent review found no blocker in that committed fix.

This is a behavioral correction, so preceding test executions retain their preceding source pins. Fresh hosted
CI run **44486593963** is pending for head `981cc2f4`. The complete local Bitcoin directory now passes:
**244 passed, 0 failed, 1 existing live-bitcoind skip**, across all 22 files. The 118 source/configuration
records stayed unchanged; the run collected no coverage. Node 22.23.5 / Vitest 5.0.5 reported 244.92 seconds.
The documented web typecheck also passed on that source with no diagnostics in 51.085 seconds. Whole-workspace
lint attempted all 67 workspaces but exited 137: five processes were killed, including web. No rule errors were
recorded before termination; that is an unsuccessful gate, with cause unverified. Hosted qualification remains separate.
[The regression evidence](evidence/worker-consent-label-fix.json) records the exact red/green sources and results.
No unauthorized query was demonstrated by this finding; its demonstrated defect was an inaccurate result label.

Fresh hosted checks confirm integration checkout `d46949b9`: all three CLI platforms passed; Pages passed a
clean library build, web typecheck, 72 tooling tests and verification of the 16-file DEMO artifact; and Bitcoin
regtest passed all nine existing integration steps. The separate Pages browser job passed all 16 lean/devnet
tests. Beta and Hosting also passed, with explicit Hosting skips retained. All five supplemental workflows
are successful; their logs and artifacts are pinned separately in the validation report. Core full/lean
Chromium and Bitcoin/web coverage remain required current-source gates.

## Earlier qualification and typing correction

The earlier local integration commit `3f4811afbfbdd5fa2fd2fbdd9afdac86f976668a`, earlier published implementation `ef08170a83d86d194b8ce4186299e791027e461e`, and
hosted PR merge `278b1d5afcbc5056fd096ea52e34feaaeedfdb4e` share exact Git tree
`0074dde6081e45188c45feb39503c64243ef99b8`. The results below retain that original source identity.

Hosted lint then identified ten unsafe typed accesses in the worker-result validator. The correction at local
`10c3993d4d7a215c57b936ee2b1967741d247675` / published `4a878e302beac5cca52d20e17cdd756f3fbebb0d` adds only three callback type
annotations. Two independent comparisons confirm byte-identical emitted JavaScript; every runtime guard and
behavioral test remains unchanged. All 28 changed web files pass focused lint, and all 29 worker regressions
pass after the correction. The following packet commit changed documentation/evidence only; the subsequent
worker-label correction above is separately qualified.

The complete Bitcoin web directory was subsequently executed at local packet/source commit
`d593fde4bf49b28a99112579ea6c6c8d36270324`, published equivalent `2364284a2717a22b895fcb7badeb2e7ae6bb0e48`:
**242 passed, 0 failed, 1 existing live-bitcoind test skipped**, across 22 files. The run used Node 22.23.5,
the repository Vitest configuration, one worker and no test-name filter. All 118 recorded source/configuration
hashes remained unchanged. This prior-source feature selection collected no coverage and does not replace
whole-web or full/lean Chromium qualification. Exact commands, source records and logs are retained in
[the corrected-source evidence](evidence/worker-typing-fix.json).

Fresh Pages build job [135398966591](https://github.com/djshellshoxxx/GhostPay/actions/runs/44476728338/job/135398966591)
then passed at actual checkout `d169af429f2c3be6536118b280f849016292c85d`, combining head `2364284a` with main
`e454de6a`. Its log confirms the checkout. It passed a clean library build, 72 tooling tests, web typecheck,
lean build/bundle checks, secret scan and verification of the 16-file DEMO site. Its artifact is recorded in
[the fresh Pages evidence](evidence/hosted-pages.json); this establishes Pages compatibility at `d169af42`, while
the main CI matrix remains separate qualification. The fresh Pages browser job then passed all 16 tests, and
the fresh integration workflow passed all 9 Bitcoin regtest steps, both with that same checkout confirmed in
their logs. These validate lean Pages and existing Silent Payments compatibility; the full-profile Bitcoin
browser cases remain in the separate main CI matrix.

| Earlier check at tree `0074dde6081e45188c45feb39503c64243ef99b8` | Observed result |
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

The `2364284a` main CI matrix was superseded before those required jobs executed. Current-head Bitcoin/web
coverage, whole-workspace typecheck/lint/build and full/lean Chromium require their new CI executions.

The whole-web local coverage attempt at `d593fde4` ended with `SIGKILL` after 37 minutes 48.667 seconds.
Its partial log records 929 passing assertions, two TRON failures, 12 native-tool skips and 25 unexecuted
QR-classification tests after a failed-suite marker. It produced no final Vitest or coverage report; the signal
and failure causes are unverified. The separate existing no-coverage phase passed all three tests. Neither
outcome is counted as a complete web-suite pass. Full details are in [VALIDATION.md](VALIDATION.md).

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

Main first advanced to `e454de6abfefda70d82784fafc1d8949b277c334`. GitHub advertised PR merge
`d169af429f2c3be6536118b280f849016292c85d`, tree `143c2be8d3a75ed1f68ed0b3d47bd8becee49d30`. The incoming
22 files preserve Bitcoin's idle-lock and storage boundaries; independent source review found no Bitcoin
integration blocker. All 38 feature implementation/test hashes at prior head `2364284a` match that merge. This is a separately pinned
integration candidate, not the earlier tested tree; workflow checkout and results must be verified independently.

Main then advanced to `a36f48da526b818a5940a7a0ed2ae7303ef17056`, changing only two existing documentation files.
The latest advertised merge of this main with the provider-label fix is
`d46949b99709b5dae2b4edc3d8c4bb2d2ed50cac`, tree `82d54202a4d1b71c88fc05d04ebb40ad720c26f3`.
Independent review found no new compatibility blocker; all 38 feature hashes match local `1977a500` and
published `981cc2f4`. The new workflow checkouts and outcomes remain separately verified evidence.

PR #238 at `198aa5baff22272453733a0f3dcfcac0e0994eec` contains an overlapping independent
`watchOutput`/`spendStatus` implementation with automatic provider fallback. Future consolidation must explicitly
reconcile its BTC paths with this #219 continuation, preserving the explicit-consent and unknown-state rules.

Draft PR #254 at `8c1d87a2587281c32a5f1326a4f36cfada4384bc` is another continuation of #219 and overlaps 36
files, including all 13 changed Bitcoin runtime files. Its per-match `spentCheckedThrough` state and worker
authorization interface differ from this branch's `spendsFromHeight` and consent-options contract. Reviewers
must choose or deliberately reconcile these same-feature candidates; neither is a drop-in additive patch.
The independent review records the exact interface differences and the limits of that overlap inspection.

This branch does not merge general consolidation, PR #235 seller checkpoints, Spec18, other chains, browser-wide
isolation, Mythril or contract work.

Bitcoin remains in the full web profile. The lean GitHub Pages profile deliberately excludes it; lean browser
acceptance must verify absence of the BTC surface/traffic instead of activating a new deployment feature.
Overall GhostPay release readiness and external-node/device acceptance remain separate determinations.
