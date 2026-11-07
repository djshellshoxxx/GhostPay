# Autonomous run — 2026-11-07

This is a resumable handoff. It is not release acceptance, an audit, or authority to merge, deploy or enable payments.

## Ground truth (verified with git and GitHub, 2026-11-07)

| Ref | SHA | Note |
|---|---|---|
| `origin/main` | `14f9b2673ac25c7ec60a0a3a78eb17e2c7acf44d` | #53 merge plus 2 owner commits (agent prompt, `openai-agents.yml`) |
| #78 head `claude/consolidation-2026-11-04` | `a28ca06a83dc621a2bcb0eb0432889d7b4416285` | The 2026-11-04 consolidation (ledger: `docs/handoffs/consolidation-2026-11-04/LEDGER.md`) |
| Integration branch (this run) | `claude/admiring-albattani-6kydor` → draft PR #84 | Contains `a28ca06` unchanged |

The newest PRs before this run were #81 (codex checkpoint), #82 (OpenAI agent workflow; automation, owner decision) and #83 (codex ancestry audit; docs only, no code). #83 compares against `main` only, so #78 stayed the integration candidate.

## Post-#78 inventory (every ref with commits not in `a28ca06`)

The command was `git rev-list --count a28ca06..<ref>` over all 97 remote refs. Refs that the #78 ledger already dispositioned (SUPERSEDED, OWNER, REJECT) are not repeated here.

| Ref | New commits | Disposition this run | Evidence |
|---|---|---|---|
| `origin/main` | 2 | IN (merged) | workflow and prompt files only |
| `claude/ar-a6-combined-backup` (#61) | 5 | IN (merged) | 4 locale catalogs merged with a key-level 3-way merge, 0 conflicting keys; `TagArchive.tsx` resolved by hand (i18n version plus `onTagsWiped`/`notes`) |
| `claude/ar-a4-btc-headersync` (#74) | 4 | IN (merged) | clean merge. The #74 review findings H1/H2/M were already closed by f640b62, 0f80fcd and 595d780, which #78 contains |
| `claude/ar-b3-sweep-permit-states` (#69) | 2 | IN (merged) | clean |
| `claude/ar-c5-device-matrix` (#73) | 1 | IN (merged) | clean |
| `codex/ghostpay-cloud-41868394956` (#81) | 1 | IN (cherry-pick `-x` of f34a80f) | the sparse `lineItems` fix carries its own tests |
| `fix/remediation-b16c7936-5ce634` | 1 | IN (cherry-pick of 0b213bd) plus 2 mutation-checked tests | reverting the fix fails test 1; widening it to all matches fails test 2 |
| `fix/remediation-f95457fd-22ecf9` | 1 | **REJECTED** (6b3e689 cherry-picked, then reverted) | It blocks every later, distinct policy payment in the same tab. The regression test fails on 6b3e689 and passes after the revert |
| `claude/cw-w8` (#79), `codex/setup-autonomous-agent-20261104` (#82), `automation/*` (#51, #52) | — | OWNER (automation; not merged into application consolidation) | ledger questions Q1–Q3 |
| `codex/ghostpay-consolidation-audit-20261104` (#83), `claude/friendly-turing-1ui0on`, research `codex/*` docs | docs | not re-imported. The research docs are already IN via cw-c4; #83 is a planning note with no new findings | — |

## New work in this run

1. **PS-08 / ledger owner question 6, done.** The secret loader moved to `@ghostpay/relayer-guard/secrets`. The pool relayer reads `POOL_RELAYER_KEY_FILE`, and raw env keys are refused in production unless `ALLOW_SECRET_ENV=1`. This is a behaviour change for production deployments of the testnet-only pool relayer that pass the key in an env variable.
2. **W5 residuals, partly done.** CopyButton is localized, and Home and About use `useLimits()`. Still open: Solana/TRON error strings built outside the views, `Notice` kind labels, `lib/errors` messages, `ReceiptPanel.tsx`, and `storedHistoryChains()`.

## Verification (Instance: this cloud session, Node 22.23.4, npm 10.9.9)

| Check | Result |
|---|---|
| `npm ci --ignore-scripts`; `npm run build:libs` | exit 0 |
| root `npm run typecheck` | exit 0 |
| `scripts/i18n/check.mjs` / `extract.mjs` | 0 errors / 214 warnings (unchanged); 0 missing |
| web vitest, all files | 2002 passed, 4 skipped, plus 1 stale expectation (fixed; `Scan.test.tsx` then 29/29) |
| relayer-guard / pool-relayer / relayer | 167 / 34 (+9 skipped) / 309 (+4 anvil skipped) |
| other workspaces, Playwright | see PR #84 comment and the section below once recorded |
| `confidential-contracts` (hardhat) | **blocked here**: `binaries.soliditylang.org` is denied by the network policy. Hosted CI runs it |

## Remaining autonomous work (next session)

- Drive PR #84's hosted CI to green on its exact head.
- The W5 residuals listed above. Any security-classified key stays English until the locale is reviewed.
- Re-run the PR #78 open items against #84: the CodeQL alert and the Sonar gate (sonarcloud.io is not reachable from cloud sessions).

## Owner-only (unchanged)

Merging (#84 / #78 / #47); branch protection and the `ghostpay-codex-cloud.yml` auto-merge (Q1); #51, #52, #34, #82; the vendored viem tarball (Q5); the hosting-kit digest publication (Q7); native-speaker review of es/ja/ar; funded keys, deployments and the manifest trust root; the licence; a professional audit; real-device and real-wallet runs.
