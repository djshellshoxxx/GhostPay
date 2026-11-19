# Browser network isolation: acceptance and ownership

Status: **bounded source review complete; combined-source qualification pending**. This is
the acceptance ledger for the network-isolation task, not a release approval.
Inherited test results below apply only to their recorded source. No result is
promoted to the new candidate until that candidate is tested and independently
reviewed.

## Source pins and integration boundary

The read-only baseline census inspected all 44 open pull requests and their
changed-file lists. The six requested PRs were open, draft and unmerged at that
snapshot. Main and the five privacy/integration input heads were unchanged during
the census. Recheck heads before publication because other workstreams remain
active.

| Input | Exact inspected commit | Branch / role |
|---|---|---|
| Initial main baseline | `dfc75ef2087fa6463ae59e0818abec01796c578d` | Original integration input |
| [Main at first publication recheck](https://github.com/djshellshoxxx/GhostPay/commit/58d89b39b27a66454ebf392bcd35d5c68b57b2f8) | `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` | Separately merged #241 and #237; no missing product delta for this task |
| [Main at final source reconciliation](https://github.com/djshellshoxxx/GhostPay/commit/e454de6abfefda70d82784fafc1d8949b277c334) | `e454de6abfefda70d82784fafc1d8949b277c334` | Separately merged #242; its exact product inputs already inherited through #238 |
| [#238](https://github.com/djshellshoxxx/GhostPay/pull/238) | `198aa5baff22272453733a0f3dcfcac0e0994eec` | `integration/ghostpay-pages-completion-20261118`; dependency baseline |
| [#241](https://github.com/djshellshoxxx/GhostPay/pull/241) | `e8857bfa1ec93fafa9ff83f63f7430ef26a362c2` | `codex/ghostpay-browser-isolation-20261118`; reviewed transport/startup work |
| [#222](https://github.com/djshellshoxxx/GhostPay/pull/222) | `2bc2098298d90928eb1acafad969f28316bb05fc` | `privacy/hardening-recommendations` |
| [#228](https://github.com/djshellshoxxx/GhostPay/pull/228) | `685fe1a39a3fa9f1d6a4d10a77b4d1a2745edeed` | `chatgpt/ghostpay-own-node-guard-20261118` |
| [#231](https://github.com/djshellshoxxx/GhostPay/pull/231) | `d9ff386807de724eb1a1c4d400c882df0fc20bb7` | `chatgpt/ghostpay-sweep-balance-consent-20261118` |
| [#233](https://github.com/djshellshoxxx/GhostPay/pull/233) | `67cf835d0bf5f3b239e8ee6f18dca401fd5a5050` | `chatgpt/ghostpay-privacy-browser-fixtures-20261118` |
| [#235](https://github.com/djshellshoxxx/GhostPay/pull/235) | `a5076f4d4e8d2dc515bdc31f304b6c6ce75bf3b1` | Private v4 scan-checkpoint dependency |
| [#237](https://github.com/djshellshoxxx/GhostPay/pull/237) | `7109290b7e4f029c36d9743bde9fd664d1da5474` | `chatgpt/ghostpay-beta-log-artifact-20261118`; already inherited through #238 |

Git ancestry checks confirm that the exact #222, #228, #231, #233 and #235
commits are ancestors of #238. The task branch is
`codex/network-isolation-complete-20261119`; its reviewable PR targets
`integration/ghostpay-pages-completion-20261118`. Source PR branches are read-only
inputs. Combining their history locally does not merge them into main or approve
their unrelated work.

The publication recheck observed a later main advance: repository owner
`djshellshoxxx` merged #241 at 2026-11-19 06:08:21 UTC as
[`5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929`](https://github.com/djshellshoxxx/GhostPay/commit/5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929),
then #237 at 06:12:13 UTC as main `58d89b39`. The #241 head remains exactly
`e8857bfa`; its PR is now closed and merged. #238 remains open, draft and unchanged
at `198aa5ba`. These were external repository-owner merges, observed read-only by
this task.

The only content difference above #241 on new main is #237's beta-log artifact
repair: one `include-hidden-files: true` input restricted to the existing
`scripts/beta/.state/*.log` pattern, its claim and its handoff. The exact #237
source is already an ancestor of #238. Its workflow blob
`8b343c410018decc4a46ad142e46bcb58dc7f3a7` and handoff blob
`1d954db79beb6dae7d427fe185e7e5fa3cf71d45` match #238 exactly. The initial task
integration therefore already contains every newly merged product/workflow
change. Keep the stacked #238 target; no duplicate cherry-pick or source-branch
edit is needed for this advance. The beta artifact work remains owned by the
recorded `recovery_review` workstream.

The later read-only reconciliation found main at `e454de6a`, after external
merge [#242](https://github.com/djshellshoxxx/GhostPay/pull/242) at
2026-11-19 06:54:41 UTC. Its head was
`ab4e0da2cfe2a18adac0424896fba0b40fac81a8`. Independent ancestry checks confirm
that its four exact inputs are already ancestors of both #238 and initial
candidate `089a0081`: #227 idle-lock source
`613667be4eeb132c7d21ccd06c627f9a7144d85b`, #234 signer source
`5e9e7be70399a9818579cf87bd494e013e25d4f9`, #235 checkpoints `a5076f4d` and
#237 logs `7109290b`. The additional #242 qualification document does not supply
a missing product change. Keep the unchanged #238 stack target; no code
integration, input-branch edit or duplicate cherry-pick is needed. This task
observed the merge; it did not perform it.

The task preserves the non-custodial client architecture, Pages static hosting,
Spec 18 recovery/key export, v4 checkpoints, invoice validation, transaction
review/signing and attempt journals. Contract changes, hosted relayer changes,
new mandatory services, telemetry, dependency churn, deployment and security-gate
relaxation are outside this feature.

## Current work ownership

The lead records the integration claim in [ACTIVE_WORK](../ai/ACTIVE_WORK.md).

| Owner | Task-owned paths / responsibility | Completion evidence required |
|---|---|---|
| Policy implementer | New browser authorization module, `defaultServices` integration and focused policy tests | Per-dispatch destination/action/revision checks; fail-closed revocation and malformed policy; no leaked endpoint or request data |
| Transport implementer | Bounded-request helper; Esplora, indexer and browser relayer follow-up; focused transport regressions | Failing-first cases, bounded abort/deadline/body/cleanup behavior, late-response disposal and preserved submission uncertainty |
| Lead / UI integration | AppShell settings/cache lifecycle, Settings saves, Scan/Sweep and supported chain-view integration, final candidate and PR | Real action-scoped wiring, stale-result protection, cross-tab invalidation, existing signing behavior, complete qualification |
| Independent privacy reviewer | This ledger; new browser/native traffic tests when coordinated; independent review of the combined implementation | Actual destination assertions, adversarial probes, source-pinned findings and re-review after corrections |

Other active source owners remain relevant: #219 owns Bitcoin scan/Esplora/oracle
and worker changes; #218 touches `relayerClient`; #227 touches AppShell idle
locking; #230 owns session-only Sweep history; #211 touches chain views and scan
state; #220 touches EVM RPC metadata; #239 touches session recovery; #240 touches
AppShell recovery. Their changes must be preserved or explicitly reconciled on
the task branch. Recovery and Mythril remain separately owned.

## Acceptance matrix: all sixteen requested sections

"Inherited" means inspected source or evidence from an input commit. "Pending"
means that the new combined candidate has not yet supplied the stated final
qualification. Source completion and executed tests are distinguished below;
neither an unexecuted browser case nor an inherited pass is a candidate pass.

| Section | Acceptance requirement | Owner | Baseline / current qualification status |
|---|---|---|---|
| 1. Establish baseline | Inspect main, the six named PRs, instructions, specifications, inventory, claims and evidence; preserve #241 | Lead + independent reviewer | Census, source pins and later main/#241/#238 head recheck complete; final task PR head and CI snapshot pending |
| 2. Central network authorization | Distinguish local operations, RPC, indexer, relayer, approved external resources and unexpected egress; configuration alone is not authority | Policy implementer + lead | Implemented and independently source-reviewed; latest strict policy passes 108/108 focused tests with central-module coverage below; whole-candidate gates pending |
| 3. Own-node enforcement | Preserve selected endpoint; prevent cached/retry bypass and provider fallback; invalidate endpoint/network replacements; scope exceptions; reject unsupported configurations | Policy implementer + lead | Combined endpoint/action/revision binding source-reviewed; controlled native adapter receipt below; actual browser lifecycle qualification pending |
| 4. Cancellation and bounds | Pre-abort, finite deadline and body, obsolete-operation cancellation, hostile fetch/stream cleanup, late-response disposal, bounded retries, fixed errors | Transport implementer | #241 retained and remaining bounded transports implemented; deadline/rollback/body/cleanup paths re-reviewed; lead consolidates final transport receipts |
| 5. Session/reload/cross-tab | Lock, seller/network/endpoint replacement, permission revocation, reload, other-tab settings, sleep/resume and rapid cancellation cannot commit stale results | Policy implementer + lead | Combined lifecycle corrections re-reviewed; regression sources present, including real-tab cases; hosted browser qualification pending |
| 6. Sweep consent | Explicit action and visible endpoint; no reusable blanket consent; revocation reaches cached clients/retries; no fallback; spending authority unchanged | Lead + policy implementer | Action-scoped wiring and exact balance owner/token restrictions reviewed; no-auto-read and revoked-consent browser cases collected but unexecuted locally |
| 7. Privacy controls | Explain current mode, selected endpoint, network requirement, selection source, offline behavior, authorization failures and cancellation; retain theme/mobile/accessibility | Lead | Integrated controls and revised disclosures source-reviewed; full/lean browser and accessibility gates pending |
| 8. Egress inventory | Maintain all relevant surfaces, destination/trigger/authorization, endpoint/redirect/metadata, bounds/errors, implications and coverage | Lead + independent reviewer | Inventory updated for authorization and bounded transports; six maintenance checks and native probes pass within the recorded source boundaries below |
| 9. Security testing | Deterministic fallback/cache/redirect/cross-tab/revocation/stale-session/stream/retry/redaction/background/offline/Sweep cases; actual destinations observed | All implementers + independent reviewer | Focused strict-policy RED-to-GREEN and controlled native evidence recorded below; twelve browser cases collected, zero browser traffic assertions executed locally |
| 10. Independent review | Review endpoint leakage, correlation/tracking, background traffic, DNS/destinations, redirects/headers, cross-tab/cache/session races, fallback and errors; regress every confirmed defect | Independent reviewer | Bounded combined-source review complete after corrections; no unresolved feature bypass found in reviewed code; this does not clear pending runtime gates |
| 11. Integration constraints | Preserve Pages/Tor/HTTPS capability, custody/recovery, Spec 18, signer/checkpoint/adapter/translations, release and security gates | Lead + independent reviewer | Constraint and source-boundary review complete; runtime/integration gates remain required; unrelated #238 failures remain explicit |
| 12. Validation | Applicable transport/adapters/indexer/relayer/session tests; full web units; full/lean Chromium; Pages artifact; inventory; typecheck/lint; secret/security/integration checks | Lead | Focused policy and scoped browser-spec checks pass as recorded; remaining whole-candidate results await the final receipt and unchanged hosted gates |
| 13. Documentation | Explain authorization, own-node, offline/external operations, provider exposure, revocation, cancellation, failures and browser/Tor limits; architecture diagram | Lead + independent reviewer | Integrated developer/user guidance and acceptance ledger written and reviewed; endpoint, browser/Tor and offline-proof limits explicitly retained |
| 14. Deliverables | Enforced policy, endpoint/cache/lifecycle protection, bounded transports, Sweep consent, inventory/tests/review/docs, pinned evidence and reviewable PR | Lead | Source, regression cases, documentation and review published in draft #251; the final schema correction and its required qualification are recorded separately |
| 15. Definition of done | All supported browser surfaces documented; no unauthorized fallback/cache bypass; revocation blocks future dispatch; stale results refused; bounds/redaction/offline/Sweep verified; no unresolved feature blocker | Lead + independent reviewer | No unresolved source bypass found within the bounded review; runtime acceptance remains incomplete until applicable feature and release gates pass |
| 16. Execution | Inspect latest ownership, implement only remaining behavior, reuse #241, test/review/document, commit and prepare PR | Lead | Isolated integration branch and draft #251 created; consult the PR's qualification receipt for the final published child commit/head; no input-branch edits, merge or deployment by this task |

## Source findings that the implementation must close

These findings describe #238 at its pinned head. They are not claims that a later
working tree still contains the same defect.

| ID | Source mechanism / remaining gap | Existing coverage | Required regression or review |
|---|---|---|---|
| NI-01 | `Services.fetchFn` directly forwards and `createRpc` has no action/revision argument. There is no shared authorization context. | Service/unit fixtures | Unknown/unscoped dispatch sends zero requests; each supported network action supplies its expected category and selected destination |
| NI-02 | `loadNetworkSelection` turns malformed/unreadable storage or unacknowledged nondefault selection into direct/single. Runtime guard only inspects the resulting `rpcMode`. | Default-selection parsing tests | Loss/corruption/revocation of a previously restrictive choice cannot authorize an old provider; distinguish UI defaults from permission |
| NI-03 | `createSelectedRpc` rechecks own-node category, but not the currently selected endpoint, session or operation. | `defaultServices.networkGuard.test.ts`: cached request/block/log calls, retry/reconnect, loopback preservation | A replaced same-category endpoint, revoked action and expired session reject every subsequent dispatch/retry |
| NI-04 | AppShell caches promises by chain/URL and only removes rejected creation. It loads Settings once and has no network settings storage listener. | AppShell and Settings tests | Other-tab replacement/removal invalidates old cached and pending clients; no stale settings overwrite; new action uses current endpoint |
| NI-05 | `Scan.begin` captures its plan once. Custom clients bypass `createSelectedRpc`; `openScanClients` has no operation signal/revision. | `scanPrivacy.clients.test.ts` proves initial no-fallback behavior | Revocation, profile change or endpoint replacement during init, verification, jitter/retry, secondary reads and scans stops later dispatch and result acceptance |
| NI-06 | Indexer `source.fetch` receives no caller signal; its abort-only timer cannot settle a hostile fetch/read. | Existing indexer cap tests | Already-aborted request sends zero; stalled fetch/read and never-resolving cancel settle within the requested bound; late response is discarded |
| NI-07 | Esplora's timeout only aborts; declared/streamed oversize paths await cancellation. | #241 handoff records three synthetic reproductions; existing Esplora tests | Independently reproduce ignored abort, declared-cap cancellation stall and streamed-cap cancellation stall, then prove fixes; cover stalled reads as well |
| NI-08 | Relayer post uses abort-only timeout and response reads may stall. It preserves any incoming `UserFacingError`; legacy unpadded retry needs the same live permission. | Relayer client/contract tests | Fixed local errors, no hostile cause/message leakage, bounded reads/cleanup; revocation blocks compatibility retry; preserve `beforeBroadcast` and unknown-after-handoff semantics |
| NI-09 | Sweep balance UI binds payment/chain/asset/URL/factory/session and checks late results, but the returned RPC is not action-scoped. Other-tab settings do not update its scope. | `Sweep.privacy.test.tsx` covers payment/asset/chain/provider/factory/session/lock/unmount | Click authorizes only that action/endpoint; no automatic balance call on mount/reentry; revoke between attempts and during client creation; unchanged signing/attempt safeguards |
| NI-10 | EVM session guards and `appLock` are separate. Idle lock can retain sole-copy seller keys while cancelling sensitive UI. | Session guards, AppShell idle-clock and chain-view lock tests | Invalidate network authority on both session revision and app-lock notification without changing backup/recovery policy |
| NI-11 | BTC/Solana/TRON use injected `Services.fetchFn`, but SDK hygiene is not shared authorization. | Existing chain views; #241 SDK isolation tests | Exercise each shipped adapter under own-node restriction, selection change, revocation, pre-abort and late results; report chain-specific limits |
| NI-12 | Static inventory cannot establish runtime absence of background traffic or browser resource loads. | #241 inventory/static bundle checks and startup e2e | Record browser/native outbound destinations, request method/options and absence of forbidden requests; offline local actions must actually complete |

### Esplora reproduction boundary

The [#241 handoff](../handoffs/BROWSER_NETWORK_ISOLATION_2026-11-18.md)
records three synthetic Esplora reproductions, but contains no executable fixture
for those three cases. The independently inspected source explains the mechanisms:
the timeout invokes `ctl.abort()` without an independently settling race;
`readCapped` awaits `res.body.cancel()` on an oversized declared length; and it
awaits `reader.cancel()` after streamed overflow. `reader.read()` can also remain
pending when cleanup ignores abort. These are transport liveness defects, not
evidence that a native browser followed a forbidden destination. Final regression
evidence must distinguish those two properties.

## Inherited hosted checks: do not count as new-candidate passes

Check-run snapshots were retrieved directly for the exact commits above. All
listed checks had completed at inspection. A successful aggregate does not
substitute for a missing feature-specific assertion.

| Source | Success | Failure | Skipped |
|---|---:|---:|---:|
| #241 `e8857bfa` | 37 | 0 | 3 |
| #222 `2bc20982` | 30 | 7 | 3 |
| #228 `685fe1a3` | 26 | 6 | 3 |
| #231 `d9ff3868` | 31 | 2 | 3 |
| #233 `67cf835d` | 27 | 2 | 3 |
| #238 `198aa5ba` | 31 | 8 | 7 |

The #238 failures are `typescript` aggregate, `ts-test (web)`, `ts-test (rest-0)`,
`ts-lint`, `e2e (full)`, `e2e (lean)`, CodeQL and Mythril. Its standalone
`ts-typecheck` passed. Pages artifact build/Anvil browser, beta acceptance and
integration passed at that source. CodeQL's inline finding refers to the
synthetic `SECRET` fixture in `apps/web/src/views/Settings.test.tsx`; that
observation does not clear the scanner gate. Mythril remains an independently
enforced release blocker and is outside network-isolation remediation.

Relevant runs:

- [#241 final CI 44424428438](https://github.com/djshellshoxxx/GhostPay/actions/runs/44424428438).
- [#238 CI 44342340615](https://github.com/djshellshoxxx/GhostPay/actions/runs/44342340615).
- [#238 Pages 44342340121](https://github.com/djshellshoxxx/GhostPay/actions/runs/44342340121).
- [#238 analyzer run 44342340082](https://github.com/djshellshoxxx/GhostPay/actions/runs/44342340082).

#241's final tree is `837fa8d51c3bf632cb5b56cba654e1a420213651`. Its preserved
evidence includes 193 net-transport tests, 136 Solana tests, 103 TRON tests,
2,763 web tests plus one skipped and a separate three-test suite, 236 script tests,
82 full-browser passes plus one skipped, 70 lean-browser passes plus three
skipped, and 16 Pages artifact browser passes. These counts are historical
evidence, not promises about the new candidate. Retain the independent native
HTTP redirect probes and their source hashes.

## Combined-source validation receipt

This table consolidates executed checks and their remaining limits. The
[machine-readable validation receipt](evidence/network-isolation-completion-validation.json)
retains commands, results and source references. If runtime changes after a
result, rerun the relevant check; a documentation-only descendant can reference
unchanged tested trees when equality is demonstrated.

The initial published draft [#251](https://github.com/djshellshoxxx/GhostPay/pull/251)
has head `089a0081418dcca395ce169abc36d9ef470162ef`. Its tree
`80ad5268b3b095cd01171e8578631647f5056b2e` exactly matches local commit
`7c7af09ff41c87f3fd5ac62f8a09cfb2202c699b`; both tree IDs were independently
checked. The exact-key schema correction was published at
`325a915664b9c8ce44f136d08c6e0ec3c64a6ace`, with tree
`79df61485096126bc0cdb5023f87a6aad0a80c5c`, identical to local commit
`a7b24cc11ee6e9809abf3c92e26ef4ae0f920fb9`. Its source/test hashes are below.
The subsequent Settings assertion correction and evidence update change tests
and documentation only; runtime remains the source published at `325a9156`.
Consult the PR's final qualification receipt for the final published follow-up
SHA and hosted run links; this ledger does not guess a future SHA. Required
gates apply to that head. Earlier focused logs and the initial published tree
do not establish a whole-candidate pass after the schema correction.

| Required check | Final source / command / actual result |
|---|---|
| Network authorization and stale-client regressions | 108/108 focused tests across four files; reviewed `networkAuthorization.ts` SHA-256 `c65e93f414098aa7158fead2b1a8ab19640c448efd0359171f48cb816c807931`; focused coverage and command below. Broader candidate gates remain pending. |
| Network transport package | 200/200 tests; original package coverage gate passed, exit 0. Package source and lockfile unchanged from combined input `2503d7ce` through the initial published tree; details below. |
| EVM RPC adapter package | 562 passed, 22 existing conditional Anvil/solc/artifact cases skipped; original package coverage gate passed, exit 0. The skipped cases remain required in their configured CI environment. |
| Esplora/indexer/relayer regressions | Focused transport/browser/native/Bitcoin selection passed 74 non-scan cases; the mixed run had 76 passes, 3 scan assertion failures and 16 filtered cases, exit 1. The scan assertions omitted the existing error-code prefix; after correction the five-case scan cancellation suite passed. Final Esplora isolation/broadcast suite passed 5/5. These are focused working-tree receipts, not a full web gate. |
| BTC/Solana/TRON consumer and SDK checks | Solana SDK 136/136 and TRON adapter 103/103 with original coverage gates; scan-source 72/72. Selected Bitcoin i18n/native transport cases pass as above. Full chain-view/browser and public-network qualification are not implied. |
| Session, app lock, settings revision and cross-tab checks | Existing Pay/Settings race/Scan auto-rescan/Policy scope/Sweep flows pass 138/138 across five files on schema source `c65e93f4`. AppShell/Settings group passes 58/58 after the independently reviewed test-only assertion correction. Final native/policy/registry composition passes 10/10 on the exact `325a9156` runtime tree. These overlapping focused groups do not replace full coverage or real cross-tab browser execution. |
| Full web unit suite with original coverage thresholds | Unqualified: the local coverage attempt recorded five SellerKeys failures and has no complete passing suite/coverage receipt. One wrong-passphrase case subsequently passed in isolation; that does not clear the other failures or the full gate. The separate existing no-coverage configuration passed 3/3; hosted full web qualification remains required. |
| Full Chromium suite, including real request interception | Local Chromium launch blocked by native socket denial before any test body. The new 12-case spec is collected and scoped-typed/lint checked; hosted execution pending. |
| Lean Chromium suite, including real request interception | Pending hosted execution; repeating the same local browser launch restriction would not provide a result. |
| Pages artifact verification / applicable Anvil browser checks | Included Pages static/output/server/smoke and local build-profile tests passed in the frozen Node run; this is not an executed Pages artifact browser journey. Hosted artifact build and Anvil browser qualification remain pending for the final head. |
| Inventory maintenance, bundle guards and native destination probes | Six inventory tests and all 18 native isolation subtests plus their parent passed in the frozen Node run. Diagnostic Vite build, CSP stamping and bundle scanning completed. Whole Node command failed 3 tests, classified below; no aggregate pass is claimed. |
| Typecheck and lint | Changed-production import-closure typecheck passed. All 28 scoped UI/helper/test files pass unchanged typed ESLint rules after the four AppShell diagnostics were corrected; transport, browser-spec and latest central-policy scoped checks also pass. Full-project attempts exited 137 or were killed; unchanged hosted full gates remain pending. |
| Secret scanning and relevant existing security/integration checks | Final local secret scan reports no committed env files or key material. Privacy source invariants passed 34/34; i18n validation reports 0 errors and 526 warnings across four catalogs. Frozen Node script suite: 349 passed, 3 failed, 0 skipped; two inherited dependency-closure failures and one GPG fixture setup failure remain explicit below. Hosted security/integration gates are not cleared by these local results. |
| Independent privacy review and regression re-review | Bounded combined-source review complete after the recorded corrections; no unresolved feature bypass found in reviewed paths. Latest strict-policy RED-to-GREEN evidence independently inspected. Browser runtime qualification remains pending. |
| Final remote head/tree and required CI snapshot | Main/#241/#238 and the initial #251 head/tree rechecked as above. Initial CI `changes` passed and full/lean jobs were queued when the schema follow-up was prepared; Pages validation was also queued. Final head and timestamped hosted results belong to the PR's final qualification receipt. No outcome is promised or inferred. |

Hosted snapshot at **2026-11-19 07:11:41 UTC**, initial head `089a0081`:
[CI run 44474577078](https://github.com/djshellshoxxx/GhostPay/actions/runs/44474577078)
had a successful `changes` job, queued full/lean browser jobs and queued
`secrets-and-egress`;
[Pages run 44474577070](https://github.com/djshellshoxxx/GhostPay/actions/runs/44474577070)
had both artifact build and Anvil browser jobs queued. Its publication-only
release job was correctly skipped on a pull request. These are historical queue
observations, not results for the final schema-corrected head.

The documented commands are in [CLAUDE.md](../../CLAUDE.md), workspace package
scripts and the unchanged CI workflows. Builds must rebuild changed libraries
before testing consumers that import their `dist` files. A browser collection
listing, launch failure, skipped test or mocked-return-value assertion is not an
executed network acceptance pass.

### Package coverage receipts

The five existing package test scripts retain their coverage includes, excludes
and thresholds; only `--maxWorkers=1` was appended. All exited 0, for **1,073
passes and 22 conditional skips**. The exact commands and per-package logs are
in `bounded-package-results.jsonl` and `bounded-package-results.json` in the
task evidence. Git comparison independently found no changes to these five
package trees or `package-lock.json` between combined input
`2503d7ce9ab519783dca3f0a4d6fade6459609b8` and initial PR head `089a0081`.
The final app-policy correction does not modify those package files.

| Package | Passed / skipped | Coverage: statements / branches / functions / lines |
|---|---|---|
| `@ghostpay/net-transport` | 200 / 0 | 97.66% / 96.20% / 96.62% / 98.01% |
| `@ghostpay/chain-adapters` | 562 / 22 | 97.46% / 96.45% / 99.11% / 98.98% |
| `@ghostpay/scan-source` | 72 / 0 | 98.76% / 95.82% / 100% / 100% |
| `@ghostpay/solana-stealth` | 136 / 0 | 97.48% / 95.07% / 98.09% / 99.17% |
| `@ghostpay/tron-adapter` | 103 / 0 | 96.98% / 93.30% / 98.92% / 99.08% |

The 22 adapter skips are the existing `router.anvil`, `quote.anvil` and
`payments.anvil` conditions. Their configured `REQUIRE_ANVIL=1` CI execution
remains required. They are neither counted as passes nor removed from the gate.

### Frozen Node suite and remaining failures

At local `7c7af09ff41c87f3fd5ac62f8a09cfb2202c699b`, equal in tree to initial
PR head `089a0081`, the following unchanged command exited **1**, with **349
passed, 3 failed, 0 skipped, 352 total**:

```sh
node --test --test-concurrency=1 scripts/tests/*.test.mjs scripts/pages/*.test.mjs apps/web/scripts/localBuildProfile.test.mjs
```

All included Pages/profile, inventory and native isolation cases passed. The
three failures are not waived:

| Failure | Evidence and classification |
|---|---|
| Web workspace dependency closure | `@ghostpay/hygiene` and `@ghostpay/metadata-hardening` are outside the existing reviewed/pending lists. An isolated fixture using the exact #238 guard and all 68 app/package manifests reproduces this failure. Those inputs are unchanged in the initial #251 tree. |
| Relayer workspace dependency closure | `@ghostpay/metadata-hardening` is outside the unchanged reviewed list. The same exact-#238 fixture reproduces this second failure. The original main inputs pass both closure checks; the introduction is attributable to the dependency baseline, not this task's network-authority delta. |
| PGP release-tag verification fixture | Throwaway key setup fails before tag verification: `/usr/bin/gpg-agent` exits 2 with `General error` / `No agent running`. The test is unchanged from #238. The underlying agent-start cause is unestablished; this is a local fixture setup failure, not a passing verification or a demonstrated product regression. |

Receipts: `frozen-node-suites.log`, `frozen-node-suites-results.json`,
`lean-closure-pr238-baseline.log`, `lean-closure-pr238-baseline.json` and
`lean-closure-provenance.json`. Neither dependency guard list was expanded.
The CI script shard still exposes the inherited closure failures.

### Additional scoped receipts and limits

On reviewed authorization source `c65e93f414098aa7158fead2b1a8ab19640c448efd0359171f48cb816c807931`,
`network-existing-flows-final.log` records **138/138 passes in five files**
(91.34 seconds). The command from `apps/web` was:

```sh
node --max-old-space-size=640 --max-semi-space-size=8 ../../node_modules/vitest/vitest.mjs run src/views/Pay.test.tsx src/views/Settings.race.test.tsx src/views/Scan.autoRescan.test.tsx src/features/policy/PolicyView.scope.test.tsx src/views/Sweep.test.tsx --coverage=false --maxWorkers=1 --no-file-parallelism
```

This focused integration receipt does not replace full web coverage or hosted
browser execution.

The seven-file AppShell/Settings group initially had **55 passes and three
failures** at `325a9156`, recorded in `network-shell-settings-325a915.log`.
Two assertions expected the old "Scan privacy settings saved" copy; the third
expected the old pending text and a displayed active Direct mode while a saved
nondefault selection was unacknowledged. Independent review confirmed that the
existing runtime deliberately blocks that state. Only `Settings.test.tsx`
changed: it now checks the current save text, the actual saved Tor selection
with `noticeAcknowledged: false`, the blocked notice and absence of an active
mode before acknowledgment, active Tor after acknowledgment, and renewed
blocking after another choice clears acknowledgment. No runtime, mock,
coverage rule, skip or gate changed.

The identical seven-file command then passed **58/58** in 129.01 seconds;
`network-shell-settings-green.log` is the independently read receipt. The
changed test also passed original-option import-closure TypeScript checking
with zero diagnostics and unchanged typed ESLint rules with zero errors or
warnings (`settings-test-static-325a9156.log`). From `apps/web`:

```sh
node --max-old-space-size=640 --max-semi-space-size=8 ../../node_modules/vitest/vitest.mjs run src/AppShell.idleClock.test.tsx src/AppShell.i18n.test.tsx src/AppShell.frameGuard.test.tsx src/AppShell.beforeUnload.test.tsx src/views/Settings.test.tsx src/views/Settings.scanPrivacy.test.tsx src/views/Settings.exchange.test.tsx --coverage=false --maxWorkers=1 --no-file-parallelism
```

`network-ui-focused-final.log` records 48/48 in six focused UI files;
`app-shell-network-final.log` and `app-shell-final-results.json` record the
subsequent three-case AppShell pass and same-rule lint rerun at `7c7af09f`.
`ui-lint-batch-results.jsonl` records the other four clean batches; together the
five batches cover all 28 requested UI/helper/test files. Original compiler
options and complete import closures were used; only the temporary root sets
were restricted. These do not substitute for whole-project checks.

Transport receipts are `bounded-final-focused.log`,
`scan-authorization-final.log`, `esplora-isolation-final.log`,
`bounded-scoped-typecheck.log` and `bounded-scoped-lint-final.log`. The earlier
111-test transport pass predates the cross-realm and final cancellation
corrections and is retained only as historical evidence. The final focused
scan rerun corrected expected message prefixes without changing runtime
behavior or weakening cancellation assertions.

`privacy-invariants-green.log` records 34/34 after the source guard was updated
to the actual authorization/bounded-request boundaries. It continues to pin
credential, referrer, redirect and cache protections. `network-i18n-final.log`
reports four catalogs, zero errors and 526 untranslated-text warnings; that is
not a complete localization claim. `network-secret-scan-final.log` reports no
committed env files or key material.

`web-nocov-final.log` records the existing separate no-coverage configuration's
three tests passing. `web-full-coverage.log` remains an incomplete, failing
local receipt; `sellerkeys-wrong-passphrase-candidate-7c7af09f.log` establishes
only the selected case's isolated pass. Full web, full/lean browser, Pages
artifact and unchanged hosted security gates remain required on the final head.

## Independent review of the combined working tree

This review examines the new runtime wiring as well as the authorization helper.
The review findings below were identified independently from the implementation's
test claims. The later lead-reported unknown-key case is separately identified;
its failing regression and correction were also independently inspected. All
corrections were re-read in the combined source. Executed focused receipts and
the remaining runtime qualification are distinguished below.

| Finding | Concrete mechanism | Implementer response / qualification |
|---|---|---|
| Request deadline after sleep | An abort timer alone could lose to a response queued while the browser slept; a ten-minute grant idle check did not enforce the thirty-second request deadline. | Policy implementer added request wall-clock checks before/after dispatch and each body read, including clock rollback. Source re-read confirms the checks; included in the 108-test policy receipt below. |
| Payment reauthorization after cancellation | AppContext revision changed `Pay.refreshContext` identity, causing its effect to mint a fresh preflight grant immediately after global cancellation. A pending delay could independently call the refresh callback later. | Lead made refresh identity stable, bound initial authorization to the invoice/revision, cancelled the scheduler on revocation and added an explicit review-network action. Source re-read confirms those paths; browser regressions count requests before/after cancellation and second-tab replacement. |
| Old invoice grant survives replacement | Resetting the payment UI/flow revision did not revoke the old preflight RPC's transport grant, allowing its internal retry after fragment replacement. The first correction also retained an obsolete controller in effect cleanup after explicit renewal. | Lead added per-fragment cancellation, cleanup of the current renewed controller, and a captured fragment/revision check before runtime/buffer clients can acquire grants. Source re-read confirms these paths. A new browser case holds a renewed chain check, replaces the invoice, then requires native request cancellation before releasing the old failure. |
| Settings overwrite and stale Test retry | An open form retained its old inputs after another tab updated Settings. Editing an input invalidated only the Test result label, leaving the old grant able to retry. | Lead added form synchronization, a saved-storage revision check before write, per-chain test controllers aborted on edit/new test/unmount, and storage-revision checks in profile/scan subforms. Source re-read confirms these changes; browser regression execution remains blocked. |
| Scan completion after network revocation | The completion block skipped its scope assertion when aborted, then wrote old telemetry, lag, done/error state and a finished announcement. Its catch guard checked only seller-session identity. | Lead bound completion/catch writes to current network and selected key/chain scope, and final cleanup to the owning run. An immediate ref-based permission check prevents a queued automatic rescan timer from acquiring a new grant before React finishes its cancellation render. Source re-read confirms the checks; focused behavioral regression receipt pending. |
| Deferred policy action after revocation | A policy withdrawal waiting for a browser lock could acquire it after cancellation, pass a deployment/session-only guard, then mint a new RPC grant inside its preparation callback. | Lead bound policy deployment assertions to network revision and a deployment signal, checked them before acquiring fresh clients, and added corresponding registry revision/signal guards. Source re-read confirms these paths; the five-case policy/registry lifecycle receipt and its source boundary are recorded below. |
| Malformed preference degrades to permissive default | Snapshot validation used nullish-coalescing defaults before type validation. Present `rpcMode: null` became single-node mode and `requireProxy: null` became false. Related malformed shaping fields or custom endpoint maps could be normalized away before a new action acquired a grant. | Independently observed failing regressions: six null-field, twelve shaping/lane, and six endpoint-map cases. Policy implementer added absence-only defaults, bounds/type checks matching the saved privacy schema, and strict endpoint-map validation. Source re-read confirms those corrections; included in the latest 108/108 focused pass. Two browser refusal cases await hosted execution. |
| Unknown privacy key is mistaken for an absent control | Lead found that `requireProxyy: true` and `privacySetTransferss: true` survived decoding as unknown fields, while the intended controls received permissive absent-field defaults. Each reproduction authorized payment preflight and dispatched once. | Independently inspected both RED results and the correction. Exact own-key checks now match all eleven saved scan-privacy fields and all three saved lane fields before defaults. Exhaustive type-only schema links prevent silent list drift without adding runtime imports. Empty legacy records remain accepted, and the positive boundary test includes every current saved field. Both refusals pass with zero dispatch in the 108-test receipt. |
| Alternate view navigation leaves a grant live | Backup-banner navigation bypassed AppShell's invalidating view setter. A completed scan can retain its proof RPC intentionally, so a route change must revoke that retained grant as well as an active scan controller. | Lead routed real hash/banner/error-boundary transitions through the invalidating fragment/view paths. Source re-read confirms those paths. This changes network lifecycle, not backup or recovery contents. |

After the recorded corrections, the bounded independent source review found no
remaining feature bypass in the inspected authority, service, transport and
consumer lifecycle paths. This conclusion covers the reviewed code, not an
unexecuted browser result. Exact-source focused qualification and the hosted
full/lean browser and whole-project gates remain necessary; the feature is not
cleared for completion or release by source inspection alone.

The new browser spec, `apps/web/e2e/network-authorization.spec.ts`, uses genuine
same-origin tabs, one-time public preference setup, the actual built worker and
browser request events. It does not inject seller keys or rewrite preferences on
every reload. The controlled RPC fixture provides chain evidence only. The first
nine cases were discovered by the browser runner; source re-review added the
invoice-replacement case and two null-policy refusal cases. The final collection
command reports **12 tests in one file**, exit 0.

### Actual local browser attempt and boundary

A diagnostic config outside the repository imported the unchanged Playwright
config, retained its manifest fixture and Chromium projects, and used Vite build,
CSP application and bundle scanning before preview. Only the separately tracked
full TypeScript step was omitted from this diagnostic build because it had
repeatedly exited 137. It does not replace that gate.

Vite build, CSP application and bundle scanning completed. Chromium was invoked
as `/usr/bin/chromium` with one worker, but its process-singleton socket creation
failed with `Operation not permitted` in `process_singleton_posix.cc`, followed by
`SIGABRT`. Seven repeated launch fixtures failed before any test body; the
equivalent remaining launches were stopped (runner exit 130). **Zero browser
traffic assertions executed.** Full and lean browser qualification therefore
require an environment permitting Chromium's native sockets, such as the
unchanged hosted workflow. No browser pass, Tor connectivity result or complete
feature acceptance is inferred from successful build or test discovery.

The diagnostic receipt is `network-browser-full.log` and the corresponding
`network-browser-results/*/error-context.md` in the task's scratch directory.
The temporary runner is `network-browser.config.mts`; no repository build or
browser configuration was weakened. An initial typed ESLint attempt against the
full project exited 137. The final spec subsequently passed the unchanged
repository ESLint rules with a temporary reduced TypeScript root graph (exit 0),
and the original compiler options over that spec and its full import closure
reported zero diagnostics (exit 0). Receipts are `network-e2e-lint.log`,
`network-e2e-typecheck.log` and `network-e2e-collection.log`. These scoped checks
do not qualify full-project lint or typechecking.

### Focused policy qualification at review freeze

The independently read latest policy log reports **108/108 tests across four
files**. Coverage measured only `src/lib/networkAuthorization.ts`: statements
93.50%, branches 92.21%, functions 93.22%, lines 99.32%. This is **not full web
coverage**. Its tested and independently re-read authorization SHA-256 is
`c65e93f414098aa7158fead2b1a8ab19640c448efd0359171f48cb816c807931`.
The test source SHA-256 is
`abd2cc29683ababdf004875bf7cdd4751050b8c403792811b1a102d14cb817c5`.
`defaultServices.ts` remains
`5beabcc2cf559f28af4553b367272d9d44c8ae62e87e8597a76d6f2929481c69`.
Bitcoin budget review confirmed that the existing 64 MiB
block-JSON allowance is cumulative across pages individually capped at 16 MiB;
it does not require relaxing the central per-request cap. An additional focused
regression checks that aggregate behavior.

The focused command from `apps/web` was:

```sh
npx vitest run src/lib/networkAuthorization.test.ts src/lib/defaultServices.authorization.test.ts src/lib/defaultServices.test.ts src/lib/defaultServices.networkGuard.test.ts --coverage --coverage.include=src/lib/networkAuthorization.ts --coverage.reportsDirectory=/workspace/scratch/e4cd51001ae8/network-policy-schema-coverage --maxWorkers=1 --no-file-parallelism
```

The post-publication schema receipts are
`network-policy-unknown-schema-red-089a008.log` (two failures, each with one
unexpected dispatch) and `network-policy-unknown-schema-green-089a008.log`
(108 passes). This supersedes the earlier 106-test policy receipt at SHA-256
`e6be27bee98f6e700c4b4a5490f99ce1ee9f88e51139451abe2a56a3946cd630`.
The same-source `network-policy-unknown-schema-static-089a008.log` reports zero
TypeScript diagnostics over the central source/test import closure and zero
errors or warnings under the unchanged repository ESLint rules. These scoped
checks do not replace the pending full-project gates.

The independently read `network-policy-composition-a7b24cc.log` records **10/10
passes in three files**, 14.66 seconds: five policy/registry lifecycle tests and
five native adapter tests. Before and after execution the clean local commit
was `a7b24cc11ee6e9809abf3c92e26ef4ae0f920fb9`, tree
`79df61485096126bc0cdb5023f87a6aad0a80c5c`; this exactly matches published
`325a915664b9c8ce44f136d08c6e0ec3c64a6ace` and contains the final exact-key
correction. It supersedes the earlier composition receipt at `1960318b`.
The command from `apps/web` was:

```sh
npx vitest run src/lib/networkAuthorization.adapters.test.ts src/features/policy/PolicyView.network.test.tsx src/features/registry/RegistryView.network.test.tsx --coverage=false --maxWorkers=1 --no-file-parallelism
```

These are focused composition results, not full web coverage or browser
qualification. The policy/registry cases deliberately ignore abort in their
fake RPC while verifying that old results and queued lock callbacks cannot
regain authority.

`networkAuthorization.adapters.test.ts` uses actual native HTTP
servers: Esplora/Solana/TRON requests reach the chosen loopback destination, then
revocation permits no further dispatch; a stale cached/new EVM selection is
blocked; a redirect to a separately counted forbidden origin receives zero
requests. These establish native adapter/policy composition under controlled
conditions. They do not stand in for cross-tab browser flows or real Tor access.

The final new browser spec SHA-256 is
`c2b362e904c72fb3622d136be946787f6d1eca50340b7f7daf06aaa00894106b`.
Its twelve cases include the independently found cancellation, fragment
replacement, stale form and null-policy regressions. The same-rule scoped lint,
original-options scoped typecheck and collection receipts apply to that source;
runtime traffic assertions remain unexecuted locally.

## Planned browser and native traffic acceptance

Tests must count destinations actually requested, not only inspect a mock's
return value. Test-only endpoints and synthetic accounts must not contact public
providers or carry production credentials.

| Scenario | Observable acceptance |
|---|---|
| Startup and local operation | App loads required same-origin resources; no RPC/indexer/relayer/telemetry request occurs merely because an endpoint was saved. After loading, offline key/invoice/QR/file operations remain usable. |
| Required path vs direct provider | With an acknowledged restrictive choice and a configured direct provider, an unauthorized action or fallback sends zero requests to that provider. An explicitly authorized selected endpoint is the only contacted service. |
| Endpoint replacement in another tab | Hold an old response, replace/remove the endpoint in a second same-origin tab, then release the response. The first tab rejects stale results and no retry/background action reaches the old endpoint. A fresh authorized action uses the new selection. |
| Payment cancellation and delayed preflight | Cancel a loaded invoice or replace its endpoint in another tab. No effect, pending delay or automatic refresh mints a new grant. An explicit review-network action can authorize the current destination again. |
| Open Settings in two tabs | A second-tab saved replacement updates the first form. A later first-tab save preserves that endpoint and sends no network request merely because preferences changed. |
| Sweep entry, explicit balance and reentry | Entering Sweep sends no one-time-address balance request. A visible endpoint/action click permits the intended request. Reentry, revoked consent, changed payment/asset/session or delayed client creation does not replay the old action. |
| Redirect refusal | Controlled first server returns a redirect to a separately counted forbidden server. The forbidden destination receives zero requests; no cookies/referrer or request body is sent there. |
| Hostile fetch/stream and late delivery | Independently bounded caller settlement despite ignored abort or never-resolving cleanup; late body is discarded; late results cannot modify current view/settings. |
| Lock/sleep/reload | Lock and session replacement invalidate authority; resumed or reloaded code cannot reuse old action permission. Same-tab and cross-tab tests expose no secret material in synchronization messages/storage. |

Browser selectors and operation APIs must be read from the integrated source
before writing the new tests. Existing journeys retain their spend, nonce,
signature, dust, journal and receipt assertions; adding consent steps must not
remove the behavior those journeys validate.

## Privacy and platform limits

Application authorization governs application-controlled dispatch. It cannot
recall a request already sent, erase a provider's records, enforce the behavior
of wallet extensions, control the browser's DNS/TLS stack or undo public-chain
links. A cancellation after transaction submission does not prove that the
transaction was never submitted; attempt-journal uncertainty must survive.

An RPC/indexer/relayer can observe its requested addresses, transactions, ranges,
payloads, timing and connection metadata. Selecting an own node reduces the
third-party observer set; it does not remove on-chain correlation or prove the
node operator's behavior. No-referrer does not suppress the browser's CORS
Origin header. User-selected query/path credentials must not appear in errors,
logs, cross-tab invalidations or newly persisted consent records.

The existing own-node mode recognizes supported loopback/v3-onion forms; not
every endpoint is accepted by every chain adapter. HTTP loopback exceptions,
TRON base-path restrictions, Solana selected query configuration, browser CORS,
mixed-content/local-network rules and current CSP must be tested and documented
per actual adapter. Reject unsupported configurations predictably without
substituting a public provider.

The page cannot establish SOCKS routing or verify that it runs in Tor Browser.
The ambient `tor-browser` selection uses the browser's transport. A local proxy
is an explicitly selected service whose forwarding behavior is outside the
page's proof. HTTPS support, Tor hosting capability and application-level
authorization are separate properties; loopback/native fixtures do not qualify
real Tor connectivity.

Static HTML/scripts/styles and other browser resources load before app policy
executes. The same-origin host sees that navigation and can replace the app; an
in-app hash display is not independent host integrity proof. A broad CSP
`connect-src` allowance enables user-selected endpoints but is not permission to
send a sensitive action. Static inventory checks and browser interception cover
their stated source/flows, not every external extension or browser component.

The feature is complete only after its final-source acceptance and independent
review are recorded. GhostPay release readiness still depends on its separate
security, analyzer, dependency and external-acceptance gates.
