# Owner action packet: repository protection, release and Pages gates (2026-11-18)

> **Dated snapshot.** Written 2026-11-18 against `main` `5467c158`. Re-checked 2026-11-28 against `main` `70458ebe`: `main` still has no branch protection (`GET /branches/main/protection` 404) and no rulesets (`GET /rulesets` `[]`), so the owner actions below still apply. Workflow line numbers may have moved since; later Pages, Mythril and remediation evidence is in `docs/audits/security-remediation-20261118.md`, `docs/audits/nov27-qualification.md` and `docs/pages/README.md`.

Every step here is a **write to GitHub settings that only the repository owner should make**. None of it has been
run. The repository settings were read on 2026-11-18 with read-only `gh api` calls. Findings, evidence and HTTP codes
are in [ci-supply-chain-review-20261118.md](../../audits/ci-supply-chain-review-20261118.md). This is an AI-prepared
packet, not an external audit. Run each step from a shell where `gh auth status` shows the owner account, read each
JSON before you send it, and run section 0 first.

```bash
R=repos/djshellshoxxx/GhostPay        # owner: djshellshoxxx, user id 127660907 (from `gh api $R --jq .owner.id`)
```

Save each JSON block below under the file name given in its heading, in the directory you run the commands from.

## 0. Read first (these settings were unreadable from the review session: proxy 403)

```bash
gh api $R/environments                                   # does `release` exist? `github-pages`?
gh api $R/environments/release --jq '{protection_rules, deployment_branch_policy}'
gh api $R/environments/github-pages --jq '{protection_rules, deployment_branch_policy}'
gh api $R/environments/github-pages/deployment-branch-policies
gh api $R/actions/permissions                            # enabled / allowed_actions / sha_pinning_required
gh api $R/actions/permissions/workflow                   # default_workflow_permissions, can_approve_pull_request_reviews
gh api $R/actions/permissions/selected-actions
gh api $R/actions/permissions/fork-pr-contributor-approval
gh api $R/actions/secrets --jq '.secrets[].name'         # which agent keys / PATs exist at repository level
gh api $R/environments/release/secrets --jq '.secrets[].name' 2>/dev/null
gh api $R/pages --jq '{build_type, source, html_url, https_enforced}'
gh api $R/vulnerability-alerts -i | head -1              # 204 = dependency graph alerts on, 404 = off
```

Also review the GitHub Apps installed on the repository and their permissions (Settings > GitHub Apps, or
Settings > Integrations for the owner account). A third-party App, `graphify-labs` (app id 4356270), posted a check
run on `71abc7e5` at 2026-11-18T07:01:20Z, so installed Apps can write checks here; remove any App that does not
need `checks: write`.

If `release` is missing, GitHub creates it **without protection** the first time `release.yml` runs, and the
"requires approval" gate is then empty (review finding CI-04). Do section 3 before pushing any `v*` tag.

## 1. `main` branch ruleset

### 1.1 Required checks: chosen from the check runs on PR #203 head `71abc7e5`

The source is `gh api $R/commits/71abc7e55c25d45b206ac47e5ddd24e072805710/check-runs`: 45 runs when first read, 46 on
re-read (the extra one is the `graphify-labs` check above); app `github-actions` `id` 15368. Pinning
`integration_id` 15368 stops another app from posting a green check under the same name.

| Required | Check name | Why it can be required |
|---|---|---|
| yes | `changes` | CI, no path filter, same name on every PR |
| yes | `typescript` | Aggregator (`ci.yml:226-240`, `if: always()`) over `changes`, `ts-typecheck`, `ts-lint`, `ts-check`, all 7 `ts-test (...)` shards and `ts-test-relayer`: it fails on any result other than `success` or `skipped`. It accepts any mix of the two; it does not check all-or-nothing |
| yes | `contracts` | Aggregator (`ci.yml:515-529`, same loop) over `changes`, `contracts-test`, `-coverage`, `-static`, `-slither`, both `contracts-extra (...)` |
| yes | `secrets-and-egress` | Secret scan, action pinning, tx.origin, headers, self-host gate, CLI permission tests; never skipped |
| via `code_scanning` rule | CodeQL | Default setup runs on every PR; enforced as a rule, not by name |
| **no** | `e2e (full)`, `e2e (lean)`, `lean-candidate` | On a docs-only PR the skipped matrix job reports as `e2e` (CI runs 44253820581, 44253716389), so requiring `e2e (full)` blocks those PRs for ever. Add the aggregator in 1.3 first, then require `browser`. |
| **no** | `echidna`, `mythril` | `contract-analysis.yml` runs only for contract paths, and Mythril is red by design (blocker 2 of the promotion packet). `release.yml` enforces both on the exact tagged commit instead. |
| **no** | Pages, Beta acceptance, Integration, Hosting kit, CLI operator, Parallel review `validate` | All have `paths` filters, so they are absent on unrelated PRs |

Whether the `ts-*` and `contracts-*` jobs run or skip depends only on `needs.changes.outputs.code == 'true'`
(`ci.yml:21-57`, the `changes` job). The `changes` path classifier is therefore the trust anchor of both aggregators: a
misclassified code change would skip every job and both aggregators would still pass. Review any change to the
`changes` job as a change to the gate itself.

`required_approving_review_count` is 0 because this repository has one maintainer, and GitHub does not let an
author approve their own PR. With a second maintainer, raise it to 1 and set `require_last_push_approval: true`.
`bypass_actors` is empty, so the owner is held to the same rule. This also applies to merges made with the
`GHOSTPAY_GITHUB_TOKEN` PAT by `ghostpay-codex-cloud.yml`.

Residual (this ruleset does not fully close CI-01): with 0 approvals and `echidna`/`mythril` not required, it would
still have allowed PR #203's merge, which is the CI-01 evidence (`mythril` job 134613402317 completed `failure` at
2026-11-18T06:54:55Z; merged at 06:56:49Z; reviews `COMMENTED` only, no `APPROVED`). The required set in 1.2 is
`changes`, `typescript`, `contracts` and `secrets-and-egress` plus the `code_scanning` rule. Mythril stays enforced
only by `release.yml` on the tagged commit.

### 1.2 `main-ruleset.json`

```json
{
  "name": "main: pull request + required checks",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["merge", "squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "changes", "integration_id": 15368 },
          { "context": "typescript", "integration_id": 15368 },
          { "context": "contracts", "integration_id": 15368 },
          { "context": "secrets-and-egress", "integration_id": 15368 }
        ]
      }
    },
    {
      "type": "code_scanning",
      "parameters": {
        "code_scanning_tools": [
          { "tool": "CodeQL", "security_alerts_threshold": "high_or_higher", "alerts_threshold": "errors" }
        ]
      }
    }
  ]
}
```

```bash
gh api -X POST $R/rulesets --input main-ruleset.json
gh api $R/rules/branches/main           # verify: deletion, non_fast_forward, pull_request, required_status_checks, code_scanning
```

To try it first without blocking anyone, set `"enforcement": "evaluate"`; that mode may need a paid plan. If
rulesets are unavailable, the legacy branch protection equivalent is `branch-protection-legacy.json`:

```json
{
  "required_status_checks": {
    "strict": false,
    "checks": [
      { "context": "changes", "app_id": 15368 },
      { "context": "typescript", "app_id": 15368 },
      { "context": "contracts", "app_id": 15368 },
      { "context": "secrets-and-egress", "app_id": 15368 }
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0, "dismiss_stale_reviews": true },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
```

```bash
gh api -X PUT $R/branches/main/protection --input branch-protection-legacy.json
```

### 1.3 Optional, needs a reviewed PR: a stable browser aggregator

This job is additive and strengthens the gate; it changes no test command. If it is merged, add
`{ "context": "browser", "integration_id": 15368 }` to the ruleset. It is not applied here because `ci.yml` is under
concurrent edit (#204) and the change needs its own review.

```yaml
  # Stable required-check name for the browser suite (e2e matrix names differ when the job is skipped).
  browser:
    if: always()
    needs: [changes, e2e, lean-candidate]
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions: {}
    steps:
      - env:
          RESULTS: ${{ join(needs.*.result, ' ') }}
        run: |
          echo "needs results: $RESULTS"
          for r in $RESULTS; do
            case "$r" in success|skipped) ;; *) echo "::error::a needed job ended as '$r'"; exit 1 ;; esac
          done
```

## 2. `v*` tag ruleset: `tag-ruleset.json`

Only repository admins (role id 5) can create, move or delete `v*` tags. Bypass applies to the acting identity, not
to a person: `ghostpay-codex-cloud.yml:62` says `GHOSTPAY_GITHUB_TOKEN` is "assumed to be the repository owner's
PAT" (used at `:28`, `:409`, `:432`), and repository secrets reach workflows on any pushed branch (CI-05). Automation
holding that PAT may therefore act as the admin and bypass this ruleset (and any admin-bypass rule). Do section 5's
PAT replacement or removal first, or confirm the bypass semantics for the fine-grained PAT you use. Today the tag
still fails closed at the empty `allowed_signers` file. `release.yml` also requires the tag to be
annotated, signed by a key in the **default-branch** `.github/release-signers/allowed_signers` (currently 0 keys,
so it fails closed), pointing at the checked-out commit and reachable from `main`. `draft-release` re-checks that
the tag object did not move during approval.

```json
{
  "name": "release tags v*",
  "target": "tag",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ],
  "rules": [ { "type": "creation" }, { "type": "update" }, { "type": "deletion" } ]
}
```

```bash
gh api -X POST $R/rulesets --input tag-ruleset.json
gh api "$R/rulesets?targets=tag" --jq '.[] | {id, name, enforcement}'
```

Before the first release, also: add the release-signing public key (`.github/release-signers/README.md`), and
enable immutable releases (section 4) so that a **published** release's tag and assets cannot change. Drafts are
unaffected, and `release.yml` only creates drafts.

## 3. Environments

### 3.1 `release`: required reviewer, `v*` tags only (`env-release.json`)

```json
{
  "wait_timer": 0,
  "prevent_self_review": false,
  "reviewers": [ { "type": "User", "id": 127660907 } ],
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
}
```

```bash
gh api -X PUT $R/environments/release --input env-release.json
gh api -X POST $R/environments/release/deployment-branch-policies -f name='v*' -f type=tag
gh api $R/environments/release --jq '{protection_rules, deployment_branch_policy}'
gh api $R/environments/release/deployment-branch-policies --jq '.branch_policies[] | {name, type}'   # exactly: v*, tag
```

`prevent_self_review: false` is required while the owner is the only reviewer, because the owner pushes the tag and
self-review prevention would block the approval. Set it to `true` once a second maintainer can review. Both `build`
and `draft-release` use this environment, so each release needs two approvals.

### 3.2 `github-pages`: required reviewer, `main` only (`env-github-pages.json`, same body as 3.1)

```bash
gh api -X PUT $R/environments/github-pages --input env-github-pages.json
gh api $R/environments/github-pages/deployment-branch-policies --jq '.branch_policies[] | {id, name, type}'
# delete any policy that is not exactly (main, branch):
#   gh api -X DELETE $R/environments/github-pages/deployment-branch-policies/<id>
gh api -X POST $R/environments/github-pages/deployment-branch-policies -f name=main -f type=branch
```

`pages.yml` already publishes only on a manual `workflow_dispatch` of `main` with `deploy=true`, after the site
build, the anvil acceptance and the release gates. The environment is the second, server-side lock. The live bytes at
`https://djshellshoxxx.github.io/GhostPay/` were not fetched (egress refused; the Pages API returned 403). The latest
recorded deployment is 7251740697 to `github-pages` at 2026-10-22T12:07:53Z, from the then push-triggered "Pages
mirror" workflow (run 39775570505, commit `dbee6786`), so the likely live content is that unqualified build (see
[docs/pages/README.md](../../pages/README.md) for the current Pages publication path). Decide whether to keep it, replace it through a gated `pages.yml` run, or
unpublish it (`gh api -X DELETE $R/pages`, which is irreversible for the current configuration).

## 4. Actions and security settings

```bash
# Read-only GITHUB_TOKEN by default; workflows cannot approve PRs (every workflow already declares its own scopes).
gh api -X PUT $R/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false

# Allow only GitHub-owned actions plus the three third-party actions in use, and require full-SHA pins.
# If the API rejects sha_pinning_required, set "Require actions to be pinned to a full-length commit SHA" in
# Settings > Actions > General.
gh api -X PUT $R/actions/permissions --input actions-permissions.json
gh api -X PUT $R/actions/permissions/selected-actions --input actions-selected.json

# Fork PRs: approval required for every external contributor before any workflow runs.
gh api -X PUT $R/actions/permissions/fork-pr-contributor-approval -f approval_policy=all_external_contributors

# Secret scanning and push protection (free on public repositories; both are disabled today).
gh api -X PATCH $R --input security.json

# Immutable releases (published releases only).
gh api -X PUT $R/immutable-releases

# Optional hygiene: delete head branches after merge.
gh api -X PATCH $R -F delete_branch_on_merge=true
```

`actions-permissions.json`:

```json
{ "enabled": true, "allowed_actions": "selected", "sha_pinning_required": true }
```

`actions-selected.json` (drop the last two patterns if section 5 retires the agent workflows):

```json
{
  "github_owned_allowed": true,
  "verified_allowed": false,
  "patterns_allowed": [
    "foundry-rs/foundry-toolchain@*",
    "peter-evans/create-pull-request@*",
    "openai/codex-action@*"
  ]
}
```

`security.json`:

```json
{
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" }
  }
}
```

## 5. Paid AI automation: owner decision (finding CI-02)

Two scheduled, uncapped paid workflows are active on `main`:

| Workflow | Schedule | Scheduled runs so far | Write scopes |
|---|---|---|---|
| `ghostpay-codex-cloud.yml` (id 406080756) | `37 8 * * *` daily | 14 (last 2026-11-17, `develop` failed) | `integrate`: `contents`/`pull-requests` write (auto-merge); `publish`: plus `actions: write` |
| `ghostpay-parallel-review.yml` (id 406377707) | `43 10,22 * * *` twice daily, 4 parallel passes | 28 (last 2026-11-18T03:50Z, success) | `publish`: `contents`/`pull-requests` write (draft PRs) |

To stop them without changing any file (reversible with `gh workflow enable`):

```bash
gh workflow disable 406080756 -R djshellshoxxx/GhostPay
gh workflow disable 406377707 -R djshellshoxxx/GhostPay
gh workflow list -R djshellshoxxx/GhostPay --all | grep -i ghostpay
```

Disabling `ghostpay-parallel-review.yml` also stops its PR `validate` job. Its two test files still run in `ci.yml`
`ts-test (rest-0)` (`node --test scripts/tests/*.test.mjs`), so no check is lost.

If they stay on:

- Move `GHOSTPAY_OPENAI_API_KEY`/`OPENAI_API_KEY`/`PATCHTRACE_OPENAI_API_KEY` and the `GHOSTPAY_GITHUB_TOKEN` PAT from
  repository secrets to an environment (for example `agent-automation`) whose deployment branch policy is `main`
  only. Then add `environment: agent-automation` to the jobs that read them, in a reviewed PR. Today any workflow file
  on any pushed branch can read repository secrets (CI-05).
- Use a fine-grained PAT limited to this repository with `contents` and `pull-requests` write only, or none at all
  (the workflows fall back to `github.token`).
- Before allowing contract changes, add the contract-analysis checks to the `integrate` merge gate, or forbid
  `packages/contracts/**` in the agent path policy (CI-03).

## 6. Stale branches carrying old workflows (CI-05)

`.github/workflows/openai-agents.yml` no longer exists on `main`, but it still runs on every push to branches that
carry it: 971 runs, the latest 100 all `failure` with 0 jobs. It is listed here; nothing was done about it. The
cleanup belongs to the retirement plan ([RETIREMENT_PLAN.md](RETIREMENT_PLAN.md)) and needs explicit approval
before any branch is deleted.

## 7. After the changes: verification commands (read-only)

```bash
gh api $R/rules/branches/main --jq '[.[].type]'
gh api "$R/rulesets?includes_parents=true" --jq '.[] | {name, target, enforcement}'
gh api $R/environments --jq '.environments[] | {name, protection_rules: [.protection_rules[].type], deployment_branch_policy}'
gh api $R/actions/permissions/workflow
gh api $R --jq .security_and_analysis
gh api $R/immutable-releases
```

The expected result is two active rulesets; `release` and `github-pages` each with a `required_reviewers` rule and
custom branch policies (`v*` tag, `main` branch); `default_workflow_permissions: read`; secret scanning and push
protection `enabled`; immutable releases `enabled: true`.
