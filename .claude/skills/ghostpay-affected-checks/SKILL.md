---
name: ghostpay-affected-checks
description: Run only the GhostPay checks a change needs (changed workspaces, their dependents, changed Foundry projects) instead of the full 70-workspace suite. Use while iterating on any code change, before committing, and before pushing to predict CI. Not a substitute for the full suite when root config, lockfile or shared tooling changes (the script detects that and widens to everything).
---

# GhostPay affected checks

## Prerequisites (once per container)

```bash
npm ci --ignore-scripts && npm run build:libs
```

Foundry v1.8.5 (`forge`, `anvil`) is needed only for `.sol` changes and anvil-backed tests; without it the script
reports the forge step as SKIPPED with exit code 2. Never report a skipped step as passed.

## Commands

```bash
node scripts/agent/affected.mjs                       # list targets vs origin/main + uncommitted changes
node scripts/agent/affected.mjs --run                 # rebuild needed libs, run tests (+ forge build/test/fmt)
node scripts/agent/affected.mjs --run --checks typecheck,lint,test   # before a commit
node scripts/agent/affected.mjs --base HEAD~1 --json  # other base, machine-readable
node scripts/agent/affected.mjs --files packages/a/src/x.ts          # explicit file list
```

## What it decides

- Changed workspace -> that workspace plus every transitive dependent.
- Libraries the affected set imports are rebuilt first, in dependency order (consumers read `dist/`).
- `packages/contracts` change -> `forge build`, `forge test` (FOUNDRY_PROFILE=dev: 256 fuzz runs), `forge fmt --check`,
  plus TS consumers `chain-adapters`, `policy-scheme`, `apps/web`. Other Foundry projects test alone.
- `package.json`, `package-lock.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`,
  `scripts/build-workspaces.mjs`, `.github/actions/` -> full suite.
- `docs/**` and `*.md` -> nothing. Paths it cannot map (CI workflows, `deploy/`, `infra/`, `integrations/`) are listed
  as "Unmapped"; check those by hand.

## Faster still

- Single file while debugging: `npx vitest run <path> --coverage=false` inside the workspace. Coverage
  thresholds are enforced by the workspace `test` script, so finish with `--run`.
- Single Solidity test: `forge test --match-path test/X.t.sol --match-test name` in the project directory.
- Anvil-gated tests (chain-adapters, policy-scheme, web, confidential-contracts, relayer) skip without
  `ANVIL_BIN`; CI sets `REQUIRE_ANVIL=1`. A local skip is not a pass: say so.

## Before push

The local run covers only affected code with the dev fuzz profile. CI (`.github/workflows/ci.yml`) still runs
the default profile (10,000 fuzz runs), coverage, NatSpec, gas snapshot, Slither, e2e and secret scan. For
contract changes also run `forge snapshot --check --no-match-test "testFuzz|invariant"` and
`bash scripts/check-natspec.sh` in `packages/contracts`. Always run `bash scripts/scan-secrets.sh`.
