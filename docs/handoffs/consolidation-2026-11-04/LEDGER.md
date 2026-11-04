# Consolidation ledger — 2026-11-04

Shared state for the 2026-11-04 consolidation run. Snapshot taken after `git fetch --all --prune`.

- BASE (origin/main): `0014bc5b26c7487ea1f9fb230194c36673193236`
- Accepted start (origin/integration/ghostpay-accepted-20261102, PR #47 head): `f8193502e602c99bb24ff956f142671750b744a0`
- Integration branch: `claude/consolidation-2026-11-04`
- "in-accepted?" = `git merge-base --is-ancestor <branch> origin/integration/ghostpay-accepted-20261102`.
- ahead/behind is relative to origin/main (+ahead/-behind).

| branch | tip | PR | ahead/behind main | in-accepted? | lane | disposition | evidence |
|---|---|---|---|---|---|---|---|
| automation/api-funded-ghostpay-cloud-20261103 | 29ce481d2d | - | +0/-6 | no | C6 | pending |  |
| automation/ghostpay-parallel-four-agents-20261103 | 68dc5b502f | #52 | +6/-4 | no | C6 | pending |  |
| automation/ghostpay-parallel-review-wave-20261103 | 03a3f5701c | - | +0/-1 | no | C6 | pending |  |
| automation/ghostpay-recurrent-backlog-20261103 | 5835736c12 | #51 | +3/-4 | no | C6 | pending |  |
| backup/codex-observed-pr37-915d710-20261028 | 915d71053e | - | +167/-9 | yes | C0 | IN | ancestor of accepted f819350 |
| backup/pr30-before-consolidation-20261025 | 356fe5e44d | - | +28/-13 | yes | C0 | IN | ancestor of accepted f819350 |
| backup/pr31-before-consolidation-20261025 | a2217ea1cc | - | +2/-9 | yes | C0 | IN | ancestor of accepted f819350 |
| checkpoint/ghostpay-recovery-20261102 | 1dffa5a366 | - | +0/-8 | yes | C0 | IN | ancestor of accepted f819350 |
| checkpoint/ghostpay-source-reconciliation-20261101 | 243d98d67c | - | +324/-9 | no | C3 | pending |  |
| claude/adoring-wozniak-850ue6 | a2217ea1cc | #31 | +2/-9 | yes | C0 | IN | ancestor of accepted f819350 |
| claude/ar-a0-pr47-green | 4a38efdfa9 | #59 | +331/-7 | no | lead | pending |  |
| claude/ar-a4-btc-headersync | 595d78021a | #74 | +335/-7 | no | C1 | pending |  |
| claude/ar-a5-announcer-budget | d9fe8b4e9c | #70 | +334/-7 | no | C1 | pending |  |
| claude/ar-a6-combined-backup | f9a755f675 | #61 | +335/-7 | no | C1 | pending |  |
| claude/ar-a7-policy-send-guard | 6e13bb981f | #65 | +335/-7 | no | C1 | pending |  |
| claude/ar-b1-core-journey | e0a499bdd9 | #62 | +336/-7 | no | C1 | pending |  |
| claude/ar-b2-lean-bound-receipts | 2bcfd11f9d | #64 | +335/-7 | no | C1 | pending |  |
| claude/ar-b3-sweep-permit-states | 1b9edb1d10 | #69 | +360/-7 | no | C1 | pending |  |
| claude/ar-b5-testnet-feeds | 76199cdac3 | #72 | +332/-7 | no | C1 | pending |  |
| claude/ar-c1-reconciliation-adr | 1e87109119 | #71 | +335/-7 | no | C1 | pending |  |
| claude/ar-c2-qr-pairing | 78be1730ad | #60 | +337/-7 | no | C1 | pending |  |
| claude/ar-c4-i18n-create-b4-buffer-ui | 4fe95fc0f6 | #68 | +352/-7 | no | C1 | pending |  |
| claude/ar-c4-i18n-pay | e02d04c754 | #66 | +334/-7 | no | C1 | pending |  |
| claude/ar-c4-i18n-scan | 7f4702fdd3 | #67 | +340/-7 | no | C1 | pending |  |
| claude/ar-c5-device-matrix | 0bf0f66344 | #73 | +333/-7 | no | C1 | pending |  |
| claude/ar-c7-embed-iframe-e2e | f54f9ee372 | #63 | +334/-7 | no | C1 | pending |  |
| claude/cool-albattani-xopr89 | 7373172db4 | #30 | +89/-9 | yes | C0 | IN | ancestor of accepted f819350 |
| claude/docs-snapshot-1 | dc2340c998 | - | +0/-249 | yes | C0 | IN | ancestor of accepted f819350 |
| claude/docs-snapshot-2 | e1a92c876c | - | +0/-248 | yes | C0 | IN | ancestor of accepted f819350 |
| claude/friendly-turing-1ui0on | 3560f521e6 | - | +4/-0 | no | C4 | pending |  |
| claude/ghostpay-autonomous-completion-y4sk2h | b6a0871d06 | - | +315/-9 | yes | C0 | IN | ancestor of accepted f819350 |
| claude/ghostpay-autonomous-prompt-scpgun | 1db8e967af | #58 | +1/-0 | no | C4 | pending |  |
| claude/gifted-planck-115x2k | 1d28f24d86 | #39 | +313/-9 | no | C2 | pending |  |
| claude/haiku-wave-2-handoff-qepfoe | 8d1bde36bb | #43 | +325/-9 | no | C2 | pending |  |
| claude/happy-maxwell-onl4x5 | fd710eb367 | #44 | +323/-9 | no | C2 | pending |  |
| claude/inspiring-fermat-vxv689 | c1c4ac9b64 | - | +0/-279 | yes | C0 | IN | ancestor of accepted f819350 |
| claude/laughing-bardeen-4t20ys | e96cee1a4e | - | +105/-224 | no | C3 | pending |  |
| claude/pages-site-1 | 7f77a44483 | - | +0/-235 | yes | C0 | IN | ancestor of accepted f819350 |
| claude/portable-hosting-kit | cb917c67bf | #36 | +41/-9 | yes | C0 | IN | ancestor of accepted f819350 |
| claude/remote-extensions-1 | 39cce4663d | - | +0/-222 | yes | C0 | IN | ancestor of accepted f819350 |
| claude/remote-extensions-10 | 698404ca48 | - | +18/-224 | no | C3 | pending |  |
| claude/remote-extensions-2 | df150cbdb5 | - | +0/-257 | yes | C0 | IN | ancestor of accepted f819350 |
| claude/remote-extensions-3 | cdfc2ba228 | - | +0/-190 | yes | C0 | IN | ancestor of accepted f819350 |
| claude/remote-extensions-4 | 4ffb7a99b2 | - | +0/-215 | yes | C0 | IN | ancestor of accepted f819350 |
| claude/remote-extensions-5 | 1337f6c121 | - | +0/-216 | yes | C0 | IN | ancestor of accepted f819350 |
| claude/remote-extensions-6 | 7fb7aca6d6 | - | +0/-219 | yes | C0 | IN | ancestor of accepted f819350 |
| claude/remote-extensions-7 | e2ac361b7f | - | +0/-207 | yes | C0 | IN | ancestor of accepted f819350 |
| claude/remote-extensions-8 | ad76a87e1d | - | +0/-209 | yes | C0 | IN | ancestor of accepted f819350 |
| claude/remote-extensions-9 | f09decc278 | - | +0/-212 | yes | C0 | IN | ancestor of accepted f819350 |
| claude/sharp-bohr-uigfgh | c9a8c3d3cf | #42 | +2/-9 | no | C4 | pending |  |
| claude/wizardly-babbage-mfsdrl | ade77362de | #76 | +1/-0 | no | C4 | pending |  |
| codex/ghostpay-consolidation-20261030 | 70d8bf6ec3 | #41 | +322/-9 | yes | C0 | IN | ancestor of accepted f819350 |
| codex/ghostpay-recovered-lean-checkpoint-20261028 | 371d235c3e | - | +19/-9 | no | C3 | pending |  |
| codex/ghostpay-research-acceptance-tests-41750257638 | 57b414bfbc | #54 | +1/-0 | no | C4 | pending |  |
| codex/ghostpay-research-documentation-ux-41750257638 | 96fc22c42a | #56 | +1/-0 | no | C4 | pending |  |
| codex/ghostpay-research-release-qualification-41750257638 | 6bd5b15ce4 | #57 | +1/-0 | no | C4 | pending |  |
| codex/ghostpay-research-security-review-41750257638 | 2d9c30e12c | #55 | +1/-0 | no | C4 | pending |  |
| codex/ghostpay-resume-20261028 | 75400888c9 | - | +140/-9 | no | C3 | pending |  |
| codex/ghostpay-security-audit-20261030 | 63994db6cf | #40 | +314/-9 | no | C2 | pending |  |
| codex/seller-ledger-receipt-qr | bb011134c1 | - | +0/-51 | yes | C0 | IN | ancestor of accepted f819350 |
| dependabot/github_actions/actions-712ca5a515 | b34edd5a7f | #32 | +1/-9 | no | C5 | pending |  |
| dependabot/npm_and_yarn/follow-redirects-1.16.2 | 6bffb63d16 | #49 | +1/-5 | no | C5 | pending |  |
| dependabot/npm_and_yarn/npm-major-92ee7eceef | 212967febe | #34 | +1/-9 | no | C5 | pending |  |
| dependabot/npm_and_yarn/npm-minor-patch-22cc71b711 | 277e490857 | #45 | +1/-9 | no | C5 | pending |  |
| docs/ghostpay-deep-research-20261103 | 894dc868dc | #75 | +1/-0 | no | C4 | pending |  |
| docs/lean-release-handoff-2026-10-24 | 2b032d77fe | - | +0/-10 | yes | C0 | IN | ancestor of accepted f819350 |
| docs/readme-and-wiki | ab2b616872 | - | +0/-300 | yes | C0 | IN | ancestor of accepted f819350 |
| fix/ghostpay-cloud-api-secret-aliases-20261103 | cdbb7ec775 | - | +1/-5 | no | C6 | pending |  |
| gh-pages | cc8d07943a | - | +3/-311 | no | C0 | pending |  |
| ghostpay-cloud-recovery-2026-10-26 | 2ec98b2394 | - | +12/-9 | no | C3 | pending |  |
| ghostpay-local-lean-boundary-20261027 | 020ba327e1 | - | +18/-9 | no | C3 | pending |  |
| ghostpay-offline-deps-2026-10-27 | 3697f539d3 | - | +13/-9 | no | C3 | pending |  |
| ghostpay-sbom-repro-2026-10-27 | b5b04b999e | - | +14/-9 | no | C3 | pending |  |
| integration/consolidated-2026-10-21 | c206655ebf | - | +0/-60 | yes | C0 | IN | ancestor of accepted f819350 |
| integration/ghostpay-accepted-20261102 | f8193502e6 | #47 | +330/-7 | yes | lead | IN | ancestor of accepted f819350 |
| work/ghostpay-consolidation-review-20261025 | a2217ea1cc | - | +2/-9 | yes | C0 | IN | ancestor of accepted f819350 |
| work/ghostpay-pr26-qa-2026-10-24 | 77e7d7b6dd | - | +0/-24 | yes | C0 | IN | ancestor of accepted f819350 |
| work/local-reconstruction-2026-10-24 | bd320d530c | - | +0/-33 | yes | C0 | IN | ancestor of accepted f819350 |

## Integration log

| step | merged | consolidation tip after | gate |
|---|---|---|---|
| 1 | origin/main 0014bc5 into accepted f819350 (clean, 4 files) | see git log | build:packages ok; typecheck red only on A0 issue |
| 2 | claude/ar-a0-pr47-green 4a38efd (#59) | see git log | web typecheck ok |

## OWNER questions

(filled by lanes)
