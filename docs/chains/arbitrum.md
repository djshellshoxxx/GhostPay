# Arbitrum One

Config: `packages/chain-adapters/src/config/chains.ts`. Researched 2026-10-21.

| Network | chainId | enabled |
|---|---|---|
| Arbitrum Sepolia | 421614 | true (testnet) |
| Arbitrum One | 42161 | false (mainnet gate, see CHECKLIST.md) |

## Verified testnet tokens

| Symbol | Address (EIP-55) | Decimals | Source | Verified |
|---|---|---|---|---|
| USDC | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` | 6 | https://developers.circle.com/stablecoins/usdc-contract-addresses | 2026-10-21, via web-search snippet of the official page only; direct page fetch was blocked by the sandbox proxy. Re-check before release. |

## Not allowlisted (unverified, intentionally omitted)

All mainnet tokens; USDT, DAI, PYUSD, FDUSD, USDe, WETH/wrapped native, WBTC. Addresses must come from the issuer docs (Tether, Sky, PayPal/Paxos, First Digital, Ethena, canonical bridge docs) fetched directly. Mainnet USDC figures seen only in unverified secondary text are NOT used.

## Price feeds

None. Chainlink feed addresses/heartbeats unverified (docs.chain.link unreachable). `FEEDS` stays empty; fiat pricing hard-disabled in the UI.

## Parameters

`finalityDepth`, `getLogsMaxRange`, `blockTimeMs` are conservative defaults, not provider-verified.
