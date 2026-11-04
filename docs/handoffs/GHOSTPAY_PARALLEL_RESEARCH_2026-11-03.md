# GhostPay independent API-funded research wave

Workflow: `.github/workflows/ghostpay-parallel-review.yml`

This is a **second, independent research-only** workflow, not a replacement for the existing single-agent development workflow or proposed four-agent QA workflow (PR #52). PR #47 is the current major integrated core owner.

## Scope

Four isolated lanes run concurrently:

| Lane | Research focus |
| --- | --- |
| `security-review` | Invoice/payment authentication, proof finality, relayer/sweep security, verifiable test proposals |
| `acceptance-tests` | Interrupted/unknown payments, replay, reorg, recovery, cancellation, browser acceptance matrix |
| `release-qualification` | Reproducibility, security/CI gates, build provenance, browser and deployment prerequisites |
| `documentation-ux` | Privacy limits, checkout wording, accessibility, onboarding and independent usability research |

Reports are expected to cite concrete source paths, reference verified PR/commit states, separate facts from hypotheses, and identify 1–3 actionable future tests or tasks while marking overlaps as blocked. The agents do not modify production code or implement suggestions themselves. They produce `research-output.md`, which is screened for the required headings and a strict allowlist of untracked report files, then published as an independent **draft documentation PR**. Reports need human validation; they are not an external audit.

## Coordination and merge policy

At run start, GitHub's current open PRs are summarized to `active-pr-ownership.md`. At publication, a new PR is suppressed if the same research lane already has an open PR, and the new report destination must not be claimed by another open PR. A research PR has no automatic merge job: human review, evidence checking and normal repository protections apply. Recommendations should be independently developed later only after task ownership is explicitly reconciled against PR #47, PR #52, and subsequent work. The workflow does not rewrite branches or copy contributor source.

## Frequency and API costs

Schedule: **10:43 and 22:43 UTC every day**, or manual `workflow_dispatch`, with a dedicated concurrency group. These times are offset from the development workflows to avoid simultaneous batch startup, though previously started jobs may still be active. Each of the four agents gets one Codex action attempt with a 45-minute job timeout. The planning target is **$10 per agent per batch**, or **$40 per batch / $80 per day** for this new workflow, in addition to other GhostPay automation. Runner charges are separate.

**No hard per-agent $10 cap is implemented.** The action does not supply trustworthy billed USD. Per-lane `research-cost.json` records the target and explicitly sets `actual_api_usd` to null and `hard_spending_cap` to false. Dedicated API project spend settings, account-level reporting and operational intervention are needed to control exposure; do not treat OpenAI project alerts as guaranteed hard transaction caps.

## Setup and validation

- Required: a repository Actions secret `GHOSTPAY_OPENAI_API_KEY` or `OPENAI_API_KEY`.
- PR creation: `GHOSTPAY_GITHUB_TOKEN`, or a permitted repository `GITHUB_TOKEN` with Actions setting allowing PR creation.
- Run `node --test scripts/tests/ghostpay-parallel-review-workflow.test.mjs` for static workflow invariants.
- Pull-request events execute only the non-paid validation job.
- After merging the draft workflow PR to `main`, run **Actions → GhostPay Parallel Research and Verification → Run workflow**, or use the scheduled batches.
- Inspect the per-lane report and cost artifacts. Draft research PRs must be source-checked; no automatic code promotion, merge, deployment, financial transaction, or release occurs.

Until a successful dispatch and review of real artifacts, workflow runtime and output quality are unverified.
