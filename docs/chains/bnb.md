# BNB Smart Chain

Config: `packages/chain-adapters/src/config/chains.ts`. Researched 2026-10-21.

| Network | chainId | enabled |
|---|---|---|
| BNB Smart Chain Testnet | 97 | true (testnet) |
| BNB Smart Chain | 56 | false (mainnet gate, see CHECKLIST.md) |

## Verified testnet tokens

None. Circle does not list USDC/EURC for this chain in anything verified; no token is allowlisted.

## Not allowlisted (unverified, intentionally omitted)

All mainnet tokens; USDT, DAI, PYUSD, FDUSD, USDe, WETH/wrapped native, WBTC. Addresses must come from the issuer docs (Tether, Sky, PayPal/Paxos, First Digital, Ethena, canonical bridge docs) fetched directly. Mainnet USDC figures seen only in unverified secondary text are NOT used.

## Price feeds

None. Chainlink feed addresses/heartbeats unverified (docs.chain.link unreachable). `FEEDS` stays empty; fiat pricing hard-disabled in the UI.

## Parameters

`finalityDepth`, `getLogsMaxRange`, `blockTimeMs` are conservative defaults, not provider-verified.
