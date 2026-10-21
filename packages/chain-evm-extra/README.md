# @ghostpay/chain-evm-extra

Config-only typed manifests and a fail-closed verifier for extra EVM chains (12 mainnets, 13 testnets; Linea, Scroll, zkSync Era, Mantle, Blast, Sonic, Celo, Taiko, Mode, Zora, Unichain, Berachain). Research basis: `docs/remote/chain-ports/evm-extra.md`. No deployments, no contracts, no network access in tests.

## What it provides
- `EXTRA_CHAINS` (`src/chains.ts`): readonly manifests, `enabled: false` (typed literal). Chain ids, names, natives from ethereum-lists (retrieved 2026-10-21). Unverified fields are `null` / `'unverified'` (finalityDepth, getLogsMaxRange, blockTimeMs, evmTarget, announcer, arachnidDeployer, list JSON sha256). zkSync Era (324) and zkSync Sepolia (300): `bytecodeModel: 'eravm'`, `create2: 'zksync-custom'`.
- Offline (`address.ts`, `manifest-check.ts`): EIP-55 check, standard CREATE2, `validateManifests` (unique ids, disabled, decimals, zkSync classification, numeric sanity), `validateConstants` (announcer 0x55649E01...D45564 and Arachnid 0x4e59...956C checksums; if you pass `announcerInitCodeHash`, checks CREATE2(Arachnid, ERC salt, hash) equals the announcer).
- Online (`verify.ts`): `verifyChain(manifest, rpc, opts)` with injected `{ getChainId(), getCode(address) }`, per-call timeout, abort signal, never throws on network failure, `ok` only when the announcer runtime code hash equals a caller-supplied reference. Standard-CREATE2 gate rejects zkSync before any RPC call.
- CLI (`src/cli.ts`, logic in `cli-lib.ts`): `GHOSTPAY_RPC_URL=<url> node dist/cli.js --chain 59144 --announcer-hash 0x<keccak of reference runtime code>`. Prints JSON, exit 0 only for `ok`. The URL is never printed.

## Quality gates (run in this package)
`tsc --noEmit` clean, `eslint` clean, `vitest run --coverage`: 37 tests passing; statements 96.9%, branches 94.35%, functions 97.05%, lines 99.41% (thresholds 95/90/95/95 unchanged). `src/cli.ts` (6-line process wiring) is excluded from coverage; see the comment in `vitest.config.ts`.

## Not verified
See `DEVIATIONS.md`.
