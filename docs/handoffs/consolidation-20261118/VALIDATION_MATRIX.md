# Consolidation validation matrix (2026-11-18)

Every row names the exact source, command or run and the observed outcome. Counts from different suites overlap
and must not be summed. "Local" rows ran in the consolidation container (4 CPUs, 15 GB; Node 22.23.5, npm 10.9.9,
Foundry 1.8.5, Echidna 2.2.7, Mythril 0.24.8 on Python 3.13, Playwright 1.64.1 with host Chromium build 1243).
Raw logs and traces were kept outside the repository (they can contain synthetic test passphrases); this file
records their outcomes. A green CI job is evidence for its own head only.

## Hosted CI by source

| Head | Source content | Workflow runs and outcome |
|---|---|---|
| `beb525dd` (unified, baseline) | — | CI 43981233626 success (24/24); Contract analysis 43981233671 failure (Echidna `exec_native` canary not reached; Mythril 11 records) |
| `23cc6db4` (#200) | Pages through #200 | CI 44183173312 success |
| `2fb89ff5` (#201) | + same-view focus | CI 44201642137 failure: e2e (lean) stale-session re-import timed out (60 passed, 1 failed, 2 skipped) |
| `30cc4560` (#202) | + re-import control test | CI 44217528448 failure: e2e (lean) and e2e (full) control test `core-journey.spec.ts:662` timed out; `:619` passed in both |
| `5ddb042a` (candidate) | unified + main + #200 + specs + scanner fix | CI 44223559741 (superseded by push; aggregates cancelled): every completed job green, including e2e (full) 73 passed / 1 skipped and e2e (lean) 61 passed / 3 skipped |
| `bbd24cd0` (candidate) | + cigates, Mythril dispositions, TagArchive, #201/#202 + lost-click fix | CI 44226410239: all 23 completed jobs green (aggregate superseded by the next push), including e2e (full) **74 passed / 1 skipped** and e2e (lean) **62 passed / 3 skipped** (both include the #202 control and the #201 stale-session test); Pages 44226410137 success; Beta acceptance 44226410160 success; Integration 44226410163 success; Hosting kit 44226410157 success; CLI operator 44226410191 success (3 jobs); Contract analysis 44226410225: Echidna failure (same `exec_native` canary only; artifact report sha256 `a42f3c6f749fdf243bbe89e3550b6dae3a4a4446be2f3274b9ec4c7f3a2e924a`, requested = checkout = `bbd24cd0`), Mythril cancelled by the next push |
| `08ef4eb1` (candidate) | + Echidna harness actions and review records | Contract analysis 44228685328: **Echidna success** (first green Echidna on this source line; artifact 14395780070, report sha256 `f9153ed5…`); other runs superseded by the next push |
| `d91ae16a` (previous qualified head) | all product changes, including the contextual-help blur deferral and the blocked-download fix | CI 44231986652 **24/24 success** (e2e full 78 passed / 1 skipped; lean 66 passed / 3 skipped, both including four new contextual-help browser regressions); Pages, Beta acceptance, Integration, Hosting kit, CLI operator and CodeQL success; Contract analysis 44231986631: **Echidna success** (report `e9d5acf5…`), Mythril failure with 10 already-dispositioned records (report `475b27ec…`). Details: [PROMOTION_PACKET.md](PROMOTION_PACKET.md) |
| `ceea9fdd` | docs only over `d91ae16a` | CI 44239860965: `ts-test (web)` failed in the new blocked-download test (`expected true to be false`): a race with earlier tests' delayed Blob URL revocations (R-18) |
| `7a620ff1` (qualified head) | + R-18 test isolation fix | CI 44242366118 **24/24 success** (web 2,749 passed / 1 skipped; e2e full 78 / 1 skipped; lean 66 / 3 skipped); Pages, Beta acceptance, Integration, Hosting kit, CLI operator, CodeQL success; Contract analysis 44242366379: **Echidna success** (report `a0db0d06…`), Mythril failure with exactly the 11 dispositioned records (report `4f6cc97b…`) |

CodeQL on PR #203 flagged the bundle-scanner end-tag pattern and then a test assertion regex; both resolved
(R-01 in [REVIEW_FINDINGS.md](REVIEW_FINDINGS.md)).

## Local verification

| Area | Source | Command | Outcome |
|---|---|---|---|
| Main merge proof | `beb525dd`, `cfaebeea` | `git merge-tree --write-tree beb525dd cfaebeea`; per-file blob comparison | Tree `36177d29` (unchanged); 13/13 touched files identical |
| Pages slice | `d39e304a` | `npx vitest run` Trans, Pay.i18n, manifest, AppLean.fragment, Common, fragment tests | 6 files, 56 tests passed |
| Web typecheck | `d39e304a`; lanes later | `npm run typecheck --workspace @ghostpay/web` | exit 0 (coordinator and every web lane) |
| Bundle scanner | `b441cc64`/`5ddb042a` | `npx vitest run src/scanBundle.test.ts src/privacyInvariants.test.ts`; lean `npm run build` (postbuild scan) | RED first (guard returned no problems), then 78/78; real index.html scan passed (17 files) |
| Re-import e2e | reimport lane `af32d7f7` | lean/full `npx playwright test e2e/core-journey.spec.ts --project=desktop --workers=1 --grep "stale session:|verified keystore reimports"` | Before fix lean: `:619` 5/5 pass, `:662` 0/5; after fix lean 10/10, full 10/10; with AppShell reverted to `[view]` the control still failed (1/1), excluding #201 |
| Journey + help e2e | staging `86b6e9e5` | lean `e2e/core-journey.spec.ts e2e/contextual-help.spec.ts --project=desktop --workers=1` | 8 passed |
| ContextHelp/SellerKeys units | staging `86b6e9e5` | ContextHelp, AppLean.fragment, SellerKeys tests | 54 passed (regression RED before fix) |
| TagArchive | lane `b3e4051e` | TagArchive + Common tests; 18 related files; full and lean builds; `localBuildProfile.test.mjs` | RED first; 25 passed; related 290 passed; builds and lean guard pass; 33 passed |
| Full web suite | lane `b3e4051e` | `npx vitest run --maxWorkers=2` | 2,731 passed, 13 skipped, 1 failed: `scannerCore.fuzz.test.ts` one-million-log case hit its 180 s timeout at host load 10–13 (imports only core-crypto; timeout not changed). CI `ts-test (web)` passed on `bbd24cd0`. |
| Release gating | lane `05a4c2fc` | workflow YAML parse; `npm run ci:check-actions`; `node --test` contract-analysis-workflow, echidna-runner, mythril-runner, workflows, workflow-files; release tests | 111 `uses` OK; 54/54; 12 gate mutations caught; release tests 37 passed, 1 pre-existing skip (no ssh-keygen) |
| Contract snapshot | staging after each contract lane | `forge snapshot --check --no-match-test "testFuzz|invariant"`; `forge fmt --check` | 406 → 437 → 438 → 445 tests passed; only additions (plus the factory test contract's own entries after its new test); fmt clean |
| Mythril expiry | lane `d4171c7b` | `forge test --match-path test/MythrilExpiryDispositions.t.sol`; local Mythril rerun with runner parameters | 31 passed; 16 author + 6 reviewer mutants caught; rerun reproduced exactly the three SWC-116 records |
| Mythril factory | lane `2d54ab60` + `1e1121b3` | `forge test --match-path test/MythrilFactoryDispositions.t.sol`; local Mythril rerun (2700 s bound) | 33 passed; 8 author mutants + `nonReentrant` and `initialize`-external-call mutants caught; rerun reproduced R4–R7 and R9–R11 (R8 not reproduced, timeout-dependent) |
| Echidna | lane `292b15b3` | Policy harness, pinned config, seed 20261021, 300k calls, `--workers 1` and `--workers 2`; seed sweep 1–4 at 60k; `run-echidna.sh 60000` end to end; `forge test --match-path 'test/echidna/*'`; `node --test scripts/tests/echidna-runner.test.mjs` | Full budget: 300,020 / 300,004 calls, all Policy canaries falsified (exec_native at ≤21 / ≤1,072 calls), all five safety properties passing; seed sweep exec_native 4/4 (baseline 0/4); runner rc 0 for Router/Sweep/Policy at 60k; 7/7; 22/22 |
| Supersession | `0dda9ca1` | `git log --left-right --cherry-pick` per ref; extracted audit test under umask 022/002 | Six refs RETAINED; #44 test failed under 002 before correction, passes under both after |
| Census | candidate pin `278c9a27` | `census_20261118.py` (read-only git) | 215 refs; 2026-11-17 split 151/14/48/1 reproduced exactly; vs candidate 164/14/37/0 |
| Chain matrix | candidate | `node scripts/check-chain-matrix.mjs`; `--release` | Schema passes (14 chains, 9 tokens, 4 feeds); release mode rejects 73 unverified required cells (42 chain, 27 token, 4 feed; 7 enabled testnets) |

## Not run or not available

- Real tag-push release run (the new gate has not executed on GitHub); release signing; deployment; Pages
  publication; Wiki publication.
- CI-exact 4-worker Echidna and the full Router/Sweep campaigns on the final source (required from CI).
- Private CodeQL/Dependabot/secret-scanning inventories (HTTP 403 / proxy-blocked) and any Sonar inventory.
- Branch-protection, ruleset and environment-reviewer configuration changes (owner actions).
- Physical devices, WebKit/Firefox, real wallets, screen readers, native-language review, external audit.
