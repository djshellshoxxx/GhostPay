# REVIEW_H2 — independent adversarial review of the execution prompt and planning package

Team H2, 2026-11-18. Read-only on repos and `$SP/final/`. Reviewed `$SP/final/` as of 08:03Z (prompt 07:48:11Z; PLAN,
SEQUENCE and `ws_registry.json` 07:43Z; criteria and graph 07:47Z; BLOCKERS, README, matrix and stats 08:00-08:01Z, after the
coordinator applied H1's rescoring). Byte copy: `$SP/out/H/snapshot_H2/`. Repo `/home/user/GhostPay` (full history, not
shallow: VERIFIED `rev-parse --is-shallow-repository` = false), worktree `/home/user/wt/cand` @ `7a620ff1` (left clean), live
refs from `git ls-remote` (07:55:50Z) and my own blob-less fetch `$SP/out/H/live_H2.git`. Labels: VERIFIED (command run or
code read), INFERRED, UNVERIFIED.

Deliverables: this file, `$SP/out/H/corrections_h2.json` (144 entries `{id, file, find, replace, reason, severity}`; `file`
is relative to the package root; apply in array order), scripts `$SP/out/H/scripts_H2/*.py`, patched preview
`$SP/out/H/patched_H2/`.

## 1. Verdict

**Not ready to paste as-is: 1 blocker cluster, 14 major clusters, 2 minor clusters (144 corrections: 1 blocker, 75 major,
68 minor).** Usable after applying `corrections_h2.json`. All 144 `find` strings are unique in the live files, all apply in
order (re-checked against the live `$SP/final/` at 08:05Z and again at 08:38Z; newest package file 08:01:14Z), the
three JSON files still parse, the patched prompt's feature register matches the matrix exactly (67 rows, 38 complete, 154
unfinished, tiers, statuses and percentages all equal), the patched registry assigns all 154 unfinished rows, and the patched
G-FULL blocks pass `bash -n`.

Main reasons:
1. **Blocker: concurrent sessions, no claims protocol.** At 07:55Z `main` = `5467c158` (PR #203 merged 06:56:49Z) and at
   least five other agent sessions had open PRs on the same work: #213 [WIP] spec 18 K01-K06 (own codec
   `packages/ux-vault/src/stealth-export-portable.ts`, `test-vectors/stealth-export.json`, independent recovery script
   `scripts/recovery/stealth-export-recover.mjs`, K04 anvil test); #206 (#204 port, conflicts resolved); #209 and #211
   (completion runs with exclusive path claims in `docs/ai/ACTIVE_WORK.md`); #212 (Mythril/Echidna/fee-token review,
   `validate:deployments`, owner packets); #207/#210 (Dependabot); #217 (DeployPolicy N1 guard); #208 (another execution
   prompt). The prompt only knows the ChatGPT docs rotation. A session following it would build a second spec 18 format id,
   AAD domain, vector file and recovery tool (WS-03/19 paths differ from #213's), i.e. incompatible user backups
   (constraint 4), re-port #204, and collide on paths that #209/#211 claim. (H2-01, H2-02)
2. **The prompt contradicts its own package.** The matrix, stats and README were rescored at 08:01Z (154 unfinished, 38
   complete, beta-core 42, 87.2/83.5 %); the prompt still says 155/37/43 and 87.9/84.0 %, lists F-WEB-09 as unfinished,
   F-NET-01 as 100/80, F-WEB-07 as a held row, F-BTC-01 as beta-supporting, and treats #203 as open and OA-02 as pending.
3. **OD-01 default would block the only encrypted backup.** Prompt section 10, PLAN/SEQUENCE/registry WS-07.1, criteria
   section 8 and the F-KEY-01 strategy still say every secret export refuses without a vault. VERIFIED
   `apps/web/src/views/SellerKeys.tsx:205-231` @7a620ff1: the keystore v1 download runs through `authorizeKeyExport`, so that
   default removes the backup of freshly generated or imported keys (and the verified-backup gate, F-KEY-03) or forces vault
   storage on the shared github.io origin (SEC-01). BLOCKERS OD-01 and SEC-03 were already corrected at 08:00Z ("never block
   the keystore v1 backup"); the prompt and plan were not.
4. **The plan decides or weakens things the prompt forbids:** WS-12.3 trims the locale selector (owner's OD-16 choice);
   WS-03.2 sets the new-export floor to "score>=3 or generated", below OD-09's ≈80-bit default; WS-20.3 moves Mythril off PRs
   and makes lint/typecheck affected-only (gate weakening; VERIFIED `contract-analysis.yml:3-12` runs on PRs today);
   WS-02.6/WS-10.3 "record owner ack (no canonical ID)" (silence as approval); WS-19.5 has the new zero-dependency tool sign
   the K04 spend transaction itself (hand-rolled BigInt ECDSA + tx encoding on users' recovered keys) where NEXT_PHASE_QUEUE
   K04 and prompt section 13 name pinned Foundry `cast`/`anvil`.
5. **Executability gaps:** `$SOLC_0828` and `$START` are used but never defined in the prompt's G-FULL (with `SOLC_BIN=''`
   the REQUIRE_ANVIL web suite fails: `registry.anvil.test.ts:16-18,61-62`); the plan's `git worktree add
   ../wt/WS-00-integration -b ws/WS-00-integration` cannot run under the designated-branch rule; `branch_census.py` is
   called without its four required arguments; tiers strongest/mid/cheap map to no model or effort (Opus 5.5's API default
   effort is `medium`); worker branches are never pushed and the integration branch only at checkpoints, although a container
   restart already lost Team G's work in this audit.

What holds (VERIFIED): the constraint section (6.1-6.5) is complete and correct; section 3 forbids deploy, merge to main,
releases, tags, real-key broadcast, branch deletion, custody, telemetry and gate weakening; the item DAG has 0 cycles (106
items + CP nodes; all deps resolve); every WS/SEC/OD/OA/EX/TB/F ID in the prompt, PLAN, SEQUENCE, graph, criteria, BLOCKERS
and README exists; the prompt's 27-row WS table equals the registry field by field; no K01-K06 item needs a frozen
core-crypto edit (spec 18 uses only exports at `packages/core-crypto/src/index.ts:7-15`; contracts/src, core-crypto/src and
scheme1.json unchanged since `beb525dd`); 23 relative links, 0 broken; drift checks (1) and (2) pass on today's `main`;
spot-runs green (below). No instruction or default adds custody, a mandatory backend, telemetry, an automatic clipboard write
or an anonymity overclaim.

## 2. Coverage of the owner-brief requirements

| # | Requirement | Prompt § | Status | Fix |
|---|---|---|---|---|
| 1 | Self-contained for a fresh Opus 5.5 session | 0, all | WEAK: Info findings absent, planned files unmarked, census call broken, `$SP/` paths in criteria/graph/sequence | H2-29, 48, 49, 52, 131-134 |
| 2 | Verified repo SHAs | 4 | WEAK: `main` moved to `5467c158` (#203 merged), #206-#217 unknown | H2-03..06, 38, 39 |
| 3 | Strict noncustodial | 6.1, 3 | OK (F-CLI-06 refund execute correctly never built) | — |
| 4 | Static client-only (Pages/HTTPS/Tor), no mandatory backend | 6.2 | OK | — |
| 5 | Privacy-first: explicit RPC, no fallback, no telemetry, no secret logs, fail closed, no overclaims | 6.3, 9 checklist, 12 reviewer rules | OK; dual-provider readback wording reads as a mandatory 2nd provider | H2-37, 104-106 |
| 6 | Key portability per spec 18 | 6.4, 13 | WEAK: OD-01 default blocks the v1 backup; parallel #213 format | H2-01, 30, 36, 71-83 |
| 7 | Preserve experimental work separately | 6.5, 7.4 | OK | — |
| 8 | Unfinished feature IDs with completion % | 7.1-7.4 | WEAK: stale vs rescored matrix (7.4 lists IDs without %; pointer to JSON is enough) | H2-11..25 |
| 9 | Recoverable branch work | 8 | WEAK: #204 superseded by #206; deps by #207/#210; harness file already exists | H2-26..28 |
| 10 | Dependency ordering | 11 + registry | OK (DAG acyclic, VERIFIED) | — |
| 11 | Agent assignments | 12 | WEAK: tiers not mapped to model/effort | H2-40 |
| 12 | Worktree ownership | 12 | WEAK: integration worktree command not executable; 2 glob overlaps; validator unpackaged | H2-40, 42, 59, 112-119, 140 |
| 13 | Acceptance criteria | 13 + criteria file | OK; OD-01/F-WEB-11 criteria and 3 row headers wrong | H2-80..83, 126-130 |
| 14 | Security requirements | 9 | WEAK: SEC-31..SEC-49 missing (6 block sepolia-beta/release-tag/mainnet) | H2-29 |
| 15 | CI gates | 12, 13 | WEAK: undefined vars, 4 CI steps missing, two gate definitions, WS-20.3 removes PR gates | H2-45-47, 53, 93-95, 138, 139, 143, 144 |
| 16 | Integration procedures | 14 | WEAK: no `origin/main` sync, push only at CPs | H2-02, 55 |
| 17 | Durable handoffs | 15, 16 | WEAK: worker WIP unpushed, no restart recovery, chat-only final report | H2-56..58 |
| 18 | Authorization boundaries | 3 | WEAK: mark-ready contradiction, other-PR writes and workflow dispatch unspecified, own-branch force-push allowed | H2-07..09 |
| 19 | Final completion criteria | 17 | OK | H2-58 |
| 20 | Implement every technically unblocked unfinished feature | 2, 17 | WEAK: 7 unblocked rows deferred; owner-ack recorded by engineering | H2-10, 33, 79, 84-92 |
| 21 | Reuse existing code | 2, 13 | OK; WS-11.1 would re-implement an existing check | H2-101..103 |
| 22 | Independently verify milestones | 12, 14.2 | OK | — |
| 23 | Integrate into an authorized integration branch | 3, 14 | OK (mechanics fixed by H2-40/59) | — |
| 24 | Continue through later features, no stop after one milestone | 2 | OK | — |
| 25 | Never declare success with red/unrun gates | 17 | OK | — |
| 26 | No public deploy, protected-main merge, release or irreversible branch deletion without owner | 3 | OK | — |
| 27 | Caveman for agent communication + fallback | 1, 15 | OK; worker handoff format contradicts section 12 | H2-56 |
| 28 | Opus 5.5 / xhigh | 1 | WEAK for sub-agents (API default effort `medium`) | H2-40 |
| 29 | Coordination with concurrent writers (needed by 9 and 16) | 14.6 (ChatGPT rotation only) | MISSING | H2-01, 02 |

Tally: 14 OK, 14 WEAK, 1 MISSING.

## 3. Results per check

### C2 Contradictions (prompt-internal and prompt vs package)

| Topic | Conflict | Fix |
|---|---|---|
| Push policy | Consistent (designated branch only). Cadence: section 14.4 "every checkpoint" vs section 15 "after every qualified milestone"; PLAN 9.5 "every checkpoint" | H2-55 |
| `ws/WS-00-integration` vs designated branch | Naming note exists, but PLAN 2 / WS-00.1 run `git worktree add ../wt/WS-00-integration -b ws/WS-00-integration`; WS-00/20/22 cards give one worktree three branches (`ws/WS-00-rebaseline`, `ws/WS-20-ci-release`, `ws/WS-22-tooling-deps`) | H2-40, 59, 114-119 |
| PR base rule | `main` if #203 merged, else stack on `nodata/wizardly-allen-qwol6u`: consistent; today = `main` | — |
| START_SHA rule | Prompt: falls back to `7a620ff1`; PLAN 2: STOP and ask the owner; PLAN's docs filter `grep -vE '^docs/|\.md$'` also passes CLAUDE.md/AGENTS.md/skills, the prompt's `':!docs'` does not. Moot today (both choose `main` = `5467c158`; non-doc diff vs `7a620ff1` empty, VERIFIED) | note only |
| Frozen paths vs spec 18 | No conflict: K01-K06 need only exported core-crypto API (VERIFIED); escalation path for a frozen-path need was missing | H2-42 |
| REQUIRE_ANVIL | Consistent ("never globally", TB-01 VERIFIED `release.yml:86-88`); `$SOLC_0828` undefined | H2-143, 144 |
| Reviewer rules | Prompt = PLAN 7; "weakened CSP = blocking" vs BLOCKERS TB-02 (08:00Z) loopback-wildcard fix | H2-44, 107-111, 129 |
| Mark-ready | Prompt 3 allows marking PRs ready "on behalf of the owner"; PLAN 10 forbids mark-ready of #203/#204 (OA-02 owner) | H2-07 |
| Counts | 27 WS / 106 items / CP-0..CP-9 consistent (VERIFIED); 155/37/68 vs package 154/38/67 | H2-11..25, 120, 121, 124, 125 |
| OD-01 | Prompt 10, PLAN/SEQ/registry WS-07.1, criteria 8, strategy F-KEY-01 vs BLOCKERS OD-01 + SEC-03 (08:00Z) | H2-30, 36, 71-83 |
| OD-09 | WS-03.2 "score>=3 or generated" vs prompt/BLOCKERS ≈80-bit and WS-18 `high` tier (same item text also says "tier high") | H2-67..70 |
| OD-15 | Prompt 8.1/10 "port #204" vs BLOCKERS OD-15 (08:00Z) "review and merge #206 instead" | H2-26, 31 |
| OD-16 | Prompt/BLOCKERS "keep today's behaviour" vs PLAN/SEQ/registry/graph "selector lists only shipped locales" | H2-32, 60-66 |
| OD-01 sweep | Criteria/strategy F-WEB-11 "sweep requires step-up or vault prompt" vs default "sweep unchanged but warned" | H2-81, 83 |
| WS-19.5 | PLAN "transfer signed by the tool" vs prompt 13 / NEXT_PHASE_QUEUE K04 "via the independent tool (cast/anvil)" | H2-96..100 |
| WS-20.3 | "Mythril on nightly + tag only", "affected-only lint/typecheck on PRs" vs prompt 3 (no gate weakening) | H2-93..95 |
| WS-11.1 | SEQ/PLAN/registry 0.7-1.5 d new code vs strategy/criteria/graph "records only ~0.1 d" (F-PROTO-03 complete) | H2-101..103 |
| Owner chain | Prompt 11: `OA-04 -> OA-06) -> WS-05.4`; SEQUENCE 3a: `OA-04 -> WS-05.4 -> OA-06` (the dispatch must bundle the signed manifest) | H2-35 |
| Handoff format | Prompt 15 `TASK/SCOPE/...` vs prompt 12 / PLAN 3.6 `HANDOFF <WS-ID>` block | H2-56 |
| Shared-file requests | Prompt 14.1 "patch request in handoff, no edit" vs prompt 12 / PLAN 3.2 `coord-request(<WS>)` commit | H2-54 |
| Checkpoint gate | Prompt 13 list (plain `npm test`, skips anvil suites) vs prompt 12 G-FULL | H2-53 |
| Force-push | Prompt 3 implicitly allows rewriting the designated branch; PLAN 3.1/9.9 never | H2-08 |
| WS-90 | "Experimental (45)" includes complete F-NET-04; 7.4 says 44 unfinished | H2-43 |

### C3 Constraint violations and gate weakening

| Item | Constraint | Status | Fix |
|---|---|---|---|
| OD-01 default refuses keystore v1 backup in vault-less sessions | 4 (encrypted backups), 3 (pushes keys into shared-origin storage, SEC-01) | CONFIRMED in prompt/plan/criteria text; corrected only in BLOCKERS | H2-30 cluster |
| WS-20.3 Mythril off PRs, affected-only lint/typecheck | gate weakening (prompt 3, PLAN 10) | CONFIRMED in plan text | H2-93..95 |
| WS-19.5 tool-signed spend tx (hand-rolled ECDSA) | 4 (independent recovery must be safe on real keys) | CONFIRMED in plan text | H2-96..100 |
| WS-24.3 / BR-09 dual-provider readback without "opt-in" | 3 (explicit RPC selection, no fallback) | WEAK wording; criteria F-WEB-17 is correct | H2-37, 104-106 |
| TB-02 loopback CSP widening vs "never weaken CSP" | 3 / gate rule | AMBIGUOUS | H2-44 |
| WS-12.3 trims locale selector | owner decision (prompt 3) | CONFIRMED in plan text | H2-60..66 |
| "owner ack recorded (no canonical ID)" | silence-as-approval (BLOCKERS rule) | CONFIRMED | H2-84..89 |
| Custody, mandatory backend, telemetry, automatic clipboard, overclaim | 1-3 | none found (prompt 3/6/10, PLAN 10, reviewer rules read in full) | — |

### C4 Executability (VERIFIED at `7a620ff1` unless noted)

Commands run (read-only): `npm query .workspace | jq -r '.[].location'` → 68 workspaces (G-FULL pipeline works);
`node --test apps/web/scripts/localBuildProfile.test.mjs` → 33/33, exit 0; `node scripts/check-chain-matrix.mjs` → exit 0
(14 chains, 9 tokens, 4 feeds), `--release` → exit 1 (fails closed as documented); `bash scripts/check-actions-pinned.sh` →
111 pinned, exit 0; drift (1) `merge-base --is-ancestor 7a620ff1 main(5467c158)` → 0, drift (2) non-doc diff → empty;
`rev-list --count cfaebeea..7a620ff1` = 1484; trees `594c9f6a` / `36177d29` match the prompt. Patched G-FULL blocks: `bash -n`
OK.

- Existing as cited: `scripts/qualify-lean.sh` (one absolute new dir), `scripts/pages/{smoke.mjs (--commit 40-hex),
  serve-pages.mjs, build-pages.sh, smoke-url.mjs, verify-pages-site.mjs}`, `apps/web/scripts/{validate-deployments.mjs
  (GHOSTPAY_RELEASE_PUBKEYS), scan-bundle.mjs, csp.mjs, embed-sri.mjs, localBuildProfile(.test).mjs,
  test-reconciliation-idb.mjs (:71 `invalidateFrom(100n)`), test-seller-vault-idb.mjs (75 lines)}`,
  `scripts/check-chain-matrix.mjs` (only `[--release]`), `scripts/testnet/deploy.sh` (`<network>
  [simulate|rehearse|broadcast]`), all `scripts/tests/*.test.mjs` named by WS-05/06/20, `.github/actions/setup-forge`
  (Foundry v1.8.5, svm 0.8.28), `scripts/i18n/check.mjs`, `deploy/selftest.sh`, `infra/proxy/check-headers.sh`, npm scripts
  `ci:scan-secrets`, `ci:check-actions`, `build:libs`, `build:cli`, `test:dependency-tooling`, `test:compiled -w @ghostpay/cli`.
- Planned (absent at `7a620ff1`; unmarked in the prompt, H2-48): `tools/independent-recovery/**`, `scripts/agent/**` (arrives
  with #206), `scripts/tests/privacy-claims.test.mjs`, `scripts/testnet/sign-manifest.mjs`, `check-chain-matrix.mjs --revalidate
  --rpc`, `apps/web/src/lib/{stepUp,frameGuard,rootErrors,eraseAll,stealthExport}.ts`, `apps/web/src/views/PaymentDetails.tsx`,
  `apps/web/src/i18n/literals.test.ts`, `packages/ux-vault/src/passphrase-policy.ts`, `test-vectors/{keystore-v1-golden,
  stealth-export-v1}.json`, `docs/developer/{key-portability-formats,relayer-privacy}.md`, `docs/recovery/independent-recovery.md`,
  `packages/cli/test/backup-independent.test.mjs`, e2e `{scan-transport-csp,stealth-export,master-backup,stealth-archive,
  erase-all,framing,focus-scope}.spec.ts`.
- Broken as written: G-FULL `$SOLC_0828`, `$START` (H2-45, 143, 144); `branch_census.py` without args (H2-49); PLAN 2
  worktree/branch command (H2-59); BLOCKERS OD-16 path `apps/web/src/components/LanguagePicker.tsx` → real file
  `apps/web/src/i18n/LanguagePicker.tsx` (H2-141); coordinator-owned `apps/web/vitest.config.ts` does not exist (config is in
  `vite.config.ts`; harmless, note).
- G-FULL omits CI steps: Foundry `packages/pool-contracts` and `packages/payer-hiding-contracts` (`ci.yml:473-506`; the
  baseline cites 86/0 and 109/0), `examples/*` tests (`ci.yml:111`), `scripts/tests/audit-permissions.test.py` (`ci.yml:553`)
  (H2-46, 139).
- IDs: every `WS-xx.n`, `WS-xx`, `SEC-xx`, `F-…`, `OD/OA/EX/TB/AC-xx` referenced in the 7 markdown files exists (script).
- DAG: 106 items, 0 cycles including CP nodes, 0 unknown deps; `checkpoint_order` omits implied edges (CP-2→CP-4 via
  WS-24.1→24.2, CP-3→CP-5 via WS-23.1, CP-4→CP-6 via WS-06.1→06.2): no cycle, Info.
- Feature assignment: registry `features` covers 149 of 154 unfinished rows; F-KEY-01, F-KEY-02, F-WEB-07, F-WEB-11, F-WEB-12
  appear only in the prompt table and `completion_strategy.json` (H2-135..137). WS-11 owns complete F-PROTO-03; WS-90 lists
  complete F-NET-04.
- Ownership: independent glob check found 2 overlaps not covered by handovers, both between WS that the plan runs
  concurrently in the CP-2→CP-4 window (WS-02 `docs/user/**` ⊃ WS-09 `docs/user/master-backup-recovery.md`; WS-10
  `Pay*.test.tsx` ⊃ WS-08 `PaymentDetails*.test.tsx`); the plan's validator (`model.py`) compares per CP number only and is
  not packaged (H2-42, 112, 113, 140).

### C5 Missing items a fresh session needs

Concurrent-writer protocol and claims census (H2-01, 02); sync with a moving `main` (H2-02); tier → model/effort mapping
(H2-40); integration worktree mechanics (H2-40, 59); durability of worker WIP, push cadence, restart recovery (H2-55..57);
Info findings SEC-31..49 with closing WS (H2-29); owner decision for documented limitations, OD-23 (H2-33, 79); workflow
dispatch authorization (CP-7 needs run ids of path-filtered workflows) and the ban on writes to other PRs (H2-07);
planned-vs-existing file list (H2-48); `npm run build:libs` after each fast-forward (H2-41); designated-branch fallback
(H2-09); package materialization (H2-52); census arguments (H2-49); unshallow before the first fetch (H2-50); Foundry-absent
rule (H2-51). PR #204 handling and the ChatGPT writer are covered once H2-26/31 and H2-02 are applied.

### C6 Package level

- Links: 23 relative markdown links across the 12 markdown files (the 14 numbered package files = 12 `.md` + 2 JSON twins),
  0 broken (script, re-run on the live package 08:05Z). Backtick names that are not
  package files are repo files or explicitly "not packaged" evidence (`coverage.json`, `census_final_addendum.json`).
- README (08:00Z) vs `evidence/features/stats.json` (08:01Z): all headline numbers match (38/28/28/46/45/7, 154 unfinished,
  beta-core 42/18, 87.2/83.5, 79.7/74.8, 73.8/69.1, 41-104, 202-462, 309-920) except "(155 + 1 resolved)" → 154 + 2
  (VERIFIED `completion_strategy.json` 156 rows, 2 VERIFIED_COMPLETE) (H2-125); "22 owner decisions" becomes 23 with OD-23
  (H2-90).
- Prompt vs stats: H2-11..25. SEQUENCE: 87.8/83.9 and "42.5-106 d" stale (H2-120, 121). Graph: "155 (151 − 1 + 5)" (H2-124).
  Criteria: F-NET-01, F-WEB-09, F-BTC-01 headers stale, section 8 lacks the F-KEY-03 hold (H2-126..130).
  `completion_strategy.json` F-WEB-07 rationale says "row is PARTIAL" while its status is IMPLEMENTED_UNVERIFIED 90/90 (H2-142).
- Non-portable `$SP/...` paths: criteria ×3, graph ×3, SEQUENCE ×1 (fixed by H2-131..134 for criteria/graph/sequence; the 8
  in `completion_strategy.json` are left, listed here: lines 9064, 10987, 11202, 12516, 12625, 12732, 12840, 12947).

## 4. Issue clusters → corrections

| Cluster | Severity | Corrections |
|---|---|---|
| K1 Concurrent sessions / claims / spec 18 single source / #204 and deps already in flight | blocker (H2-01), major | H2-01, 02, 05, 13, 26, 27, 31 |
| K2 Baseline drift (#203 merged, OA-02 done) | major | H2-03, 04, 06, 34, 38, 39, 122, 123 |
| K3 Feature register stale vs rescored matrix | major | H2-11, 12, 14..25, 120, 121, 124..128, 130, 142 |
| K4 OD-01 default blocks keystore v1 backup | major | H2-30, 36, 71..78, 80..83 |
| K5 OD-09 floor weakened (WS-03.2) | major | H2-67..70 |
| K6 OD-16 decided by plan; wrong path | major | H2-32, 60..66, 141 |
| K7 WS-20.3 removes PR gates | major | H2-93..95 |
| K8 WS-19 hand-rolled signer | major | H2-96..100 |
| K9 Deferred unblocked rows / owner-ack without ID (OD-23) | major | H2-10, 33, 79, 84..92 |
| K10 Tiers unmapped; integration worktree not executable | major | H2-40, 59, 114..119 |
| K11 Authorization gaps | major | H2-07, 08, 09 |
| K12 Durability | major | H2-55, 56, 57, 58 |
| K13 Info findings missing from section 9 | major | H2-29 |
| K14 G-FULL / gate executability | major | H2-45, 46, 47, 48, 53, 138, 139, 143, 144 |
| K15 TB-02 CSP exception | major | H2-44, 107..111, 129 |
| K16 Ownership overlaps, frozen escalation, held-row assignment | minor | H2-42, 112, 113, 135..137, 140 |
| K17 Smaller executability / wording | minor | H2-28, 35, 37, 41, 43, 49..52, 54, 101..106, 131..134 |

Not turned into corrections (notes): CP-2 (spec 18 format freeze) waits for WS-20.3 CI-speed work and WS-24.1, which are
unrelated to the freeze (schedule risk; consider moving WS-20.3 to CP-3); PLAN 2 docs-only filter vs prompt drift check
(moot today); `checkpoint_order` implied edges; `completion_strategy.json` `$SP` paths.

## 5. UNVERIFIED / limits

- Other sessions' claims and PR states are a 07:55Z snapshot; they change by the hour (re-census rule H2-01 handles it).
- #213's format was not reviewed for spec 18 conformance (only its file list and commit subjects); compatibility with WS-03's
  planned ids is INFERRED to differ from the file names.
- Whether the Claude Code harness lets a coordinator set per-sub-agent model/effort is INFERRED; H2-40 falls back to
  inheriting the session's `xhigh`.
- Branch protection (AC-01) unreadable; G-FULL itself not run (no Foundry/solc here; heavy); `fetch-entrypoint.sh` needs the npm
  registry (INFERRED reachable in a default environment).
- Model IDs/effort levels (Opus 5.5 `claude-opus-5-5`, API default effort `medium`, levels low..max) from the bundled
  claude-api skill reference (cached 2026-11-03).

## 6. Corrections index (apply in this order; exact strings in the appendix and `corrections_h2.json`)

| # | ID | File | Severity | Reason (short) |
|---|---|---|---|---|
| 1 | H2-01 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | blocker | At 07:55Z at least five other sessions had open PRs (#206, #209, #211, #212, #213) whose claims cover spec 18 (WS-03/08/09/19/25), the #204 port (WS-22.1), transport/CSP… |
| 2 | H2-02 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | Other sessions merge into `main` while this one runs; without a rule to merge `origin/main` the draft PR (base `main`) drifts into conflicts and the frozen-path diff aga… |
| 3 | H2-03 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | `main` moved to 5467c158 (PR #203 merged 06:56:49Z) before this package was finalized; BLOCKERS/README were updated (OA-02 done), the prompt was not. |
| 4 | H2-04 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | Same drift as H2-03. |
| 5 | H2-05 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | The baseline must name the concurrent writers the new step 2a acts on. |
| 6 | H2-06 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | PR census stale (VERIFIED search API 07:55Z). |
| 7 | H2-07 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | The NOT AUTHORIZED list contained a permission ('marking PRs ready ... is allowed') that contradicts PLAN section 10 ('NO mark-ready/merge of PR #203/#204 (OA-02 is owne… |
| 8 | H2-08 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | As written it permits force-pushing the integration branch, contradicting PLAN 3.1/9.9 ('never force-push', 'integration branch never rewritten'). |
| 9 | H2-09 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | No fallback when the harness names no designated branch. |
| 10 | H2-10 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | The plan defers seven technically unblocked rows and has items that 'record owner ack (no canonical ID)' (WS-02.6, WS-10.3): that decides an owner item and treats silenc… |
| 11 | H2-11 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | The package's matrix/stats/README were rescored at 08:01Z (154 unfinished, 38 complete); the prompt still carries the pre-H1 numbers, so the primary deliverable contradi… |
| 12 | H2-12 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | Same rescoring (stats.json aggregate_release_scope_beta / aggregate_all_excluding_future / aggregate_all). |
| 13 | H2-13 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | VERIFIED: refs/pull/213/head a199c21 adds packages/ux-vault/src/stealth-export-portable.ts and scripts/recovery/*. |
| 14 | H2-14 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | 24 + 24 + 19 after the rescoring. |
| 15 | H2-15 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | F-WEB-09 is VERIFIED_COMPLETE now. |
| 16 | H2-16 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | completion_strategy.json F-KEY-03.security_hold = SEC-05, SEC-03 since 08:00Z. |
| 17 | H2-17 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | Row is VERIFIED_COMPLETE (moves to 7.3); WS-02.4 stays as the TB-06 script fix. |
| 18 | H2-18 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | F-BTC-01 moved to full-profile. |
| 19 | H2-19 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | Tier is full-profile after the rescoring (re-inserted by H2-23). |
| 20 | H2-20 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | Rescored row. |
| 21 | H2-21 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | Rescored row; no longer a security-hold row. |
| 22 | H2-22 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | F-BTC-01 added. |
| 23 | H2-23 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | Re-insert F-BTC-01 in the full-profile table. |
| 24 | H2-24 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | Rescored count. |
| 25 | H2-25 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | F-WEB-09 is complete. |
| 26 | H2-26 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | VERIFIED refs/pull/206/head c487f0f (3 commits on 71abc7e5, the 11 #204 files). Porting again duplicates it and re-creates the CLAUDE.md/ci.yml conflicts (BLOCKERS OD-15… |
| 27 | H2-27 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | Avoid a third, competing dependency refresh. |
| 28 | H2-28 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | VERIFIED: the file exists at 7a620ff1 (75 lines); 'recover file' alone suggests it is missing. |
| 29 | H2-29 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | Section 9 says 'close every finding below' but lists only SEC-01..SEC-30; the 19 Info findings, six of which block sepolia-beta/release-tag/mainnet gates (SEC-32/33/41/4… |
| 30 | H2-30 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | VERIFIED apps/web/src/views/SellerKeys.tsx:205-231 @7a620ff1: the keystore v1 download (the only encrypted backup of in-memory keys, and the verified-backup gate) goes t… |
| 31 | H2-31 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | Aligns with BLOCKERS OD-15 (08:00Z) and H2-26. |
| 32 | H2-32 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | Full path (VERIFIED) and explicit no-trim rule; PLAN/SEQUENCE/registry WS-12.3 currently say the opposite (H2-60..64). |
| 33 | H2-33 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | The owner-ack rows have no canonical ID (IMPLEMENTATION_SEQUENCE section 0), so the owner cannot find or answer them; BLOCKERS gets the matching OD-23 row (H2-79). |
| 34 | H2-34 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | OA-02 is done (BLOCKERS 08:00Z). |
| 35 | H2-35 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | The Pages dispatch (OA-06) must come after WS-05.4 bundles the signed manifest (IMPLEMENTATION_SEQUENCE 3a order); the prompt put OA-06 before WS-05.4. |
| 36 | H2-36 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | Same OD-01 alignment as H2-30. |
| 37 | H2-37 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | Constraint 3 (explicit RPC selection, no fallback): FEATURE_ACCEPTANCE_CRITERIA F-WEB-17 says 'with a secondary RPC configured'; the prompt/plan wording reads as a manda… |
| 38 | H2-38 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | Drift (H2-03). |
| 39 | H2-39 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | Follows H2-38. |
| 40 | H2-40 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | The registry/plan use strongest/mid/cheap tiers but nothing maps them to a model or effort (owner brief: Opus 5.5 / xhigh). PLAN 2 creates a second branch `ws/WS-00-inte… |
| 41 | H2-41 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | A worker that fast-forwards onto another WS's library change (e.g. ux-vault) fails typecheck/tests without rebuilding dist. |
| 42 | H2-42 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | Independent overlap check (H2 ownership_H2.py) found two glob overlaps between WS that the plan runs concurrently (CP-2->CP-4 window: WS-08 with WS-10; WS-02.7/02.8 with… |
| 43 | H2-43 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | WS-90's experimental list includes the VERIFIED_COMPLETE F-NET-04 (registry check); section 7.4 says 44 unfinished. |
| 44 | H2-44 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | BLOCKERS TB-02 (08:00Z) now prescribes loopback origins with any port because a static meta CSP cannot be narrowed to the chosen port; the reviewer rule 'weakened CSP =… |
| 45 | H2-45 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | `$SOLC_0828` and `$START` were never defined in the prompt. With SOLC_BIN empty, apps/web/src/features/registry/registry.anvil.test.ts:16-18,61-62 fails under REQUIRE_AN… |
| 46 | H2-46 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | G-FULL omitted three CI test steps (two Foundry projects that section 4's baseline cites as 86/0 and 109/0, the examples tests and the python audit test), so a local CP… |
| 47 | H2-47 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | 'blocked here' refers to the audit container, not the reader's. |
| 48 | H2-48 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | A fresh session running the CP table at START would see 'missing file' failures and could not tell planned from broken. |
| 49 | H2-49 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | VERIFIED evidence/scripts/branch_census.py:3,10: four positional arguments are required; the documented call has none and the script is not in the integration branch's t… |
| 50 | H2-50 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | The unshallow check sat only in the drift checks, after the first fetch; this audit's own census was wrong in a shallow clone. |
| 51 | H2-51 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | Without Foundry the apps/web REQUIRE_ANVIL line fails, so 'only contract gates are blocked' was not true as written. |
| 52 | H2-52 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | Most package files are needed as a set (registry, criteria, scripts); FETCH_HEAD is overwritten by later fetches. |
| 53 | H2-53 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | Two different 'checkpoint gate' definitions (section 12 G-FULL vs section 13 list with plain `npm test`, which silently skips the anvil suites). |
| 54 | H2-54 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | Contradicted section 12 (coord-request commit) and PLAN 3.2. |
| 55 | H2-55 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | Checkpoints are days apart (CP-1 at 4-8 d); an unpushed rolling merge is lost on a container restart. |
| 56 | H2-56 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | Two conflicting worker handoff formats; and multi-day worker items (WS-08.1 6-10 d) exist only in unpushed local worktrees, so a container restart loses them. |
| 57 | H2-57 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | Owner brief asks for durable handoffs; restart recovery was absent from the prompt. |
| 58 | H2-58 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | minor | A chat-only final report is not durable. |
| 59 | H2-59 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | major | Not executable under the prompt's naming rule: the designated branch is already checked out in the main checkout, so `git worktree add ... -b <designated>` fails, and a… |
| 60 | H2-60 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | major | Contradicts the prompt's OD-16 default and BLOCKERS OD-16 ('Keep today's behaviour'); a worker following the card would decide an owner item (prompt section 3). |
| 61 | H2-61 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | major | Same as H2-60. |
| 62 | H2-62 | `IMPLEMENTATION_SEQUENCE.md` | major | Same as H2-60. |
| 63 | H2-63 | `IMPLEMENTATION_SEQUENCE.md` | major | Same as H2-60. |
| 64 | H2-64 | `ws_registry.json` | major | Same as H2-60 (registry objectives). |
| 65 | H2-65 | `ws_registry.json` | major | Same as H2-60 (registry WS-12.3 unblocked reason). |
| 66 | H2-66 | `FEATURE_DEPENDENCY_GRAPH.md` | major | Same as H2-60. |
| 67 | H2-67 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | major | WS-03.2's status text sets a weaker floor than OD-09's default (prompt section 10 and BLOCKERS: generated diceware, about 80 bits) and than WS-18's `high` tier; the same… |
| 68 | H2-68 | `IMPLEMENTATION_SEQUENCE.md` | major | WS-03.2's status text sets a weaker floor than OD-09's default (prompt section 10 and BLOCKERS: generated diceware, about 80 bits) and than WS-18's `high` tier; the same… |
| 69 | H2-69 | `ws_registry.json` | major | WS-03.2's status text sets a weaker floor than OD-09's default (prompt section 10 and BLOCKERS: generated diceware, about 80 bits) and than WS-18's `high` tier; the same… |
| 70 | H2-70 | `completion_strategy.json` | major | WS-03.2's status text sets a weaker floor than OD-09's default (prompt section 10 and BLOCKERS: generated diceware, about 80 bits) and than WS-18's `high` tier; the same… |
| 71 | H2-71 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | major | VERIFIED SellerKeys.tsx:205-231 @7a620ff1: the keystore v1 download calls authorizeKeyExport; refusing without a vault blocks the first (and verified) backup of freshly… |
| 72 | H2-72 | `IMPLEMENTATION_SEQUENCE.md` | major | VERIFIED SellerKeys.tsx:205-231 @7a620ff1: the keystore v1 download calls authorizeKeyExport; refusing without a vault blocks the first (and verified) backup of freshly… |
| 73 | H2-73 | `ws_registry.json` | major | Same as H2-71 (registry WS-07.1 'what'). |
| 74 | H2-74 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | major | Same as H2-71 (WS-07 objective). |
| 75 | H2-75 | `ws_registry.json` | major | Same as H2-74 (registry). |
| 76 | H2-76 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | major | Same as H2-71. |
| 77 | H2-77 | `IMPLEMENTATION_SEQUENCE.md` | major | Same as H2-71. |
| 78 | H2-78 | `IMPLEMENTATION_SEQUENCE.md` | major | Same as H2-71. |
| 79 | H2-80 | `completion_strategy.json` | major | Same as H2-71 (F-KEY-01 implementation criteria). |
| 80 | H2-81 | `completion_strategy.json` | minor | F-WEB-11 criterion required a step-up/vault prompt, contradicting the OD-01 default 'sweep unchanged but warned'. |
| 81 | H2-82 | `FEATURE_ACCEPTANCE_CRITERIA.md` | major | Same as H2-71 (criteria section 8, F-KEY-01). |
| 82 | H2-83 | `FEATURE_ACCEPTANCE_CRITERIA.md` | minor | Same as H2-81 (criteria section 8, F-WEB-11). |
| 83 | H2-84 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | major | An item that 'records' an owner acknowledgement which has no canonical ID treats silence as approval (BLOCKERS rule) and decides an owner item (prompt section 3). |
| 84 | H2-85 | `IMPLEMENTATION_SEQUENCE.md` | major | An item that 'records' an owner acknowledgement which has no canonical ID treats silence as approval (BLOCKERS rule) and decides an owner item (prompt section 3). |
| 85 | H2-86 | `ws_registry.json` | major | An item that 'records' an owner acknowledgement which has no canonical ID treats silence as approval (BLOCKERS rule) and decides an owner item (prompt section 3). |
| 86 | H2-87 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | major | An item that 'records' an owner acknowledgement which has no canonical ID treats silence as approval (BLOCKERS rule) and decides an owner item (prompt section 3). |
| 87 | H2-88 | `IMPLEMENTATION_SEQUENCE.md` | major | An item that 'records' an owner acknowledgement which has no canonical ID treats silence as approval (BLOCKERS rule) and decides an owner item (prompt section 3). |
| 88 | H2-89 | `ws_registry.json` | major | An item that 'records' an owner acknowledgement which has no canonical ID treats silence as approval (BLOCKERS rule) and decides an owner item (prompt section 3). |
| 89 | H2-79 | `BLOCKERS_AND_DECISIONS.md` | major | The owner-ack decision exists in the plan (lost-team OD-16, 'no canonical ID') but not in BLOCKERS, so the owner cannot see or answer it. |
| 90 | H2-90 | `README.md` | minor | Follows H2-79 (OD-23). |
| 91 | H2-91 | `IMPLEMENTATION_SEQUENCE.md` | minor | Follows H2-79. |
| 92 | H2-92 | `ws_registry.json` | minor | Follows H2-79. |
| 93 | H2-93 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | major | VERIFIED .github/workflows/contract-analysis.yml:3-12 runs Echidna+Mythril on pull_request; moving Mythril to nightly+tag and making lint/typecheck affected-only remove… |
| 94 | H2-94 | `IMPLEMENTATION_SEQUENCE.md` | major | VERIFIED .github/workflows/contract-analysis.yml:3-12 runs Echidna+Mythril on pull_request; moving Mythril to nightly+tag and making lint/typecheck affected-only remove… |
| 95 | H2-95 | `ws_registry.json` | major | VERIFIED .github/workflows/contract-analysis.yml:3-12 runs Echidna+Mythril on pull_request; moving Mythril to nightly+tag and making lint/typecheck affected-only remove… |
| 96 | H2-96 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | major | NEXT_PHASE_QUEUE K04 and prompt section 13 require the spend proof 'via the independent tool (pinned Foundry cast/anvil)'; WS-19.5 instead has the new zero-dependency to… |
| 97 | H2-97 | `IMPLEMENTATION_SEQUENCE.md` | major | NEXT_PHASE_QUEUE K04 and prompt section 13 require the spend proof 'via the independent tool (pinned Foundry cast/anvil)'; WS-19.5 instead has the new zero-dependency to… |
| 98 | H2-98 | `ws_registry.json` | major | Same as H2-96 (registry WS-19.5). |
| 99 | H2-99 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | major | Same as H2-96 (WS-19 objective). |
| 100 | H2-100 | `ws_registry.json` | major | Same as H2-96 (WS-19 objective). |
| 101 | H2-101 | `IMPLEMENTATION_SEQUENCE.md` | minor | VERIFIED logs.ts:460 @7a620ff1 ('log block hash differs from canonical block'); completion_strategy/criteria/graph all say WS-11.1 shrinks to records (~0.1 d) but the se… |
| 102 | H2-102 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | minor | Same as H2-101. |
| 103 | H2-103 | `ws_registry.json` | minor | Same as H2-101. |
| 104 | H2-104 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | minor | Constraint 3 (explicit RPC selection, no fallback, no unnecessary third-party requests); matches FEATURE_ACCEPTANCE_CRITERIA F-WEB-17 ('with a secondary RPC configured',… |
| 105 | H2-105 | `IMPLEMENTATION_SEQUENCE.md` | minor | Constraint 3 (explicit RPC selection, no fallback, no unnecessary third-party requests); matches FEATURE_ACCEPTANCE_CRITERIA F-WEB-17 ('with a secondary RPC configured',… |
| 106 | H2-106 | `ws_registry.json` | minor | Constraint 3 (explicit RPC selection, no fallback, no unnecessary third-party requests); matches FEATURE_ACCEPTANCE_CRITERIA F-WEB-17 ('with a secondary RPC configured',… |
| 107 | H2-107 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | minor | BLOCKERS TB-02 (08:00Z) states the per-port narrowing is impossible in a static meta CSP; the item text still prescribes it. |
| 108 | H2-108 | `IMPLEMENTATION_SEQUENCE.md` | minor | BLOCKERS TB-02 (08:00Z) states the per-port narrowing is impossible in a static meta CSP; the item text still prescribes it. |
| 109 | H2-109 | `ws_registry.json` | minor | BLOCKERS TB-02 (08:00Z) states the per-port narrowing is impossible in a static meta CSP; the item text still prescribes it. |
| 110 | H2-110 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | minor | Same as H2-107 (WS-01 objective). |
| 111 | H2-111 | `ws_registry.json` | minor | Same as H2-107 (WS-01 objective). |
| 112 | H2-112 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | minor | VERIFIED ls apps/web/src/views: Pay.test.tsx, Pay.i18n/.invoiceQr/.supported.test.tsx; the glob Pay*.test.tsx also captures WS-08's new PaymentDetails*.test.tsx while bo… |
| 113 | H2-113 | `ws_registry.json` | minor | Same as H2-112 (registry WS-10 owned_paths). |
| 114 | H2-114 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | major | Same as H2-59 (WS-00.1). |
| 115 | H2-115 | `IMPLEMENTATION_SEQUENCE.md` | major | Same as H2-59 (WS-00.1). |
| 116 | H2-116 | `ws_registry.json` | major | Same as H2-59 (registry WS-00.1). |
| 117 | H2-117 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | minor | Three coordinator WS shared one worktree with three different branches. |
| 118 | H2-118 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | minor | Three coordinator WS shared one worktree with three different branches. |
| 119 | H2-119 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | minor | Three coordinator WS shared one worktree with three different branches. |
| 120 | H2-120 | `IMPLEMENTATION_SEQUENCE.md` | minor | Stale vs evidence/features/stats.json (08:01Z). |
| 121 | H2-121 | `IMPLEMENTATION_SEQUENCE.md` | minor | Stale vs stats.json effort_days_unfinished_beta_scope [41, 104]. |
| 122 | H2-122 | `IMPLEMENTATION_SEQUENCE.md` | minor | Drift (H2-03). |
| 123 | H2-123 | `IMPLEMENTATION_SEQUENCE.md` | minor | Follows H2-122. |
| 124 | H2-124 | `FEATURE_DEPENDENCY_GRAPH.md` | minor | stats.json 08:01Z: 154 unfinished. |
| 125 | H2-125 | `README.md` | minor | VERIFIED completion_strategy.json: 156 rows, 2 VERIFIED_COMPLETE. |
| 126 | H2-126 | `FEATURE_ACCEPTANCE_CRITERIA.md` | minor | Stale row header vs matrix. |
| 127 | H2-127 | `FEATURE_ACCEPTANCE_CRITERIA.md` | minor | Stale row header vs matrix. |
| 128 | H2-128 | `FEATURE_ACCEPTANCE_CRITERIA.md` | minor | Stale tier (row sits in 4.2 beta-supporting). |
| 129 | H2-129 | `FEATURE_ACCEPTANCE_CRITERIA.md` | minor | Same as H2-107 (criteria section 8, F-WEB-07). |
| 130 | H2-130 | `FEATURE_ACCEPTANCE_CRITERIA.md` | minor | completion_strategy.json F-KEY-03.security_hold (08:00Z); section 8 table lacks it. |
| 131 | H2-131 | `FEATURE_ACCEPTANCE_CRITERIA.md` | minor | `$SP` is the audit session's scratchpad; a fresh session cannot resolve it (the files are in the package's evidence/ or not packaged at all). |
| 132 | H2-132 | `FEATURE_ACCEPTANCE_CRITERIA.md` | minor | `$SP` is the audit session's scratchpad; a fresh session cannot resolve it (the files are in the package's evidence/ or not packaged at all). |
| 133 | H2-133 | `FEATURE_DEPENDENCY_GRAPH.md` | minor | `$SP` is the audit session's scratchpad; a fresh session cannot resolve it (the files are in the package's evidence/ or not packaged at all). |
| 134 | H2-134 | `IMPLEMENTATION_SEQUENCE.md` | minor | `$SP` is the audit session's scratchpad; a fresh session cannot resolve it (the files are in the package's evidence/ or not packaged at all). |
| 135 | H2-135 | `ws_registry.json` | minor | VERIFIED (check_registry_H2.py): five unfinished rows (F-KEY-01, F-KEY-02, F-WEB-07, F-WEB-11, F-WEB-12) are in no workstream's features/contributes_to, so the WS cards… |
| 136 | H2-136 | `ws_registry.json` | minor | VERIFIED (check_registry_H2.py): five unfinished rows (F-KEY-01, F-KEY-02, F-WEB-07, F-WEB-11, F-WEB-12) are in no workstream's features/contributes_to, so the WS cards… |
| 137 | H2-137 | `ws_registry.json` | minor | VERIFIED (check_registry_H2.py): five unfinished rows (F-KEY-01, F-KEY-02, F-WEB-07, F-WEB-11, F-WEB-12) are in no workstream's features/contributes_to, so the WS cards… |
| 138 | H2-138 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | major | Same as H2-45 (PLAN section 8 copy of G-FULL). |
| 139 | H2-139 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | minor | Same as H2-46 (PLAN section 8). |
| 140 | H2-140 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | minor | Same as H2-42 (PLAN 3.3). |
| 141 | H2-141 | `BLOCKERS_AND_DECISIONS.md` | minor | VERIFIED: the component is apps/web/src/i18n/LanguagePicker.tsx (lines 19-23 hold the machine-drafted/no-catalog notes); apps/web/src/components/LanguagePicker.tsx does… |
| 142 | H2-142 | `completion_strategy.json` | minor | F-WEB-07 rationale contradicts its own status field (IMPLEMENTED_UNVERIFIED 90/90). |
| 143 | H2-143 | `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` | major | `$SOLC_0828` is used two lines later but never defined in the prompt; with SOLC_BIN empty, apps/web/src/features/registry/registry.anvil.test.ts:16-18,61-62 fails under… |
| 144 | H2-144 | `PARALLEL_AGENT_EXECUTION_PLAN.md` | major | Same as H2-143 (PLAN section 8 copy). |

## 7. Appendix: exact find / replace for every correction

Each `find` occurs exactly once in its file (live package, re-checked 08:38Z). Strings are shown verbatim inside the fences;
a note marks strings that end with a newline. `file` paths are relative to the package root
(`$SP/final/` here, `docs/handoffs/post-consolidation-20261118/` in the repository).

### 1. H2-01 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — blocker

Reason: At 07:55Z at least five other sessions had open PRs (#206, #209, #211, #212, #213) whose claims cover spec 18 (WS-03/08/09/19/25), the #204 port (WS-22.1), transport/CSP (WS-01), Pages/bundle hardening (WS-04/21/24), CI/release (WS-20), the WS-02 ports, ContextHelp (WS-12), SOL/TRON (WS-14) and storage linkability (WS-23). The prompt has no claims protocol, so a fresh session would duplicate them; two independent spec 18 codecs (#213 `stealth-export-portable.ts` + `test-vectors/stealth-export.json` vs WS-03 `stealth-export*.ts` + `stealth-export-v1.json`; #213 `scripts/recovery/` vs WS-19 `tools/independent-recovery/`) would give users incompatible backup formats (constraint 4).

Find (exact):

````text
   section 4 before trusting downstream sections.
3. Choose START_SHA:
````

Replace with:

````text
   section 4 before trusting downstream sections.
2a. Concurrent-work census (mandatory; `docs/ai/WORKFLOW.md:17`: "Prefer a nonoverlapping task rather than changing files
   claimed by another worker"). Other agent sessions write to this repository under the owner's account. Open at
   2026-11-18T07:55Z (VERIFIED `git ls-remote` + PR search), all created after the audit snapshot: #206 (#204 agent tooling
   re-integrated onto `main`), #207/#210 (Dependabot actions / npm minor-patch), #208 (another execution prompt), #209 and
   #211 (completion runs with exclusive path claims in `docs/ai/ACTIVE_WORK.md`: transport/settings, Pages hosting
   hardening, CI/release/supply chain, key-management docs, the qr-colors and seller-vault ports, scheme-2 client gates,
   SOL/TRON seed reveal and meta-address format, storage linkability, ContextHelp/focus), #212 (Mythril/Echidna/fee-token review,
   `validate:deployments`, owner packets), #213 ([WIP] spec 18 K01-K06 @ `a199c21`:
   `packages/ux-vault/src/stealth-export-portable.ts`, `docs/specs/18-stealth-keypair-export-formats.md`,
   `test-vectors/stealth-export.json`, `scripts/recovery/stealth-export-recover.mjs`, `scripts/recovery/raw-key-anvil.test.mjs`),
   #214-#216 (docs rotation), #217 (DeployPolicy N1 guard). For every open PR created or updated since 2026-11-18 and every
   claim section of `docs/ai/ACTIVE_WORK.md` on `main` and on those PR heads, map its paths, rows and findings to WS items
   (section 12). An item another active session has claimed or is implementing is OWNED-ELSEWHERE: do not start it; review
   that PR read-only at each checkpoint and adopt its result once it is on `main`; re-plan the item only if that PR is closed
   unmerged or has had no commit for 24 h, and record the decision. Spec 18 formats are single-sourced: never create a
   second format id, AAD domain, vector file or independent recovery tool next to one already on `main` or in an open PR;
   WS-03/08/09/19/25 then become review-and-complete items against that format. Record the claim map in BASELINE.md, claim
   only unclaimed paths in `docs/ai/ACTIVE_WORK.md` (insert your own section; never edit another session's section), and put
   any real conflict in the PR body and HANDOFF.md as an owner question.
3. Choose START_SHA:
````

### 2. H2-02 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: Other sessions merge into `main` while this one runs; without a rule to merge `origin/main` the draft PR (base `main`) drifts into conflicts and the frozen-path diff against the original START_SHA reports other sessions' approved changes.

Find (exact):

````text
6. Re-census the open PRs/branches each checkpoint: new commits from external writers (the ChatGPT `chatgpt/zero-codex/*`
   rotation is an active writer) are evaluated for recovery, never blindly merged.
````

Replace with:

````text
6. Re-census the open PRs/branches and every `docs/ai/ACTIVE_WORK.md` claim at each checkpoint (section 5 step 2a): new
   commits from external writers (the ChatGPT `chatgpt/zero-codex/*` rotation, Dependabot, and other Claude/Codex sessions
   such as #206/#209/#211/#212/#213) are evaluated for recovery or adoption, never blindly merged and never duplicated.
7. When `origin/main` has moved (another session's PR merged), merge it into the integration branch at the next checkpoint
   (`git merge --no-ff origin/main`; never rebase the pushed branch), resolve conflicts per section 16, re-run G-FULL, and
   re-check every item whose files or rows the merged work touched (mark it DONE-ELSEWHERE when its acceptance criteria
   pass on the merged head). The frozen-path check then compares against the last merged `origin/main`.
````

### 3. H2-03 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: `main` moved to 5467c158 (PR #203 merged 06:56:49Z) before this package was finalized; BLOCKERS/README were updated (OA-02 done), the prompt was not.

Find (exact):

````text
| `main` | `cfaebeeae22f292cb0bb3074619b2603cb738367` (merge #189, 2026-11-16); **unprotected** per prior session (API 404 "Branch not protected") |
````

Replace with:

````text
| `main` | `5467c158069c5bab264b6a653ac56e89e13f3e13` = the owner's merge commit of PR #203 (2026-11-18T06:56:49Z; parents `cfaebeea` + `71abc7e5`; tree `f17da552` == tree of `71abc7e5`, so product source == `7a620ff1`; VERIFIED `git ls-remote` 07:55Z). Before the merge: `cfaebeeae22f292cb0bb3074619b2603cb738367` (merge #189). Protection still UNVERIFIED (prior session: API 404 "Branch not protected") |
````

### 4. H2-04 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: Same drift as H2-03.

Find (exact):

````text
1,484 commits ahead of `main` (fast-forwardable); PR head `71abc7e55c25d45b206ac47e5ddd24e072805710` adds documentation only |
````

Replace with:

````text
1,484 commits ahead of the old `main` `cfaebeea`; PR head `71abc7e55c25d45b206ac47e5ddd24e072805710` adds documentation only; **merged into `main` 2026-11-18T06:56:49Z** as merge commit `5467c158` (not squash) |
````

### 5. H2-05 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: The baseline must name the concurrent writers the new step 2a acts on.

Find (exact):

````text
rotation keeps pushing docs-only commits (#139 `7af4b5ff`, #140 `400e20f1`, #153 `30f1604d` at audit time) |
````

Replace with:

````text
rotation keeps pushing docs-only commits (#139 `7af4b5ff`, #140 `400e20f1`, #153 `30f1604d` at audit time). Opened after the snapshot (open at 07:55Z): #206 (#204 re-integrated onto main, conflicts resolved), #207/#210 Dependabot, #208 another execution prompt, #209/#211 completion runs, #212 security/release reconciliation, #213 spec 18 [WIP], #214-#216 docs rotation, #217 DeployPolicy N1 guard: see section 5 step 2a |
````

### 6. H2-06 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: PR census stale (VERIFIED search API 07:55Z).

Find (exact):

````text
202 PRs (145 open) + #205 |
````

Replace with:

````text
202 PRs (145 open) + #205 at audit time; #206-#217 opened 2026-11-18 06:57-07:53Z |
````

### 7. H2-07 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: The NOT AUTHORIZED list contained a permission ('marking PRs ready ... is allowed') that contradicts PLAN section 10 ('NO mark-ready/merge of PR #203/#204 (OA-02 is owner)'); the prompt also never forbade writes on other PRs (PLAN section 10 does) nor said whether path-filtered workflows may be dispatched although CP-7 requires their run ids.

Find (exact):

````text
- Merging into `main` or any protected/shared branch; marking PRs ready-for-review on behalf of the owner is allowed
  only when every gate in section 13 passes, and merging is never allowed.
````

Replace with:

````text
- Merging into `main` or any protected/shared branch (never allowed). Marking any PR other than your own draft
  ready-for-review (readiness and merging of #203/#204/#206 and other sessions' PRs are owner actions, OA-02); your own PR
  may be marked ready only when every gate of sections 13 and 17 passes.
- Any other GitHub write: comments, reviews, approvals, labels or pushes on other PRs/branches, issues, releases,
  environment approvals; dispatching `pages.yml` with `deploy=true`, `release.yml`, `ghostpay-codex-cloud.yml` or
  `ghostpay-parallel-review.yml`. Allowed: `workflow_dispatch` of test-only workflows (`ci.yml`, `hosting-kit.yml`,
  `cli-operator.yml`, `integration.yml`, `beta-acceptance.yml`, `nightly.yml`) on your own designated branch when path
  filters skipped them (CP-7 needs their run ids).
````

### 8. H2-08 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: As written it permits force-pushing the integration branch, contradicting PLAN 3.1/9.9 ('never force-push', 'integration branch never rewritten').

Find (exact):

````text
- Deleting, force-pushing or rewriting any branch other than your own designated branch; closing other PRs.
````

Replace with:

````text
- Deleting, force-pushing or rewriting any branch; your designated branch may be reset once, before its first push
  (section 5 step 3), and is never rewritten afterwards (bad merge: `git revert -m 1`, PLAN 9.9); closing other PRs.
````

### 9. H2-09 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: No fallback when the harness names no designated branch.

Find (exact):

````text
(the one named in this session's system
  instructions); use it as the integration branch.
````

Replace with:

````text
(the one named in this session's system
  instructions; if none is named, ask the owner and push nothing); use it as the integration branch.
````

### 10. H2-10 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: The plan defers seven technically unblocked rows and has items that 'record owner ack (no canonical ID)' (WS-02.6, WS-10.3): that decides an owner item and treats silence as approval, against the owner brief ('implement every technically unblocked unfinished feature') and BLOCKERS' rule.

Find (exact):

````text
Experimental and future rows are not promoted (section
7.4). You are done only when section 17 holds.
````

Replace with:

````text
Experimental and future rows are not promoted (section
7.4): they count as owner-gated (OD-20/OD-21 scope; each future row needs the owner to schedule it, NEXT_PHASE_QUEUE
D07), not as technically unblocked. Rows whose chosen strategy is `defer`
while their item is unblocked (F-CLI-06, F-DOC-01, F-KEY-13, F-OPS-03, F-RLY-04, F-WEB-04, F-WEB-06) and the owner-ack rows
(F-WEB-04, F-WEB-06, F-WEB-26, F-CLI-06) are not complete when their item lands: implement every missing requirement
(`feature_completion_matrix.json` `missing_requirements`) that is technically unblocked and inside constraints 1-5; a
limitation a constraint requires (F-CLI-06 refund execute would need hosted signing) is documented, never built. Accepting a
limitation is owner decision OD-23 (section 10); engineering never writes "owner ack recorded". You are done only when
section 17 holds.
````

### 11. H2-11 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: The package's matrix/stats/README were rescored at 08:01Z (154 unfinished, 38 complete); the prompt still carries the pre-H1 numbers, so the primary deliverable contradicts its own package.

Find (exact):

````text
- 192 distinct features: **37 VERIFIED_COMPLETE, 30 IMPLEMENTED_UNVERIFIED, 27 PARTIAL, 46 SPEC_ONLY, 45
  EXPERIMENTAL, 7 BLOCKED** (155 unfinished). Beta-core (43): 18 complete, 11 implemented-unverified, 5 partial,
  3 blocked, 6 spec-only (spec 18 K01–K06). Five rows (F-KEY-01, F-KEY-02, F-WEB-07, F-WEB-11, F-WEB-12) meet their
  requirements but are held by open SEC-03/SEC-05/SEC-10 (security-hold rule).
````

Replace with:

````text
- 192 distinct features: **38 VERIFIED_COMPLETE, 28 IMPLEMENTED_UNVERIFIED, 28 PARTIAL, 46 SPEC_ONLY, 45
  EXPERIMENTAL, 7 BLOCKED** (154 unfinished; `evidence/features/stats.json` after the H1 rescoring: F-WEB-09 ->
  VERIFIED_COMPLETE, F-NET-01 -> PARTIAL 80/65, F-WEB-07 -> 90/90, F-BTC-01/F-BTC-02/F-MER-05 -> full-profile).
  Beta-core (42): 18 complete, 10 implemented-unverified, 5 partial, 3 blocked, 6 spec-only (spec 18 K01–K06). Five rows
  (F-KEY-01, F-KEY-02, F-KEY-03, F-WEB-11, F-WEB-12) meet their requirements but are held by open SEC-03/SEC-05
  (security-hold rule); the SEC-10 local-proxy gap is scored into F-WEB-07 and F-NET-01.
````

### 12. H2-12 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: Same rescoring (stats.json aggregate_release_scope_beta / aggregate_all_excluding_future / aggregate_all).

Find (exact):

````text
beta scope **87.9 % / 84.0 %**; all tiers excluding the future
  roadmap 79.9 % / 75.0 %; all tiers 73.9 % / 69.3 %.
````

Replace with:

````text
beta scope **87.2 % / 83.5 %**; all tiers excluding the future
  roadmap 79.7 % / 74.8 %; all tiers 73.8 % / 69.1 %.
````

### 13. H2-13 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: VERIFIED: refs/pull/213/head a199c21 adds packages/ux-vault/src/stealth-export-portable.ts and scripts/recovery/*.

Find (exact):

````text
- Largest gap: spec 18 key portability has **zero code** (F-KEY-07..F-KEY-12),
````

Replace with:

````text
- Largest gap: spec 18 key portability has **zero code on `main`** (F-KEY-07..F-KEY-12; open PR #213 [WIP] already carries a
  K01/K02/K05/K06 codec, an independent recovery script and a K04 anvil test: section 5 step 2a),
````

### 14. H2-14 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: 24 + 24 + 19 after the rescoring.

Find (exact):

````text
### 7.2 Unfinished beta-core, beta-supporting and full-profile rows (68)
````

Replace with:

````text
### 7.2 Unfinished beta-core, beta-supporting and full-profile rows (67)
````

### 15. H2-15 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: F-WEB-09 is VERIFIED_COMPLETE now.

Find (exact):

````text
**beta-core: 25 unfinished**
````

Replace with:

````text
**beta-core: 24 unfinished**
````

### 16. H2-16 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: completion_strategy.json F-KEY-03.security_hold = SEC-05, SEC-03 since 08:00Z.

Find (exact):

````text
| F-KEY-03 | Keystore v1 backup/restore and verified-backup gate (GP-PAGES- | 100 / 100 | IMPLEMENTED_UNVERIFIED | recover | 5 | WS-02 (WS-02.7) | — |
````

Replace with:

````text
| F-KEY-03 | Keystore v1 backup/restore and verified-backup gate (GP-PAGES- | 100 / 100 | IMPLEMENTED_UNVERIFIED (security hold: SEC-05, SEC-03) | recover | 5 | WS-02 (WS-02.7; hold released by WS-07.1 + WS-18.1) | OD-01, OD-09 |
````

### 17. H2-17 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: Row is VERIFIED_COMPLETE (moves to 7.3); WS-02.4 stays as the TB-06 script fix.

Find (exact) — ends with a newline:

````text
| F-WEB-09 | Payment history & reconciliation ledger (encrypted IndexedDB,  | 100 / 95 | IMPLEMENTED_UNVERIFIED | repair | 2 | WS-02 (WS-02.4) | — |
````

Replace with: *(empty string: delete the find text, including its trailing newline)*

### 18. H2-18 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: F-BTC-01 moved to full-profile.

Find (exact):

````text
**beta-supporting: 25 unfinished**
````

Replace with:

````text
**beta-supporting: 24 unfinished**
````

### 19. H2-19 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: Tier is full-profile after the rescoring (re-inserted by H2-23).

Find (exact) — ends with a newline:

````text
| F-BTC-01 | BIP-352 silent payments: keys, addresses, sender derive, recei | 100 / 80 | IMPLEMENTED_UNVERIFIED | defer | 8 | WS-14 (WS-14.4) | OD-02, OD-20 |
````

Replace with: *(empty string: delete the find text, including its trailing newline)*

### 20. H2-20 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: Rescored row.

Find (exact):

````text
| F-NET-01 | Transport profiles: direct/Tor SOCKS5h/local-proxy/OHTTP frami | 100 / 80 | IMPLEMENTED_UNVERIFIED |
````

Replace with:

````text
| F-NET-01 | Transport profiles: direct/Tor SOCKS5h/local-proxy/OHTTP frami | 80 / 65 | PARTIAL |
````

### 21. H2-21 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: Rescored row; no longer a security-hold row.

Find (exact):

````text
| F-WEB-07 | Scan privacy modes (spec 10 UI: transport, private-required, w | 100 / 100 | IMPLEMENTED_UNVERIFIED (security hold) |
````

Replace with:

````text
| F-WEB-07 | Scan privacy modes (spec 10 UI: transport, private-required, w | 90 / 90 | IMPLEMENTED_UNVERIFIED |
````

### 22. H2-22 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: F-BTC-01 added.

Find (exact):

````text
**full-profile: 18 unfinished**
````

Replace with:

````text
**full-profile: 19 unfinished**
````

### 23. H2-23 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: Re-insert F-BTC-01 in the full-profile table.

Find (exact):

````text
| F-BTC-03 | BTC light-client scanning: BlindBit HTTP + gRPC-Web, own-node  |
````

Replace with:

````text
| F-BTC-01 | BIP-352 silent payments: keys, addresses, sender derive, recei | 100 / 80 | IMPLEMENTED_UNVERIFIED | defer | 8 | WS-14 (WS-14.4) | OD-02, OD-20 |
| F-BTC-03 | BTC light-client scanning: BlindBit HTTP + gRPC-Web, own-node  |
````

### 24. H2-24 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: Rescored count.

Find (exact):

````text
### 7.3 Do not regress (37 VERIFIED_COMPLETE rows and every currently green suite)
- **VERIFIED_COMPLETE** (37):
````

Replace with:

````text
### 7.3 Do not regress (38 VERIFIED_COMPLETE rows and every currently green suite)
- **VERIFIED_COMPLETE** (38):
````

### 25. H2-25 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: F-WEB-09 is complete.

Find (exact):

````text
, F-WEB-08, F-WEB-10, F-WEB-13,
````

Replace with:

````text
, F-WEB-08, F-WEB-09, F-WEB-10, F-WEB-13,
````

### 26. H2-26 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: VERIFIED refs/pull/206/head c487f0f (3 commits on 71abc7e5, the 11 #204 files). Porting again duplicates it and re-creates the CLAUDE.md/ci.yml conflicts (BLOCKERS OD-15 was updated, the prompt was not).

Find (exact):

````text
1. **#204 agent tooling** (class A, `nodata/eager-babbage-0w6sf6` @ `2693b08e`): new files apply cleanly; regenerate
````

Replace with:

````text
1. **#204 agent tooling** (class A, `nodata/eager-babbage-0w6sf6` @ `2693b08e`) is **superseded** by open PR #206
   (`c487f0fe`, #204 re-integrated onto `71abc7e5` with conflicts resolved and `PACKAGE_MAP.md` regenerated). Do not port it
   again: WS-22.1 = run `node --test scripts/agent/workspaces.test.mjs` once #206 is on `main`. Only if #206 is closed
   unmerged: new files apply cleanly; regenerate
````

### 27. H2-27 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: Avoid a third, competing dependency refresh.

Find (exact):

````text
3. **Dependency refresh** (class B, Dependabot #85/#87/#176): regenerate minor/patch updates on top of START_SHA
````

Replace with:

````text
3. **Dependency refresh** (class B, Dependabot #85/#87/#176; superseded by the fresh Dependabot PRs #207 actions and #210 npm
   minor/patch, open 2026-11-18): prefer the owner merging #207/#210 and verify them with G-FULL once on `main`; otherwise
   regenerate minor/patch updates on top of START_SHA
````

### 28. H2-28 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: VERIFIED: the file exists at 7a620ff1 (75 lines); 'recover file' alone suggests it is missing.

Find (exact):

````text
candidate lacks; selective file recovery + wire into `package.json`/CI.
````

Replace with:

````text
candidate lacks; selective file recovery (the candidate already has a 75-line two-tab version; take the 228-line
   `57dcf7e8` version, +157/-4: `git diff 7a620ff1 57dcf7e8 -- apps/web/scripts/test-seller-vault-idb.mjs`) + wire into
   `package.json`/CI.
````

### 29. H2-29 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: Section 9 says 'close every finding below' but lists only SEC-01..SEC-30; the 19 Info findings, six of which block sepolia-beta/release-tag/mainnet gates (SEC-32/33/41/46/47/48), are invisible to a session that has only the prompt, and the table has no closing-WS or owner-gate column (VERIFIED security_findings.json + ws_registry.json mapping).

Find (exact):

````text
| SEC-30 | Low | INTENDED | R-04 | #201 focus scope also focuses main after in-view paste/QR/Forget/cancel; comment names only dee |  |
````

Replace with:

````text
| SEC-30 | Low | INTENDED | R-04 | #201 focus scope also focuses main after in-view paste/QR/Forget/cancel; comment names only dee |  |

Info findings, closed here too unless owner-gated (full rows: `security_findings.json`): SEC-31 policy-account owner-key
freeze race -> WS-90 (scheme 2); SEC-32 release trust roots empty (blocks sepolia-beta, release-tag) -> WS-05.4 after
OD-07/OA-03; SEC-33 Mythril red by design -> WS-06.1, WS-06.3 (OD-03); SEC-34 relayer cannot steal (record) -> WS-11.2;
SEC-35 7702 delegation persists -> WS-90 (OD-13); SEC-36 FEE_RECIPIENT must accept ETH -> WS-05.2 (OD-14); SEC-37
best-effort zeroization -> WS-03.2; SEC-38 independent scheme-1 check -> WS-03.1, WS-19.1; SEC-39 packet docs-only claim ->
WS-00.5 (closed at `71abc7e5`); SEC-40 banner same-tab link, no beforeunload guard -> WS-04.3, WS-07.1; SEC-41 Tor
Browser/JIT-less scrypt (blocks sepolia-beta) -> WS-18.2, WS-17.2, EX-02; SEC-42 React root error logging -> WS-21.2; SEC-43
no SRI, unsigned Pages checksums -> WS-01.3, WS-20.5; SEC-44 public Playwright key denylist -> WS-05.1; SEC-45 RPC
fingerprinting -> WS-01.2; SEC-46 smoke idles 3 s (blocks sepolia-beta) -> WS-04.5, WS-04.6; SEC-47 release analysis gate
unexercised (blocks release-tag) -> WS-06.3, WS-20.6; SEC-48 alert inventories unreadable (blocks mainnet) -> WS-20.4
(OA-07); SEC-49 #204/#203 conflict -> #206 (OD-15). Owner-gated, no closure this phase: SEC-06, SEC-07, SEC-11, SEC-12,
SEC-31, SEC-35 (scheme 2, WS-90: OD-04/05/11/12/13).
````

### 30. H2-30 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: VERIFIED apps/web/src/views/SellerKeys.tsx:205-231 @7a620ff1: the keystore v1 download (the only encrypted backup of in-memory keys, and the verified-backup gate) goes through authorizeKeyExport. 'Refuses unless a vault exists' blocks it or forces a vault on the shared github.io origin (SEC-01). BLOCKERS OD-01 and SEC-03 were corrected at 08:00Z; the prompt was not.

Find (exact):

````text
| OD-01 | Re-auth for vault-less seller sessions | Secret export refuses unless an encrypted vault exists (re-auth = vault passphrase); sweep warns |
````

Replace with:

````text
| OD-01 | Re-auth for vault-less seller sessions | New spec-18 secret exports (K03–K06 encrypted and raw keys, archive) refuse in vault-less sessions (re-auth = vault passphrase via `requireStepUp`); the existing encrypted keystore v1 backup and vault creation stay available with disclosure (constraint 4: a vault-less seller must always be able to make an encrypted backup); sweep unchanged but warned |
````

### 31. H2-31 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: Aligns with BLOCKERS OD-15 (08:00Z) and H2-26.

Find (exact):

````text
| OD-15 | #204 scope / merge order | Port #204 as a separate reviewable commit (section 8.1) |
````

Replace with:

````text
| OD-15 | #204 scope / merge order | #204 was re-integrated as open PR #206: do not port again; adopt #206 once the owner merges it; port per section 8.1 only if #206 is closed unmerged |
````

### 32. H2-32 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: Full path (VERIFIED) and explicit no-trim rule; PLAN/SEQUENCE/registry WS-12.3 currently say the opposite (H2-60..64).

Find (exact):

````text
Keep today's behaviour (unshipped languages already labelled, `LanguagePicker.tsx:19-23`);
````

Replace with:

````text
Keep today's behaviour (unshipped languages already labelled, `apps/web/src/i18n/LanguagePicker.tsx:19-23`; do not trim the selector, that is the owner's OD-16 choice);
````

### 33. H2-33 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: The owner-ack rows have no canonical ID (IMPLEMENTATION_SEQUENCE section 0), so the owner cannot find or answer them; BLOCKERS gets the matching OD-23 row (H2-79).

Find (exact):

````text
| OD-21 | Operator-run optional services | Stay optional/experimental, out of lean |
````

Replace with:

````text
| OD-21 | Operator-run optional services | Stay optional/experimental, out of lean |
| OD-23 | Accept documented limitations (owner-ack rows F-WEB-04, F-WEB-06, F-WEB-26, F-CLI-06) | Document each limitation in docs/user and the spec; the row stays unfinished in the report; never record an owner acknowledgement on the owner's behalf |
````

### 34. H2-34 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: OA-02 is done (BLOCKERS 08:00Z).

Find (exact):

````text
| OA-01..OA-07 | Branch protection/rulesets, merge #203, release keys,
````

Replace with:

````text
| OA-01..OA-07 | Branch protection/rulesets, merge #203 (OA-02 done 2026-11-18T06:56:49Z, `5467c158`), release keys,
````

### 35. H2-35 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: The Pages dispatch (OA-06) must come after WS-05.4 bundles the signed manifest (IMPLEMENTATION_SEQUENCE 3a order); the prompt put OA-06 before WS-05.4.

Find (exact):

````text
owner chain (OD-06 → OD-07 → OA-03 → OD-08 → OA-01 → OA-02 → OA-05 → OA-04 →
OA-06) → WS-05.4 evidence → WS-04.6 live smoke → CP-7.
````

Replace with:

````text
owner chain (OD-06 → OD-07 → OA-03 → OD-08 → OA-01 → [OA-02 done] → OA-05 → OA-04 Sepolia
broadcast) → WS-05.4 evidence + owner-signed manifest bundled → OA-06 Pages dispatch → WS-04.6 live smoke → CP-7.
````

### 36. H2-36 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: Same OD-01 alignment as H2-30.

Find (exact):

````text
| BR-07 | Vault-less sweep/export: refuse or disclose (SEC-03 beta item) | OPEN (`authorizeKeyExport` returns undefined) | WS-07.1 (default: refuse secret export, warn sweep) |
````

Replace with:

````text
| BR-07 | Vault-less sweep/export: refuse or disclose (SEC-03 beta item) | OPEN (`authorizeKeyExport` returns undefined) | WS-07.1/07.2 (default: new spec-18 secret exports refuse without a vault; keystore v1 backup stays available with disclosure; sweep warned) |
````

### 37. H2-37 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: Constraint 3 (explicit RPC selection, no fallback): FEATURE_ACCEPTANCE_CRITERIA F-WEB-17 says 'with a secondary RPC configured'; the prompt/plan wording reads as a mandatory second provider.

Find (exact):

````text
| BR-09 | Strict on-chain verifier for Pay/Scan/Sweep, CLI, relayer (G-NOTE-01) + dual-provider readback (F-WEB-17) |
````

Replace with:

````text
| BR-09 | Strict on-chain verifier for Pay/Scan/Sweep, CLI, relayer (G-NOTE-01) + dual-provider readback when the user configured a secondary RPC (opt-in; never a built-in default or automatic fallback) (F-WEB-17) |
````

### 38. H2-38 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: Drift (H2-03).

Find (exact):

````text
| BR-21 | #203 merged (merge/ff, never squash) so pages.yml/release.yml on main carry the gates | OWNER | OA-01 then OA-02 |
````

Replace with:

````text
| BR-21 | #203 merged (merge/ff, never squash) so pages.yml/release.yml on main carry the gates | DONE after the snapshot: merge commit `5467c158` 2026-11-18T06:56:49Z (tree == `71abc7e5`); OA-01 still UNVERIFIED | OA-02 done; OA-01 |
````

### 39. H2-39 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: Follows H2-38.

Find (exact):

````text
Count: 23 start + 9 exit items; 24 engineering-open/partial, 6 owner-only, 1 done (BR-11), BR-04 UNVERIFIED.
````

Replace with:

````text
Count: 23 start + 9 exit items; 24 engineering-open/partial, 5 owner-only, 2 done (BR-11, BR-21), BR-04 UNVERIFIED.
````

### 40. H2-40 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: The registry/plan use strongest/mid/cheap tiers but nothing maps them to a model or effort (owner brief: Opus 5.5 / xhigh). PLAN 2 creates a second branch `ws/WS-00-integration` in `../wt/WS-00-integration`, which cannot hold the designated branch while the main checkout has it, and three coordinator WS share that worktree with three different branches (registry worktree/branch fields).

Find (exact):

````text
it executes only WS-00,
WS-20 and WS-22 and never implements product features or reviews its own work.
````

Replace with:

````text
it executes only WS-00,
WS-20 and WS-22 and never implements product features or reviews its own work.
**Tiers:** strongest = Claude Opus 5.5 (`claude-opus-5-5`) at effort `xhigh`; mid = Opus 5.5 at effort `high`; cheap = Opus
5.5 at effort `medium`. The API default effort of Opus 5.5 is `medium`, so set the effort explicitly wherever the harness
exposes it (sub-agents otherwise inherit the session setting: keep the session at `xhigh`); use a smaller model only if the
owner allows it; RV-CRYPTO/RV-SEC/RV-REL reviews and both two-key reviews are always strongest; if a tier cannot be
selected, use strongest.
**Integration worktree:** the integration branch is your designated branch in the main checkout (section 5 step 3). Skip the
plan's `git worktree add ../wt/WS-00-integration -b ws/WS-00-integration "$START"` (PLAN 2, WS-00.1) and the card branches
`ws/WS-00-rebaseline`, `ws/WS-20-ci-release`, `ws/WS-22-tooling-deps`, which all point at that one worktree: coordinator
WS work is committed on short-lived local branches cut from the integration tip (or directly on it) and merged `--no-ff`.
````

### 41. H2-41 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: A worker that fast-forwards onto another WS's library change (e.g. ux-vault) fails typecheck/tests without rebuilding dist.

Find (exact):

````text
Workers use local branches
`ws/<WS-ID>-<slug>` in worktrees `../wt/<WS-ID>`;
````

Replace with:

````text
Workers use local branches
`ws/<WS-ID>-<slug>` in worktrees `../wt/<WS-ID>` (set up with `npm ci --ignore-scripts && npm run build:libs`; re-run
`npm run build:libs` after every fast-forward to the integration tip, because workspace packages resolve each other through
their built `dist`, `.github/actions/setup-node-libs/action.yml:20-22`);
````

### 42. H2-42 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: Independent overlap check (H2 ownership_H2.py) found two glob overlaps between WS that the plan runs concurrently (CP-2->CP-4 window: WS-08 with WS-10; WS-02.7/02.8 with WS-09.1). The validator script is not in the package. The frozen-path rule lacked the escalation path; spec 18 needs no frozen-path edit (VERIFIED exports).

Find (exact):

````text
(VERIFIED by run; negative test with injected overlaps detected 80 conflicts).
- Frozen, nobody owns: `packages/contracts/src/**`, `packages/core-crypto/src/**`, `test-vectors/scheme1.json`.
````

Replace with:

````text
(VERIFIED by run of the audit's unpackaged scratch `model.py`; its windows are per CP number, so items of CP-3 and CP-5 that
  run concurrently are not compared; negative test with injected overlaps detected 80 conflicts).
- A more specific owned path beats an overlapping glob of another WS: WS-09 `docs/user/master-backup-recovery.md` inside WS-02
  `docs/user/**`; WS-08 `apps/web/src/views/PaymentDetails*.test.tsx` inside WS-10 `apps/web/src/views/Pay*.test.tsx`.
- Frozen, nobody owns: `packages/contracts/src/**`, `packages/core-crypto/src/**`, `test-vectors/scheme1.json`. Changing one
  needs owner approval + re-review (record an owner question). No K01-K06 item needs it: spec 18 uses only the exported
  core-crypto API (`deriveStealthSecret`, `checkAnnouncement`, `unsafeRevealSecret`, `zeroize`, `secretScalarFromBytes`;
  `packages/core-crypto/src/index.ts:7-15`, VERIFIED @7a620ff1).
````

### 43. H2-43 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: WS-90's experimental list includes the VERIFIED_COMPLETE F-NET-04 (registry check); section 7.4 says 44 unfinished.

Find (exact):

````text
| WS-90 | Experimental (45) + future (43): keep separate / defer |
````

Replace with:

````text
| WS-90 | Experimental (45 rows incl. complete F-NET-04; 44 unfinished) + future (43): keep separate / defer |
````

### 44. H2-44 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: BLOCKERS TB-02 (08:00Z) now prescribes loopback origins with any port because a static meta CSP cannot be narrowed to the chosen port; the reviewer rule 'weakened CSP = blocking' would reject that fix. Make the single allowed widening explicit.

Find (exact):

````text
weakened gate/verifier/CSP;
````

Replace with:

````text
weakened gate/verifier/CSP (one reviewed exception: if WS-01.1 keeps local-proxy mode in the full/self-host profile,
  that profile's CSP may add only `http://127.0.0.1:*`, `http://localhost:*`, `http://[::1]:*` to `connect-src` (BLOCKERS
  TB-02); the lean CSP is never widened; the default is to remove the mode);
````

### 45. H2-45 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: `$SOLC_0828` and `$START` were never defined in the prompt. With SOLC_BIN empty, apps/web/src/features/registry/registry.anvil.test.ts:16-18,61-62 fails under REQUIRE_ANVIL=1 (process.env value '' is not nullish), so G-FULL goes red for environment reasons.

Find (exact):

````text
# G-FULL — run from the worktree root on the exact SHA being qualified; record exit codes + pass/skip counts
npm run typecheck
````

Replace with:

````text
# G-FULL — run from the worktree root on the exact SHA being qualified; record exit codes + pass/skip counts
: "${START:?set START to START_SHA or to the last origin/main merged into the integration branch}"   # used by the frozen-path line
npm run typecheck
````

### 46. H2-46 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: G-FULL omitted three CI test steps (two Foundry projects that section 4's baseline cites as 86/0 and 109/0, the examples tests and the python audit test), so a local CP could pass while PR CI fails.

Find (exact):

````text
(cd packages/contracts && forge build --sizes && forge test && forge fmt --check && forge snapshot --check --no-match-test "testFuzz|invariant")
npm run ci:scan-secrets
````

Replace with:

````text
(cd packages/contracts && forge build --sizes && forge test && forge fmt --check && forge snapshot --check --no-match-test "testFuzz|invariant")
(cd packages/pool-contracts && forge build --sizes && forge test && forge fmt --check)    # ci.yml:473-506; baseline 86/0
(cd packages/payer-hiding-contracts && bash scripts/fetch-entrypoint.sh && forge build --sizes && forge test && forge fmt --check)   # baseline 109/0
node --test examples/merchant-checkout/money.test.mjs examples/pos-terminal/parity.test.mjs   # ci.yml:111
python3 scripts/tests/audit-permissions.test.py                                   # ci.yml:553
npm run ci:scan-secrets
````

### 47. H2-47 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: 'blocked here' refers to the audit container, not the reader's.

Find (exact):

````text
ANVIL_BIN=$(command -v anvil) npm test -w packages/confidential-contracts   # hardhat; needs binaries.soliditylang.org (blocked here: HH502)
````

Replace with:

````text
ANVIL_BIN=$(command -v anvil) npm test -w packages/confidential-contracts   # hardhat; needs binaries.soliditylang.org (HH502 in the audit environment -> then CI-only, UNVERIFIED locally)
````

### 48. H2-48 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: A fresh session running the CP table at START would see 'missing file' failures and could not tell planned from broken.

Find (exact):

````text
| CP | Meaning | Gate = G-FULL + |
|---|---|---|
````

Replace with:

````text
Planned files (absent at `7a620ff1`, VERIFIED): `scripts/agent/workspaces.test.mjs` (#204/#206), `scripts/tests/privacy-claims.test.mjs`
(WS-02.1), `tools/independent-recovery/` (WS-19.1; reconcile with #213 `scripts/recovery/` first), `scripts/testnet/sign-manifest.mjs`
(WS-05.1), `check-chain-matrix.mjs --revalidate --rpc` (WS-05.3; today only `[--release]`), `apps/web/src/lib/stepUp.ts` (WS-07.2).
A gate naming one of them applies once its item has merged.

| CP | Meaning | Gate = G-FULL + |
|---|---|---|
````

### 49. H2-49 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: VERIFIED evidence/scripts/branch_census.py:3,10: four positional arguments are required; the documented call has none and the script is not in the integration branch's tree.

Find (exact):

````text
`python3 -I docs/handoffs/post-consolidation-20261118/evidence/scripts/branch_census.py` (needs the package files
from `nodata/zealous-hopper-lr0nxe`)
````

Replace with:

````text
`git show origin/nodata/zealous-hopper-lr0nxe:docs/handoffs/post-consolidation-20261118/evidence/scripts/branch_census.py >
"$TMPDIR/branch_census.py" && python3 -I "$TMPDIR/branch_census.py" "$PWD" <START_SHA> "$(git rev-parse origin/main)"
"$TMPDIR/census.json"` (usage `<repo> <candidate_sha> <main_sha> <out_json>`; needs `refs/remotes/pr/*` from section 5 step 1)
````

### 50. H2-50 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: The unshallow check sat only in the drift checks, after the first fetch; this audit's own census was wrong in a shallow clone.

Find (exact):

````text
1. `git fetch --all --prune` and `git fetch origin '+refs/pull/*/head:refs/remotes/pr/*'`.
````

Replace with:

````text
1. `git rev-parse --is-shallow-repository` (if `true`: `git fetch --unshallow origin`), then `git fetch --all --prune` and
   `git fetch origin '+refs/pull/*/head:refs/remotes/pr/*'`.
````

### 51. H2-51 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: Without Foundry the apps/web REQUIRE_ANVIL line fails, so 'only contract gates are blocked' was not true as written.

Find (exact):

````text
only contract and devnet gates are blocked, not unrelated work.
````

Replace with:

````text
only contract and devnet gates are blocked, not unrelated work (run the `REQUIRE_ANVIL=1` lines of G-FULL without
   `REQUIRE_ANVIL`, record the anvil suites as UNVERIFIED locally and take them from the PR's CI run).
````

### 52. H2-52 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: Most package files are needed as a set (registry, criteria, scripts); FETCH_HEAD is overwritten by later fetches.

Find (exact):

````text
`git show FETCH_HEAD:docs/handoffs/post-consolidation-20261118/<file>`).
````

Replace with:

````text
`git show FETCH_HEAD:docs/handoffs/post-consolidation-20261118/<file>`; whole package: `mkdir -p "$TMPDIR/pkg" && git archive
FETCH_HEAD docs/handoffs/post-consolidation-20261118 | tar -x -C "$TMPDIR/pkg"`; once PR #205 is merged, read the same path on
`main`).
````

### 53. H2-53 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: Two different 'checkpoint gate' definitions (section 12 G-FULL vs section 13 list with plain `npm test`, which silently skips the anvil suites).

Find (exact):

````text
- Checkpoint gate (every CP and before each push): `npm run typecheck`; `npm run lint`; `npm test`; lean + full web
  builds; Playwright lean + full; `forge test` in `packages/contracts` when contracts or tooling changed;
  `npm run ci:scan-secrets`; `npm run ci:check-actions`; `node --test` script suites touched; then the PR's GitHub CI
  green on the pushed head.
````

Replace with:

````text
- Checkpoint gate (every CP): G-FULL (section 12) on the exact SHA plus the CP row's extra commands. Before each push at
  least `npm run typecheck`, `npm run lint`, the touched workspaces' tests with the G-FULL anvil policy,
  `npm run ci:scan-secrets` and `npm run ci:check-actions`. Then the PR's GitHub CI green on the pushed head.
````

### 54. H2-54 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: Contradicted section 12 (coord-request commit) and PLAN 3.2.

Find (exact):

````text
workers send a
   patch request in their handoff instead of editing.
````

Replace with:

````text
workers request the
   change as one separate `coord-request(<WS>)` commit of append-only hunks in their branch (section 12), which the
   coordinator re-applies or merges.
````

### 55. H2-55 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: Checkpoints are days apart (CP-1 at 4-8 d); an unpushed rolling merge is lost on a container restart.

Find (exact):

````text
4. Push the integration branch at every checkpoint.
````

Replace with:

````text
4. Push the integration branch after every merge, not only at checkpoints: it is the only durable copy of the work (a
   container restart lost Team G's results during this audit).
````

### 56. H2-56 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: Two conflicting worker handoff formats; and multi-day worker items (WS-08.1 6-10 d) exist only in unpushed local worktrees, so a container restart loses them.

Find (exact):

````text
Workers end with a handoff block in Caveman format: TASK | SCOPE | CONSTRAINTS | RESULT | EVIDENCE | BLOCKERS plus
their branch head SHA.
````

Replace with:

````text
Workers end every item with the section 12 HANDOFF block, Caveman-compressed (the `TASK | SCOPE | CONSTRAINTS | RESULT |
EVIDENCE | BLOCKERS` layout is only the brief fallback of section 1). Worker branches are local and never pushed, so at least
every 4 hours of worker time, before any long step and before context compaction, export each active worker branch
(`git -C ../wt/<WS-ID> format-patch <base>..HEAD -o <repo>/docs/handoffs/next-phase-20261118/wip/<WS-ID>/`), commit the patches
on the integration branch as documentation only (never applied before review; deleted when the item merges) and push;
HANDOFF.md records the restore command (`git am`).
````

### 57. H2-57 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: Owner brief asks for durable handoffs; restart recovery was absent from the prompt.

Find (exact):

````text
- CI unavailable: run the equivalent local commands, record "local only", keep the gate open until CI confirms.
````

Replace with:

````text
- CI unavailable: run the equivalent local commands, record "local only", keep the gate open until CI confirms.
- Container restart / lost local state: re-clone (not shallow), redo section 5 steps 1-4 on the pushed integration branch,
  restore worker WIP from `docs/handoffs/next-phase-20261118/wip/` with `git am`, re-read ACTIVE_WORK.md, HANDOFF.md and the
  latest CP-n.md, then continue.
````

### 58. H2-58 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — minor

Reason: A chat-only final report is not durable.

Find (exact):

````text
Final report: START_SHA,
integration HEAD, PR link,
````

Replace with:

````text
Final report (also committed as
`docs/handoffs/next-phase-20261118/FINAL.md` and summarized in the PR body): START_SHA, integration HEAD, PR link,
````

### 59. H2-59 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — major

Reason: Not executable under the prompt's naming rule: the designated branch is already checked out in the main checkout, so `git worktree add ... -b <designated>` fails, and a literal `ws/WS-00-integration` branch would never be pushed.

Find (exact):

````text
git worktree add ../wt/WS-00-integration -b ws/WS-00-integration "$START"
mkdir -p ../wt/WS-00-integration/docs/handoffs/next-phase-20261118 && echo "START=$START" >> ../wt/WS-00-integration/docs/handoffs/next-phase-20261118/BASELINE.md
````

Replace with:

````text
DESIGNATED=<the session's designated branch>   # the integration branch; never a second branch or worktree
git checkout -B "$DESIGNATED" "$START"          # main checkout; only before its first push
mkdir -p docs/handoffs/next-phase-20261118 && echo "START=$START" >> docs/handoffs/next-phase-20261118/BASELINE.md
````

### 60. H2-60 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — major

Reason: Contradicts the prompt's OD-16 default and BLOCKERS OD-16 ('Keep today's behaviour'); a worker following the card would decide an owner item (prompt section 3).

Find (exact):

````text
selector lists only shipped locales (OD-16 default).
````

Replace with:

````text
selector stays as today: every listed locale labelled machine-drafted/no catalog (`apps/web/src/i18n/LanguagePicker.tsx:19-23`); trimming it to shipped locales is the owner's OD-16 choice.
````

### 61. H2-61 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — major

Reason: Same as H2-60.

Find (exact):

````text
UB: OD-16 fail-closed default: selector lists only shipped locales; OD-20,OD-16
````

Replace with:

````text
UB: OD-16 default = keep today's labelled selector (no trim); OD-20,OD-16
````

### 62. H2-62 — `IMPLEMENTATION_SEQUENCE.md` — major

Reason: Same as H2-60.

Find (exact):

````text
UB: OD-16 fail-closed default: selector lists only shipped locales; OD-20,OD-16
````

Replace with:

````text
UB: OD-16 default = keep today's labelled selector (no trim); OD-20,OD-16
````

### 63. H2-63 — `IMPLEMENTATION_SEQUENCE.md` — major

Reason: Same as H2-60.

Find (exact):

````text
| OD-16 locales | Selector lists only shipped locales; es/ar/ja labelled drafts | WS-12.3 |
````

Replace with:

````text
| OD-16 locales | Keep today's labelled selector (machine-drafted / no-catalog notes); es/ar/ja labelled drafts; no trim | WS-12.3 |
````

### 64. H2-64 — `ws_registry.json` — major

Reason: Same as H2-60 (registry objectives).

Find (exact):

````text
selector lists only shipped locales (OD-16 default).
````

Replace with:

````text
selector stays as today, every listed locale labelled machine-drafted or no catalog (apps/web/src/i18n/LanguagePicker.tsx:19-23); trimming it is the owner's OD-16 choice.
````

### 65. H2-65 — `ws_registry.json` — major

Reason: Same as H2-60 (registry WS-12.3 unblocked reason).

Find (exact):

````text
"OD-16 fail-closed default: selector lists only shipped locales"
````

Replace with:

````text
"OD-16 default: keep the labelled selector (no trim)"
````

### 66. H2-66 — `FEATURE_DEPENDENCY_GRAPH.md` — major

Reason: Same as H2-60.

Find (exact):

````text
| OD-16 | locale policy | selector lists only shipped locales |
````

Replace with:

````text
| OD-16 | locale policy | keep today's labelled selector (no trim; `apps/web/src/i18n/LanguagePicker.tsx:19-23`) |
````

### 67. H2-67 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — major

Reason: WS-03.2's status text sets a weaker floor than OD-09's default (prompt section 10 and BLOCKERS: generated diceware, about 80 bits) and than WS-18's `high` tier; the same item text even says 'passphrase tier high from WS-18'. A K02 envelope built to 'score>=3' would ship master/raw-key exports below the decided floor.

Find (exact):

````text
UB: floor for new formats per OD-09 (default: score>=3 or generated); OD-09
````

Replace with:

````text
UB: floor for new formats per OD-09 default (WS-18 `high` tier: generated diceware default or ≈80-bit estimate; never score>=3 alone); OD-09
````

### 68. H2-68 — `IMPLEMENTATION_SEQUENCE.md` — major

Reason: WS-03.2's status text sets a weaker floor than OD-09's default (prompt section 10 and BLOCKERS: generated diceware, about 80 bits) and than WS-18's `high` tier; the same item text even says 'passphrase tier high from WS-18'. A K02 envelope built to 'score>=3' would ship master/raw-key exports below the decided floor.

Find (exact):

````text
UB: floor for new formats per OD-09 (default: score>=3 or generated); OD-09
````

Replace with:

````text
UB: floor for new formats per OD-09 default (WS-18 `high` tier: generated diceware default or ≈80-bit estimate; never score>=3 alone); OD-09
````

### 69. H2-69 — `ws_registry.json` — major

Reason: WS-03.2's status text sets a weaker floor than OD-09's default (prompt section 10 and BLOCKERS: generated diceware, about 80 bits) and than WS-18's `high` tier; the same item text even says 'passphrase tier high from WS-18'. A K02 envelope built to 'score>=3' would ship master/raw-key exports below the decided floor.

Find (exact):

````text
floor for new formats per OD-09 (default: score>=3 or generated)
````

Replace with:

````text
floor for new formats per OD-09 default (WS-18 high tier: generated diceware default or ~80-bit estimate; never score>=3 alone)
````

### 70. H2-70 — `completion_strategy.json` — major

Reason: WS-03.2's status text sets a weaker floor than OD-09's default (prompt section 10 and BLOCKERS: generated diceware, about 80 bits) and than WS-18's `high` tier; the same item text even says 'passphrase tier high from WS-18'. A K02 envelope built to 'score>=3' would ship master/raw-key exports below the decided floor.

Find (exact):

````text
floor for new formats per OD-09 (default: score>=3 or generated)
````

Replace with:

````text
floor for new formats per OD-09 default (WS-18 high tier: generated diceware default or ~80-bit estimate; never score>=3 alone)
````

### 71. H2-71 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — major

Reason: VERIFIED SellerKeys.tsx:205-231 @7a620ff1: the keystore v1 download calls authorizeKeyExport; refusing without a vault blocks the first (and verified) backup of freshly generated or imported keys, or forces vault storage on the shared github.io origin (SEC-01). BLOCKERS OD-01 and SEC-03 were corrected at 08:00Z ('never block the keystore v1 backup').

Find (exact):

````text
authorizeKeyExport refuses when no vault (today returns undefined, keyVault.ts:257-266); keyVault.test.ts:241 "no step-up" pin replaced by refusal tests;
````

Replace with:

````text
keep `authorizeKeyExport` returning undefined for the keystore v1 backup in vault-less sessions (keyVault.ts:257-266; it is the only encrypted backup of in-memory keys, BLOCKERS OD-01) and add a disclosure + typed confirmation before that download; keyVault.test.ts:241 pin kept and extended (vault-less v1 backup allowed after confirmation; keys tied to a vault need its passphrase); new spec-18 exports refuse without a vault through WS-07.2 `requireStepUp`;
````

### 72. H2-72 — `IMPLEMENTATION_SEQUENCE.md` — major

Reason: VERIFIED SellerKeys.tsx:205-231 @7a620ff1: the keystore v1 download calls authorizeKeyExport; refusing without a vault blocks the first (and verified) backup of freshly generated or imported keys, or forces vault storage on the shared github.io origin (SEC-01). BLOCKERS OD-01 and SEC-03 were corrected at 08:00Z ('never block the keystore v1 backup').

Find (exact):

````text
authorizeKeyExport refuses when no vault (today returns undefined, keyVault.ts:257-266); keyVault.test.ts:241 "no step-up" pin replaced by refusal tests;
````

Replace with:

````text
keep `authorizeKeyExport` returning undefined for the keystore v1 backup in vault-less sessions (keyVault.ts:257-266; it is the only encrypted backup of in-memory keys, BLOCKERS OD-01) and add a disclosure + typed confirmation before that download; keyVault.test.ts:241 pin kept and extended (vault-less v1 backup allowed after confirmation; keys tied to a vault need its passphrase); new spec-18 exports refuse without a vault through WS-07.2 `requireStepUp`;
````

### 73. H2-73 — `ws_registry.json` — major

Reason: Same as H2-71 (registry WS-07.1 'what').

Find (exact):

````text
authorizeKeyExport refuses when no vault (today returns undefined, keyVault.ts:257-266); keyVault.test.ts:241 \"no step-up\" pin replaced by refusal tests;
````

Replace with:

````text
keep authorizeKeyExport returning undefined for the keystore v1 backup in vault-less sessions (keyVault.ts:257-266; the only encrypted backup of in-memory keys, BLOCKERS OD-01) and add a disclosure + typed confirmation before that download; keyVault.test.ts:241 pin kept and extended; new spec-18 exports refuse without a vault through WS-07.2 requireStepUp;
````

### 74. H2-74 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — major

Reason: Same as H2-71 (WS-07 objective).

Find (exact):

````text
No secret export without re-authentication: vault-less sessions refuse master-keystore/raw/archive export (OD-01 default (a)); sweep unchanged but warned; one step-up API that K03-K06 consume.
````

Replace with:

````text
No new secret export without re-authentication: vault-less sessions refuse the spec-18 exports (K03-K06 encrypted and raw keys, archive) through one step-up API that K03-K06 consume (OD-01 default); the existing encrypted keystore v1 backup and vault creation stay available with disclosure (constraint 4; BLOCKERS OD-01); sweep unchanged but warned.
````

### 75. H2-75 — `ws_registry.json` — major

Reason: Same as H2-74 (registry).

Find (exact):

````text
No secret export without re-authentication: vault-less sessions refuse master-keystore/raw/archive export (OD-01 default (a)); sweep unchanged but warned; one step-up API that K03-K06 consume.
````

Replace with:

````text
No new secret export without re-authentication: vault-less sessions refuse the spec-18 exports (K03-K06 encrypted and raw keys, archive) through one step-up API that K03-K06 consume (OD-01 default); the existing encrypted keystore v1 backup and vault creation stay available with disclosure (constraint 4; BLOCKERS OD-01); sweep unchanged but warned.
````

### 76. H2-76 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — major

Reason: Same as H2-71.

Find (exact):

````text
- **Handoff +** refusal matrix: session {vault, vault-less} × export {keystore, raw, archive, sweep} × factor {none, wrong, right}
````

Replace with:

````text
- **Handoff +** refusal matrix: session {vault, vault-less} × export {keystore v1 backup, raw, archive, K03/K06, sweep} × factor {none, wrong, right}; vault-less keystore v1 backup = allowed after disclosure + typed confirmation (BLOCKERS OD-01), every other vault-less secret export = refused, sweep = warned
````

### 77. H2-77 — `IMPLEMENTATION_SEQUENCE.md` — major

Reason: Same as H2-71.

Find (exact):

````text
| OD-01 re-auth (vault-less) | Secret export (master keystore, raw key, archive, K03–K06) refuses without encrypted-vault re-auth; sweep unchanged but warned; disclosure copy |
````

Replace with:

````text
| OD-01 re-auth (vault-less) | New spec-18 secret exports (K03–K06 encrypted and raw keys, archive) refuse without encrypted-vault re-auth; the keystore v1 backup and vault creation stay available with disclosure (BLOCKERS OD-01, constraint 4); sweep unchanged but warned |
````

### 78. H2-78 — `IMPLEMENTATION_SEQUENCE.md` — major

Reason: Same as H2-71.

Find (exact):

````text
| BR-07 | Vault-less sweep/export: refuse or disclose (SEC-03 beta item) | OPEN (`authorizeKeyExport` returns undefined) | WS-07.1 (default: refuse secret export, warn sweep) |
````

Replace with:

````text
| BR-07 | Vault-less sweep/export: refuse or disclose (SEC-03 beta item) | OPEN (`authorizeKeyExport` returns undefined) | WS-07.1/07.2 (default: new spec-18 secret exports refuse without a vault; keystore v1 backup stays available with disclosure; sweep warned) |
````

### 79. H2-80 — `completion_strategy.json` — major

Reason: Same as H2-71 (F-KEY-01 implementation criteria).

Find (exact):

````text
Refuse secret export (and warn on sweep) in vault-less sessions per the OD-01 default; offer vault creation; regression tests pin refusal
````

Replace with:

````text
Refuse new spec-18 secret exports (and warn on sweep) in vault-less sessions per the OD-01 default; keep the keystore v1 backup available after disclosure + typed confirmation; offer vault creation; regression tests pin both
````

### 80. H2-81 — `completion_strategy.json` — minor

Reason: F-WEB-11 criterion required a step-up/vault prompt, contradicting the OD-01 default 'sweep unchanged but warned'.

Find (exact):

````text
Sweep in vault-less sessions requires the OD-01 step-up path or an explicit vault prompt; e2e covers refuse/warn
````

Replace with:

````text
Sweep in vault-less sessions stays available and shows the OD-01 warning with a vault-creation offer (default: sweep unchanged but warned); e2e covers the warning
````

### 81. H2-82 — `FEATURE_ACCEPTANCE_CRITERIA.md` — major

Reason: Same as H2-71 (criteria section 8, F-KEY-01).

Find (exact):

````text
Vault-less session: every secret export refuses with an explicit "create an encrypted vault" path
````

Replace with:

````text
Vault-less session: every new spec-18 secret export (K03-K06) refuses with an explicit "create an encrypted vault" path, while the existing encrypted keystore v1 backup stays available after a disclosure + typed confirmation (BLOCKERS OD-01; constraint 4)
````

### 82. H2-83 — `FEATURE_ACCEPTANCE_CRITERIA.md` — minor

Reason: Same as H2-81 (criteria section 8, F-WEB-11).

Find (exact):

````text
vault-less sweep requires the OD-01 step-up or explicit vault prompt; e2e refuse/warn
````

Replace with:

````text
vault-less sweep stays available with the OD-01 warning and a vault-creation offer (default: sweep unchanged but warned); e2e covers the warning
````

### 83. H2-84 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — major

Reason: An item that 'records' an owner acknowledgement which has no canonical ID treats silence as approval (BLOCKERS rule) and decides an owner item (prompt section 3).

Find (exact):

````text
owner ack recorded (no canonical ID)
````

Replace with:

````text
owner acknowledgement requested as OD-23 (engineering never records it)
````

### 84. H2-85 — `IMPLEMENTATION_SEQUENCE.md` — major

Reason: An item that 'records' an owner acknowledgement which has no canonical ID treats silence as approval (BLOCKERS rule) and decides an owner item (prompt section 3).

Find (exact):

````text
owner ack recorded (no canonical ID)
````

Replace with:

````text
owner acknowledgement requested as OD-23 (engineering never records it)
````

### 85. H2-86 — `ws_registry.json` — major

Reason: An item that 'records' an owner acknowledgement which has no canonical ID treats silence as approval (BLOCKERS rule) and decides an owner item (prompt section 3).

Find (exact):

````text
owner ack recorded (no canonical ID)
````

Replace with:

````text
owner acknowledgement requested as OD-23 (engineering never records it)
````

### 86. H2-87 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — major

Reason: An item that 'records' an owner acknowledgement which has no canonical ID treats silence as approval (BLOCKERS rule) and decides an owner item (prompt section 3).

Find (exact):

````text
export internal or wired with tests); owner ack (no canonical ID)
````

Replace with:

````text
export internal or wired with tests); owner acknowledgement requested as OD-23 (engineering never records it)
````

### 87. H2-88 — `IMPLEMENTATION_SEQUENCE.md` — major

Reason: An item that 'records' an owner acknowledgement which has no canonical ID treats silence as approval (BLOCKERS rule) and decides an owner item (prompt section 3).

Find (exact):

````text
export internal or wired with tests); owner ack (no canonical ID)
````

Replace with:

````text
export internal or wired with tests); owner acknowledgement requested as OD-23 (engineering never records it)
````

### 88. H2-89 — `ws_registry.json` — major

Reason: An item that 'records' an owner acknowledgement which has no canonical ID treats silence as approval (BLOCKERS rule) and decides an owner item (prompt section 3).

Find (exact):

````text
export internal or wired with tests); owner ack (no canonical ID)
````

Replace with:

````text
export internal or wired with tests); owner acknowledgement requested as OD-23 (engineering never records it)
````

### 89. H2-79 — `BLOCKERS_AND_DECISIONS.md` — major

Reason: The owner-ack decision exists in the plan (lost-team OD-16, 'no canonical ID') but not in BLOCKERS, so the owner cannot see or answer it.

Find (exact):

````text


## 2. Owner actions (OA)
````

Replace with:

````text

| OD-23 | Accept documented limitations instead of implementing them (rows marked owner-ack: F-WEB-04 multi-tab duplicate payment not prevented; F-WEB-06 spec 02 rule 2 invoice-driven fallback infeasible; F-WEB-26 payeeTrust unwired; F-CLI-06 refund execute unsupported because it would need hosted signing) | Accept each / require implementation | Accept F-CLI-06 (constraint 1 requires it) and F-WEB-06 (infeasible by protocol); decide F-WEB-04 and F-WEB-26 per row | Engineering documents each limitation and keeps the row unfinished; it never records an owner acknowledgement itself | `completion_strategy.json` `owner_ack`; IMPLEMENTATION_SEQUENCE §0 | F-WEB-04, F-WEB-06, F-WEB-26, F-CLI-06 |

## 2. Owner actions (OA)
````

### 90. H2-90 — `README.md` — minor

Reason: Follows H2-79 (OD-23).

Find (exact):

````text
(22 owner decisions, 7 owner actions,
````

Replace with:

````text
(23 owner decisions, 7 owner actions,
````

### 91. H2-91 — `IMPLEMENTATION_SEQUENCE.md` — minor

Reason: Follows H2-79.

Find (exact):

````text
**IDs**: canonical only (OD-01..22,
````

Replace with:

````text
**IDs**: canonical only (OD-01..23,
````

### 92. H2-92 — `ws_registry.json` — minor

Reason: Follows H2-79.

Find (exact):

````text
Canonical IDs only (OD-01..OD-22,
````

Replace with:

````text
Canonical IDs only (OD-01..OD-23,
````

### 93. H2-93 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — major

Reason: VERIFIED .github/workflows/contract-analysis.yml:3-12 runs Echidna+Mythril on pull_request; moving Mythril to nightly+tag and making lint/typecheck affected-only remove PR security/quality gates, which prompt section 3 and PLAN 10 forbid; the CP-4 'Mythril report-only comparison (CI run id)' and section 13's 'Mythril record diff' for contract changes would lose their PR evidence.

Find (exact):

````text
affected-only lint/typecheck on PRs (scripts/agent/affected.mjs from #204); cost-balanced shards; Mythril on nightly + tag only; lean+full e2e share one install. Required checks unchanged (typescript, contracts)
````

Replace with:

````text
affected-only lint/typecheck only as an extra fast pre-check (the full lint/typecheck still runs on every PR); cost-balanced shards; Mythril and Echidna stay on every PR that touches their paths (contract-analysis.yml:3-12) and on nightly/tag; lean+full e2e share one install. No job, analyzer, test file or required check may stop running on PRs (prompt section 3)
````

### 94. H2-94 — `IMPLEMENTATION_SEQUENCE.md` — major

Reason: VERIFIED .github/workflows/contract-analysis.yml:3-12 runs Echidna+Mythril on pull_request; moving Mythril to nightly+tag and making lint/typecheck affected-only remove PR security/quality gates, which prompt section 3 and PLAN 10 forbid; the CP-4 'Mythril report-only comparison (CI run id)' and section 13's 'Mythril record diff' for contract changes would lose their PR evidence.

Find (exact):

````text
affected-only lint/typecheck on PRs (scripts/agent/affected.mjs from #204); cost-balanced shards; Mythril on nightly + tag only; lean+full e2e share one install. Required checks unchanged (typescript, contracts)
````

Replace with:

````text
affected-only lint/typecheck only as an extra fast pre-check (the full lint/typecheck still runs on every PR); cost-balanced shards; Mythril and Echidna stay on every PR that touches their paths (contract-analysis.yml:3-12) and on nightly/tag; lean+full e2e share one install. No job, analyzer, test file or required check may stop running on PRs (prompt section 3)
````

### 95. H2-95 — `ws_registry.json` — major

Reason: VERIFIED .github/workflows/contract-analysis.yml:3-12 runs Echidna+Mythril on pull_request; moving Mythril to nightly+tag and making lint/typecheck affected-only remove PR security/quality gates, which prompt section 3 and PLAN 10 forbid; the CP-4 'Mythril report-only comparison (CI run id)' and section 13's 'Mythril record diff' for contract changes would lose their PR evidence.

Find (exact):

````text
affected-only lint/typecheck on PRs (scripts/agent/affected.mjs from #204); cost-balanced shards; Mythril on nightly + tag only; lean+full e2e share one install. Required checks unchanged (typescript, contracts)
````

Replace with:

````text
affected-only lint/typecheck only as an extra fast pre-check (the full lint/typecheck still runs on every PR); cost-balanced shards; Mythril and Echidna stay on every PR that touches their paths (contract-analysis.yml:3-12) and on nightly/tag; lean+full e2e share one install. No job, analyzer, test file or required check may stop running on PRs (prompt section 3)
````

### 96. H2-96 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — major

Reason: NEXT_PHASE_QUEUE K04 and prompt section 13 require the spend proof 'via the independent tool (pinned Foundry cast/anvil)'; WS-19.5 instead has the new zero-dependency tool sign the transfer, i.e. a hand-rolled BigInt ECDSA + transaction encoder that users would run on real recovered keys (nonce/signature bugs leak keys).

Find (exact):

````text
K04 raw key -> EIP-55 address == announced; transfer signed by the tool accepted by anvil (Foundry 1.8.5, synthetic keys)
````

Replace with:

````text
K04 raw key -> EIP-55 address == announced (computed by the tool); the transfer is signed and sent with pinned Foundry 1.8.5 `cast` (the independent EVM implementation NEXT_PHASE_QUEUE K04 names) and accepted by anvil; synthetic keys only; the tool implements no transaction signing
````

### 97. H2-97 — `IMPLEMENTATION_SEQUENCE.md` — major

Reason: NEXT_PHASE_QUEUE K04 and prompt section 13 require the spend proof 'via the independent tool (pinned Foundry cast/anvil)'; WS-19.5 instead has the new zero-dependency tool sign the transfer, i.e. a hand-rolled BigInt ECDSA + transaction encoder that users would run on real recovered keys (nonce/signature bugs leak keys).

Find (exact):

````text
K04 raw key -> EIP-55 address == announced; transfer signed by the tool accepted by anvil (Foundry 1.8.5, synthetic keys)
````

Replace with:

````text
K04 raw key -> EIP-55 address == announced (computed by the tool); the transfer is signed and sent with pinned Foundry 1.8.5 `cast` (the independent EVM implementation NEXT_PHASE_QUEUE K04 names) and accepted by anvil; synthetic keys only; the tool implements no transaction signing
````

### 98. H2-98 — `ws_registry.json` — major

Reason: Same as H2-96 (registry WS-19.5).

Find (exact):

````text
K04 raw key -> EIP-55 address == announced; transfer signed by the tool accepted by anvil (Foundry 1.8.5, synthetic keys)
````

Replace with:

````text
K04 raw key -> EIP-55 address == announced (computed by the tool); the transfer is signed and sent with pinned Foundry 1.8.5 cast (the independent EVM implementation NEXT_PHASE_QUEUE K04 names) and accepted by anvil; synthetic keys only; the tool implements no transaction signing
````

### 99. H2-99 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — major

Reason: Same as H2-96 (WS-19 objective).

Find (exact):

````text
derives scheme-1 stealth keys; proves spend on anvil with pinned Foundry 1.8.5.
````

Replace with:

````text
derives scheme-1 stealth keys and addresses; spend proofs use pinned Foundry 1.8.5 cast/anvil (no hand-rolled ECDSA or transaction signer in the tool).
````

### 100. H2-100 — `ws_registry.json` — major

Reason: Same as H2-96 (WS-19 objective).

Find (exact):

````text
derives scheme-1 stealth keys; proves spend on anvil with pinned Foundry 1.8.5.
````

Replace with:

````text
derives scheme-1 stealth keys and addresses; spend proofs use pinned Foundry 1.8.5 cast/anvil (no hand-rolled ECDSA or transaction signer in the tool).
````

### 101. H2-101 — `IMPLEMENTATION_SEQUENCE.md` — minor

Reason: VERIFIED logs.ts:460 @7a620ff1 ('log block hash differs from canonical block'); completion_strategy/criteria/graph all say WS-11.1 shrinks to records (~0.1 d) but the sequence/plan/registry still schedule 0.7-1.5 d of new code.

Find (exact):

````text
- `WS-11.1` Per-log blockHash cross-check, fail closed
````

Replace with:

````text
- `WS-11.1` Records only (~0.1 d): F-PROTO-03 is VERIFIED_COMPLETE; the per-log canonical blockHash check exists (`packages/chain-adapters/src/logs.ts:438-460`, tests `logs.test.ts:132-148`, `scanHardening.test.ts:82`); cite it, add no code
````

### 102. H2-102 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — minor

Reason: Same as H2-101.

Find (exact):

````text
UB — Per-log blockHash cross-check, fail closed
````

Replace with:

````text
UB — Records only (~0.1 d; F-PROTO-03 VERIFIED_COMPLETE): cite the existing per-log blockHash check `packages/chain-adapters/src/logs.ts:438-460` + `logs.test.ts:132-148`; add no code
````

### 103. H2-103 — `ws_registry.json` — minor

Reason: Same as H2-101.

Find (exact):

````text
"what": "Per-log blockHash cross-check, fail closed"
````

Replace with:

````text
"what": "Records only (~0.1 d; F-PROTO-03 VERIFIED_COMPLETE): cite the existing per-log blockHash check packages/chain-adapters/src/logs.ts:438-460 + logs.test.ts:132-148; add no code"
````

### 104. H2-104 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — minor

Reason: Constraint 3 (explicit RPC selection, no fallback, no unnecessary third-party requests); matches FEATURE_ACCEPTANCE_CRITERIA F-WEB-17 ('with a secondary RPC configured', 'never a built-in fallback').

Find (exact):

````text
Dual-provider readback reconciles both providers, fails closed on disagreement/unreachable; banner provider count
````

Replace with:

````text
When the user has configured a secondary RPC (opt-in; never a built-in default or automatic fallback), readback reconciles both providers and fails closed on disagreement/unreachable; single-provider mode unchanged; banner provider count
````

### 105. H2-105 — `IMPLEMENTATION_SEQUENCE.md` — minor

Reason: Constraint 3 (explicit RPC selection, no fallback, no unnecessary third-party requests); matches FEATURE_ACCEPTANCE_CRITERIA F-WEB-17 ('with a secondary RPC configured', 'never a built-in fallback').

Find (exact):

````text
Dual-provider readback reconciles both providers, fails closed on disagreement/unreachable; banner provider count
````

Replace with:

````text
When the user has configured a secondary RPC (opt-in; never a built-in default or automatic fallback), readback reconciles both providers and fails closed on disagreement/unreachable; single-provider mode unchanged; banner provider count
````

### 106. H2-106 — `ws_registry.json` — minor

Reason: Constraint 3 (explicit RPC selection, no fallback, no unnecessary third-party requests); matches FEATURE_ACCEPTANCE_CRITERIA F-WEB-17 ('with a secondary RPC configured', 'never a built-in fallback').

Find (exact):

````text
Dual-provider readback reconciles both providers, fails closed on disagreement/unreachable; banner provider count
````

Replace with:

````text
When the user has configured a secondary RPC (opt-in; never a built-in default or automatic fallback), readback reconciles both providers and fails closed on disagreement/unreachable; single-provider mode unchanged; banner provider count
````

### 107. H2-107 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — minor

Reason: BLOCKERS TB-02 (08:00Z) states the per-port narrowing is impossible in a static meta CSP; the item text still prescribes it.

Find (exact):

````text
full/self-host: allow only http://127.0.0.1|localhost|[::1]:<port> of the selected endpoint (or remove);
````

Replace with:

````text
full/self-host: remove the mode by default, or keep it with connect-src loopback entries http://127.0.0.1:*, http://localhost:*, http://[::1]:* (a static meta CSP cannot be narrowed to the chosen port; BLOCKERS TB-02) under RV-SEC review; lean CSP never widened;
````

### 108. H2-108 — `IMPLEMENTATION_SEQUENCE.md` — minor

Reason: BLOCKERS TB-02 (08:00Z) states the per-port narrowing is impossible in a static meta CSP; the item text still prescribes it.

Find (exact):

````text
full/self-host: allow only http://127.0.0.1|localhost|[::1]:<port> of the selected endpoint (or remove);
````

Replace with:

````text
full/self-host: remove the mode by default, or keep it with connect-src loopback entries http://127.0.0.1:*, http://localhost:*, http://[::1]:* (a static meta CSP cannot be narrowed to the chosen port; BLOCKERS TB-02) under RV-SEC review; lean CSP never widened;
````

### 109. H2-109 — `ws_registry.json` — minor

Reason: BLOCKERS TB-02 (08:00Z) states the per-port narrowing is impossible in a static meta CSP; the item text still prescribes it.

Find (exact):

````text
full/self-host: allow only http://127.0.0.1|localhost|[::1]:<port> of the selected endpoint (or remove);
````

Replace with:

````text
full/self-host: remove the mode by default, or keep it with connect-src loopback entries http://127.0.0.1:*, http://localhost:*, http://[::1]:* (a static meta CSP cannot be narrowed to the chosen port; BLOCKERS TB-02) under RV-SEC review; lean CSP never widened;
````

### 110. H2-110 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — minor

Reason: Same as H2-107 (WS-01 objective).

Find (exact):

````text
local-proxy scan works under a CSP allowing only the selected loopback origin in the full/self-host profile,
````

Replace with:

````text
local-proxy scan works under a CSP allowing http loopback origins (any port; BLOCKERS TB-02) in the full/self-host profile only,
````

### 111. H2-111 — `ws_registry.json` — minor

Reason: Same as H2-107 (WS-01 objective).

Find (exact):

````text
local-proxy scan works under a CSP allowing only the selected loopback origin in the full/self-host profile,
````

Replace with:

````text
local-proxy scan works under a CSP allowing http loopback origins (any port; BLOCKERS TB-02) in the full/self-host profile only,
````

### 112. H2-112 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — minor

Reason: VERIFIED ls apps/web/src/views: Pay.test.tsx, Pay.i18n/.invoiceQr/.supported.test.tsx; the glob Pay*.test.tsx also captures WS-08's new PaymentDetails*.test.tsx while both WS run in the CP-2->CP-4 window.

Find (exact):

````text
`apps/web/src/views/Pay*.test.tsx`
````

Replace with:

````text
`apps/web/src/views/Pay.test.tsx`, `apps/web/src/views/Pay.*.test.tsx`
````

### 113. H2-113 — `ws_registry.json` — minor

Reason: Same as H2-112 (registry WS-10 owned_paths).

Find (exact):

````text
    "apps/web/src/views/Pay*.test.tsx",
````

Replace with:

````text
    "apps/web/src/views/Pay.test.tsx",
    "apps/web/src/views/Pay.*.test.tsx",
````

### 114. H2-114 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — major

Reason: Same as H2-59 (WS-00.1).

Find (exact):

````text
`git worktree add ../wt/WS-00-integration -b ws/WS-00-integration $START`
````

Replace with:

````text
`git checkout -B <designated branch> $START` in the main checkout (prompt section 5 step 3)
````

### 115. H2-115 — `IMPLEMENTATION_SEQUENCE.md` — major

Reason: Same as H2-59 (WS-00.1).

Find (exact):

````text
`git worktree add ../wt/WS-00-integration -b ws/WS-00-integration $START`
````

Replace with:

````text
`git checkout -B <designated branch> $START` in the main checkout (prompt section 5 step 3)
````

### 116. H2-116 — `ws_registry.json` — major

Reason: Same as H2-59 (registry WS-00.1).

Find (exact):

````text
`git worktree add ../wt/WS-00-integration -b ws/WS-00-integration $START`
````

Replace with:

````text
`git checkout -B <designated branch> $START` in the main checkout (prompt section 5 step 3)
````

### 117. H2-117 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — minor

Reason: Three coordinator WS shared one worktree with three different branches.

Find (exact):

````text
- **Worktree** `../wt/WS-00-integration` · **Branch** `ws/WS-00-rebaseline`
````

Replace with:

````text
- **Worktree** main checkout (integration) · **Branch** the designated integration branch itself
````

### 118. H2-118 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — minor

Reason: Three coordinator WS shared one worktree with three different branches.

Find (exact):

````text
- **Worktree** `../wt/WS-00-integration` · **Branch** `ws/WS-20-ci-release`
````

Replace with:

````text
- **Worktree** main checkout (integration) · **Branch** short-lived local `ws/WS-20-ci-release` cut from the integration tip, merged `--no-ff`
````

### 119. H2-119 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — minor

Reason: Three coordinator WS shared one worktree with three different branches.

Find (exact):

````text
- **Worktree** `../wt/WS-00-integration` · **Branch** `ws/WS-22-tooling-deps`
````

Replace with:

````text
- **Worktree** main checkout (integration) · **Branch** short-lived local `ws/WS-22-tooling-deps` cut from the integration tip, merged `--no-ff`
````

### 120. H2-120 — `IMPLEMENTATION_SEQUENCE.md` — minor

Reason: Stale vs evidence/features/stats.json (08:01Z).

Find (exact):

````text
beta scope impl 87.8 / verif 83.9
````

Replace with:

````text
beta scope impl 87.2 / verif 83.5
````

### 121. H2-121 — `IMPLEMENTATION_SEQUENCE.md` — minor

Reason: Stale vs stats.json effort_days_unfinished_beta_scope [41, 104].

Find (exact):

````text
Matrix headline "beta scope 42.5–106 d" counted rows only;
````

Replace with:

````text
Matrix headline "beta scope 41–104 d" counted rows only;
````

### 122. H2-122 — `IMPLEMENTATION_SEQUENCE.md` — minor

Reason: Drift (H2-03).

Find (exact):

````text
| BR-21 | #203 merged (merge/ff, never squash) so pages.yml/release.yml on main carry the gates | OWNER | OA-01 then OA-02 |
````

Replace with:

````text
| BR-21 | #203 merged (merge/ff, never squash) so pages.yml/release.yml on main carry the gates | DONE after the snapshot: merge commit `5467c158` 2026-11-18T06:56:49Z (tree == `71abc7e5`); OA-01 still UNVERIFIED | OA-02 done; OA-01 |
````

### 123. H2-123 — `IMPLEMENTATION_SEQUENCE.md` — minor

Reason: Follows H2-122.

Find (exact):

````text
Count: 23 start + 9 exit items; 24 engineering-open/partial, 6 owner-only, 1 done (BR-11), BR-04 UNVERIFIED.
````

Replace with:

````text
Count: 23 start + 9 exit items; 24 engineering-open/partial, 5 owner-only, 2 done (BR-11, BR-21), BR-04 UNVERIFIED.
````

### 124. H2-124 — `FEATURE_DEPENDENCY_GRAPH.md` — minor

Reason: stats.json 08:01Z: 154 unfinished.

Find (exact):

````text
the current unfinished set is 155 (151 − 1 + 5).
````

Replace with:

````text
after the H1 rescoring (F-WEB-09 -> VERIFIED_COMPLETE; F-KEY-03 held by SEC-05/SEC-03; F-WEB-07 scored 90/90 instead of held) the current unfinished set is 154 (151 − 2 + 5).
````

### 125. H2-125 — `README.md` — minor

Reason: VERIFIED completion_strategy.json: 156 rows, 2 VERIFIED_COMPLETE.

Find (exact):

````text
Six-way strategy per unfinished feature (155 + 1 resolved)
````

Replace with:

````text
Six-way strategy per unfinished feature (154 + 2 resolved: F-PROTO-03, F-WEB-09)
````

### 126. H2-126 — `FEATURE_ACCEPTANCE_CRITERIA.md` — minor

Reason: Stale row header vs matrix.

Find (exact):

````text
IMPLEMENTED_UNVERIFIED 100/80 · track B-START · WS-01 (WS-01.2)
````

Replace with:

````text
PARTIAL 80/65 (H1 rescoring; was IMPLEMENTED_UNVERIFIED 100/80) · track B-START · WS-01 (WS-01.2)
````

### 127. H2-127 — `FEATURE_ACCEPTANCE_CRITERIA.md` — minor

Reason: Stale row header vs matrix.

Find (exact):

````text
IMPLEMENTED_UNVERIFIED 100/95 · track B-NONGATING · WS-02 (WS-02.4)
````

Replace with:

````text
VERIFIED_COMPLETE 100/95 (H1 rescoring; WS-02.4 = TB-06 script fix + regression protection only) · track B-NONGATING · WS-02 (WS-02.4)
````

### 128. H2-128 — `FEATURE_ACCEPTANCE_CRITERIA.md` — minor

Reason: Stale tier (row sits in 4.2 beta-supporting).

Find (exact):

````text
IMPLEMENTED_UNVERIFIED 100/80 · track POST-BETA · WS-14 (WS-14.4)
````

Replace with:

````text
IMPLEMENTED_UNVERIFIED 100/80 (tier full-profile after H1 rescoring) · track POST-BETA · WS-14 (WS-14.4)
````

### 129. H2-129 — `FEATURE_ACCEPTANCE_CRITERIA.md` — minor

Reason: Same as H2-107 (criteria section 8, F-WEB-07).

Find (exact):

````text
full/self-host: only the selected loopback origin allowed in `connect-src`;
````

Replace with:

````text
full/self-host: mode removed, or `connect-src` gains only `http://127.0.0.1:*`, `http://localhost:*`, `http://[::1]:*` (BLOCKERS TB-02);
````

### 130. H2-130 — `FEATURE_ACCEPTANCE_CRITERIA.md` — minor

Reason: completion_strategy.json F-KEY-03.security_hold (08:00Z); section 8 table lacks it.

Find (exact):

````text
| F-WEB-11 Direct sweep | SEC-03 | WS-07.1 |
````

Replace with:

````text
| F-KEY-03 Keystore v1 backup/restore + verified-backup gate (hold added by the H1 rescoring) | SEC-05, SEC-03 | WS-18.1 + WS-07.1 (WS-02.7 harness) | keystore export uses the WS-18 policy (`SellerKeys.tsx:207`); vault-less export keeps working after disclosure + typed confirmation (`SellerKeys.tsx:221-224`, OD-01 default); R1-R3 seller-vault harness green | OD-01 / OD-09 recorded; review |
| F-WEB-11 Direct sweep | SEC-03 | WS-07.1 |
````

### 131. H2-131 — `FEATURE_ACCEPTANCE_CRITERIA.md` — minor

Reason: `$SP` is the audit session's scratchpad; a fresh session cannot resolve it (the files are in the package's evidence/ or not packaged at all).

Find (exact):

````text
pattern `$SP/final/evidence/teams/E/scripts/egress_walk.mjs`
````

Replace with:

````text
pattern `docs/handoffs/post-consolidation-20261118/evidence/teams/E/scripts/egress_walk.mjs`
````

### 132. H2-132 — `FEATURE_ACCEPTANCE_CRITERIA.md` — minor

Reason: `$SP` is the audit session's scratchpad; a fresh session cannot resolve it (the files are in the package's evidence/ or not packaged at all).

Find (exact):

````text
Reference pattern until it lands: `$SP/final/evidence/teams/D/scripts/indep-vectors.cjs`
````

Replace with:

````text
Reference pattern until it lands: `docs/handoffs/post-consolidation-20261118/evidence/teams/D/scripts/indep-vectors.cjs`
````

### 133. H2-133 — `FEATURE_DEPENDENCY_GRAPH.md` — minor

Reason: `$SP` is the audit session's scratchpad; a fresh session cannot resolve it (the files are in the package's evidence/ or not packaged at all).

Find (exact):

````text
(SEC-38, `$SP/final/evidence/teams/D/scripts/indep-vectors.cjs`)
````

Replace with:

````text
(SEC-38, `docs/handoffs/post-consolidation-20261118/evidence/teams/D/scripts/indep-vectors.cjs`)
````

### 134. H2-134 — `IMPLEMENTATION_SEQUENCE.md` — minor

Reason: `$SP` is the audit session's scratchpad; a fresh session cannot resolve it (the files are in the package's evidence/ or not packaged at all).

Find (exact):

````text
Script: `$SP/out/G-B-scratch/model.py` (`simulate`, `trace`, `check_ownership`).
````

Replace with:

````text
Script: the audit's scratch `model.py` (`simulate`, `trace`, `check_ownership`), not packaged; reproduce from `ws_registry.json` estimates.
````

### 135. H2-135 — `ws_registry.json` — minor

Reason: VERIFIED (check_registry_H2.py): five unfinished rows (F-KEY-01, F-KEY-02, F-WEB-07, F-WEB-11, F-WEB-12) are in no workstream's features/contributes_to, so the WS cards never tell the worker that closing SEC-03/SEC-05/SEC-10 completes them (the mapping exists only in the prompt table and completion_strategy.json).

Find (exact):

````text
   "name": "Step-up re-auth: OD-01 fail-closed default (SEC-03/TB-04) + archive export step-up (F-KEY-05)",
   "features": [
    "F-KEY-05"
   ],
   "contributes_to": [],
````

Replace with:

````text
   "name": "Step-up re-auth: OD-01 fail-closed default (SEC-03/TB-04) + archive export step-up (F-KEY-05)",
   "features": [
    "F-KEY-05"
   ],
   "contributes_to": [
    "F-KEY-01",
    "F-KEY-03",
    "F-WEB-11",
    "F-WEB-12"
   ],
````

### 136. H2-136 — `ws_registry.json` — minor

Reason: VERIFIED (check_registry_H2.py): five unfinished rows (F-KEY-01, F-KEY-02, F-WEB-07, F-WEB-11, F-WEB-12) are in no workstream's features/contributes_to, so the WS cards never tell the worker that closing SEC-03/SEC-05/SEC-10 completes them (the mapping exists only in the prompt table and completion_strategy.json).

Find (exact):

````text
   "name": "Passphrase/KDF floor: offline estimator, generated-passphrase default, high tier for new exports (SEC-05)",
   "features": [],
   "contributes_to": [],
````

Replace with:

````text
   "name": "Passphrase/KDF floor: offline estimator, generated-passphrase default, high tier for new exports (SEC-05)",
   "features": [],
   "contributes_to": [
    "F-KEY-02",
    "F-KEY-03"
   ],
````

### 137. H2-137 — `ws_registry.json` — minor

Reason: VERIFIED (check_registry_H2.py): five unfinished rows (F-KEY-01, F-KEY-02, F-WEB-07, F-WEB-11, F-WEB-12) are in no workstream's features/contributes_to, so the WS cards never tell the worker that closing SEC-03/SEC-05/SEC-10 completes them (the mapping exists only in the prompt table and completion_strategy.json).

Find (exact):

````text
   "name": "Transport honesty: local-proxy CSP (TB-02), wss rejection, fetch options, net-transport claims, embed SRI",
   "features": [
    "F-NET-01",
    "F-WEB-18"
   ],
   "contributes_to": [],
````

Replace with:

````text
   "name": "Transport honesty: local-proxy CSP (TB-02), wss rejection, fetch options, net-transport claims, embed SRI",
   "features": [
    "F-NET-01",
    "F-WEB-18"
   ],
   "contributes_to": [
    "F-WEB-07"
   ],
````

### 138. H2-138 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — major

Reason: Same as H2-45 (PLAN section 8 copy of G-FULL).

Find (exact):

````text
# G-FULL — run from the worktree root on the exact SHA being qualified; record exit codes + pass/skip counts
npm run typecheck
````

Replace with:

````text
# G-FULL — run from the worktree root on the exact SHA being qualified; record exit codes + pass/skip counts
: "${START:?set START to START_SHA or to the last origin/main merged into the integration branch}"   # used by the frozen-path line
npm run typecheck
````

### 139. H2-139 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — minor

Reason: Same as H2-46 (PLAN section 8).

Find (exact):

````text
(cd packages/contracts && forge build --sizes && forge test && forge fmt --check && forge snapshot --check --no-match-test "testFuzz|invariant")
npm run ci:scan-secrets
````

Replace with:

````text
(cd packages/contracts && forge build --sizes && forge test && forge fmt --check && forge snapshot --check --no-match-test "testFuzz|invariant")
(cd packages/pool-contracts && forge build --sizes && forge test && forge fmt --check)    # ci.yml:473-506; baseline 86/0
(cd packages/payer-hiding-contracts && bash scripts/fetch-entrypoint.sh && forge build --sizes && forge test && forge fmt --check)   # baseline 109/0
node --test examples/merchant-checkout/money.test.mjs examples/pos-terminal/parity.test.mjs   # ci.yml:111
python3 scripts/tests/audit-permissions.test.py                                   # ci.yml:553
npm run ci:scan-secrets
````

### 140. H2-140 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — minor

Reason: Same as H2-42 (PLAN 3.3).

Find (exact):

````text
Validator `check_ownership()`: 0 overlaps among WS active in the same window, 0 worker overlaps with coordinator paths (VERIFIED by run; negative test with injected overlaps detected 80 conflicts).
````

Replace with:

````text
Validator `check_ownership()` (audit scratch `model.py`, not packaged; windows are per CP number, so CP-3 and CP-5 items that run concurrently are not compared): 0 overlaps among WS active in the same window, 0 worker overlaps with coordinator paths (VERIFIED by run; negative test with injected overlaps detected 80 conflicts). A more specific owned path beats an overlapping glob of another WS (WS-09 `docs/user/master-backup-recovery.md` in WS-02 `docs/user/**`).
````

### 141. H2-141 — `BLOCKERS_AND_DECISIONS.md` — minor

Reason: VERIFIED: the component is apps/web/src/i18n/LanguagePicker.tsx (lines 19-23 hold the machine-drafted/no-catalog notes); apps/web/src/components/LanguagePicker.tsx does not exist @7a620ff1.

Find (exact):

````text
`apps/web/src/components/LanguagePicker.tsx:19-23`
````

Replace with:

````text
`apps/web/src/i18n/LanguagePicker.tsx:19-23`
````

### 142. H2-142 — `completion_strategy.json` — minor

Reason: F-WEB-07 rationale contradicts its own status field (IMPLEMENTED_UNVERIFIED 90/90).

Find (exact):

````text
blocked by the shipped CSP (SEC-10, TB-02); row is PARTIAL. Fix in WS-01.1.
````

Replace with:

````text
blocked by the shipped CSP (SEC-10, TB-02); the requirement scores half, row is IMPLEMENTED_UNVERIFIED 90/90. Fix in WS-01.1.
````

### 143. H2-143 — `GHOSTPAY_FEATURE_COMPLETION_EXECUTION_PROMPT.md` — major

Reason: `$SOLC_0828` is used two lines later but never defined in the prompt; with SOLC_BIN empty, apps/web/src/features/registry/registry.anvil.test.ts:16-18,61-62 fails under REQUIRE_ANVIL=1 ('' is not nullish), so G-FULL goes red for environment reasons. Defined after forge build because forge build installs solc into ~/.svm.

Find (exact):

````text
(cd packages/contracts && forge build)                                     # artifacts for anvil suites
````

Replace with:

````text
(cd packages/contracts && forge build)                                     # artifacts for anvil suites
SOLC_0828="${SOLC_0828:-$HOME/.svm/0.8.28/solc-0.8.28}"; test -x "$SOLC_0828"   # written by the forge build above (ci.yml:152, foundry.toml:8-10); else the solc-static-linux v0.8.28 release binary
````

### 144. H2-144 — `PARALLEL_AGENT_EXECUTION_PLAN.md` — major

Reason: Same as H2-143 (PLAN section 8 copy).

Find (exact):

````text
(cd packages/contracts && forge build)                                     # artifacts for anvil suites
````

Replace with:

````text
(cd packages/contracts && forge build)                                     # artifacts for anvil suites
SOLC_0828="${SOLC_0828:-$HOME/.svm/0.8.28/solc-0.8.28}"; test -x "$SOLC_0828"   # written by the forge build above (ci.yml:152, foundry.toml:8-10); else the solc-static-linux v0.8.28 release binary
````

