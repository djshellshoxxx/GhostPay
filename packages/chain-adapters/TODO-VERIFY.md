# TODO-VERIFY

Items that could NOT be verified in this environment (outbound access to issuer documentation was
blocked: `developers.circle.com` was unreachable through the proxy; only web-search snippets were
available). Nothing below was guessed; unverified entries are simply absent from the code.

## Token addresses (`src/config/tokens.ts`)

Listed (seen as addresses in search-result snippets of Circle's official USDC contract page; re-check against
the page before any release): Ethereum Sepolia USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, Base Sepolia
USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals, `permit: true` because Circle FiatToken v2.x
implements ERC-2612; the EIP-712 domain version must still be read from the token at runtime).

NOT listed, to be verified from official issuer documentation:

- USDC native: Ethereum, Base, OP Mainnet, Arbitrum One, Polygon PoS, Avalanche C-Chain, BNB Smart Chain (and
  whether Circle issues native USDC on BNB at all).
- USDT (Tether): every chain, including decimals (6 vs 18 on BNB) and the absence of ERC-2612 (`permit: false`).
- DAI (MakerDAO/Sky): every chain; DAI-style permit is unsupported by the sweep relayer, so `permit: false`.
- WETH / wrapped native (WPOL, WBNB, WAVAX): every chain.
- Testnet USDT/DAI/WETH on Sepolia and Base Sepolia.

## Retrieval attempt 2026-10-21 (G-03)

Tried to verify Sepolia and Base Sepolia USDC and Chainlink feed addresses from official sources. `docs.chain.link`, `developers.circle.com` and
`reference-data-directory.vercel.app` are blocked by the sandbox proxy (HTTP 403 on CONNECT; WebFetch: host not resolvable). `raw.githubusercontent.com` is reachable and
the official `smartcontractkit/documentation` repo was read (`src/content/data-feeds/getting-started.mdx`, `using-data-feeds.mdx`), but it only mentions the Sepolia BTC / USD
proxy (`0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43`) in prose; the ETH / USD and USDC / USD feeds the app needs are not in any reachable official file. Nothing was
added to `FEEDS`. The two USDC addresses in `tokens.ts` stay as listed above (taken earlier from search snippets of Circle's page, still to be re-checked). Because `FEEDS`
is empty the web app does not offer "Fiat price" on any chain (`hasFeedsForChain`).

## Chainlink feeds (`src/quote.ts`, `FEEDS` is empty)

No feed address was verified against docs.chain.link. Needed before quotes can be used on a chain:
ETH/USD, USDC/USD, USDT/USD, DAI/USD (plus POL/USD, BNB/USD, AVAX/USD) per enabled chain, with each feed's
heartbeat to choose `maxAgeSeconds`.

## Chain parameters (`src/config/chains.ts`)

`finalityDepth`, `getLogsMaxRange` (1000 everywhere) and `blockTimeMs` are conservative engineering defaults, not
provider-verified numbers. Public RPC providers differ widely in `eth_getLogs` limits; measure against the chosen
providers. BNB and Arbitrum block times have changed over time; re-check.

## Not verified

- Runtime code hashes of the canonical ERC-5564 announcer (`0x55649E01B5Df198D18D95b5cc5051630cfD45564`) and ERC-6538 registry
  (`0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538`) on each chain: addresses come from `docs/CONTRACTS_SPEC.md`; the code only checks that code exists (and, for the registry,
  a behavioural probe). Pin hashes only after reading them from the canonical deployments on each chain.
- No test touched a real network or a real RPC provider. Router fee parity is now executed against the compiled contract on a local `anvil` (`router.anvil.test.ts`), which
  is evidence about the arithmetic only, not about any deployed contract.
