# Chain reference data (retrieved 2026-10-21)

## Status: NOT VERIFIED. All rows `unverified`, values null.

Research worker could reach only raw.githubusercontent.com. Primary hosts returned proxy 403 / DNS failure:
docs.chain.link, developers.circle.com, tether.to, data.chain.link, etherscan.io, api.github.com, reference-data-directory.vercel.app.
Chainlink docs repo tables are generated at build time from that blocked directory, so raw repo gave no feed addresses.
No values were filled from memory.

## Only confirmed facts
- Circle FiatToken (circlefin/stablecoin-evm README, https://raw.githubusercontent.com/circlefin/stablecoin-evm/master/README.md): contract is pausable (`pauser`) and has blacklist (`blacklister`). Applies to code, not proven for any specific chain deployment.
- Chainlink docs repo example uses Sepolia BTC/USD proxy 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43 (not a requested pair; unused).
- Secondary only (web search, NOT accepted): ETH/USD mainnet proxy 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419, 8 dec, ~3600s, 0.5% dev. Must be confirmed.

## Gaps (everything else)
Per chain (9): USDC/USDT/DAI/WETH address, decimals, permit flavour; feeds ETH(or POL/BNB/AVAX)/USD, USDC/USD, USDT/USD, DAI/USD address, decimals, heartbeat, deviation; finality blocks; native symbol. Chain pair feed names for 137/56/43114 also need confirming (POL vs MATIC).
Counts: verified 0; unverified 36 tokens + 36 feeds + 9 finality + 9 native.

## Owner must verify before enabling any chain
1. Fetch addresses from docs.chain.link/data-feeds/price-feeds/addresses (per network), developers.circle.com USDC addresses, tether.to supported-protocols, Sky/Maker docs.
2. `cast code <addr> --rpc-url $RPC` non-empty for every token and feed.
3. `cast call <tok> "decimals()(uint8)"`, `"symbol()(string)"`, `"name()(string)"`.
4. Permit: `cast call <tok> "DOMAIN_SEPARATOR()(bytes32)"`, `"nonces(address)(uint256)" 0x0`, `"version()(string)"`; check source for `permit(owner,spender,value,deadline,v,r,s)` (ERC-2612) vs DAI `permit(holder,spender,nonce,expiry,allowed,v,r,s)`. USDT mainnet has no permit expected; confirm.
5. Pause/blacklist: `cast call <tok> "paused()(bool)"`, `"isBlacklisted(address)(bool)"` (USDC) / `"isBlackListed(address)(bool)"` (USDT).
6. Feeds: `cast call <feed> "decimals()(uint8)"`, `"description()(string)"`, `"latestRoundData()"` and check updatedAt freshness; heartbeat/deviation from docs table; confirm proxy not aggregator.
7. WETH: `cast call <weth> "symbol()(string)"`; wrapped native per chain (WPOL/WBNB/WAVAX differ).
8. Finality: take from each chain's official docs (L2s: soft vs L1 finality distinct).
