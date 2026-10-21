# Swarm integration status

Integrator pass on branch `claude/laughing-bardeen-4t20ys`, node 22, foundry (forge 1.8.5) from `/root/.foundry/bin`.
All numbers below are from real runs in this sandbox. No real wallet, key or funds were used; no public chain was contacted.

## Gate summary

| Gate | Result |
| --- | --- |
| `npm ci --ignore-scripts` | pass (lockfile in sync) |
| `npm run build:libs` | pass |
| `npm run typecheck` (all workspaces) | pass |
| `npm run lint` (all workspaces) | pass |
| `npm test` (all workspaces, default env) | 24 vitest workspaces green; 1 failure: `@ghostpay/confidential-contracts` (needs solc download, no network). Passes with `GHOSTPAY_SOLC_PATH=/home/user/tools/solc` |
| `forge build` / `fmt --check` / `test` in `packages/contracts` | pass, 400 tests |
| web `vite build` | bundle compiles; **postbuild bundle scan FAILS** on one stale local file (see Blockers) |

## Vitest per workspace (default environment, `npm test`)

| Workspace | Passed | Skipped | Files |
| --- | ---: | ---: | --- |
| address-safety | 71 | 0 | 3 |
| btc-payjoin | 155 | 0 | 10 |
| btc-silent-payments | 303 | 0 | 19 |
| chain-adapters | 253 | 0 | 14 |
| confidential-amounts | 88 | 0 | 7 |
| core-crypto | 54 | 0 | 7 |
| external-pools | 93 | 1 | 5 |
| external-pools-privacypools | 73 | 4 | 7 (+1 skipped) |
| external-pools-railgun | 20 | 1 | 3 (+1 skipped) |
| invoice-schema | 174 | 0 | 7 |
| ops-monitor | 94 | 0 | 7 |
| payer-sponsor | 125 | 4 | 12 (+1 skipped) |
| policy-scheme | 60 | 0 | 5 |
| pool-circuits | 18 | 59 | 3 (+2 skipped) |
| pool-prover | 8 | 0 | 1 |
| pool-relayer | 27 | 9 | 3 (+2 skipped) |
| pool-sdk | 47 | 0 | 5 |
| relayer-guard | 137 | 0 | 4 |
| secret-box | 31 | 0 | 2 |
| solana-stealth | 106 | 0 | 6 |
| tron-adapter | 63 | 0 | 8 |
| tx-review | 145 | 0 | 4 |
| apps/relayer | 214 | 2 | 5 (+1 skipped) |
| apps/web | 409 | 1 | 36 (+1 skipped) |
| **Total** | **2768** | **81** | |

Coverage thresholds in each package config were not changed and all packages that enforce them met them.

## Re-runs with anvil on the path (`ANVIL_BIN=/root/.foundry/bin/anvil`)

The anvil-gated e2e tests default to `/home/user/tools/foundry/anvil`, which does not exist here, so they self-skip in a plain run. With `ANVIL_BIN` set:

| Workspace | Passed | Skipped |
| --- | ---: | ---: |
| apps/relayer | 215 | 1 |
| payer-sponsor | 129 | 0 |
| external-pools | 94 | 0 |
| chain-adapters | 253 | 0 |
| policy-scheme | 60 | 0 |
| apps/web | 409 | 1 |

`payer-sponsor` e2e needs `packages/payer-hiding-contracts/out`, which exists after `forge build` there (see below).

## Solidity

| Project | Build | fmt --check | Tests |
| --- | --- | --- | --- |
| packages/contracts (forge) | pass | pass | 400 passed, 0 failed, 0 skipped (26 suites; fuzz 10000 runs, invariants 256x50) |
| packages/pool-contracts (forge) | pass | pass | 84 passed, 0 failed, 0 skipped (11 suites) |
| packages/payer-hiding-contracts (forge) | pass after `./scripts/fetch-entrypoint.sh` | pass | 103 passed, 0 failed, 0 skipped (7 suites) |
| packages/confidential-contracts (hardhat + fhevm mock) | pass with local solc | pass (`lint:sol` is `forge fmt --check`) | 46 passing (about 4 min) with `GHOSTPAY_SOLC_PATH=/home/user/tools/solc`; fails with HH502 without it (cannot reach binaries.soliditylang.org) |

Notes:
- `payer-hiding-contracts` tests import the ERC-4337 EntryPoint v0.7 from `.vendor/` (gitignored, test only, GPL headers, see its DEVIATIONS.md). It must be fetched with `scripts/fetch-entrypoint.sh` (uses `npm pack @account-abstraction/contracts@0.7.0`) before `forge build`. A fresh clone fails to build until that is run. CI must call it.
- `forge build` in `packages/contracts` prints `environment-read-across-mutation` lint warnings for `vm.warp` in test files (warnings only; the build exits 0).
- `packages/confidential-contracts` plain `forge build` is not applicable (hardhat project, no remappings).

## Skipped tests and why

| Where | Count | Reason |
| --- | ---: | --- |
| pool-circuits (proof, witness, forgery, fixtures) | 59 | circom witness wasm and zkeys under `packages/pool-circuits/build/` are not built (no `circom`/ceremony artifacts in the sandbox). Needs `npm run build:circuits`. |
| pool-relayer (circuit.witness, e2e.anvil) | 9 | same missing circuit build artifacts |
| external-pools-privacypools | 4 | needs `PP_CONTRACTS_OUT` and `PP_ARTIFACT_DIR` (official Privacy Pools contracts out and the six official circuit artifacts). Not fetched; unverified. `REQUIRE_ANVIL=1` turns the skip into a failure. |
| external-pools-railgun | 1 | needs `RG_CONTRACTS_OUT` (compiled RailgunSmartWallet). Not fetched. |
| external-pools | 1 | anvil not at default path; passes with `ANVIL_BIN` |
| payer-sponsor | 4 | anvil not at default path; passes with `ANVIL_BIN` |
| apps/relayer | 2 | anvil not at default path (1 remains skipped with `ANVIL_BIN`, the CI-only prerequisite guard `describe.runIf(CI or REQUIRE_ANVIL)`) |
| apps/web | 1 | `regtest.e2e` needs a live bitcoind (`url`, `seed`, `dest` env). No bitcoind in sandbox. |
| btc-payjoin `test:e2e` | not run | regtest e2e script, needs bitcoind |
| apps/web `test:e2e` (Playwright) | not run | not part of `npm test`; needs browsers and a built app |
| confidential-contracts `test:quick` | not run | subset of the full hardhat run, which passed |

## Unverified or not run

- Real-wallet and real-chain flows: intentionally absent. Testnet deploy scripts are dry-run unless a human supplies a key.
- The Privacy Pools and Railgun integrations against their official artifacts are untested here (see skips).
- Circuit trusted setup is an insecure dev ceremony; `forgery.test.ts` documents that proofs are forgeable. Do not use outside local tests.
- Fresh-clone reproducibility of `payer-hiding-contracts` and `confidential-contracts` depends on the fetch script and a reachable solc download respectively.
- `npm audit` reports 26 vulnerabilities (14 low, 2 moderate, 10 high) after `npm ci`; not triaged in this pass.
- Playwright e2e, bitcoind regtest, Solana and Tron integration containers (`infra/integration`, `.github/workflows/integration.yml`) were being edited by other workers and were not run by the integrator.

## Blockers

1. **Web bundle scan fails**: `apps/web/dist/deployments/31337.json` is shipped because the stale, gitignored local file `apps/web/public/deployments/31337.json` (copied there by `scripts/devnet/up.sh`) exists. The scan reports only that one problem; every other bundle check passed. Fix: delete that file (what `scripts/devnet/down.sh` does) and re-run `npm run build -w @ghostpay/web`. The integrator was denied permission to delete it in this session, so it was left in place. Consider making `up.sh` copy the manifest only for the dev server, or making the build ignore it, so a devnet run cannot break `npm run build`.
2. `@ghostpay/confidential-contracts` `npm test` needs network for the solc download; use `GHOSTPAY_SOLC_PATH`.
