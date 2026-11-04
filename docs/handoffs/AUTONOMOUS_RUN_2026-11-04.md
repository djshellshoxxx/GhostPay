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
