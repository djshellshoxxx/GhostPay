# Chain enablement checklist

**Do not flip `enabled: true` for a chain** in `packages/chain-adapters/src/config/chains.ts`, add it to a relayer config, set `ALLOW_MAINNET=1`, or ship a manifest for it until every item below is done and recorded in the pull request. Today only Ethereum Sepolia (11155111) and Base Sepolia (84532) are enabled, as testnets, with **no** deployed contracts. Mainnets are listed with `enabled: false`. Policy: [ADR-0011](../adr/ADR-LOG.md). Basis: MULTICHAIN_SPEC section 2, audit 01 G-24.

The chain parameters in code (`finalityDepth`, `getLogsMaxRange` = 1000, `blockTimeMs`) are conservative engineering defaults, **not provider-verified** (`packages/chain-adapters/TODO-VERIFY.md`).

## A. Network facts (verify from primary sources, record links and dates)

- [ ] EIP-155 chain id, name, native symbol, block time and finality model from the network's own documentation (re-check; BNB and Arbitrum timings have changed).
- [ ] `finalityDepth` chosen with the network's reorg/finality properties in mind (L2 finality includes L1 settlement; document what "final" means for sellers).
- [ ] `getLogsMaxRange` measured against at least two intended RPC providers.
- [ ] EIP-1559 behaviour and gas model understood (L2 data fees affect the relayer's `gasUnits` and the gas-buffer maths).
- [ ] The chain supports the EVM version the contracts target (`cancun`, see `foundry.toml`); confirm with a deployment and the test flow on that chain's testnet, not by assumption.
- [ ] Public ERC-5564 announcer present at the canonical address with the expected runtime code hash (or deployed with the ERC's deterministic salt and verified). Record the hash.
- [ ] If the ERC-6538 registry is used: canonical registry code present.

## B. Contracts

- [ ] Independent audit of the exact commit completed and findings resolved or accepted in writing (mainnets only; this has not happened).
- [ ] Router and sweep relayer deployed from the audited commit ([deployment runbook](deployment-runbook.md)); sources verified; immutables read back.
- [ ] Fee recipient meets the runbook requirements, including **can receive ETH** on this chain and is not blacklisted.
- [ ] Manifest reviewed, authenticated and compiled into the release ([DEPLOYMENT_MANIFEST.md](../DEPLOYMENT_MANIFEST.md)); read-back verification passes against two independent RPC providers.
- [ ] Testnet or fork smoke test of pay, scan, sweep (relayed and direct) recorded with hashes.

## C. Tokens (allowlist in `packages/chain-adapters/src/config/tokens.ts`)

Only addresses verified against the issuer's official documentation may be listed. Today only Sepolia and Base Sepolia USDC are listed, and even those came from search snippets (`TODO-VERIFY.md`: re-check against the issuer page before release). For each token:

- [ ] Address from the issuer's official page, checksummed; compared with the on-chain `symbol()`, `decimals()`.
- [ ] Not fee-on-transfer, rebasing, ERC-777-like or upgradeable-with-hook behaviour that the router rejects; test the real token against the router on a fork.
- [ ] Blacklist/pause capability noted (USDC/USDT): the effect on the fee recipient and the stealth addresses is documented (audit D5).
- [ ] `permit` support: ERC-2612 yes/no (DAI-style permit is unsupported; USDT has none). Domain separator read from the token at runtime.
- [ ] Relayer: token is a USD stable (`usdStable`), since the relayer prices fees with the token fixed at 1.0.

## D. Quotes and oracles (ADR-0012)

Fiat-priced invoices stay disabled on a chain until:

- [ ] Chainlink feed addresses (for example ETH/USD, USDC/USD) taken from docs.chain.link for that chain, with decimals and heartbeat; `maxAgeSeconds` chosen from the heartbeat; entries added to `FEEDS` (empty today).
- [ ] Staleness, zero/negative, round-integrity and decimals checks exercised against the real feed on a fork or testnet.
- [ ] A sequencer-uptime check for L2s is designed (not built).

## E. Relayer

- [ ] Operator numbers measured on this chain: `gasUnits` for `sweep` and `sweepWithPermit`, caps, daily budget, `nativeUsdPrice`.
- [ ] Hot key funded, `minBalanceWei` set, alerts wired ([relayer runbook](relayer-runbook.md)).
- [ ] Manifest present in `DEPLOYMENTS_DIR`; `ALLOW_MAINNET=1` only for non-testnets and only after items B.

## F. Client and operations

- [ ] Chain config changed in a reviewed pull request that links the evidence for A-E.
- [ ] Tests updated (chain config, token, manifest fixtures); `npm test` and `npm run build` pass; bundle scan passes.
- [ ] Release notes and the supported-chain matrix updated; user docs ([fees](../user/fees.md), troubleshooting) mention the chain.
- [ ] Rollback: how to disable the chain again in the next release (remove the manifest or set `enabled: false`); remember old builds keep working with the old manifest.
- [ ] Legal/compliance position for that jurisdiction considered (owner action).

## Chains currently listed (all disabled except the two testnets)

Ethereum 1, Base 8453, OP Mainnet 10, Arbitrum One 42161, Polygon PoS 137, BNB Smart Chain 56, Avalanche C-Chain 43114 (mainnets, `enabled: false`); Ethereum Sepolia 11155111 and Base Sepolia 84532 (testnets, `enabled: true`). Gnosis is mentioned in MULTICHAIN_SPEC but is not in the code.
