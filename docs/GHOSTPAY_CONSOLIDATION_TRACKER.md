# GhostPay consolidation tracker

Living record for the testnet-beta consolidation (directive "GhostPay master consolidation and stabilization",
2026-11-25). It does not replace the binding scope in [AGENTS.md](../AGENTS.md) (owner stop-work directive and
shared-core privacy clarification) or the per-worker claims in [docs/ai/ACTIVE_WORK.md](ai/ACTIVE_WORK.md).
Everything below is pinned to the SHAs shown. A merged branch is not proof its feature works; estimated completion
is never verified completion.

Maintainer of this file: cloud session `ghostpay-6a` on branch `nodata/optimistic-maxwell-epuo8f`. Other workers may
append rows; keep the starting baseline unchanged.

## 1. Baselines

| | Value |
|---|---|
| Starting baseline (2026-11-25 12:50 UTC) | `origin/main` = `32ae3977b6026991ae0591daf385d3c536e2132f` (Merge PR #660) |
| Current integration baseline | `29d21c1b` (2026-11-26 00:55 UTC, Merge #684). It contains #673 at exact head `e2bd32c5`, merged under lock generation 34 by `chatgpt-8812-branch-completion` |
| Integration lock | `automation/ghostpay-integration-lock` `d1e2e037`: **released**, generation 26, last owner `claude-feature-completion-20261125` (candidate #664 `7b47c3dd` failed e2e lean, main unchanged) |
| Remote heads | 791 (`git ls-remote --heads`), incl. 34 frozen `archive/owner-stop-20261125/*` snapshots |
| Open PRs | 256 (pages 1–3 of the PR list at 13:40 UTC) |

### Baseline validation on `32ae3977` (this worker, Linux, Node 22.23.5, npm 10.9.9, 4 CPU / 15 GB)

| Check | Result |
|---|---|
| `npm ci --ignore-scripts` | pass |
| `npm run build:libs` | pass |
| `npm run typecheck` (all workspaces) | pass |
| `npm run lint` (all workspaces) | pass |
| Lean web build (`GHOSTPAY_LOCAL_BUILD_PROFILE=lean vite build`) | pass, 352 rendered modules |
| `GHOSTPAY_PAGES_DEV=1 bash scripts/pages/build-pages.sh` (with REL-EXCL step) | pass, 17 site files, "DEMO: payments disabled" |
| `node --test scripts/pages/*.test.mjs scripts/tests/*.test.mjs` | 341 pass, 1 skip, 0 fail |
| Full `npm test`, Playwright e2e, forge | **not run here** (no forge/anvil in this container); hosted CI is the gate. Main CI on `aaa71a11` passed 27/27 per W1's record; `32ae3977` hosted result not re-read here |

## 2. Active workers and merge queue (observed 2026-11-25)

Peers on the owner's home PC are not reachable by message from this cloud session; coordination is through
ACTIVE_WORK, the lock ref and PR text. Source: `claude/feature-completion-20261125` CAMPAIGN.md (12:36 UTC),
`claude/w1-coordination-20261125` HOME_TEAM_20261125.md (11:56 UTC), lock-ref history.

| Worker | Owns | PRs |
|---|---|---|
| FC coordinator `claude-feature-completion-20261125` | feature-completion round 1, FC-05b | #664 (candidate: #648 #661 #650 #649 #656 #662 #663), #669, #654 |
| W1 `ghostpay-58` | preservation, sole merger of W2–W4 | #667 (reconciles owner scope #659) |
| W3 | privacy-boundary production fixes | #672 (WIP Settings) |
| W4 | #286 clipboard, #287 minimal invoices | #668 (#553 + #580), #585/#600 |
| W5 (cloud) | independent verification, exclusive `verification/independent-beta/**` | #665 |
| `ghostpay-15` | P0-KEYS independent keystore recovery | #647 |
| `newghostpay-ae` | payment-uri invoice-link fix | #670 |
| `ghostpay-backup-60` | merged #657/#660; test follow-up to #647 | — |
| destination-reuse worker | #287 reuse | branch `claude/w-reuse-287-20261125` (#584 #586 #610) |
| ChatGPT/Codex automation | hourly bug/QA drafts, help containment | `automation/*` (#671 and older drafts) |
| **cloud lead `ghostpay-6a` (this file)** | REL-EXCL, TRACKER, R1 recovery bundle | this branch's PR |

Agreed main-merge queue (CAMPAIGN.md 12:35 UTC): #664 → #647 → #670 → backup-60 follow-up → W3 → FC follow-ups
(#669; W4 PRs via W1). This worker joins at the tail and never takes or renews another holder's lock.

## 3. Branch inventory

Not repeated: the 723-branch mechanical inventory at `c8e131c1`
(`docs/consolidation/feature-completion-20261125/BRANCH_INVENTORY.tsv` on `claude/feature-completion-20261125`:
A ancestor 371, B no non-doc diff 99, H open-PR owner 192, J residual 60, gh-pages 1), the 212 semantic
dispositions in [branch-comparison-20261124-68c82b9](consolidation/branch-comparison-20261124-68c82b9/HISTORICAL_DISPOSITIONS.json)
and the owner archive manifest (`docs/archive/feature-freeze-20261125.json` on #659/#667: 31 feature refs and 3 mixed
compositions frozen, 17 feature-only PRs closed, 4 held). Since `c8e131c1`, 68 new heads exist; those with open PRs are
covered by section 4. Branches without a PR created after 2026-11-24 are owned by the workers in section 2.

## 4. Open PR inventory (256, classified A–K)

Per-PR data (head ref, head SHA, residual file counts against main, historical disposition, reason):
[cloud-lead-20261125/OPEN_PR_CLASSIFICATION.tsv](consolidation/cloud-lead-20261125/OPEN_PR_CLASSIFICATION.tsv).
Method: fetch every open head; files changed since its merge-base whose blob differs from main = residual;
36 heads are ancestors of main; small-residual PRs were read semantically (32 PRs); large ones mapped to the
2026-11-24 historical dispositions. A three-way drift check was used before calling anything unique.

| Class | Count | Meaning here | PRs |
|---|---|---|---|
| A Ready for integration | 4 | recovered on this branch (R1) | #623 #626 #627 #633 |
| B Nearly complete | 2 | small semantic work left | #528 (lock scope review), #595 (test-only manual port) |
| C Partially complete / unreviewed unique source | 78 | old compositions and the #372-based privacy stacks; semantic recovery review needed | see TSV |
| D Superseded | 47 | census/handoff records, history retained in descendants, cherry-picked elsewhere (#583 → #640) | see TSV |
| E Already integrated / patch-equivalent | 44 | 36 heads are ancestors of main; 8 residuals already on main (#250 #384 #405 #409 #416 #419 #616 #617) | see TSV |
| F Useful individual changes | 1 | #442 diagnostic confidential-contracts test (not beta runtime) | #442 |
| G Deferred by release scope | 22 | F05/F10 future-only, subscriptions (#631 #637), hosting/Tor (#308 #320 #363), dependency trains, CI agents | see TSV |
| H Archived/held by owner directive | 4 | owner HOLD comments 2026-11-25 | #371 #592 #614 #621 |
| I Conflicts with current architecture | 2 | obsolete against main | #51 #319 |
| J Actively owned by another worker | 47 | section 2 owners plus FC donors (#219 #244 #252 #254 #271 #272 #310 #376 #534) | see TSV |
| K Owner decision | 5 | scope link to a stopped product or dormant future module | #248 #558 #559 #628 #634 |

**Safe-to-close candidates (owner action; nothing closed by this worker):** the 44 class-E PRs. Their heads are on
main or their only unique code is already on main in an equivalent or stricter form; #616/#617 additionally carry an
owner HOLD whose shared-core code is already on main (`seal.ts`, `qrKinds.ts` strict `=== true`).

## 5. Feature inventory (in-scope, beta)

| Feature | Source PRs/branches | Implementation | Integration | Verification | Est. % | Remaining | Ready |
|---|---|---|---|---|---|---|---|
| Release exclusion of stopped products (REL-EXCL, §11) | this branch | done | this PR | unit 10/10 + 34/34 (red without hook); real lean artifact clean; planted modules fail | 95 | hosted CI, review, merge | after CI |
| Automation fix bundle R1 (i18n quoted literals, QR clock rollback, Swiss amount locale, a11y surrogate) | #623 #626 #627 #633 | done (donor-exact) | this PR | affected suites (section 7) | 90 | hosted CI | after CI |
| F03 signed request file, Sweep consent, Solana/TRON interop, BTC spentness, receipt accessor tests | #650 #649 #648 #656 #663 (+T PRs) | done | FC #664 | hosted 40/40 on `d4bdd022`; `7b47c3dd` failed e2e lean | 85 | FC coordinator | FC |
| Independent keystore recovery (P0-KEYS) | #647, #622 | done/active | queue #2 | owner session | — | ghostpay-15 | owner |
| Invoice-link dot-segment/default-port fix | #670 | done | queue #3 | owner session | — | newghostpay-ae | owner |
| Clipboard cleanup (#286) | #553 #580 → #668 | done | W4/W1 | W4 | — | W1 merge | W1 |
| Privacy-minimal invoices, destination reuse (#287) | #585 #600, #584 #586 #610 | partial | W4 / reuse worker | — | — | owners | owners |
| P14 RPC provider disclosure evidence | #658 | done (test level T) | open | — | — | owner | owner |
| #372 privacy-mode foundation: `privacyMode.tsx`, `SensitiveContent.tsx`, `PrivacyQuickHide.tsx`, `PrivateHistory.tsx`, `WalletDisclosure.tsx`, `walletDisclosure.ts`, `useWalletPrivacy.ts` | #372 `055d33e0` | done on branch, **absent from main** | not started (519 commits, 901 behind) | — | UNVERIFIED | coordinator/owner decision: re-cut subset vs. full recovery (section 9) | no |
| #286 masking and account-switch revocation | #569 → #613; #571 → #598 → #612 | on #372 | blocked on #372 | — | UNVERIFIED | 19 / 12 code conflicts; Pay.tsx overlap with #664 and #584/#586/#610 | no |
| #287 external wallet disclosure | #589 → #606 → #630 → #632 | on #372 | home team re-cut onto main: #677 (wallet-library disclosure gate, PR A) | — | UNVERIFIED | main has `onWalletRequest` (#500) only; #632 duplicates #613 fixture | no |
| #286 export, alert and lock-screen metadata | #570 (own `a61c4755`…`55781533`) | done | **taken by home team: #675** (`claude/w-export-privacy-286-20261125`, 15:32 UTC); R2 dropped here | — | UNVERIFIED | 3 code conflicts; drop hunks already on main (deployment diagnostic, createRoot handlers); shares Common.tsx/Pay.tsx/locales with W4 and FC | after deps |
| #287 invoice/receipt timestamp retention | #587 → #609 | done | home team: #676 (preview retention controls); #587 vault format still owner decision | — | UNVERIFIED | vault format v4/v5 bump: owner confirmation first | owner |
| Sole invoice signer kept under idle lock | #577 (own `fb09d2a9` `23639435`) on #544 idle stack | done | blocked on #544 base stack | — | UNVERIFIED | AppShell.tsx conflict; main still wipes at idle (`signerLost`) | owner |
| Deployment diagnostic neutral reason | #619 | done | **already on main** via #620 | — | — | none (class D) | — |
| Private seller scan checkpoints (FC-06) | #248 | partial, red | deferred by FC | — | — | Scan.tsx overlap with #635 | owner/FC |

## 6. Excluded products

Permanently archived: F01, F09, F13. Deferred and disabled through v1.0: F02, F04, F08, F11, F12, F14, P07 (owner
clarification). Containment now enforced at build and on the emitted artifact by REL-EXCL
(`apps/web/scripts/stoppedProducts.mjs`, `scripts/release/verify-release-exclusions.mjs`, `build-pages.sh`).
Retained shared-core mechanisms are asserted not to match (MerchantProfilePanel identity verification, Scan
reconciliation, ux-vault, payment-uri, merchant-ledger, quote). The full (non-Pages) profile still imports the
GhostID offline reviewer behind `VITE_GHOSTID_OFFLINE_REVIEW` (default off); the full profile is not the shipped
Pages artifact.

## 7. Test results (this worker)

| Revision | Command | Result |
|---|---|---|
| `32ae3977` | typecheck, lint (all) | pass |
| `a362824a` | `node --test apps/web/scripts/localBuildProfile.test.mjs` | 34/34; new case fails with the hook disabled |
| `a362824a` | `node --test scripts/tests/release-exclusions.test.mjs` | 10/10 |
| `a362824a` | `node --test scripts/pages/*.test.mjs scripts/tests/*.test.mjs` | 341 pass, 1 skip |
| `a362824a` | lean build + verifier; planted GhostID/POS report | clean (352 modules); planted fails with 2 problems |
| `8cb200f1` | `node scripts/agent/affected.mjs --run --checks typecheck,lint,test` (web, cli, i18n, ux-i18n, ux-intake) | typecheck and lint pass; web 3372 pass / 13 skip (247 files), i18n 570, ux-intake 230, ux-i18n 115, cli 2 + 3: all pass with coverage thresholds |
| `8cb200f1` | node script tests (same run) | 1 failure: `scripts/testnet/verify-sources.test.mjs` case 25, `cast: command not found` (Foundry not installed in this container; environment, untouched by this diff) |
| `b8674475` | `node --test scripts/tests/release-exclusions.test.mjs apps/web/scripts/localBuildProfile.test.mjs` | 48/48 after review fixes; symlink-CLI and checkout-path cases fail on the previous code |
| `b8674475` | real lean build + verifier | clean: 352 rendered modules, 18 files |

## 8. Remaining blockers and next units

1. Hosted CI on this branch's PR head; then join the merge queue tail under the lock.
2. Recovery map of the unclaimed #286/#287 and GP-PAGES stacks: done, read-only
   ([PRIVACY_STACK_MAP.md](consolidation/cloud-lead-20261125/PRIVACY_STACK_MAP.md); small-residual triage in
   [SMALL_RESIDUAL_TRIAGE.md](consolidation/cloud-lead-20261125/SMALL_RESIDUAL_TRIAGE.md)). Ranked: #570 (independent
   of #372), #587 (owner: vault format), #577 (after #544 stack), #589 family and #569/#571 families (after #372).
3. R2 (#570) dropped: the home team opened #675 for it at 15:32 UTC, together with #674 (destination reuse,
   consolidates #586/#610), #676 (retention) and #677 (wallet disclosure). Those are class J now.
4. Main moved to `69485773` (#670 and P13 #642 merged). This branch merged it as `be9ca3a3`; lean build (352 modules)
   and all guard tests pass on the merged tree. P13 lives in `packages/confidential-amounts/src/future/p13/` and is not
   rendered in lean. Suggested follow-up (not done, needs review): also deny `packages/*/src/future/**` in the lean guard.
5. Owner decisions: section 9.

## 8a. Handoff — cloud lead `ghostpay-6a` (2026-11-26 01:00 UTC)

**Landed on main through #673** (exact head `e2bd32c5`, 39 successful checks and three intentional skips; CodeQL passed):
- REL-EXCL. `apps/web/scripts/stoppedProducts.mjs` lists the stopped products. The lean build guard in `localBuildProfile.mjs` uses that list, and `scripts/release/verify-release-exclusions.mjs` checks the emitted artifact, invoked from `build-pages.sh` after the last site mutation. The verifier:
  - requires exact report shapes and the writer's nonempty Worker and per-chunk module evidence;
  - reconciles the report's chunks with the emitted executables;
  - is covered by 54 node tests.
  - Real lean artifact at `8aca5a06`: 364 rendered modules, 17 site files, no stopped-product module.
- R1: automation fixes #623, #626, #627 and #633, merged with their donor SHAs preserved.
- This tracker, plus `cloud-lead-20261125/` with the open-PR classification, small-residual triage and privacy-stack map.

**Taken by other workers after this map** (no longer open work here):
- #570 → #675
- destination reuse → #674
- retention → #676
- wallet disclosure → #677/#679
- W3 scan privacy → #672
- Sweep consent → #683
- recovery/privacy branch composition → #684

**Next independent units:**
1. The owner decisions in section 9.
2. #528, a policy journal lock-scope review (full profile only).
3. #595, a test-only manual port.
4. Optional: extend the lean guard to `packages/*/src/future/**`. P13 currently lives in `packages/confidential-amounts/src/future/p13/` and is not rendered.
5. Refresh `OPEN_PR_CLASSIFICATION.tsv`. It is pinned at `32ae3977`, and many class J/C rows have merged since.

**Not claimed by this worker:**
- Source-level dormancy of product code embedded in core modules.
- Shared-core retention review.
- Physical-device and real-Tor testing.

## 9. Outstanding owner decisions

| Item | Question |
|---|---|
| Close class-E PRs | 44 PRs are on main or equivalent; close them as integrated? |
| #628 ux-export CSV BOM quoting | payment-history export hardening, or F04 analytics (hold)? |
| #634 ux-links handle confusables | core handle validation, or F08 GhostID (hold)? |
| #558 #559 dormant future modules | accept onto main dormant, or keep on branch? |
| #528 policy journal lock | release the journal lock during the wallet prompt (as proposed)? |
| F02/F04 wording | see #667: "deferred and disabled for beta/v1.0", restartable only by new instruction? |
| #372 privacy-mode foundation | Who recovers it, and how: a reviewed re-cut of the seven privacy files onto main (new design surface), or a full recovery of #372? Ten #286/#287 PRs depend on it. Suggested owner: W3 (privacy boundary) with W1 integrating. |
| #587 vault format v4/v5 | Accept the vault/receipt format bump for timestamp retention (recovery compatibility impact)? |
| #544 idle/Sweep base stack | Land the ~84-commit idle stack that #577/#582/#596 sit on? |

## 10. Incremental continuation — 2026-11-27 UTC

Worker `d81aef3d1ca8`, main baseline `9ae770203d69d23bdc8735912dfe98af5944d4d6`.
Historical tables above remain source-pinned observations, not current ownership or merge
authority. Discovery: 838 remote heads; 154 open PRs; 579 closed PRs, including 244 unmerged.
The remote listings were complete. Mechanical residuals were checked semantically before
selection; differing blobs alone were not called missing functionality.

**Implemented, awaiting hosted qualification:** [P14 F2 #745](https://github.com/djshellshoxxx/GhostPay/pull/745)
finishes the integrated light-source evidence label: capability flags no longer advertise
unchecked log-inclusion proof. Result/header validation remains intact. Four regression
assertions failed against the original runtime; corrected package tests 125/125 and app
evidence tests 69/69 pass, with package typecheck/lint/build, web typecheck/lean build and
unchanged secret/bundle gates. Independent review found no blocker and repeated package
qualification. This is an integrated-core follow-up, not recovered unmerged source.

**Represented/superseded:** #319, #528, #595, #704, #151, #664, #603, the pasted-fragment
boundary and several earlier no-PR fixtures. **Owned/blocked:** #248 durable private scan
journal and P0 Worker B's refund lifecycle remain unique but lack a released ownership
and qualified integration path. **Newer explicit deferral:** persistent timestamp cleanup
#383/#587/#609 is outside v1.0 beta until the owner reverses that decision. All ten stopped
products and 34 frozen archive refs remain preserved.

[Focused handoff](handoffs/P14_LIGHT_EVIDENCE_COMPLETION_20261127.md): exact source pins,
test results, local-work preservation, candidate classifications, released generation-65
metadata repair, and next actions. The PR supplies current hosted qualification and final
published/merge SHAs. This source checkpoint does not assert a merge or release approval.

## P14 F4 completion candidate — 2026-11-27 UTC

**Implemented; qualified integration pending:** [#747](https://github.com/djshellshoxxx/GhostPay/pull/747),
`finish/p14-caught-up-20261127-d81a`. This repairs an incomplete already-integrated P14
contract from #658 (`9aed3886693270524beb118685e5947469899c43`), not recovered unmerged code.
Initial main `9ae77020`; current incorporated main `3f7fcd0a7`; prerequisite #745 head
`84d95d627750fc80dd1b496429c3942f49101c6b` is retained by ordinary merge. Merge #745 and
verify resulting main before integrating #747. Coordination history is preserved in full.

The terminal `caughtUp` flag now requires the cursor to exceed the page's observed primary
head. A lagging secondary still caps the fetch and saves the same replay tail, but cannot
qualify late-payment review merely because the bounded page was untruncated. The existing
terminal break, records, finality/reorg behavior, session/route guards and explicit seller
verification remain intact. No chain, contract, backend, dependency or feature activation.

Independent authors proved four unit failures and one real mounted seller-journey failure
on the old runtime. Corrected combined verification: **303 web tests / 10 files**, plus
**125 scan-source tests / 10 files with existing coverage gates**. Web typecheck, lint,
lean build/bundle scan and secret/whitespace checks passed. An independent reviewer found
no blocking findings and separately passed 60 focused regression tests.
Current-head hosted checks and final main integration remain required; no merge SHA is
claimed at this source checkpoint. The known baseline WebKit CSP finding remains explicit.

[Focused handoff](handoffs/P14_CAUGHT_UP_COMPLETION_20261127.md) records source commits,
exact red/green evidence, the newer-main merge, bounded generation-66 release repair,
generation-67 coordination acquisition, remaining gates and next action. P14 F3's captured-
source indexer completion caveat is the next unclaimed repair; older unique owned work,
timestamp deferral and the ten stop-work exclusions retain their previous dispositions.

## P14 integration results and F3 completion candidate — 2026-11-27 UTC

Current incorporated main: `6b323a99df1238cb5ebe7248528cc7bce5140e80`.
This continuation repairs explicit incomplete findings in integrated P14; it does not
relabel represented donor branches as newly recovered functionality.

### Completed integrations

| Unit | Qualified source | Actual merge and evidence |
| --- | --- | --- |
| F2, truthful light-source evidence | #745, `84d95d627750fc80dd1b496429c3942f49101c6b` | `3c9fc0ab518b8a308716dc87cc860424118718eb`; tested/actual tree `8de4135d12b94f8f36c2f312989a8e13817bc381`; 42 candidate checks complete, 39 success and 3 expected publishing-only skips; all 41 resulting-main checks passed |
| F4, primary-head catch-up | #747, `1308f18574c78bdfd5602337c1c27a2c87a27d34` | `6b323a99df1238cb5ebe7248528cc7bce5140e80`; tested/actual tree `964bbe42e35ae8cf71a554e09261c01f1acb0dcd`; 42 candidate checks complete, 39 success and 3 expected publishing-only skips; resulting-main checks running at this source checkpoint |

Both ordinary merges preserved source refs and passed fresh ownership/review/lock checks.
The coordinator waited for the preceding main's checks before advancing. PR verification
comments record exact live checks and any later status; historical candidate entries above
remain preserved.

### Implemented, awaiting hosted qualification: F3

Branch `finish/p14-indexer-completion-20261127-d81a`; source #658,
`9aed3886693270524beb118685e5947469899c43`; original evidence source
`2ab3b243a57bb4e917fb6b9848f78a2a4347d312`. Local integration before docs:
`a7dc365eb60d82584da722713453a594be954fc0`.

A source-bound completion caveat now makes indexer omission risk visible even with details
closed. Counts, evidence, checkpoints, errors, limits and source selection are preserved;
the accessible completion uses the same non-sensitive caveat and correctly announces
cancellation. Draft catalog entries retain the existing English security fallback and
native-review gate. No new service, source default, chain, contract or activation.

Actual local qualification: 14 new component tests pass after 10 failed on the original
runtime; combined Scan suites pass 48 tests, additional privacy/localization suites 75.
The new browser cases fail twice on the original runtime and pass all six actual browser/
layout combinations after the fix. Typecheck, full web lint, lean build/18-file bundle scan,
catalog/extraction and secret/whitespace gates pass. Independent runtime, new-test and
existing-query reviews found no blocking findings. Existing cancellation assertions were
strengthened without removing vault/worker/cleanup controls.

[Focused handoff](handoffs/P14_INDEXER_COMPLETION_20261127.md) records exact commits and
browser versions: Chromium 151 fallback, locked Firefox 157 and WebKit 27.2, each desktop
and 320px Arabic RTL. The broader baseline WebKit CSP finding remains open; targeted passes
do not waive it. Physical devices, external wallets, deployed-site checks and live Tor were
not exercised. Final published-head gates and F4 resulting-main gates remain required.

### Incremental queue refresh

| Candidate and source | Category | Actual retained behavior or blocker |
| --- | --- | --- |
| #604 `2f2c282e4e88e32fb54648864bb9ed51c8307880` -> #717 `367a3b30b1feb5c31c0727fc6fc435162067063c` -> #728 `298257fd251cf0dd64dc80a92198d296672a6cab` | E/F | Offline checkout and opt-in encrypted drafts remain unique, explicitly owned by ghostpay-78/newghostpay-4e/features2; #728 additionally awaits separately owned #744 and combined replay/cover/checkpoint qualification |
| #442 `4bfaffa5d44f70e86cd63a026a6d919e95cc1d2b` | E/F | Unique diagnostic-only test; forensic coordinator ownership, explicit DO NOT MERGE and pending reproduction/privacy review |
| #541 `f5bc0d6c71260e11fc89b28c42c65446e31d335f` | C | Two-tab policy-prompt case already integrated; source is an ancestor of main |
| #616 `7c4987650faf32322d7ded48ad669130aba7e63b` | C for shared core; D for mixed stopped composition | CryptoKey branding behavior and tests retained, only a local variable differs; all ten donor heads are ancestors. Do not revive its archived POS composition |
| #419 `62dcc695ae3ff9d8c109ced97dd357fe29ed3fd3` | C | Superseded by #422 `f846464db3cb2f12c221d0c2f56e3aa3702d4fcb`; runtime/tests match main, preserving valid surrogate truncation plus the newer rendered-output cap |
| #127 `cf3a8b23a1994b39d2cf77b72d8c61c0a903ae4a` | C | Plain-object questionnaire validation and complete donor tests retained; newer independent detectProfile change explains residual |
| #126 `d77956901d95c3eeb8c5c1d67ae7d1647bd069aa` | C | Single-sample confirmation clock behavior and tests retained; newer cancellation-clock changes explain residual |
| #125 `a6e74591e134b31de3e0efc84448eb97cdc3b012` | C | CLI bare-sentinel refusal and all four regressions retained; later optional-global-switch parsing explains residual |

The last three were recovered in `c9787b223a240b8bd5a626325944b3c01a2d4be0` through #189;
both runtime/test blobs matched their donors at recovery. Their owner closure and unchanged
heads support C. These checks were source/history reviews, not newly executed test claims.

Prior E/F dispositions for #248's private scan journal and P0 Worker B's refund lifecycle,
and the explicit beyond-beta timestamp deferral #383/#587/#609, remain. All ten stopped
streams and all 34 frozen archive refs remain preserved. Existing local work remains intact.
No further unowned feature was established in this bounded refresh; the 61 mechanical
residuals are not an exhaustive semantic clearance. Continue only from a proven eligible
unit after F3 qualification, or leave the precise blocked/owned/deferred checkpoint.

## P14 F3 integration and complete residual record — 2026-11-27 UTC

**Completed and merged:** [F3 #749](https://github.com/djshellshoxxx/GhostPay/pull/749),
source `7a8e88d7083905013d0af310c845ba0c5f352dcb`, merge
`7d29d39be5240762de6df2aefc7316f4bd460d60`. The actual merge and current-main synthetic
merge match the qualified tree `3522dec7b56b44f217b02781b4e7d21fa66d983c`.
All 39 candidate checks completed (36 success, 3 expected publication-only skips), and
all five workflow groups succeeded. F2 and F4 resulting-main checks completed with 41 and
32 successes respectively. **F3 resulting-main checks: all 32 successful on `7d29d39be5240762de6df2aefc7316f4bd460d60`.**

[All 61 residual dispositions](consolidation/branch-completion-20261127/closed-residual-dispositions.json)
are now recorded against main `6b323a99df1238cb5ebe7248528cc7bce5140e80`, with an
explicit post-F3 integration revalidation: **42 C, 14 D, 2 E, 3 F; no A/B unit established**.
Each retains source branch/PR/SHA, merge bases, behavioral evidence and successor/owner pins.
These were source/history/discussion reviews, not fresh runtime qualification. C for an
intended PR change does not erase inherited private-scan, signer-pin, offline-draft or
explicitly deferred timestamp obligations.

| Useful unique residual | Specific blocker and next action |
| --- | --- |
| #590 `f01c69d277c39c76fd3077103c43cc38f7f9c736` | Receipt binding is represented; offline/drafts remain with #604 -> #717/#728 |
| #655 `1dcd5a25130b9db6afc4d224c619cd4dbcf0307c` | Private-checkpoint fixture requires #248's owned persistence/lifecycle, head `18b367457103fb1731a5b4ef5c51faa37a010e47` |
| #652 `724afdcf557178d8b78d841b681f50e99d41935f` and #630 `c484f833560aef8e8c798a71228d92e10fe5a877` | Duplicate signer-pin fixture corrections require the absent feature owned by #243, head `276aed60f19671cc6fa551be616b61041cb45b50` |
| #589 `697cb7314c323b574bfbb1f102244265046dd93a` | Runtime is represented; two-case Permit/approval disclosure browser qualification remains with #632 `0036fe1656579e0e9551bb9ae07cc63d802fb667`, test blob `51ce4023c64b008f9bb60f23dcf769791d5cf56c` |

#80's overbroad journal guard is deliberately rejected/superseded; a future journal-version/
migration decision is required. #616/#617 retain shared-core C dispositions while their
stopped mixed-product portions remain D. Existing journal/refund/offline ownership,
timestamp deferral, all ten stopped streams and all 34 frozen refs remain intact.

Fully paginated metadata refresh: 842 remote heads, 156 open PRs, 582 closed PRs including
244 closed-unmerged. This historical snapshot predates the documentation branch and F3
merge. It is not a claim that the repository's entire semantic obligation queue is empty.

Independent native review of owned draft #748 at `5b75ee82ecabc1c82434e0030a7417e0454e1b17`
passed 135 package tests and typecheck/lint/build; the pre-existing checksum-warning loss
remains separately recorded in [the review](https://github.com/djshellshoxxx/GhostPay/pull/748#issuecomment-7210306424).
The current owner retains its branch, draft status, browser/hosted gates and integration.

F3 resulting-main verification is complete. Next qualify and integrate this documentation
checkpoint, verify its resulting main, and explicitly release the valid integration lease.
The associated PR records final exact heads, checks and lock release. Broader WebKit CSP and
unexecuted physical-device, external-
wallet and live-Tor qualification remain open.
