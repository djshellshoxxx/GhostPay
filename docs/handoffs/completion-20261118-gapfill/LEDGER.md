# Task ledger — completion run 2026-11-18 (gap-fill coordinator, PR #211)

Start `main` = `5467c158`. Integration head at this update: `74be0ea7`. Percentages are computed from the rows below.

- Rows: 22; done: 10 (45%); in progress: 4; blocked: 3; not started: 5.
- Rows needing a human: 4 (see HANDOFF.md owner checklist).

| ID | Requirement | Status | Branch | Owner | Evidence | Human needed |
|---|---|---|---|---|---|---|
| CLAIM | Claim lanes and owned paths before any write; draft PR visible to other sessions | done | nodata/wonderful-darwin-kd1h22 | coordinator | 81fa824c (claim), PR #211 draft; #209 coordinator acknowledged no overlap 07:39 UTC | no |
| SEC-11 | Scheme-2 payers and sellers cannot create or pay into an asset the policy can never withdraw without being told/refused | done | claude/completion-20261118-gapfill/g1 | G1 | 46ab81d2, 00f9134b, 1f5c2d73; @62d2ff29 policy-scheme 93 passed/7 skipped, web policy+i18n 326 passed/4 skipped, tsc 0, eslint 0 | no |
| SEC-12 | Scheme-2 delay floor never below the factory MIN_DELAY; per-chain L2 floors decided and sourced | blocked | claude/completion-20261118-gapfill/g1 | G1 / owner | Default kept + UI/doc note b542c839; OP/Arbitrum docs unreachable here (DNS) | yes: OD-11 numbers |
| SEC-13 | No clipboard path for BTC/SOL/TRON seeds or keys (OD-02 default); re-auth before reveal | done | claude/completion-20261118-gapfill/g2 | G2 / owner | ea62d473, 95f632b9, 8dd4f482, docs fix; @44714f41 39 files/395 tests, i18n 0 errors, tsc 0, eslint 0 | yes: OD-01 re-auth model |
| SEC-22a | Scan-cursor slot names not computable from public keys; legacy slots fail closed | done | claude/completion-20261118-gapfill/g3 | G3 | 5ba26cec; @b290426e web scan 232 passed, tsc 0 | no |
| SEC-22b | Review hardening: sweep all legacy slots; no viewing-key copy per render; wipe-on-throw tested | in progress | claude/completion-20261118-gapfill/g3b | G3b |  | no |
| SEC-22c | Other plaintext linkable identifiers (vault meta, reconciliation sellerKeyId, tag timestamps, attempt journals) | not started | - | unclaimed (recorded by #211 and #209) | file:line list in SECURITY_CLOSURE.md SEC-22 | no |
| SEC-28a | policy-scheme API doc makes no unlinkability overclaim and matches the shipped router ABI | done | claude/completion-20261118-gapfill/g1 | G1 / coordinator | 0f0063ed, a08f47bb, 1f5c2d73 (selector 0x0730d511 computed from ghostPayPolicyRouterAbi) | no |
| SEC-29 | Contextual help never shifts layout under a click | blocked | claude/completion-20261118-gapfill/g4 (rejected change) | owner | Overlay fix 7e7e50df rejected by review (broke contextual-help.spec.ts:108, intercepted clicks); not integrated | yes: UX-01 |
| SEC-30 | Paste-submit focus behaviour pinned by a browser test | done | claude/completion-20261118-gapfill/g4 | G4 | 407868a1 (from 58d4eba1); focus-scope + contextual-help 7/7 full and 7/7 lean | no |
| TB-08 | CLI-side Solana/TRON meta-address, memo and derivation equal the web packages, with shared vectors | done | claude/completion-20261118-gapfill/g5 | G5 | e2427c20, 179a5b43, 28ce8a0b, c3d7d702; @b290426e chain suites 348 passed, CLI 571/571, tsc 0; crypto review verified equivalence | no |
| N-01 | policyCoversToken proves the token leaf instead of trusting the record's leaf list | done | claude/completion-20261118-gapfill/g1 | coordinator | 1f5c2d73 (RED 'expected true to be false') | no |
| N-02 | TRON build() never returns a payable request without the memo bound | in progress | claude/completion-20261118-gapfill/g5b | G5b |  | no |
| N-03 | CLI reports the Solana cluster and refuses mainnet | in progress | claude/completion-20261118-gapfill/g5b | G5b |  | no |
| N-04 | CLI surfaces legacy-format errors | in progress | claude/completion-20261118-gapfill/g5b | G5b |  | no |
| N-07 | User docs do not describe the removed copy feature | done | claude/completion-20261118-gapfill/g2 | coordinator | merged 44714f41 | no |
| N-08 | AppShell.tsx:147 comment no longer describes clipboard clearing | not started | - | #209 B1 (routed); else post-#209 here |  | no |
| F3-doc | Audit 24 F3 documentation part | done | nodata/wonderful-darwin-kd1h22 | coordinator | a08f47bb | no |
| SCAN-INV | CodeQL, Dependabot, secret-scanning, SonarCloud, Snyk inventories read and closed | blocked | - | owner | No code-scanning API in session; SonarCloud CONNECT 403; no Snyk config | yes: OA-07, allow sonarcloud.io |
| POST-209 | After #209 lands: merge main; update PRIVACY_THREAT_MODEL.md:106, THREAT_MODEL.md:30, en.json:273, privacy-limits.md:40 for SEC-22; AppShell comment if still stale; test-vectors README entry after #213 | not started | nodata/wonderful-darwin-kd1h22 | coordinator | Sequenced: #209 first (agreed with #209 coordinator) | no |
| FINAL | Full checks at the integration head: npm ci, build:libs, typecheck, lint, i18n, all workspace tests, Playwright lean+full, forge, secret/actions scans | not started | nodata/wonderful-darwin-kd1h22 | coordinator / H |  | no |
| HANDOFF | HANDOFF.md, close claim, PR description | not started | nodata/wonderful-darwin-kd1h22 | coordinator |  | no |

Security-closure states per row are in [SECURITY_CLOSURE.md](SECURITY_CLOSURE.md). AI-assisted engineering, not a professional audit.
