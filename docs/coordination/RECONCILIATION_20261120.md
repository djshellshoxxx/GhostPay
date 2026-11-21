# GhostPay coordination reconciliation — 2026-11-20

This is an additive snapshot and operational index, **not** a replacement for `docs/ai/ACTIVE_WORK.md`, the integration lock, existing branch census, or the task's source-pinned handoff. Do not mark work complete from this document alone.

## Complete reconciliation now available

The follow-through to [#343](https://github.com/djshellshoxxx/GhostPay/pull/343) covers **423 branch refs and 123 open PRs**, frozen at **2026-11-20 18:52:23 America/Los_Angeles / 2026-11-21 02:52:23 UTC**, against main `aec179910c39081d820396409ff3139ff2264132`. All original 420 heads remained unchanged; the final cutoff also includes #353/#354/#355. Later additions are outside this snapshot.

Read the [complete report](claims-20261120/README.md), [423-ref branch index](claims-20261120/branch-index.md), [123-PR queue](claims-20261120/pr-queue.md), [claim ledger](claims-20261120/claim-ledger.json) and [validation](claims-20261120/validation.md). The complete evidence preserves full changed paths, current and advertised PR bases, exact content/patch comparisons and existing owner/scope text. This supplements the controls below; it is not a new ownership registry.

## Existing controls (verified on main)

- `AGENTS.md` and `docs/ai/WORKFLOW.md`: mandatory preflight, scoped ownership, exact-head verification and handoff.
- `docs/ai/ACTIVE_WORK.md`: worker claims and owned paths. Historical claims can be stale; reconcile them against open PRs before reassigning.
- `.github/workflows/ci.yml`: CI for PRs, main pushes and manual dispatch; default `contents: read`, parallel typecheck/lint/build/test and additional gates. **Do not add duplicate CI jobs without identifying a gap.**
- `docs/ai/HANDOFF.md`: handoff template.

## Original #343 sample (preserved as history)

These four rows record the original sample and its actions. They are retained for provenance; current exact-head CI and dependency observations are in the complete queue above. The sample's original base was `bfebea0acf213a113d2740366fd592042661ca67`, before the frozen main advance.

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

Statuses: `proposed`, `claimed`, `in_progress`, `blocked`, `verification_pending`, `qualified`, `integrated`, `superseded`. `qualified` requires exact-head checks and review. `integrated` requires evidence on main. `superseded` requires source/patch evidence and owner review of the retained acceptance scope. Patch IDs or ancestry alone do not prove current behavior or authorize dropping unique tests.

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

## Census fulfilled; specific remaining actions

The paginated inventory and full-path accounting are complete for the frozen cutoff. All 423 registries were checked: 255 present and 168 absent, with 507 preserved record identities / 506 unique section texts. These are historical and current text variants, not counts of independent tasks. The 78 mechanically unresolved branches have separate [human-triage dispositions](claims-20261120/residual-dispositions.json).

- Preserve the late #331 idle source through #333/#335/#344: it merged into the old #325 source branch after #325 had already merged into #307, so it remains absent from frozen main/#307.
- Reconcile the existing Spec18 recovery implementation and #346 interoperability work with current session/idle source; the six named modules are absent from main/#307 but preserved on branches.
- Treat F03 runtime as represented in #307, retain F04/F05/F10 as distinct dormant milestones, and reconcile #314/#319/#333 backup overlap plus #354/#355 focus policy while preserving complementary tests.
- Resolve six advanced-parent children, four already-integrated nonmain base refs and concrete product-path overlap through current owners. The 5,025 shared-path PR pairs include only 746 with a non-document overlap; 4,279 overlap solely in documentation.
- Qualify the chosen exact composition: current observations are 61 failure, 13 pending, 44 success with skips/neutral and five observed success, with zero formal GitHub approvals. No open PR is declared qualified here. Recheck live heads and the integration lock before operational action.

The [complete report](claims-20261120/README.md) retains source pins, actual merge destinations, historical ledger corrections, qualification limits and reproduction instructions. No ownership transfer, source retirement or product qualification is inferred from this evidence.
