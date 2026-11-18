# GhostPay branch recovery matrix

Candidate: `nodata/wizardly-allen-qwol6u` @ `7a620ff19ecf4e43ec568896c34188f5b2dcd3fc` (PR #203 draft). Main `cfaebeea`. Date 2026-11-18. Audit only; nothing merged, deleted, pushed or commented. "Eligible for retirement after owner approval" is not a deletion recommendation.

Machine-readable twin: `branch_recovery_matrix.json` (234 entries). Packaged evidence: `evidence/teams/C/census_full.json`, `evidence/teams/C/patchcheck.json` and the coordinator's full-history census `evidence/census/branch_census_current.json`. Not packaged (regenerable, large): `coverage.json`, `cand_objects.txt`, `blobstat.txt`.

> **Coordinator notes (2026-11-18 ~06:30Z).** PR #203's head advanced from `7a620ff1` to `71abc7e5` during the audit (documentation only); every disposition below is against product source `7a620ff1`. The audit package itself is published on `nodata/zealous-hopper-lr0nxe` (based on `main`, adds only `docs/handoffs/post-consolidation-20261118/`); that branch is not a recovery candidate. The ChatGPT `chatgpt/zero-codex/*` rotation keeps pushing documentation-only commits; re-run the census before acting on any class D/E row.

## 0. Critical correction to the shared census

The first shared census (since replaced: the packaged `evidence/census/branch_census_current.json` is the coordinator's full-history re-run) was computed in a **shallow** checkout (`.git/shallow` = `704ca6d7`, `f43df60b`). That cut candidate history and made `claude/laughing-bardeen-4t20ys` (e96cee1a, #17), `claude/remote-extensions-10` (698404ca, #16) and refs `pr/16`, `pr/17` look non-ancestors (104 and 17 "unique" commits, 230 and 50 "differing files"). VERIFIED: in a full-history copy (`git fetch --unshallow` into a private copy `out/C/full.git`, shared repo untouched) both are ancestors of `7a620ff1`. Corrected census (`census_full.json`, rerun of `branch_census.py`): **169 ancestors / 48 non-ancestors** among 217 heads (not 167/50). This matches the prior ledger's final addendum (169 contained). Other teams using the old census for these two refs should re-derive. The same full fetch also moved three docs heads (section 5).

## 1. Method (VERIFIED unless marked)

1. Population: 217 heads from `git ls-remote --heads origin` (live) plus 17 `refs/remotes/pr/*` refs whose SHA is not any live head tip (7 ancestors, 10 non-ancestors; 3 of those 10, `pr/139,140,153`, are stale PR refs of branches that advanced). `nodata/zealous-hopper-lr0nxe` was a local-only name (== main `cfaebeea`) at census time and is excluded; it was pushed at 06:56:55Z as this package's branch (PR #205) and is not a recovery candidate.
2. Ancestry: `git merge-base --is-ancestor <sha> 7a620ff1` on the full-history copy.
3. Non-ancestors: `git cherry` (patch-ID) for unique/equivalent commits; every unique commit tested with `git apply --check` (forward = applies clean, `-R` = already present, else conflict) against an index of `7a620ff1` (275 unique commits: 29 clean, 12 already present, 233 conflict, 1 root).
4. Content presence: per unique commit, added non-trivial lines found in the candidate version of the same file (`coverage.json`; imports/comments skipped). Heuristic (INFERRED), used only to rank, then confirmed by reading candidate code at cited lines.
5. Blob history: set of all object ids reachable from candidate (`cand_objects.txt`, 22,238 ids); per differing file test whether branch blob ever existed in candidate (`blobstat.txt`). Most differing files are branch-only blobs because files evolved; a "never" result alone is not value.
6. Executed checks on a private scratch worktree of `7a620ff1` (`node_modules` symlinked from the shared candidate; nothing in shared trees changed): #204 agent tests, seller-vault Chromium harness old vs branch variant.
7. Classes: A directly reusable; B partially reusable (selective); C superseded or integrated; D historical reference (not mergeable); E obsolete; F needs investigation.

## 2. Reconciled totals

| Class | Heads | PR-only refs | Total |
|---|---:|---:|---:|
| A | 1 | 0 | 1 |
| B | 5 | 1 | 6 |
| C | 197 | 8 | 205 |
| D | 12 | 2 | 14 |
| E | 1 | 6 | 7 |
| F | 1 | 0 | 1 |
| **Total** | **217** | **17** | **234** |

H1 note: 3 of the 17 PR-only entries (`pr/139` D, `pr/140` B, `pr/153` D) are not distinct refs — GitHub's `refs/pull/N/head` tracks each open PR's branch and these copies were fetched one rotation before the branch tips (verified 07:10Z: live `refs/pull/{139,140,153}/head` equal the branch tips). Distinct population at the snapshot: 231 (217 heads + 14 PR-only); distinct class B = 5, class D = 12.

Of class C: 169 heads are ancestors of the candidate; the remaining C heads are patch-equivalent (14, one deliberately reverted) or semantically superseded (14), each with cited candidate code. Ancestry proves history inclusion, not behaviour (prior ledger caveat stands; example: `fix/remediation-f95457fd-22ecf9` content was reverted in history).

Recovery-method totals (non-C entries): clean/cherry-pick with reconcile 1 (#204); selective file recovery 3 refs (qr-colors hunk, seller-vault harness script, optional audit ledger/gates docs); regenerate (dependabot) 3; none otherwise.
## 3. Class A / B / F detail

### `nodata/eager-babbage-0w6sf6` @ `2693b08e` (2026-11-18) class A
- **PRs:** #204 open
- **Purpose:** PR #204 agent tooling: CLAUDE.md guide, .claude/skills (package-map, affected-checks, security-invariants), scripts/agent/{affected,package-map,workspaces}.mjs + 12 node tests, 1-line ci.yml addition
- **Unique functionality:** New files absent from candidate; no product runtime code. Candidate has 5-line CLAUDE.md pointer + AGENTS.md only.
- **Features:** developer/agent workflow tooling (not product)
- **Tests:** scripts/agent/workspaces.test.mjs: ran on candidate tree in scratch worktree: 11/12 pass, 1 fail = PACKAGE_MAP.md stale (package-map.mjs --check exit 1; regeneration changes 22 lines)
- **Conflicts:** CLAUDE.md add/add; ci.yml shard line differs (candidate uses scripts/tests/*.test.mjs); new files apply clean (VERIFIED git apply --check conflicts only in the 2 commits via those 2 files); 2 unique patches vs 7a620ff1: clean=0 conflict=2 already-present=0
- **Architecture:** compatible: dev-only, no runtime/network; skills are static markdown
- **Security:** low; security-invariants digest must be re-verified against candidate SECURITY.md/ADRs before trusting (UNVERIFIED)
- **Recovery:** cherry-pick 5a2dc7c3 2693b08e, resolve CLAUDE.md (merge into existing pointer) + ci.yml hunk, then run node scripts/agent/package-map.mjs to regenerate map ; effort S (1-2h)
- **Disposition:** recover after #203 promotion decision; owner decides whether tooling is wanted; keep separate PR
- **Prior ledger:** not in prior ledger
- **Evidence:** git diff/apply-check 7a620ff1 vs 2693b08e; wt scratch run

### `chatgpt/zero-codex/docs-pages-scope-20261112` @ `400e20f1` (2026-11-17) class B
- **PRs:** #140 open (head branch; the `pr/140` entry below is the same PR fetched one rotation earlier)
- **Purpose:** ChatGPT zero-codex docs rotation chain: Pages wiki/README status narration, Verification-and-Release-Gates (+155 lines), CHATGPT_DOCS_MAINTENANCE_LATEST
- **Unique functionality:** Mostly time-stamped CI/status narration superseded by candidate promotion ledger. One accurate small fix: docs/design/qr-colors.md says only `secret` is never downgraded; code (qrKinds.test.ts:40-42) makes `bearer` also win over testnet/unsigned/unverified.
- **Features:** docs/wiki, QR trust-frame docs
- **Tests:** none (docs)
- **Conflicts:** 101 of 109 unique commits conflict (append-only rotation file); 8 apply clean; 109 unique patches vs 7a620ff1: clean=8 conflict=101 already-present=0
- **Architecture:** docs only; status text would contradict candidate PROMOTION_PACKET if merged
- **Security:** none; stale release claims are an integrity risk if merged blindly
- **Recovery:** selective file recovery: hunk of docs/design/qr-colors.md only; rest archive ; effort XS (15min) for hunk
- **Disposition:** extract qr-colors hunk; rest archive as evidence; eligible for retirement after owner approval
- **Prior ledger:** archive as evidence (Provenance/status docs)
- **Evidence:** git diff 7a620ff1 400e20f1 -- docs/design/qr-colors.md README.md docs/wiki; live head 400e20f1 (rotation 183 era) newer than ledger pin 68aa3e6b

### `dependabot/github_actions/actions-1850456dc8` @ `8f34d83c` (2026-11-16) class B
- **PRs:** #85 open
- **Purpose:** #85 actions group: foundry-toolchain 1.9.1->1.9.2, peter-evans/create-pull-request 7->8.x
- **Unique functionality:** foundry-toolchain 1.9.2 already pinned in candidate workflows (dba66c27...). Only create-pull-request 7.0.11 (22a90890..) -> 8.x remains; branch also carries old workflow bases (diff vs candidate 100+/507-).
- **Features:** dependencies/build
- **Tests:** n/a
- **Conflicts:** lockfile + 60+ package.json conflicts; 1 unique patches vs 7a620ff1: clean=0 conflict=1 already-present=0
- **Architecture:** n/a
- **Security:** supply-chain: pin exact, review changelog
- **Recovery:** regenerate (dependabot) ; effort S per group + CI
- **Disposition:** regenerate via Dependabot recreate on candidate; owner/maintenance lane decides per-package
- **Prior ledger:** maintenance/design backlog (Dependency maintenance)
- **Evidence:** patchcheck.json/coverage.json

### `dependabot/npm_and_yarn/npm-major-1ddf9439d6` @ `8ce1bb04` (2026-11-16) class B
- **PRs:** #87 open
- **Purpose:** #87 npm-major group (11): typescript 5.9.3->7.0.2, @types/node 22->26, @scure/base|bip32|bip39 1.x->2.4.0, hardhat 2.29->3.22, chai 4->6, jsdom 30->31 ...
- **Unique functionality:** Candidate already has chai 6.3.0; others still on old majors. Lockfile (69 files) is against outdated base.
- **Features:** dependencies/build
- **Tests:** n/a
- **Conflicts:** lockfile + 60+ package.json conflicts; 1 unique patches vs 7a620ff1: clean=0 conflict=1 already-present=0
- **Architecture:** n/a
- **Security:** supply-chain: @scure/* are crypto deps (core-crypto, key derivation); exact-pin + THIRD_PARTY policy applies
- **Recovery:** regenerate (dependabot) ; effort S per group + CI
- **Disposition:** regenerate on candidate base via Dependabot rebase/recreate; never merge old lockfile. Majors (@scure/*, typescript 7, hardhat 3) need individual review as they touch crypto/test toolchain
- **Prior ledger:** maintenance/design backlog (Dependency maintenance)
- **Evidence:** patchcheck.json/coverage.json

### `dependabot/npm_and_yarn/npm-minor-patch-9f9e7f3407` @ `7d1f0ae1` (2026-11-16) class B
- **PRs:** #176 open
- **Purpose:** #176 npm-minor-patch group (12): viem 2.57.7->.19, vitest 5.0.5->5.1.0, prettier, eslint, playwright 1.65, vite 8.3.8, etc.
- **Unique functionality:** Candidate partly ahead (eslint 10.15, @solana/kit 8.6.0, zama sdk 3.7.1) partly behind (viem 2.57.13, vitest 5.0.5, vite 8.3.5).
- **Features:** dependencies/build
- **Tests:** n/a
- **Conflicts:** lockfile + 60+ package.json conflicts; 1 unique patches vs 7a620ff1: clean=0 conflict=1 already-present=0
- **Architecture:** n/a
- **Security:** supply-chain: pin exact, review changelog
- **Recovery:** regenerate (dependabot) ; effort S per group + CI
- **Disposition:** regenerate via Dependabot recreate on candidate; owner/maintenance lane decides per-package
- **Prior ledger:** maintenance/design backlog (Dependency maintenance)
- **Evidence:** patchcheck.json/coverage.json

### `ghostpay-cloud-recovery-2026-10-26` @ `2ec98b23` (2026-10-28) class B
- **PRs:** none
- **Purpose:** Pre-rewrite recovery snapshot (checkpoint 71cd067d + 11 commits). Carrier of commit 57dcf7e8
- **Unique functionality:** Only unique residual: 57dcf7e8 adds R1-R3 isolated-browser-context seller-vault recovery harness (+156 lines) to apps/web/scripts/test-seller-vault-idb.mjs (import memory-only, explicit re-encrypted save, occupied-store refusal). All other commits evolved/present in candidate (added-line presence 85-95% excluding imports; locale parity 2256/2256 keys; Sweep pre-handoff test present at Sweep.test.tsx:315).
- **Features:** key portability / seller keystore recovery (spec 18, req 3q) test evidence
- **Tests:** VERIFIED: branch 57dcf7e8 version of the script run against candidate in scratch worktree with Chromium: exit 0, both R1-R3 and two-tab PASS lines; candidate version prints only the two-tab PASS. Script not wired in package.json (PR30_LEAN_STATUS.md:49).
- **Conflicts:** 57dcf7e8 conflicts as a patch (file evolved) but whole-file copy runs; no product code touched; 12 unique patches vs 7a620ff1: clean=2 conflict=10 already-present=0
- **Architecture:** compatible: loopback only, synthetic keys, no external egress asserted
- **Security:** positive: asserts no external egress and bounded import envelope
- **Recovery:** selective file recovery: apps/web/scripts/test-seller-vault-idb.mjs from 57dcf7e8 (wire into CI optionally) ; effort S (1-2h incl. CI wiring)
- **Disposition:** recover test script; remainder archive. Prior lane C3 (docs/handoffs/consolidation-2026-11-04/lanes/C3.md:87) also flagged this as optional test-only salvage
- **Prior ledger:** archive as evidence (Old recovery snapshot)
- **Evidence:** scratch run; coverage.json; patchcheck.json

### `pr/140` @ `58a47006` (2026-11-17) class B
- **PRs:** #140 open
- **Purpose:** ChatGPT zero-codex docs rotation chain: Pages wiki/README status narration, Verification-and-Release-Gates (+155 lines), CHATGPT_DOCS_MAINTENANCE_LATEST
- **Unique functionality:** Mostly time-stamped CI/status narration superseded by candidate promotion ledger. One accurate small fix: docs/design/qr-colors.md says only `secret` is never downgraded; code (qrKinds.test.ts:40-42) makes `bearer` also win over testnet/unsigned/unverified. STALE PR REF: PR head differs from live branch tip (branch advanced); see entry chatgpt/zero-codex/docs-pages-scope-20261112
- **Features:** docs/wiki, QR trust-frame docs
- **Tests:** none (docs)
- **Conflicts:** 100 of 108 unique commits conflict (append-only rotation file); 8 apply clean; 108 unique patches vs 7a620ff1: clean=8 conflict=100 already-present=0
- **Architecture:** docs only; status text would contradict candidate PROMOTION_PACKET if merged
- **Security:** none; stale release claims are an integrity risk if merged blindly
- **Recovery:** selective file recovery: hunk of docs/design/qr-colors.md only; rest archive ; effort XS (15min) for hunk
- **Disposition:** extract qr-colors hunk; rest archive as evidence; eligible for retirement after owner approval
- **Prior ledger:** PR ref (ledger maps PRs by head branch)
- **Evidence:** git diff 7a620ff1 400e20f1 -- docs/design/qr-colors.md README.md docs/wiki; live head 400e20f1 (rotation 183 era) newer than ledger pin 68aa3e6b

### `gh-pages` @ `cc8d0794` (2026-10-21) class F
- **PRs:** none
- **Purpose:** deployment branch: 3 commits of built site (2026-10-21), root commit, no merge base
- **Unique functionality:** Stale built output (help, why, privacy-options pages, neon overlay). Candidate pages.yml deploys via upload-pages-artifact/deploy-pages (pages.yml:126,233), so gh-pages should be unused IF Pages source = GitHub Actions. Repo Pages settings not readable via proxy (403): UNVERIFIED. If Pages still serves gh-pages, stale pre-rewrite build is public.
- **Features:** deployment/hosting
- **Tests:** n/a
- **Conflicts:** 3 unique patches vs 7a620ff1: clean=0 conflict=2 already-present=0
- **Architecture:** n/a
- **Security:** stale public build may misrepresent current state/CSP; verify what is served
- **Recovery:** none (regenerate from qualified candidate when publishing approved) ; effort n/a
- **Disposition:** owner: check Settings>Pages source; if Actions, retire after approval; never merge into source history
- **Prior ledger:** generated output (Generated publication)
- **Evidence:** patchcheck.json/coverage.json

## 4. Class D, E, C (compact)

### Class D historical reference

| Ref | SHA | PRs | uniq/equiv | Purpose | Why not recoverable / residual |
|---|---|---|---|---|---|
| `automation/ghostpay-parallel-four-agents-20261103` | 68dc5b50 | #52 | 6/0 | #52 four isolated API-funded QA agents workflow + scope/spend tests + docs | New workflow ghostpay-parallel-agents.yml (325 lines), test, spend-limit doc; absent in candidate (candidate has ghostpay-parallel-review.yml). Paid third-party API use from CI. |
| `automation/ghostpay-recurrent-backlog-20261103` | 5835736c | #51 | 3/0 | #51 twice-daily backlog Codex run + hardening of ghostpay-codex-cloud.yml | Candidate ghostpay-codex-cloud.yml already has stronger gate (same-repo, owner/bot author, independent current-head approval: lines 60-125, VERIFIED). Residual: scheduling cadence only. |
| `chatgpt/pages-release-gate-audit-20261114` | 2221a611 | #160 | 2/0 | #160 Pages release-gate inventory G1-G7 (docs/ai/PAGES_RELEASE_GATES_2026-11-14.md) + stale ACTIVE_WORK edit | gate table source-pinned to old #157/#158/#159; superseded by candidate ledgers |
| `chatgpt/zero-codex/audit-pages-release-20261112` | 7af4b5ff | #139 | 42/0 | #139 append-only randomized read-only Pages audit rotations 141-183 (docs/audits/CHATGPT_RANDOM_AUDIT_LEDGER.m | Each rotation: source-inspected only, tests not run, no reproduced defect. Audit-trail value only, no actionable finding sampled. Chain still advancing (live head 7af4b5ff = rotation 183, 05:38Z, after candidate commit). |
| `chatgpt/zero-codex/pages-owner-ci-handoff-20261114` | 30f1604d | #153 | 41/0 | #153 zero-codex handoff rotations (docs/handoffs/CHATGPT_ZERO_CODEX_LATEST.md) | Status narration/ownership claims; stale vs candidate PROMOTION_PACKET. Live head 30f1604d (rotation 183). |
| `checkpoint/ghostpay-source-reconciliation-20261101` | 243d98d6 | - | 2/0 | source reconciliation note 2026-11-01 | candidate has SOURCE_RECONCILIATION_2026-11-02.md; historical provenance only |
| `codex/ghostpay-recovered-lean-checkpoint-20261028` | 371d235c | - | 19/0 | Pre-rewrite recovery snapshot lineage (shared checkpoint 71cd067d, Oct 26-28) union of the above + 0f8c82ce do | Nothing unique beyond 57dcf7e8 harness (see ghostpay-cloud-recovery-2026-10-26) and design reference for vendored-archive SBOM normalization where noted. Reconciliation vault v2 (invoices/receipts) moved to packages/ux-vault porta |
| `codex/ghostpay-resume-20261028` | 75400888 | - | 1/0 | restart note CODEX_RESTART_2026-10-28.md | provenance only; candidate has docs/handoffs/RESTART.md |
| `codex/recovery-spec02-unqualified-20261116` | 8d6fd6df | - | 4/0 | UNQUALIFIED recovery archive of spec02 amount helper/test as .txt + unconfirmed patch | explicitly unqualified material; #182 implements the corrected helper (TEAM_J_UNIFIED) |
| `ghostpay-local-lean-boundary-20261027` | 020ba327 | - | 18/0 | Pre-rewrite recovery snapshot lineage (shared checkpoint 71cd067d, Oct 26-28) + lean entry/asset boundary (342 | Nothing unique beyond 57dcf7e8 harness (see ghostpay-cloud-recovery-2026-10-26) and design reference for vendored-archive SBOM normalization where noted. Reconciliation vault v2 (invoices/receipts) moved to packages/ux-vault porta |
| `ghostpay-offline-deps-2026-10-27` | 3697f539 | - | 13/0 | Pre-rewrite recovery snapshot lineage (shared checkpoint 71cd067d, Oct 26-28) + 84f5cdf5 legacy metadata/lockf | Nothing unique beyond 57dcf7e8 harness (see ghostpay-cloud-recovery-2026-10-26) and design reference for vendored-archive SBOM normalization where noted. Reconciliation vault v2 (invoices/receipts) moved to packages/ux-vault porta |
| `ghostpay-sbom-repro-2026-10-27` | b5b04b99 | - | 14/0 | Pre-rewrite recovery snapshot lineage (shared checkpoint 71cd067d, Oct 26-28) + a734e771 normalize-sbom.mjs va | Nothing unique beyond 57dcf7e8 harness (see ghostpay-cloud-recovery-2026-10-26) and design reference for vendored-archive SBOM normalization where noted. Reconciliation vault v2 (invoices/receipts) moved to packages/ux-vault porta |
| `pr/139` | a0d81ef9 | #139 | 41/0 | #139 append-only randomized read-only Pages audit rotations 141-183 (docs/audits/CHATGPT_RANDOM_AUDIT_LEDGER.m | Each rotation: source-inspected only, tests not run, no reproduced defect. Audit-trail value only, no actionable finding sampled. Chain still advancing (live head 7af4b5ff = rotation 183, 05:38Z, after candidate commit). STALE PR  |
| `pr/153` | ccdc7954 | #153 | 40/0 | #153 zero-codex handoff rotations (docs/handoffs/CHATGPT_ZERO_CODEX_LATEST.md) | Status narration/ownership claims; stale vs candidate PROMOTION_PACKET. Live head 30f1604d (rotation 183). STALE PR REF: PR head differs from live branch tip (branch advanced); see entry chatgpt/zero-codex/pages-owner-ci-handoff-2 |

### Class E obsolete

| Ref | SHA | PRs | uniq/equiv | Purpose | Why not recoverable / residual |
|---|---|---|---|---|---|
| `codex/setup-autonomous-agent-20261104` | 122e5171 | #82 | 2/0 | #82 adds .github/workflows/openai-agents.yml + repository-scope prompt | Candidate deliberately moved this workflow out (A5-2) to .github/agent-prompts/openai-agents.steps.disabled.yml.txt; re-adding would re-enable what was disabled. |
| `pr/23` | c382456c | #23 | 1/0 | closed PR #23 npm-major group (superseded by later dependabot groups, now #87) | stale lockfile base (Oct 22-26), 69 files; superseded by #87 content |
| `pr/25` | 990fedee | #25 | 1/0 | closed PR #25 npm-major group (superseded by later dependabot groups, now #87) | stale lockfile base (Oct 22-26), 69 files; superseded by #87 content |
| `pr/33` | cf17cd0d | #33 | 1/0 | closed PR #33 npm-minor-patch group (superseded by #176) | stale lockfile base; superseded |
| `pr/34` | 212967fe | #34 | 1/0 | closed PR #34 npm-major group (superseded by later dependabot groups, now #87) | stale lockfile base (Oct 22-26), 69 files; superseded by #87 content |
| `pr/45` | 277e4908 | #45 | 1/0 | closed PR #45 npm-minor-patch group (superseded by #176) | stale lockfile base; superseded |
| `pr/86` | e09bbc12 | #86 | 1/0 | closed PR #86 npm-minor-patch group (superseded by #176) | stale lockfile base; superseded |

### Class C with unique patch-ID commits or equivalence (non-ancestors)

| Ref | SHA | PRs | uniq/equiv | Purpose | Evidence of supersession |
|---|---|---|---|---|---|
| `chatgpt/ghostpay-historical-consolidation-20261115` | 7dc7eccc | - | 5/2 | 5 consolidation commits from #172 (CreateInvoice, devnet spec, RegistryView/SellerKeys tests) | all 5 unique patches reverse-apply on candidate (VERIFIED git apply -R --check): already present |
| `chatgpt/ghostpay-rpc-filter-guard-20261114` | dfed84c1 | - | 1/1 | scanSpam off-filter RPC log guard | candidate scanSpam.ts:153-158 has address AND block-range checks (VERIFIED) |
| `chatgpt/ghostpay-rpc-filter-guard-beta-20261114` | 73923350 | #161 | 0/5 | all commits patch-ID-equivalent to candidate commits (0 unique, git cherry) | patch equivalence (ledger lists mapped candidate commits); behaviour not re-proven here |
| `chatgpt/ghostpay-six-fixes-combined-20261112` | 36dfa8d2 | - | 0/6 | all commits patch-ID-equivalent to candidate commits (0 unique, git cherry) | patch equivalence (ledger lists mapped candidate commits); behaviour not re-proven here |
| `chatgpt/pages-browser-fixes-combined-20261114` | 73923350 | #161 | 0/5 | all commits patch-ID-equivalent to candidate commits (0 unique, git cherry) | patch equivalence (ledger lists mapped candidate commits); behaviour not re-proven here |
| `chatgpt/zero-codex/cli-sentinel-value-20261111` | a6e74591 | #125 | 0/2 | all commits patch-ID-equivalent to candidate commits (0 unique, git cherry) | patch equivalence (ledger lists mapped candidate commits); behaviour not re-proven here |
| `chatgpt/zero-codex/merchant-schedule-horizon-20261111` | 7cdc6b32 | #123 | 0/1 | all commits patch-ID-equivalent to candidate commits (0 unique, git cherry) | patch equivalence (ledger lists mapped candidate commits); behaviour not re-proven here |
| `chatgpt/zero-codex/onion-canonical-host-20261111` | 72dde82d | #122 | 0/2 | all commits patch-ID-equivalent to candidate commits (0 unique, git cherry) | patch equivalence (ledger lists mapped candidate commits); behaviour not re-proven here |
| `chatgpt/zero-codex/pages-negative-fiat-regression-20261114` | 9bdc9cba | #154 | 1/0 | #154 negative fiat one leading sign | patch reverse-applies (present) |
| `chatgpt/zero-codex/pages-owner-transfer-filter-20261115` | cf5e876c | #163 | 1/2 | #163 transfer-filter; sole unique commit eef050a2 is stale ACTIVE_WORK ownership reservation | source commits patch-equivalent; stale reservation obsolete |
| `chatgpt/zero-codex/pages-qr-combined-20261115` | 26f83ccd | #162 | 1/6 | #162 bearer QR assertions | both assertions present in qrKinds.test.ts:40-42; difference is comment text only |
| `chatgpt/zero-codex/pages-scan-transfer-filter-20261114` | 7b6c4983 | #159 | 0/2 | all commits patch-ID-equivalent to candidate commits (0 unique, git cherry) | patch equivalence (ledger lists mapped candidate commits); behaviour not re-proven here |
| `chatgpt/zero-codex/pages-tagarchive-blocked-click-20261117` | 8aed22ad | #193 | 1/0 | closed #193 blocked TagArchive download test | candidate has stronger port b3e4051e (TagArchive.test.tsx:56 describe blocked download cleanup + Common helper/test); prior ledger action "selectively port" is DONE |
| `chatgpt/zero-codex/ux-confirm-clock-boundary-20261111` | d7795690 | #126 | 0/2 | all commits patch-ID-equivalent to candidate commits (0 unique, git cherry) | patch equivalence (ledger lists mapped candidate commits); behaviour not re-proven here |
| `chatgpt/zero-codex/ux-guide-plain-object-20261111` | cf3a8b23 | #127 | 2/1 | #127 ux-guide plain own-key records | packages/ux-guide/src/profiles.ts blob identical to branch (VERIFIED); both patches present |
| `claude/ghostpay-lean-core-milestone-t5lwox` | 2527d6b9 | #151 | 4/4 | #151 A3-2 expiry at send, A5-1/A5-2 CI gates | candidate pay.ts:385 assertInvoiceStillPayable, :400 boundedDeadline, payExec.ts:253/267/299; codex-cloud gate lines 60-125; openai-agents moved out; 2 of 4 patches reverse-apply |
| `claude/gifted-planck-115x2k` | 1d28f24d | #39 | 3/1 | #39 D3 deadline_too_soon, B2R plain-revert | candidate relayer service.ts:564,764,805,808 deadline_too_soon; chain-adapters rpc.ts executionReverted; opStackFee.ts:40; broader than branch |
| `claude/haiku-wave-2-handoff-qepfoe` | 8d1bde36 | #43 | 0/3 | all commits patch-ID-equivalent to candidate commits (0 unique, git cherry) | patch equivalence (ledger lists mapped candidate commits); behaviour not re-proven here |
| `claude/happy-maxwell-onl4x5` | fd710eb3 | #44 | 1/0 | #44 audit report keep file mode | candidate gen-audit24-report.py:324 S_ISREG, :339 fchmod, mode 0o644 mask; branch variant is weaker (0o666 default) -> candidate stronger |
| `claude/sharp-bohr-uigfgh` | c9a8c3d3 | #42 | 2/0 | #42 Haiku wave prompts | both patches reverse-apply (docs present) |
| `claude/vigilant-johnson-yjgq94` | 4403d370 | - | 1/0 | closed #150 idle-lock hint test | Settings.test.tsx:39-41 asserts same two facts with different regexes |
| `codex/ghostpay-cloud-41868394956` | f34a80f7 | #81 | 0/1 | all commits patch-ID-equivalent to candidate commits (0 unique, git cherry) | patch equivalence (ledger lists mapped candidate commits); behaviour not re-proven here |
| `codex/ghostpay-security-audit-20261030` | 63994db6 | #40 | 3/2 | #40 same 3 commits as gifted-planck + 2 equivalent | as gifted-planck |
| `dependabot/npm_and_yarn/follow-redirects-1.16.2` | 6bffb63d | #49 | 0/1 | follow-redirects 1.16.1->1.16.2 | patch-equivalent to 99d80dcd; candidate lock has 1.16.2 (VERIFIED) |
| `docs/future-privacy-feature-specs-20261109` | 896c671f | #99 | 2/0 | #99 merged future privacy catalog index | docs/future/privacy-first present; INDEX.md:268-270 has the catalog entry |
| `fix/ghostpay-cloud-api-secret-aliases-20261103` | cdbb7ec7 | #50 | 0/1 | all commits patch-ID-equivalent to candidate commits (0 unique, git cherry) | patch equivalence (ledger lists mapped candidate commits); behaviour not re-proven here |
| `fix/remediation-b16c7936-5ce634` | 0b213bd9 | #77 | 0/1 | all commits patch-ID-equivalent to candidate commits (0 unique, git cherry) | patch equivalence (ledger lists mapped candidate commits); behaviour not re-proven here |
| `fix/remediation-f95457fd-22ecf9` | 6b3e689c | #80 | 0/1 | legacy payment-attempt block (qodo bot) | equivalent commit 0fe67bcd was reverted by 051c1c12; false-positive on distinct scoped payments (candidate test 92a05a23 requires them unblocked). Do NOT resurrect. |
| `pr/32` | b34edd5a | #32 | 1/0 | closed PR #32 foundry-toolchain 1.9.1->1.9.2 | candidate workflows already pin foundry-toolchain v1.9.2 (VERIFIED grep) |

### Class C ancestors of candidate (169 heads + 7 PR-only refs)

All ancestors of `7a620ff1`. `ref sha8 [PRs]`; PR-only refs marked `pr/N`.

`ai/agent-harness-20261113` 15dc9c19 [#152]; `automation/api-funded-ghostpay-cloud-20261103` 29ce481d [#48]; `automation/ghostpay-parallel-review-wave-20261103` 03a3f570 [#53]; `backup/codex-observed-pr37-915d710-20261028` 915d7105; `backup/pr30-before-consolidation-20261025` 356fe5e4; `backup/pr31-before-consolidation-20261025` a2217ea1 [#31]; `chatgpt/consolidation-reconciliation-20261113` 3cf3437a [#146]; `chatgpt/ghostpay-beta-qualification-20261112` c11f905b [#136]; `chatgpt/ghostpay-billing-horizon-port-20261112` eb21d57c [#130]; `chatgpt/ghostpay-cli-sentinel-port-20261112` 3fd18ef4 [#129]; `chatgpt/ghostpay-integration-matrix-20261112` 1a5e815d [#128]; `chatgpt/ghostpay-merchant-csv-port-20261112` bbc7dda4 [#131]; `chatgpt/ghostpay-onion-canonical-port-20261112` 8277879e [#134]; `chatgpt/ghostpay-pages-client-hardening-20261115` f3872e90 [#166]; `chatgpt/ghostpay-pages-gp02-gp04-review-20261115` 9b3a3070 [#165]; `chatgpt/ghostpay-pages-second-pass-notes-20261115` cf6a8d69 [#167]; `chatgpt/ghostpay-sensitive-surface-audit-20261115` 90a14574 [#168]; `chatgpt/ghostpay-sensitive-surface-fourth-pass-20261115` 97a617b5 [#169]; `chatgpt/ghostpay-top-down-audit-20261115` 77575693 [#170]; `chatgpt/ghostpay-ux-clock-port-20261112` c3173f84 [#132]; `chatgpt/ghostpay-ux-guide-port-20261112` f3a9b238 [#133]; `chatgpt/zero-codex-continuation-spec-20261109` d1592198 [#101]; `chatgpt/zero-codex/audit-secret-box-20261110` 621ee0af [#103]; `chatgpt/zero-codex/b0-receipt-recovery-20261110` 0a61e2c7 [#108]; `chatgpt/zero-codex/docs-wiki-20261110` fa375dbc [#104]; `chatgpt/zero-codex/merchant-csv-safety-20261111` afaf7ce6 [#124]; `chatgpt/zero-codex/ops-monitor-bounded-fetch-20261110` 5280569b [#106]; `chatgpt/zero-codex/pages-autoclear-enable-retained-hash-20261117` 9732adb9 [#198]; `chatgpt/zero-codex/pages-backup-gate-verified-only-20261115` 433307b8 [#171]; `chatgpt/zero-codex/pages-bearer-qr-warning-20261114` 81fd4c03 [#156]; `chatgpt/zero-codex/pages-combined-qualification-20261113` ab427ab8 [#143]; `chatgpt/zero-codex/pages-download-cleanup-20261116` cf5ad81c [#178]; `chatgpt/zero-codex/pages-fragment-history-state-20261117` 68993c66 [#197]; `chatgpt/zero-codex/pages-fragment-shell-gates-20261117` 120dcd7f [#196]; `chatgpt/zero-codex/pages-hash-navigation-exceptions-20261117` b570d4bb [#199]; `chatgpt/zero-codex/pages-invoice-stale-submit-20261115` dffe0725 [#172,#174]; `chatgpt/zero-codex/pages-keystore-reimport-control-20261118` 30cc4560 [#202]; `chatgpt/zero-codex/pages-late-invoice-focus-20261117` 23cc6db4 [#200]; `chatgpt/zero-codex/pages-manifest-disclosure-rejection-20261113` 907e2919 [#144]; `chatgpt/zero-codex/pages-manifest-gates-20261117` 12e18931 [#195]; `chatgpt/zero-codex/pages-pay-rich-tags-20261117` c15833bc [#194]; `chatgpt/zero-codex/pages-reconciliation-e2e-proof-20261116` 57acf1b0 [#175]; `chatgpt/zero-codex/pages-reconciliation-idb-retry-20261113` c8d4c42b [#145]; `chatgpt/zero-codex/pages-reconciliation-imported-link-20261115` 97cf5a0c [#173]; `chatgpt/zero-codex/pages-relayer-stream-limit-20261114` 9a84764e [#158]; `chatgpt/zero-codex/pages-renderer-own-property-20261116` dd4a7eb4 [#192]; `chatgpt/zero-codex/pages-rpc-http-status-20261113` 68aca93b [#141]; `chatgpt/zero-codex/pages-same-view-invoice-focus-20261117` 2fb89ff5 [#201]; `chatgpt/zero-codex/pages-smoke-project-boundary-20261113` eece5aff [#142]; `chatgpt/zero-codex/pages-tag-store-closed-connection-20261116` 17f68191 [#177]; `chatgpt/zero-codex/pages-verifier-comment-attrs-20261112` 6f59cc2c [#138]; `chatgpt/zero-codex/qualify-98-20261110` a2f4205f [#102]; `chatgpt/zero-codex/receipt-boundary-regressions-20261110` 83d17adb [#105]; `chatgpt/zero-codex/recovery-auth-negative-20261110` 969d1b27 [#109]; `chatgpt/zero-codex/rpc-concurrent-byte-budget-20261110` b12a20e1 [#111]; `chatgpt/zero-codex/rpc-response-correlation-20261110` bbe300b7 [#110]; `chatgpt/zero-codex/signed-receipt-no-rpc-proof-20261110` 0ab175e5 [#107]; `checkpoint/ghostpay-recovery-20261102` 1dffa5a3 [#46]; `claude/admiring-albattani-6kydor` 5f9e444d [#84]; `claude/adoring-wozniak-850ue6` a2217ea1 [#31]; `claude/ar-a0-pr47-green` 4a38efdf [#59]; `claude/ar-a4-btc-headersync` 27d1580c [#74]; `claude/ar-a5-announcer-budget` d9fe8b4e [#70]; `claude/ar-a6-combined-backup` f5d21985 [#61]; `claude/ar-a7-policy-send-guard` f7b8ee9d [#65]; `claude/ar-b1-core-journey` e0a499bd [#62]; `claude/ar-b2-lean-bound-receipts` 2bcfd11f [#64]; `claude/ar-b3-sweep-permit-states` 9d100956 [#69]; `claude/ar-b5-testnet-feeds` 76199cda [#72]; `claude/ar-c1-reconciliation-adr` 1e871091 [#71]; `claude/ar-c2-qr-pairing` 78be1730 [#60]; `claude/ar-c4-i18n-create-b4-buffer-ui` 4fe95fc0 [#68]; `claude/ar-c4-i18n-pay` e02d04c7 [#66]; `claude/ar-c4-i18n-scan` 7f4702fd [#67]; `claude/ar-c5-device-matrix` 92af349a [#73]; `claude/ar-c7-embed-iframe-e2e` 2b9db8ab [#63]; `claude/consolidation-2026-11-04` a28ca06a [#78]; `claude/cool-albattani-xopr89` 7373172d [#30]; `claude/cw-c2` b9cba097; `claude/cw-c4` 511c23bd; `claude/cw-c5` 99d80dcd; `claude/cw-w1` 704e268b; `claude/cw-w10` 391454b2; `claude/cw-w11` 764020c2; `claude/cw-w5` f030376a; `claude/cw-w6` 16cddc21; `claude/cw-w7` a4ee36ee; `claude/cw-w8` f1629604 [#79]; `claude/cw-w9` 8303c8c6; `claude/docs-screenshots` 0476cb11 [#112]; `claude/docs-snapshot-1` dc2340c9 [#9]; `claude/docs-snapshot-2` e1a92c87 [#10]; `claude/exciting-brown-7v69cr` 07968599 [#119]; `claude/friendly-turing-1ui0on` 89db3458; `claude/gallant-hamilton-4wzkyn` ca358acf [#121]; `claude/ghostpay-autonomous-completion-y4sk2h` b6a0871d [#37]; `claude/ghostpay-autonomous-prompt-scpgun` 1db8e967 [#58]; `claude/ghostpay-github-pages-up6cj6` ac08062e [#137]; `claude/gracious-heisenberg-97ji6q` c6ce2259 [#115]; `claude/hopeful-bardeen-8ch6l8` 2a5b29de [#155]; `claude/inspiring-fermat-vxv689` c1c4ac9b [#2]; `claude/kind-faraday-8qzf6e` 1e4d19f1 [#117]; `claude/laughing-bardeen-4t20ys` e96cee1a [#17]; `claude/lucid-meitner-apalzc` 0d2ea8b4 [#164]; `claude/nice-ritchie-8vivls` 1bf25be7 [#114]; `claude/pages-site-1` 7f77a444 [#13,#19]; `claude/portable-hosting-kit` cb917c67 [#36]; `claude/remote-extensions-1` 39cce466 [#4]; `claude/remote-extensions-10` 698404ca [#16]; `claude/remote-extensions-2` df150cbd [#3]; `claude/remote-extensions-3` cdfc2ba2 [#7]; `claude/remote-extensions-4` 4ffb7a99 [#5]; `claude/remote-extensions-5` 1337f6c1 [#12]; `claude/remote-extensions-6` 7fb7aca6 [#14]; `claude/remote-extensions-7` e2ac361b [#8]; `claude/remote-extensions-8` ad76a87e [#11,#18]; `claude/remote-extensions-9` f09decc2 [#15]; `claude/vibrant-cori-scu18b` 0641d41a [#113]; `claude/wizardly-babbage-mfsdrl` ade77362 [#76]; `claude/wonderful-thompson-ir89i9` 97b919c9 [#118]; `codex/ghostpay-approval-gated-auto-integration-20261109` e36786bc [#100]; `codex/ghostpay-canonical-time-20261116` 27852ba8 [#186]; `codex/ghostpay-caveman-completion-20261116` 0c4c3c8d [#182]; `codex/ghostpay-caveman-followup-20261116` 2de9b0c5 [#183]; `codex/ghostpay-companion-merchant-20261109` b748ecdc [#91]; `codex/ghostpay-completion-20261116` b4be8866 [#179]; `codex/ghostpay-consolidation-20261030` 70d8bf6e [#41]; `codex/ghostpay-consolidation-audit-20261104` e2ac398c [#83]; `codex/ghostpay-continuation-20261109` 0a68a57b [#88]; `codex/ghostpay-integrate-product-cli-20261109` 3ec039c5 [#95]; `codex/ghostpay-mythril-recovery-20261116` ffd957e2 [#180]; `codex/ghostpay-observability-20261116` c738f96e [#185]; `codex/ghostpay-ops-response-cap-20261116` 73371b57 [#184]; `codex/ghostpay-policy-localization-20261109` 5628bc00 [#90]; `codex/ghostpay-product-20261109` cfc7b0f3 [#89]; `codex/ghostpay-registry-recovery-20261116` 98f77953 [#181]; `codex/ghostpay-research-acceptance-tests-41750257638` 57b414bf [#54]; `codex/ghostpay-research-documentation-ux-41750257638` 96fc22c4 [#56]; `codex/ghostpay-research-release-qualification-41750257638` 6bd5b15c [#57]; `codex/ghostpay-research-security-review-41750257638` 2d9c30e1 [#55]; `codex/ghostpay-spec09-matrix-20261116` 2de9b0c5 [#183]; `codex/ghostpay-unified-completion` beb525dd [#187]; `codex/seller-ledger-receipt-qr` bb011134 [#24]; `consolidation/ops-monitor-bounded-streams-20261116` d2e8689b [#188]; `consolidation/six-verified-boundaries-20261116` c9787b22 [#189]; `docs/ghostpay-3q-stealth-keypair-export-20261116` 16bc61fa [#190]; `docs/ghostpay-deep-research-20261103` 894dc868 [#75]; `docs/ghostpay-privacy-architecture-5a-5l-20261116` e05044d4 [#191]; `docs/lean-release-handoff-2026-10-24` 2b032d77 [#29]; `docs/readme-and-wiki` ab2b6168 [#1]; `fix/ghostpay-reconciliation-saturated-state-20261109` a864949d [#94]; `gpt/ghostpay-beta-spec-20261109` 6697390f [#96,#97]; `gpt/ghostpay-cli-completion-20261109` 3a9ce554 [#92]; `gpt/ghostpay-product-completion-20261109` 3cd1e554 [#93]; `haiku/ghostpay-h01-inventory-20261111` 747239db [#120]; `haiku/l1-i18n-20261114` c6a90334 [#147]; `haiku/l2-pkg-20261114` 0c8b111c [#148]; `haiku/l3-ledger-20261114` 8c91051b [#149]; `integration/consolidated-2026-10-21` c206655e [#20]; `integration/consolidated-2026-11-14` a89a2e94 [#157]; `integration/ghostpay-accepted-20261102` f8193502 [#47]; `integration/ghostpay-beta-consolidated-20261109` 364b1f18 [#98]; `main` cfaebeea; `nodata/jolly-rubin-u4zd45` f88aaf2f [#135]; `nodata/wizardly-allen-qwol6u` 7a620ff1 [#203]; `pr/150` 36bcdb74 [#150]; `pr/21` a8c62cb5 [#21]; `pr/22` 00212154 [#22]; `pr/26` 06f1426d [#26]; `pr/27` a4ab45fa [#27]; `pr/28` 3831d029 [#28]; `pr/6` a107d2dc [#6]; `research/privacy-evidence-matrix-20261110` a0a2d1df [#116]; `work/ghostpay-consolidation-review-20261025` a2217ea1 [#31]; `work/ghostpay-pr26-qa-2026-10-24` 77e7d7b6; `work/local-reconstruction-2026-10-24` bd320d53
## 5. Changes vs prior ledger (215 refs @ 2026-11-18T02:42Z vs candidate 278c9a27)

| Item | Then | Now | Reason |
|---|---|---|---|
| Population | 215 origin heads | 217 live heads | +`nodata/eager-babbage-0w6sf6` (#204, 02:31Z, class A) and +`nodata/wizardly-allen-qwol6u` (the candidate itself; ancestor). No head removed. |
| Candidate head | `278c9a27` | `7a620ff1` (1,794 shallow-visible / 2,210 full commits) | 17+ commits: tagarchive, mythril-expiry, cigates lanes, next-phase queue, ledger docs, reimport lane (84b4e605). |
| `docs/ghostpay-3q-stealth-keypair-export-20261116` (#190), `docs/ghostpay-privacy-architecture-5a-5l-20261116` (#191) | integrate | contained (C) | merged into candidate: 1b214aa8, 6c6e88df, reconciled in ab78c021 (spec 18 canonical for 3q, 5k status fixed). |
| `pages-same-view-invoice-focus-20261117` (#201), `pages-keystore-reimport-control-20261118` (#202) | integrate | contained (C) | merged 2f47786a; lane 84b4e605. |
| `pages-tagarchive-blocked-click-20261117` (#193) | selectively port | C | ported as stronger b3e4051e; test at TagArchive.test.tsx:56. |
| `claude/laughing-bardeen-4t20ys`, `claude/remote-extensions-10` | contained | contained (C) | unchanged; shared shallow census wrongly said non-ancestor (section 0). |
| 3 docs heads: `audit-pages-release-20261112` (#139), `docs-pages-scope-20261112` (#140), `pages-owner-ci-handoff-20261114` (#153) | pins cf7d7083 / 68aa3e6b / 3f97a9eb; archive as evidence | live heads `7af4b5ff` / `400e20f1` / `30f1604d` (rotation 183, 05:38Z); local PR refs `pr/139,140,153` stale at a0d81ef9/58a47006/ccdc7954 (rotation 182) | automation keeps adding 1 commit per rotation; **new since ledger**, ahead of candidate by 42/109/41 patches. #140 re-classed B (one real doc fix: qr-colors); others D. |
| `gh-pages` | generated output | F | needs owner check of Pages source (UNVERIFIED, API 403) because candidate deploys by Actions artifact. |
| `dependabot` #85 #87 #176 | maintenance backlog | B (regenerate) | candidate already holds foundry-toolchain 1.9.2, chai 6.3.0, eslint 10.15, solana kit 8.6.0; remaining bumps still unmet (viem, vitest, vite, prettier, create-pull-request 8, scure 2.x, TS 7). |
| `codex/setup-autonomous-agent-20261104` (#82) | maintenance backlog | E | would re-add workflow that A5-2 deliberately disabled. |
| 5 pre-rewrite snapshot refs | archive as evidence | 1 B (cloud-recovery, carries 57dcf7e8), 4 D | verified residual: seller-vault R1-R3 harness (runs green on candidate). |
| `semantically superseded` x14 / patch-equivalent x14 | as stated | C | spot-verified in candidate code (section 4); `happy-maxwell` and `lean-core` actually stronger in candidate. |
| #204 | not classified (unfetched) | A | inspected: additive agent tooling, 11/12 tests pass on candidate, map stale. |

Prior ledger "integrate (4)" and "selectively port (1)": all five are now in `7a620ff1` (verified `merge-base --is-ancestor` and merge/lane commits above).

## 6. Top recoverable items, ranked by value

1. **#204 agent tooling** (A): clean new files; regenerate `PACKAGE_MAP.md`, merge `CLAUDE.md`, adapt 1 ci.yml line. Highest value, low risk; owner scope decision.
2. **Seller-vault R1-R3 Chromium harness** (B, `57dcf7e8`, file `apps/web/scripts/test-seller-vault-idb.mjs`): extra real-browser evidence for key recovery/portability (constraint 4); verified passing on candidate; not wired in `package.json`.
3. **Dependency refresh via Dependabot recreate** (B): viem 2.57.19, vitest/coverage 5.1.0, vite 8.3.8, prettier 3.10.1, playwright 1.65, create-pull-request 8. Majors (@scure/* 2.x crypto, TypeScript 7, hardhat 3) each need review, not group merge.
4. **`docs/design/qr-colors.md` hunk** (B): doc currently contradicts enforced bearer precedence.
5. Optional: single-file audit-trail copy of `CHATGPT_RANDOM_AUDIT_LEDGER.md` rotations 141-183 (D), sampled entries claim no reproduced defect; not security assurance.
6. `gh-pages` clarification (F), no code.

Nothing else is recommended for recovery. No blind bulk merge of any ref; stacked pre-rewrite branches and docs rotation chains conflict heavily (233 of 275 unique commits conflict).

## 7. Open questions

- Owner: is #204 tooling wanted and should it ship with or after #203? Is `CLAUDE.md` pointer form preferred?
- Owner: is GitHub Pages source `gh-pages` or Actions? (UNVERIFIED; `gh api .../pages` forbidden through proxy.)
- Should the three ChatGPT docs-rotation branches keep advancing? They add one commit per rotation and will keep diverging; any retirement or freeze needs owner approval. Their status claims must not overwrite candidate ledgers.
- `e2e` harness `apps/web/e2e/flows.spec.ts` change in 21c7ed43 (CSP worker evidence tied to signed receipt) is only 56% line-present; needs anvil, not runnable here: UNVERIFIED whether candidate coverage is equivalent (INFERRED evolved).
- Revert 051c1c12 has no rationale in its message; inferred from later test 92a05a23.
- Dependabot `ci: bump actions` metadata says create-pull-request 8.1.1 while table says 8.1.3 (inconsistent, re-generate).
- `nodata/zealous-hopper-lr0nxe` is this package's branch (PR #205, pushed after the census); not a recovery candidate.


## 8. Addendum: heads created or moved after the census (2026-11-18 ~08:00Z, unclassified)

Live `git ls-remote` showed 227 heads (217 at the census + 11 new − 2 gone; 9 moved). None of the new heads is contained in
`main` `5467c158`. They belong to concurrent sessions and automation and are **not** classified here; re-run the census
(`evidence/scripts/branch_census.py`) and coordinate through the execution prompt's step 2a before acting on them.

| Head | Tip | PR | What it carries (from commit subjects) | Provisional note |
|---|---|---|---|---|
| `claude/ghostpay-consolidation-9xhtxg-spec18` | `a199c21e` | #213 | spec 18 format reference, K01/K02/K05/K06 codec (`packages/ux-vault/src/stealth-export-portable.ts`), independent recovery script, K04 anvil interop test, user guide (+4,094 lines) | Highest-value live work: review against FEATURE_ACCEPTANCE_CRITERIA §3 and build on it (WS-03/08/09/19/25) |
| `claude/ghostpay-consolidation-9xhtxg-security` | `4894d0d8` | #212 | Mythril re-evaluation + unwired disposition checker, Echidna and fee-token review, CI/supply-chain review, `validate:deployments` script, static-beta decision packet, owner action packet | Overlaps WS-06, WS-20, TB-06 |
| `claude/ghostpay-consolidation-9xhtxg-feeguard` | `9e5cc378` | #217 | DeployPolicy refuses fee-charging factories without a token-specific freeze acknowledgement | Overlaps SEC-07 / OD-04 (scheme 2 stays undeployed) |
| `claude/ghostpay-consolidation-9xhtxg` | `c487f0fe` | #206 | #204 agent tooling re-integrated onto the consolidated tree | Supersedes this matrix's class-A recovery of #204 |
| `claude/ghostpay-completion-audit-ot5jjm` | `f81947fa` | #209 | lane claims; hands spec 18 lanes to #213 | Claims only |
| `nodata/wonderful-darwin-kd1h22` | `75f67d7d` | #211 | lane claims; security-closure draft mapping SEC rows to owners | Claims/docs only |
| `chatgpt/zero-codex/audit-main-20261118-r185`, `docs-postmerge-wiki-20261118`, `handoff-postmerge-20261118` | `01a3bc0a`, `328cddc3`, `62022488` | #214, #215, #216 | docs rotation after the merge | Docs only |
| `dependabot/github_actions/actions-b9ade1236b`, `dependabot/npm_and_yarn/npm-minor-patch-71cdd1547c` | `199ab7ef`, `4d19655a` | #207, #210 | regenerated Dependabot groups (replacing the two removed Dependabot heads) | Covers part of the class-B dependency refresh |

Moved since the census: `main` (→ `5467c158`), `nodata/wizardly-allen-qwol6u` (→ `5467c158`), this package's branch, the three
zero-codex docs heads (#139 → `364b01f8`, #140 → `c5efadab`, #153 → `83fe9b02`), `claude/admiring-albattani-6kydor`
(#84/#208 → `ef610872`), `claude/friendly-turing-1ui0on` (→ `20a94f24`), `dependabot/npm_and_yarn/npm-major-1ddf9439d6`
(#87 → `bbc8ff3b`). Removed: `dependabot/github_actions/actions-1850456dc8`, `dependabot/npm_and_yarn/npm-minor-patch-9f9e7f3407`.
