# evm-extra implementation notes

Package: `packages/chain-evm-extra` (`@ghostpay/chain-evm-extra`), implements section 5 of `evm-extra.md` in reduced form.

- Manifests: 25 chains (12 mainnet, 13 testnet), all `enabled: false`, unverified facts `null`/`'unverified'`. zkSync Era (324) and zkSync Sepolia (300) flagged `create2: 'zksync-custom'`, `bytecodeModel: 'eravm'`.
- Offline: EIP-55, standard CREATE2, manifest invariants. The announcer init code hash is an input (not bundled): only Solidity source was found on raw GitHub, no compiled artifact.
- Online: `verifyChain(manifest, rpc, opts)` with injected `{getChainId, getCode}`; timeout, abort, fail-closed; `ok` needs a caller-supplied reference runtime code hash; zkSync rejected before any RPC call. Results: ok, unverified, chain_mismatch, announcer_missing, deployer_missing, code_mismatch, unsupported_create2, rpc_error, aborted.
- CLI: `src/cli.ts` (thin) over `src/cli-lib.ts`; URL from `--rpc` or `GHOSTPAY_RPC_URL`, never printed; exit 0 only on `ok`.
- Gates: tsc and eslint clean; 37 tests; coverage 96.9 / 94.35 / 97.05 / 99.41 (stmts/branches/funcs/lines), thresholds 95/90/95/95.
- Remaining work and unverified list: `packages/chain-evm-extra/DEVIATIONS.md`. No verifier has been run against a live RPC.
