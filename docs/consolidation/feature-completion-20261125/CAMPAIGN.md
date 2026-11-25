# Feature-completion campaign — 2026-11-25 UTC

Coordinator: Claude Code session `feature-completion` (worktree `.claude/worktrees/feature-completion`,
branch `claude/feature-completion-20261125`). This file is the durable campaign checkpoint. Worker handoffs live
next to it as `FC-NN-*.md`. Nothing here asserts a merge unless a main SHA is recorded.

## Baseline

- `origin/main` = `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063` (PR #500 merge, 2026-11-24T14:34Z).
- Integration lock `automation/ghostpay-integration-lock` = `4fe06565`: **released**, generation 20,
  owner `claude-keen-volta-8ctx9x`. Next acquisition is generation 21 by non-force push.
- Branch protection: none observed by prior coordinators; required CI still gates every merge here.
- Host limits: 3.9 GB RAM (≈0.2 GB free at start, other sessions active), 4 logical CPUs, no `forge`/`anvil`.
  Heavy commands are serialized machine-wide through a scratchpad mutex (`heavy-run.mjs`). Anvil/contract and
  full browser suites are qualified by hosted CI only; local runs are focused.

## Inventory (mechanical, this campaign)

`BRANCH_INVENTORY.tsv`: all 723 real `origin/*` branches vs `c8e131c1`, 634 PRs mapped by head ref.

| Class | Count | Meaning |
|---|---|---|
| A ancestor | 371 | Head is an ancestor of main |
| B no non-doc diff | 99 | Every changed non-documentation path equals main |
| H open-PR owner | 192 | Unique source with an open PR (treated as owned) |
| J residual (no/closed/merged PR) | 60 | Source differs from main; needs semantic review (most are older blobs main has since replaced) |
| J unrelated history | 1 | `gh-pages` |

The semantic dispositions of `docs/consolidation/branch-comparison-20261124-68c82b9/HISTORICAL_DISPOSITIONS.json`
(212 rows at `70618800`) were reused rather than repeated; this campaign re-checked only candidates it selects.

## Active owners respected (not modified by this campaign)

Confidential amounts #642 (`nodata/eloquent-shannon-gfv6t9`, locked worktree), metadata hardening #643,
privacy profiles #644, P1-LATE #635 (`claude/p1-late-reconciliation`, main checkout), P0-KEYS #622/#621
(`claude/nifty-bohr-5ra2ap*`, also owns the #371 F04/F05/F10 dormant base), merchant dashboard #636, POS terminal
#638, backup recovery #641, docs/help #640, housekeeping #639, consolidation workers #614/#616/#617, Codex #286
privacy-UX stacks (#549/#553/#569/#570/#580/#598/#612), Codex #287 stacks (#584/#585/#586/#589/#600/#606/#609),
REV-L2 checkout child (`codex/checkout-rev-l2-durable-preflight`, #595), offline completion #591/#604,
automation bug-fix drafts updated 2026-11-24/25, dependabot #87/#492/#493.

## Feature families selected (round 1)

Selection rule: a complete or nearly complete implementation whose PR has been idle since before 2026-11-23,
is green at its own head, merges with current main without source conflicts beyond additive catalogs, and has no
newer active owner. Donor branches are merged (not rebased) so their commits and SHAs stay in history.

| ID | Feature | Donor (exact head) | Idle since | Est. % before | Assigned | Status |
|---|---|---|---|---|---|---|
| FC-01 | F03 signed invoice request-file interchange | #310 `future/f03-private-payment-links` `dad6bc74` | 2026-11-20 | 95 (all 37 hosted checks green on old base) | worker fc01 | Assigned |
| FC-02 | Sweep balance-refresh consent and quote/signing lifecycle | #534 `codex/ghostpay-sweep-balance-integration-20261123` `5c93c3b1` (← #252 `40856224`, #272 commits) | 2026-11-23 | 90 (green on old base) | worker fc02 | Assigned |
| FC-03 | Solana/TRON meta-address and memo interoperability alignment | #376 `recover/ghostpay-chain-interop-20261121-5ceb` `f7171572` | 2026-11-21 | 90 (green on old base) | worker fc03 | Assigned |

## Candidates recorded but not selected yet

| Candidate | Why not now |
|---|---|
| #250/#271 historical adapter date/retry/TRON safeguards; closed #164 `claude/lucid-meitner-apalzc` (14 paths) | Red at own heads (#250 web tests/typecheck, #271 beta acceptance); round 2 |
| #244/#254/#219 Bitcoin spentness + private scan consent (Spec 12) | Full profile only, large; round 2+ |
| #248 private seller scan checkpoints | Red (lint, e2e full/lean) |
| #319 backup unlock cancellation | Overlaps active #641 backup consolidation |
| #592 spec-03 fiat feeds | Red (relayer tests) and updated 2026-11-24 |
| QA-I1 journal-mirror reset, RCPT-L1/L2, JRNL-L1 | Follow-ups of the #500/#452 owner session; new implementation, round 2 if unclaimed |
| #308/#320/#363 static Tor hosting | Hosting/deployment scope, not Pages-beta feature work |
| `nodata/practical-johnson-e0fbpm` refund lifecycle | Owner decision P1-REFUND (no refund path on current contracts) |
| F02/F11/F13 future modules #550/#552/#566 | Created 2026-11-24; treated as active |

## Integration protocol (per feature, serialized)

1. Refresh `origin/main` and the feature branch head; confirm the donor head did not move.
2. Required hosted CI green at the exact feature-branch head; independent review approval recorded.
3. Acquire `automation/ghostpay-integration-lock` (generation +1, non-force push, 30-minute expiry).
4. If main moved, merge main into the feature branch, requalify, wait for CI.
5. Merge the PR with a merge commit (no squash), release the lock, record main SHA, run post-merge checks.

## Progress log

- 2026-11-25T04:55Z — inventory complete; round 1 assigned (FC-01..03).
