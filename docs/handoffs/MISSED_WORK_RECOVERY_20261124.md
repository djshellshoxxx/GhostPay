# Interrupted-worker recovery — 2026-11-24

This checkpoint records the concrete GhostPay work resumed after interrupted workers and the overlapping continuations found during refreshed ownership checks. It supplements the existing #380 consolidation ledger; it does not replace that ledger or claim that the whole product or branch-consolidation mission is complete.

Latest recorded main: `706188000c38b3dde5a3a362370a530870aa7587`. Hosted snapshot: **2026-11-24 09:38:08 UTC**. The source changes below were published as isolated children; no main merge or deployment was performed by this continuation.

## Completed repairs and local qualification

| Published continuation | Result | Executed evidence |
| --- | --- | --- |
| [#594 — catalog completeness](https://github.com/djshellshoxxx/GhostPay/pull/594) | Reject duplicate canonical locales consistently with runtime i18n initialization. | 223 package tests; build, typecheck, pinned lint and scans. Independent review and eight focused regressions replayed. |
| [#595 — wallet-attempt fixture](https://github.com/djshellshoxxx/GhostPay/pull/595), child of #545 | Await actual migration completion and test delayed completion/rejection after unmount. | 222 focused tests; full web typecheck, lint/scans; independent review and six focused status tests replayed. |
| [#597 — mobile memo assertion](https://github.com/djshellshoxxx/GhostPay/pull/597), child of #588 | Scope the exact Memo label and paragraph after QR import. | 24 full + 24 lean cases across native Chromium and WebKit mobile profiles; original build/scans. Virtual-camera coverage remains separate. |
| [#606 — wallet-disclosure retries](https://github.com/djshellshoxxx/GhostPay/pull/606), child of #589 | Seven older assertions now require retained uncertainty and review guidance after a refused duplicate retry. All transaction guards remain. | 93 unit tests; Firefox full/lean retry cases 1/1 each; original Beta/Anvil 3/3 and Pages/Anvil 16/16; typecheck/lint/build/scans; independent review. |
| [#609 — retention hosting fixture](https://github.com/djshellshoxxx/GhostPay/pull/609), child of #587 | Reuse #436's exact source-catalog confirmation fixture. | 55 hosting tests, one existing Docker availability skip; lean build/typecheck/scans; original browser acceptance on two origins; independent review. |
| [#612 — encrypted checkout notice](https://github.com/djshellshoxxx/GhostPay/pull/612), child of #598/#571 | Preserve a public reconnect reason when encrypted invoice cleanup erases private context. | Seven new red regressions; 40/40 lifecycle/hook tests independently replayed; original real-Anvil 3/3; full/lean builds and two-origin static acceptance; lint/scans and independent review. |
| [#613 — Firefox reflow](https://github.com/djshellshoxxx/GhostPay/pull/613), child of #569 | Reuse #583's visibility predicate so a collapsed control's cached rectangle is not mistaken for visible overflow. | Original full and lean reflow 1/1 each, 18 default axe audits per profile, zero violations/skips; normal build/typecheck, lint/scans. The separate upstream renderer gate remains blocked, so this PR is draft. |

Detailed commands, original failed attempts, source pins, runtime limits and passing output are preserved in each PR's dedicated handoff. Every published source tree above was checked against the final local tree before creating its public commit. API publication changes commit metadata, so local and public commit IDs differ while their verified trees match.

## Exact public source pins

| PR | Public head | Verified tree |
| --- | --- | --- |
| #594 | `7d6d48eff443b604f384835c207adcfbe014b624` | `b23957058b1d1a0efd9607ee2e934863bc8f67aa` |
| #595 | `534bb3808d0f37dd2e6c1f4aaca7c529d9b2432c` | `f73f9d7fe1d471279818042b0849f879bc8a1e9a` |
| #597 | `a929b178a6626a9912f5d081b8a3e8c6847374ae` | `7a582426fdafa8cedd7a81109f922c9a12fcb2a5` |
| #606 | `f941ac01fd9464fc881266dcc2d2e1e530d5f15b` | `a3f29515f694b70286f4d95e2dbd24172dff0998` |
| #609 | `00078ed6a2561e948fae50593ab9eb36d5f47be9` | `40a19cf997bff3b292bf4e052301d3af83d5235f` |
| #612 | `e580fcac85e1e7fc2a42a4c7ea7d5a581418aab8` | `203f829391b68f526c486ef0eb894679c9739c4a` |
| #613 | `17fa04b0ad4af4d88739bcffd9042d76d27c8237` | `cf6689782ba36a960bf154c3f8d685690c7c25bb` |

## Completed qualification of existing work

- **#565:** native 137/137, build/typecheck/lint; all five hosted workflow groups successful at `68a4e9596062b2144ca5d9da3ff817b73644e2e1`. Core CI run 45326703602: all 24 jobs successful.
- **#568:** native 54/54, build/typecheck/lint; all five hosted workflow groups successful at `c6817a2e46a684cc29450fc0bc18d48fc6e9f500`. Core CI run 45333644284: all 24 jobs successful. The final terminal state supersedes the earlier queued-aggregate snapshot.
- **#599:** its published code at `0c7f680d0791668a68c3a92d7d4ba44087dcf2b8` was reused unchanged. A fresh original Pages/Anvil run passed **16/16**, without retries or skips, including clean-profile restoration and unchanged same-nonce cancellation. Evidence is published on `qualification/20261124/pages-599`, commit `8e0bbe97b84817472b1322a95bbc58cf77d7cd57`. Preserve #599 → #575 → #546 → #533.
- **#585/#600:** the invalid Testing Library option was repaired and locally qualified with 22 tests and both original invoice-minimization browser profiles. A concurrent equivalent exact-string correction was found in #600. Our duplicate #603 was closed, preserving its branch and complete evidence. The recorded 22/full/lean runs belong to #603's anchored-regex variant at public `2d612e37f3f71b785129f447c14731cbef9143c7`; do not relabel them as executions on #600's different public commit. Both variants leave the product source unchanged.
- **#592:** its Windows CLI job hit a bounded crypto-test timeout while macOS and Linux passed. The failed job was rerun once without a code or timeout change. Run **45337380251**, attempt **2**, completed **successfully** at `e9025d72f1408ec48e6d1ca29a5361a55175ec31`.

Package source review and job-level evidence remain in `RESUMED_PACKAGE_QUALIFICATION_565_568_20261124.md` and its qualification JSON on this evidence branch.

## Ownership overlaps reconciled

The continuation reused the already-published #598 privacy work and #599 reconciliation work, then supplied missing browser qualification and the genuinely missing encrypted-invoice case. It did not publish competing versions of those original fixes. The duplicate #603 was explicitly closed in favor of #600, with its evidence retained.

Other current workers' published continuations were recorded and preserved: #596 suspended-signer recovery, #601 fees, #602 recurring-state fixtures, #604 offline/draft recovery, #605 QR decoder completion, #607 ledger composition and #608 print completion. Their own reports contain their qualification; this checkpoint does not claim those runs were independently re-executed here.

The broader scoped census, original failed jobs and inherited scope gaps are preserved in [MISSED_WORK_CENSUS_20261124.md at #613](https://github.com/djshellshoxxx/GhostPay/blob/17fa04b0ad4af4d88739bcffd9042d76d27c8237/docs/handoffs/MISSED_WORK_CENSUS_20261124.md). GhostStore production acceptance and complete multi-tab integration remain separate obligations where the inspected partial PRs do not establish completion.

## Remaining gates and executable next steps

1. **Refresh exact public heads and hosted results.** The JSON snapshot in `docs/qa/missed-work-recovery-20261124/hosted-snapshot.json` records all observed runs. At that checkpoint #594's Beta and CLI groups and #599's CLI group had succeeded; many other new groups remained queued or running. Local success does not establish hosted success.
2. **Retain dependency order and the existing integration owner/lease.** Integrate child repairs into their actual parent branches before composing those features into main. Refresh the authoritative #380 ledger and current ownership; these evidence branches do not claim the integration lock.
3. **Keep #613's broader native gate blocked.** The pinned Playwright 1.65.1/Firefox build matches the upstream [#44135](https://github.com/microsoft/playwright/issues/44135) / [#43967](https://github.com/microsoft/playwright/issues/43967) regression. Upstream places its fixed browser in the 1.66 development line. The official stable release and npm metadata still showed 1.65.1 on November 24. A separately qualified stable dependency update must rerun the original unfiltered gates. No accessibility rule, assertion, engine or application semantics was changed to bypass the defect.
4. **Preserve native runtime limits.** Headless Shell did not qualify the full Chromium virtual-camera cases. The unfiltered mobile/QR hosted gate remains necessary. Docker Compose was unavailable for local Tor image/runtime checks; successful ordinary Chromium hosting tests do not establish live onion routing or Tor Browser acceptance.
5. **Continue the existing consolidation task.** Supply this checkpoint and exact source refs to the existing automation; preserve its full mission and schedule. Do not create another competing worker automation, discard source branches or equate a completed census with product completion.

All active local test processes for these finished tasks have stopped. A disk-quota interruption was resolved by removing only reproducible generated dependencies from completed checkouts; source, logs, manifests and published evidence were preserved. Incomplete environment attempts retain their real status.

The recoverable corrections and their local qualification in this checkpoint are complete. Hosted acceptance, dependency repair and coordinated main integration remain explicitly outstanding.
