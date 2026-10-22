# @ghostpay/confidential-contracts

CT-1 proof of concept: **confidential checkout** on the Zama fhEVM with OpenZeppelin ERC-7984 tokens. Spec: [`docs/remote/privacy-specs/confidential-tokens.md`](../../docs/remote/privacy-specs/confidential-tokens.md) (section 6.1). Testnet only: constructors revert outside chain ids 31337 (local mock) and 11155111 (Ethereum Sepolia). **Not deployed. Not audited. Never run on Sepolia.**

| Contract | What it is |
|---|---|
| `GhostPayConfidentialRouter` | Pulls an encrypted amount from the payer (operator pattern), takes the 25 bps fee as `t / 400` into an encrypted router balance, pays the net to a one-time stealth address, announces via ERC-5564 with the encrypted-amount **handle** (57-byte metadata `viewTag \| 0x5bebed7e \| token \| handle`). No owner, pause, proxy, `delegatecall` or arbitrary call. |
| `GhostPayTestConfidentialToken` | OZ `ERC7984ERC20Wrapper` over `MockERC20` ("GhostPay Test USD", public mint). Test assets only. |
| `TestnetOnly` | Constructor chain-id guard shared by all three. |
| `mocks/` | `MockAnnouncer`, `ReentrantStealth` (test doubles). |

What it hides: gross, fee and net amounts. What it does **not** hide: payer, stealth address, token, time, router use, the ETH gas buffer, wrap and unwrap amounts; the payer, the stealth owner and (after a flush) the fee recipient can decrypt what they are ACL-allowed on; the FHE operator can reveal amounts if it misbehaves. A payment can silently transfer 0 if the payer balance was too low.

## Build and test

Hardhat, not Foundry (the fhEVM mock ships as `@fhevm/hardhat-plugin`; see `DEVIATIONS.md`). Solidity 0.8.28, evm `cancun`.

The pinned `@fhevm/hardhat-plugin` 0.4.2 requires `@fhevm/solidity` 0.11.1 and exactly `@zama-fhe/relayer-sdk` 0.4.1. Upgrading only the Solidity library to 0.13.4 fails the plugin's `ZamaConfig.sol` compatibility check; SDK 0.4.5 fails its exact-version assertion. Upgrade this stack together and run the complete suite; Dependabot leaves minor/major Solidity-library changes and SDK changes for that coordinated upgrade.

```bash
# from the repo root: npm ci --ignore-scripts
cd packages/confidential-contracts
npm run compile
npm test                 # full: 1000 fuzz runs, ~6 min
npm run test:quick       # 100 fuzz runs, ~1 min
npm run lint:sol         # forge fmt --check contracts
npm run abi              # writes abi/*.json (consumed by @ghostpay/confidential-amounts tests)
```

Hardhat downloads solc 0.8.28 from binaries.soliditylang.org. In a sandbox without that host, point `GHOSTPAY_SOLC_PATH` at a native 0.8.28 binary (local only, never committed): `GHOSTPAY_SOLC_PATH=/path/to/solc npm test`. Fuzz knobs: `FUZZ_SEED`, `FUZZ_RUNS`, `INV_SEQUENCES`, `INV_STEPS`. `test/chainGuard.test.ts` starts throw-away `anvil` processes (set `ANVIL_BIN`; skipped loudly if absent).

Deploy (never run here): `scripts/deploy.ts` refuses every chain id except 31337 and 11155111; constructor arguments are `(announcer, feeRecipient, acceptedTokens[])`.

## Status

Library only; nothing imports it. 46 tests pass in the mock (see `DEVIATIONS.md` for what they do and do not prove). Slither: no medium or high findings, 2 informational detectors triaged. Echidna harness compiles but cannot run (chain id). Self review: `docs/remote/privacy-specs/audit-confidential-tokens.md` (AI-assisted, not an independent audit).
