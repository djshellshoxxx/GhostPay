# Configured values and remaining verification

The current EVM registry contains 14 chains, nine token entries and four price
feeds. Source references for configured values and evidence from live deployments
are tracked separately in [`config/matrix.json`](config/matrix.json) and the
[operator matrix guide](../../docs/operators/chain-matrix.md).

After building the libraries, `node scripts/check-chain-matrix.mjs` checks exact
configuration parity and evidence structure. The additional `--release` gate
requires every required cell on enabled chains to be verified. Passing the
configuration check does not establish release readiness or current chain state.

## Configured tokens

[`src/config/tokens.ts`](src/config/tokens.ts) contains these testnet entries:

| Token | Configured chains |
| --- | --- |
| USDC | Ethereum Sepolia, Base Sepolia, OP Sepolia, Arbitrum Sepolia, Polygon Amoy, Avalanche Fuji |
| EURC | Ethereum Sepolia, Base Sepolia, Avalanche Fuji |

The address and six-decimal references are recorded in
[`SOURCES-2026-10-25.md`](../../docs/chains/SOURCES-2026-10-25.md) and the per-row
source comments. The configured permit and blacklist flags do not prove the
behavior of each deployed proxy. Per-deployment implementation, permit/domain,
blacklist and EIP-3009 acceptance remain separate matrix cells.

No mainnet token is configured. Additional USDT, DAI, wrapped-native and other
token entries require issuer evidence and the applicable deployment checks before
being added. DAI-style permit is not supported by the sweep relayer.

## Configured Chainlink feeds

[`src/quote.ts`](src/quote.ts) contains four feeds, with saved reference-data
provenance in [`SOURCES-2026-11-04.md`](../../docs/chains/SOURCES-2026-11-04.md):

| Chain | Feed |
| --- | --- |
| Ethereum Sepolia | ETH / USD |
| Ethereum Sepolia | USDC / USD |
| Base Sepolia | ETH / USD |
| Base Sepolia | USDC / USD |

The registry records proxy address, decimals and heartbeat metadata. A saved
heartbeat does not establish that a feed is currently updating. Runtime price
reads still require an explicit `maxAgeSeconds` and reject invalid, stale or
future answers; live feed acceptance is recorded separately in the matrix.
Other feeds and all mainnet feeds remain absent, so an unavailable quote fails
closed.

The 2026-10-21 retrieval attempt initially left `FEEDS` empty because the needed
primary sources were unreachable. That historical state was superseded by the
2026-11-04 source record and the current four-entry registry.

## Chain parameters and deployment boundaries

[`src/config/chains.ts`](src/config/chains.ts) enables seven testnets and keeps
seven mainnets disabled. Its finality, log-range and block-time values are
engineering defaults; provider and chain qualification remains outstanding.

The deployment driver's built-in network list follows
[`DeployBase.s.sol`](../contracts/script/DeployBase.s.sol), which has a different
scope from the client registry. See the
[testnet runbook](../../docs/operators/testnet-runbook.md) for the exact sets and
the existing explicit `ALLOWED_CHAIN_IDS` mechanism. A configured client chain
does not authorize a deployment or supply a signed manifest.

## Remaining live acceptance

- Independently read and pin canonical ERC-5564 announcer and ERC-6538 registry
  runtime hashes on each chain. The current address candidates and registry
  behavioral probe do not supply those pins.
- Qualify the chosen providers' finality and log-range behavior.
- Complete the per-token and per-feed acceptance cells described above.
- Supply signed deployment manifests and independent readback evidence tied to
  their exact bytes. Local Anvil tests establish behavior on a local EVM; they
  do not qualify any public deployment.

The [operator matrix guide](../../docs/operators/chain-matrix.md) describes the
release check and the evidence required to complete each cell. This documentation
refresh did not contact a public RPC, re-fetch the older issuer/feed records, or
change any verification status in the matrix.
