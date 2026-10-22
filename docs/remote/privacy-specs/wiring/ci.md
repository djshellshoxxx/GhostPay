# Wiring: CI edits made by swarm 10

Edits outside the new package dirs, needed because the new workspaces resolve each other through built `dist`:

1. `package.json` `build:libs`: also builds `secret-box`, `relayer-guard`, `pool-prover`, `pool-sdk`, `external-pools`.
2. `.github/actions/setup-node-libs/action.yml`: those five `dist` dirs added to the cache `path`, and their `src/`, `package.json`, `tsconfig*.json` added to the cache key (a stale cache hit otherwise skips building them and `ts-check` fails).

Needed in CI, not done here: `scripts/fetch-entrypoint.sh` before `forge test` for `packages/payer-hiding-contracts` (GPL EntryPoint test source fetched to gitignored `.vendor/`); a CI job for the new Foundry packages (`pool-contracts`, `payer-hiding-contracts`) and Hardhat `confidential-contracts` (root `npm test` runs it, ~6 min; `npm run test:quick` is ~1 min).

Known red check not from this work: `contracts-coverage` (`packages/contracts/test/audit/Sweep.audit.t.sol::test_crossRelayerAndCrossChainReplayRejected` fails with `InvalidSignature()`).
