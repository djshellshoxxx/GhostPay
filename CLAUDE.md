# GhostPay: Claude Code entry point and agent guide

Read [AGENTS.md](AGENTS.md) first. Then read [docs/ai/WORKFLOW.md](docs/ai/WORKFLOW.md) and the latest [handoff](docs/ai/HANDOFF.md). Check Git state, active PRs and CI before planning or editing.

**Owner stop-work scope (2026-11-25):** read current main [AGENTS.md](AGENTS.md) and [the ten-feature freeze](docs/ai/STOP_WORK_20261125.md), including on an older branch. Archived specifications and completion prompts do not authorize continuation. Preserve core payment, privacy and recovery work.

Use isolated task branches/worktrees and explicit ownership. Delegate only independent scopes; reserve integration for the lead worker. Follow repository-specific test commands discovered from the current source. Do not assume documentation proves implementation.

Experimental client-side invoices and stealth-address payments (EVM, plus Bitcoin/Solana/Tron proofs of concept).
Nothing is deployed or audited; testnets only. Read `README.md` "Status" before describing the project.

## Layout

npm workspaces under `packages/*` and `apps/*` (Node >= 22, ESM, TypeScript, vitest), and three Foundry projects
without `package.json`: `packages/contracts`, `packages/pool-contracts`, `packages/payer-hiding-contracts`.
For "where does X live" use the `ghostpay-package-map` skill (generated map of every workspace) before searching.

## Setup

```bash
npm ci --ignore-scripts && npm run build:libs
```

Consumers import other workspaces from `dist/`; rebuild a library before testing its dependents.
Foundry v1.8.5 (`forge`, `anvil`) is needed for contracts and anvil-backed tests (see `.devcontainer/`).

## Commands

| Task | Command |
|---|---|
| Checks for the current change only | `node scripts/agent/affected.mjs --run --checks typecheck,lint,test` (skill: `ghostpay-affected-checks`) |
| One workspace | `npm test -w packages/<name>` (also `typecheck`, `lint`, `build`) |
| One test file, no coverage | `npx vitest run <path> --coverage=false` inside the workspace |
| All workspaces | `npm run typecheck && npm run lint && npm run build && npm test` |
| Contracts | in the project dir: `forge build`, `forge test`, `forge fmt --check`, `bash scripts/check-natspec.sh` |
| Gas snapshot (packages/contracts) | `forge snapshot --check --no-match-test "testFuzz\|invariant"` |
| Script tests | `node --test scripts/testnet/*.test.mjs scripts/regtest/*.test.mjs scripts/tests/*.test.mjs scripts/agent/*.test.mjs` |
| Secret / action pin scan | `bash scripts/scan-secrets.sh`, `bash scripts/check-actions-pinned.sh` |
| Web e2e | `npm run test:e2e -w @ghostpay/web` |
| Regenerate package map | `node scripts/agent/package-map.mjs` (`--check` fails when the committed map is stale) |

Coverage thresholds live in each `vitest.config.ts`; never lower them. Anvil tests skip without `ANVIL_BIN`
(CI sets `REQUIRE_ANVIL=1`); a skip is not a pass.

Affected-check selection is a local fast path only. It never replaces the full CI suite, which runs on every pull
request, or the complete qualification required at consolidation and release checkpoints.

## Rules

- Security, privacy and wording invariants: `ghostpay-security-invariants` skill. Load it for any change to
  contracts, crypto, keys, signing, scanning, the relayer, CI, dependencies or user-facing claims.
- Contracts are immutable once deployed: no owner/proxy/pause/admin. Specs: `docs/CONTRACTS_SPEC.md`,
  `docs/APP_AND_RELAYER_SPEC.md`; decisions: `docs/adr/ADR-LOG.md`; audits: `docs/audits/`.
- All packages are `UNLICENSED`. New runtime dependencies need an exact pin and a `THIRD_PARTY.md` entry.
- Workflow actions are pinned by full commit SHA with a version comment.
- Where a workspace has a `DEVIATIONS.md`, it records intentional departures from the spec; update it with the change.
