# Evidence index

Every number in this package traces to one of the sources below. **VERIFIED** = read in code or produced by a command
in this audit session (2026-11-18) at the stated SHA. **REPORTED** = taken from GitHub Actions results or prior-campaign
documents and checked for consistency but not re-run. **INFERRED** = reasoned from evidence. Raw logs larger than
1 MB (Team D/E/F logs, Playwright traces, built bundles) were not packaged; the commands to regenerate them are below.

## 1. Repository baseline (VERIFIED, coordinator)

| Fact | Value | Command |
|---|---|---|
| Remote | `https://github.com/djshellshoxxx/GhostPay` | `git remote -v` |
| `main` | `cfaebeeae22f292cb0bb3074619b2603cb738367` (merge of #189, 2026-11-16) during the audit; after the snapshot `5467c158069c5bab264b6a653ac56e89e13f3e13` (merge of #203, 2026-11-18T06:56:49Z, parents `cfaebeea` + `71abc7e5`, tree == `71abc7e5`) | `git rev-parse origin/main`; `git ls-remote origin refs/heads/main` (07:10Z) |
| Audit target (product source) | `7a620ff19ecf4e43ec568896c34188f5b2dcd3fc`, tree `594c9f6a` | `git rev-parse refs/remotes/pr/203` at 05:40Z |
| PR #203 head at packaging | `71abc7e55c25d45b206ac47e5ddd24e072805710` (docs only over `7a620ff1`) | `git log 7a620ff1..origin/nodata/wizardly-allen-qwol6u` |
| PR #204 head | `2693b08ed4b1dae35fad604a2324b790f1eee5dc` | `git rev-parse refs/remotes/pr/204` |
| Remote branch heads | 217 at the census (~06:10Z; this package's branch was not yet pushed). Live at 07:10Z: 219 = 217 − `dependabot/github_actions/actions-1850456dc8` (#85 closed) + `nodata/zealous-hopper-lr0nxe` (#205, this package) + `claude/ghostpay-consolidation-9xhtxg` (#206, #204 re-integrated) + `dependabot/github_actions/actions-b9ade1236b` (#207); moved: `main` and `nodata/wizardly-allen-qwol6u` → `5467c158`, the three zero-codex docs heads, `claude/admiring-albattani-6kydor` (#208) | `git ls-remote --heads origin \| wc -l` |
| PR head refs | 202 (`refs/pull/*/head`) | `git fetch origin '+refs/pull/*/head:refs/remotes/pr/*'` |
| PRs | 202: 145 open, 25 merged, 32 closed unmerged (highest #204) at ~05:37Z. Live at 07:10Z: 206 PRs (highest #208): 122 open, 51 merged, 33 closed unmerged — the #203 merge auto-marked 26 contained PRs merged (e.g. #187, #157, #136, #84, #78), #85 closed, #205–#208 opened | `gh api -X GET search/issues -f q='repo:djshellshoxxx/GhostPay is:pr' --paginate` → `evidence/prs/prs_search.jsonl` |
| Shallow clone | The session clone was shallow (`.git/shallow`, 2 boundary commits); fixed with `git fetch --unshallow`; full history: `main` 726 commits, candidate 2,210 | `git rev-parse --is-shallow-repository` |
| Historical package ZIP | `GhostPay_Consolidation_Execution_Package.zip` not present on disk or in any of 420 refs; only `docs/handoffs/agents/TEAM_J_UNIFIED.md` (+TEAM_J_*) exist in-tree | `find / -iname '*Consolidation*Package*'`; `git ls-tree -r` over all refs |

## 2. Packaged evidence files

| Path in package | Produced by | What it shows | Cited by |
|---|---|---|---|
| `evidence/census/branch_census_current.json` | `evidence/scripts/branch_census.py` (full history, 2026-11-18 ~06:10Z; author fields stripped) | Per ref (218 origin refs = 217 remote heads + the then local-only `nodata/zealous-hopper-lr0nxe`, plus 202 PR refs; 168 heads are strict ancestors of `7a620ff1` and the candidate branch itself — already at docs-only `71abc7e5` — makes 169 contained; 14 all-patch-equivalent; 32 with differing files. Team C's `census_full.json`, taken while the branch was at `7a620ff1`: 169/48/14/31): ancestry vs `main` and `7a620ff1`, `git cherry` unique/equivalent patch counts, files touched by unique commits that differ from the candidate | BRANCH_RECOVERY_MATRIX, POST_CONSOLIDATION_AUDIT §5b |
| `evidence/teams/C/census_full.json`, `patchcheck.json` | Team C (own full-history clone) | Independent census reproduction; per-commit patch checks for non-ancestor refs | BRANCH_RECOVERY_MATRIX §0–§3 |
| `evidence/prs/prs_search.jsonl`, `open_prs.json` | GitHub search API; MCP `list_pull_requests` | PR states, dates, head/base refs (first 100 open with heads) | all docs |
| `feature_completion_matrix.json` | `score_features.py` merge of B1a/B1b/B2/B3 rows | 194 rows (192 distinct): requirements with weights, implemented/verified marks, evidence, recomputed percentages | FEATURE_COMPLETION_MATRIX, IMPLEMENTATION_SEQUENCE |
| `evidence/features/stats.json` | `score_features.py` | Status/tier counts, requirement-weighted aggregates, effort sums | README, matrix summary |
| `evidence/features/scoring_issues.md`, `evidence/scripts/overrides.json` | `score_features.py` with `GP_OVERRIDES=overrides.json` | The 106 places where team headline numbers, statuses, tiers or requirement lists were replaced by rubric-computed or verified values: the coordinator's F-PROTO-03 requirement correction, six security holds (F-KEY-01/02/03, F-WEB-07 (superseded by its re-score), F-WEB-11/12) and the H1 corrections (F-WEB-07 and F-NET-01 requirements, F-BTC-01/02 and F-MER-05 tiers, F-NET-02/F-BTC-02 fields, severity-aware VC rule) | matrix header |
| `evidence/teams/B1/*`, `B2/*`, `B3/*` | Feature teams | Original team tables and per-package coverage map (all 71 package/app dirs) | matrix |
| `security_findings.json` | Team S merge of D + E + prior R-xx | 49 unified findings (0 Critical, 2 High, 8 Medium, 20 Low, 19 Info) with sources, evidence, affected features, gates | SECURITY_AND_PRIVACY_GAP_ANALYSIS |
| `evidence/teams/D/*` | Team D | Crypto/contract review, 22 findings, independent scripts: `indep-vectors.cjs` (EIP-5564 scheme-1 vectors 6/6 with `elliptic` + `js-sha3`), `indep-keystore-recovery.mjs` (keystore v1 decrypted with `node:crypto` only), `passphrase-probe.mjs` | SEC-03..SEC-07, SEC-15 |
| `evidence/teams/E/*` | Team E | Browser/privacy review, 23 findings, `egress_walk.mjs` (all-view egress walk), `csp_loopback_probe.mjs` (local-proxy CSP block), `jitless_bench.mjs` | SEC-01, SEC-08..SEC-10 |
| `evidence/teams/F/*` | Team F | CI inventory, local results, `test_inventory.json` (per-package test counts), `commands.log` (every command + exit code) | SECURITY gates, acceptance criteria |
| `evidence/teams/A/consolidation_tasks.json` | Team A | 34 reconstructed prior-campaign tasks with classification and commits | POST_CONSOLIDATION_AUDIT §4 |
| `evidence/verification/VERIFICATION_REPORT_H1.md`, `corrections_h1.json`, `REVIEW_H2.md`, `corrections_h2.json` | Independent verifiers H1 (audit documents) and H2 (plan and prompt) | 81 checks by H1 (56 confirmed, 18 partly, 7 refuted) → 63 corrections; H2 coverage review (14 OK / 14 weak / 1 missing before fixes) → 144 corrections; all applied (H2-40 tier mapping adjusted to the owner's cost preference) | every package file |
| `completion_strategy.json`, `ws_registry.json` | Teams G-A / G-B (from the lost Team G registry) + coordinator security holds | Six-way strategy per unfinished feature; 27 workstreams / 106 items with exclusive owned paths (ownership validator: 0 overlaps), item DAG (acyclic), checkpoints CP-0..CP-9 | IMPLEMENTATION_SEQUENCE, PARALLEL_AGENT_EXECUTION_PLAN, execution prompt |

## 3. CI runs referenced (REPORTED from the GitHub Actions API; conclusions cross-checked by Teams A and F)

| Run | Workflow | Head | Conclusion |
|---|---|---|---|
| 44242366118 | CI (24 jobs) | `7a620ff1` | success 24/24 (web 2,749 passed / 1 skipped; e2e full 78/1 skipped; lean 66/3 skipped; ~13 min wall) |
| 44242366052 / 44242366040 / 44242366032 / 44242366075 / 44242366236 | Pages / Beta acceptance / Integration / Hosting kit / CLI operator | `7a620ff1` | success |
| 44242366379 | Contract analysis | `7a620ff1` | failure by design: Echidna success (13 properties, 11 canaries), Mythril failure with the 11 dispositioned records |
| 44239860965 | CI | `ceea9fdd` | failure: `ts-test (web)` SellerKeys blocked-download test race (R-18), fixed in `7a620ff1` |
| 44231986652 / 44231986631 | CI / Contract analysis | `d91ae16a` | success 24/24 / Mythril failure (previous qualified head) |
| 44078371383 | Nightly | `main` `cfaebeea` | failure (Mythril + reproducibility `ESBOMPROBLEMS` zod; candidate `npm sbom` exits 0) |

## 4. Local verification in this audit (VERIFIED, candidate `7a620ff1`, 4 vCPU container)

| Area | Command(s) | Result | Team |
|---|---|---|---|
| Install/build | `npm ci --ignore-scripts && npm run build:libs` | exit 0 (722 packages) | coordinator, E, F |
| Typecheck / lint | `npm run typecheck`, `npm run lint` | exit 0 / 0 errors, 3 warnings | F |
| Unit/integration | `npm test` per workspace | 670 files, 0 failed, 78 skipped (~12k passed); 3 packages fail only when `REQUIRE_ANVIL=1` is forced (CI does not force it) | F |
| Web builds | lean + full (`apps/web` scripts) | exit 0 | E, F |
| Browser e2e (mocked RPC) | Playwright lean / full | 66 passed 3 skipped / 78 passed 1 skipped | F |
| Contracts | `forge test` (Foundry 1.8.5 + solc 0.8.28 from GitHub releases; foundry.paradigm.xyz and binaries.soliditylang.org blocked) | contracts 490/0, pool 86/0, payer-hiding 109/0; fmt, NatSpec, snapshot, static OK | F |
| Scripts | `node --test` script suites | 199 passed, 1 failed (needs `cast`; passes with Foundry), 1 skipped (`ssh-keygen`) | F |
| Pages / profile | Pages tests, `localBuildProfile.test.mjs` | 72/72, 33/33 | F, E |
| Supply chain | `npm audit --omit=dev`; `npm audit`; `ci:check-actions`; `ci:scan-secrets`; release repro across two clones | 0 prod vulns; 30 dev advisories (picomatch, no fix); 111 actions pinned; secrets OK; tarball + SBOM reproducible | E, F |
| Package suites | targeted `npx vitest run` | core-crypto 75, invoice-schema 715, payment-uri 199, qr-exchange 233, sdk 54, scan-source 57, policy-scheme 88 (+7 anvil skips), chain-adapters 551 (+22 anvil skips), ux-vault 284, secret-box 47, tx-review 160, address-safety 76, web 146 files / 2,273 passed, cli 570, relayer 470 (+5 skips), BTC/privacy packages ~3.6k: all pass | B1a, B1b, B2, B3, D |
| Independent crypto | `evidence/teams/D/scripts/indep-vectors.cjs`, `indep-keystore-recovery.mjs` | 6/6 scheme-1 vectors; keystore v1 recovery with `node:crypto` | D |
| Live browser probes | `egress_walk.mjs`, `csp_loopback_probe.mjs` (Chromium) | 0 foreign requests until explicit RPC test; local-proxy blocked by CSP | E |

Not run here (tool or access missing): Echidna, Mythril, Slither, hardhat/fhEVM (`confidential-contracts`), circom builds,
Firefox/WebKit/Tor Browser, real wallets/devices, live github.io site, repository settings APIs.

## 5. Prior-campaign documents used as leads (in candidate tree)

`docs/handoffs/consolidation-20261118/{PROMOTION_PACKET,CANDIDATE_INTEGRATION,VALIDATION_MATRIX,REVIEW_FINDINGS,BRANCH_DISPOSITION_LEDGER,RETIREMENT_PLAN,NEXT_PHASE_QUEUE}.md`,
`docs/handoffs/agents/*` (TEAM_*_UNIFIED.md, TEAM_J_*, UNIFIED_FINAL_REVIEW.md, team-j-analyzer-evidence/),
`docs/handoffs/GHOSTPAY_MASTER_COMPLETION_LEDGER.md`, `docs/ai/ACTIVE_WORK.md`, `docs/specs/01..18`, `docs/adr/*`, `docs/audits/*`.
Claims from them are marked VERIFIED only where re-checked (≈20 by Team A, 17 security spot-checks by Team S).

## 6. Corrections this audit made to its own early evidence

1. Shallow-clone census (first run) undercounted ancestry for 4 refs (#16, #17 and their PR refs); replaced by the full-history census. The shallow file is not packaged.
2. PR #203 moved `7a620ff1` → `71abc7e5` during the audit (docs only); all product findings remain pinned to `7a620ff1`.
3. The prior packet's "later commits are documentation only" was false for `7a620ff1` (test change, R-18); the prior session corrected it at `71abc7e5`.

## 7. How to reproduce

```bash
git clone https://github.com/djshellshoxxx/GhostPay && cd GhostPay
```

```bash
git fetch origin '+refs/heads/*:refs/remotes/origin/*' '+refs/pull/*/head:refs/remotes/pr/*'
```

```bash
python3 -I docs/handoffs/post-consolidation-20261118/evidence/scripts/branch_census.py "$PWD" 7a620ff19ecf4e43ec568896c34188f5b2dcd3fc cfaebeeae22f292cb0bb3074619b2603cb738367 /tmp/census.json
```

```bash
GP_OVERRIDES=docs/handoffs/post-consolidation-20261118/evidence/scripts/overrides.json python3 -I docs/handoffs/post-consolidation-20261118/evidence/scripts/score_features.py /tmp/merged.json /tmp/stats.json /tmp/issues.md docs/handoffs/post-consolidation-20261118/evidence/teams/B1/features_proto.json docs/handoffs/post-consolidation-20261118/evidence/teams/B1/features_web.json docs/handoffs/post-consolidation-20261118/evidence/teams/B2/features.json docs/handoffs/post-consolidation-20261118/evidence/teams/B3/features.json
```
