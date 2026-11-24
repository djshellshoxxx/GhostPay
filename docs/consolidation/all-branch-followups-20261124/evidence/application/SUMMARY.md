# GhostPay followup evidence inventory

Selected source: `bda2af071d4b9d3c85bbe4a20da2f8edb5eabcf8`  
Selected tree: `8add357748674afb128926a797982badb54bac6b`

Final qualification: **completed receipts included**.

151 original files, including 118 distinct raw logs; 693,229 uncompressed bytes. Overlapping test totals are not summed.

| Evidence family | Receipt/review files | Distinct raw logs | Interpretation |
|---|---:|---:|---|
| QR composition (#581/#605) | 1 | 8 | author qualification on an earlier isolated source |
| Narrow residual recoveries (#410/#341/#220) | 1 | 12 | author qualification on earlier isolated sources |
| Portable keystore memory lifecycle | 1 | 4 | author qualification on an earlier isolated source |
| PIR normalization and reconciliation IDB repair | 1 | 5 | author qualification on an earlier isolated source |
| React/Pages diagnostics | 2 | 7 | author qualification on an earlier isolated source |
| Release-key boundary | 2 | 4 | root qualification on an earlier combined source |
| Additive native IDB and Pages CI paths | 1 | 1 | author static/workflow qualification on an earlier isolated source |
| Receipt/print recovery | 2 | 5 | author qualification on an earlier isolated source |
| F08 offline profile viewer | 3 | 14 | author qualification plus root composition preservation |
| Individual payment-key export (#572) | 5 | 13 | author qualification, independent source review and root composition preservation |
| Root prior full combined qualification (74e51b7) | 4 | 30 | inherited qualification on an earlier combined source |
| Current-source package equivalence accounting | 1 | 5 | read-only equivalence proof for inherited package qualification |
| Root final combined qualification | 4 | 15 | new completed qualification on the selected combined source |
| Independent final combined source review | 2 | 0 | read-only review of selected combined source |

## Source and result boundaries

- **QR composition (#581/#605):** Package and focused web runs. These local runs supply no native/browser acceptance.
- **Narrow residual recoveries (#410/#341/#220):** Package runs retain their separate package_results_source; final web results use the later source. Initial web typecheck failure and passing rerun are both retained.
- **Portable keystore memory lifecycle:** Package qualification and focused consumer tests; no final-source coverage claim.
- **PIR normalization and reconciliation IDB repair:** Package/consumer gates passed. The native IDB launch failure is retained; native execution did not pass locally.
- **React/Pages diagnostics:** Preserves initial lint heap failure (exit 134) and successful 2048-MiB retry. Built site and dependency outputs are excluded.
- **Release-key boundary:** Release refusal intentionally exits 1; receipt records verified expected refusal and zero emitted files. Development acceptance is a separate run.
- **Additive native IDB and Pages CI paths:** Static/workflow checks only. An added hosted invocation does not establish local native execution.
- **Receipt/print recovery:** Focused runs and preservation evidence. Historical donor browser/PDF evidence does not qualify this combined source.
- **F08 offline profile viewer:** Product/CI, final guard and root composition pins remain distinct. Synthetic all-skipped/flaky/wrong-scenario report rejections are not browser runs. Initial workflow fixture failure and corrective rerun remain recorded.
- **Individual payment-key export (#572):** Original 13 logs included once; existing durable archive is not nested. Required local native run failed because Anvil/cast were absent. Historical donor spending proofs are not final-source acceptance.
- **Root prior full combined qualification (74e51b7):** Full web/package checks at 74e51b7197258cba1e2db98bfb698307ef741d7c retain actual skips. These tests are not summed with author runs or represented as final bda2af0 coverage.
- **Current-source package equivalence accounting:** 917 distinct selected full-suite package passes: QR 270, hygiene 175, ledger 36, current ux-vault 375, PIR 61. Each complete package and recursive declared workspace dependency tree, root configs and lockfile equals its qualified source. This is inherited source-equivalent qualification, not a new run; older ux-vault 310 and focused web counts are excluded. Shared original logs are archived only once.
- **Root final combined qualification:** Coordinator explicitly declared completion. Actual exit codes are retained; completion does not imply every gate passed.
- **Independent final combined source review:** Source review only; this does not replace test/native/hosted evidence.

## Nonzero log-backed commands retained

- `narrow-residual` / `typecheck`: exit 2; `raw/narrow-residual-qualification/web-typecheck.log`.
- `pir-idb` / `indexeddb-attempt`: exit 1; `raw/pir-idb-qualification/native-indexeddb-attempt.log`.
- `react-pages` / `web-lint`: exit 134; `raw/react-pages-diagnostics-web-lint.log`.
- `release-key` / `release-refusal`: exit 1; `raw/release-key-qualification/release-refusal.log`. Expected outcome: refusal at known-fixture key check.
- `f08` / `existing-workflows`: exit 1; `raw/f08-qualification/checks-existing-workflows.log`.
- `individual-export` / `recovery-native`: exit 1; `raw/individual-export-qualification/recovery-native.log`.

Synthetic report-gate checks are separate inventory entries; their expected refusals are not native/browser failures or passes.

Commands with no original raw-log reference remain explicitly listed as receipt-only evidence. No missing log is reconstructed.

## Packaging limits

- No test-count aggregation across overlapping author, prior-root and final-root runs.
- Raw logs are deduplicated by original absolute path; every referring receipt and JSON pointer is retained.
- Receipts remain byte-for-byte original. Historical, inherited, source-review and runtime evidence are not interchangeable.
- Built sites, dependencies, coverage directories, native artifacts and nested log archives are excluded; original receipt claims remain visible.
- Running selected-final-qualification is excluded until an explicit completion marker enumerates completed source-pinned receipts.
- No hosted, native or merge success is inferred from static review or an added CI step.
