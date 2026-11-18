# Base

Config: `packages/chain-adapters/src/config/chains.ts`. Researched 2026-10-21.

| Network | chainId | enabled |
|---|---|---|
| Base Sepolia | 84532 | true (testnet) |
| Base | 8453 | false (mainnet gate, see CHECKLIST.md) |

## Verified testnet tokens

| Symbol | Address (EIP-55) | Decimals | Source | Verified |
|---|---|---|---|---|
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | 6 | https://developers.circle.com/stablecoins/usdc-contract-addresses | 2026-10-21, via web-search snippet of the official page only; direct page fetch was blocked by the sandbox proxy. Re-check before release. |
| EURC | `0x808456652fdb597867f38412077A9182bf77359F` | 6 | https://developers.circle.com/stablecoins/eurc-contract-addresses | 2026-10-21, via web-search snippet of the official page only; direct page fetch was blocked by the sandbox proxy. Re-check before release. |

## Not allowlisted (unverified, intentionally omitted)

All mainnet tokens; USDT, DAI, PYUSD, FDUSD, USDe, WETH/wrapped native, WBTC. Addresses must come from the issuer docs (Tether, Sky, PayPal/Paxos, First Digital, Ethena, canonical bridge docs) fetched directly. Mainnet USDC figures seen only in unverified secondary text are NOT used.

## Price feeds

Testnet only, from saved Chainlink reference data (`docs/chains/SOURCES-2026-11-04.md`, retrieved 2026-11-04). Proxy addresses; feed `decimals` 8 (not display `decimalPlaces`).

| chainId | Pair | Proxy (EIP-55) | Heartbeat |
|---|---|---|---|
| 84532 | ETH/USD | `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` | 1200 s |
| 84532 | USDC/USD | `0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165` | 86400 s |

Heartbeat is source metadata, not a freshness guarantee: `readPrice` still requires an explicit `maxAgeSeconds`, and runtime `decimals()` / `latestRoundData()` are still checked. Mainnets have no feed; fiat pricing stays disabled there. Not verified here: on-chain proxy code, live rounds.

## Parameters

`finalityDepth`, `getLogsMaxRange`, `blockTimeMs` are conservative defaults, not provider-verified.
