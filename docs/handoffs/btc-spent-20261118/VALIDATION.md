# Bitcoin spentness validation

This report distinguishes final combined-source qualification from earlier defect reproductions and
independent review selections. A passed earlier test does not qualify changed implementation.
Qualification is still running; the final disposition belongs in the packet README and PR #244.

## Exact source identity

| Item | Value |
| --- | --- |
| Repository / PR | `djshellshoxxx/GhostPay` / [#244](https://github.com/djshellshoxxx/GhostPay/pull/244) |
| Published branch | `chatgpt/btc-spent-private-scan-20261118` |
| Original #219 input | `9617e8572f9bc414410bd937b0e7718d0c5bd55c` |
| Initial main | `dfc75ef2087fa6463ae59e0818abec01796c578d` |
| Integrated main | `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` |
| Reviewed local integration | `3f4811afbfbdd5fa2fd2fbdd9afdac86f976668a` |
| Reviewed published integration | `ef08170a83d86d194b8ce4186299e791027e461e` |
| Hosted PR test merge for that integration | `278b1d5afcbc5056fd096ea52e34feaaeedfdb4e` |
| Identical Git tree of those three commits | `0074dde6081e45188c45feb39503c64243ef99b8` |

Shell Git lacked push credentials. The authenticated repository connector transported each logical commit,
verifying each uploaded blob and completed tree against local Git. It preserved the original #219 commit in
ancestry, and advanced only the task branch, with an expected-head lease and no force push. The hosted test
merge tree was checked independently through GitHub's Git API. Commit IDs differ because transport and merge
metadata differ; the implementation trees above are identical.

The only conflict while integrating current main was the shared ownership registry. Both claims were retained.
Independent review confirmed that incoming release-hash and shared-transport changes do not replace Bitcoin's
own fetch/worker boundaries. Later packet edits are documentation/evidence only and must retain an empty
implementation diff against the qualified source.

## Corrected candidate and final qualification

Hosted whole-workspace lint failed at the reviewed integration with ten diagnostics in
`apps/web/src/features/btc/scanWorkerClient.ts`. Three explicit callback parameter types restore the intended
validated element types after `Array.isArray` narrowing. Local correction:
`10c3993d4d7a215c57b936ee2b1967741d247675`; published equivalent:
`4a878e302beac5cca52d20e17cdd756f3fbebb0d`; identical tree:
`6506216897d158f8fa31813dd1e69cf6739df920`.

The implementer reproduced all ten errors before changing the file. Afterward, all 28 changed web/e2e/security-key
files passed default scoped ESLint, and unchanged worker suites passed 29 tests (20 client/protocol and 9 source
bridge), with zero skips. TypeScript5.9.3 ES2022/ESNext output is byte-identical before/after:10,176 bytes,
SHA-256 `7d6dd13f1bd0e28209ad0667695045a3a6373d98810a5f9a20caeec572e4d853`. The independent reviewer reproduced
that equality and confirmed every runtime predicate remains intact. [Exact evidence](evidence/worker-typing-fix.json)
retains source hashes, red/green lint and the worker results.

Earlier CI results below remain attributed to their original merge commit. They are not relabelled as executions
at the corrected head. Fresh required checks will run on the corrected candidate plus its documentation packet;
the PR records the current head and final check status. No rules, coverage thresholds, test inputs or timeouts changed.

## Toolchains

- Final local checks: Node `v22.23.5`, npm `11.9.0`, TypeScript `5.9.3`, Vitest and V8 coverage `5.0.5`,
  Playwright `1.64.1`. The repository lockfile and dependency declarations are unchanged.
- Hosted Pages build: Node `v22.23.4`, npm `10.9.9`. The Pages browser job used Node `v22.23.5`, npm `10.9.9`,
  Chromium Headless Shell `156.0.8078.4`, Playwright build `1248`. Hosted browser tools are installed by the
  existing workflow; these observed patch versions are recorded separately.
- Earlier implementation/review checks: Node `v24.22.3`, npm `11.9.0`, Vitest `5.0.5`. These are recorded
  separately, not relabelled as final Node22 qualification.
- Local heavy commands use `NODE_OPTIONS=--max-old-space-size=1024` and one Vitest worker. No test deadline,
  assertion, inclusion rule or coverage threshold was changed.

## Recorded results on the reviewed integration source

| Check | Command or hosted job | Observed result |
| --- | --- | --- |
| Source secrets | `bash scripts/scan-secrets.sh` | Passed locally and in hosted CI/Pages. |
| Locale catalogs | `node scripts/i18n/check.mjs` | Passed: 4 catalogs, 0 errors, 451 informational warnings. Security copy intentionally uses the existing English fallback. |
| Translation-key use | `node scripts/i18n/extract.mjs` | Passed: 2,122 used, 0 missing, 143 unused catalog keys reported. |
| Pages tooling | `node --test scripts/pages/*.test.mjs` | 72 passed, 0 failed, 0 skipped, both locally and hosted. |
| Network egress | `node --test scripts/tests/network-egress-inventory.test.mjs scripts/tests/network-isolation-native.test.mjs` | 23 passed, 0 failed, 0 skipped locally. This includes accepted-main transport checks, not a substitute for Bitcoin consent tests. |
| Pages build and independent site verification | [Pages job 135384438424](https://github.com/djshellshoxxx/GhostPay/actions/runs/44472294261/job/135384438424) | Passed. Clean library build, web typecheck, lean bundle scan and verified 16-file DEMO site. |
| Pages Chromium on anvil | [Pages job 135384438580](https://github.com/djshellshoxxx/GhostPay/actions/runs/44472294261/job/135384438580) | 16 passed. No Bitcoin runtime in this intentionally lean profile. |
| Integration with Bitcoin regtest | [Integration job 135384438299](https://github.com/djshellshoxxx/GhostPay/actions/runs/44472294258/job/135384438299) | Passed; Bitcoin completed all 9 steps. Existing EVM and Solana suites also passed without feature changes to those paths. |
| Whole Bitcoin library and coverage | `npm test -w @ghostpay/btc-silent-payments -- --maxWorkers=1 --no-file-parallelism` | Local Node22: 566 passed, 1 existing header-stress timeout, 0 skipped; 32 files; exit 1; no coverage summary. Hosted gate pending. |
| Bitcoin package lint and typecheck | `npm run lint -w @ghostpay/btc-silent-payments`; `npm run typecheck -w @ghostpay/btc-silent-payments` | Both passed on Node22. All 89 tracked package hashes remained unchanged during the sequence. |
| Whole workspace typecheck | CI `npm run typecheck`, job 135386936883 | Passed. |
| Whole workspace ESLint | CI `npm run lint`, job 135386936856 | Failed: 10 unsafe-access/argument diagnostics in worker-result callback typing. Corrective narrowing and fresh qualification required. |
| Whole web suites and build | Existing CI commands | Hosted jobs queued/running. |
| Lean Chromium | CI `e2e (lean)`, job 135386936908 | 71 passed, 5 intentional profile skips; the new no-Bitcoin surface/worker/traffic case passed. |
| Full Chromium | CI `e2e (full)` | Hosted job queued/running. |

The verified Pages archive is [pages-site-278b1d5a](https://github.com/djshellshoxxx/GhostPay/actions/runs/44472294261/artifacts/14505310987),
716,253 bytes, SHA-256 `73d56d8324fde6a51cdeedd2bf04ea986e0d7b26e3d9af19771baa9d81b61208`.
It contains the site, module report, served-file hashes and build evidence. It is a DEMO artifact with payments
disabled on every chain. The separate Pages browser job builds a test-manifest development artifact for local
anvil; it does not publish it.

## Earlier checks and failures retained

- Independent review executed 119 tests in 12 files: worker/oracle 46, package scanner/state 39, web
  spent/resume/store/secrets 29, final UI consent/session ownership 5. Exact source anchors and commands are in
  [INDEPENDENT_REVIEW.md](INDEPENDENT_REVIEW.md). These selections had no skips.
- Coordinator Esplora suite: 38 passed. Header suite before the final shortened-chain edge: 31 passed.
  Final invalidation selection: 5 passed, 27 explicitly deselected by the targeted filter.
- Earlier whole Bitcoin coverage run at `6f5134de3443e36845fc9f150060d6a083aea86c`:
  566 passed, 1 failed, 0 skipped across 32 files. The existing 100,005-header reload stress test exceeded its
  unchanged 60-second deadline; no coverage summary was emitted. Package build, lint and typecheck passed.
- The subsequent whole header-source run passed 31 and hit the same class of existing 60-second stress timeout.
  The final targeted invalidation regressions passed. These failed broader attempts are not passes.
- Two earlier whole-web typecheck attempts were terminated with exit 137 before TypeScript diagnostics.
- The final local Node22 package run also exceeded the unchanged header stress-test deadline (163.402 seconds
  reported for the test body): 566 passed, 1 failed, 0 skipped; 406.316 seconds for the coverage command.
  [The report](evidence/btc-node22-final-report.json) and [embedded raw log](evidence/local-check-logs.json) retain
  that failure separately from hosted qualification. The package lint and typecheck commands exited 0.
- The repeated local Node22 `build:libs` was stopped with exit 130 after the exact-tree hosted clean library
  build, web typecheck and Pages verification passed. It is not counted as a local build pass; this avoided
  continuing a redundant rebuild alongside the remaining local package tests.
- The superseded whole-web coverage run started at `69be50ee78ccb813ab326d83dfa8c1c1280bb764` on Node24.
  It reported five failures in the unchanged 66-test `Pay.test.tsx` file before being stopped with exit 130
  after the main integration. It did not finish coverage or start its no-coverage pass, so it supplies no full
  suite result. Its root causes are not established by this partial log.
- Local system Chromium failed at launch, before any page ran: `socket() failed: Operation not permitted`.
  The failure is recorded as an environment limitation; no browser pass is inferred from authored specs.

The failing-before/fixed-after regressions cover forged coinbase annotations, pre-aborted disclosure, incomplete
and historical coverage, duplicate/replayed spends, missing tip anchors, spent historical siblings, orphaned
evidence, shortened checked history, worker authorization, stale results and late header ownership. The
independent review identifies the corresponding fixes and retained tests.

## Deterministic performance and resource review

Command: `node --expose-gc docs/handoffs/btc-spent-20261118/benchmark.mjs` on Node `v22.23.5`.
Runtime source remains local `3f4811afbfbdd5fa2fd2fbdd9afdac86f976668a`; the measurement-only benchmark revision
is separately bound by SHA-256 `f03b0e453906d947b512c85fc6eb79593dec2f3cc26dc8d829cd496da20f239c` in
[benchmark-final.json](evidence/benchmark-final.json). Assertions and workload were preserved when adding
actual abort-to-completion timing and sampled heap. The previous unmodified measurement is retained separately.

| Fixture observation | Measured value |
| --- | --- |
| Completed blocks / input records / watched outpoints | 500 / 500,000 / 10,000 |
| Matched payment outputs / local spend events | 0 / 500 |
| In-memory source calls / outpoint network queries | 1,500 / 0 |
| Total processing | 5,031.958 ms |
| Abort after completed blocks / source calls | 10 / 30 |
| Abort to generator completion | 0.563 ms |
| Whole cancellation pass, including its ten blocks | 126.196 ms |
| Calls after abort | 0 |
| Heap baseline / maximum sampled at 500 block boundaries | 15,910,448 / 33,586,968 bytes |
| Maximum sampled increase from baseline | 17,676,520 bytes |
| Retained heap delta after GC | −1,412,560 bytes; GC noise, not a memory-improvement claim |

This is scanner input validation and watched-outpoint filtering with in-memory sources. It excludes networking,
full-block parsing, cryptographic payment detection and browser scheduling. The cancellation measurement is
generator completion, not browser worker termination latency. Block-boundary heap sampling is **not a true
peak-memory measurement**. It should not be generalized into production scan throughput or a mobile-memory guarantee.

Source review confirmed bounded advancement and historical recovery (500 blocks each per web call), at most
10,000 restored/current matches, and deduplication storage proportional to watched/matched outpoints. Existing
worker limits remain: 524,288 UTF-16 code units of serialized state text, 16 MiB per source response and four
pending source requests (canonical state text is ASCII).
The serialized-state limit can be reached before the match-count ceiling. These are safety bounds, not promised
capacity; the new actual-output-count regression prevents shared tweak buffers from bypassing the output cap.

## Profile and scope interpretation

Bitcoin belongs to the full web profile. Its runtime cases are intentionally skipped by lean, while the new
lean acceptance case must prove no Bitcoin controls, worker or provider traffic exists. Pages release/deploy
jobs are intentionally skipped for a PR; normal Pages validation still runs. A skip is never counted as a pass.

Local confirmed-block scanning can miss mempool spends and cannot establish globally best-chain visibility.
An authorized provider report remains unproven. External nodes, proxies, physical devices and a professional
external audit are not claimed. Overall release readiness, existing Mythril findings and unrelated release
gates remain separate. PR #238's overlapping BTC implementation needs explicit reconciliation in any future
general consolidation; PR #235 seller checkpoints remain outside this change set.
