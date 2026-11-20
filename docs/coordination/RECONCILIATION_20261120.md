# GhostPay coordination reconciliation — 2026-11-20

This is an additive snapshot and operational index, **not** a replacement for `docs/ai/ACTIVE_WORK.md`, the integration lock, existing branch census, or the task's source-pinned handoff. Do not mark work complete from this document alone.

## Existing controls (verified on main)
- `AGENTS.md` and `docs/ai/WORKFLOW.md`: mandatory preflight, scoped ownership, exact-head verification and handoff.
- `docs/ai/ACTIVE_WORK.md`: worker claims and owned paths. Historical claims can be stale; reconcile them against open PRs before reassigning.
- `.github/workflows/ci.yml`: CI for PRs, main pushes and manual dispatch; default `contents: read`, parallel typecheck/lint/build/test and additional gates. **Do not add duplicate CI jobs without identifying a gap.**
- `docs/ai/HANDOFF.md`: handoff template.

## Sampled open PR queue (not exhaustive)
| PR | Head | Dependency | Qualification | Next action |
| --- | --- | --- | --- | --- |
| [#342](https://github.com/djshellshoxxx/GhostPay/pull/342) | `06fd87c3e90000118ffa94048529db36f0a67d41` | stacked on #340 | Draft; not qualified | Exact-head CI and review of corrected TRON test callers |
| [#341](https://github.com/djshellshoxxx/GhostPay/pull/341) | `78137622011528a646ae94155ee4acf7f72e1e2a` | stacked on #307 | Draft; not qualified | Browser/test verification and independent review |
| [#340](https://github.com/djshellshoxxx/GhostPay/pull/340) | `f9344a16fdefd1151189d8fd613ef3d1ca6a75c4` | parent of #342 | Draft; known test caller issue | Review child fix and qualify full combined chain |
| [#339](https://github.com/djshellshoxxx/GhostPay/pull/339) | `d03600ca87c7156d4acd1ff78bef6e92c20d9ea4` | related hygiene work | Draft; not qualified | Typecheck/lint/test and source overlap review |

Do not infer merge readiness from GitHub's `mergeable` boolean: it does not establish security or test qualification.

## Canonical task record
Use the existing issue or finding ID where available. Required fields:
`task_id`, `scope`, `owner`, `claimed_paths`, `base_sha`, `head_sha`, `branch`, `pr`, `dependencies`, `acceptance_criteria`, `evidence_links`, `test_outcomes`, `status`, `next_action`, `last_reconciled_utc`.

Statuses: `proposed`, `claimed`, `in_progress`, `blocked`, `verification_pending`, `qualified`, `integrated`, `superseded`. `qualified` requires exact-head checks and review. `integrated` requires evidence on main. `superseded` requires patch/file equivalence evidence.

## Worker preflight
1. Fetch latest main SHA and inspect existing issue/PR, `AGENTS.md`, `docs/ai/WORKFLOW.md`, active claims and handoffs.
2. Enumerate relevant branch/PR heads and compare changed paths and patches. Squash and cherry-pick require patch-equivalence analysis, not only commit ancestry.
3. Check integration lock and overlapping file ownership. If owned, continue the owner's branch or choose another unclaimed task.
4. Record claim with exact SHA and acceptance criteria before editing.
5. Implement test-first where applicable. Record *executed* commands, outcomes and skipped checks.
6. Open draft PR, recheck heads and overlaps, request independent review.
7. Do not merge, release, deploy, delete branches, force-push, dispatch workflows or waive security checks without explicit approval.

## High-priority verification categories
- Invoice expiry versus funds actually received; timeout/unknown broadcast outcome; duplicate payout/refund prevention.
- Key export, independent restore and sweep; late payments and chain-aware reconciliation.
- Seller-session ownership and stuck backup controls; signed invoice files; memo/browser tests; print isolation.
- Privacy version 1/1.1, Tor/HTTPS and external network boundaries.
- External chain, hardware, real-funds, production and browser checks remain **pending** until evidence is attached.

## Next action
Run an exhaustive, paginated branch and PR inventory against current main, including existing census documents. Produce a deduplicated candidate list with changed files, patch equivalence, owner and qualification. The four PRs above are only a sample; do not treat them as the complete backlog.
