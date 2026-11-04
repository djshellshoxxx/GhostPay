# Consolidation ledger — 2026-11-04

Shared state for the 2026-11-04 consolidation run. Snapshot taken after `git fetch --all --prune`.

- BASE (origin/main): `0014bc5b26c7487ea1f9fb230194c36673193236`
- Accepted start (origin/integration/ghostpay-accepted-20261102, PR #47 head): `f8193502e602c99bb24ff956f142671750b744a0`
- Integration branch: `claude/consolidation-2026-11-04`
- "in-accepted?" = `git merge-base --is-ancestor <branch> origin/integration/ghostpay-accepted-20261102`.
- ahead/behind is relative to origin/main (+ahead/-behind).

| branch | tip | PR | ahead/behind main | in-consolidation? | lane | disposition | evidence |
|---|---|---|---|---|---|---|---|
| automation/api-funded-ghostpay-cloud-20261103 | 29ce481d2d | #48 (merged) | +0/-6 | yes | C6 | IN | `merge-base --is-ancestor` into origin/main (merge 6f36e7c); origin/main is an ancestor of 641fd49 (lane C6) |
| automation/ghostpay-parallel-four-agents-20261103 | 68dc5b502f | #52 (open, draft) | +6/-4 | no | C6 | OWNER | do not merge as-is; see C6-52 (lane C6) |
| automation/ghostpay-parallel-review-wave-20261103 | 03a3f5701c | #53 (merged) | +0/-1 | yes | C6 | IN | ancestor of origin/main (merge 0014bc5) (lane C6) |
| automation/ghostpay-recurrent-backlog-20261103 | 5835736c12 | #51 (open, not draft) | +3/-4 | no | C6 | OWNER | SALVAGE the security hunks (fork/author filter, `--match-head-commit`); REJECT the gate-name change; the owner decides on the schedule and prompt changes. See C6-51 (lane C6) |
| backup/codex-observed-pr37-915d710-20261028 | 915d71053e | - | +167/-9 | yes | C0 | IN | ANC of 641fd49 |
| backup/pr30-before-consolidation-20261025 | 356fe5e44d | - | +28/-13 | yes | C0 | IN | ANC of 641fd49 |
| backup/pr31-before-consolidation-20261025 | a2217ea1cc | - | +2/-9 | yes | C0 | IN | ANC of 641fd49 (tip shared with claude/adoring-wozniak-850ue6) |
| checkpoint/ghostpay-recovery-20261102 | 1dffa5a366 | - | +0/-8 | yes | C0 | IN | ANC of 641fd49 |
| checkpoint/ghostpay-source-reconciliation-20261101 | 243d98d | not queried | 9/324 | no (103/2) | C3 | SUPERSEDED | unique 2 = de3b213 (adds docs/handoffs/SOURCE_RECONCILIATION_2026-11-01.md, +124) and 243d98d (+11). TARGET SOURCE_RECONCILIATION_2026-11-02.md table cites 243d98d67c7cbcc854b2107da5461e4718cb6272 as "Earlier reconciliation document (not application qualification)"; 11-01 path absent on TARGET (lane C3) |
| claude/adoring-wozniak-850ue6 | a2217ea1cc | #31 | +2/-9 | yes | C0 | IN | ANC of 641fd49 (same tip as backup/pr31) |
| claude/ar-a0-pr47-green | 4a38efdfa9 | #59 | +331/-7 | yes | lead | IN | ANC of 641fd49; lead merge (LEDGER integration log step 2) |
| claude/ar-a4-btc-headersync | 595d78021a | #74 | +335/-7 | yes | C1 | IN | ANC of 641fd49 |
| claude/ar-a5-announcer-budget | d9fe8b4e9c | #70 | +334/-7 | yes | C1 | IN | ANC of 641fd49 |
| claude/ar-a6-combined-backup | f9a755f675 | #61 | +335/-7 | yes | C1 | IN | ANC of 641fd49 |
| claude/ar-a7-policy-send-guard | c5c7e813c4 (LEDGER tip 6e13bb981f) | #65 | +336/-7 | partial: 6e13bb9 in, c5c7e81 not | C1 | IN | later tip f7b8ee9 (c5c7e81, f7b8ee9) merged by lead after C0 snapshot; W2 F1 fix |
| claude/ar-b1-core-journey | e0a499bdd9 | #62 | +336/-7 | yes | C1 | IN | ANC of 641fd49 |
| claude/ar-b2-lean-bound-receipts | 2bcfd11f9d | #64 | +335/-7 | yes | C1 | IN | ANC of 641fd49 |
| claude/ar-b3-sweep-permit-states | 1b9edb1d10 | #69 | +360/-7 | yes | C1 | IN | ANC of 641fd49 |
| claude/ar-b5-testnet-feeds | 76199cdac3 | #72 | +332/-7 | yes | C1 | IN | ANC of 641fd49 |
| claude/ar-c1-reconciliation-adr | 1e87109119 | #71 | +335/-7 | yes | C1 | IN | ANC of 641fd49 |
| claude/ar-c2-qr-pairing | 78be1730ad | #60 | +337/-7 | yes | C1 | IN | ANC of 641fd49 |
| claude/ar-c4-i18n-create-b4-buffer-ui | 4fe95fc0f6 | #68 | +352/-7 | yes | C1 | IN | ANC of 641fd49 |
| claude/ar-c4-i18n-pay | e02d04c754 | #66 | +334/-7 | yes | C1 | IN | ANC of 641fd49 |
| claude/ar-c4-i18n-scan | 7f4702fdd3 | #67 | +340/-7 | yes | C1 | IN | ANC of 641fd49 |
| claude/ar-c5-device-matrix | 0bf0f66344 | #73 | +333/-7 | yes | C1 | IN | ANC of 641fd49 |
| claude/ar-c7-embed-iframe-e2e | 2b9db8ab19 (LEDGER tip f54f9ee372) | #63 | +335/-7 | partial: f54f9ee in, 2b9db8a not | C1 | IN | later tip 2b9db8a merged by lead after C0 snapshot; W2 F2 |
| claude/cool-albattani-xopr89 | 7373172db4 | #30 | +89/-9 | yes | C0 | IN | ANC of 641fd49 |
| claude/docs-snapshot-1 | dc2340c998 | - | +0/-249 | yes | C0 | IN | ANC of 641fd49 |
| claude/docs-snapshot-2 | e1a92c876c | - | +0/-248 | yes | C0 | IN | ANC of 641fd49 |
| claude/friendly-turing-1ui0on | 3560f521e6 | - | +4/-0 | yes (C4 511c23b) | C4 | IN (via cw-c4) | run log brought in by C4 511c23b, merged |
| claude/ghostpay-autonomous-completion-y4sk2h | b6a0871d06 | - | +315/-9 | yes | C0 | IN | ANC of 641fd49 |
| claude/ghostpay-autonomous-prompt-scpgun | 1db8e967af | #58 | +1/-0 | yes (C4 511c23b) | C4 | IN (via cw-c4) | doc brought in by C4 511c23b, merged |
| claude/gifted-planck-115x2k | 1d28f24d86 | #39 | +313/-9 | partly | C2 | SUPERSEDED + SALVAGE(tests, via cw-c2) | AR2 EQUIV; D3 363bb43 and B2R 8daa03c superseded by stricter de3ea97 / 9cd80cf; tests and API doc salvaged in cw-c2; mutation proofs in lanes/C2.md |
| claude/haiku-wave-2-handoff-qepfoe | 8d1bde36bb | #43 | +325/-9 | no | C2 | IN (via cw-c2) | 95373ba, d03124e, 8d1bde3 cherry-picked -x in cw-c2, merged |
| claude/happy-maxwell-onl4x5 | fd710eb367 | #44 | +323/-9 | no (rewritten) | C2 | SUPERSEDED | fd710eb replaced by 5a3b6aa + cea3dcd (lstat regular file, mode, fchmod on fd); lanes/C2.md |
| claude/inspiring-fermat-vxv689 | c1c4ac9b64 | - | +0/-279 | yes | C0 | IN | ANC of 641fd49 |
| claude/laughing-bardeen-4t20ys | e96cee1 | not queried | 224/105 | no (640/105) | C3 | SUPERSEDED | C3 + W11: 146 differing paths, every branch-only line is older/weaker than consolidation (lanes/W11.md) |
| claude/pages-site-1 | 7f77a44483 | - | +0/-235 | yes | C0 | IN | ANC of 641fd49 |
| claude/portable-hosting-kit | cb917c67bf | #36 | +41/-9 | yes | C0 | IN | ANC of 641fd49 |
| claude/remote-extensions-1 | 39cce4663d | - | +0/-222 | yes | C0 | IN | ANC of 641fd49 |
| claude/remote-extensions-10 | 698404c | not queried | 224/18 | no (640/18) | C3 | SUPERSEDED | own 449 paths since 7551869: 419 byte-identical on TARGET; 30 differ, all TARGET-stricter (see below) (lane C3) |
| claude/remote-extensions-2 | df150cbdb5 | - | +0/-257 | yes | C0 | IN | ANC of 641fd49 |
| claude/remote-extensions-3 | cdfc2ba228 | - | +0/-190 | yes | C0 | IN | ANC of 641fd49 |
| claude/remote-extensions-4 | 4ffb7a99b2 | - | +0/-215 | yes | C0 | IN | ANC of 641fd49 |
| claude/remote-extensions-5 | 1337f6c121 | - | +0/-216 | yes | C0 | IN | ANC of 641fd49 |
| claude/remote-extensions-6 | 7fb7aca6d6 | - | +0/-219 | yes | C0 | IN | ANC of 641fd49 |
| claude/remote-extensions-7 | e2ac361b7f | - | +0/-207 | yes | C0 | IN | ANC of 641fd49 |
| claude/remote-extensions-8 | ad76a87e1d | - | +0/-209 | yes | C0 | IN | ANC of 641fd49 |
| claude/remote-extensions-9 | f09decc278 | - | +0/-212 | yes | C0 | IN | ANC of 641fd49 |
| claude/sharp-bohr-uigfgh | c9a8c3d3cf | #42 | +2/-9 | yes (C4 511c23b) | C4 | IN (via cw-c4) | 2 docs brought in by C4 511c23b, merged |
| claude/wizardly-babbage-mfsdrl | ade77362de | #76 | +1/-0 | yes (C4 511c23b) | C4 | IN (via cw-c4) | doc brought in by C4 511c23b, merged |
| codex/ghostpay-consolidation-20261030 | 70d8bf6ec3 | #41 | +322/-9 | yes | C0 | IN | ANC of 641fd49 |
| codex/ghostpay-recovered-lean-checkpoint-20261028 | 371d235 | not queried | 9/19 | no (425/19) | C3 | SUPERSEDED (checkpoint of same lineage) | unique 19 = cloud 12 + 84f5cdf + a734e77 + 4 lean + docs 0f8c82c, 371d235 (lane C3) |
| codex/ghostpay-research-acceptance-tests-41750257638 | 57b414bfbc | #54 | +1/-0 | yes (C4 511c23b) | C4 | IN (via cw-c4) | doc brought in by C4 511c23b, merged |
| codex/ghostpay-research-documentation-ux-41750257638 | 96fc22c42a | #56 | +1/-0 | yes (C4 511c23b) | C4 | IN (via cw-c4) | doc brought in by C4 511c23b, merged |
| codex/ghostpay-research-release-qualification-41750257638 | 6bd5b15ce4 | #57 | +1/-0 | yes (C4 511c23b) | C4 | IN (via cw-c4) | doc brought in by C4 511c23b, merged |
| codex/ghostpay-research-security-review-41750257638 | 2d9c30e12c | #55 | +1/-0 | yes (C4 511c23b) | C4 | IN (via cw-c4) | doc brought in by C4 511c23b, merged |
| codex/ghostpay-resume-20261028 | 7540088 | not queried | 9/140 | no (286/1) | C3 | SUPERSEDED | only unique commit 7540088 = docs/handoffs/CODEX_RESTART_2026-10-28.md (+73). Path absent on TARGET; TARGET has RESTART.md, SESSION_STATUS.md, SOURCE_RECONCILIATION_2026-11-02.md. Ref stays on origin. (lane C3) |
| codex/ghostpay-security-audit-20261030 | 63994db6cf | #40 | +314/-9 | yes (patch) | C2 | EQUIV | 63994db '-' in git cherry; secrets.ts, secrets.test.ts, audit doc 25 byte-identical; descriptor-bound loader secrets.ts:50-75 |
| codex/seller-ledger-receipt-qr | bb011134c1 | - | +0/-51 | yes | C0 | IN | ANC of 641fd49 |
| dependabot/github_actions/actions-712ca5a515 | b34edd5a7f | #32 | +1/-9 | n/a | C5 | SUPERSEDED (in consolidation, not main) | consolidation pins foundry-toolchain dba66c27 v1.9.2 at all 6 uses; main still v1.9.1 |
| dependabot/npm_and_yarn/follow-redirects-1.16.2 | 6bffb63d16 | #49 | +1/-5 | yes, as 99d80dc on claude/cw-c5 | C5 | IN (via cw-c5) | lock bump applied in 99d80dc |
| dependabot/npm_and_yarn/npm-major-92ee7eceef | 212967febe | #34 | +1/-9 | no | C5 | OWNER | ERESOLVE: hardhat-chai-matchers@2.1.2 peer hardhat-ethers@^3.1.0 vs 4.2.1 (lanes/C5.md); split hardhat group or drop it |
| dependabot/npm_and_yarn/npm-minor-patch-22cc71b711 | 277e490857 | #45 | +1/-9 | yes, as 14977f3 on claude/cw-c5 | C5 | IN (via cw-c5) | same version bumps applied minimal-diff in 14977f3; lock hunks from the PR applied 3-way |
| docs/ghostpay-deep-research-20261103 | 894dc868dc | #75 | +1/-0 | yes (C4 cw-c4 511c23b) | C4 | IN (via cw-c4) | all 16 docs + INDEX hunk brought in by C4 511c23b, merged |
| docs/lean-release-handoff-2026-10-24 | 2b032d77fe | - | +0/-10 | yes | C0 | IN | ANC of 641fd49 |
| docs/readme-and-wiki | ab2b616872 | - | +0/-300 | yes | C0 | IN | ANC of 641fd49 |
| fix/ghostpay-cloud-api-secret-aliases-20261103 | cdbb7ec775 | - | +1/-5 | yes (equiv) | C6 | EQUIV | `git cherry -v origin/main <br>` prints `- cdbb7ec`, patch-equivalent to ecbd085 (#50); `git diff origin/main <br> -- .github/workflows/ghostpay-codex-cloud.yml` is empty (lane C6) |
| gh-pages | cc8d07943a | - | +3/-311 | no | C0 | REJECT-for-consolidation | Separate publishing branch. 3 "Publish GhostPay build..." commits (d54261b, f264798, cc8d079), all MIXED. Their 19 paths are build output (index.html, help/*.html, how-it-works.html, privacy-options.html, why.html, site.css, theme.css, fonts/Michroma-Regular.ttf, fonts/OFL.txt) and are absent from target root (target root has no index.html or help/) |
| ghostpay-cloud-recovery-2026-10-26 | 2ec98b2 | not queried | 9/12 | no (not ancestor; TARGET...X = 425/12; cherry all `+`) | C3 | SUPERSEDED + SALVAGE(test, via cw-w11) | c729f5e test ported as 764020c (passes; behavior already present); rest superseded (lanes/C3.md) |
| ghostpay-local-lean-boundary-20261027 | 020ba32 | not queried | 9/18 | no (425/18) | C3 | SUPERSEDED (lean commits) + rest per above | see per-commit table; TARGET has apps/web/scripts/localBuildProfile.mjs, AppLean.tsx, AppShell.tsx (5a3b6aa / f9a755f / 49ec3bd lineage) (lane C3) |
| ghostpay-offline-deps-2026-10-27 | 3697f53 | not queried | 9/13 | no (425/13) | C3 | OWNER (84f5cdf vendored viem tgz) + cloud chain | 84f5cdf adds vendor/viem-2.22.14-ghostpay-deps2.tgz (2,873,944 bytes) + 45,517-line provenance json; `git cat-file -e TARGET:vendor/viem-2.22.14-ghostpay-deps2.tgz` fails; TARGET has no vendor/ dir (lane C3) |
| ghostpay-sbom-repro-2026-10-27 | b5b04b9 | not queried | 9/14 | no (425/14) | C3 | OWNER (a734e77, paired with 84f5cdf) + cloud chain | a734e77 changes scripts/normalize-sbom.mjs (+94) and adds scripts/tests/normalize-sbom.test.mjs (+226): handles a repo-local vendored archive, depends on the tgz from 84f5cdf; TARGET normalize-sbom.mjs is 19 lines with no archive path (lane C3) |
| integration/consolidated-2026-10-21 | c206655ebf | - | +0/-60 | yes | C0 | IN | ANC of 641fd49 |
| integration/ghostpay-accepted-20261102 | f8193502e6 | #47 | +330/-7 | yes | lead | IN | ANC of 641fd49 (accepted base f819350) |
| work/ghostpay-consolidation-review-20261025 | a2217ea1cc | - | +2/-9 | yes | C0 | IN | ANC of 641fd49 |
| work/ghostpay-pr26-qa-2026-10-24 | 77e7d7b6dd | - | +0/-24 | yes | C0 | IN | ANC of 641fd49 |
| work/local-reconstruction-2026-10-24 | bd320d530c | - | +0/-33 | yes | C0 | IN | ANC of 641fd49 |

## Integration log

| step | merged | consolidation tip after | gate |
|---|---|---|---|
| 1 | origin/main 0014bc5 into accepted f819350 (clean, 4 files) | see git log | build:packages ok; typecheck red only on A0 issue |
| 2 | claude/ar-a0-pr47-green 4a38efd (#59) | 3aebf6a | web typecheck ok |
| 3 | 12 ar-* branches (#60-#65, #69 (contains #66-#68), #70-#74) in listed order | 641fd49 | build:packages ok; typecheck ok; i18n check 0 errors / 206 warnings (warnings come from source branches: ar-b3 tip alone has 190, all 'identical to English' for new keys) |

Step 3 conflict notes: the only conflicts were both-sides-added hunks in apps/web/locales/{en,es,ja,ar}.json,
apps/web/src/i18n/securityKeys.ts and securityKeys.test.ts (#61, #64, #69). Resolved as a union of both sides;
the union dropped one comma per catalog at an object boundary, repaired inside the same merge commit; each catalog
was then checked to parse and to contain no duplicate keys. W2 re-checks that no security key moved to the neutral list.

| step | merged | result |
|---|---|---|
| 4 | claude/cw-w1 704e268 (typecheck, lint and build as parallel CI jobs) + README CI text | needs: resolve; check-actions-pinned OK |
| 5 | claude/cw-c4 511c23b (25 research/handoff docs, docs/INDEX.md section); later tips of ar-a7 (f7b8ee9) and ar-c7 (2b9db8a) | web typecheck ok; policy/embed/wallet tests 120/120; i18n 0 errors |
| 6 | claude/cw-c2 b9cba09 (relayer audit-chain tests and docs, no production code) | relayer 297 pass / 2 skip |
| 7 | claude/cw-w7 a4ee36e (hosting-kit triggers), claude/cw-w6 (4 testnet Chainlink feeds), claude/cw-w5 f030376 (i18n of shared and deferred-chain components) | typecheck ok; 30 web files / 385 tests; quote 20/20; i18n 0 errors / 214 warnings. Lead re-verified W6 feed addresses, decimals and heartbeats against #75 evidence (sha256 0c61b93d..., 8a170a72...) |
| 8 | WalletAttempts.tsx conflict (W5 vs ar-a7): kept W5's t() structure, moved ar-a7's newer hint text into en.json; es/ja/ar set to the English text because the key is a security key and their drafts translated the old wording | i18n +3 'identical to English' warnings |
| 9 | claude/cw-c5 99d80dc (#45, #49 minimal-diff bumps) | npm ci, build:packages, npm audit --omit=dev --audit-level=high: pass |
| 10 | claude/cw-w9 8303c8c (EVM-3), claude/cw-w10 391454b (anvil e2e), claude/cw-w11 764020c (sweep regression test) | relayer 316/316 incl. anvil e2e |
| 11 | lead fix: 'nonce too low' send answer is outcome-unknown, not a refusal (stricter; reconciliation settles it) | new case red on old classifier, green after; relayer 316/316 |

Warnings: the i18n warnings (214) are 'identical to English' drafts of new keys and a few length checks; 0 errors throughout.

## Branches created by this run (never force-pushed by anyone else; safe to delete after the owner merges)

| branch | purpose | state |
|---|---|---|
| claude/consolidation-2026-11-04 | integration branch | draft PR to main |
| claude/cw-w1, cw-c4, cw-c2, cw-w5, cw-w6, cw-w7, cw-c5, cw-w9, cw-w10, cw-w11 | lane branches | merged into consolidation |
| claude/cw-w8 | hardening of API-funded automation already on main | separate draft PR to main |

## OWNER questions

1. Automation on main (lanes/C6.md, lanes/W8.md): `ghostpay-codex-cloud.yml` `integrate` auto-merges agent PRs into an unprotected main without human review (CRITICAL). Merge the W8 hardening PR, add branch protection, or pause the workflow?
2. #51: keep 5835736 (fork/author filter, --match-head-commit) and drop 99fef85 (replaces required aggregate checks with weaker ones)? Twice-daily schedule is a cost decision.
3. #52: do not merge as is (spoofable approval check, cache poisoning, about $80/day target). Rework or close?
4. #34 npm-major: hardhat group fails to resolve (hardhat-chai-matchers@2.1.2 needs hardhat-ethers ^3.1.0, PR has 4.2.1). Split the hardhat bumps out, or drop them? TypeScript 7 / @types/node / @scure majors untested.
5. ghostpay-offline-deps-2026-10-27 84f5cdf + ghostpay-sbom-repro-2026-10-27 a734e77: vendor a 2.8 MB viem tarball for offline/SBOM builds? (lanes/C3.md)
6. packages/pool-relayer/src/main.ts:27-30 reads POOL_RELAYER_KEY from the environment; move it to the descriptor-bound file loader used by apps/relayer (lanes/C2.md)?
7. W7: should the hosting-kit qualify job also publish the artifact digest (step summary or upload-artifact), not only log it?
8. W5 left English in Home.tsx/About.tsx (LIMITS), solana/tron rpc/sweep/wallet error text, Common.tsx CopyButton; next i18n card, or accept for now? Native-speaker review of es/ja/ar remains owner-only.
9. gh-pages is a separate publishing branch (REJECT for consolidation); keep as is?
