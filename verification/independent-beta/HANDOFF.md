# W5 handoff — independent payment-state verifier

Status: milestones 1–3 delivered (payer and seller models, harness, independent audit, bounded stress runs). Coordination: this file, draft PR
[djshellshoxxx/GhostPay#665](https://github.com/djshellshoxxx/GhostPay/pull/665), branch `nodata/elegant-tesla-kpeojx`.

## Pins

| Item | Value |
|---|---|
| Current candidate | main `9d92472a46a4e37f847472276d77e3b4ce158e80` (Merge PR #716, LATE-LM1; includes #691 account privacy), tested unmodified in `results/m3-a13a2bb9`, `results/stress-payer-43d737e4`, `results/stress-seller-43d737e4` |
| Earlier candidate | main `8aca5a06a9435dd30e40378ba606da3c68f94863` (Merge PR #683; #287 item 3 wallet disclosure gate), tested unmodified in `results/m1c-32e141ee`, `results/m1d-1bb92a77` |
| Historical pin | main `aaa71a112d90fd39f59b40de9f139e9cfdc62d61` (Merge PR #635, P1-LATE), tested in `results/m1-d3edbdb` and `results/m1b-9e7f7c4` |
| Candidate under test | main (unmodified). No W1-approved candidate and no W1 coordination handoff were found in PRs, issues or branches at start (2026-11-25 ~10:40 UTC). #664 head `d4bdd0224aec5b35b41483830b65006f146de7cd` was observed only, not tested. |
| Production diff vs candidate | none; `run.mjs --candidate <sha>` (default `origin/main`) refuses to run if `git diff <candidate> HEAD -- apps packages package.json package-lock.json` is not empty |
| Bundles | lean (Pages) profile, built by `harness/build.mjs` exactly as `apps/web/playwright.config.ts` does: `ab9bc5b061acb54a9bf8833fd788e81e343467be348506c697005e15a6d84c62` for `9d92472a`, `b440bed21c63a6c4262e5f8e9020d1bb1d2daf1fbb8bb087bbf72f95ca3e248d` for `8aca5a06`, `cae30f5d6a2c1f389d545adeec84143f993ea20281f6eec4997f86b1227721b4` for `aaa71a11` (18 files each) |

## Capabilities in this session

| Capability | State |
|---|---|
| Checkout, git push to own branch, draft PR | available |
| Node / npm | node v22.23.5, npm 10.9.9; `npm ci --ignore-scripts && npm run build:libs` passed |
| Browser | pre-installed Chromium 158.0.8127.36 via repo-pinned `playwright-core` 1.64.1, headless; persistent profiles for restart |
| GitHub | built-in GitHub MCP + `gh api` search available; the `plugin:github` MCP server failed to connect (authorization header error) |
| Context7 docs | needs claude.ai connector authorization; not used (no library API was in doubt: harness uses Node built-ins, Playwright and `@noble/hashes` already in the lockfile) |
| Home computer, live wallets, funds, Foundry/anvil | not used / not needed for milestone 1 |
| Ordinary CI | does **not** run this harness; PR CI only proves the repo's own suites |

## Harness defects found and fixed (all in `harness/`)

| Id | Defect | Evidence | Fix |
|---|---|---|---|
| H1 | build set `GP_COMMIT`, making a release build that correctly refused the public test key | first build failed in `parseReleaseKeys` | build like `playwright.config.ts` (no `GP_COMMIT`); identity recorded separately |
| H2 | seller keys without backup in a payer tab: leave-page guard aborted navigation/reload | `ERR_ABORTED at about:blank`, `page.reload` timeout | seller role in its own tab, closed before payer tabs act; `beforeunload` accepted on deliberate leave |
| H3 | undelivered wallet hashes used to select journal rows | `check` found `no-row` for a hash the app never received | only hashes delivered to a live document select rows |
| H4 | checkout `Continue` is disabled while deployment checks run; RPC-down notices not read | vacuous N9 run (0 handoffs); empty status text | wait for enable, report blocked checkout, read whole row result; **vacuity guard**: zero handoffs ⇒ harness error |
| H5 | a held wallet reply released after the tab navigated counted as delivered (only `close` was tracked) | I4 candidates in seeds 2, 13, 19, 20, 22 of the `0c274c1` run, each with a navigation of tab A between hang and release | delivery requires the requesting document to be current; I4 window measured to the end of that document |
| H6 | after a browser restart both tabs sit on `about:blank` (origin `null`), so I4 looked at no app storage | N11 flagged I4 at the restart step; the hash was visible on the next app load | I4 judged only from tabs on the app origin (self-test regression added) |

The `0c274c1` run was stopped before minimization (harness-defect artifacts); its log is not committed as evidence.

## Harness audit (milestone 1)

- `node --test verification/independent-beta/harness/selftest.test.mjs` → **11 pass, 0 fail**: 300 seeded random
  chain-operation sequences (canonical linkage, receipt iff mined, canonical quantities, nonce ordering), reorg
  semantics, RPC fixture answers, and oracle sensitivity to planted I1/I2/I3/I4/I5a/I5b/I7/I8 violations.
- End-to-end positive control **P1** (fresh browser profile, outside the accepted guarantee R26): the real app sends
  X again, as it legitimately may there, and the oracle detected **I2, I3, I4**. A run whose control is not detected is
  a harness error, so a green run cannot come from a blind oracle.
- Vacuity guard: a scenario in which nothing reaches the wallet is a harness error (caught H4).
- Coverage reached in `m1-d3edbdb` (computed from the trace): 87 retries refused with zero wallet requests, 40 control
  payments reaching the wallet once, 14 X handoffs whose reply never reached a live page, 9 returned hashes followed by
  reload/close, 6 explicit status checks after a reorg, 4 dismissed and 3 accepted clears (each accepted clear followed
  by one further permitted send), 26 success displays all judged against canonical truth.

## Runs (actual results)

All from the repository root, bundle `cae30f5d…` (lean, built from unmodified main), Chromium 158.0.8127.36,
node v22.23.5, linux x64, 4 CPUs. Wallet, RPC and chain are synthetic; no traffic left the machine
(`blockedOffOrigin` empty in every run).

| Record | Harness SHA | Command | Scenarios | Handoffs | Violations | Harness errors | Ambiguities |
|---|---|---|---|---|---|---|---|
| `results/m1-d3edbdb/` | `d3edbdb` | `run.mjs --named --seeds 1-30 --concurrency 3` | 40 (N1–N10, G-1…G-30) | 83 | **0** | 0 | 1 (A1, N8) |
| `results/m1b-9e7f7c4/` | `9e7f7c4` | `run.mjs --only P1…,N11…,N12… --seeds 31-50 --concurrency 3 --minimize` | 23 (P1, N11, N12, G-31…G-50) | 48 | **0** (P1 control detected as required) | 0 | 0 |
| `results/m1c-32e141ee/` (candidate `8aca5a06`, bundle `b440bed2…`) | `32e141ee` | `run.mjs --named --seeds 1-30 --concurrency 3 --minimize --candidate 8aca5a06` | 44 (P1, N1–N13, G-1…G-30) | 91 | **0** (P1 detected I2, I3, I4) | 0 | 1 (A1, N8) |
| `results/m1d-1bb92a77/` (candidate `8aca5a06`, bundle `b440bed2…`, G3–G5 oracle) | `1bb92a77` | same as above | 44 | 91 | **0** (P1 detected I2, I3, I4) | 0 | 1 (A1, N8: after reorg, drop and the journal check, each labelled) |

Seeds are tied to the harness SHA (the generator's alphabet gained `restart` at `16c3593`); every record also stores
each scenario's exact steps, so any sequence can be replayed without the generator.

What the unmodified candidate did, per requirement (black-box evidence in the traces):

- R3/R5/R12 interrupted before a hash (N1, N12, tab close or browser restart): the `Outcome unknown` record survived
  and blocked every repeat in both tabs; the late reply to a dead page was lost; the control still paid once.
- R3/R19 hash returned then reload, tab close or browser restart (N2, N6, N11): the hash stayed in the wallet-attempt
  list across tabs and restarts; retries were refused before the wallet was asked.
- R13 error after broadcast, transaction mined (N3): never shown as success; no automatic or manual resend.
- R25 deliberate override (N4, N10): a dismissed clear kept the block; one accepted clear permitted exactly one further
  wallet request across both tabs.
- R28/R29 stale authority (N5, N7, N9): a late hash after an account switch stayed X evidence and did not unblock X for
  the new account; a chain switch after the final check was refused with "The wallet network changed. Reconnect and
  review again." and nothing reached the wallet; an in-page switch to C while X waited in the wallet kept the late X
  hash as an X record and C paid once.
- R14/R36/R41 RPC down and reorg (N2, N6, N8): explicit checks returned `Outcome unknown` with the RPC down and
  `Pending` after the inclusion was reorged out; the hash was retained.

## Findings routed (no production code changed here)

Routing assumes the owner's W2 = payer checkout / attempt-journal UI and W3 = transaction status / reconciliation
split; reassign if W1's coordination says otherwise.

| Id | Class | Owner | Finding | Evidence | Suggested remedy |
|---|---|---|---|---|---|
| F1 | product, low (wording) | W2 | A tab blocked by an existing journal record shows "The wallet request failed with an unknown outcome and may already have been submitted…" before the correct "A previous wallet attempt for this action already exists…". For that click **no** wallet request was made, so the first sentence is inaccurate and may lead a payer to think a second payment might exist. Safe (nothing sent) but misleading. | 138 of the 141 refused send clicks across both runs (the other 3 show the chain/account-change refusal), e.g. `m1-d3edbdb` N2 step 14; `apps/web/src/views/Pay.tsx:136` wraps the refusal (`apps/web/locales/en.json:1621`) in `transaction.walletUnknown` (`en.json:1987`, security-classified in `apps/web/src/i18n/securityKeys.ts:365`) | show only the journal-refusal message when the refusal happened before any provider call; security-key wording review |
| A1 | ambiguous requirement | W3 | After the checkout showed "Status: included in block 501 (not necessarily final yet)", a reorg and drop removed the transaction; the done panel kept the inclusion text until the payer re-checked or reloaded. The explicit check then correctly said `Outcome unknown`. No payer-side rule says whether a displayed inclusion must be withdrawn (requirements gap: payer-side reorg unspecified). | `m1-d3edbdb` N8 steps 2–3 (`truth: mempool`, then `dropped`) | decide the payer-side reorg rule; if accepted, re-verify or mark the done panel stale on new blocks |
| A2 | docs contradiction | W2 / docs | `docs/handoffs/PAGES_INTERRUPTED_PAYMENT_VERIFICATION.md:7,14` still say the payer journal is "same-tab" / "tab-scoped" and that other or closed tabs are outside it. The built app blocks across tabs, tab close and full browser restart (N1, N2, N10, N11, N12), matching `en.json:1076`. | traces above | update the Pages verification doc |
| O1 | observation (known residual JRNL-L2) | W2 | After an accepted clear, the original held wallet reply arriving later recreated a record for X (evidence kept; no extra wallet request). Consistent with R33 and the documented residual "a cleared record can still come back". | N4 step 10 (journal 1 → 2 rows) | none required; mention in the user guide's clear-step text |

No I1–I8 violation (product-defect candidate) was found: 63 scenarios on `aaa71a11`, and 44 on `8aca5a06` with the G1/G2 oracle and again with the G1–G5 oracle below. F1 still reproduces on `8aca5a06` (94 of 97 refused send clicks), A1 still reproduces (N8), and A2 is still present at `8aca5a06` (`PAGES_INTERRUPTED_PAYMENT_VERIFICATION.md:7,14`).

New on `8aca5a06` (wallet disclosure gate, #287 item 3), observation O2: cancelling the "Review wallet disclosure" dialog for the payment sent nothing to the wallet, created no journal record and showed "Wallet disclosure was cancelled or became stale. Review again before continuing."; the next deliberate send reached the wallet once and was then blocked (N13). This is consistent with R13 (nothing that might exist was reset) because the provider was never called.

## Review response — source review on #665, 2026-11-25 23:02 UTC (head `2be20088`)

| Gap | Reviewer's point | Change | Evidence |
|---|---|---|---|
| G1 | I1 done-panel check passed silently when the success text showed no matching wallet hash | I1 now judges displayed full or masked hashes; else every hash the wallet returned for that intent (fallback basis recorded); a claim with no returned hash, or on a tab of unknown intent with no qualifying hash, fails | fixtures: no hash + no canonical tx → I1; masked canonical → pass; masked unmined → I1; foreign hash → I1; unknown-intent tab → I1; full canonical control → pass |
| G2 | I3 compared row counts, so another intent's or a duplicate row could hide a missing X record | I3 matches each expected record by identity (hash rows by hash, full or masked; hash-less unknown rows consumed once per intent; identity-unjudgeable cases recorded). An enabled pay action with X's record missing fails I3 with the button state; with the record visible it is explicitly classified `payEnabledWithRecord` (R20) | fixtures: two C rows / one C row with X unknown expected → I3 for X; enabled button + missing record → I3; both records visible → pass + classification; recorded hash shown only as an unknown row → I3 |
| A2 | tab-scoped statements still on main | re-read at `8aca5a06`: still at lines 7 and 14; routing unchanged (docs owner) | `git show 8aca5a06:docs/handoffs/PAGES_INTERRUPTED_PAYMENT_VERIFICATION.md` |
| G3 | (follow-up, head `bb30044c`) a displayed unrelated hash fell back to X's known hash and could pass if X was canonical at that block | a displayed hash the wallet never returned for the intent is foreign evidence and fails; only a genuinely hash-omitted claim uses the fallback | fixtures: same-block canonical X + displayed unrelated hash → I1; hash-omitted canonical control → pass (fallback recorded) |
| G4 | an unchanged claim was only re-judged on chain changes, so a stale inclusion surviving reload/recheck escaped | every step re-judges it: stale after a fresh render of its tab (open, switch, reload, reopen, restart) → I1/I8; during a chain change or after a journal check → labelled A1 | fixtures: canonical → orphan (A1 on the reorg) → reload of that tab → I8; → journal check → A1 `no fresh render (check)`; → reload of the other tab → A1. Real app: N8 now records A1 at the check step; after its reload no stale claim remains |
| G5 | hash-less unknown-row I3 matches must stay unqualified | counted (`i3UnqualifiedMatches`) and noted as presence, not proof of identity | `m1d-1bb92a77`: 482 such matches in 27 scenarios, all reported as unqualified |
| Rerun | rerun on the current candidate, not only the historical bundle | `--candidate` pin; full rerun on `8aca5a06` (`results/m1c-32e141ee`); harness drives the new disclosure gate (H7 below) | 44 scenarios, 0 violations, 0 harness errors |

Self-test: 28 pass, 0 fail. The G1/G2 fixtures were run against the `2be20088` oracle first (10 of 11 failed; the canonical control passed on both), and the G3–G5 fixtures against the `bb30044c` oracle (5 of 6 failed; the hash-omitted control passed on both), so each set demonstrably covers its gap.

H7 (harness defect): the candidate's disclosure gate stops every wallet request until the user presses "Continue to
wallet"; the vacuity guard flagged the first smoke run (no wallet request at all). The harness user now approves the
dialog by its visible text, or cancels it when a scenario asks (N13), and records every dialog shown.

## Milestone 2 — seller-side reconciliation (2026-11-26)

Candidate: main `e7e981095b07a05c7727bf9fafb0a0fec7e4fc36`, unmodified lean bundle `b7c87578…` (18 files).
Model: `SAFETY_MODEL.md` "Milestone 2" (seller invariants SI1–SI8, ambiguities SA1–SA7; requirements from ADR-0026,
the P1-LATE handoff, user docs). Runner: `harness/seller-run.mjs`.

Set-up per scenario: a seller profile (tabs S1, S2) with vault-backed keys creates and registers X (0.5 ETH) and an
unrelated control C (0.3 ETH, distinct amount so matches are not ambiguous by construction); a separate payer profile
pays through the real checkout. The synthetic chain executes `payNative` with a contract model written from
`docs/CONTRACTS_SPEC.md` §1 (own ABI fragment, selector checked): it reverts on expired deadline, wrong net or bad
metadata and otherwise emits `FeeCollected` then `Announcement(1, stealth, router)`. A late payment is the same payment
sent directly to the router with a later deadline (S37), because the checkout's own deadline precedes expiry.

| Record | Harness SHA | Command | Scenarios | Payments | Violations | Harness errors | Ambiguities |
|---|---|---|---|---|---|---|---|
| `results/m2-27656321/` | `27656321` | `seller-run.mjs --named --seeds 1-24 --concurrency 3 --candidate e7e98109` | 31 (P2, M1–M6, SG-1…SG-24) | 37 | **0** (P2 detected SI4 as required) | 0 | 14 scenarios, all SA6 |

Coverage reached (from the trace): 114 completed scans, 24 exact proposals, 20 seller confirmations of X and 2 of C,
19 pending-before-finality displays, 13 reorgs orphaning a payment and 22 "Reorg invalidated" displays after rescans,
7 interrupted scans, 1 accepted late payment (M4), 67 two-tab comparisons. Every confirm that found no button was an
intended refusal (late payment, stale tab, failed scan); none happened while a card said "invoice link pending".

What the candidate did (black-box evidence in the traces):

- S9/S1 pending vs final: below 100 confirmations X showed "Pending transfer evidence"; at depth "Verified on-time
  transfer — invoice link pending" with an exact proposal; nothing linked without the seller's confirm (M1, M2).
- S27/S32 distinct counting: after confirm, "Linked total equals … Distinct linked observations: 1", unchanged by
  resumed and full rescans and by both tabs (M1, M6).
- S9/S10/S13 late: a late payment showed "Verified late transfer — invoice decision pending"; ordinary confirm was not
  offered; "Accept late payment for this invoice" linked it (M4).
- S14/S16/S18 reorg: a reorg removing the linked payment left the link displayed until the next scan (SA6), then
  showed "Reorg invalidated earlier payment evidence. Verify again before relying on this invoice." in both tabs and
  after reload; the accepted-late decision time stayed in the ledger (M3, M4).
- S20/S25/S27 interruption: a scan losing the RPC mid-way ended with "Blocked by a safety check (RPC_FAILURE)." and
  added nothing; a clean rescan proposed the payment (M5).
- S39 two tabs: a confirm in S1 updated S2 live; S2's stale confirm had no button; tabs agreed after reload (M6).
- S31 control: C never showed X's state; C linked only on its own payment and confirm.

Harness defects found and fixed in M2: H8 (registration label also names a context-help button: select the
checkbox by role), H9 (stored-record cards were read as invoice cards: invoice cards are those with an amount line),
H10 (decision steps navigated away from Scan first, discarding the live results proposals depend on; 4 of 6 named
scenarios were vacuous until fixed; named steps that must take effect are now guarded).

Findings: no SI1–SI8 violation (product-defect candidate) on `e7e98109`. Observations routed to W3:
- O3: a link stays displayed after a reorg until the seller scans again (SA6); this is expected (no scan, no
  knowledge) but worth a note in the user guide's reconciliation section next to the reorg text.
- SA5 (docs): `docs/user/reconciliation-and-receipts.md:14-27` still describes observation-time matching; the app
  and ADR-0026 use canonical block time (late payments in M4 were classified by block time).

## Milestone 3 — seller feature completion, audit and stress (2026-11-26)

Candidate: main `9d92472a46a4e37f847472276d77e3b4ce158e80` (includes LATE-LM1 #716), unmodified lean bundle
`ab9bc5b061acb54a9bf8833fd788e81e343467be348506c697005e15a6d84c62` (18 files, built by `build.mjs` from `947e2ff6`,
whose production paths equal `9d92472a`). Model: `SAFETY_MODEL.md` "Milestone 3 additions" (SI9–SI12, SA8–SA10).

New coverage:

| Scenario | Requirement | What the candidate did |
|---|---|---|
| M7 two-RPC disagreement | S20 | the second provider (frozen on the pre-reorg fork) disagreed: the scan stopped with the disagreement notice and credited nothing; once both providers agreed the link was invalidated (SI9) |
| M8 / M9 seller browser restart | S28/S49 | a confirmed link and an accepted-late decision survived a full browser restart over the same profile and vault (SI10) |
| M10 checkout after expiry | S37 | with the payer's clock past expiry (H15), the checkout refused the expired invoice before the wallet (Continue stayed blocked); the control C paid once; no effective payment (SI2) |
| M11 quarantined link keeps invoice reserved | LATE-LM1 (#716) | after a reorg quarantined X's link, a second payment of X's amount was not proposed for X (SI11) |
| M12 old backup cannot revive a reorged link | S42–S44 | importing a backup exported before the reorg marked 1 observation invalid and did not relink (SI12) |
| M13 / M14 manual links | S13 | a manual link was not offered for a late payment (needs "Accept late payment"); an on-time manual link counted once |
| M15 manual link to a reserved invoice (probe) | LATE-LM1 × S13 | **accepted** — see F2 |

Harness defects found and fixed in M3: H11 (SI9 flagged withheld credit, which S12 allows), H12 (genesis block hash
zero and `parentHash` malformed, so the app kept "second RPC disagreed" after the thaw), H13 (two dialog handlers
answered one dialog; the unhandled rejection crashed the run).

Found by the first post-audit stress run (stopped, not committed as evidence) and fixed before the final runs:

- H14 (model behind an accepted requirement): main `9d92472a` includes account privacy (#691, R50 in
  `SAFETY_MODEL.md`): the journal lists only the connected account's and chain's records, behind the notice "A
  previous wallet request may already have been submitted… Journal records are preserved." I3 still demanded every
  record on every journal screen, so N5 (account switch) and N6 (RPC down blocks reconnection) reported I3 although no
  second wallet request was made (I2 held). Not a product defect. Fix: I3 is strict for the connected account and
  chain, and accepts concealment only behind that notice (classified `i3Concealed`); the suffix returns to the paying
  account so each record is judged strictly at least once. 4 new fixtures; 3 fail on the old oracle (the strict
  connected-account fixture passes on both).
- H15 (vacuous step, silent coverage loss): `warp` moved chain time ahead while the payer's browser clock stayed put,
  so every later checkout built its deadline hours behind the chain and the (audit-13) router dry run reverted. M10's
  control payment of C never reached the wallet; the audit-6 whitelist made that a harness error, and generated runs
  lost every checkout after `latePay` silently. Fix: payer profiles' clocks move with each warp (Playwright clock,
  real time keeps flowing); the seller's clock is untouched because lateness is judged by block time. Limitation:
  after a warp the seller sees block timestamps ahead of its own clock; shifting the seller clock as well would also
  trip the idle lock (#689) in the middle of a scenario, which these scenarios do not model.
- Self-audit of the H14 change: "Connect … to reveal" now excuses concealment only while the tab shows no send button
  (no connected checkout); with a connected checkout the own account's records must be shown (new fixture). In the
  stress record that notice never appeared together with a send button (0 of 201 observations), so the stress verdicts
  below are unchanged by this tightening.

### Independent harness audit (22 findings, all harness-side, all fixed in `ce569d8c`)

A separate review of the harness source (not anchored on this handoff) found no product defect and 22 harness gaps.
High: unchanged status-check rows were not re-judged (1); journal rows claiming inclusion were not judged like the
done panel (2); seller links were only strict right after a scan, not whenever the chain is unchanged since the last
finished scan (3). Medium: DNS lockdown plus off-origin and unknown-RPC-method harness errors (4, 13); argument
validation and exit 2 on invalid or empty runs (5); suffix steps must be attempted and each op has a success whitelist
(6); seller decisions recorded only when effective, refusals detected (7); invoice cards must parse after a finished
scan (8); masked foreign hashes count as bleed (9); bundle provenance check and whitelisted build environment (10);
faults armed before Start and verified to fire (11); chain time never regresses on reorg (12); router dry runs revert
like the contract, real receipt index, `earliest`, full transaction objects, unknown `blockHash` error (13); per-record
clear bookkeeping (14); document end measured at navigation (16); harness-side expiry for late classification (17).
Low: dialog errors caught, server 404s for missing assets and the build record, robust profile cleanup, bounded
minimization, malformed request guard (18–21); model wording (22). 9 of the 10 new self-test fixtures fail on the
pre-audit harness (the tenth is a control).

Self-test: 53 pass, 0 fail, at the default scale and at `W5_PROPERTY_SCALE=10` (3000 random chain sequences,
500 generator seeds checked for determinism and bounds).

### Runs

| Record | Harness SHA | Command | Scenarios | Payments / handoffs | Violations | Harness errors | Ambiguities |
|---|---|---|---|---|---|---|---|
| `results/m3-a13a2bb9/` (pre-audit harness) | `a13a2bb9` | `seller-run.mjs --named --seeds 1-24 --concurrency 3 --candidate 9d92472a` | 40 (P2, M1–M15, SG-1…SG-24) | 47 payments | **0** (P2 detected SI4) | 0 | 27× SA6, 1× SA8 (M15) |
| `results/stress-payer-43d737e4/` (bounded stress) | `43d737e4` | `W5_PORT=4176 run.mjs --named --seeds 1-60 --concurrency 2 --minimize --candidate 9d92472a` | 74 (P1, N1–N13, G-1…G-60) | 152 handoffs | **0** (P1 detected I2, I3, I4) | 0 | A1 in N2 and N8 only |
| `results/stress-seller-43d737e4/` (bounded stress) | `43d737e4` | `W5_PORT=4177 seller-run.mjs --named --seeds 1-40 --concurrency 2 --candidate 9d92472a` | 56 (P2, M1–M15, SG-1…SG-40) | 68 payments | **0** (P2 detected SI4) | 0 | SA6 ×9, SA7 ×2, SA8 ×1 (M15) |

Both stress runs ran side by side on the same 4-CPU container (wall time 37 and 34 minutes), which also loads the
app's timing paths. Payer coverage: 163 refused send clicks with no wallet request, 12 browser restarts, 35 reorgs;
records concealed by account privacy were classified, never silent (142 while not connected, 25 for another account).
F1 still reproduces on 162 of the 163 refused clicks. Seller coverage: 184 finished scans, 26 effective confirms,
3 accepted late payments, 13 seller browser restarts, 31 reorgs, 2 scans stopped by the two-RPC disagreement,
8 late payments after a payer-clock shift. The only checkouts that did not reach the wallet were M10's expired X
(intended) and SG-9's repeat of the already-paid C (the payer's journal refusing a second request, as required).

Flake check: a second named-only pass of both runners side by side (`run.mjs --named --concurrency 2`,
`seller-run.mjs --named --concurrency 2`, harness `4f703652`, same candidate and bundle; scratch records, not committed)
gave the same classification for every scenario: payer 14 scenarios, 31 handoffs, 0 violations, P1 detected I2, I3,
I4, A1 in N2 and N8; seller 16 scenarios, 18 payments, 0 violations, P2 detected SI4, the same SA6/SA7/SA8 set.

QA of the run commands: both runners exit 2 on an unknown argument, a non-positive concurrency or an unknown scenario
name. QA found that a reversed or malformed seed range (`5-1`, `-3`, `abc`) fell through to the named set (`-3` even
parsed as `0-3`); seed specs are now checked against `N` or `N-M` with `N <= M` in both runners.

### Findings (M3)

| Id | Class | Owner | Finding | Evidence | Suggested remedy |
|---|---|---|---|---|---|
| F2 | ambiguous requirement / low | W3 | A manual link of a second payment to an invoice whose earlier link is quarantined by a reorg (LATE-LM1 reservation, #716) is accepted: the card then says "Linked total is above the expected net amount… Distinct linked observations: 2". Proposals respect the reservation (M11); the manual path does not. Not a credit to the wrong invoice, but it defeats the reservation's purpose. | M15 in `m3-a13a2bb9` and the stress record (SA8) | decide whether manual links must honour the reservation; if so, refuse with the reservation reason |

No SI1–SI12 violation (product-defect candidate) on `9d92472a`. F1, A1, A2, O3 and SA5 are unchanged.

## Not covered yet (next milestones)

1. Seller-side gaps after M3: vault saturation (S24) and replacement-observation linking.
2. ERC-20 checkout (approval/permit + payment): the per-invoice request count is ambiguous (A3) and needs an owner rule.
3. Replacement linking ("Link a replacement transaction" / nonce consumed) and wallet rejection 4001 policy (A4).
4. A W1-approved candidate SHA, if W1 names one other than current main: `build.mjs` then
   `run.mjs --named --seeds 1-50 --candidate <sha>` on a checkout whose production paths equal it.
5. Real-chain full browser restart (`docs/beta/CORE_BETA_COMPLETION_TRACKER.md:151` stays unchecked: this harness
   restarts a real browser over a mocked chain only).

## Resume

```bash
npm ci --ignore-scripts && npm run build:libs
```

```bash
node verification/independent-beta/harness/build.mjs --profile lean
```

```bash
node --test verification/independent-beta/harness/selftest.test.mjs
```

```bash
node verification/independent-beta/harness/run.mjs --named --seeds 1-50 --concurrency 3 --minimize --candidate origin/main
```

```bash
node verification/independent-beta/harness/seller-run.mjs --named --seeds 1-40 --concurrency 3 --candidate origin/main
```
