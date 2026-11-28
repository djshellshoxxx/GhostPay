# TEAM F - Testing, CI, release readiness (candidate 7a620ff1, PR #203)

Evidence tags: VERIFIED (ran/read at 7a620ff1 or GitHub API) | INFERRED | UNVERIFIED.
Worktree: $SP/out/F/wt @ 7a620ff19ecf. Commands: $SP/out/F/commands.log. Logs: $SP/out/F/logs/. Inventory: $SP/out/F/test_inventory.json.

## 1. CI inventory (.github/workflows @ 7a620ff1) - VERIFIED (read)

| Workflow | Trigger | Gate / content |
|---|---|---|
| ci.yml (552 l) | PR, push main, dispatch. concurrency `ci-<wf>-<ref>`, cancel only on PR. | `changes` (docs-only filter via gh API; non-PR = always code) gates all heavy jobs. 24 jobs: changes, secrets-and-egress (always), ts-typecheck, ts-lint, ts-check (npm ls, build, chain-matrix, localBuildProfile, money/pos tests, i18n, npm audit), ts-test x7 (core-crypto, btc-silent-payments, web, confidential-contracts, rest-0/1/2), ts-test-relayer, e2e x2 (full, lean), lean-candidate (2 clean builds), contracts-test/coverage/static/slither, contracts-extra x2 (pool, payer-hiding), aggregators `typescript`, `contracts` (stable required-check names). |
| contract-analysis.yml | PR paths (contracts/**, runner tests, workflow files), workflow_call. cancel on PR only. | Matrix echidna 2.2.7 (sha256-pinned tarball) + mythril 0.24.8 (py3.12, solc-select 1.2.0). Runs `scripts/run-<analyzer>.sh`, uploads `contract-analysis-<a>-<sha>` evidence even on failure. 120 min cap. |
| release.yml | push tag `v*`. concurrency no-cancel. | verify (signed-tag check vs default-branch trust root, full clean tests with REQUIRE_ANVIL, release-*.test.mjs, secrets, actions-pinned, npm audit) -> contract-analysis (reusable) -> build (env `release` approval, re-verifies tag, downloads echidna+mythril evidence, jq gate on success/exit 0/commit match, release-build.sh, verify-release.sh, attest provenance) -> draft-release (env `release`, DRAFT only). publish-static is a disabled stub. |
| pages.yml | PR (paths: web, packages, scripts/pages ...), dispatch. | site + acceptance (real-chain on anvil) on PR. Deploy only on dispatch on main with `deploy=true`: release-gates (typecheck/lint/web unit/lean e2e) + site + acceptance -> deploy (env github-pages) -> smoke. Never auto. No Actions cache by design. |
| beta-acceptance.yml | PR paths, dispatch. cancel-in-progress true. | scripts/beta/acceptance.sh (lib lifecycle, CLI devnet, web on anvil). |
| integration.yml | PR paths, dispatch, cron 04:41 UTC. no cancel. | Docker: anvil + bitcoind regtest + solana-test-validator. |
| nightly.yml | cron 03:17 UTC, dispatch | fuzz 100k runs, slither, dependency-audit (+ `npm audit signatures`), reproducibility (`repro-check.sh --head`), contract-analysis (reusable). |
| hosting-kit.yml, cli-operator.yml | PR paths (+push main for hosting-kit) | hosting-kit lint/typecheck/test + chromium; cli-operator portable CLI build/tests. |
| ghostpay-codex-cloud.yml, ghostpay-parallel-review.yml | cron / PR / dispatch | agent automation (API-funded dev, parallel review). Not product gates. |

Tool pins: Foundry v1.8.5 (foundry-toolchain SHA dba66c27), solc 0.8.28, Node 22, Echidna 2.2.7, Mythril 0.24.8, slither 0.11.6. All 111 `uses:` pinned to SHAs (check-actions-pinned.sh OK locally).
Composite actions: setup-node-libs (caches `packages/*/dist` keyed on all sources; this is a build-tree cache), setup-forge (caches ~/.svm and forge out/cache), release-verify.

## 2. CI evidence, PR #203 and main - VERIFIED (GitHub Actions API)

- CI run 44231986652 (head d91ae16a, NOT the final head): conclusion success, 24/24 jobs (total_count 24). CLAIM CONFIRMED. Note job `secrets-and-egress` was created 04:13 but started 04:26: ~13 min runner queue; run wall 67 min mostly queue.
- Contract analysis 44231986631 (d91ae16a): failure; echidna success (14 m 22 s runner step), mythril failure (analyzer step 49 m 10 s, `Execute the unchanged full analyzer runner` failed, evidence artifact still uploaded). CLAIM CONFIRMED.
- CI DID run on final head 7a620ff1: run 44242366118 success, 24/24 jobs success, wall 05:10 -> 05:23 (13 min). Also on 7a620ff1: Integration 44242366032, Hosting kit 44242366075, Pages 44242366052, Beta acceptance 44242366040, CLI operator 44242366236, Parallel review 44242366048 all success.
- Contract analysis on 7a620ff1: run 44242366379 = failure (queried 05:59: echidna success 14 m 44 s; mythril failed). So Mythril is red on the final head too (NOT previously stated in PROMOTION_PACKET, which only covers d91ae16a).
- Intermediate head ceea9fdd: CI 44239860965 failure (flaky web test, fixed by 7a620ff1 per commit message; test was timer-dependent) - flaky indicator.
- main (cfaebeea): CI push run 43982699355 success but took 23:50 -> 03:25 (3 h 35 m wall, pre-parallelisation workflow, queue-inclusive). Nightly 44078371383 (2026-11-17) FAILED: mythril step exit 1 and `reproducibility` failed with `npm error code ESBOMPROBLEMS invalid: zod@4.6.7, ^3 >=3.22.0 required by abitype@1.0.8`. Candidate: `npm sbom --omit=dev` exit 0 locally and `npm ls --all --omit=dev` exit 0, so that nightly failure appears fixed on the candidate (INFERRED; repro-check not run). main also has failing `GhostPay API-Funded Cloud Development` (44141659077) and `openai-agents.yml` runs (workflow not present in candidate tree).

Per-job durations on 7a620ff1 CI (s): ts-test web 420, ts-test rest-2 379, ts-lint 372, lean-candidate 267, e2e full 270, e2e lean 233, rest-0 199, ts-check 156, confidential 152, ts-typecheck 144, rest-1 141, contracts-coverage 131, contracts-extra pool 96, btc 91, core-crypto 91, relayer 73, contracts-test 66, payer-hiding 43, slither 36, changes 21, static 14, secrets 11. Critical path = web unit tests (387 s step) + setup.
Slowest steps: web Unit tests 387 s; rest-2 Unit tests 328 s; `npm run lint` 313 s; lean-candidate compare 258 s; e2e full playwright 205 s; e2e lean 177 s; typecheck 115 s; build 113 s; forge coverage 118 s.

## 3. Local results (7a620ff1, 4 vCPU, own worktree) - VERIFIED

| Check | Result |
|---|---|
| `npm ci --ignore-scripts` + `build:libs` | exit 0 / 0 |
| `npm run typecheck` | exit 0, 257 s |
| `npm run lint` | exit 0, 326 s (0 errors; 3 warnings: unused eslint-disable) |
| `npm test` (run per workspace, 68 workspaces with test script, xargs -P3, anvil 1.8.5 + solc 0.8.28 provided) | 64/68 exit 0 first pass. 3 failed only because I set REQUIRE_ANVIL=1 globally (payer-sponsor, external-pools-railgun, external-pools-privacypools need pool/payer artifacts or circuits that CI also lacks; CI does not set REQUIRE_ANVIL for them) - rerun as CI runs them: all exit 0. 1 real-env blocker: packages/confidential-contracts (hardhat) `HH502 cannot download compiler list` (binaries.soliditylang.org blocked by proxy). Totals: 670 test files, 0 failed, 78 skipped, ~12,018 passed (apps/web counted twice: coverage + nocov runs; web unique = 2,749 passed + 1 skipped, plus 3 in nocov config). Not run locally: confidential-contracts (CI: success 152 s). |
| Notable skips | pool-circuits 18 pass/59 skipped (circuits not built); pool-relayer 43/9; payer-sponsor 135/4; privacypools 73/4; railgun 20/1; web 1 |
| web build lean / full (+ bundle scan) | exit 0 (19 s) / exit 0 (18 s); scan passed 17 / 19 files |
| Playwright e2e (apps/web, mocked; no chain needed) | lean: 66 passed 3 skipped; full: 78 passed 1 skipped; exit 0 both. Real-chain `devnet-journey` / `pages-devnet` specs are skipped by design (need `scripts/beta/browser-devnet.sh`) and run only in beta-acceptance/pages.yml. Anvil is not needed by the mocked suite. |
| Foundry v1.8.5 install | foundry.paradigm.xyz blocked (000); GitHub release tarball worked (sha256 6c66ffcc...). forge needs solc from binaries.soliditylang.org (blocked) -> used GitHub release `solc-static-linux` v0.8.28 via FOUNDRY_SOLC (sha256 9a0fb7e0...). |
| packages/contracts: forge build --sizes / test | exit 0 / 490 passed 0 failed 0 skipped (34 suites). fmt --check ok, natspec ok, snapshot --check ok (445 tests) |
| pool-contracts: forge test | 86 passed 0 failed; fmt ok; check-static ok |
| payer-hiding-contracts: fetch-entrypoint (network ok) + forge test | 109 passed 0 failed; fmt ok |
| scripts tests (`node --test scripts/testnet scripts/regtest scripts/tests`) | 201 tests: 199 pass, 1 fail, 1 skip. Fail = `verify-sources.test.mjs` #13 `cast: command not found` (env/tooling); rerun with foundry on PATH: 4/4 pass. Skip = ssh-keygen signed-tag test (ssh-keygen absent). |
| scripts/pages tests | 72/72 |
| localBuildProfile.test | 33/33 |
| examples money+parity (CI subset) / all examples/*.test.mjs | 4/4 / 60/60 |
| ci:scan-secrets, ci:check-actions | OK, OK (111 uses pinned) |
| tx-origin, proxy headers, deploy/selftest.sh, audit-permissions.py (16), i18n check, chain-matrix | all exit 0 |
| npm audit --omit=dev --audit-level=high / npm ls --omit=dev / npm sbom | 0 vulns / ok / ok |
| lean-candidate (`scripts/qualify-lean.sh`, two clean builds) | exit 0, 265 s |
| NOT runnable: slither, echidna, mythril (not installed), forge coverage (not run), integration.yml docker stack, beta-acceptance, `repro-check.sh` | UNVERIFIED locally; CI evidence above |

Real defects found by tests: NONE. All failures were env/tooling (missing cast, missing ssh-keygen, blocked solc host, hardhat compiler download).

## 4. Test inventory summary and gaps - VERIFIED (static grep + runs)

- 74 workspaces dirs; 71 have package.json; 68 have a `test` script (all vitest `--coverage` except confidential-contracts = hardhat). 3 Foundry projects (contracts 34 suites/490, pool-contracts 12/86, payer-hiding 7/109) have no package.json (only forge). Zero-test packages: none (every package has >=1 test file). Thinnest: ux-i18n (2 cases), ux-sandbox (2), pool-prover (8, 1 file), merchant-ledger (1 file), net-harness (1 file), ux-fiat (1 file).
- vitest test files: 693; apps/web 155+ files (~1,396 cases by grep, 2,750 incl. runs), apps/relayer 18 files / 316.
- Playwright: 30 spec files, ~80 `test()` (static count), full 78+1skip, lean 66+3skip.
- Gaps / excluded from CI (all VERIFIED by comparing workflow to tree):
  1. Anvil/real-circuit integration tests in payer-sponsor, external-pools-railgun, external-pools-privacypools, pool-relayer, pool-circuits SKIP in CI (CI runs `forge build` only for packages/contracts and does not set REQUIRE_ANVIL for these shards; ZK circuits not built). They never execute in PR CI; real-chain coverage relies on beta-acceptance/integration.
  2. examples/: CI ts-check runs only money.test + parity.test (4 tests). checkout, webhook-receiver durable, subscription-cron run, plugin-conformance, merchant-operations (approvals, refund-batch) tests (56 more) are in no workflow except cli-operator paths for subscription-cron (and that workflow runs CLI tests, not these files). They pass locally.
  3. `test:compiled` for @ghostpay/cli only in cli-operator.yml (path-filtered).
  4. ssh-signed-tag verification test is skipped without ssh-keygen (runs on hosted CI).
  5. Mythril never green (see 5); Echidna green.
  6. Skip markers: apps/web 6, pool-relayer 1 (static), e2e skip conditions on profile/env only; no `.only` found; no `test.fixme`.
  7. Flaky indicators: ceea9fdd web keystore-download test failure (timer coupling, fixed in 7a620ff1, not reproduced locally); timer-based `waitFor` style tests in web.
  8. Coverage thresholds: `vitest run --coverage` in every package (threshold configs not audited).

## 5. Release gates that would block a beta release today - VERIFIED unless noted

1. No release signing key: `.github/release-signers/allowed_signers` has zero keys (comments only). `verify` job fails closed at the signed-tag step. OWNER ACTION. Evidence: file read @ 7a620ff1.
2. Trust root and verifier are read from the DEFAULT BRANCH: `origin/main` has neither `scripts/verify-tag.sh` nor `.github/release-signers/` (git cat-file/ls-tree). Release.yml errors "verify-tag.sh is not on main" until #203 (or equivalent) merges. Tag must also be reachable from main (`--ancestor-of`). So: merge to main first, add key, then tag.
3. Mythril red on exact tag commit: release `build` jq gate requires `analysisOutcome == "success"` and `runnerExitCode == 0` for mythril. Mythril failed on d91ae16a (44231986631) and 7a620ff1 (44242366379), and nightly. Per PROMOTION_PACKET: 11 records dispositioned but no suppression possible, so gate stays red => release blocked. Owner policy decision needed (relax gate with a reviewed allow-list evidence file, or fix findings). (Failure message itself not retrievable via logs tool; log tail only showed post-job; cause per packet = findings reported; INFERRED from packet + exit status.) Mythril run is also 49 min (timeout-dependent: finding R8 appears/disappears).
4. No `v*` tags exist (git tag -l empty). Environment `release` with required reviewers must exist (UNVERIFIED: repo settings not readable). GitHub Pages source / `github-pages` environment restricted to main (UNVERIFIED).
5. `verify` job runs the entire `npm test` monolithically with REQUIRE_ANVIL=1 on one runner. REQUIRE_ANVIL=1 makes payer-sponsor, external-pools-railgun, external-pools-privacypools fail locally (artifacts/circuits missing, reproduced exit 1 here); the same would happen in release.yml `npm test` (INFERRED: release job has only `forge build` in packages/contracts and no pool/payer artifacts/circuits). If true, release `verify` fails independent of signing. HIGH-confidence risk, not run on GitHub. Also confidential-contracts hardhat needs solc download (works on GitHub-hosted).
6. release-build.sh / verify-release.sh / gen-release-manifest.mjs: tooling tests pass (release-manifest, release-verify, release-verify-tag (ssh case skipped), release-verify-attestation within the 199 passing). Manifest `channel` is `release` only for tag name vX.Y.Z[-pre], tag commit == commit, clean tree; many fields intentionally `not-recorded`. End-to-end deterministic build and repro NOT run here (UNVERIFIED; nightly `reproducibility` failed on main due to ESBOMPROBLEMS, expected fixed on candidate).
7. Pages deploy: only workflow_dispatch on main with deploy=true; needs release-gates + site + acceptance, then environment approval. Nothing auto. Pages PR validation was green on 7a620ff1. Blocked until merge to main (workflow on main is the old one).
8. Draft-release channel check requires `channel == release` and tag object == verified tag object; release is DRAFT only, human publish. Good.
9. PR #203 is draft; PR #204 conflicts with #203 in ci.yml and CLAUDE.md (per brief).

## 6. CI speed

Measured (7a620ff1, queue-free): wall 13 min; sum of job time ~60 min (billed minutes; 24 runners). Critical path: setup (~80-90 s: checkout + node + npm ci [cache restore] + libs cache) + web unit tests 387 s.
Top 5 bottlenecks:
1. ts-test (web) 420 s: `vitest run --coverage` then a second full `vitest run --config vitest.nocov.config.ts` (two passes, both with anvil). Locally the whole web suite runs both passes.
2. ts-lint 372 s (`eslint` over all 68 workspaces, serial npm --workspaces).
3. rest-2 379 s and uneven shard split (rest-0 199, rest-1 141): shards are split by alphabetical index %3, not by cost.
4. lean-candidate 267 s + e2e full/lean 270/233 s: each of the e2e jobs runs its own `npm run build` (in webServer) plus `playwright install --with-deps` and builds web again; lean-candidate does two more clean builds. Web is built >= 5 times per PR (ts-check, e2e x2, lean-candidate x2, plus pages/beta-acceptance workflows).
5. Repeated setup: every one of 14+ jobs does checkout + npm ci + libs restore; ts-typecheck 144 s + ts-check build 113 s both compile all libs (tsc). Plus 13 min runner queue seen on d91ae16a (not workflow-fixable; reduce job count/fan-out).
Also contract-analysis mythril 49 min and echidna 15 min on every PR touching contracts/** or workflow files (path filter includes release.yml/nightly.yml/contract-analysis.yml itself).
Recommendations (no 3rd-party actions; first-party only):
- Measure first: add a step-timing summary (`$GITHUB_STEP_SUMMARY`) per job; keep this table as baseline (done above).
- Drop the duplicate pass: run web tests once with `--coverage` (or coverage only on main/nightly) and the nocov config only if it tests different things; expected -150..-190 s on critical path.
- Merge typecheck into the build job: `tsc -b`/--build once (project references) then upload `packages/*/dist` as an artifact (actions/upload-artifact, already used) and have downstream jobs download it instead of rebuilding; or keep the existing dist cache (it is a build-tree cache keyed on source hashes: acceptable, but cache deps (~/.npm), not trees, is the owner preference - note trade-off).
- Build web once per profile and share `apps/web/dist` with e2e (playwright `webServer` uses prebuilt dist via preview, skip `npm run build`) and lean-candidate.
- Use `--target`/workspace-filtered runs: `npm run lint/typecheck -w` limited by changed workspaces on PRs (affected-only via git diff), full on main/nightly.
- Rebalance rest shards by measured time (move 2-3 heavy packages: chain-adapters 26 files/413 cases, cli 40 files, payer-sponsor) and bound parallelism: vitest `--maxWorkers=2..3` was used in cli-operator; explicit `--poolOptions` per shard avoids oversubscription on 2-4 vCPU runners.
- Concurrency: ci.yml/pages/beta/contract-analysis already cancel on PR; integration.yml deliberately does not (queue growth: consider cancel for PR events only, keep for schedule). Add `paths-ignore: ['docs/**','**/*.md']` to pages (already has `!**/*.md`), beta-acceptance (has), integration (paths allowlist present), contract-analysis (allowlist present): fine. ci.yml uses a `changes` job instead; ok but costs a runner (21 s + queue).
- Slow jobs to main/nightly only: contracts-coverage (131 s) and contracts-slither (36 s, also in nightly) and lean-candidate (267 s) could run on main + label/nightly; Mythril/Echidna stay path-filtered but drop `release.yml`/`nightly.yml` from the path filter or run only echidna on PR (mythril on nightly + tag). Saves ~49 min of runner time on contract-touching PRs.
- Playwright: cache is keyed on version (good); `--with-deps` apt install each run - install only chromium deps when cache hit (already noted in comment). Run lean+full e2e in one job sequentially sharing the install, or shard across 2 workers instead of 2 jobs.
- Required checks stay `typescript` and `contracts` aggregators (unchanged).

## 7. Blockers (ranked)

1. Release: no signing key + verifier/trust root absent from main (gates 1-2). Owner action + merge order.
2. Release: Mythril red by design on tag commit (gate 3). Owner policy decision.
3. Release: monolithic `npm test` with REQUIRE_ANVIL=1 likely fails on pool/payer anvil/circuit tests (gate 5) - needs a dry-run via workflow_dispatch-able copy or separate verification (cannot run tags here).
4. Test debt: anvil/circuit integration tests skipped in PR CI (gap 1); examples tests not in CI (gap 2).
5. CI speed items above (not blocking).

## 8. UNVERIFIED

- Mythril failing-reason text (log tail contained only post-job lines); relied on PROMOTION_PACKET + exit code.
- Whether environment `release`, required reviewers, Pages settings, branch protection exist (no settings API access).
- slither, echidna, mythril, coverage, integration docker stack, beta-acceptance, repro-check, release-build end-to-end: not run locally; CI results only.
- confidential-contracts hardhat suite locally (compiler host blocked); CI 152 s success on 7a620ff1.
- Release `verify` job outcome with REQUIRE_ANVIL=1 on GitHub (inferred from local reproduction).
- `npm audit signatures` (nightly) not run.
- Case counts by grep are approximate (multi-line/it.each); authoritative counts are runner totals above.
