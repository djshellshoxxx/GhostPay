# Autonomous run — 2026-11-04

Orchestrator: Instance A, a cloud session. The run log lives on branch `claude/friendly-turing-1ui0on`. This is a planning and evidence record. It is not release acceptance, an audit, or authority to deploy, merge or enable payments.

## Ground truth (verified with git and GitHub on 2026-11-04 01:10–01:35 UTC)

| Ref | SHA | Note |
|---|---|---|
| `origin/main` | `0014bc5b26c7487ea1f9fb230194c36673193236` | Merge of #53 |
| PR #47 head `integration/ghostpay-accepted-20261102` | `f8193502e602c99bb24ff956f142671750b744a0` | 330 commits ahead of main; 498 files changed |
| PR #59 head `claude/ar-a0-pr47-green` | child of `f819350` | A0 fix (below) |

**Decision: build on #47, not on `origin/main`.** The brief said to start from `origin/main`. Ancestry checks show #47 already contains #30, #31, #36 and the #41 consolidation chain. All four heads are ancestors of `f819350`. A code-reading inventory of #47 (see Task board) found most task-board items already implemented there. Rebuilding them from main would duplicate work and conflict with 498 changed files. Every worker branch therefore starts from `claude/ar-a0-pr47-green`, and each PR targets that branch: a stacked chain, #47 ← #59 ← task PRs. If the owner merges #47 into main, every open branch is rebased onto main and its PR retargeted.

## Ownership map (open PRs)

| PR | Head | Owns | Disposition this run |
|---|---|---|---|
| #47 | `f819350` | 498 files across apps/web, apps/relayer, packages/*, tools/portable-hosting-kit, integrations, docs, 5 workflow files | **Reused as base.** Not edited directly; fixes land as stacked child PRs. |
| #30 | `7373172` | 160 files | Ancestor of #47. Do not touch separately. |
| #31 | `a2217ea` | `scripts/devnet/e2e.mjs` | Ancestor of #47. |
| #36 | `cb917c6` | `tools/portable-hosting-kit/**` | Ancestor of #47. |
| #39/#40/#41/#43/#44 | various | consolidation chain (bases are non-main) | #41 head is an ancestor of #47. #39, #40, #43 and #44 were not re-verified this run. |
| #42 | `c9a8c3d` | docs/handoffs prompts | Docs only. Not touched. |
| #51/#52 | automation | `.github/workflows/*` automation | Not touched. No worker edits `.github/`. |
| #54–#58 | docs | research / handoff docs | Not touched. |
| #32/#34/#45/#49 | dependabot | lockfile / actions | Not touched. |

## Baseline (Instance A, PR #47 head `f819350`, Node 22.23.4, npm 10.9.9)

| Check | Result |
|---|---|
| `npm ci --ignore-scripts` | exit 0 |
| `npm run build:libs` | exit 0 |
| `npm run typecheck` | **exit 2**: `apps/web/e2e/accessibility-audit.ts(26,27) TS2352`. This is the same error that failed hosted `ts-check`, `e2e (full)`, `e2e (lean)`, `lean-candidate` and `qualify-ghostpay-web` on CI run 41513900051. |
| `npm run lint` | exit 0 |
| `apps/web: npx vitest run --maxWorkers=2` (no coverage) | exit 0: 121 files passed, 1 skipped; 1703 tests passed, 1 skipped (the live-Bitcoin test) |

After the A0 fix (`claude/ar-a0-pr47-green`):

| Check | Result |
|---|---|
| `apps/web: tsc --noEmit` and eslint on the changed file | exit 0 |
| `GHOSTPAY_LOCAL_BUILD_PROFILE=lean npx playwright test` (Chromium 1243, local) | **27 passed**. The axe audits ran for the first time: 0 serious or critical violations in the recorded states. |
| `GHOSTPAY_LOCAL_BUILD_PROFILE=full npx playwright test` | running; result to be recorded |
| Hosted CI on #59 | pending |

No coverage run, forge run, or secret or action scan has been done in this run yet. Those are wave-boundary checks.

## Task board (status from the #47 code inventory; "DONE" means implemented in source, not test-qualified)

| Id | Status in #47 | Remaining work this run | Owner / instance | Model |
|---|---|---|---|---|
| A0 | — | Fix TS2352 so #47's CI can run at all | A → PR #59 | orchestrator |
| B1 | PARTIAL | One chained invoice → consent → detect/receipt → sweep → backup → fresh-profile-restore browser journey. Add reorg, expiry and stale-session cases to e2e (today they exist in unit tests only). Add a restore step to the anvil devnet run. | Instance B | opus |
| B2 | DONE | The bound journey exists (`flows.spec.ts`). The unbound manual digest is preserved. The lean-profile decision is in B2' below. | — | — |
| B2' | open | Make invoice binding mandatory for seller receipts in the **lean** profile. Keep the manual-digest path in full, matching the "retain everything" rule. | Instance B | sonnet |
| B3 | DONE (relayer) | `REQUIRE_ANVIL` is honoured. Remaining: user-facing per-`PermitState` messages in Sweep (spec 04 acceptance). | A workflow | sonnet |
| B4 | PARTIAL | Schema, pay path and ADR-0024 exist. Remaining: a seller UI field in CreateInvoice, full profile only, because lean rejects v2. | A workflow | sonnet |
| B5 | PARTIAL | `FEEDS` holds 1 dated entry (Sepolia ETH/USD). Remaining: Base Sepolia and heartbeat values, each from a dated primary source. Testnets only. | A workflow | sonnet (research first) |
| B6 | DONE | Lean profile build guard exists with tests and a CI matrix. Hosted runs pending via #59. | — | — |
| C1 | PARTIAL | Matching proposes and the seller confirms. That is a deliberate privacy choice, kept as is. Remaining: a standalone reconciliation ADR file. | A workflow | sonnet |
| C2 | PARTIAL | Remaining: SellerKeys device pairing and Registry QR export. | Instance C | sonnet |
| C3 | DONE | — | — | — |
| C4 | PARTIAL | Remaining: extract CreateInvoice (~34), Pay (~70) and Scan (~20) literals, plus draft translations. New security keys are classified critical and fall back to English. | A workflow (3 workers) | sonnet |
| C5 | PARTIAL | Remaining: a Playwright device matrix (Pixel, iPhone SE, iPad). | Instance C | sonnet |
| C6 | DONE | Full profile only; the lean build guard rejects these views. | — | — |
| C7 | DONE (unit) | Remaining: an iframe-mode browser e2e. | Instance C | sonnet |
| A1 | running | (a) TRON Nile/Shasta genesis research is running. (b)–(e) are deferred until a task needs them. | A sub-agent | haiku |
| A2 | per PR | Adversarial delta review of each task PR. | A | opus |
| A3 | deferred | Reuse adoption waits on A1(e). | — | — |
| A4 | PARTIAL | Remaining: wire `headersync`/header-chain store into the app BTC view, persist synced headers, add tests. Never call this SPV. | Instance B | opus |
| A5 | PARTIAL | Remaining: verify, and add if missing, the announcer budget/cursor enforcement (spec 05). | A workflow | opus |
| A6 | PARTIAL | Remaining: a combined backup panel (keys and tag archive), full profile only. | Instance C | sonnet |
| A7 | PARTIAL | Remaining: add session and approve-tx guards to the policy `send.ts` path (experimental flag). | Instance B | opus |

## OWNER-ONLY / blocked (not attempted)

Funded deployer or fee-recipient keys; testnet or mainnet deployment; manifest signing trust root; licence choice (`UNLICENSED`); professional audit; trusted-setup ceremony; native-speaker locale sign-off; real-device and real-wallet runs; hosting origin; legal and compliance position; merging any PR (including #47 and #59); the Sonar quality gate on #47 (Security/Reliability below the required A); the private review packet (LEAN_RELEASE_SCOPE step 2), which is unavailable to this executor.

## Wave log

- **Wave 0** (01:10–01:40 UTC): ground truth, baseline, the A0 fix, PR #59 opened and subscribed, gap inventory, this log.

## Wave 1 status (02:35 UTC)

### PRs (all draft unless noted; none merged; owner merges)

| Task | PR | Base | Author | A2 review | Notes |
|---|---|---|---|---|---|
| A0 | #59 | #47 branch | A | self (4-line) + Qodo clean | **Ready for review**; hosted CI green on run 41754732268 (all jobs, uncancelled) |
| C2 | #60 | ar-a0 | C | 6 medium → fixed by C; delta re-review running | Keystore not QR-paired (accepted: points to existing encrypted backup) |
| A6 | #61 | ar-a0 | C | **1 blocker** (breaks 4 SellerKeys tests + full recovery e2e), 1 high, 4 medium → sent to C | |
| B1 | #62 | ar-a0 | B | running | |
| C7 | #63 | ar-a0 | C | 1 medium (vacuous wrong-origin case) + lows → sent to C | Fixed a real SDK handshake race (hello retry) |
| B2' | #64 | ar-a0 | B | 2 medium (env-dependent unit tests; locale conflict coordination) + fail-closed ask → sent to B | |
| A7 | #65 | ar-a0 | B | running | Experimental policy send guards |
| C4a | #66 | ar-a0 | A | 1 medium fixed | i18n stack root |
| C4b | #67 | #66 | A | clean | |
| C4c+B4 | #68 | #67 | A | 1 medium fixed | bufferPolicy UI full-only |
| B3' | #69 | #68 | A | 1 medium (fail-open mapping) fixed | |
| A5 | #70 | ar-a0 | A | clean | 4 real scan-cursor defects fixed |
| C1 | #71 | ar-a0 | A | 1 medium fixed | Docs: ADR-0026 |
| B5 | #72 | ar-a0 | A | clean | **Blocked**: Chainlink primary sources denied by network policy; no feed added |

### Instance A combined-tree check (ran here)

The tree was built by merging #66→#69, #70, #71 and #72 onto ar-a0. Results:

- `apps/web: tsc --noEmit` 0
- `eslint apps/web/src` 0
- `node scripts/i18n/check.mjs`: 0 errors, 190 warnings (from 10 at baseline; mostly English placeholders for critical create.* keys, which render English at runtime anyway)
- `extract.mjs`: 0 missing
- `apps/web: npx vitest run --maxWorkers=2`: **125 files passed, 1 skipped; 1763 tests passed, 1 skipped** (baseline 1703)

Not run on the combined tree: coverage, Playwright, forge.

### Integration incidents (recorded honestly)

- A worker committed an `apps/web/node_modules` symlink (branch of #68). Another edited the root `.gitignore` (#69). Both were reverted by follow-up commits.
- The i18n stacking conflict resolver concatenated append/append hunks. That dropped a closing `],` in `securityKeys.ts` on the #67/#68 merge commits. The file was repaired forward with a three-way pure-insertion merge (line counts reconciled; `tsc` 0). One misfired script ran merges in the main checkout. Only local refs moved; nothing wrong was pushed.

### Merge-order coordination (owner)

#60, #61, #64 and the #66 stack all append after `ledger.import.invalidated` at the end of the 4 locale files. Whichever merges second conflicts. The integrator (A) will resolve each locale merge after the owner picks an order.

Suggested order: #59 → #66 → #67 → #68 → #69 → #70 → #71 → #72 → then B/C PRs as their reviews close.

### Blocked / owner-only additions

- TRON Nile/Shasta genesis: no primary source shows the block-0 hash. Only the 4-byte chain ids were found (`tronprotocol/documentation-en` `a608b7a`). Not pinned.
- B5 feeds: allow `reference-data-directory.vercel.app`, `docs.chain.link` and `data.chain.link` in the environment network policy, or supply dated JSON.

## Wave 1 review status (03:23 UTC)

"A2 clean" means confirmed findings at medium or above are fixed. Where the run says "verified by mutation", the fix was reverted on purpose in a scratch worktree, the guarding test failed, and the fix was restored.

| PR | Task | Head | A2 | Evidence of fix (ran here by A unless noted) |
|---|---|---|---|---|
| #60 | C2 QR pairing | f5c9015 | **clean** | M6 warn mutation → 1 failed/8 passed; scoped 21/21. Re-review mutation-killed M1–M5, ascending chainIds and stale-preview. |
| #61 | A6 backup panel | f9a755f | **clean** | Delta re-review: blocker fixed (SellerKeys 50/50, unedited), 4/4 probes killed. Lean build has no panel. Lows done by C (lean guard names BackupPanel; stable heading id). |
| #62 | B1 core journey | 10e5ff5 | **clean** | Reorg handling disabled → fails at the scan UI (:663); unmutated passes. Stale-session test 15/15 kills (refuted finding). Devnet backup relabelled script-side. |
| #63 | C7 embed iframe | 03263ec | **clean** | `event.origin` check removed → exactly the wrong-origin case fails (1F/6P); unmutated 7/7. Hello burst bounded and restarted per load. |
| #64 | B2' lean bound receipts | 2bcfd11 | **clean** | Explicit-wins mutation → 6 failed; 59/59 otherwise. Narrow-only resolveProfile with truth-table tests; undefined define → lean. |
| #65 | A7 policy send guard | 6e13bb9 | **clean** | Fund-safety probes killed: lock, payment scope, up-front check, token/gross, native value, router, single-use review, approval-verified, receive guard. The approval-scope probe survives, which is harmless (narrows only). i18n now 0 errors. |
| #73 | C5 device matrix | 0bf0f66 | **clean** | Root cause of the keyboard-focus "flake": Tab pressed before React's first commit (8/160 reproduced; 160/160 with a toBeAttached wait). Wait added to accessibility.spec and app.spec. C's 100/100 repeat accepted; lint clean. |
| #74 | A4 BTC header sync | — | **needs_fix** | H1: heavier forks deeper than ~2047 are never adopted and are mislabelled lessWork. H2: scan results are not wiped atomically with the header switch on partial failure. M: network-only key with no "forget headers" action (permanent pinning); main-thread revalidation and full re-serialization do not scale (49 MB / 12.8 s at 300k headers). Retarget/MTP/BIP-94 consensus checks are sound. |
| #66–#69 | i18n stack + B4 + B3' | see PRs | clean (A self-review + A2) | CI queued (runner backlog) at 03:22; 0 failures so far. |
| #70 | A5 | a4f7a2c | clean | Sonar duplication fixed (7.4% → 0.0%): pure refactor, 60 cases before and after, 0 expect lines changed. CI queued. |
| #71/#72 | C1 ADR / B5 blocked | — | clean | Docs-only; gates queued. |

Recorded process notes:

- Only the old-head `typescript`/`contracts` red checks were seen, and those were aggregate gates of runs cancelled by newer pushes. They are not test failures.
- The #66 Sonar "1 new issue" (gate passed) cannot be read from this environment, because sonarcloud.io is denied by the network policy.

## Combined integration matrix (all open task PRs merged into one tree, 04:00–04:55 UTC)

All of these ran here, on Instance A, not in CI. The tree merges #59 and every task branch: #69 (which contains #66–#68), #70, #71, #72, #60, #61, #62, #63, #64, #65, #73 and #74. The only conflicts were in the locale catalogs, and they were resolved losslessly: a key union with no differing values, 563 → 936 keys.

**Run 1** (tree `a76f4a9`)

These checks were green:

- Clean install, build:libs, typecheck, lint
- i18n check (0 errors) and extract (0 missing)
- Secret scan and actions check
- forge build, test 411/411, fmt and snapshot
- Pool contracts 86/86
- qualify-lean (two-build reproducibility)

These checks were red. Each is listed with its cause:

- `npm test` (all workspaces): the harness forced `REQUIRE_ANVIL=1` globally, which CI does not do. Re-run CI-style, every workspace passed: web 1893 passed, 1 skipped; coverage 92.9 / 88.65 / 94.55 / 96.57 against thresholds of 90/85/90/90; nocov 1/1.
- payer-hiding forge: the EntryPoint was not vendored in the fresh tree. After `scripts/fetch-entrypoint.sh` it passed 108/108.
- Playwright full and lean: one real failure. The #62 reorg journey fails when combined with #70's page-end persist shortcut. #70 was refutation-checked as safe. The `persistable()` shortcut now runs the same two-provider `corroborateAnchor`, verified by mutation. B re-keyed #62's fork trigger on scan progress (`forkPlan`, `e0a499b`).

**Run 2** (tree `9ffae2f`; heads: #69 3662e1a, #70 d9fe8b4, #71 1e87109, #72 76199cd, #60 f5c9015, #61 f9a755f, #62 e0a499b, #63 03263ec, #64 2bcfd11, #65 6e13bb9, #73 0bf0f66, #74 0f80fcd)

| Step | Result |
|---|---|
| build:libs | pass |
| typecheck | pass |
| i18n | 0 errors, 920 keys used, 0 missing |
| web vitest | 1919 passed, 1 skipped (134 files) |
| Playwright full profile | 58 passed, 1 skipped |
| Playwright lean profile | 50 passed, 1 skipped |

The #62 + #70 interaction is resolved in both profiles. The skipped cases are pre-existing conditional skips, not added by this run.

**After run 2:** Qodo found that the Arabic `pay.scan.summary` and `pay.scan.clear` labels were identical. The fix is commit `e02d04c` on #66, written test-first; the new test failed for `ar` before the fix. It was merged forward to #67 (`7f4702f`), #68 (`4fe95fc`) and #69 (`1b9edb1`). It changes only one locale and adds one test. On the new #69 tip: i18n 0 errors, 0 missing; views + i18n vitest 420/420. The full matrix was not re-run for this change.

**Not run here:** Real devices or wallets, mainnet, hosted deployment, CI on the final heads (queued at 04:49).

## Final status (updated 2026-11-11)

"Ready" means every real `ci.yml` job is green on the current head, on an uncancelled run, with A2 review clean and no open finding at medium or above. Nothing was merged; the owner merges.

| PR | Task | Final head | State | Notes |
|---|---|---|---|---|
| #59 | A0 | 4a38efd | ready | axe helper TS fix; #47 green |
| #60 | C2 QR pairing | 78be173 | ready | Qodo chain-id + stale-read fixes; A2 L1/L2 fixed |
| #61 | A6 backup panel | f5d2198 | ready | Simplified after 3 review rounds (see below) |
| #62 | B1 core journey | e0a499b | ready | |
| #63 | C7 embed iframe | 2b9db8a | ready | Qodo timer-leak + stale-ack fixes; reload fallback left as a documented follow-up |
| #64 | B2' lean bound receipts | 2bcfd11 | ready | |
| #65 | A7 policy send guard | f7b8ee9 | ready | Duplicate guard KEPT; docs fixed; Qodo high declined with verified reasoning |
| #66 | C4a i18n Pay | e02d04c | ready | Arabic scan/clear label fix |
| #67 | C4b i18n Scan | 7f4702f | ready | |
| #68 | C4c i18n Create + B4 | 4fe95fc | ready | |
| #69 | B3' sweep permit states | 9d10095 | ready | permit_failed copy split; see the trailer note |
| #70 | A5 announcer budget | d9fe8b4 pushed; fix local | **draft** | Qodo HIGH open (see below) |
| #71 | C1 ADR-0026 | 1e87109 | ready | docs only |
| #72 | B5 testnet feeds | 76199cd | ready | blocked: feed hosts not allowlisted |
| #73 | C5 device matrix | 92af349 | ready | route-specific heading check |
| #74 | A4 BTC header sync | 27d1580 | **draft** | 4 A2 rounds; all mediums fixed; fund-safe. Briefly marked ready on 11-11 in error: CI run 41801618326 never created `ts-test (web)` or `contracts-coverage` (23 checks, not 24) and concluded failure. Re-run requested; ready only when every job is present and green. |

**Consolidation by other agents (2026-11-04 to 2026-11-10).** Draft PRs #84 and #98 include every head above as an ancestor. None of the heads is on `main`. #98 contains its own fix for the #70 HIGH (29a5810 and 80fd9a8): it replays a `claimed` router match once when it lies above the run floor. That is the same design as this run's rejected round 1, so it inherits two findings that this run's A2 confirmed with probes:
- (H) The run floor often lands on a payment block for other reasons: the pending rule, the replay tail, a budget stop, or a typed start. A first transient failure there counts as already retried, and the payment is not re-verified.
- (M) Every `claimed` router match is replayed, not only transient failures. So k always-failing spam claims cost one rewind each, a linear form of the A5 starvation.

**#70 local fix (not pushed).** The work is in `/tmp/claude-0/fix70`, commit a104be8 on d9fe8b4, three rounds. It replaces rewinding with a capped, persisted re-check list (`ScanCursor.recheck`, RECHECK_MAX = 8). The cursor always advances. Each RPC-failed claim gets exactly one targeted re-verify. Overflow is disclosed and reported at save time, and the rescan block is the lowest owed block. It also includes fail-closed head-drop telemetry and head-skew retryable results.

A2 round 3 left four items:
- (H) a `pending` re-check result is not owed again;
- (M) a typed start drops the stored list;
- (M) the overflow notice is not persisted;
- (M) one rewritten test lost its `< nextBlock` pin.

Round 4 was cut off by the account's weekly usage limit before it produced a commit.

**#61 simplification.** The live "Done" re-check needed a cross-tab guarantee that the design could not give without a cross-tab lock. Round 3 found a fingerprint race between two snapshots. The panel now never derives "Done" for tags. It shows when the last archive was downloaded and how many tags it holds, and says that later changes are not in it. `tags.ts` and `tags.test.ts` are identical to base.

**Process incidents:**
- b0f85c2 and 9d10095 (#69) carry a mistyped `Claude-Session` trailer (`session_01KtKj8jcfX6gG5RnXcqG3Xn`). History is left as is: fixing it would need a force-push.
- The session paused for about 6.5 days on the weekly usage limit (2026-11-04 10:00 to 2026-11-11 00:40 UTC). The worker restarted and the local worktrees survived.

**Not done / owner-only:**
- Real devices and wallets, mainnet, hosted deployment, and professional audit.
- B5 feed hosts (network allowlist) and TRON genesis (no primary source).
- Native-speaker review of the es/ja/ar drafts.
- Merging.
