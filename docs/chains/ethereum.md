# Ethereum

Config: `packages/chain-adapters/src/config/chains.ts`. Researched 2026-10-21.

| Network | chainId | enabled |
|---|---|---|
| Ethereum Sepolia | 11155111 | true (testnet) |
| Ethereum | 1 | false (mainnet gate, see CHECKLIST.md) |

## Verified testnet tokens

| Symbol | Address (EIP-55) | Decimals | Source | Verified |
|---|---|---|---|---|
| USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | 6 | https://developers.circle.com/stablecoins/usdc-contract-addresses | 2026-10-21, via web-search snippet of the official page only; direct page fetch was blocked by the sandbox proxy. Re-check before release. |
| EURC | `0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4` | 6 | https://developers.circle.com/stablecoins/eurc-contract-addresses | 2026-10-21, via web-search snippet of the official page only; direct page fetch was blocked by the sandbox proxy. Re-check before release. |

## Not allowlisted (unverified, intentionally omitted)

All mainnet tokens; USDT, DAI, PYUSD, FDUSD, USDe, WETH/wrapped native, WBTC. Addresses must come from the issuer docs (Tether, Sky, PayPal/Paxos, First Digital, Ethena, canonical bridge docs) fetched directly. Mainnet USDC figures seen only in unverified secondary text are NOT used.

## Price feeds

Testnet only, from saved Chainlink reference data (`docs/chains/SOURCES-2026-11-04.md`, retrieved 2026-11-04). Proxy addresses; feed `decimals` 8 (not display `decimalPlaces`).

| chainId | Pair | Proxy (EIP-55) | Heartbeat |
|---|---|---|---|
| 11155111 | ETH/USD | `0x694AA1769357215DE4FAC081bf1f309aDC325306` | 3600 s |
| 11155111 | USDC/USD | `0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E` | 86400 s |

Heartbeat is source metadata, not a freshness guarantee: `readPrice` still requires an explicit `maxAgeSeconds`, and runtime `decimals()` / `latestRoundData()` are still checked. Mainnets have no feed; fiat pricing stays disabled there. Not verified here: on-chain proxy code, live rounds.

## Parameters

`finalityDepth`, `getLogsMaxRange`, `blockTimeMs` are conservative defaults, not provider-verified.
