# GhostPay parallel API-funded QA workflow

This file describes `.github/workflows/ghostpay-parallel-agents.yml`. It does not replace or modify `.github/workflows/ghostpay-codex-cloud.yml`.

## Execution

- Four concurrent independent QA lanes: `invoice-qa` (`packages/invoice-schema/`), `recovery-qa` (`apps/web/e2e/`), `tooling-qa` (`scripts/tests/`), and `locale-qa` (`apps/web/src/i18n/`).
- Scheduled twice daily at 09:17 and 21:17 UTC, or manually with `workflow_dispatch`. GitHub scheduled jobs may be delayed. A distinct workflow concurrency group prevents overlapping parallel batches; the existing one-agent workflow retains its separate concurrency group.
- On pull requests affecting the workflow or its test, **only** the free validation job executes; no API-funded developer, publisher, or integrator may run on a PR event.
- Each funded job executes **one** Codex Action invocation, under `:workspace` and `drop-sudo`, with a 45-minute job timeout. Job timeouts and one attempt do not guarantee an API-dollar cap.
- Agents work from the current `main` snapshot and inspect the lean-scope and source-reconciliation documents. PR #47 currently owns much of the integrated core; agents must not duplicate that work. Open PR file ownership is inspected before an attempt and again afterward. Other workers and existing owners are never rebased, reset, rewritten or merged merely to make room.
- Exact changed-path collisions with open PRs, unauthorized files, and failed agent runs prevent patch publication. The publisher applies the patch to a fresh `main` checkout and rechecks the current open-PR file ownership, failing closed if it has changed. Non-overlapping tests may continue while core integration or human testing is pending.
- Publishers open one **draft PR per agent/lane** with a `codex/ghostpay-parallel-*` branch name. Drafts are not merged. A human must mark a PR ready and approve its **current** head commit; the integrator also demands successful `typescript`, `contracts`, `e2e` and `secrets-and-egress` check runs before attempting `gh pr merge --match-head-commit`. GitHub protection can impose additional requirements. Never waive them.
- The workflow does not deploy, release, sign, modify production trust, or send payments.

## API secret, cost and charging

Set repository Actions secret `GHOSTPAY_OPENAI_API_KEY` (preferred) or `OPENAI_API_KEY`. The publisher uses `GHOSTPAY_GITHUB_TOKEN` if supplied, otherwise the default GitHub token. Repository settings must allow Actions to create pull requests if that fallback is used.

**Budget intent:** $10 in API usage per worker invocation, four workers per batch = $40 target per batch, two batches daily = $80 target per day; GitHub-hosted runner usage is additional. These values are planning targets, **not usage ceilings**. The Codex GitHub Action does not expose authoritative per-run billed USD. Each lane uploads a `cost-accounting.json` receipt recording target USD, one attempt, run ID, status, and `actual_api_usd: null`. The run summary repeats this limitation. Do not treat those receipts as billing data.

To actually bound dollar exposure, configure a dedicated OpenAI API project/key and its available spend controls/alerts in the OpenAI platform. Monitor billed usage and manually disable the schedule if it exceeds tolerance; project budget alerts or soft limits are not a guaranteed transaction-level kill switch. No scripts scrape secrets, usage dashboards or administration endpoints.

## Operation

1. Merge only after the `validate` job and other required repository checks pass; PR reviews and branch protections remain unchanged.
2. Run **Actions → GhostPay Parallel API-Funded QA → Run workflow** on `main` after merging, or allow its next scheduled batch.
3. Inspect the four lane report artifacts and draft PRs. A lane with no safe work may produce no PR; that is preferable to duplicating active contributors.
4. Review/test each change against the exact PR head, approve it and mark it ready only when qualified. Subsequent scheduled/manual runs attempt guarded integration; the integrator cannot bypass branch protection.
5. Reconcile updates to PR #47 and the source map before expanding the lanes beyond independent core QA.

## Validation

`node --test scripts/tests/ghostpay-parallel-workflow.test.mjs` checks schedule, scope, isolation, ownership and merge-approval invariants. `ci.yml` retains its regular required tests; no branch protections or test thresholds are relaxed.

**Known limitations:** GitHub branch protection and actual run acceptance cannot be proven until the workflow is merged and dispatched. The narrow `apps/web/src/i18n/` lane may not have independent work on a particular base revision. Exact-file collision detection does not prove semantic non-overlap, so human PR review remains mandatory. CI status and true billed spending need external confirmation. A successful workflow run is not release qualification.
