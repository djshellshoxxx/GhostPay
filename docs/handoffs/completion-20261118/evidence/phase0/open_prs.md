# Phase-0 census: open pull requests (djshellshoxxx/GhostPay)

Queried 2026-11-18. Times are UTC.

- PR list: GitHub MCP `list_pull_requests` (state=open, perPage=100) at about 08:27:43Z returned 49 PRs. A
  cross-check with `gh api repos/djshellshoxxx/GhostPay/pulls?state=open&per_page=100` right afterwards returned 48:
  #195 (`chatgpt/zero-codex/pages-manifest-gates-20261117`, head `12e18931`) was closed without merging at
  2026-11-18T08:27:48Z, between the two queries. The table below lists the 48 PRs that were still open.
- Check runs: `gh api repos/djshellshoxxx/GhostPay/commits/<exact head SHA>/check-runs?per_page=100`, counting only runs
  whose `head_sha` matches the PR head listed here. This is the same data as MCP `pull_request_read get_check_runs`;
  one PR (#218) was cross-checked through MCP and matched (5 queued runs). Done between 08:28:07Z and 08:28:56Z.
  Each run is counted by its conclusion, or by its status (queued/in_progress) while it has no conclusion.
  Legacy commit statuses are not included.
- Many heads still had queued or in-progress runs at query time, so a summary with `queued` is not a final CI result.
- Active-writer class comes from the head-ref prefix only (`chatgpt/`, `codex/`, `dependabot/`, `claude/`); any other
  prefix is `other` and names that prefix.

| PR | Title (short) | Draft | Head ref | Head SHA | Base | updated_at | CI on exact head | Writer |
|---|---|---|---|---|---|---|---|---|
| #218 | Restore fixes dropped by merge 84c2c185 that main still lacks: CLI,... | yes | `claude/exciting-brown-7v69cr` | `42c12dc2` | `main` | 2026-11-18T08:24:06Z | 5 runs: queued=5 | claude |
| #217 | DeployPolicy: refuse fee-charging factories without a token-specifi... | yes | `claude/ghostpay-consolidation-9xhtxg-feeguard` | `9e5cc378` | `main` | 2026-11-18T07:52:53Z | 16 runs: in_progress=1, neutral=1, queued=7, skipped=1, success=6 | claude |
| #216 | docs(handoff): post-merge GhostPay zero-Codex source and ownership ... | yes | `chatgpt/zero-codex/handoff-postmerge-20261118` | `62022488` | `main` | 2026-11-18T07:45:46Z | 20 runs: neutral=1, queued=3, skipped=12, success=4 | chatgpt |
| #215 | docs(wiki): post-consolidation Pages User/Developer current-status ... | yes | `chatgpt/zero-codex/docs-postmerge-wiki-20261118` | `328cddc3` | `main` | 2026-11-18T07:45:43Z | 20 runs: neutral=1, queued=3, skipped=12, success=4 | chatgpt |
| #214 | docs(audit): post-consolidation randomized Pages audit rotation 185 | yes | `chatgpt/zero-codex/audit-main-20261118-r185` | `01a3bc0a` | `main` | 2026-11-18T07:45:41Z | 20 runs: queued=2, skipped=12, success=6 | chatgpt |
| #213 | [WIP] Spec 18 / requirement 3q: stealth keypair export and independ... | yes | `claude/ghostpay-consolidation-9xhtxg-spec18` | `a199c21e` | `main` | 2026-11-18T07:44:53Z | 37 runs: queued=20, skipped=3, success=14 | claude |
| #212 | Security and release-gate reconciliation: Mythril/Echidna/fee-token... | yes | `claude/ghostpay-consolidation-9xhtxg-security` | `4894d0d8` | `main` | 2026-11-18T07:43:00Z | 37 runs: queued=20, skipped=5, success=12 | claude |
| #211 | Completion run 2026-11-18 (gap-fill): claims + integration | yes | `nodata/wonderful-darwin-kd1h22` | `62d2ff29` | `main` | 2026-11-18T08:23:12Z | 12 runs: queued=11, skipped=1 | other (nodata/*) |
| #210 | deps: bump the npm-minor-patch group across 1 directory with 9 updates | no | `dependabot/npm_and_yarn/npm-minor-patch-71cdd1547c` | `4d19655a` | `main` | 2026-11-18T07:22:45Z | 36 runs: failure=17, neutral=1, queued=9, skipped=3, success=6. Failing: ts-test (core-crypto):failure; ts-test (btc-silent-payments):failure; ts-test (rest-2):failure; e2e (full):failure; lean-candidate:failure; e2e (lean):failure; ts-test-relayer:failure; ts-check:failure; ts-typecheck:failure; integration (anvil + bitcoind regtest + solana-test-validator):failure; qualify-ghostpay-web:failure; Pages artifact on anvil (browser):failure; CLI (macos-latest):failure; CLI (windows-latest):failure; CLI (ubuntu-24.04):failure; Build and verify the Pages site:failure; beta acceptance (lib + cli + browser on anvil):failure | dependabot |
| #209 | Completion run 2026-11-18: claims + integration | yes | `claude/ghostpay-completion-audit-ot5jjm` | `f81947fa` | `main` | 2026-11-18T07:47:38Z | 6 runs: neutral=1, queued=3, success=2 | claude |
| #208 | docs(handoff): cooperative completion, audit and security-closure e... | yes | `claude/admiring-albattani-6kydor` | `ef610872` | `main` | 2026-11-18T07:08:10Z | 20 runs: skipped=12, success=8 | claude |
| #207 | ci: bump the actions group across 1 directory with 2 updates | no | `dependabot/github_actions/actions-b9ade1236b` | `199ab7ef` | `main` | 2026-11-18T07:06:33Z | 31 runs: failure=1, neutral=1, queued=2, skipped=2, success=25. Failing: mythril:failure | dependabot |
| #206 | Integrate #204 agent tooling onto consolidated main (conflicts reso... | yes | `claude/ghostpay-consolidation-9xhtxg` | `c487f0fe` | `main` | 2026-11-18T06:57:23Z | 26 runs: queued=11, success=15 | claude |
| #205 | docs(audit): post-consolidation audit and feature-completion execut... | yes | `nodata/zealous-hopper-lr0nxe` | `df59b0eb` | `main` | 2026-11-18T08:02:25Z | 3 runs: queued=3 | other (nodata/*) |
| #204 | Add agent guide, package map, affected-checks and security-invarian... | yes | `nodata/eager-babbage-0w6sf6` | `2693b08e` | `main` | 2026-11-18T02:48:14Z | 24 runs: success=24 | other (nodata/*) |
| #202 | test(pages): isolate keystore reimport from held-RPC sweep | yes | `chatgpt/zero-codex/pages-keystore-reimport-control-20261118` | `30cc4560` | `chatgpt/zero-codex/pages-same-view-invoice-focus-20261117` | 2026-11-18T02:42:38Z | 30 runs: failure=2, skipped=3, success=25. Failing: e2e (full):failure; e2e (lean):failure | chatgpt |
| #201 | test(pages): focus new invoice when Pay is already selected | yes | `chatgpt/zero-codex/pages-same-view-invoice-focus-20261117` | `2fb89ff5` | `chatgpt/zero-codex/pages-late-invoice-focus-20261117` | 2026-11-18T00:50:26Z | 32 runs: failure=1, skipped=3, success=28. Failing: e2e (lean):failure | chatgpt |
| #200 | test(pages): preserve keyboard focus on anchor and focus main on la... | yes | `chatgpt/zero-codex/pages-late-invoice-focus-20261117` | `23cc6db4` | `chatgpt/zero-codex/pages-hash-navigation-exceptions-20261117` | 2026-11-17T22:43:08Z | 32 runs: skipped=3, success=29 | chatgpt |
| #199 | test(pages): preserve unrelated anchors and late invoice opt-out | yes | `chatgpt/zero-codex/pages-hash-navigation-exceptions-20261117` | `b570d4bb` | `chatgpt/zero-codex/pages-autoclear-enable-retained-hash-20261117` | 2026-11-17T21:45:46Z | 32 runs: skipped=3, success=29 | chatgpt |
| #198 | fix(pages): remove retained invoice hash on privacy re-enable (RED→... | yes | `chatgpt/zero-codex/pages-autoclear-enable-retained-hash-20261117` | `9732adb9` | `chatgpt/zero-codex/pages-fragment-history-state-20261117` | 2026-11-17T19:46:38Z | 32 runs: skipped=3, success=29 | chatgpt |
| #197 | fix(pages): preserve history state while clearing invoice URLs (tes... | yes | `chatgpt/zero-codex/pages-fragment-history-state-20261117` | `68993c66` | `chatgpt/zero-codex/pages-fragment-shell-gates-20261117` | 2026-11-17T16:39:42Z | 35 runs: skipped=3, success=32 | chatgpt |
| #196 | test(pages): cover lean shell invoice-fragment privacy gates | yes | `chatgpt/zero-codex/pages-fragment-shell-gates-20261117` | `120dcd7f` | `chatgpt/zero-codex/pages-manifest-gates-20261117` | 2026-11-17T14:48:18Z | 32 runs: skipped=3, success=29 | chatgpt |
| #163 | fix(pages): requalify #159 transfer-filter guard on owner #157 (RED... | yes | `chatgpt/zero-codex/pages-owner-transfer-filter-20261115` | `cf5e876c` | `integration/consolidated-2026-11-14` | 2026-11-15T08:41:43Z | 35 runs: skipped=3, success=32 | chatgpt |
| #162 | fix(pages): preserve bearer QR safety on combined candidate (RED→GR... | yes | `chatgpt/zero-codex/pages-qr-combined-20261115` | `26f83ccd` | `chatgpt/pages-browser-fixes-combined-20261114` | 2026-11-15T04:45:46Z | 35 runs: skipped=3, success=32 | chatgpt |
| #161 | fix(pages): combine bounded relayer reads and off-filter telemetry ... | yes | `chatgpt/pages-browser-fixes-combined-20261114` | `73923350` | `integration/consolidated-2026-11-14` | 2026-11-15T01:23:41Z | 35 runs: skipped=3, success=32 | chatgpt |
| #160 | docs(pages): source-pinned integration and release-gate inventory | yes | `chatgpt/pages-release-gate-audit-20261114` | `2221a611` | `integration/consolidated-2026-11-14` | 2026-11-15T01:22:27Z | 16 runs: skipped=12, success=4 | chatgpt |
| #159 | fix(pages): reject off-filter token/block transfer telemetry (RED→G... | yes | `chatgpt/zero-codex/pages-scan-transfer-filter-20261114` | `7b6c4983` | `integration/consolidated-2026-11-14` | 2026-11-15T01:51:03Z | 35 runs: skipped=3, success=32 | chatgpt |
| #154 | fix(pages): correct negative fiat minor-unit sign (verified test-fi... | yes | `chatgpt/zero-codex/pages-negative-fiat-regression-20261114` | `9bdc9cba` | `chatgpt/zero-codex/pages-reconciliation-idb-retry-20261113` | 2026-11-14T11:47:29Z | 35 runs: skipped=3, success=32 | chatgpt |
| #153 | docs(handoff): rotation 173 Pages #198 exact-head GREEN qualification | yes | `chatgpt/zero-codex/pages-owner-ci-handoff-20261114` | `83fe9b02` | `chatgpt/zero-codex/pages-reconciliation-idb-retry-20261113` | 2026-11-18T06:46:23Z | 16 runs: skipped=12, success=4 | chatgpt |
| #151 | Lean-core milestone run: audit fixes, fail-closed gates, reachabili... | yes | `claude/ghostpay-lean-core-milestone-t5lwox` | `2527d6b9` | `main` | 2026-11-14T05:01:52Z | 24 runs: success=24 | claude |
| #140 | docs(pages): static Pages CI gates, User/Developer Wiki and mainten... | yes | `chatgpt/zero-codex/docs-pages-scope-20261112` | `c5efadab` | `claude/ghostpay-github-pages-up6cj6` | 2026-11-18T06:45:33Z | 16 runs: skipped=12, success=4 | chatgpt |
| #139 | docs(audit): randomized read-only Pages audit ledger (rotation 179) | yes | `chatgpt/zero-codex/audit-pages-release-20261112` | `364b01f8` | `claude/ghostpay-github-pages-up6cj6` | 2026-11-18T06:43:36Z | 16 runs: skipped=12, success=4 | chatgpt |
| #127 | fix(ux-guide): reject non-plain and inherited questionnaire answers... | yes | `chatgpt/zero-codex/ux-guide-plain-object-20261111` | `cf3a8b23` | `integration/ghostpay-beta-consolidated-20261109` | 2026-11-11T20:44:37Z | no checks | chatgpt |
| #126 | test(ux-schedule): pin confirmation to max-age boundary under advan... | yes | `chatgpt/zero-codex/ux-confirm-clock-boundary-20261111` | `d7795690` | `integration/ghostpay-beta-consolidated-20261109` | 2026-11-11T18:46:07Z | 29 runs: success=29 | chatgpt |
| #125 | fix(cli): preserve end-of-options sentinel in value parsing | yes | `chatgpt/zero-codex/cli-sentinel-value-20261111` | `a6e74591` | `integration/ghostpay-beta-consolidated-20261109` | 2026-11-11T16:41:47Z | 29 runs: failure=4, success=25. Failing: qualify-ghostpay-web:failure; kit:failure; e2e (lean):failure; e2e (full):failure | chatgpt |
| #123 | test(merchant-billing): preserve final billable-period boundary | yes | `chatgpt/zero-codex/merchant-schedule-horizon-20261111` | `7cdc6b32` | `integration/ghostpay-beta-consolidated-20261109` | 2026-11-11T12:44:02Z | 29 runs: success=29 | chatgpt |
| #122 | fix(net-transport): reject noncanonical percent-encoded onion autho... | yes | `chatgpt/zero-codex/onion-canonical-host-20261111` | `72dde82d` | `integration/ghostpay-beta-consolidated-20261109` | 2026-11-11T11:51:08Z | 29 runs: success=29 | chatgpt |
| #87 | deps: bump the npm-major group across 1 directory with 11 updates | no | `dependabot/npm_and_yarn/npm-major-1ddf9439d6` | `bbc8ff3b` | `main` | 2026-11-18T07:27:34Z | 36 runs: failure=13, neutral=1, queued=15, skipped=3, success=4. Failing: lean-candidate:failure; e2e (lean):failure; ts-test-relayer:failure; ts-check:failure; qualify-ghostpay-web:failure; kit:failure; Pages artifact on anvil (browser):failure; CLI (ubuntu-24.04):failure; CLI (windows-latest):failure; Build and verify the Pages site:failure; CLI (macos-latest):failure; beta acceptance (lib + cli + browser on anvil):failure; integration (anvil + bitcoind regtest + solana-test-validator):failure | dependabot |
| #82 | Configure OpenAI autonomous development workflow and prompts | yes | `codex/setup-autonomous-agent-20261104` | `122e5171` | `main` | 2026-11-04T21:21:00Z | 26 runs: failure=2, skipped=1, success=23. Failing: SonarCloud Code Analysis:failure; secrets-and-egress:failure | codex |
| #81 | codex: GhostPay cloud engineering checkpoint 41868394956 | yes | `codex/ghostpay-cloud-41868394956` | `f34a80f7` | `main` | 2026-11-04T17:16:38Z | 26 runs: success=26 | codex |
| #52 | ci: add four parallel API-funded GhostPay QA agents with guarded in... | yes | `automation/ghostpay-parallel-four-agents-20261103` | `68dc5b50` | `main` | 2026-11-04T00:41:30Z | 30 runs: skipped=4, success=26 | other (automation/*) |
| #51 | ci: continue GhostPay API-funded backlog development twice daily | no | `automation/ghostpay-recurrent-backlog-20261103` | `5835736c` | `main` | 2026-11-04T00:23:22Z | 26 runs: success=26 | other (automation/*) |
| #49 | deps: bump follow-redirects from 1.16.1 to 1.16.2 | no | `dependabot/npm_and_yarn/follow-redirects-1.16.2` | `6bffb63d` | `main` | 2026-11-03T18:49:06Z | 23 runs: neutral=1, skipped=1, success=21 | dependabot |
| #44 | fix(audit): keep report file mode when regenerating audit 24 report | yes | `claude/happy-maxwell-onl4x5` | `fd710eb3` | `codex/ghostpay-consolidation-20261030` | 2026-10-30T13:39:26Z | 22 runs: failure=1, skipped=1, success=20. Failing: SonarCloud Code Analysis:failure | claude |
| #43 | docs: wave 2 frontier status, nightly diagnosis, handoff markers | yes | `claude/haiku-wave-2-handoff-qepfoe` | `8d1bde36` | `codex/ghostpay-consolidation-20261030` | 2026-10-30T13:27:59Z | 15 runs: skipped=10, success=5 | claude |
| #42 | docs(handoff): Haiku wave prompts and Opus M1 milestone prompt | yes | `claude/sharp-bohr-uigfgh` | `c9a8c3d3` | `main` | 2026-10-30T13:08:53Z | 19 runs: skipped=10, success=9 | claude |
| #40 | fix(relayer): prevent secret-file validation/read races | no | `codex/ghostpay-security-audit-20261030` | `63994db6` | `claude/gifted-planck-115x2k` | 2026-10-30T08:04:46Z | 23 runs: skipped=1, success=22 | codex |
| #39 | Audit 24 review follow-ups D3, AR2, B2R (onto PR #37) | yes | `claude/gifted-planck-115x2k` | `1d28f24d` | `claude/ghostpay-autonomous-completion-y4sk2h` | 2026-10-30T07:47:24Z | 22 runs: skipped=1, success=21 | claude |

Note: PR #211's head moved after the PR-list query. The table shows `62d2ff29`; at 08:28:45Z `origin/nodata/wonderful-darwin-kd1h22` was at `74be0ea7`. Its CI row is for `62d2ff29`.

## Remote branches with commits not in origin/main, committed in the last 24 hours

Source: `git fetch origin`, then `git for-each-ref --sort=-committerdate refs/remotes/origin`, keeping refs with a tip
committer date within 24 h of 2026-11-18T08:28:56Z and `git rev-list --count origin/main..<ref>` > 0.
origin/main = `5467c158`.

| Branch | Tip | Tip committer date | Commits not in origin/main | Open PR |
|---|---|---|---|---|
| `nodata/wonderful-darwin-kd1h22` | `74be0ea7` | 2026-11-18T08:28:45Z | 25 | #211 |
| `claude/lucid-meitner-apalzc` | `e4755332` | 2026-11-18T08:28:41Z | 9 | none |
| `claude/vibrant-cori-scu18b` | `9617e857` | 2026-11-18T08:27:39Z | 1 | none |
| `security/mythril-full-remediation-20261118` | `3eeac76b` | 2026-11-18T08:24:54Z | 7 | none |
| `claude/exciting-brown-7v69cr` | `42c12dc2` | 2026-11-18T08:23:41Z | 1 | #218 |
| `claude/friendly-turing-1ui0on` | `f4e79b07` | 2026-11-18T08:04:45Z | 2 | none |
| `nodata/zealous-hopper-lr0nxe` | `df59b0eb` | 2026-11-18T07:59:27Z | 3 | #205 |
| `claude/ghostpay-consolidation-9xhtxg-feeguard` | `9e5cc378` | 2026-11-18T07:52:37Z | 1 | #217 |
| `claude/ghostpay-completion-audit-ot5jjm` | `f81947fa` | 2026-11-18T07:47:22Z | 2 | #209 |
| `chatgpt/zero-codex/handoff-postmerge-20261118` | `62022488` | 2026-11-18T07:45:14Z | 1 | #216 |
| `claude/ghostpay-consolidation-9xhtxg-spec18` | `a199c21e` | 2026-11-18T07:44:39Z | 4 | #213 |
| `chatgpt/zero-codex/docs-postmerge-wiki-20261118` | `328cddc3` | 2026-11-18T07:44:17Z | 1 | #215 |
| `chatgpt/zero-codex/audit-main-20261118-r185` | `01a3bc0a` | 2026-11-18T07:42:57Z | 1 | #214 |
| `claude/ghostpay-consolidation-9xhtxg-security` | `4894d0d8` | 2026-11-18T07:42:02Z | 6 | #212 |
| `dependabot/npm_and_yarn/npm-major-1ddf9439d6` | `bbc8ff3b` | 2026-11-18T07:23:32Z | 1 | #87 |
| `dependabot/npm_and_yarn/npm-minor-patch-71cdd1547c` | `4d19655a` | 2026-11-18T07:18:30Z | 1 | #210 |
| `claude/admiring-albattani-6kydor` | `ef610872` | 2026-11-18T07:07:42Z | 1 | #208 |
| `dependabot/github_actions/actions-b9ade1236b` | `199ab7ef` | 2026-11-18T07:01:56Z | 1 | #207 |
| `chatgpt/zero-codex/pages-owner-ci-handoff-20261114` | `83fe9b02` | 2026-11-18T06:46:21Z | 42 | #153 |
| `chatgpt/zero-codex/docs-pages-scope-20261112` | `c5efadab` | 2026-11-18T06:45:27Z | 110 | #140 |
| `chatgpt/zero-codex/audit-pages-release-20261112` | `364b01f8` | 2026-11-18T06:43:34Z | 43 | #139 |
| `claude/ghostpay-consolidation-9xhtxg` | `c487f0fe` | 2026-11-18T06:32:05Z | 3 | #206 |
| `nodata/eager-babbage-0w6sf6` | `2693b08e` | 2026-11-18T02:31:26Z | 2 | #204 |
