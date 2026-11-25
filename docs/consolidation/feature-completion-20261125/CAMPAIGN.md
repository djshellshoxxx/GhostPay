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

## Round 2 queue (from read-only triage at main `f18e8c0c`, 2026-11-25T05:13Z)

| ID | Feature | Donor (exact head) | Evidence | Remaining |
|---|---|---|---|---|
| FC-04 | Historical chain-adapter date/retry and TRON completeness safeguards | #271 `integration/ghostpay-adapter-qualification-20261119` `429a4de8` (contains #250 `22af2074`, which is superseded) | `ts-test (web)` green at head; only failure is `beta acceptance` browser install (apt timeout, infrastructure) | Conflict in `apps/web/src/features/tron/chain.hardening.test.ts`; rerun hosted gates |
| FC-05 | Bitcoin spent-output detection and private-scan consent (Spec 12, full profile) | #244 `chatgpt/btc-spent-private-scan-20261118` `981cc2f4` (contains #219 `9617e857`); #254 `2b4b1e91` diverges | #219 and #244 all CI green; #244 conflicts only in ACTIVE_WORK | Integrate #244; reconcile #254's divergent spentness evidence; catalog string |
| FC-06 | Private seller scan checkpoints and durable discovery | #248 `chatgpt/ghostpay-private-scan-completion-20261119` `18b36745` | Red: 8 lint errors, e2e strict-mode duplicate address locator | Catalog conflicts, lint, e2e locator; medium |

Coordinator refinement (06:15Z):
- FC-04 is smaller than a feature: current main already carries #271's `rpc.ts` egress hardening
  (`credentials: 'omit'`, `no-referrer`, `no-store`); the unique remainder is regression tests (`quote.test.ts`
  absurd `price.decimals`, `chain.hardening.test.ts` additions). Re-scoped as a low-priority test-recovery bundle
  together with RCPT-L1/L2.
- FC-06 (#248) **deferred**: `apps/web/src/views/Scan.tsx` and `apps/web/src/lib/scanClient.ts` are changed by 11
  active PRs updated 2026-11-24/25, including P1-LATE #635 and P0-KEYS #622. Integrating 2.6k lines there now would
  collide with active owners. Revisit after #635/#622 land.
- FC-05 (#244, +1.3k lines, `packages/btc-silent-payments` has no active overlap) is the round-2 lead.
- `automation/20261124T1637Z/bug/hostile-text-fresh-payer` (no PR) belongs to the seller-keystore recovery stack
  that #641 is consolidating; left to that owner.
- Round-2 work reuses finished round-1 workers and their installed worktrees (disk: 16 GB free after three installs).

Coordinator analysis while round 1 waits (07:40Z, git-only, against main `5dc05bd6`):
- **FC-05 split.** #244 (`981cc2f4`) and #254 (`2b4b1e91`) are two independent continuations of #219
  (`9617e857`) from the same base `58d89b39`. Merging them together conflicts in 18 Bitcoin source files
  (`BtcView.tsx`, `scan.ts`, `scanWorker*`, `headers.ts`, `esplora.ts`, `btc-silent-payments/src/scan/{scanner,state}.ts`, …),
  i.e. two implementations of the same spentness logic. Plan: **FC-05a** = #244 alone (merges onto main with only an
  ACTIVE_WORK conflict; all CI green at its head); **FC-05b** = port #254's distinct hardening onto FC-05a under an
  Opus implementer and separate review (`78e50547` canonical spends vs duplicate/replayed evidence, `ba588c82`
  re-validate spentness before retained sweep actions, `524215eb` bound distinct scan outputs, `4281fce1` restrict
  matched-transaction proofs to authorized light scans). #254 also touches the contended `scanClient.ts`; port only
  the Bitcoin-scoped parts. Main's later BTC fix `0860e8fb` (sweep-preview destination network validation) must survive.
- **Closed #164 (`d6f6617e`) residual: superseded, nothing to recover.** Hunk review: main replaced its bash
  `check-tx-origin.sh` with `check-tx-origin.mjs` (`7abb3123`, after `be7e9671`); main's `quote.ts` is a strict superset
  (sequencer uptime/grace, reference-feed deviation, USD peg, expected decimals, `price.decimals` 0..30 in
  `fiatToTokenAmount`); `scan-bundle.mjs` has newer main commits (`81614e56`); the remaining pool-circuits/pool-relayer
  hunks are net deletions against main in the experimental pool PoC (out of beta scope). Branch preserved unchanged.

Deferred from triage: closed #164 tip `d6f6617e` residual (quote/rpc retry, `check-tx-origin` gate, pool files) needs
hunk-level review against later main commits `be7e9671`/`bec1410f` first. RCPT-L1/L2 and QA-I1 are unclaimed,
low/info, and remain filler work.

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
- 2026-11-25T05:05Z — another session (lock generation 21, `claude-gracious-meitner-0yy6do`, lock head `e6865193`)
  merged #638 POS terminal → main `f18e8c0c`. Round-1 branches start from `c8e131c1` and must merge `f18e8c0c`
  (or later) and requalify before integration. Read-only round-2 triage (Haiku) launched for #250/#271/#164,
  #248, BTC Spec 12 (#244/#254/#219), RCPT-L1/L2 and QA-I1.
- 2026-11-25T06:05Z — round-1 merges exist on main `f18e8c0c`: FC-01 `225383a9`, FC-02 `5613341b`,
  FC-03 `166a9b11` (local refs; workers asked to push and open draft PRs so hosted CI overlaps the serialized
  local queue). Independent read-only Opus reviews launched against those exact merge commits.
- 2026-11-25T06:25Z — draft PRs: FC-01 #650, FC-02 #649, FC-03 #648.
  - FC-03 review of `166a9b11`: APPROVE-WITH-NITS (no blocking defect; byte-identity with web Solana/TRON code,
    independent vectors, fail-closed mainnet/MEMO_NOT_BOUND verified). Requested before merge: library string
    overload must refuse mainnet `st:sol:`; `solana-stealth` encoder unknown-cluster guard (pre-existing, encodes
    mainnet); stale `gpsol:` docs; `@security` warning on memo-less TRON exports; registry formatting.
  - FC-02 review of `5613341b`: APPROVE-WITH-NITS (consent-only balance reads and pre-handoff review re-check
    verified by tracing). Requested before merge: misleading default "RPC required" text and silent no-RPC Read;
    misleading "Vault check cancelled" on review change, Read disabled while busy; three user docs; two race tests.
  - FC-01 review of `225383a9`: APPROVE-WITH-NITS (file import reaches only the existing openFragment → review →
    expiry → #500 `assertNoPaymentAttempt` path; no wallet/RPC from file selection; exact union merge; strict codec).
    Requested before merge: file-input invalidation must not reset the QR camera importer on hide/lock (regression
    vs main); journal-absence assertion moved from sessionStorage to the #500 localStorage journal; Arabic clear-label
    guard retargeted and one-sentence summary key; stale user doc; small a11y/alert nits.
- 2026-11-25T07:20Z — hosted CI on original heads: FC-03 #648 `f79aa67c` 39/39 green; FC-02 #649 `5613341b`
  39/39 green; FC-01 #650 `225383a9` all green except `ts-test (web)`: 3331/3331 tests passed but one unhandled
  rejection (`window is not defined` at `WalletAttempts.tsx:104` from `WalletAttempts.status.test.tsx`, late
  `migrateBrowserAttempts` rejection after jsdom teardown; run 45557873026). Main CI at `f18e8c0c` is green and no
  other recent failed run shows it; treated as a likely pre-existing #500 race, under investigation by fc01.
  Review-fix commits: FC-03 `2a6b33b7`, FC-01 `fd5ba475` + `041ed17c`; follow-up reviews requested.
  Main moved to `5dc05bd6` (#640 help pages, merged by another session); all three branches merge cleanly and the
  workers are merging it so CI qualifies the actual integration candidates.
- 2026-11-25T07:30Z — follow-up reviews: FC-03 fix delta `f79aa67c..2a6b33b7` **APPROVE** (all six items verified;
  merge `bd70cd2f` patch-id identical to pre-merge delta). FC-01 fix delta `225383a9..041ed17c` **APPROVE**
  (D1–D4, N1/N2/N4/N6 verified; `WalletAttempts.status.test.tsx` gains `afterEach(cleanup)`, component unchanged;
  merge `ace2f873` clean union with main). One final batched push each (FC-03: retired-derivation doc, error-text
  accuracy, object-overload mainnet refusal, claim paths; FC-01: post-event re-query in the two D1 tests, handoff
  accuracy, three docs) before integration, to avoid repeated 40-minute CI cycles.
