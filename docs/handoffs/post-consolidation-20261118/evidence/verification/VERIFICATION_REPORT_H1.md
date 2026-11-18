# Verification report H1 — post-consolidation audit package (2026-11-18)

Team H1, independent adversarial verification. Read-only on repos and on `$SP/final/`; outputs only in `$SP/out/H/`.
Reviewed: staged package `$SP/final/` as of 07:49Z (= package branch commit `b3c1c86b`, plus `15ad0219`), `$SP/out/G/`
feature-matrix inputs, team outputs. Product source checked: `7a620ff1` (shared worktree `/home/user/wt/cand`, targeted
vitest only) and H1's own worktree `$SP/out/H/wt` @ `7a620ff1` (`npm ci --ignore-scripts` exit 0, `build:libs` exit 0,
lean web build exit 0, bundle scan passed 17 files). Live refs: private bare repo `$SP/out/H/live.git` (objects borrowed
from the shared repo via alternates; nothing written to shared refs). GitHub: `gh api -X GET search/...` only.

## Summary verdict

**PARTLY CONFIRMED — publishable after the blocker and major corrections below.** Core evidence holds: every sampled
test passes, the scorer reproduces `stats.json` exactly (both the 06:24 version and the coordinator's 07:45 v2 with
`overrides.json`), spec 18 has zero code in any ref, all 10 High/Medium security findings reproduce at the cited lines,
no Critical was missed, sampled branch dispositions re-derive. But:

1. **Baseline moved after the snapshot (blocker).** PR #203 was merged at 2026-11-18T06:56:49Z: `main` =
   `5467c158` (parents `cfaebeea` + `71abc7e5`, tree == `71abc7e5`). README, BLOCKERS (OA-02, header, §6), EVIDENCE_INDEX
   and the matrix header still say `main` = `cfaebeea` / #203 unmerged. The merge also auto-marked 26 PRs merged
   (PRs now 206: 122 open / 51 merged / 33 closed-unmerged), #204 was re-integrated as open PR #206, Dependabot replaced
   #85 by #207, and `ls-remote` now shows 219 heads (package branch included).
2. **Feature matrix still deviates from the rubric (major)** even after the coordinator's v2 security holds:
   severity-blind VC rule (F-WEB-09 demoted for a Low defect; F-KEY-03 for a fixed Info flake), F-WEB-07 and F-NET-01
   still score local-proxy as implemented although SEC-10/TB-02 show it is blocked, and three tier errors put
   full-profile-only code (BTC, signed merchant profile) into beta scope.
3. **Branch matrix double-counts 3 stale PR refs** (`pr/139`, `pr/140`, `pr/153` = older fetches of open PRs' own
   branches), so "234 refs" / "six class-B items" overstate (231 distinct; 5 class B), and the three branch rows have
   empty PR fields.
4. Two remediation texts (OD-01 fail-closed default, SEC-03) read literally would block the only encrypted backup
   path for vault-less keys (constraint 4) — clarify.

Counts: 6 checks → 2 CONFIRMED, 4 PARTLY, 0 REFUTED overall. Row/claim level: **81 items checked: 56 CONFIRMED,
18 PARTLY, 7 REFUTED** (29 feature rows: 18/6/5; branch 16: 13/3/0; security 12: 12/0/0; numbers 11: 8/2/1; constraints 5:
1/4/0; consistency 6: 4/2/0; scorer 2: 0/1/1). **63 corrections** (10 blocker, 40 major, 13 minor), all with exact find/replace
strings validated unique against the current staged files and dry-run applied to a copy (JSON stays valid):
`$SP/out/H/corrections_h1.json`.

## Check table

| # | Check | Verdict | Evidence (path:line@sha or command → output) |
|---|---|---|---|
| 1 | Feature matrix (29 rows sampled; scoring; files; tiers) | PARTLY | see §1 below |
| 2 | Branch matrix totals + 12 dispositions | PARTLY | see §2 |
| 3 | Security SEC-01..SEC-10 + Critical sweep | CONFIRMED (1 wording nit) | see §3 |
| 4 | Numbers (README, BLOCKERS, EVIDENCE_INDEX) | PARTLY | see §4 |
| 5 | Constraint compliance of recommendations | CONFIRMED with 2 wording risks | see §5 |
| 6 | Internal consistency (IDs, links, placeholders, personal data) | PARTLY | see §6 |

### §1 Feature matrix

Reproduction: `python3 -I scripts/score_features.py ... B1/features_proto.json B1/features_web.json B2/features.json B3/features.json`
→ byte-identical stats/issues to `out/G` 06:24; `GP_OVERRIDES=scripts/overrides.json` → identical to staged v2 `stats.json`
(VC 37, IU 30, PARTIAL 27, SPEC_ONLY 46, EXP 45, BLOCKED 7; 99 issues). All 935 listed implementation/test paths exist at
`7a620ff1` (`out/H/files_exist.py`; 4 "misses" are notation such as `(none)`). Hand recompute: F-DEP-01 13/15 → 85, 12/15 → 80;
F-WEB-09 18/18 → 100, 17.5/18 → 95; F-CLI-03 11/11 → 100, 9.5/11 → 85; F-SOL-01 7/12 → 60, 6/12 → 50; F-A11Y-03 2/5 → 40,
1/5 → 20; F-BTC-02 9/9 → 100/100: all match.

| Row | Group | Verdict | Evidence |
|---|---|---|---|
| F-BTC-02 | normalized→VC | PARTLY | marks OK: `npx vitest run` header/headerchain/memory/merkleProof/witness/headersync 6 files 115/115; web headers + BtcView.headers 63/63; retarget in `headerchain.ts:9-11,97`. **Tier wrong**: BTC only in `App.tsx:3,12,20` (full), not in `AppLean.tsx:5`/`CORE_ORDER` `AppShell.tsx:39`; 0 btc modules in own lean build. Strategy "consolidate" 1–3 d left on a VC row (dropped from sums). |
| F-NET-02 | normalized→VC | PARTLY | marks OK: net-transport core+browser 60/60 (package 149/149); v3 checksum `onion.ts:33-52`, escapes `core.test.ts:230-232`. **REFUTED text**: "72dde82d is ancestor of cand" — `git merge-base --is-ancestor 72dde82d 7a620ff1` exit 1, `git cherry` 2×`-`; port #134 `8277879e` is the ancestor. |
| F-NET-04 | normalized→VC | CONFIRMED | net-harness 1 file 27/27; test-only, experimental tier fine. |
| F-KEY-07..12 | spec 18 (6 rows) | CONFIRMED | `git grep` ghostpay-stealth-/stealthKeypair/exportStealth/rawKeyExport/masterBackup at `7a620ff1` outside docs: 0; `git log --all -S` over all local + live refs (incl. #205–#208 heads) for these terms outside docs/*.md: 0 commits; any path: only 27882874 (spec), 92c7a362 (queue), 15ad0219 (this package). Tier beta-core matches spec 18 "before beta exit". |
| F-KEY-03 | beta-core IU | PARTLY | tests: SellerKeys/recovery/session/keystore 4 files 89/89, ux-vault portable-parity 148/148. Status IU is right for the wrong reason: only defect is "Info ... fixed test-only in 7a620ff1"; real reason is SEC-05 (`SellerKeys.tsx:207`) + SEC-03 (`:221-224`). |
| F-WEB-09 | beta-core IU | REFUTED (status) | 7 files 121/121; only defect Low (stale `apps/web/scripts/test-reconciliation-idb.mjs:71` `invalidateFrom(100n)` vs 3-arg API `reconciliation-portable.ts:154`; confirmed). Rubric: no open Medium+ → VERIFIED_COMPLETE (100/95). |
| F-CLI-03 | beta-core IU | CONFIRMED | backup-command/recovery-auth-negative/b0-receipt-recovery 21/21; 100/85 recomputed. |
| F-POOL-06 | experimental | PARTLY | 7 passed + 1 skipped files, 73/4; impl 100 % comes from a 2-item list while its README says "proof of concept, not wired into any app" (team said 65). Status unaffected. |
| F-PRIV-05 | experimental | CONFIRMED | hops 8 files 57/57; only importer `packages/hygiene/src/hop-source.ts` (wired=half correct). |
| F-SOL-01 | full-profile EXP | CONFIRMED | solana-stealth 109/109; SolanaView + chain.hardening 40/40; wired `App.tsx:4,21` full only. |
| F-UX-01, F-UX-07 | experimental | CONFIRMED | 0 importers of @ghostpay/ux-connect / ux-guide in apps/web, apps/relayer, packages/cli. |
| F-WEB-08 | beta-core VC | CONFIRMED | settings/Settings/race/defaultServices/(+sweep) 8 files 236/236; `settings.ts:19-29` rpcUrls `{}`; `AppShell.tsx:206-226` user URL only; `rpc.ts:202-277` verifies eth_chainId. Nit: wss accepted but unsupported (SEC-19, Low). |
| F-WEB-11 | beta-core VC→held | CONFIRMED (v2 hold) | tests pass; chainId bound in signed EIP-1559 tx `sweep.ts:617`; key verified `deriveVerifiedSweepKey`; open SEC-03 (`Sweep.tsx:150-154`) → coordinator hold correct. |
| F-PROTO-06 | beta-core VC | CONFIRMED | invoice-schema 12 files 715/715; domain `sign.ts:9` "GhostPay.Invoice.v1\0", digest keccak(domain‖canonical) `sign.ts:44-45`. |
| F-MER-05 | beta-core VC | REFUTED (tier) | MerchantProfilePanel/MerchantTemplateIssuer/merchantIdentity/merchantTemplate mounted only via `App.tsx:10,26` (`mainPrelude`); `AppLean.tsx:4` excludes embedding; own lean build: 0 of these modules (306 modules). test_files list empty. → full-profile. |
| F-KEY-02 | beta-core VC→held | CONFIRMED (v2 hold) | open SEC-05 on vault-save passphrase (`SellerKeys.tsx:311`) → hold correct. |
| F-DEP-01 | beta-core PARTIAL | CONFIRMED | chain-adapters deployments+verify 34/34, web manifest 19/19, localBuildProfile 33/33; `apps/web/deployments/README.md:37` names missing `validate:deployments`. |
| F-A11Y-03 | PARTIAL (from NOT_STARTED) | PARTLY | 40/20 recomputed; the 40 % is general aria code (F-A11Y-01 territory); the feature itself is manual AT qualification = external acceptance (EX-03). |
| F-DOC-04 | beta-core PARTIAL | PARTLY | status PARTIAL but strategy "none" (one of 12 non-complete rows with strategy "none": F-KEY-03, F-CLI-01, F-CLI-03, F-CLI-05, F-RLY-01, F-RLY-04, F-OPS-03, F-HOST-03, F-HOST-04, F-DOC-01, F-DOC-03, F-DOC-04). |
| F-WEB-07 | beta-supporting VC→held | REFUTED (marks) | requirement 1 "Transports direct / tor-browser / local-proxy ... honest copy" marked yes/yes, but http-loopback is blocked by `connect-src 'self' https: wss:` (`apps/web/index.html:13`, own lean build identical) — SEC-10, TB-02; v2 hold keeps 100/100. Correct: 90/90 IU. |
| F-NET-01 | beta-supporting IU | REFUTED (impl 100) | 4-item list omits the local-proxy profile named in the row; team said PARTIAL 70/65. With the requirement: PARTIAL 80/65. |
| F-BTC-01 | beta-supporting IU | REFUTED (tier) | own strategy_detail: "wired in full profile (App.tsx 'btc' view; absent from AppLean)"; name says "(full-profile web)". |
| F-PROTO-03 | coordinator override | CONFIRMED | `packages/chain-adapters/src/logs.ts:438-460` per-log `block.hash !== a.blockHash` → fail (`:460`); logs+scanHardening 70/70. |
| Scorer | VC rule | REFUTED vs rubric | `score_features.py` uses `not f.get("confirmed_defects")` (any severity, even fixed); brief rubric: "no open Medium+ defects". Only F-KEY-03 and F-WEB-09 are affected. |
| Scorer | rounding | Info | Python half-to-even: 9 values in 7 rows (e.g. F-RLY-04 62.5→60, F-CTR-02 92.5→90); no status change. |

Effect of corrections C-11..C-17 (computed with `out/H/score_features_h1.py` + `out/H/overrides_h1.json`, which contain the
coordinator's overrides unchanged plus H1's): VC 38, IU 28, PARTIAL 28, SPEC_ONLY 46, EXP 45, BLOCKED 7; tiers 42/37/25/45/43;
beta-core 18 VC, 10 IU, 5 PARTIAL, 3 BLOCKED, 6 SPEC_ONLY; beta scope 79 rows (weight 1079) 87.2 %/83.5 %; excluding future
79.7/74.8; all 73.8/69.1; effort 41–104 / 202–462 / 309–920 d (ESTIMATE; includes 0.5–2 d H1 ESTIMATE for F-WEB-07); 106 issues.
Rendered candidate: `out/H/FEATURE_COMPLETION_MATRIX_h1.md`; JSON `out/H/merged_features_h1.json`, `out/H/stats_h1.json`.

### §2 Branch matrix

| Item | Verdict | Evidence |
|---|---|---|
| JSON totals A1 B6 C205 D14 E7 F1 = 234 (217 branch + 17 PR-only); C ancestors 169 heads + 7 PR; C non-ancestors 28 heads (14 PE + 14 superseded) + pr/32 | CONFIRMED (internal) | `branch_recovery_matrix.json` counts |
| 217 heads vs `git ls-remote --heads origin` | PARTLY | 217 at census; live 07:10Z: 219 = −`dependabot/github_actions/actions-1850456dc8` +`nodata/zealous-hopper-lr0nxe` (#205) +`claude/ghostpay-consolidation-9xhtxg` (#206) +`dependabot/github_actions/actions-b9ade1236b` (#207); moved: main, wizardly-allen (→`5467c158`), 3 zero-codex heads, admiring-albattani (#208). Docs: coordinator note `BRANCH_RECOVERY_MATRIX.md:7` handles the package branch, but `:15`, `:263` and JSON `local_only_excluded` still say "absent on remote"; EVIDENCE_INDEX cites 217 from a command that now prints 219. |
| 17 PR-only refs | PARTLY | live `refs/pull/{139,140,153}/head` == branch tips; shared repo now 14 PR-only refs. 3 entries are fetch-skew duplicates (pr/140 counted as a 6th class-B item). Branch rows for #139/#140/#153 show no PR (open_prs.json lists them as heads). |
| Census "169/48" | CONFIRMED with caveat | packaged census: 217 heads (+zealous) → 168 strict ancestors, wizardly-allen at `71abc7e5` non-ancestor (docs-only) → 169 contained; 14 PE; 32 differing (COMMON.md says 33; Team C 31). |
| A `nodata/eager-babbage-0w6sf6` | CONFIRMED | not ancestor, cherry 2×`+`; `git merge-tree --write-tree --name-only 7a620ff1 2693b08e` rc=1: ci.yml (content), CLAUDE.md (add/add); 11 files +932/−1. Since done as open #206 (`c487f0fe` = merge 71abc7e5+2693b08e; PACKAGE_MAP regenerated 22 lines). |
| B `docs-pages-scope-20261112` @400e20f1 | CONFIRMED (PR field wrong) | 109×`+`; qr-colors hunk vs `qrKinds.test.ts:40-42` bearer precedence; patchcheck 8 clean / 101 conflict. |
| B `pr/140` @58a47006 | PARTLY | duplicate of the branch above; its "101 of 109" text is the branch's (actual 100 of 108). |
| B dependabot #85/#87/#176 | CONFIRMED | 1×`+` each; candidate pins foundry-toolchain v1.9.2 (8+1 uses), create-pull-request v7; lock: chai 6.3.0, viem 2.57.13, vitest 5.0.5, vite 8.3.5, typescript 5.9.3, @scure/base 1.2.6, hardhat 2.29.2. #85 since closed (→ #207). |
| B `ghostpay-cloud-recovery-2026-10-26` | CONFIRMED | 12×`+`; 57dcf7e8 contained; `git diff 7a620ff1 57dcf7e8 -- apps/web/scripts/test-seller-vault-idb.mjs` 157+/4−; R1–R3 PASS line only in branch; not in package.json/CI. |
| F `gh-pages` @cc8d0794 | CONFIRMED | 3 commits, root, `git merge-base` empty; `pages.yml:126,233` artifact deploy. |
| C `onion-canonical-host-20261111` | CONFIRMED | 0/2 (`-`). |
| C `fix/remediation-f95457fd-22ecf9` | CONFIRMED | 0/1; 0fe67bcd and revert 051c1c12 both ancestors; 92a05a23 test. |
| C `claude/happy-maxwell-onl4x5` | CONFIRMED | 1×`+`; `scripts/audit/gen-audit24-report.py:324` S_ISREG, `:339` fchmod. |
| D `codex/recovery-spec02-unqualified-20261116` | CONFIRMED | 4×`+`; adds README + 3 `.txt` archives (376 lines). |
| E `codex/setup-autonomous-agent-20261104` | CONFIRMED (nit) | 2×`+`; candidate has `.github/agent-prompts/openai-agents.steps.disabled.yml.txt`; branch *modifies* (not adds) openai-agents.yml. |
| Shallow-census correction (#16/#17) | CONFIRMED | e96cee1a, 698404ca ancestors; repo not shallow. |

### §3 Security

| ID | Verdict | Evidence re-checked at `7a620ff1` |
|---|---|---|
| SEC-01 High | CONFIRMED | `scripts/pages/build-pages.sh:60-69` (`*.github.io` → shared), `:93-101` (manifests refused unless `GHOSTPAY_PAGES_ALLOW_SHARED_ORIGIN=testnet`); search API `user:djshellshoxxx`: 86 public repos, 36 `has_pages` incl. GhostPay → 35 siblings. High justified as gate severity (payments refused by default; stated in title). |
| SEC-02 High | CONFIRMED as UNVERIFIED | `ghostpay-codex-cloud.yml:57` comment (2026-11-04), `:19-29` contents:write + PAT; `pages.yml:59-69,213-233`; `release.yml:192-197` attestation only for tarball; `allowed_signers` 0 keys. Protection state still unreadable (search-only API). |
| SEC-03 Medium | CONFIRMED | `keyVault.ts:257-266` (`return undefined` without vault), `:328-333`; `SellerKeys.tsx:216-224`; `Sweep.tsx:150-154` `vaultGuard?.()`; `AppShell.tsx:126-162` idle lock keeps un-backed-up keys. |
| SEC-04 Medium | CONFIRMED | 0 `ghostpay-stealth-` hits; `packages/cli/src/commands/scan.ts:88` checkAnnouncement only; no deriveStealthSecret/sign/sweep in `packages/cli/src`. Independent recovery feasible: `indep-keystore-recovery.mjs` re-run → tamperRejected/stealthKeyMatches/stealthAddrMatches true. |
| SEC-05 Medium | CONFIRMED | `keystore-portable.ts:186-216` (score<2 rejected; 45–60 bits "fair" accepted), `:62` MIN 14; `passphrase-probe.mjs` re-run: Michael1985!!x 65 bits accepted, Jennifer041990 55, Liverpool2026! 53, Correcthorse12 65; Password123456/qwerty…/Summer2026!!ab rejected — identical to Team D. |
| SEC-06 Medium | CONFIRMED | `GhostPayPolicyRouter.sol:93-106` `PolicyRef calldata policy`; `:236-242` predictAddress(owner, policyHash); `IGhostPayPolicyRouter.sol:18`; `docs/audits/26-…:45` AUD24-01 Medium. |
| SEC-07 Medium | CONFIRMED | `PolicyAccountFactory.sol:113-114`, `:128-164` balanceOf/allowance without try/catch, `UnexpectedFeeDelta` revert; immutable factory. Medium OK (scheme 2 undeployed). |
| SEC-08 Medium | CONFIRMED as SUSPECTED | gh-pages `cc8d0794` 2026-10-21; `assets/index-Bmfq019n.js` fetches `./deployments/${id}.json`; `docs/pages/README.md:173`; live site unreadable. |
| SEC-09 Medium | CONFIRMED | `build-pages.sh:60-69`; `pages.yml:100` default origin `https://<owner>.github.io`; deploy/smoke (`pages.yml:236-262`, `smoke.mjs`) assert no origin. |
| SEC-10 Medium | CONFIRMED (wording) | `scanPrivacy.ts:72-79` accepts http/https loopback; CSP `connect-src 'self' https: wss:` in `index.html:13`, `public/_headers:5`, `deploy/nginx/security-headers.conf:3`; own lean build identical. Nit: https loopback would pass (C-60/61). Severity Medium vs SEC-19 Low (same fail-closed class) defensible by the documented privacy claim. |
| Counts | CONFIRMED | 49 rows; 0/2/8/20/19; status mix as in §3 table; all 22 D + 23 E sources mapped; no severity lowered (script check). |
| Critical sweep | none missed | keystore: scrypt N=2^17 r=8 p=1, 16-byte random salt, 12-byte random IV per encryption, AES-GCM tag 128, AAD binds meta+N/r/p, import bounds N∈[2^14,2^18], r≤8, p≤2, ≤8 KB, NFKC (`keystore-portable.ts:49-62,74-85,322-341,372-401`); no production caller lowers N (grep). Stealth: `indep-vectors.cjs` re-run 6/6 (elliptic+js-sha3). Sweep: chainId from target in signed EIP-1559 tx (`sweep.ts:617`), RPC eth_chainId verified at creation and rechecked (`rpc.ts:157,202-277`); relayed EIP-712 binds chainId+verifyingContract (SEC-34). Invoice: `sign.ts:9,44-45` domain `GhostPay.Invoice.v1\0` + canonical JSON incl. chainId. Built lean CSP (own build): no inline script, one same-origin module, `script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`; broad `connect-src https: wss:` by design; no frame-ancestors via meta (SEC-18 Low). |

### §4 Numbers

| Claim | Verdict | Evidence |
|---|---|---|
| README "Results at a glance" (current 07:47 text) | CONFIRMED vs v2 stats | 37/30/27/46/45/7, 155 unfinished, beta-core 18 VC, 87.9/84.0, 79.9/75.0, 73.9/69.3, 43–107 / 202–461 / 309–919 = `final/evidence/features/stats.json`. Change if C-11..C-17 are applied (C-18..C-24). |
| "about 12k tests (0 failures)", e2e 66/3 and 78/1, Foundry 490+86+109 | CONFIRMED | `out/F/test_inventory.json` vitest sum: 670 files, 12,018 passed, 0 failed, 78 skipped; F logs. |
| 49 findings 0/2/8 | CONFIRMED | `security_findings.json`. |
| 35 sibling Pages sites | CONFIRMED | search API (36 has_pages incl. GhostPay). |
| 169 of 217, class A 1, class B six | PARTLY | 169 = 168 strict + candidate branch; "six class-B" = 5 distinct + stale pr/140 (C-27/C-28). |
| BLOCKERS counts (22 OD, 7 OA, 7 EX, 4 AC, 10 TB), EX-06 73 cells, OD-16 24 listed/4 shipped, OD-08 ADR line 3 | CONFIRMED | table parse; `PROMOTION_PACKET.md:63`; `apps/web/src/i18n/languages.ts:20-43`, `apps/web/locales/`; `ADR-0029…:3`. |
| EVIDENCE_INDEX §1 main / heads / PRs | REFUTED (stale) | live: main `5467c158`, 219 heads, 206 PRs (122/51/33) (C-06..C-08). |
| EVIDENCE_INDEX §2 census "217 heads + 202 PR refs" | PARTLY | file holds 218 origin refs (incl. zealous) + 202 (C-38). |
| EVIDENCE_INDEX §4 rows (722 packages, 111 actions, 199/1/1 scripts, 72/72, 33/33, package suites) | CONFIRMED | `evidence/cand_npm_ci.log`; `check-actions.log`; F inventory (chain-adapters 551+22 = 573, relayer 470+5 = 475, policy-scheme 88+7 = 95); own run localBuildProfile 33/33. |
| Git numbers (1,484 ahead; 2,210 / 726 commits; 278c9a27..7a620ff1 = 48; d91ae16a..7a620ff1 = 2; trees 594c9f6a/36177d29/1bc75573/45815e10) | CONFIRMED | `git rev-list --count`, `git rev-parse <sha>^{tree}`. |
| Team A 34 tasks 16/3/9/4/1/1 | CONFIRMED | MD table == `consolidation_tasks.json`. |

### §5 Constraint compliance

No recommendation adds custody, a mandatory backend, telemetry, an RPC default/fallback (OD-10: "user-selected RPC with
no fallback"), raw-key clipboard (OD-02 "never"), or an anonymity claim (SECURITY §6: "GhostPay does not make payments
anonymous"); OD-12 rejects guardian recovery, OD-21 keeps operator services optional and out of lean. Risks:
OD-01 fail-closed default "Secret export refuses in vault-less sessions" and the SEC-03 remediation ("require an encrypted
vault or verified backup … before any sweep/export") would, read literally, block the encrypted keystore v1 backup — the
only backup for keys that exist nowhere else (constraint 4; fund-loss risk) → C-39..C-41. TB-02's "CSP that allows only
the selected loopback origin" is not implementable in a static meta CSP → C-51. OA-05 should archive `gh-pages` first
(constraint 5, OD-19) → C-50. Note (no correction): forcing vault creation before export stores more plaintext metadata
on the shared origin (SEC-22, SEC-01) — weigh in OD-01.

### §6 Internal consistency

IDs: every OD/OA/EX/AC/TB, SEC-xx, F-*, D-xx, E-xx reference in the 12 staged MD files resolves (scanner, ranges expanded);
all `affected_features` in `security_findings.json` exist. Links: at 07:49Z all 14 README files plus `completion_strategy.json`,
`ws_registry.json`, `security_findings.json` are staged; no broken relative link (`ws_registry.json` is linked from
FEATURE_DEPENDENCY_GRAPH/ACCEPTANCE_CRITERIA and now present but not in the README list — it is mentioned in row "—").
Placeholders: none (TODO hits are quoted content). Machine/scratch paths in published top-level docs: 6 (C-34, C-55..C-59).
Personal data: none beyond public handles (`djshellshoxxx`, bots); 0 e-mail addresses; census/branch JSON have no author
fields. Contradictions found: POST §7 vs §5f (Mythril), SECURITY §13 vs §5, BRANCH §0 vs EVIDENCE §6.1, BRANCH §1/§7 vs its
line 7, TB-10 vs EVIDENCE §6.3, F-WEB-07/F-NET-01 vs SEC-10/TB-02, F-NET-02 vs BRANCH matrix, OD-20 (BTC outside the lean
beta) vs matrix tier beta-supporting.

## Items not verified and why

- Branch protection / rulesets / environments / Pages source: brief allows only search APIs; github.io blocked. Whether OA-01
  was done before the #203 merge: unknown. Who pressed merge: the commit author is the owner account; person vs automation
  not determinable.
- CI run conclusions (44242366118 etc.): Actions API not used (search-only); taken from Teams A/F.
- Playwright e2e, Foundry, Echidna, Mythril, Slither, hardhat: not re-run by H1 (tools missing or out of time); relied on F.
- Team E egress walk and CSP probe: not re-run (CSP verified statically on H1's own lean build instead).
- IMPLEMENTATION_SEQUENCE, PARALLEL_AGENT_EXECUTION_PLAN, FEATURE_ACCEPTANCE_CRITERIA, FEATURE_DEPENDENCY_GRAPH,
  completion_strategy.json, ws_registry.json, the execution prompt and the README workstream totals (161–302 d, 16–28 d,
  26–43 d): staged during this review; H2 scope; only link resolution checked.
- The package is a moving target: the coordinator committed `b3c1c86b` at 07:48Z during this review; corrections were
  re-validated against the 07:49Z staged files.

## H1 artefacts

`$SP/out/H/VERIFICATION_REPORT_H1.md` (this file), `corrections_h1.json` (63 find/replace items), `build_corrections.py`
(validator), `overrides_h1.json` + `score_features_h1.py` (coordinator overrides + H1 corrections; severity-aware VC rule,
requirement_additions, tier_corrections, field_corrections), `stats_h1.json`, `merged_features_h1.json`,
`scoring_issues_h1.md`, `FEATURE_COMPLETION_MATRIX_h1.md`, `files_exist.py`, `lsremote_heads.txt`, `live.git` (private,
alternates to the shared repo), `wt/` (private worktree @ `7a620ff1`, registered in `git worktree list`; remove with
`git -C /home/user/GhostPay worktree remove --force $SP/out/H/wt` when done).

## Corrections (apply in order; each `find` is unique in the current staged file; C-11 is a regeneration step)

`file` is relative to the package root (`$SP/final/`). C-09 and C-26 also apply verbatim to `$SP/out/G/matrix_header.md`. C-12..C-17 change scorer inputs: after applying them, run C-11 (re-score + re-render `FEATURE_COMPLETION_MATRIX.md` and `feature_completion_matrix.json`); C-18..C-25 then match the regenerated `stats.json`. If C-11..C-17 are rejected, skip C-18..C-25 (the current README already matches the v2 stats). All 62 text edits were dry-run applied in order to a copy of `$SP/final/` at 07:57Z: every `find` unique, JSON files still valid.

### C-01 [blocker] `README.md`

Reason: Baseline is stale: main moved to the #203 merge commit after the snapshot; the next session must branch from the new main.

Evidence: PR #203 was merged after the audit snapshot: GitHub search API merged_at 2026-11-18T06:56:49Z; live `git ls-remote` 07:10Z: refs/heads/main = 5467c158069c5bab264b6a653ac56e89e13f3e13 (parents cfaebeea + 71abc7e5; `git diff --quiet 71abc7e5 5467c158` exit 0); author = owner account

Current text:
```text
| `main` | `cfaebeeae22f292cb0bb3074619b2603cb738367` (unprotected per prior session) |
```

Replacement:
```text
| `main` | `cfaebeeae22f292cb0bb3074619b2603cb738367` while this audit ran (unprotected per prior session). **After the snapshot** PR #203 was merged (2026-11-18T06:56:49Z): `main` = merge commit `5467c158069c5bab264b6a653ac56e89e13f3e13` (parents `cfaebeea` + `71abc7e5`; tree identical to `71abc7e5`, so product source = `7a620ff1`). Branch-protection state is still unverified (OA-01). |
```

### C-02 [blocker] `README.md`

Reason: OA-02 is done (merge at 06:56:49Z); listing it as an open owner blocker is wrong.

Evidence: PR #203 was merged after the audit snapshot: GitHub search API merged_at 2026-11-18T06:56:49Z; live `git ls-remote` 07:10Z: refs/heads/main = 5467c158069c5bab264b6a653ac56e89e13f3e13 (parents cfaebeea + 71abc7e5; `git diff --quiet 71abc7e5 5467c158` exit 0); author = owner account

Current text:
```text
branch protection (OA-01), merging #203 (OA-02) and the
```

Replacement:
```text
branch protection (OA-01; PR #203 itself was merged after the snapshot, closing OA-02) and the
```

### C-03 [blocker] `BLOCKERS_AND_DECISIONS.md`

Reason: Row describes an action that has already happened; its 'why' (main lacks verify-tag.sh/release-signers) is no longer true.

Evidence: PR #203 was merged after the audit snapshot: GitHub search API merged_at 2026-11-18T06:56:49Z; live `git ls-remote` 07:10Z: refs/heads/main = 5467c158069c5bab264b6a653ac56e89e13f3e13 (parents cfaebeea + 71abc7e5; `git diff --quiet 71abc7e5 5467c158` exit 0); author = owner account; `git ls-tree --name-only 5467c158 scripts/verify-tag.sh .github/release-signers/` lists both (cfaebeea: none)

Current text:
```text
| OA-02 | Mark PR #203 ready and merge it with a merge commit or fast-forward (never squash) after OA-01 | `release.yml` reads `scripts/verify-tag.sh` and `.github/release-signers/` from `main`, which lack them | F release gate 2; PROMOTION_PACKET | Release pipeline; Pages workflow on main |
```

Replacement:
```text
| OA-02 | **Done after the audit snapshot:** PR #203 merged 2026-11-18T06:56:49Z as merge commit `5467c158` (not squash; tree == `71abc7e5`). Unverified whether OA-01 was completed first | `main` now carries `scripts/verify-tag.sh` and `.github/release-signers/` (verified with `git ls-tree 5467c158`), so release gate 2 is cleared; gates 1 (no signing key) and 3 (Mythril) remain | F release gate 2; PROMOTION_PACKET; `git ls-remote` 07:10Z | Release pipeline and the new Pages workflow are now on main |
```

### C-04 [blocker] `BLOCKERS_AND_DECISIONS.md`

Reason: Header baseline stale.

Evidence: PR #203 was merged after the audit snapshot: GitHub search API merged_at 2026-11-18T06:56:49Z; live `git ls-remote` 07:10Z: refs/heads/main = 5467c158069c5bab264b6a653ac56e89e13f3e13 (parents cfaebeea + 71abc7e5; `git diff --quiet 71abc7e5 5467c158` exit 0); author = owner account

Current text:
```text
`main` = `cfaebeeae22f292cb0bb3074619b2603cb738367`. Finding IDs refer to
```

Replacement:
```text
`main` = `cfaebeeae22f292cb0bb3074619b2603cb738367` at audit time; after the snapshot PR #203 was merged (2026-11-18T06:56:49Z) and `main` = `5467c158` (tree == `71abc7e5`). Finding IDs refer to
```

### C-05 [blocker] `BLOCKERS_AND_DECISIONS.md`

Reason: Assumption 1 is overtaken by events.

Evidence: PR #203 was merged after the audit snapshot: GitHub search API merged_at 2026-11-18T06:56:49Z; live `git ls-remote` 07:10Z: refs/heads/main = 5467c158069c5bab264b6a653ac56e89e13f3e13 (parents cfaebeea + 71abc7e5; `git diff --quiet 71abc7e5 5467c158` exit 0); author = owner account

Current text:
```text
not `main`; `main` is an ancestor and receives everything only through the owner's merge of #203.
```

Replacement:
```text
not `main`; `main` was an ancestor during the audit and received everything through the owner's merge of #203 at 2026-11-18T06:56:49Z (`5467c158`, tree == `71abc7e5`), after this snapshot.
```

### C-06 [blocker] `EVIDENCE_INDEX.md`

Reason: Evidence table must record the post-snapshot main.

Evidence: PR #203 was merged after the audit snapshot: GitHub search API merged_at 2026-11-18T06:56:49Z; live `git ls-remote` 07:10Z: refs/heads/main = 5467c158069c5bab264b6a653ac56e89e13f3e13 (parents cfaebeea + 71abc7e5; `git diff --quiet 71abc7e5 5467c158` exit 0); author = owner account

Current text:
```text
| `main` | `cfaebeeae22f292cb0bb3074619b2603cb738367` (merge of #189, 2026-11-16) | `git rev-parse origin/main` |
```

Replacement:
```text
| `main` | `cfaebeeae22f292cb0bb3074619b2603cb738367` (merge of #189, 2026-11-16) during the audit; after the snapshot `5467c158069c5bab264b6a653ac56e89e13f3e13` (merge of #203, 2026-11-18T06:56:49Z, parents `cfaebeea` + `71abc7e5`, tree == `71abc7e5`) | `git rev-parse origin/main`; `git ls-remote origin refs/heads/main` (07:10Z) |
```

### C-07 [blocker] `EVIDENCE_INDEX.md`

Reason: The documented command now returns 219, not 217; the snapshot time and delta must be stated (task requirement: handle the package's own branch).

Evidence: `git ls-remote --heads origin` 07:10Z (219 lines) vs branch_recovery_matrix.json branch entries (217)

Current text:
```text
| Remote branch heads | 217 | `git ls-remote --heads origin \| wc -l` |
```

Replacement:
```text
| Remote branch heads | 217 at the census (~06:10Z; this package's branch was not yet pushed). Live at 07:10Z: 219 = 217 − `dependabot/github_actions/actions-1850456dc8` (#85 closed) + `nodata/zealous-hopper-lr0nxe` (#205, this package) + `claude/ghostpay-consolidation-9xhtxg` (#206, #204 re-integrated) + `dependabot/github_actions/actions-b9ade1236b` (#207); moved: `main` and `nodata/wizardly-allen-qwol6u` → `5467c158`, the three zero-codex docs heads, `claude/admiring-albattani-6kydor` (#208) | `git ls-remote --heads origin \| wc -l` |
```

### C-08 [blocker] `EVIDENCE_INDEX.md`

Reason: PR state changed materially after the snapshot (26 PRs auto-merged by the #203 merge); retirement planning (OD-19, A33) depends on it.

Evidence: gh api -X GET search/issues q='repo:djshellshoxxx/GhostPay is:pr' total 206; is:open 122; is:merged 51; is:closed is:unmerged 33 (07:10Z)

Current text:
```text
| PRs | 202: 145 open, 25 merged, 32 closed unmerged (highest #204) |
```

Replacement:
```text
| PRs | 202: 145 open, 25 merged, 32 closed unmerged (highest #204) at ~05:37Z. Live at 07:10Z: 206 PRs (highest #208): 122 open, 51 merged, 33 closed unmerged — the #203 merge auto-marked 26 contained PRs merged (e.g. #187, #157, #136, #84, #78), #85 closed, #205–#208 opened |
```

### C-09 [blocker] `evidence/features/matrix_header.md`

Reason: Header (rendered into FEATURE_COMPLETION_MATRIX.md line 3) states the candidate is not merged. Apply to out/G/matrix_header.md too, then re-render.

Evidence: PR #203 was merged after the audit snapshot: GitHub search API merged_at 2026-11-18T06:56:49Z; live `git ls-remote` 07:10Z: refs/heads/main = 5467c158069c5bab264b6a653ac56e89e13f3e13 (parents cfaebeea + 71abc7e5; `git diff --quiet 71abc7e5 5467c158` exit 0); author = owner account

Current text:
```text
Default branch `main` = `cfaebeeae22f292cb0bb3074619b2603cb738367` (an ancestor; the candidate is not merged).
```

Replacement:
```text
Default branch `main` = `cfaebeeae22f292cb0bb3074619b2603cb738367` at audit time (an ancestor); after the snapshot PR #203 was merged (2026-11-18T06:56:49Z, `main` = `5467c158`, tree == `71abc7e5`).
```

### C-10 [blocker] `POST_CONSOLIDATION_AUDIT.md`

Reason: Task table (A21 NOT STARTED, A26/A33) and §1/§8.4 are stale without a post-snapshot note.

Evidence: PR #203 was merged after the audit snapshot: GitHub search API merged_at 2026-11-18T06:56:49Z; live `git ls-remote` 07:10Z: refs/heads/main = 5467c158069c5bab264b6a653ac56e89e13f3e13 (parents cfaebeea + 71abc7e5; `git diff --quiet 71abc7e5 5467c158` exit 0); author = owner account

Current text:
```text
Audit date 2026-11-18. Read-only. Tags: VERIFIED (command/code at SHA) | INFERRED | UNVERIFIED.
```

Replacement:
```text
Audit date 2026-11-18. Read-only. Tags: VERIFIED (command/code at SHA) | INFERRED | UNVERIFIED.⏎
⏎
> **After this snapshot (H1, 07:10Z):** PR #203 was merged at 06:56:49Z (`main` = `5467c158`, tree == `71abc7e5`), so A21 is done; GitHub then auto-marked 26 contained PRs merged (A33 partly overtaken); #204 was re-integrated onto the consolidated tree as open PR #206 (`c487f0fe`, A26). Rows below describe the snapshot.
```

### C-11 [major] `evidence/features/stats.json`

Reason: Mechanical path for C-12..C-17. Result: VC 38, IU 28, PARTIAL 28, SPEC_ONLY 46, EXPERIMENTAL 45, BLOCKED 7; tiers beta-core 42 / beta-supporting 37 / full-profile 25; beta-core 18 VC, 10 IU, 5 PARTIAL, 3 BLOCKED, 6 SPEC_ONLY; beta scope 79 rows 87.2 %/83.5 %; ex-future 79.7/74.8; all 73.8/69.1; effort 41–104 / 202–462 / 309–920; 106 issues. Coordinator v2 stats reproduce exactly with the unpatched script (verified).

Evidence: out/H/stats_h1.json, out/H/merged_features_h1.json, out/H/scoring_issues_h1.md, out/H/FEATURE_COMPLETION_MATRIX_h1.md

Current text:
```text
<re-generate>
```

Replacement:
```text
<re-generate: GP_OVERRIDES=out/H/overrides_h1.json python3 -I out/H/score_features_h1.py merged.json stats.json scoring_issues.md <B1 proto> <B1 web> <B2> <B3>; then render_matrix.py; ship overrides_h1.json as evidence/scripts/overrides.json and score_features_h1.py as evidence/scripts/score_features.py>
```

### C-12 [major] `evidence/scripts/score_features.py`

Reason: Rubric (brief FEATURE_RUBRIC.md): VERIFIED_COMPLETE needs no OPEN Medium+ defect. The script demotes on ANY entry: F-KEY-03 (only defect: Info, already fixed in 7a620ff1) and F-WEB-09 (only defect: Low) are IU for that reason alone. open_medium_plus() is defined in out/H/score_features_h1.py (Medium+/unknown severity block; fixed/resolved/closed do not). Effect: F-WEB-09 -> VC; F-KEY-03 stays IU but via an explicit SEC-05/SEC-03 hold (overrides_h1.json).

Evidence: merged_features.json F-KEY-03 confirmed_defects[0] starts 'Info: ... fixed test-only in 7a620ff1'; F-WEB-09 'Low: apps/web/scripts/test-reconciliation-idb.mjs:71 ...'; SellerKeys.tsx:207,221-224 @7a620ff1

Current text:
```text
exp = ("VERIFIED_COMPLETE" if ci == 100 and cv >= 90 and not f.get("confirmed_defects") else
```

Replacement:
```text
exp = ("VERIFIED_COMPLETE" if ci == 100 and cv >= 90 and not open_medium_plus(f.get("confirmed_defects")) else
```

### C-13 [major] `evidence/scripts/overrides.json`

Reason: Same root cause as the F-KEY-02 hold: the keystore export uses the same passphrase floor and has no step-up in vault-less sessions; record the real reason (needed once C-12 stops the fixed Info flake from demoting it). Full override set incl. C-14..C-17 is in out/H/overrides_h1.json.

Evidence: SellerKeys.tsx:207 passphraseProblemMessage(pass); :221-224 authorizeKeyExport(stepUp) @7a620ff1; passphrase probe re-run: 'Michael1985!!x' accepted

Current text:
```text
{"id": "F-WEB-07", "finding": "SEC-10", "reason": "local-proxy scan transport blocked by the app's own CSP while UI/docs offer it"},
```

Replacement:
```text
{"id": "F-WEB-07", "finding": "SEC-10", "reason": "local-proxy scan transport blocked by the app's own CSP while UI/docs offer it"},⏎
  {"id": "F-KEY-03", "finding": "SEC-05, SEC-03", "reason": "keystore export passphrase floor (SellerKeys.tsx:207) and vault-less export without step-up (SellerKeys.tsx:221-224)"},
```

### C-14 [major] `evidence/scripts/overrides.json`

Reason: F-WEB-07 keeps Implementation 100 % although its first requirement (local-proxy transport) does not work in any shipped build (SEC-10, TB-02): the hold changes the status but leaves an incorrect 100/100. Corrected score 90/90 (status IU by rubric, no hold needed).

Evidence: apps/web/index.html:13 and own lean build dist/index.html CSP 'connect-src 'self' https: wss:'; scanPrivacy.ts:72-98 accepts http loopback; Team E Chromium probe securitypolicyviolation

Current text:
```text
"requirement_corrections": [
```

Replacement:
```text
"requirement_corrections": [⏎
  {"id": "F-WEB-07", "req_prefix": "Transports direct / tor-browser / local-proxy", "implemented": "half", "verified": "half", "evidence": "H1: http-loopback local proxy accepted (scanPrivacy.ts:72-98) but blocked by shipped CSP connect-src 'self' https: wss: (apps/web/index.html:13 @7a620ff1; own lean build); SEC-10, TB-02"},
```

### C-15 [major] `evidence/scripts/overrides.json`

Reason: F-NET-01 ('direct/Tor SOCKS5h/local-proxy/OHTTP framing') was raised from the team's PARTIAL 70/65 to IU 100/80 because its 4-item list omits the local-proxy profile that SEC-10 shows is blocked. With the missing requirement: PARTIAL 80/65 (team's own status restored). Needs the requirement_additions handler in score_features_h1.py.

Evidence: B3 reported impl 70 / verif 65 PARTIAL (scoring_issues.md); SEC-10 evidence lines

Current text:
```text
"security_holds": [
```

Replacement:
```text
"requirement_additions": [⏎
  {"id": "F-NET-01", "req": "local-proxy profile usable from the shipped browser builds", "weight": 2, "implemented": "no", "verified": "no", "evidence": "H1: CSP connect-src blocks http loopback in every shipped profile (apps/web/index.html:13, public/_headers:5, deploy/nginx/security-headers.conf:3 @7a620ff1); SEC-10, TB-02"}⏎
 ],⏎
 "security_holds": [
```

### C-16 [major] `evidence/scripts/overrides.json`

Reason: Tier errors vs the rubric ('beta-core = needed for the Sepolia-first static browser beta'): BTC is full-profile only (F-BTC-01's own name says '(full-profile web)'; OD-20 lists BTC outside the lean EVM beta); F-MER-05's signed merchant profile/templates/embed are full-only. They inflate beta scope (82 -> 79 rows) and beta-core VC (F-MER-05). C-15, C-16 and C-17 each insert before the same `"security_holds": [` anchor; apply them in order (dry run verified).

Evidence: apps/web/src/App.tsx:3-12,20-27; AppLean.tsx:4-6; AppShell.tsx:39,72-78 @7a620ff1; own lean build ghostpay-lean-build.json: MerchantProfilePanel 0, merchantIdentity 0, merchantTemplate 0, features/btc 0, btc-silent-payments 0 modules

Current text:
```text
"security_holds": [
```

Replacement:
```text
"tier_corrections": [⏎
  {"id": "F-BTC-01", "tier": "full-profile", "evidence": "H1: BtcView only in App.tsx ORDER (full); AppLean renders CORE_ORDER (AppShell.tsx:39) without btc; 0 BTC modules among the 306 lean-bundle modules"},⏎
  {"id": "F-BTC-02", "tier": "full-profile", "evidence": "H1: header chain reachable only from the full-profile BTC view"},⏎
  {"id": "F-MER-05", "tier": "full-profile", "evidence": "H1: MerchantProfilePanel/MerchantTemplateIssuer/merchantIdentity/merchantTemplate mounted only via App.tsx mainPrelude; absent from AppLean and from the lean bundle"}⏎
 ],⏎
 "security_holds": [
```

### C-17 [major] `evidence/scripts/overrides.json`

Reason: F-NET-02 says the onion branch 72dde82d 'is ancestor of cand' — false (BRANCH_RECOVERY_MATRIX itself lists it as a non-ancestor patch-equivalent C row). F-BTC-02 is VERIFIED_COMPLETE but keeps strategy 'consolidate' with 1–3 days that the effort sum silently drops. F-WEB-07 (now IU) gets strategy repair and an H1 ESTIMATE of 0.5–2 days for TB-02.

Evidence: git merge-base --is-ancestor 72dde82d 7a620ff1 -> exit 1; git cherry 7a620ff1 72dde82d -> 2 '-'; 8277879e is ancestor

Current text:
```text
"security_holds": [
```

Replacement:
```text
"field_corrections": [⏎
  {"id": "F-NET-02", "fields": {"related_branches": [{"ref": "origin/chatgpt/zero-codex/onion-canonical-host-20261111", "sha": "72dde82d", "pr": "122", "note": "NOT an ancestor of 7a620ff1: 0 unique / 2 patch-equivalent commits (git cherry), class C"}, {"ref": "origin/chatgpt/ghostpay-onion-canonical-port-20261112", "sha": "8277879e", "pr": "134", "note": "port of #122; ancestor of 7a620ff1"}], "strategy_detail": "onion.ts v3 checksum + url.ts. #122 (72dde82d) is patch-equivalent to the candidate; its port #134 (8277879e) is an ancestor => landed. net-transport 149/149 pass."}},⏎
  {"id": "F-BTC-02", "fields": {"strategy": "none", "strategy_detail": "Complete by rubric (4/4 requirements implemented and tested). Real Esplora/mainnet sync stays external acceptance; PR #74 delta stays under unverified."}},⏎
  {"id": "F-WEB-07", "fields": {"strategy": "repair", "effort": {"size": "S", "engineer_days": [0.5, 2]}, "strategy_detail": "Fix TB-02: allow http loopback in connect-src for the full/self-host profile (or remove local-proxy from lean UI/docs) and add an e2e under the real CSP. Effort is an H1 ESTIMATE."}}⏎
 ],⏎
 "security_holds": [
```

### C-18 [major] `README.md`

Reason: Only after C-11..C-17 are applied (numbers from out/H/stats_h1.json). Without them the current text matches stats.json v2.

Evidence: out/H/stats_h1.json by_status

Current text:
```text
192 distinct features: 37 verified-complete, 30 implemented-but-unverified, 27 partial, 46 spec-only, 45
```

Replacement:
```text
192 distinct features: 38 verified-complete, 28 implemented-but-unverified, 28 partial, 46 spec-only, 45
```

### C-19 [major] `README.md`

Reason: After C-11..C-17 (F-MER-05 leaves beta-core; F-WEB-09 becomes VC).

Evidence: out/H/stats_h1.json by_tier_status.beta-core

Current text:
```text
experimental, 7 blocked (155 unfinished). Beta-core (43): 18 complete; the six spec-18 key-portability items
```

Replacement:
```text
experimental, 7 blocked (154 unfinished). Beta-core (42): 18 complete; the six spec-18 key-portability items
```

### C-20 [major] `README.md`

Reason: After C-11..C-17.

Evidence: out/H/merged_features_h1.json

Current text:
```text
(K01–K06) have no code; five otherwise-complete rows are held by open findings SEC-03/SEC-05/SEC-10.
```

Replacement:
```text
(K01–K06) have no code; five otherwise-complete rows are held by open findings SEC-03/SEC-05 (F-KEY-01/02/03, F-WEB-11/12) and the SEC-10 local-proxy gap is scored into F-WEB-07 (90/90) and F-NET-01 (PARTIAL).
```

### C-21 [major] `README.md`

Reason: After C-11..C-17.

Evidence: out/H/stats_h1.json aggregate_release_scope_beta (79 rows, weight 1079)

Current text:
```text
beta scope 87.9 % implemented / 84.0 % verified; all tiers excluding the future
```

Replacement:
```text
beta scope 87.2 % implemented / 83.5 % verified; all tiers excluding the future
```

### C-22 [major] `README.md`

Reason: After C-11..C-17.

Evidence: out/H/stats_h1.json aggregate_all_excluding_future / aggregate_all

Current text:
```text
roadmap 79.9 % / 75.0 %; including it 73.9 % / 69.3 %.
```

Replacement:
```text
roadmap 79.7 % / 74.8 %; including it 73.8 % / 69.1 %.
```

### C-23 [major] `README.md`

Reason: After C-11..C-17 (includes H1 ESTIMATE 0.5–2 d for F-WEB-07/TB-02).

Evidence: out/H/stats_h1.json effort_days_*

Current text:
```text
per-feature rows sum to ≈ 43–107 engineer-days for the beta scope, ≈ 202–461 excluding the future
```

Replacement:
```text
per-feature rows sum to ≈ 41–104 engineer-days for the beta scope, ≈ 202–462 excluding the future
```

### C-24 [major] `README.md`

Reason: After C-11..C-17.

Evidence: out/H/stats_h1.json effort_days_unfinished [309.0, 920.0]

Current text:
```text
roadmap and ≈ 309–919 for all rows.
```

Replacement:
```text
roadmap and ≈ 309–920 for all rows.
```

### C-25 [major] `EVIDENCE_INDEX.md`

Reason: After C-11..C-17.

Evidence: out/H/scoring_issues_h1.md (106 lines)

Current text:
```text
The 99 places where team headline numbers or statuses were replaced by rubric-computed values, plus the coordinator's one verified requirement correction (F-PROTO-03) and five security holds
```

Replacement:
```text
The 106 places where team headline numbers, statuses, tiers or requirement lists were replaced by rubric-computed or verified values: the coordinator's F-PROTO-03 requirement correction, six security holds (F-KEY-01/02/03, F-WEB-07 (superseded by its re-score), F-WEB-11/12) and the H1 corrections (F-WEB-07 and F-NET-01 requirements, F-BTC-01/02 and F-MER-05 tiers, F-NET-02/F-BTC-02 fields, severity-aware VC rule)
```

### C-26 [major] `evidence/features/matrix_header.md`

Reason: Header restates the rule more strictly than the brief rubric and than the patched script (C-12). Apply to out/G/matrix_header.md too.

Evidence: brief FEATURE_RUBRIC.md rule 4

Current text:
```text
VERIFIED_COMPLETE = implementation 100, verification ≥ 90 and no open defect;
```

Replacement:
```text
VERIFIED_COMPLETE = implementation 100, verification ≥ 90 and no open Medium-or-higher defect (Low/Info and fixed items do not block, as in the rubric);
```

### C-27 [major] `README.md`

Reason: GitHub's refs/pull/N/head tracks an open PR's branch; the three entries exist only because PR refs were fetched one rotation before the branch tips. They duplicate branch rows (and pr/140 is counted as a second class-B item).

Evidence: live: refs/pull/{139,140,153}/head == branch tips (364b01f8, c5efadab, 83fe9b02); shared repo refs/remotes/pr/{139,140,153} now == 7af4b5ff/400e20f1/30f1604d (14 PR-only refs, not 17)

Current text:
```text
| 234 refs (217 heads + 17 PR-only) classified A–F with recovery method |
```

Replacement:
```text
| 234 entries (217 heads + 17 PR-only refs; 3 PR-only entries — `pr/139`, `pr/140`, `pr/153` — are older fetches of open PRs' own branches, so 231 distinct refs) classified A–F with recovery method |
```

### C-28 [major] `README.md`

Reason: Six class-B entries = 5 distinct refs + pr/140 (stale copy of #140's branch). #206 (claude/ghostpay-consolidation-9xhtxg @ c487f0fe) merges 71abc7e5 + 2693b08e with conflicts resolved and PACKAGE_MAP regenerated (22 lines).

Evidence: branch_recovery_matrix.json class B entries; git log/diff c487f0fe (live.git)

Current text:
```text
only one class-A item (#204 tooling) and six class-B
```

Replacement:
```text
only one class-A item (#204 tooling; re-integrated after the snapshot as open PR #206) and five distinct class-B
```

### C-29 [major] `BRANCH_RECOVERY_MATRIX.md`

Reason: Totals double-count three docs branches.

Evidence: see C-27

Current text:
```text
| **Total** | **217** | **17** | **234** |
```

Replacement:
```text
| **Total** | **217** | **17** | **234** |⏎
⏎
H1 note: 3 of the 17 PR-only entries (`pr/139` D, `pr/140` B, `pr/153` D) are not distinct refs — GitHub's `refs/pull/N/head` tracks each open PR's branch and these copies were fetched one rotation before the branch tips (verified 07:10Z: live `refs/pull/{139,140,153}/head` equal the branch tips). Distinct population at the snapshot: 231 (217 heads + 14 PR-only); distinct class B = 5, class D = 12.
```

### C-30 [major] `BRANCH_RECOVERY_MATRIX.md`

Reason: Branch rows lost their PR association because PR mapping was by head SHA.

Evidence: evidence/prs/open_prs.json: #140 head 'chatgpt/zero-codex/docs-pages-scope-20261112'

Current text:
```text
### `chatgpt/zero-codex/docs-pages-scope-20261112` @ `400e20f1` (2026-11-17) class B⏎
- **PRs:** none
```

Replacement:
```text
### `chatgpt/zero-codex/docs-pages-scope-20261112` @ `400e20f1` (2026-11-17) class B⏎
- **PRs:** #140 open (head branch; the `pr/140` entry below is the same PR fetched one rotation earlier)
```

### C-31 [major] `BRANCH_RECOVERY_MATRIX.md`

Reason: Same as C-30.

Evidence: open_prs.json: #139 head 'chatgpt/zero-codex/audit-pages-release-20261112'

Current text:
```text
| `chatgpt/zero-codex/audit-pages-release-20261112` | 7af4b5ff | - |
```

Replacement:
```text
| `chatgpt/zero-codex/audit-pages-release-20261112` | 7af4b5ff | #139 |
```

### C-32 [major] `BRANCH_RECOVERY_MATRIX.md`

Reason: Same as C-30.

Evidence: open_prs.json: #153 head 'chatgpt/zero-codex/pages-owner-ci-handoff-20261114'

Current text:
```text
| `chatgpt/zero-codex/pages-owner-ci-handoff-20261114` | 30f1604d | - |
```

Replacement:
```text
| `chatgpt/zero-codex/pages-owner-ci-handoff-20261114` | 30f1604d | #153 |
```

### C-33a [major] `branch_recovery_matrix.json`

Reason: JSON twin of C-30..C-32.

Evidence: open_prs.json #140 head ref

Current text:
```text
"ref": "chatgpt/zero-codex/docs-pages-scope-20261112",⏎
   "sha": "400e20f19d857a2fb99b90247fcba65e4f90a40a",⏎
   "date": "2026-11-17T21:38:39-08:00",⏎
   "kind": "branch",⏎
   "prs": [],
```

Replacement:
```text
"ref": "chatgpt/zero-codex/docs-pages-scope-20261112",⏎
   "sha": "400e20f19d857a2fb99b90247fcba65e4f90a40a",⏎
   "date": "2026-11-17T21:38:39-08:00",⏎
   "kind": "branch",⏎
   "prs": [⏎
    {⏎
     "n": 140,⏎
     "state": "open",⏎
     "title": "docs(pages): static Pages CI gates, User/Developer Wiki and maintenance ledger"⏎
    }⏎
   ],
```

### C-33b [major] `branch_recovery_matrix.json`

Reason: JSON twin of C-30..C-32.

Evidence: open_prs.json #139 head ref

Current text:
```text
"ref": "chatgpt/zero-codex/audit-pages-release-20261112",⏎
   "sha": "7af4b5ff5735f1d9f7c4609fe70b3300764f9778",⏎
   "date": "2026-11-17T21:38:14-08:00",⏎
   "kind": "branch",⏎
   "prs": [],
```

Replacement:
```text
"ref": "chatgpt/zero-codex/audit-pages-release-20261112",⏎
   "sha": "7af4b5ff5735f1d9f7c4609fe70b3300764f9778",⏎
   "date": "2026-11-17T21:38:14-08:00",⏎
   "kind": "branch",⏎
   "prs": [⏎
    {⏎
     "n": 139,⏎
     "state": "open",⏎
     "title": "docs(audit): randomized read-only Pages audit ledger (rotation 179)"⏎
    }⏎
   ],
```

### C-33c [major] `branch_recovery_matrix.json`

Reason: JSON twin of C-30..C-32.

Evidence: open_prs.json #153 head ref

Current text:
```text
"ref": "chatgpt/zero-codex/pages-owner-ci-handoff-20261114",⏎
   "sha": "30f1604da78709dfafcc83c9db5d3e67b72d0d46",⏎
   "date": "2026-11-17T21:39:06-08:00",⏎
   "kind": "branch",⏎
   "prs": [],
```

Replacement:
```text
"ref": "chatgpt/zero-codex/pages-owner-ci-handoff-20261114",⏎
   "sha": "30f1604da78709dfafcc83c9db5d3e67b72d0d46",⏎
   "date": "2026-11-17T21:39:06-08:00",⏎
   "kind": "branch",⏎
   "prs": [⏎
    {⏎
     "n": 153,⏎
     "state": "open",⏎
     "title": "docs(handoff): rotation 173 Pages #198 exact-head GREEN qualification"⏎
    }⏎
   ],
```

### C-34 [major] `BRANCH_RECOVERY_MATRIX.md`

Reason: As written, §0 says the packaged file of that name is the shallow one, and cites an unresolvable scratch path.

Evidence: EVIDENCE_INDEX §2/§6.1; packaged census: 217 heads, 168 strict ancestors + candidate branch (at 71abc7e5)

Current text:
```text
`$SP/evidence/branch_census_current.json` was computed in a **shallow** checkout
```

Replacement:
```text
The first shared census (since replaced: the packaged `evidence/census/branch_census_current.json` is the coordinator's full-history re-run) was computed in a **shallow** checkout
```

### C-35 [major] `BRANCH_RECOVERY_MATRIX.md`

Reason: Now false: the branch exists remotely (15ad0219, then b3c1c86b).

Evidence: git ls-remote --heads origin 07:10Z; search API #205

Current text:
```text
`nodata/zealous-hopper-lr0nxe` is a local-only name (== main `cfaebeea`; stale `origin/` tracking ref, absent on remote) and is excluded.
```

Replacement:
```text
`nodata/zealous-hopper-lr0nxe` was a local-only name (== main `cfaebeea`) at census time and is excluded; it was pushed at 06:56:55Z as this package's branch (PR #205) and is not a recovery candidate.
```

### C-36 [major] `BRANCH_RECOVERY_MATRIX.md`

Reason: Same as C-35.

Evidence: same

Current text:
```text
- Local `zealous-hopper-lr0nxe` equals main and is not a remote head.
```

Replacement:
```text
- `nodata/zealous-hopper-lr0nxe` is this package's branch (PR #205, pushed after the census); not a recovery candidate.
```

### C-37 [major] `branch_recovery_matrix.json`

Reason: JSON twin of C-35.

Evidence: same

Current text:
```text
"nodata/zealous-hopper-lr0nxe (== main cfaebeea, tracking ref only; absent from git ls-remote)"
```

Replacement:
```text
"nodata/zealous-hopper-lr0nxe (== main cfaebeea and local-only at census time; pushed 06:56:55Z as this package's branch, PR #205; not a recovery candidate)"
```

### C-38 [major] `EVIDENCE_INDEX.md`

Reason: File content does not match the stated 217 heads or the 169/48 split without this explanation.

Evidence: python3 count over evidence/census/branch_census_current.json: origin refs 218; excl. zealous 217; ancestors 168; wizardly-allen 71abc7e5 not ancestor

Current text:
```text
Per ref (217 heads + 202 PR refs)
```

Replacement:
```text
Per ref (218 origin refs = 217 remote heads + the then local-only `nodata/zealous-hopper-lr0nxe`, plus 202 PR refs; 168 heads are strict ancestors of `7a620ff1` and the candidate branch itself — already at docs-only `71abc7e5` — makes 169 contained; 14 all-patch-equivalent; 32 with differing files. Team C's `census_full.json`, taken while the branch was at `7a620ff1`: 169/48/14/31)
```

### C-39 [major] `BLOCKERS_AND_DECISIONS.md`

Reason: Read literally, the default would block the only encrypted backup path for keys that exist nowhere else (constraint 4 key portability, fund-loss risk).

Evidence: SellerKeys.tsx:216-224 keystore export path; AppShell.tsx:128-160 keeps un-backed-up keys loaded @7a620ff1

Current text:
```text
| Secret export refuses in vault-less sessions; sweep behaviour unchanged but warned |
```

Replacement:
```text
| New spec-18 secret exports (K03–K06 encrypted and raw) refuse in vault-less sessions; the existing encrypted keystore v1 backup and creating a vault stay available (constraint 4: a vault-less seller must always be able to make an encrypted backup); sweep behaviour unchanged but warned |
```

### C-40 [major] `security_findings.json`

Reason: Same ambiguity in SEC-03 remediation; apply the same text to SECURITY_AND_PRIVACY_GAP_ANALYSIS.md (C-41).

Evidence: constraint 4

Current text:
```text
require an encrypted vault or verified backup + its passphrase before any sweep/export on mainnet;
```

Replacement:
```text
require an encrypted vault or verified backup + its passphrase before any sweep or spec-18 secret export on mainnet (never block creating the encrypted keystore v1 backup or a vault: constraint 4);
```

### C-41 [major] `SECURITY_AND_PRIVACY_GAP_ANALYSIS.md`

Reason: MD twin of C-40.

Evidence: constraint 4

Current text:
```text
require an encrypted vault or verified backup + its passphrase before any sweep/export on mainnet;
```

Replacement:
```text
require an encrypted vault or verified backup + its passphrase before any sweep or spec-18 secret export on mainnet (never block the keystore v1 backup);
```

### C-42 [major] `POST_CONSOLIDATION_AUDIT.md`

Reason: Header claims the final Mythril result was applied; §7 still says 'in progress' (§5f already says failure).

Evidence: POST_CONSOLIDATION_AUDIT §5f line 129; PROMOTION_PACKET @71abc7e5 lines 34,44

Current text:
```text
- Mythril result on `7a620ff1`: run in progress.
```

Replacement:
```text
- Mythril per-record output on `7a620ff1`: job 134593129954 concluded failure; the records are not readable here (artifact 403); per PROMOTION_PACKET @`71abc7e5` it reports exactly the 11 dispositioned records.
```

### C-43 [major] `POST_CONSOLIDATION_AUDIT.md`

Reason: Same as C-42.

Evidence: same

Current text:
```text
On 7a620ff1 Mythril job 134593129954 was in_progress at query time.
```

Replacement:
```text
On 7a620ff1 Mythril job 134593129954 concluded failure (exactly the 11 dispositioned records per PROMOTION_PACKET @71abc7e5).
```

### C-44 [major] `SECURITY_AND_PRIVACY_GAP_ANALYSIS.md`

Reason: §13 contradicts §5 and the brief update (qualified head is 7a620ff1; 10 records was d91ae16a).

Evidence: PROMOTION_PACKET @71abc7e5 line 17 ('d91ae16a ... Mythril 10 records') and line 34

Current text:
```text
Mythril on the qualified head ("10 identical records, R8 absent") rests on the promotion packet.
```

Replacement:
```text
Mythril on the previous qualified head `d91ae16a` ("10 identical records, R8 absent") and on `7a620ff1` (failure with exactly the 11 dispositioned records, run 44242366379) rests on the promotion packet.
```

### C-45 [major] `BLOCKERS_AND_DECISIONS.md`

Reason: Recommendation overtaken by events; next session must not duplicate #206.

Evidence: live.git: git log c487f0fe -3; git diff --stat 2693b08e c487f0fe -- .claude/skills/ghostpay-package-map/PACKAGE_MAP.md (22+/22-)

Current text:
```text
| Merge #203 first; then re-apply #204 with a regenerated `PACKAGE_MAP.md` |
```

Replacement:
```text
| Merge #203 first (done 06:56:49Z, after the snapshot); #204 has since been re-integrated as open PR #206 (`claude/ghostpay-consolidation-9xhtxg` @ `c487f0fe` = merge of `71abc7e5` + `2693b08e`, conflicts resolved, `PACKAGE_MAP.md` regenerated: 22 lines) — review and merge #206 instead of re-porting |
```

### C-46 [major] `security_findings.json`

Reason: SEC-49 overtaken by events (still open until #206 merges); apply the same sentence to the SEC-49 row in SECURITY_AND_PRIVACY_GAP_ANALYSIS.md (C-47).

Evidence: see C-45

Current text:
```text
"remediation": "Define merge order; re-run CI after the second merge.",
```

Replacement:
```text
"remediation": "Define merge order; re-run CI after the second merge. After the snapshot: #203 merged 06:56:49Z; #204 re-integrated with conflicts resolved as open PR #206 (c487f0fe) - review/merge #206.",
```

### C-47 [major] `SECURITY_AND_PRIVACY_GAP_ANALYSIS.md`

Reason: MD twin of C-46.

Evidence: see C-45

Current text:
```text
| F-CTR-07 | Define merge order; re-run CI after the second merge. |
```

Replacement:
```text
| F-CTR-07 | Define merge order; re-run CI after the second merge. After the snapshot #203 merged and #204 was re-integrated as open PR #206. |
```

### C-48 [major] `BLOCKERS_AND_DECISIONS.md`

Reason: EVIDENCE_INDEX §6.3 itself says the packet was corrected at 71abc7e5; TB-10 still lists it as open work.

Evidence: git show 71abc7e5:docs/handoffs/consolidation-20261118/PROMOTION_PACKET.md line 16 ('verify with git diff --name-only 7a620ff1 <PR head>')

Current text:
```text
| TB-10 | Documentation drift: promotion packet "docs-only" claim (R-18 test change), PRIVACY_THREAT_MODEL stale import claim,
```

Replacement:
```text
| TB-10 | Documentation drift (the promotion packet "docs-only" claim was already corrected at `71abc7e5`, now on `main`): PRIVACY_THREAT_MODEL stale import claim,
```

### C-49 [minor] `BLOCKERS_AND_DECISIONS.md`

Reason: Wrong path (no such file at repo root).

Evidence: apps/web/scripts/test-reconciliation-idb.mjs:71 @7a620ff1 calls window.testVault.invalidateFrom(100n)

Current text:
```text
| TB-06 | `scripts/test-reconciliation-idb.mjs:71`
```

Replacement:
```text
| TB-06 | `apps/web/scripts/test-reconciliation-idb.mjs:71`
```

### C-50 [minor] `BLOCKERS_AND_DECISIONS.md`

Reason: Consistency with OD-19 'preserve every non-ancestor head as a tag/bundle first' and constraint 5.

Evidence: OD-19 row

Current text:
```text
retire/unpublish the stale `gh-pages` prototype (`cc8d0794`, 2026-10-21)
```

Replacement:
```text
retire/unpublish the stale `gh-pages` prototype (`cc8d0794`, 2026-10-21) after archiving it as a tag/bundle (OD-19, constraint 5)
```

### C-51 [minor] `BLOCKERS_AND_DECISIONS.md`

Reason: 'Only the selected loopback origin' is not implementable in a build-time meta CSP; SEC-10's remediation already gives the feasible form.

Evidence: apps/web/index.html:11-14

Current text:
```text
Make it work under a CSP that allows only the selected loopback origin in the full/self-host profile
```

Replacement:
```text
Make it work under a CSP that allows http loopback origins (`http://127.0.0.1:*`, `http://localhost:*`, `http://[::1]:*`; a static meta CSP cannot be narrowed at runtime to the port the user picks) in the full/self-host profile
```

### C-52 [minor] `BRANCH_RECOVERY_MATRIX.md`

Reason: pr/140 row copies the branch row's counts.

Evidence: evidence/teams/C/patchcheck.json: 58a47006 -> 108 commits {applies_clean 8, conflicts 100}

Current text:
```text
101 of 109 unique commits conflict (append-only rotation file); 8 apply clean; 108 unique
```

Replacement:
```text
100 of 108 unique commits conflict (append-only rotation file); 8 apply clean; 108 unique
```

### C-53 [minor] `branch_recovery_matrix.json`

Reason: JSON twin of C-52 (pr/139 '41 of 42' and pr/153 '40 of 41' have the same copy error: correct values 40 of 41 and 39 of 40).

Evidence: patchcheck.json a0d81ef9 41 {clean 1, conflicts 40}; ccdc7954 40 {clean 1, conflicts 39}

Current text:
```text
101 of 109 unique commits conflict (append-only rotation file); 8 apply clean; 108 unique
```

Replacement:
```text
100 of 108 unique commits conflict (append-only rotation file); 8 apply clean; 108 unique
```

### C-54 [minor] `BRANCH_RECOVERY_MATRIX.md`

Reason: §2 and the JSON give 14 superseded C heads (28 non-ancestor C heads = 14 + 14).

Evidence: branch_recovery_matrix.json: class C non-ancestor heads 28; unique_commits==0: 14

Current text:
```text
| `semantically superseded` x12 / patch-equivalent x14 |
```

Replacement:
```text
| `semantically superseded` x14 / patch-equivalent x14 |
```

### C-55 [minor] `SECURITY_AND_PRIVACY_GAP_ANALYSIS.md`

Reason: Machine-local path in a published document.

Evidence: -

Current text:
```text
(== head `71abc7e5` minus docs), worktree `/home/user/wt/cand`.
```

Replacement:
```text
(== head `71abc7e5` minus docs).
```

### C-56 [minor] `SECURITY_AND_PRIVACY_GAP_ANALYSIS.md`

Reason: Scratchpad path does not resolve in the package.

Evidence: -

Current text:
```text
Mapped each row to feature IDs from `$SP/out/G/merged_features.json`
```

Replacement:
```text
Mapped each row to feature IDs from `feature_completion_matrix.json`
```

### C-57 [minor] `SECURITY_AND_PRIVACY_GAP_ANALYSIS.md`

Reason: Scratchpad paths do not resolve in the package.

Evidence: -

Current text:
```text
Inputs: `$SP/out/D/{SECURITY_CRYPTO.md,findings.json}`, `$SP/out/E/{SECURITY_PRIVACY_BROWSER.md,findings.json}`.
```

Replacement:
```text
Inputs: `evidence/teams/D/{SECURITY_CRYPTO.md,findings.json}`, `evidence/teams/E/{SECURITY_PRIVACY_BROWSER.md,findings.json}`.
```

### C-58 [minor] `POST_CONSOLIDATION_AUDIT.md`

Reason: Scratchpad path.

Evidence: -

Current text:
```text
+ my `$SP/evidence/branch_census_current.json`.
```

Replacement:
```text
+ the full-history census `evidence/census/branch_census_current.json`.
```

### C-59 [minor] `POST_CONSOLIDATION_AUDIT.md`

Reason: Scratchpad path.

Evidence: -

Current text:
```text
`$SP/evidence/open_prs.json` (first 100 open only)
```

Replacement:
```text
`evidence/prs/open_prs.json` (first 100 open only)
```

### C-60 [minor] `SECURITY_AND_PRIVACY_GAP_ANALYSIS.md`

Reason: Precision: connect-src allows https:, so an https loopback endpoint is not blocked.

Evidence: apps/web/index.html:13 connect-src 'self' https: wss:

Current text:
```text
| **SEC-10** 'Local proxy' scan transport is unusable: Settings accepts http loopback endpoints but CSP connect-src blocks them in every shipped profile (fails closed) |
```

Replacement:
```text
| **SEC-10** 'Local proxy' scan transport over http loopback is unusable: Settings accepts http loopback endpoints but CSP connect-src blocks them in every shipped profile (fails closed; only an https loopback proxy would pass) |
```

### C-61 [minor] `security_findings.json`

Reason: JSON twin of C-60.

Evidence: same

Current text:
```text
'Local proxy' scan transport is unusable: Settings accepts http loopback endpoints but CSP connect-src blocks them in every shipped profile (fails closed)
```

Replacement:
```text
'Local proxy' scan transport over http loopback is unusable: Settings accepts http loopback endpoints but CSP connect-src blocks them in every shipped profile (fails closed; only an https loopback proxy would pass)
```

(⏎ marks a newline inside the string; use corrections_h1.json for mechanical application.)
