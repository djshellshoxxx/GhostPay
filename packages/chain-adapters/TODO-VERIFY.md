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

## Chainlink feeds (`src/quote.ts`, `FEEDS` is empty)

No feed address was verified against docs.chain.link. Needed before quotes can be used on a chain:
ETH/USD, USDC/USD, USDT/USD, DAI/USD (plus POL/USD, BNB/USD, AVAX/USD) per enabled chain, with each feed's
heartbeat to choose `maxAgeSeconds`.

## Chain parameters (`src/config/chains.ts`)

`finalityDepth`, `getLogsMaxRange` (1000 everywhere) and `blockTimeMs` are conservative engineering defaults, not
provider-verified numbers. Public RPC providers differ widely in `eth_getLogs` limits; measure against the chosen
providers. BNB and Arbitrum block times have changed over time; re-check.

## Not measured

No test touched a real network, a real RPC provider, or the compiled contracts' EVM behaviour. Router fee parity
is checked via shared boundary vectors and the Solidity source (regex), not by executing the contract.
