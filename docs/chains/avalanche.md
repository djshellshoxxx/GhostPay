# Avalanche C-Chain

Config: `packages/chain-adapters/src/config/chains.ts`. Researched 2026-10-21.

| Network | chainId | enabled |
|---|---|---|
| Avalanche Fuji | 43113 | true (testnet) |
| Avalanche C-Chain | 43114 | false (mainnet gate, see CHECKLIST.md) |

## Verified testnet tokens

| Symbol | Address (EIP-55) | Decimals | Source | Verified |
|---|---|---|---|---|
| USDC | `0x5425890298aed601595a70AB815c96711a31Bc65` | 6 | https://developers.circle.com/stablecoins/usdc-contract-addresses | 2026-10-21, via web-search snippet of the official page only; direct page fetch was blocked by the sandbox proxy. Re-check before release. |
| EURC | `0x5E44db7996c682E92a960b65AC713a54AD815c6B` | 6 | https://developers.circle.com/stablecoins/eurc-contract-addresses (Circle EURC quickstart) | 2026-10-21, via web-search snippet of the official page only; direct page fetch was blocked by the sandbox proxy. Re-check before release. |

## Not allowlisted (unverified, intentionally omitted)

All mainnet tokens; USDT, DAI, PYUSD, FDUSD, USDe, WETH/wrapped native, WBTC. Addresses must come from the issuer docs (Tether, Sky, PayPal/Paxos, First Digital, Ethena, canonical bridge docs) fetched directly. Mainnet USDC figures seen only in unverified secondary text are NOT used.

## Price feeds

None. Chainlink feed addresses/heartbeats unverified (docs.chain.link unreachable). `FEEDS` stays empty; fiat pricing hard-disabled in the UI.

## Parameters

`finalityDepth`, `getLogsMaxRange`, `blockTimeMs` are conservative defaults, not provider-verified.
