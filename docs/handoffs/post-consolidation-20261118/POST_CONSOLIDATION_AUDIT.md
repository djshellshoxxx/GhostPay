# Post-consolidation audit

> Produced by audit Team A; coordinator corrections applied 2026-11-18 (shallow-clone census correction, PR #203 head advance to `71abc7e5`, final Mythril job result). Classification legend: COMPLETED · PARTIAL · NOT STARTED · BLOCKED · SUPERSEDED · UNVERIFIABLE.

Audit date 2026-11-18. Read-only. Tags: VERIFIED (command/code at SHA) | INFERRED | UNVERIFIED.

> **After this snapshot (H1, 07:10Z):** PR #203 was merged at 06:56:49Z (`main` = `5467c158`, tree == `71abc7e5`), so A21 is done; GitHub then auto-marked 26 contained PRs merged (A33 partly overtaken); #204 was re-integrated onto the consolidated tree as open PR #206 (`c487f0fe`, A26). Rows below describe the snapshot.

## 1 Scope & baseline SHAs

| Item | SHA / value |
|---|---|
| main (origin/main) | `cfaebeeae22f292cb0bb3074619b2603cb738367` (merge #189, 2026-11-16) |
| Unified #187 foundation | `beb525dddcca103de9eda447b55cddf7ee2f428c`, tree `36177d29` |
| Candidate product source (audit target) | `7a620ff19ecf4e43ec568896c34188f5b2dcd3fc` (2026-11-18T05:10:21Z), tree `594c9f6a`; 1,484 commits ahead of main, main is ancestor. Re-designated by the prior session as its CI-qualified head at 06:03Z |
| PR #203 head at package time | `71abc7e55c25d45b206ac47e5ddd24e072805710` (2026-11-18T06:03:41Z): documentation only over `7a620ff1` (PROMOTION_PACKET, REVIEW_FINDINGS incl. new R-18, VALIDATION_MATRIX, master ledger) |
| Ledger-pinned candidate | `278c9a27` (claims commit) |
| Last product-source commit per packet | `cfb482f9` tree `45815e10` |
| CI-qualified head | `d91ae16a` tree `1bc75573`. VERIFIED: `git diff cfb482f9 d91ae16a` outside docs/ is empty |
| Census time | 2026-11-18T02:42:35Z |
| PR #204 | `nodata/eager-babbage-0w6sf6` @ `2693b08e` |

Scope: reconstruct prior consolidation plan, classify delivery, delta after census. Nothing written outside `out/A/`.

## 2 Historical package availability

`GhostPay_Consolidation_Execution_Package.zip` not found on disk or in any ref. VERIFIED: tree has no tasks/plan.md, tasks/todo.md, decisions.md, evidence/*.json, feature_findings.md, pages_ci_findings.md, security_findings.md (`git ls-tree` grep empty). Only `docs/handoffs/agents/TEAM_J_UNIFIED.md` (+TEAM_J_*) in tree; it is the 2026-11-16 earlier campaign (review base `365a1c38`), not the 11-18 package.

| Missing artifact | Substitute evidence |
|---|---|
| tasks/plan.md | ACTIVE_WORK.md lane table (7 lanes: reimport, tagarchive, specs, cigates, echidna, mythril-expiry, mythril-factory) + RETIREMENT_PLAN "Phase E of the gameplan" + NEXT_PHASE_QUEUE. "Gameplan" itself is not in tree. |
| tasks/todo.md | CANDIDATE_INTEGRATION merge sequence; REVIEW_FINDINGS R-01..R-17, FR-*; PROMOTION_PACKET blockers/next actions |
| decisions.md | CANDIDATE_INTEGRATION "Decisions taken during integration"; spec 18 "owner-approved next-phase portability scope" |
| evidence/branch_census.json | BRANCH_DISPOSITION_LEDGER (215-ref table) + the full-history census `evidence/census/branch_census_current.json`. Ledger-named data files (`branch_census_20261118.json/.tsv`, `census_20261118.py`, `refs_now.tsv`, `census_final_addendum.json`) NOT in tree |
| outstanding_graph.json | RETIREMENT_PLAN + ledger category sections (49 outstanding refs) |
| open_prs_snapshot.json | ledger PR metadata line (202 PRs: 145 open/25 merged/32 closed); `evidence/prs/open_prs.json` (first 100 open only) |
| feature_/pages_ci_/security_findings.md | REVIEW_FINDINGS, VALIDATION_MATRIX (CI table by head), PROMOTION_PACKET analyzer table |
| team_j_unified.md | `docs/handoffs/agents/TEAM_J_UNIFIED.md` present (different date) |

## 3 Prior campaign outcome summary

Delivered: single candidate branch (#203) = #187 + main + Pages #192,#194-#200 + #201/#202 + specs #190/#191 + scanner fix + release gate + Mythril dispositions (11 records, docs+tests only) + Echidna harness fix + TagArchive port + ContextHelp/SellerKeys fixes. Not delivered: promotion to main, retirement of refs/PRs, Mythril green, branch protection, any spec 18 implementation, any deployment. Claimed result "consolidated candidate with named blockers": matches repo state. No source of contracts changed (`packages/contracts/{src,lib,script}` diff vs `beb525dd` empty, VERIFIED; `.gas-snapshot` +67/-0).

Owner leads check: "~214 refs" = 214 at 11-17 census, 215 at ledger, 217 remote heads now. "#192-#201 Pages" = #192,#194-#200 merged by `d39e304a`, #201/#202 by `2f47786a`/`84b4e605`, #193 ported not merged, #178 ancestor. #187 contained. #190 `16bc61fa`, #191 `e05044d4` contained. #193 regression ported (adapted).

## 4 Task classification table

34 tasks: 16 COMPLETED, 3 PARTIAL, 9 NOT STARTED, 4 BLOCKED, 1 SUPERSEDED, 1 UNVERIFIABLE. Same data in `consolidation_tasks.json`.

Ancestry check (VERIFIED, `merge-base --is-ancestor <head> 7a620ff1`): #187 beb525dd, #190 16bc61fa, #191 e05044d4, #192 dd4a7eb4, #194 c15833bc, #195 12e18931, #196 120dcd7f, #197 68993c66, #198 9732adb9, #199 b570d4bb, #200 23cc6db4, #201 2fb89ff5, #202 30cc4560, #178 cf5ad81c: all ANCESTOR. #193 `8aed22ad`: not ancestor, cherry '+' (ported by adaptation). #204: not ancestor.

| ID | Task | Source doc | Class | Commits | Evidence / before to after |
|---|---|---|---|---|---|
| A01 | Use unified PR #187 as foundation of candidate | CANDIDATE_INTEGRATION.md; PROMOTION_PACKET.md | COMPLETED | `beb525dd` | VERIFIED: #187 head beb525dd is ancestor of 7a620ff1 (merge-base --is-ancestor). beb525dd tree 36177d29 confirmed. Before/after: before: 3 disjoint stacks (main, #187, Pages). after: single branch, main fast-forwardable. |
| A02 | Merge main ancestry (#188,#189) without source change | CANDIDATE_INTEGRATION.md row f5e10f84 | COMPLETED | `f5e10f84` | VERIFIED: f5e10f84 tree 36177d29 == beb525dd tree; parents beb525dd+cfaebeea; main is ancestor of 7a620ff1 (1,484 commits ahead, was 1,482 at d91ae16a). Before/after: History reconciliation only. |
| A03 | Merge Pages lineage #192,#194-#200 | CANDIDATE_INTEGRATION.md row d39e304a | COMPLETED | `d39e304a`, `23cc6db4` | VERIFIED: d39e304a parents f5e10f84+23cc6db4; merge-base f6728033..23cc6db4 = 16 commits, 10 files (matches claim). Heads #192,#194-#200 and #178 all ancestors of 7a620ff1. Before/after: Conflicts Common.tsx / manifest.test.ts resolved per doc (not re-diffed line by line: INFERRED from reviewer claim R-05). |
| A04 | Integrate #201 (same-view focus) and #202 (reimport control) and diagnose e2e timeout | CANDIDATE_INTEGRATION.md rows 84b4e605; REVIEW_FINDINGS R-02,R-04 | COMPLETED | `2f47786a`, `84b4e605`, `af32d7f7`, `2fb89ff5`, `30cc4560` | VERIFIED ancestry #201 2fb89ff5, #202 30cc4560. CI e2e full 78 pass/1 skip, lean 66/3 on d91ae16a (run 44231986652, per packet; run confirmed success in Actions list). Before/after: before: #201 CI 44201642137 and #202 CI 44217528448 e2e failures. after: green on candidate. Root-cause claim (pointerdown lost click) UNVERIFIED by me (no browser run). |
| A05 | Fix bundle scanner end-tag gap (R-01, CodeQL js/bad-tag-filter) | REVIEW_FINDINGS R-01; VALIDATION_MATRIX | COMPLETED | `b441cc64`, `5ddb042a` | VERIFIED apps/web/scripts/scan-bundle.mjs:157-172 pairs <script start with end-tag regex /<\/script(?=[\s/>])[^>]*>/ and reports 'unterminated <script>'; scanBundle.test.ts changed. Before/after: before: matched </script> only. after: HTML-conformant end tag + unterminated report. |
| A06 | Integrate spec PR #190 (spec 18 / req 3q) | PROMOTION_PACKET; RETIREMENT_PLAN | COMPLETED | `1b214aa8`, `16bc61fa`, `ab78c021`, `b20e1c98` | VERIFIED: #190 head 16bc61fa ancestor; docs/specs/18-stealth-keypair-export.md present, 'single canonical specification of requirement 3q', owner-approved, before beta exit. Before/after: Spec only; implementation = next phase K01-K06. |
| A07 | Integrate privacy spec PR #191 (5a-5l) and correct 5k status | PROMOTION_PACKET; CANDIDATE_INTEGRATION b20e1c98 | COMPLETED | `6c6e88df`, `e05044d4`, `ab78c021` | VERIFIED: #191 head e05044d4 ancestor; docs/future/privacy-architecture/ has 5a..5l + README (12 files); README says 5k not future-only, spec 18 canonical, counted once.  |
| A08 | Port regression PR #193 (TagArchive blocked click) with cleanup | RETIREMENT_PLAN; CANDIDATE_INTEGRATION 0dda9ca1 | COMPLETED | `b3e4051e`, `0dda9ca1`, `8aed22ad` | VERIFIED: #193 head 8aed22ad NOT ancestor, git cherry '+' (not patch-equivalent) - by design adapted port. TagArchive.tsx:249 uses downloadBlob; Common.tsx:95 downloadBlob; TagArchive.test.tsx:56 describe blocked cleanup; Common.test.tsx:122 throw test. Before/after: Product fix + stronger test; #193 original only added 28 test lines. Retirement plan 'finally path' implemented via helper (INFERRED). |
| A09 | Make release.yml require source-matched Echidna+Mythril on tagged commit (R-06) | REVIEW_FINDINGS R-06; CANDIDATE_INTEGRATION 15c302cd | COMPLETED | `05a4c2fc`, `15c302cd`, `ffa7cb05` | VERIFIED release.yml:97-99 contract-analysis needs: verify, uses ./.github/workflows/contract-analysis.yml; build needs [verify, contract-analysis] :105; download evidence contract-analysis-{echidna,mythril}-${{github.sha}} :151-155; jq gate :157-170 requires requestedCommit==GITHUB_SHA, checkoutCommit==HEAD, outcome success, exit 0. contract-analysis.yml:13 workflow_call, :22 cancel only on pull_request. Before/after: Static only. Never executed on real tag (UNVERIFIABLE, see A10). Note: gate can never pass today because Mythril is red by design. |
| A10 | Exercise release gate on a real signed tag run | VALIDATION_MATRIX 'Not run' | NOT STARTED | - | Packet/matrix state not run; no v* tag in refs (not exhaustively checked). Before/after: Needs owner-signed tag, trust root empty by design. |
| A11 | Mythril SWC-116 x3 individual dispositions (R-08) | REVIEW_FINDINGS R-08; CANDIDATE_INTEGRATION | COMPLETED | `d4171c7b`, `1fa4179f`, `3f10fcaf` | VERIFIED files docs/audits/mythril-14290880802-expiry-dispositions.md (206 lines) and packages/contracts/test/MythrilExpiryDispositions.t.sol present. Test pass counts (31) UNVERIFIED (no forge here). Before/after: Disposition = documentation + tests; no suppression. |
| A12 | Mythril PolicyAccountFactory x8 dispositions (R-10) | REVIEW_FINDINGS R-10 | COMPLETED | `2d54ab60`, `afbce0a6`, `1e1121b3` | VERIFIED docs/audits/mythril-14290880802-factory-dispositions.md (322 lines), MythrilFactoryDispositions.t.sol present; docs/audits/26-contract-security-review-2026-11.md modified (M-03 partially closed). 33 tests UNVERIFIED (no forge).  |
| A13 | Make Mythril gate green / approve per-finding disposition mechanism | PROMOTION_PACKET blocker 2 | BLOCKED | - | Mythril on d91ae16a failure, 10 records (run 44231986631). On 7a620ff1 Mythril job 134593129954 concluded failure (exactly the 11 dispositioned records per PROMOTION_PACKET @71abc7e5). Before/after: Owner decision: finding-specific source-matched disposition or keep releases blocked. |
| A14 | Echidna exec_native/exec_token canaries reachable within 300k budget (R-12) | REVIEW_FINDINGS R-12 | COMPLETED | `292b15b3`, `81aa5e68`, `cc9a8d74`, `c0878314` | VERIFIED harness change: EchidnaPolicy.sol +35/-3 , EchidnaPolicyReachability.t.sol +216; contract src/lib/script diff beb525dd..7a620ff1 empty. CI: Echidna success on d91ae16a (44231986631) and on 7a620ff1 (run 44242366379, job echidna 134593129480 success). Before/after: before: Echidna red 43981233671 / 44226410225 (canary). after: green x2. |
| A15 | Contextual-help blur deferral (FR-M1) + hover target | REVIEW_FINDINGS FR-M1; CANDIDATE_INTEGRATION | COMPLETED | `4a3d47d8`, `86b6e9e5`, `af32d7f7` | VERIFIED files changed ContextHelp.tsx/.test.tsx, app.css, contextual-help.spec.ts. Behavior not re-run.  |
| A16 | Blocked keystore download no longer leaves form busy (FR-L3) | REVIEW_FINDINGS FR-L3 | COMPLETED | `cfb482f9`, `7a620ff1` | VERIFIED SellerKeys.tsx:228-236 try/catch around downloadText, setBusy(false), fail(error), backup unrecorded. Test later hardened in 7a620ff1 after CI flake (run 44239860965 failed on ceea9fdd). Before/after: Flake fix is test-only but not docs-only. |
| A17 | Audit-report mode test aligned (R-13) | REVIEW_FINDINGS R-13 | COMPLETED | `bbd24cd0` | VERIFIED scripts/tests/audit-report-paths.test.mjs in diff; execution under umask UNVERIFIED.  |
| A18 | Retain six superseded historical refs (R-14: #151,#39,#40,#44,#150,#193) | REVIEW_FINDINGS R-14; RETIREMENT_PLAN | COMPLETED | `bbd24cd0` | Doc-level; openai-agents.yml absent in candidate (VERIFIED). Other five supersession claims not re-derived. Before/after: Mostly INFERRED/UNVERIFIED beyond spot checks. |
| A19 | Run branch census, produce disposition ledger (215 refs) + retirement plan | BRANCH_DISPOSITION_LEDGER; RETIREMENT_PLAN | PARTIAL | `d91ae16a`, `57e9ada6` | Ledger table has 215 refs; all 215 exist in current origin refs (VERIFIED); 3 moved since (see sec 5). Referenced machine data (branch_census_20261118.json, census_20261118.py, refs_now.tsv, census_final_addendum.json) NOT in tree. Before/after: Ledger counts not reproducible from tree artifacts; my mechanical census differs by 2-3 refs. |
| A20 | Execute retirement plan (close PRs, delete/archive branches) | RETIREMENT_PLAN | NOT STARTED | - | Explicitly not done; no branch lost (all 215 ledger refs still present). Before/after: Needs owner approval + promotion first. |
| A21 | Promote candidate to main (mark #203 ready, merge no squash) | PROMOTION_PACKET next action | NOT STARTED | - | main still cfaebeea; #203 draft. Before/after: Blocked on protection + owner. |
| A22 | Configure branch protection / tag ruleset / env reviewers (R-07) | REVIEW_FINDINGS R-07 | BLOCKED | - | Owner action; cannot be read by this audit (no admin API). Before/after: UNVERIFIABLE current state. |
| A23 | Fee-token freeze residual decision (R-11/N1) | REVIEW_FINDINGS R-11 | BLOCKED | `1e1121b3` | Docs corrected (audit 26 'Partially closed'); decision open. Before/after: Owner, pre-scheme-2 deployment. |
| A24 | L2 sequencer cancel-window docs/UI (R-09) | REVIEW_FINDINGS R-09 | PARTIAL | `3f10fcaf` | Docs in docs/developer/security-model.md; UI guidance backlog.  |
| A25 | Private security inventories CodeQL/Dependabot/secret scan (R-16) | REVIEW_FINDINGS R-16 | BLOCKED | - | Access 403 per doc; not re-tested. Before/after: Owner access. |
| A26 | Coordinate with PR #204 (agent tooling) (R-17) | CANDIDATE_INTEGRATION decisions; REVIEW_FINDINGS R-17 | PARTIAL | - | Conflict VERIFIED: merge-tree 7a620ff1+2693b08e rc=1, CONFLICT ci.yml (content) + CLAUDE.md (add/add). Not integrated, not resolved. Before/after: Resolution trivial for ci.yml (one line). |
| A27 | Spec 18 wording decisions (R-15) before K03 | REVIEW_FINDINGS R-15; NEXT_PHASE_QUEUE | NOT STARTED | - | Listed in queue only.  |
| A28 | R-03 help hover-leave shift; R-04 paste-submit focus test | REVIEW_FINDINGS R-03,R-04 | NOT STARTED | - | Backlog by doc.  |
| A29 | Implement spec 18 key portability K01-K06 + KC | NEXT_PHASE_QUEUE | NOT STARTED | - | Queue states nothing implemented; no keystore-portable v2 in diff (VERIFIED: no new core crypto files in 278c9a27..7a620ff1 file list). Before/after: Req 3q constraint; before beta exit. |
| A30 | Sepolia-first static beta B01-B06 | NEXT_PHASE_QUEUE; PROMOTION_PACKET blocker 5 | NOT STARTED | - | 73 unverified release cells per doc (not re-run). Before/after: Owner broadcast needed. |
| A31 | Decision-gated D01-D07 | NEXT_PHASE_QUEUE | NOT STARTED | - |   |
| A32 | Final independent combined review (candidate 1e1121b3) no Critical/High | REVIEW_FINDINGS | UNVERIFIABLE | `1e1121b3` | AI review report only; cannot re-perform. Several reviewer-run claims (lean module set 316 ids, 2,731 tests) not reproducible here.  |
| A33 | Retire/close #187 and Pages/spec PRs with comments | RETIREMENT_PLAN | NOT STARTED | - | #187,#190,#191,#192,#194-#202 all still open (open_prs.json). Before/after: After promotion. |
| A34 | Historical TEAM_J (2026-11-16) review/branch snapshot dispositions | TEAM_J_UNIFIED.md | SUPERSEDED | `4b107609` | Earlier campaign; 200-ref snapshot superseded by 215/217 ledger. Its stale openai-agents sentence corrected in bbd24cd0. Before/after: Source of 'unified' lineage. |

## 5 Post-consolidation changes

### 5a Commits after pins (VERIFIED `git log`)
`278c9a27..7a620ff1` = 48 commits (includes merged side branches). `d91ae16a..7a620ff1` = 2:

| Commit | Time | Files | Class |
|---|---|---|---|
| `ceea9fdd` Record final CI evidence | 04:48:21Z | GHOSTPAY_MASTER_COMPLETION_LEDGER.md, PROMOTION_PACKET.md (+82), REVIEW_FINDINGS.md, VALIDATION_MATRIX.md | docs-only |
| `7a620ff1` Make blocked keystore download test independent of earlier tests' timers | 05:10:21Z | `apps/web/src/views/SellerKeys.test.tsx` (+4/-2) | TEST change, not docs. No product source change. Tree `594c9f6a` != `1bc75573` |

Between `278c9a27` and `cfb482f9`: product commits `b441cc64 5ddb042a 15c302cd ffa7cb05 1fa4179f 113160be 0dda9ca1 b3e4051e afbce0a6 89d10ae8 84b4e605 af32d7f7 86b6e9e5 bbd24cd0 81aa5e68 292b15b3 cc9a8d74 4a3d47d8 cfb482f9` plus merges #190/#191/#201/#202 (non-doc paths: workflows x3, web components/views/e2e, scan-bundle.mjs, contracts tests/.gas-snapshot/run-mythril.sh, audit test). `d91ae16a` and `cfb482f9` differ only under docs/ (VERIFIED, empty non-docs diff).

### 5b Refs after census (compare ledger table SHAs vs `git for-each-ref refs/remotes/origin`)
All 215 ledger refs still exist; none deleted. Moved (VERIFIED; times converted to UTC, all after 02:42:35Z):

| Ref | Ledger SHA | Addendum SHA | Now | Tip time |
|---|---|---|---|---|
| chatgpt/zero-codex/audit-pages-release-20261112 (#139) | cf7d7083 | 7a382b5d | `a0d81ef9` (rot. 182) | 04:48:25Z |
| chatgpt/zero-codex/docs-pages-scope-20261112 (#140) | 68aa3e6b | 20f70a2d | `58a47006` | 04:49:06Z |
| chatgpt/zero-codex/pages-owner-ci-handoff-20261114 (#153) | 3f97a9eb | af2d1ced | `ccdc7954` | 04:49:45Z |

Each gained 2 more docs-only commits (rotations 181/182) beyond even the ledger addendum SHAs. Files: CHATGPT_RANDOM_AUDIT_LEDGER.md; CHATGPT_DOCS_MAINTENANCE_LATEST.md / CHATGPT_ZERO_CODEX_LATEST.md. The addendum's "none moved besides 3" is therefore stale: addendum SHAs `7a382b5d 20f70a2d af2d1ced` are no longer heads.
New heads vs 215: `nodata/eager-babbage-0w6sf6` (#204, committed 02:31:26Z, before census but unfetched), `nodata/wizardly-allen-qwol6u` (#203), plus local-only `nodata/zealous-hopper-lr0nxe` (== main). Also `nodata/jolly-rubin-u4zd45` f88aaf2f (2026-11-12) is in the ledger (not new).
Mechanical ancestry (CORRECTED by the coordinator): the first census ran in a **shallow clone** and undercounted ancestry; on full history 169 of 217 remote heads are contained in `7a620ff1` (168 strict ancestors plus `nodata/wizardly-allen-qwol6u`, whose tip is now the docs-only descendant `71abc7e5`) and 48 are not. See BRANCH_RECOVERY_MATRIX.md §0.

The three zero-codex documentation heads moved again during this audit (rotation 183, 2026-11-18 ~05:38Z): #139 `7af4b5ff`, #140 `400e20f1`, #153 `30f1604d`. The ChatGPT rotation automation is an active writer; any census is a snapshot.

### 5c PRs updated after census (open_prs.json, first 100 open only)
#139 04:48:27Z, #140 04:49:08Z, #153 04:49:47Z (head pushes above); #202 02:42:38Z (3s after census, head unchanged 30cc4560 = metadata/comment); #203 05:10:24Z (7a620ff1); #204 02:48:14Z (head unchanged 2693b08e; comment/metadata). #187 #190 #191 #192 #201 unchanged since before census. PRs beyond the first 100 open and closed/merged PRs not re-queried: UNVERIFIED.

### 5d PR #204 vs #203
`git diff --stat cfaebee 2693b08e`: 11 files, +932/-1: `.claude/skills/ghostpay-{affected-checks,package-map,security-invariants}/*` (5), `CLAUDE.md` +47, `.github/workflows/ci.yml` (1 line), `scripts/agent/{affected,package-map,workspaces}.mjs` + `workspaces.test.mjs`. 2 commits: `5a2dc7c3`, `2693b08e`.
`git merge-tree --write-tree --name-only 7a620ff1 2693b08e` rc=1, conflicts: `.github/workflows/ci.yml` (content), `CLAUDE.md` (add/add; main has no CLAUDE.md, candidate +5 lines from `89d5caf9`, #204 adds 47). Overlap of file lists: exactly those 2. ci.yml semantic: #204 appends `scripts/agent/*.test.mjs` to the shard-0 `node --test` line; #203 rewrote ci.yml heavily (+181 vs main; job split ts-typecheck etc, files-API completeness guard), so the line must be re-applied by hand. #204 scripts are new files, no conflict. Whichever merges second resolves; #204 adds tooling only (no product, no custody surface: INFERRED from file list, content not reviewed).

### 5e main
VERIFIED unchanged: origin/main = `cfaebeea`; every main workflow run in Actions list has head_sha `cfaebeea` or older. Latest main runs: CI push 43982699355 success (2026-11-16); scheduled: Integration 44096513067 success, Parallel Research 44233197614 success (2026-11-18), Nightly 44078371383 **failure** (2026-11-17), API-Funded Cloud 44141659077 failure, openai-agents push runs (797) failure. No post-11-16 push to main.

### 5f CI on candidate (Actions API)
| Head | Workflow (run) | Conclusion |
|---|---|---|
| `7a620ff1` | CI 44242366118 | success |
| | Pages 44242366052, Beta acceptance 44242366040, Integration 44242366032, Hosting kit 44242366075, CLI operator 44242366236, Parallel Research 44242366048 | success |
| | Contract analysis 44242366379 | echidna job 134593129480 success; mythril job 134593129954 **failure** (completed after first query; per the updated PROMOTION_PACKET at `71abc7e5` it reports exactly the 11 dispositioned records — expected by design) |
| `ceea9fdd` | CI 44239860965 | **failure** (flaky SellerKeys test per 7a620ff1 message); Contract analysis 44239860910 cancelled; others success |
| `d91ae16a` | CI 44231986652 success; Contract analysis 44231986631 failure (Mythril); rest success | matches packet |
CodeQL on 7a620ff1 not checked: UNVERIFIED.

## 6 Discrepancies

1. PROMOTION_PACKET (and ledger addendum): "Later commits: documentation only". FALSE for `7a620ff1` (changes `SellerKeys.test.tsx`). Test-only, no product change, but packet's verify command `git diff --name-only d91ae16a <head>` now lists a non-doc file.
2. No doc records CI run 44239860965 failing on `ceea9fdd` (only the `7a620ff1` commit message does). VALIDATION_MATRIX/PACKET list only d91ae16a as qualified; head `7a620ff1` has CI green but packet not updated.
3. Packet "1,482 commits ahead": now 1,484.
4. Ledger names companion data files "in the same directory" (`branch_census_20261118.json/.tsv`, `census_20261118.py`, `refs_now.tsv`, `census_final_addendum.json`): absent from tree. Counts unreproducible from tree.
5. Ledger addendum counts 169 contained / 14 PE / 34 need-disposition at `57e9ada6`. RESOLVED: the 166–167 figure came from a shallow clone; the full-history census reproduces 169 contained (BRANCH_RECOVERY_MATRIX.md §0, §2). The ledger was right.
6. Ledger/addendum "1 census head moved" and later "3 moved to 7a382b5d, 20f70a2d, af2d1ced": those heads moved again to `a0d81ef9 58a47006 ccdc7954` after census; retirement precondition 2 ("fresh census confirms SHAs unchanged") already violated for these three.
7. Ledger said #204 "not fetched locally"; it is now at `refs/remotes/origin/nodata/eager-babbage-0w6sf6`. Ledger's 215-ref population excludes it and #203.
8. RETIREMENT_PLAN text still lists #190/#191/#201/#202/#193 under "Not proposed for retirement / integrate" while they are now ancestors (plan self-notes only for #190/#191 at tip `0dda9ca1`; stale otherwise). #193 head is not ancestor and never will be.
9. Gas-snapshot counts: matrix says 28 + 31 + (echidna 7?) additions; actual `.gas-snapshot` diff vs `beb525dd` is +67/-0 (28+31=59, +8 others: factory test's own entries/echidna). Consistent with "additions only", counts loosely stated.
10. `docs/consolidation/` and the ledger describe "Pages #192-#201"; #193 is excluded and #178 included, so the owner lead range is imprecise.
11. NEXT_PHASE_QUEUE B03 itself notes README references nonexistent `npm run validate:deployments` script (doc drift, pre-existing; not rechecked).
12. VALIDATION_MATRIX local rows (e.g. 2,731 passed, 1 failed scannerCore timeout) vs CI: only CI passing; local failure explained by load: UNVERIFIED.

## 7 Unverifiable items

- Whole execution package (plan/todo/decisions/evidence JSON): absent; original task list is reconstructed, not authoritative.
- Forge/Echidna/Mythril test counts (31/33/7 tests, 16+6 and 8+1 mutants, 445 snapshot tests): no toolchain here.
- Root cause of the #201/#202 lost click and browser regressions: no browser re-run (could run Playwright; not done).
- Branch protection, rulesets, environment reviewers, CodeQL/Dependabot/secret-scan inventories: no admin API access.
- Release gate behavior on a real tag: never executed.
- Mythril per-record output on `7a620ff1`: job 134593129954 concluded failure; the records are not readable here (artifact 403); per PROMOTION_PACKET @`71abc7e5` it reports exactly the 11 dispositioned records.
- Independent AI reviews (R-05, final combined review): reports only.
- PRs outside first 100 open, closed/merged PR changes after census.
- Whether Mythril R8 (SWC-113 PC 1781) is timeout dependent.
- Ledger class counts (see discrepancy 5).

## 8 Implications for next phase

1. Re-baseline on `7a620ff1`, not `d91ae16a`; treat `ceea9fdd` failure as a closed flake (fixed by test change) and cite CI 44242366118.
2. Re-run census before any retirement: 3 zero-codex docs refs moved, #203/#204 new. These stay archive-as-evidence; zero-codex automation keeps pushing, so the ledger needs a "refs at time T" caveat.
3. Resolve #204 vs #203 (2 files) before or immediately after promotion; ci.yml line re-apply is trivial, CLAUDE.md needs a content merge.
4. Promotion: merge/ff #203 (not squash) is mechanically safe (main ancestor). Owner must first do branch protection; Mythril stays red so releases stay blocked.
5. No spec 18 implementation exists: K01-K06 all NOT STARTED; req 3q (key portability) is the top engineering gap against mandatory constraint 4. Resolve R-15 wording first (clipboard/telemetry/lean boundary/seller step-up).
6. Keep constraints: nothing in the delta adds custody, network or telemetry surface (INFERRED from file list: workflows, web UI tests/fixes, scanner, contract tests only).
7. Missing package means any future audit should commit its plan/decisions into the tree.
