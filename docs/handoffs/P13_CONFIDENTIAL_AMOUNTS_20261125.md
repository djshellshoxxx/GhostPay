# P13 confidential amounts: handoff 2026-11-25

- Repository: djshellshoxxx/GhostPay. PR: https://github.com/djshellshoxxx/GhostPay/pull/642.
- Owner decision 2026-11-25: merge into main as **dormant** code once CI is green, without waiting for an independent
  review. This does not activate anything: the module stays unexported and off by default, settlement stays refused,
  and activation still requires owner decisions D1–D8 plus an independent cryptographic review.
- Main `c365dc41` merged into the branch at `833ee872` (owner stop-work directive in AGENTS.md; P13 is not among the
  archived/deferred products). ACTIVE_WORK conflict resolved additively; P13 checks re-run there: 321/321 tests, coverage
  98.95/94.86/100/99.6, typecheck, lint, build, browser qualification, secret scan, action pins and package map all pass.
- Branch `nodata/eloquent-shannon-gfv6t9`; base main `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`; spec ancestry
  `future/p13-confidential-amounts` `8846d555` merged (`7e208062`, ACTIVE_WORK conflict resolved additively, 0 lines dropped).
- Commits: `307e7050` claim, `fb9d97e3` units/asset/secret/disclosure/gate/lifecycle, `0eac8491` records/store/invoice/plan,
  `c2c9849f` browser qualification + boundary test, `02647f93` docs, `f8337b06` review fixes (tested head).
- Owned paths: `packages/confidential-amounts/src/future/p13/**`, `packages/confidential-amounts/browser/**`, additive
  package docs/config, `docs/future/modules/P13-confidential-amounts/IMPLEMENTATION.md`, this file. Claim in `docs/ai/ACTIVE_WORK.md`.

## Done

Protocol-neutral P13 client core, internal and default off: exact amounts and precision, strict assets with pinned
manifest digests, `SecretAmount`, route classification and disclosures, gate (settlement always refused, CT-1
unavailable, no P13 fee), lifecycle/evidence/stale guards, canonical records, AES-256-GCM `GPC1` envelopes with CAS,
reload reconciliation and ciphertext backup/restore, unchanged-invoice mapping, fixture plan prepare/review/cancel.
Details and acceptance mapping: `IMPLEMENTATION.md` section 4.

Independent AI-assisted review (separate agent, code only): 9 findings (2 medium, 7 low). All addressed in `f8337b06`
with 12 regression cases that fail on `02647f93` sources and pass on `f8337b06`; finding 7 (cross-session rollback)
is a documented limitation (DEVIATIONS P13-7, owner decision D6). This is not an independent professional audit.

## Verification (Node 22.23.5, Linux, local; commands from repo root unless noted)

| Command | Head | Result |
|---|---|---|
| `npm ci --ignore-scripts && npm run build:libs` | `7e208062` | exit 0 |
| `npm test -w @ghostpay/confidential-amounts` (baseline) | main base | 88/88 pass |
| `npm test -w @ghostpay/confidential-amounts` | `f8337b06` | 321/321 pass (88 existing + 233 P13); coverage 98.95 stmts / 94.86 branches / 100 funcs / 99.6 lines (thresholds 95/90/95/95) |
| `npm run typecheck -w @ghostpay/confidential-amounts`, `npm run lint -w ...`, `npm run build -w ...` | `f8337b06` | exit 0 (lint covers `src` and `browser`) |
| `npm run test:browser -w @ghostpay/confidential-amounts` | `f8337b06` | PASS, Chromium 158.0.8127.36 (`/opt/pw-browsers/chromium`) |
| Mutation spot checks (gate settlement branch, evidence verdict) | `fb9d97e3` | 7 and 2 tests fail when mutated; restored |
| `node scripts/agent/affected.mjs --run --checks typecheck,lint,test` (full: lockfile changed) | `c2c9849f` | see "Full suite" below |
| `bash scripts/scan-secrets.sh`; `bash scripts/check-actions-pinned.sh`; `npm run ci:check-tx-origin` | `02647f93` | OK / OK (114 refs) / OK (39 files) |
| `node scripts/agent/package-map.mjs --check`; `node --test scripts/agent/*.test.mjs` | `02647f93` | current; 12/12 pass |
| `git diff --check c8e131c1..HEAD` (own files) | `f8337b06` | clean; the merged spec file has one trailing blank line (not edited) |

Full suite (`c2c9849f`, finished; exit 1): typecheck passed in all workspaces; lint 0 errors in 67 workspaces (1 pre-existing warning, below); vitest passed in all 68 workspaces (13,592 tests passed, 125 skipped, 0 failed). Node script tests: 253 pass, 1 skip, **1 fail**: `scripts/testnet/verify-sources.test.mjs` case 25 exits 127 with `cast: command not found`, because Foundry is not installed in this container; forge tests for the three Foundry projects were skipped for the same reason. This branch changes no file under `scripts/` and no Solidity. Hosted CI (with Foundry) is the authority for both. The `confidential-amounts` changes after `c2c9849f` (review fixes) were re-run separately at `f8337b06` (table above).

Not run: Foundry (no Solidity change), `confidential-contracts` Hardhat tests (untouched), apps/web e2e (web unchanged
and does not import P13), Firefox/WebKit, any public testnet. Skips are not passes.

## Pre-existing findings (not caused by this branch)

- `THIRD_PARTY.md` generated tables are stale on main `c8e131c1` (`node docs/tools/third-party-table.mjs --check`
  fails in a clean main worktree). Not regenerated here (333-line unrelated rewrite).
- `btc-silent-payments` lint: one "unused eslint-disable directive" warning.
- Router return-bomb fix `cd544529` and CT-C-2 test `4bfaffa5` exist only on non-main branches (contracts lane).

## Completion assessment (evidence-based estimates, not measurements)

| Area | % | Basis |
|---|---|---|
| Architecture and specification | 55 | spec + implementation record with guarantees, leakage and owner decisions; no accepted protocol ADR, no P06 contract |
| Core implementation | 45 | client validation, models, records, gate, lifecycle, invoice mapping, fixture plans done; no protocol provider, chain evidence adapter, vault key custody or production IndexedDB port |
| Browser integration | 10 | core qualified in Chromium; no apps/web wiring (by design while off) |
| Automated testing | 50 | 233 unit/property/negative + 1 browser qualification; no contract-backed CT-M, multi-browser, fuzzing or independent vectors |
| Independent security qualification | 0 | self/AI-assisted review only |
| Main-branch integration | merge approved | owner approved merging the dormant code once CI is green; the merge commit is recorded on the PR |
| Overall feature completion | 25 | weighted; confidential settlement itself is not started |

## Next independent task

Pin and verify CT-1 manifest code hashes from a reviewed source and run the CT-M ledger against the Solidity router on a
local Hardhat chain (closes CT-08/CT-09 evidence gaps) — needs owner approval because it exercises contract code. Without
approval: production IndexedDB `KvPort` with a cross-session monotonic counter design for owner decision D6.

## Blockers needing the owner

D1 protocol selection; D3 `invoice-schema` `amountVisibility`; D5 fee design; D6 record-key custody (P05); D7 Zama
licence; D8 audit scope and the unmerged router fix. See `IMPLEMENTATION.md` section 8.
