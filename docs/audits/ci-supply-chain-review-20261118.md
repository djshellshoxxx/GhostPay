# CI, supply-chain and release-gate review (2026-11-18)

> **Dated snapshot.** Written 2026-11-18 against `main` `5467c158`. Re-checked 2026-11-28 against `main` `70458ebe`: `main` still has no branch protection (`GET /branches/main/protection` 404) and no rulesets (`GET /rulesets` `[]`), so the owner actions below still apply. Workflow line numbers may have moved since; later Pages, Mythril and remediation evidence is in `docs/audits/security-remediation-20261118.md`, `docs/audits/nov27-qualification.md` and `docs/pages/README.md`.

**Scope.** Every file under `.github/workflows/`, the composite actions under `.github/actions/`,
`.github/dependabot.yml`, `package.json` overrides, `package-lock.json`, and the repository settings that can be read
through this session's GitHub proxy. Source reviewed: worktree branch `secrec-local` (candidate `71abc7e5` plus
#204 merge `c487f0fe` and later commits). The workflow files are the same as on `main` `5467c158` except for one line
in `ci.yml` that #204 changes (`scripts/agent/*.test.mjs` is added to the `rest-0` node test command).

**This is an AI-assisted review. It is not an external audit or a security guarantee.** Repository settings that the
proxy refused to return (marked "proxy 403" below) are **unverified**. Nothing in this review was written to GitHub.

The changes needed in GitHub settings are in
[OWNER_ACTION_PACKET.md](../handoffs/consolidation-20261118/OWNER_ACTION_PACKET.md).

## 1. Repository settings, read-only (2026-11-18, `gh api`, repo `djshellshoxxx/GhostPay`)

| Endpoint | HTTP | Response (exact or summarised) |
|---|---|---|
| `repos/{r}` | 200 | public, `default_branch: main`, caller `permissions.admin: true`, `allow_auto_merge: true`, merge/squash/rebase all allowed, `delete_branch_on_merge: false`, `has_pages: true`, `web_commit_signoff_required: false` |
| `repos/{r}` `.security_and_analysis` | 200 | `secret_scanning: disabled`, `secret_scanning_push_protection: disabled`, `secret_scanning_non_provider_patterns: disabled`, `secret_scanning_validity_checks: disabled`, `dependabot_security_updates: enabled` |
| `repos/{r}/branches/main/protection` | 404 | `{"message":"Branch not protected"}` (`X-Accepted-Github-Permissions: administration=read`) |
| `repos/{r}/branches/main` | 200 | `commit.sha 5467c158069c5bab264b6a653ac56e89e13f3e13`, `protected: false` |
| `repos/{r}/rulesets?includes_parents=true` | 200 | `[]` |
| `repos/{r}/rules/branches/main` | 200 | `[]` |
| `repos/{r}/tags/protection` | 404 | `Not Found` (legacy endpoint retired; tag protection now uses rulesets, and there are none) |
| `repos/{r}/immutable-releases` | 200 | `{"enabled":false,"enforced_by_owner":false}` |
| `repos/{r}/private-vulnerability-reporting` | 200 | `{"enabled":true}` |
| `repos/{r}/code-scanning/default-setup` | 200 | `state: configured`, languages `actions, javascript, javascript-typescript, python, typescript`, `query_suite: default`, `schedule: weekly` |
| `repos/{r}/environments`, `.../environments/release`, `.../environments/github-pages` | 403 | proxy: "Access to this GitHub API path is not permitted through this proxy." **Unverified.** |
| `repos/{r}/actions/permissions`, `/workflow`, `/selected-actions`, `/access`, `/fork-pr-contributor-approval`, `/artifact-and-log-retention` | 403 | proxy: "Access to this GitHub Actions path is not permitted through this proxy." **Unverified** (default `GITHUB_TOKEN` permissions, allowed actions, SHA-pinning requirement, fork approval) |
| `repos/{r}/actions/secrets`, `/actions/variables`, `/pages`, `/vulnerability-alerts`, `/automated-security-fixes`, `/collaborators`, `/secret-scanning/alerts`, `/dependabot/alerts` | 403 | proxy refusals. **Unverified** |
| `repos/{r}/actions/workflows` | 200 | 17 workflows, all `state: active`, including `ghostpay-codex-cloud.yml` (406080756), `ghostpay-parallel-review.yml` (406377707), `ghostpay-parallel-agents.yml` (406366404, not on `main`), `openai-agents.yml` (407415579, not on `main`), and the dynamic `pages-build-deployment` (391893668) |
| `repos/{r}/deployments?per_page=5` | 200 | latest five are `github-pages` from `main`, 2026-10-22, created by the old "Pages mirror" push workflow (run 39775570505, commit `dbee6786`); latest status `success`, URL `https://djshellshoxxx.github.io/GhostPay/` |
| `repos/{r}/deployments?environment=release` | 200 | `[]` (the `release` environment has never been deployed to) |
| `repos/{r}/actions/workflows/392799216/runs` (Release) | 200 | `total_count: 0` |
| `repos/{r}/releases`, `repos/{r}/tags` | 200 | empty |
| `repos/{r}/pulls/203` | 200 | merged 2026-11-18T06:56:49Z by `djshellshoxxx`, head `71abc7e5`, merge commit `5467c158`; reviews: `COMMENTED` only (CodeQL bot, owner), no `APPROVED` |

## 2. Check runs on PR #203 head `71abc7e55c25d45b206ac47e5ddd24e072805710`

`gh api --paginate repos/{r}/commits/71abc7e5.../check-runs?per_page=100`: 45 check runs when first read; 46 on
re-read, because at 2026-11-18T07:01:20Z the third-party app `graphify-labs` (`app.id` 4356270) posted a `neutral`
check `Graphify Formal Verification` on `71abc7e5`. The `github-actions` app has `app.id` 15368; the `CodeQL` summary
check comes from `github-advanced-security` (`app.id` 57789). An installed third-party App can therefore write
checks on this repository, which is why required checks must pin `integration_id` 15368 (the `ghostpay-codex-cloud.yml`
merge gate already filters on `app.slug == "github-actions"`). Owner action: review the installed GitHub Apps and
their permissions (packet section 0).

| Workflow (run) | Check-run names | Conclusion |
|---|---|---|
| CI (44248573953) | `changes`, `ts-typecheck`, `ts-lint`, `ts-check`, `ts-test (core-crypto|btc-silent-payments|web|confidential-contracts|rest-0|rest-1|rest-2)`, `ts-test-relayer`, `typescript`, `e2e (full)`, `e2e (lean)`, `lean-candidate`, `contracts-test`, `contracts-coverage`, `contracts-static`, `contracts-slither`, `contracts-extra (pool-contracts, ...)`, `contracts-extra (payer-hiding-contracts, ...)`, `contracts`, `secrets-and-egress` | all success |
| Contract analysis (44248573915) | `echidna`, `mythril` | echidna success; **mythril failure** (step "Execute the unchanged full analyzer runner") |
| Pages (44248573838) | `Build and verify the Pages site`, `Pages artifact on anvil (browser)` success; `Release gates (...)`, `Deploy to GitHub Pages`, `Post-deployment smoke test` skipped |
| Beta acceptance (44248574017) | `beta acceptance (lib + cli + browser on anvil)` | success |
| Integration (44248573913) | `integration (anvil + bitcoind regtest + solana-test-validator)` | success |
| Hosting kit (44248574005) | `kit`, `qualify-ghostpay-web` | success |
| CLI operator qualification (44248574003) | `CLI (ubuntu-24.04)`, `CLI (windows-latest)`, `CLI (macos-latest)` | success |
| GhostPay Parallel Research and Verification (44248574009) | `validate` success; `research`, `publish` skipped |
| CodeQL (44248568186) | `Analyze (actions)`, `Analyze (javascript-typescript)`, `Analyze (python)`, plus `CodeQL` (app 57789) | success |

Contract analysis run 44248573915 has two artifacts: `contract-analysis-mythril-71abc7e5...` (17,069 bytes,
`sha256:0ce796486f51334c3511a5d7bb1c836122d114e2d4195026e622ed537b9edf95`) and `contract-analysis-echidna-71abc7e5...`
(12,396 bytes, `sha256:7ce7ecb2097c07268718c2b0e4a5f29b0b2dbf5424d0b62b1fb3ca984f7e40d3`).
`gh run download 44248573915` failed: the proxy refused the artifact blob host
(`productionresultssa16.blob.core.windows.net`, `connect_rejected`). `git diff --stat 7a620ff1 71abc7e5 -- packages/contracts`
is empty, so the contracts are identical to those of run 44242366379 that the Mythril disposition records describe.

**Which of these can be required checks.** Only workflows that run on every pull request can be required:

- CI has no `paths` filter. On a docs-only PR its heavy jobs are skipped, and a skipped matrix job reports one check
  named after the job **without** the matrix suffix. Observed on CI runs 44253820581 (`83fe9b02`) and 44253716389
  (`c5efadab`): the skipped job is reported as `e2e`, not `e2e (full)` / `e2e (lean)`. Requiring `e2e (full)` would
  leave every docs-only PR waiting for ever. `changes`, `typescript`, `contracts` and `secrets-and-egress` are
  reported under the same names on every PR.
- Contract analysis, Pages, Beta acceptance, Integration, Hosting kit, CLI operator and Parallel review have `paths`
  filters, so a PR outside those paths never reports them. They cannot be required checks without blocking unrelated
  PRs. Mythril is also red by design until the owner decides the disposition policy. The release gate enforces Mythril
  and Echidna on the exact tagged commit instead (section 4).
- CodeQL default setup runs on every PR to `main`. Use the ruleset `code_scanning` rule rather than a status-check
  name.

## 3. Workflow-by-workflow review

`bash scripts/check-actions-pinned.sh`: `OK: 111 'uses:' reference(s) checked, all pinned to full SHAs with version
comments.` (exit 0, before and after the edits in section 6.)

Every SHA was checked against upstream with `git ls-remote https://github.com/<owner>/<repo> refs/tags/<tag> refs/tags/<tag>^{}`
(the GitHub API for other repositories is blocked by the proxy). The commit each tag points to is in brackets:

| Action | Pinned SHA | Comment | Upstream |
|---|---|---|---|
| actions/checkout | `3d3c42e5` | v7.0.1 | match |
| actions/setup-node | `949feb24` | v7.1.0 | match |
| actions/setup-python | `ece7cb06` | v6.3.0 | match |
| actions/cache (workflows) | `55cc8345` | v6.1.0 | match |
| actions/cache, actions/cache/restore (composites) | `27d5ce7f` | v5.0.5 | match (one major behind: CI-06) |
| actions/upload-artifact | `cf430e03` | v7.0.2 | match |
| actions/download-artifact | `9000827c` | v8.0.2 | match |
| actions/attest-build-provenance | `4d101475` | v4.2.2 | match |
| actions/configure-pages | `45bfe019` | v6.0.0 | match |
| actions/upload-pages-artifact | `fc324d35` | v5.0.0 | match |
| actions/deploy-pages | `368f8252` | v5.0.1 | match |
| foundry-rs/foundry-toolchain | `dba66c27` | v1.9.2 | match |
| peter-evans/create-pull-request | `22a90890` | was `v7` | `v7` and `v7.0.11` [22a90890]: comment corrected to `v7.0.11` |
| openai/codex-action | `bdf19a4a` | was `v1` | **`v1` now [306c6a19] = `v1.14`; the pin is `v1.13` [bdf19a4a]**: comment corrected to `v1.13` |

| Area | Result |
|---|---|
| `permissions:` | Every workflow sets a top-level block (`contents: read`, or `{}` for both paid-agent workflows). Every job restates least privilege, except `cli-operator.yml`, whose single job inherits `contents: read`. Write scopes: `release.yml` build (`id-token`, `attestations`) and draft-release (`contents: write`); `pages.yml` deploy (`pages`, `id-token`); `ghostpay-codex-cloud.yml` integrate (`contents`, `pull-requests` write, `checks: read`) and publish (`contents`, `pull-requests`, `actions` write); `ghostpay-parallel-review.yml` publish (`contents`, `pull-requests` write). Each is the scope its step needs. |
| Untrusted triggers | No `pull_request_target`, `workflow_run`, `issue_comment` or `secrets: inherit` anywhere. |
| Expression injection | No `${{ }}` expression inside any `run:` script; event, input and step-output values reach shell through `env:`. The only hit is `ci.yml:483` `defaults.run.working-directory: ${{ matrix.project.path }}`, a static matrix value. In `with:` inputs (`prompt`, PR `title`/`body`) only static matrix values, `github.run_id`/`repository` and step outcomes are interpolated. |
| Checkout credentials | Every `actions/checkout` uses `persist-credentials: false`. `release.yml` passes the token per command through `-c http.extraheader` (read-only token). |
| Concurrency | `release.yml:23-25` `cancel-in-progress: false`; `pages.yml:219-222` deploy job group `pages-deploy` `cancel-in-progress: false`; `pages.yml:44-47` cancels only `pull_request`; `contract-analysis.yml:20-22` cancels only `pull_request` (the caller's `push`/`schedule` event applies under `workflow_call`); `nightly.yml`, `integration.yml` and both agent workflows `false`. `beta-acceptance.yml` and `cli-operator.yml` cancel superseded runs (PR validation only; no release role). |
| Release gating (`release.yml`) | Tag push `v*` only. `verify` checks the tag signature against the **default-branch** copies of `verify-tag.sh` and `.github/release-signers/allowed_signers` (signed, annotated, named, at HEAD, ancestor of the default branch), then runs the full test suite. `contract-analysis` (the reusable workflow) runs on `github.sha` after `verify`. `build` (environment `release`) re-verifies the tag after approval, downloads `contract-analysis-{echidna,mythril}-${{ github.sha }}` from this run, and requires `analysisOutcome == "success"`, `runnerExitCode == 0`, `requestedCommit == GITHUB_SHA == checkoutCommit` in each `metadata.json`. It builds with `GP_REQUIRE_RELEASE=1`, self-verifies, attests `SHA256SUMS` subjects and uploads. `draft-release` (environment `release`) re-checks that the tag ref is still the verified tag object and that the manifest commit and channel match, then creates a **draft** only. `allowed_signers` holds 0 keys, so every release fails closed at the tag check today. Mythril is red on the candidate, so the analysis gate would also fail. The publish stub is commented out (`if: false`). |
| Provenance | `actions/attest-build-provenance` over `release-out/SHA256SUMS`; `.github/actions/release-verify` verifies with `--signer-workflow .../release.yml --source-ref refs/tags/<tag> --source-digest <commit> --deny-self-hosted-runners`. No SLSA level is claimed. |
| Pages (`pages.yml`) | Publish only when `workflow_dispatch` **and** `ref == refs/heads/main` **and** `inputs.deploy == true` (`pages.yml:64-69` in the `mode` step `:59-69`, `release-gates` `if` `:171`, `deploy` `if` `:216`). The deploy needs `site`, `acceptance`, `release-gates`; a skipped need skips the deploy. No `push` trigger. The `github-pages` environment protection could not be read (proxy 403). |
| Lockfile and install | `package-lock.json` `lockfileVersion: 3`; 678 registry packages, all `resolved` from `https://registry.npmjs.org` with `integrity`; 68 entries without `resolved` are the local workspaces. Every `npm ci` in CI uses `--ignore-scripts` (also `release-build.sh:59`, `scripts/integration/run-in-runner.sh:65`); 3 packages with install scripts (`fsevents`, `keccak`, `secp256k1`) never run them. Overrides resolve as declared: `ws 8.21.0`, `underscore 1.13.8`, `viem 2.57.13`, `serialize-javascript 7.1.4`, `glob 14.0.6`, `minimatch 11.0.8`, mocha `diff 8.0.3`, `tmp 0.2.7`. `npm ls --all --omit=dev` gates `ts-check` and the Pages site; `npm audit --omit=dev --audit-level=high` gates `ts-check` and release verify; `npm audit signatures` runs nightly only. |
| Native tool downloads | Echidna archive is SHA-256-pinned (`contract-analysis.yml:37-57`); pip tools are version-pinned (`mythril==0.24.8`, `slither-analyzer==0.11.6`, `solc-select==1.2.0`, `crytic-compile==0.4.2`) but not hash-pinned; Foundry `v1.8.5` is installed through the SHA-pinned action. |
| Caches | `setup-node-libs` restores and saves `packages/*/dist` keyed on all build inputs; agent jobs pass `save-cache: 'false'` (restore-only, npm cache off). `pages.yml` builds libraries from source and uses no `actions/cache`; it does use the setup-node npm download cache, which `npm ci` integrity-checks. PR-scoped caches cannot be restored by `main` or tag runs. |

## 4. Findings

Severity is Critical/High/Medium/Low/Info. "Fixed" means changed in this commit; everything else is open.

| ID | Severity | Location | Finding | State |
|---|---|---|---|---|
| CI-01 | High | repository settings; `.github/workflows/ci.yml:1-6` | `main` has no branch protection and no rulesets (404 / `[]`), so no check is required and anyone with write access, including PAT-holding automation, can push to or merge into `main`. PR #203 was merged with the `mythril` check run **failed** and no approving review. The release trust model relies on "reachable from the default branch" (`release.yml:62-65`), so an unprotected `main` weakens it. | Open (owner, packet section 1) |
| CI-02 | High | `.github/workflows/ghostpay-codex-cloud.yml:4-6,17-131`; `.github/workflows/ghostpay-parallel-review.yml:11-13` | Paid AI automation is **live on a schedule**. `ghostpay-codex-cloud.yml` runs daily (14 scheduled runs; last on 2026-11-17, `develop` failed in "Run API-funded Codex"), and its `integrate` job, with `contents: write` and `pull-requests: write`, auto-merges `codex/ghostpay-cloud-*` PRs. `ghostpay-parallel-review.yml` runs twice daily (28 scheduled runs; last success 2026-11-18T03:50Z) with four parallel paid passes. Both are `state: active`. OpenAI spending is uncapped (the workflows say so). The PR-creating step uses the optional `GHOSTPAY_GITHUB_TOKEN` PAT. | Open (owner decision; not changed here: removing triggers is an owner call) |
| CI-03 | Medium | `.github/workflows/ghostpay-codex-cloud.yml:36-55,44,80` | The auto-merge gate requires only `typescript`, `contracts`, `e2e (full)`, `e2e (lean)` and `secrets-and-egress`, yet its path policy allows `packages/*`, including `packages/contracts/src/**`. Contract analysis (Mythril/Echidna), Pages, Beta, Integration and CLI results are never checked, so an approved agent PR that changes Solidity can merge with Mythril red. The same policy also lets agent PRs edit the analyzer runners and gate code: `packages/contracts/scripts/run-mythril.sh`, `run-echidna.sh`, `mythril-compat.py` (installed as the `myth` binary, `contract-analysis.yml:68`), `collect-analysis-report.py` (writes the evidence `release.yml` checks, `contract-analysis.yml:88`), `packages/contracts/echidna.yaml`, the Echidna harnesses `packages/contracts/test/echidna/*`, `scripts/pages/verify-pages-site.mjs` and `scripts/contract-analysis/*` (evaluated with a copy of `agent_path_allowed()` from `:36-55`: all ALLOWED; `scripts/tests/*`, `contract-analysis.yml` and `slither.config.json` denied). This contradicts the policy's own comment at `:44` ("an agent PR may not edit what judges it"). Together with the merge gate not requiring contract analysis, an approved agent PR could weaken the Mythril or Echidna runner. A human approval from a writer at the exact head is still required. | Open (backlog: add these paths to the deny case in all three policy copies; add the path-conditional checks, or forbid `packages/contracts/**`) |
| CI-04 | Medium | `.github/workflows/release.yml:108,210`; `.github/workflows/pages.yml:226-228` | The `release` and `github-pages` environment protection rules are unverifiable (proxy 403). If `release` does not exist, GitHub creates it **without protection** on the first job that names it, so the "requires approval" claim in `release.yml:14-15` would be void. `deployments?environment=release` is `[]`. Today the release still fails closed at the empty `allowed_signers` file and at red Mythril. | Open (owner, packet section 3) |
| CI-05 | Medium | repository secrets; workflow id 407415579 | Repository-level secrets (`GHOSTPAY_OPENAI_API_KEY`/`OPENAI_API_KEY`/`PATCHTRACE_OPENAI_API_KEY`, optional `GHOSTPAY_GITHUB_TOKEN` PAT) are readable by any workflow file on any branch that a writer pushes. Workflows run from non-`main` branches: `.github/workflows/openai-agents.yml`, which no longer exists on `main`, has 971 push runs (latest 100 all `failure` with 0 jobs, e.g. run 44255111059 on `nodata/zealous-hopper-lr0nxe`). Agent sessions push many branches. | Open (owner: move these secrets to an environment restricted to `main`; delete stale branches carrying old workflows) |
| CI-06 | Low | `.github/dependabot.yml:4-5`; `.github/actions/setup-forge/action.yml:13,19`; `.github/actions/setup-node-libs/action.yml:26,34` | The Dependabot `github-actions` entry used `directory: /`, which scans only `.github/workflows` and a root `action.yml`. Evidence: Dependabot commit `a8c62cb5` bumped `actions/cache` 5.0.5 to 6.1.0 in workflows only, so the composite actions still pin v5.0.5. | **Fixed**: `directories: [/, /.github/actions/*]` |
| CI-07 | Low | `.github/workflows/ghostpay-codex-cloud.yml:186,407`; `.github/workflows/ghostpay-parallel-review.yml:85,247` | The version comments did not name the pinned release. `openai/codex-action@bdf19a4a # v1` is actually v1.13 (the floating `v1` tag has moved to v1.14 `306c6a19`), and `create-pull-request # v7` is v7.0.11. A reviewer comparing the comment with the tag would see a mismatch, and Dependabot reads the comment. | **Fixed** (comments only; SHAs unchanged) |
| CI-08 | Low | `.github/workflows/ci.yml:242-252` | `e2e` is a matrix job with no stable aggregator, so no browser-suite check can be required: docs-only PRs report it as `e2e` while code PRs report `e2e (full)`/`e2e (lean)`. | Open (packet section 1.3 has an additive aggregator job for the owner to approve) |
| CI-09 | Low | `.github/workflows/ci.yml:114`; `.github/workflows/nightly.yml:86-87` | No dependency-review step on PRs. The PR gate is `npm audit --omit=dev --audit-level=high` only, so new dev dependencies, licence changes and moderate advisories are not gated. `npm audit signatures` runs only nightly. | Open (backlog: `actions/dependency-review-action`, pinned, after the owner confirms the dependency graph is on) |
| CI-10 | Low | `.github/workflows/release.yml:67-70,174-177` | The release `verify` and `build` jobs restore the shared setup-node npm download cache (`cache: npm`). `build` holds `id-token: write` and `attestations: write`. `npm ci` checks every tarball against the lockfile's `integrity`, so tampered content fails the install; the remaining risk is low. | Open (consider `cache: ''` in release jobs; not changed because release workflow tests pin its structure) |
| CI-11 | Low | repository settings | Secret scanning and push protection are disabled on a public repository, and immutable releases are disabled. | Open (owner, packet section 4) |
| CI-12 | Low | `.github/workflows/nightly.yml:89-103` | Nightly has been red on `main` in every recorded run: `gh api repos/{r}/actions/workflows/nightly.yml/runs?per_page=100` lists 26 scheduled runs, from the first on 2026-10-23 (39925696583, `dbee6786`) through 2026-11-12 (43207918013, `bd2652bf`) to 2026-11-17, and every one concluded `failure` (the failing jobs were not checked per run). The latest, run 44078371383 (`cfaebeea`, created 2026-11-17T11:55Z), failed `reproducibility` ("Two clean builds in separate directories must be byte-identical") and `mythril`. No notification or issue is raised. Reproducibility is a release property. | Open (backlog: reproduce `scripts/repro-check.sh --head` on `5467c158`) |
| CI-13 | Info | `.github/workflows/pages.yml:144-145,181-182,247-248` | The comments say "No Actions cache anywhere in this workflow", but every job uses `actions/setup-node` with `cache: npm` (`:82`, `:149`, `:186`, `:252`). The test `scripts/tests/workflows.test.mjs:111-128` checks only `actions/cache` and `setup-node-libs`. Lines 76-78 describe the behaviour correctly. | Open (wording) |
| CI-14 | Info | Pages | The live bytes at `https://djshellshoxxx.github.io/GhostPay/` were not fetched (egress refused; the Pages API returned 403). The latest recorded deployment (`gh api repos/{r}/deployments`) is 7251740697 to `github-pages`, 2026-10-22T12:07:53Z, from the then push-triggered "Pages mirror" workflow (`.github/workflows/pages.yml` at the time, run 39775570505, `dbee6786`); none followed. It is not the current lean build and was not produced by the current gated `pages.yml`. A `gh-pages` branch (`cc8d0794`, 2026-10-21) and three `pages-build-deployment` runs (all 2026-10-21) also exist. | Open (owner: keep, redeploy through `pages.yml`, or unpublish) |

## 5. What was not verified

- Environment reviewers, deployment branch policies, Actions permissions (default token, allowed actions, SHA-pinning
  policy, fork approval), secrets and variables, Pages build type, Dependabot/CodeQL/secret-scanning alert inventories:
  proxy 403. The owner must read them (packet section 0).
- The Mythril artifact of run 44248573915: download blocked by the proxy. The check-run conclusion (`failure`) and
  artifact digests are recorded above.
- The live Pages bytes (egress refused) and the list of GitHub Apps installed on the repository with their
  permissions. Only the check runs show that `graphify-labs` (4356270) can write checks (section 2); the owner should
  review installed Apps in Settings > GitHub Apps (packet section 0).
- The `directories` glob behaviour is from GitHub's Dependabot configuration reference. It takes effect only after
  merge to `main`, on Dependabot's next weekly run.

## 6. Changes in this commit

| File | Change |
|---|---|
| `.github/dependabot.yml` | `github-actions`: `directory: /` replaced by `directories: [/, /.github/actions/*]` (CI-06) |
| `.github/workflows/ghostpay-codex-cloud.yml` | Version comments `# v1` to `# v1.13` (codex-action) and `# v7` to `# v7.0.11` (create-pull-request) (CI-07) |
| `.github/workflows/ghostpay-parallel-review.yml` | Same two comment corrections (CI-07) |

No trigger, schedule, job, permission, test command or analyzer was changed. Verification after the edits:
`bash scripts/check-actions-pinned.sh` returned OK (111 refs, exit 0).
`node --test scripts/tests/ghostpay-*.test.mjs scripts/tests/workflows.test.mjs scripts/tests/workflow-files.test.mjs scripts/tests/contract-analysis-workflow.test.mjs scripts/tests/dependency-tooling.test.mjs`
passed 59 of 59. A Python `yaml.safe_load` of the three edited files succeeded.
