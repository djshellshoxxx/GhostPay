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
- 2026-11-25T08:00Z — main moved to `60824005` (#641 seller-keystore backup, other session). All three FC branches
  merge with it (only the additive ACTIVE_WORK registry conflicts); workers merge it in their final push. Not using
  #540/#573/#629 (other session closing them after #641). Integration rule given hourly main movement: merge a
  feature only when its CI-green head already contains the current `origin/main`; otherwise re-merge main and
  requalify (no lock held during CI).
- 2026-11-25T08:10Z — final candidates pushed, each containing main `60824005`: FC-01 #650 `aae8d592`
  (fix `5543c2a3`), FC-02 #649 `ef101fd5` (fix `096b338d`), FC-03 #648 `a13ab24d` (fix `11cdee32`). Hosted CI
  restarted on all three; final follow-up reviews requested on the exact fix commits.
- 2026-11-25T08:13Z — final reviews: FC-01 `aae8d592` **APPROVE** (re-queried D1 tests assert node identity;
  5543c2a3 has no production code; main merge exact union, F03 e2e selectors intact). FC-03 `a13ab24d` **APPROVE**
  (ADR-0017 doc formulas, error-code wording, object-overload mainnet refusal with zero RNG draws, claim paths;
  FC-03 patch-id unchanged by the main merge). Non-blocking follow-up recorded: `chain-solana` `CHAIN_DISABLED`
  text ("devnet, testnet and localnet only", `errors.ts:42`) is right for derivation but also thrown by
  `createSolanaAdapter`, which enables devnet/testnet only (`adapter.ts:22,72`); not shown by CLI or web. Queue for
  the small follow-up bundle (one-line neutral wording + `stealth.test.ts:211`). Also optional: `solana-impl.md:31`
  old `K` naming.
- 2026-11-25T08:20Z — FC-02 follow-up at `ef101fd5` **APPROVE** (L1/L2/L3, i18n classification, out-of-order read
  test, post-handoff journal retention; both safety properties re-verified line by line). One wording claim sent back
  before merge: `sweep.reviewChanged` "nothing was sent" is false for a direct sweep cancelled mid-helper (nonce/fee
  reads and a dry run naming the old destination already reached the RPC); corrected text must say no transaction or
  order was sent. FC-02 is last in the integration order, so the extra CI cycle does not delay FC-03/FC-01.
- 2026-11-25T08:30Z — final worker reports received. Final heads: FC-01 #650 `aae8d592`, FC-02 #649 `e88377a4`
  (wording fix `e88377a4` checked by coordinator: "No transaction or order was sent", doc names the nonce/fee/dry-run
  RPC reads), FC-03 #648 `a13ab24d`. Local evidence caveats recorded by workers: FC-03 `build:libs` stopped at
  ~24/69 under load and local chain-solana/solana-stealth runs fail only the CRLF-sensitive `adapter-types.test.ts`
  (Windows `core.autocrlf` checkout; donor recorded 111/111 on Linux); FC-01 local scrypt/passphrase tests timed
  out under load and passed with `--testTimeout=120000`; FC-02 one load-dependent lifecycle test passed in
  isolation. Hosted CI on Linux is the qualifying gate for all three. Stale worker CI-watch/poll loops (12) were
  stopped by the coordinator. FC-05a (#244) assigned to worker fc03 in its existing worktree.
- 2026-11-25T08:40Z — FC-02 #649 `e88377a4`: hosted `Pages artifact on anvil (browser)` failed
  (run 45574817966, job 139070143297) at `e2e/pages-devnet.spec.ts:741` (`prepareDirectSweep` → Sign disabled).
  Cause: semantic interaction with #641 (main `60824005`, commit `6a6886f1`), which added a second sweep after
  re-navigating to Sweep without the explicit Read click FC-02's consent model requires; every other sweep step has
  it (522/552/638/724). Not a product defect. Worker asked for the one-line test adaptation (insert the Read click
  before line 741; no assertion removed). This is exactly the kind of cross-feature regression the "requalify after
  merging main" rule exists to catch.
- 2026-11-25T08:58Z — FC-02 fix pushed: #649 head `790de53e` (+2 lines in `pages-devnet.spec.ts`, comment + Read
  click; handoff note); main still `60824005`. Host memory critical (≈0.07–0.11 GB free physical): Claude Code stopped
  both coordinator CI watchers; CI now checked by one-off reads only (08:55Z: #648 17/42 ok, #650 20/41 ok, #649 just
  started; no failures). FC-05a: merge `dc435811` (local; #244 onto `60824005`, ACTIVE_WORK union, 39 non-doc paths all
  BTC/catalog/DEVIATIONS/e2e), but `build:libs` crashed twice in `tsc` (access violation 3221225477) under memory
  pressure. Decision: no further local heavy runs for FC-05a; push with an explicit "local validation not run"
  record and qualify on hosted CI plus an independent read-only review.
- 2026-11-25T09:05Z — FC-05a pushed as draft **#656** `8e7b1915` (merge `dc435811` + handoff); independent read-only
  review requested.
- 2026-11-25T09:10Z — **Owner stop-work directive** landed on main (`5cced8ef`, AGENTS.md; `595a184b`, catalog):
  F01 GhostTips, F09 GhostPOS, F13 fiat conversion ARCHIVED; F08 GhostID, F11 GhostTeams, F12 GhostBridge,
  F14 multi-chain routing DEFERRED; none of the seven may be implemented, completed, merged or counted. Campaign
  check: FC-02 (Sweep consent, core), FC-03 (corrections to the pre-existing Solana/TRON PoC libraries/CLI from
  PR #14, 2026-10-22; no routing, bridging or chain selection, so not F14), FC-05a (Spec 12 in `docs/specs`, not a
  future-catalog module) are unaffected. FC-01 is the F03 future-catalog slice ("FUTURE ONLY / NOT APPROVED"; the
  catalog requires an explicit owner instruction before activation) and was paused.
- 2026-11-25T09:14Z — **Owner decision:** "this is a primary feature of ghostpay. this is staying in." FC-01 (F03 signed
  invoice request file) is approved to go live; recorded on PR #650 (comment 7158077523). Scope: the request-file slice
  only, not the rest of the broader F03 proposal.
- 2026-11-25T09:16Z — FC-05a #656 `8e7b1915` independent review **APPROVE-WITH-NITS** (read-only). Verified by reading:
  spends derive only from header/Merkle-bound block data; `local` spent status requires full coverage to the checked
  tip, otherwise `unknown` and unsweepable; reorg reconcile clears marks above the common ancestor; no
  outspend/hex/merkle-proof request without explicit consent (enforced in four places), revocation aborts and wipes;
  main's `0860e8fb`/`498a72ed`/`3a4870e6` byte-identical; encrypted scan state unchanged in envelope, validation
  stricter; #244 is safe without #254. Non-blocking follow-ups queued: **FC-05a-T** (text accuracy: docs and the
  two security-classified strings `btc.server.hint`, `btc.oracle.resultsNote` still describe the old automatic
  outspend query — conservative overstatement of disclosure) and, for **FC-05b**, a session "pending spend" guard
  (default local mode cannot see mempool spends, so a rescan right after a broadcast shows the swept inputs as
  sweepable; a second sweep conflicts with the user's own transaction; disclosed by `btc.scan.spentStatus.local`).
- 2026-11-25T09:22Z — hosted runners congested (#649 static at 14/41 for ~25 min). To avoid adding ~40 jobs per PR to
  the shared queue, round-2 small follow-ups are prepared as local commits and held unpushed until the four ready PRs
  merge: fc01 → FC-05a-T (stacked on #656) and FC-03-T (stacked on #648, neutral `CHAIN_DISABLED` text);
  fc02 → FC-04 (recover #271's still-missing regression tests; RCPT-L1/L2 in `packages/ux-receipts`).
- 2026-11-25T09:28Z — integration lock **held** by `claude-local-p1-late-reconciliation` (generation 24, lock head
  `0a0f8f8a`, acquired 08:37Z, heartbeat 09:19Z, expires 10:04Z), presumably for P1-LATE #635 (head `205f8fd7`).
  The coordinator will not take over an active, heartbeating lock. `git merge-tree` of #635's head with each FC head
  (`a13ab24d`, `aae8d592`, `790de53e`, `8e7b1915`) conflicts only in the additive `docs/ai/ACTIVE_WORK.md`; when #635
  lands, each FC branch re-merges main (union) and requalifies on hosted CI before its own merge. Integration script
  (`integrate.sh` in the coordinator scratchpad) gates on exact head, ≥30 checks with none pending/failed, and
  main ancestry or docs-only non-overlapping drift, then acquires the lock, merges with `--match-head-commit`,
  verifies the merge commit's parents and releases the lock.
- 2026-11-25T09:35Z — round-2 follow-ups prepared locally (unpushed; review requested):
  - **FC-04** `claude/fc04-hardening-tests-20261125` `a52ecc89` on main `595a184b`: recovered #271's missing
    `quote.test.ts` absurd-decimals case (`Recovered-from: 429a4de8`; #271's TRON hardening cases already on main);
    RCPT-L1 proxy test now reaches the guarded reads; RCPT-L2 `verify.ts` snapshots `status`/`facts`/fields once
    (read-count and changing-getter tests failed 2/11 on the old code, then pass). `ux-receipts` 164/164, coverage
    99.75/98.29/98.07/99.68; tsc/eslint clean; chain-adapters `quote.test.ts` 23/23.
  - **FC-03-T** `claude/fc03-t-chain-text-20261125` `a2b14ca8` on `a13ab24d`: neutral `CHAIN_DISABLED` text; doc
    `K`→`Z` and ADR-0017 pointer. chain-solana `stealth.test.ts` 19/19, `adapter.test.ts` 5/5.
  - **FC-05a-T** `claude/fc05a-t-btc-text-20261125` `cf3e0ff6` on `8e7b1915`: docs, egress inventory, threat model,
    qualification ledger (BTC-3/PRIVACY-E2E-01 "addressed by FC-05a, pending hosted CI"), `btc.server.hint`,
    `btc.oracle.resultsNote`. `network-egress-inventory.test.mjs` exit 0; `securityKeys.test.ts` 12/12;
    `catalog.test.ts` 4/4. Typecheck/lint/full suites not run.
- 2026-11-25T09:40Z — FC-01 #650 `aae8d592` hosted `ts-test (web)` failed 3345/3346: `requestFileInterop.test.ts:39`
  passphrase variant timed out at the default 60 s (job 139076197195). It passed in 45.1 s in the earlier run
  (job 139018307768): a scrypt-bound test with ~25% margin on a congested runner. Fix requested: per-test
  `180_000` timeout matching the repository convention for scrypt-heavy tests (BackupPanel, TagArchive, keystore);
  no assertion change.
- 2026-11-25T09:38Z — FC-01 timeout fix pushed: #650 head `3851f02b` (`180_000` on the interop `it.each`, comment;
  no assertion change; verified by coordinator). Reviews: FC-03-T `a2b14ca8` **APPROVE**; FC-05a-T `cf3e0ff6`
  **APPROVE-WITH-NITS** (all changed statements match code: outspend only via provider check, hex/merkle-proof only in
  consented light mode, sweep only POSTs /tx). Nits being folded in locally before push: inventory `automatic`
  convention, stale sweep-preflight flow and missing `inclusion.ts` path, transient "pending CI" text, pre-existing
  `/fee-estimates` overstatement, BTC-2 partial status, R13 matrix status, `specs/12:20` consent qualifier.
- 2026-11-25T09:38Z — FC-04 review of `a52ecc89` **APPROVE** (quote case exercises main's `price.decimals` bound;
  every other #271 intent already on main, several in newer form; RCPT-L2 decision tree identical to main and strictly
  safer with getters). Tightening commit `69831eac` (local): RCPT-L1 asserts `status` was among the trapped reads;
  RCPT-L2 asserts the exact 7 accessors once each and `chain.status === 'confirmed'`; quote edges 31/1.5/NaN;
  RCPT-L1/L2 marked "fixed on FC-04 branch, pending integration" in SECURITY_FINDINGS/REMAINING_WORK/
  FEATURE_INTEGRATION_LOG. Its validation was skipped twice by the worker's RAM guard (236/275 MB free); retry before
  push (previous head passed: ux-receipts 164/164 with coverage, tsc/eslint clean, quote 23/23).
  FC-05a-T nit commit `f3800a0e` (local; inventory test 4/4); a factual check of two fee-estimate edits
  (`QUALIFICATION-2026-11.md:46`, BTC-4) across CLI/packages is pending with the reviewer.
- 2026-11-25T09:42Z — FC-05a-T fee-estimate fact check **APPROVE** (no production path in apps/, packages/ incl. CLI,
  btc-*, chain-*, or scripts/ calls an Esplora fee-estimates endpoint; `EsploraClient.feeRate` has only test callers;
  the sweep fee rate is user-entered). Final local head `22c3cb1d`: BTC-4 rewritten "Not applicable on current source",
  line 46 guard references refreshed (coordinator spot-checked `sweep.ts:35,93,94,159`, `spend.ts:79,86,222,312`),
  browser-network-isolation rows aligned with the JSON; inventory test 4/4. Ordering constraint: FC-05a-T states R13 is
  implemented by FC-05a, so it must merge only after #656.
- 2026-11-25T09:52Z — **Owner clarification** on main `c365dc41` (AGENTS.md, docs-only): F02 GhostStore and F04 merchant
  dashboard are now also deferred and disabled for beta/v1.0 (with F08/F11/F12/F14; F01/F09/F13 archived). Shared-core
  privacy mechanisms must be retained, explicitly including private links/QR, consent, RPC provider disclosure, sweep
  linkability warnings, local filtering and truthful network disclosures; no chain-scope expansion and no activation of
  experimental/unqualified capabilities. Campaign check: FC-01 = private links/QR (shared core, owner-approved);
  FC-02 = consent/RPC disclosure/sweep linkability (shared core); FC-03 = corrections to existing Solana/TRON PoC
  libraries with added mainnet refusals (no scope expansion, nothing activated); FC-05a = reduces disclosure of the
  existing full-profile Bitcoin feature (automatic provider query → local detection + opt-in consent). None touches
  F02/F04. All remain eligible. Docs-only drift (`AGENTS.md`), no overlap with FC branches.
- 2026-11-25T10:05Z — P1-LATE session (ghostpay-58) confirmed it holds lock gen 24 for #635, expects release about
  10:15–10:30Z after one `ts-test (rest-2)` rerun (#641 keystore fuzz flake, fixed by #660), and is renewing the lock.
  Follow-up PRs opened: **#661** FC-03-T (`a2b14ca8`, stacked on #648), **#662** FC-05a-T (`22c3cb1d`, stacked on #656;
  must merge after #656), **#663** FC-04 (`d0510887`, base main; local: ux-receipts 164/164 with coverage
  99.75/98.29/98.07/99.68, tsc/eslint clean, quote 23/23).
- **Integration plan change (CI economy).** After #635 lands, main changes in source paths and every round-1 PR would
  need a fresh re-merge and full CI run in turn (≈1 h each on congested runners). Instead: build ONE candidate branch
  from post-#635 main with sequential `--no-ff` merges, one merge commit per PR (FC-03 #648, FC-03-T #661, FC-01 #650,
  FC-02 #649, FC-05a #656, FC-05a-T #662, FC-04 #663), qualify that exact head on hosted CI (draft PR, do not merge),
  hold the integration lock with heartbeats while it runs, then fast-forward `main` to the qualified SHA (non-force) and
  release. Main then equals the exact CI-qualified tree and each feature keeps its own traceable merge commit; the PRs
  show as merged. Dry run on main `c365dc41` (local, deleted afterwards): all seven inputs merged, ACTIVE_WORK union
  +243/−0, 259 other paths — 156 single-source paths byte-identical to their input, 0 mismatches, 0 unexplained; the
  only true cross-feature merges are the four locale catalogs and `securityKeys.ts` (FC-01/FC-02/FC-05a key additions,
  conflict-free); all other multi-input paths are parent + stacked follow-up pairs.
- 2026-11-25T10:08Z — owner asked whether a force merge was possible. Coordinator explained it would bypass the P1-LATE
  session's held lock (gen 24, renewed to 10:37Z) and unfinished exact-head CI. **Owner decision:** wait for the lock,
  then one combined candidate CI run (plan above). P1-LATE session asked to message `feature-completion-06` on release.
- 2026-11-25T10:27Z — P1-LATE released lock gen 24 (`9dc8e4ac`); main → `aaa71a11` (Merge PR #635). One minute later
  `claude-ghostpay-backup-60` acquired gen 25 (`3682e237`, expires 13:28Z) to merge #657 (mobile e2e/workflow/docs) and
  #660 (keystore flake fixes; `ux-vault/keystore-portable.ts`), ETA 1–2 h. Neither overlaps the candidate's paths. Not
  taken over; that session will message on release.
- 2026-11-25T10:40Z — combined candidate built on `aaa71a11`: `claude/fc-integration-20261125`, seven `--no-ff` merge
  commits + coordinator commit `d4bdd022` (drops FC-01's duplicate `afterEach(cleanup)` in
  `WalletAttempts.status.test.tsx`; #635 had already added it, so the file now equals main). Composition: ACTIVE_WORK
  union +242/−0; 156 single-source paths byte-identical; for files also changed by #635 (`Pay.tsx`, `CreateInvoice.tsx`,
  `core-journey.spec.ts`, `pages-devnet.spec.ts`) the feature's changed-line multiset is identical before and after #635.
  Qualification draft **#664** (do not merge) opened; CI started. Superseded individual runs on #661/#650/#662/#663
  cancelled to free shared runners (re-runnable). Individual exact-head results already complete: **#648 FC-03 40/40 +
  3 skipped**, **#649 FC-02 39/39 + 3 skipped**, **#656 FC-05a 40/40 + 3 skipped**, 0 failures.
- 2026-11-25T10:40Z — owner instruction: finish this task, wait 15 minutes, then start the W4 prompt
  (`%USERPROFILE%\GhostPay-coordination\TEAM.md` referenced; not present at 10:38Z).
- 2026-11-25T10:45Z — owner: "start W4 as a fresh agent". Launched agent `w4` (fresh context, own worktree) with the W4
  prompt verbatim (#580/#553 clipboard stack; #600/#585 privacy-minimal invoices; hand qualified PR to W1), plus context:
  TEAM.md absent at 10:38Z, #664 includes FC-01's `CreateInvoice.tsx` change, lock gen 25 held by
  `claude-ghostpay-backup-60`, host memory limits and the shared heavy-run mutex. The coordinator continues the round-1
  integration in parallel (lock wait + #664 CI).
- 2026-11-25T10:52Z — owner: pause coordinator work 03:00–03:20 PST (11:00–11:20Z) to free resources for other
  workers, then resume. Coordinator CI watcher stopped; resume timer set for 11:20Z. Hosted CI on #664 continues
  remotely. Agreed lock order with `ghostpay-15` (#647 kept separate): after gen 25 releases, whichever exact-head CI is
  green first goes first; if both, the coordinator first. Resume point: check #664 CI and lock gen 25; when released,
  merge new main into the candidate (merge, not rebase), requalify, acquire the lock, fast-forward main, release, verify.
- 2026-11-25T11:25Z — side work while waiting (owner: interleave side tasks with integration):
  - **FC-05b scoped** (git-only vs FC-05a `8e7b1915`). Of #254's four hardening commits, three are already in FC-05a
    in its own form: `78e50547` (scanner `reportedSpends` dedupe, first spend preserved, no re-confirmation at another
    height: scanner.ts:165/242-244, state.ts:89/108-111), `524215eb` (resume cap scan.ts:118, output-identity cap
    :180), `4281fce1` (worker/bridge proof gating). Their tests are to be ported as regression coverage. **Gap:**
    `ba588c82` — FC-05a's `inputsChecked`/`sweepable` (BtcView.tsx:227-245) read the render-closure `scan`, so a
    retained sign/broadcast handler can re-check against a stale scan after a rescan; port #254's `scanRef.current`
    guard test-first. Plus the session pending-spend guard (FC-05a reviewer L3). Brief ready; start after #656 lands.
  - **FC-06 (#248) re-check on `aaa71a11`:** now conflicts in `Scan.tsx` and `scanClient.ts` (the scan checkpoint path
    #635 just reworked: `9d7f191b`, `87f06fe2`, `df1b76f5`, `54b56c0c`) plus catalogs; overlaps FC-02's `scanPrivacy.ts`.
    `privateScanStore.ts` (365 lines) and `privateScanLifecycle.ts` are not on main. Class: substantial (semantic merge
    with P1-LATE checkpoint logic). Keep deferred; coordinate with the P1-LATE owner before assigning.
  - Integration-log entry pre-drafted (coordinator scratchpad) for the post-merge record.
- 2026-11-25T11:36Z — **candidate #664 `d4bdd022` qualified: 40/40 hosted checks success, 3 skipped, 0 failed**
  (combination of #648, #661, #650, #649, #656, #662, #663 on main `aaa71a11`). Lock gen 25 still held by
  `claude-ghostpay-backup-60` for #657/#660; not requested early (holder's turn). When they release, merge the new main
  into the candidate (#660 changes `ux-vault` source, so a confirming CI run is required), then acquire the lock and
  fast-forward. FC-05b assigned to worker fc03 (stacked on FC-05a-T), brief in coordinator scratchpad.
- 2026-11-25T12:10Z — `claude-ghostpay-backup-60` released gen 25 (`8d94940a`); main → `32ae3977` (#657 as `4c31dee5`,
  #660 as `32ae3977`). `ghostpay-15` (#647, 2 checks pending) yielded the turn. Main's 19-file change since `aaa71a11`
  overlaps the candidate only in `docs/ai/ACTIVE_WORK.md`; merged it into the candidate → **`7b47c3dd`** (parents
  `d4bdd022`, `32ae3977`); the merge's non-registry patch is patch-identical to main's own change (`8ecef952…`), registry
  +240/−0 vs main. Because #660 changes `ux-vault` source, a confirming CI pass is required: **lock gen 26 acquired**
  (`d8bf8be5`, base `32ae3977`, 45-minute lease with heartbeats every ~20 min by a background holder that also watches
  #664 CI). On green: fast-forward `main` to `7b47c3dd` (non-force), release, notify `ghostpay-15`.
- 2026-11-25T12:15Z — **FC-05b** draft **#669** `8ea606ff` (stacked on FC-05a-T `22c3cb1d`; retarget to main after #664
  lands). Commits `d40e301f` (current-scan guard, `Recovered-from: ba588c82`; session pending-spend guard),
  `8d7e608d` (scanner rejects conflicting `spentBy` for one outpoint in a block's spend list; ported #254 tests),
  `8ea606ff` (handoff). Red→green: pending-spend test; #254's "fee edit during advanced-header save"; a new
  "retained Sign after a later provider scan reports the input spent at an unchanged tip" (signSweep was called once
  before the fix); ported scanner duplicate-list test ("promise resolved instead of rejecting" before). #254's
  same-prefix retained Sign/Broadcast tests already passed on FC-05a (regression coverage). Local: btc-silent-payments
  typecheck/lint 0; tests 549/558 (9 environment: CRLF adapter-types ×7, bip32 vectors parse on this checkout,
  headerchain passed on rerun); web btc 267 passed/1 load flake (passed on rerun); coverage not captured locally.
  Independent fund-safety review requested.
- 2026-11-25T12:25Z — FC-05b #669 review **CHANGES-REQUIRED** limited to the pending-spend guard (current-scan guard
  and scanner conflict check APPROVED; no fund-loss finding; PR strictly safer than its base). Required: M1 reorg
  must not clear marks (the swept tx stays valid); M2 UI text must disclose memory-only scope (reload, leaving the view,
  auto-lock, wallet import). Adopted reviewer's safer design: release marks only on lock/wallet change (drop
  release-on-scan; L1 paged-resume early release). L2 allow identical rebroadcast of the same signed txid; L3 observable
  tests; nits: sign from `scanRef.current.found`, keep `===` tip check, no 0-height marks. Sent to worker fc03.
- 2026-11-25T12:30Z — owner: cooperate with the other workers to merge this work and push safely without overwriting
  anyone. Checked: every campaign branch (`claude/fc*`, `claude/feature-completion-20261125`, W4's
  `claude/w4-*`) is identical to its `origin` ref (nothing local-only); `worktree-agent-*` refs are base placeholders.
  Merge-queue status sent to every reachable GhostPay session (`ghostpay-backup-60`, `ghostpay-42`, `newghostpay-ae`;
  `ghostpay-58` and `ghostpay-15` no longer reachable — the lock branch history records every acquire/release for
  them): gen 26 held for #664 → then #647 (ghostpay-15) → others on request. Merges only via the lock with non-force
  pushes; no branch the coordinator does not own is touched.
- 2026-11-25T12:35Z — **shared main-merge queue** (agreed across sessions): #664 coordinator (gen 26 held) → #647
  ghostpay-15 → #670 newghostpay-ae (`packages/payment-uri/src/invoice-link.ts` fix) → ghostpay-backup-60 test-only
  follow-up to #647 → W3 privacy-boundary worker (from ghostpay-backup-60, starts ~04:58 PST) when qualified →
  coordinator follow-ups (FC-05b #669; W4 PRs via W1). Each holder messages the next with release commit + new main.
- 2026-11-25T12:36Z — owner: when all tasks are finished, work on unfinished privacy features. To avoid overlap with
  W3, W4 and newghostpay-ae, the Haiku triage agent is compiling AGENTS.md's shared-core privacy list vs main/open PRs/
  claims; the result will be shared with those workers before any new privacy assignment.
- Main drift rule refinement: `595a184b` (and `5cced8ef`) change only `AGENTS.md` and
  `docs/future/privacy-first/README.md`, which no FC branch touches. Docs-only main movement that touches no file of
  a candidate does not change the qualified source tree, so it does not by itself require re-running candidate CI;
  post-merge main CI covers the merged tree. Any source change on main still requires re-merge and requalification.
