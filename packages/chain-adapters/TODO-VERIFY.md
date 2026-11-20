# TODO-VERIFY

Verification follow-ups for the configured chain adapters, checked against main
`8f56376427c96881f49590920ff0bf8543ec81b4` on 2026-11-19. Source-backed configuration and
live deployment/provider qualification are separate. The dated retrieval attempt below
is retained as historical evidence; current token and feed inventories follow.

## Token addresses (`src/config/tokens.ts`)

`src/config/tokens.ts` contains nine testnet entries: USDC on Ethereum Sepolia, Base Sepolia,
OP Sepolia, Arbitrum Sepolia, Polygon Amoy and Avalanche Fuji; EURC on Ethereum Sepolia,
Base Sepolia and Avalanche Fuji. All nine entries use six decimals. Recorded issuer-owned
source evidence is in `docs/chains/SOURCES-2026-10-25.md` (token section). `permit: true`
is supported by the FiatToken contract design; the implementation version behind each
deployed proxy and its EIP-712 domain still require runtime verification. No mainnet token is listed.

NOT listed, to be verified from official issuer documentation:

- USDC native: Ethereum, Base, OP Mainnet, Arbitrum One, Polygon PoS, Avalanche C-Chain, BNB Smart Chain (and
  whether Circle issues native USDC on BNB at all).
- USDT (Tether): every chain, including decimals (6 vs 18 on BNB) and the absence of ERC-2612 (`permit: false`).
- DAI (MakerDAO/Sky): every chain; DAI-style permit is unsupported by the sweep relayer, so `permit: false`.
- WETH / wrapped native (WPOL, WBNB, WAVAX): every chain.
- Testnet USDT/DAI/WETH on Sepolia and Base Sepolia.

## Historical retrieval attempt — 2026-10-21 (G-03)

This paragraph records the configuration and network limitation at that time. Its two-token
and empty-feed statements are superseded by the current inventories above and below.

Tried to verify Sepolia and Base Sepolia USDC and Chainlink feed addresses from official sources. `docs.chain.link`, `developers.circle.com` and
`reference-data-directory.vercel.app` are blocked by the sandbox proxy (HTTP 403 on CONNECT; WebFetch: host not resolvable). `raw.githubusercontent.com` is reachable and
the official `smartcontractkit/documentation` repo was read (`src/content/data-feeds/getting-started.mdx`, `using-data-feeds.mdx`), but it only mentions the Sepolia BTC / USD
proxy (`0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43`) in prose; the ETH / USD and USDC / USD feeds the app needs are not in any reachable official file. Nothing was
added to `FEEDS`. The two USDC addresses in `tokens.ts` stay as listed above (taken earlier from search snippets of Circle's page, still to be re-checked). Because `FEEDS`
is empty the web app does not offer "Fiat price" on any chain (`hasFeedsForChain`).

## Chainlink feeds (`src/quote.ts`)

`FEEDS` contains four testnet entries: ETH/USD and USDC/USD on Ethereum Sepolia and Base Sepolia.
Proxy addresses, decimals and heartbeat metadata are recorded in the superseding saved-primary-evidence
section of `docs/chains/SOURCES-2026-11-04.md`; that section also records saved source hashes.
Mainnet feeds and other pairs remain absent. Saved evidence does not verify deployed proxy bytecode,
on-chain `decimals()` or live `latestRoundData()`. Heartbeat metadata does not prove freshness or
replace the explicit `maxAgeSeconds` check applied by `readPrice` callers.

## Chain parameters (`src/config/chains.ts`)

`finalityDepth`, `getLogsMaxRange` (1000 in every configured CHAINS entry) and `blockTimeMs` are conservative engineering defaults, not
provider-verified numbers. Public RPC providers differ widely in `eth_getLogs` limits; measure against the chosen
providers. BNB and Arbitrum block times have changed over time; re-check.

## Not verified

- Independently authenticated per-chain runtime-code hashes for the canonical ERC-5564 announcer
  (`0x55649E01B5Df198D18D95b5cc5051630cfD45564`) and ERC-6538 registry
  (`0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538`) remain unverified. The announcer check requires
  the canonical address and nonempty code; registry checks require code and, in `verifyRegistry`,
  the expected entry-type-hash response. Neither pins those contracts' runtime hashes. This is
  separate from `verifyDeployment`: Router and SweepRelayer hashes (plus the configured policy
  factory) must match the supplied manifest, and router fee/recipient/announcer readback must agree.
  Manifest authenticity and live provider/deployment qualification remain separate requirements.
- This checklist does not establish current public-network or provider qualification.
  `router.anvil.test.ts` exercises the compiled router on a local Anvil chain; that evidence
  does not qualify a public deployment.
