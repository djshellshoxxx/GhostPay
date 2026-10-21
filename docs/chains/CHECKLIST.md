# Per-chain mainnet enablement checklist (G-24, M-01)

Do NOT flip `enabled: true` on a mainnet until every item is done and linked in the PR.

1. Chain id, native symbol, RPC providers (2+ independent), explorer: verified from the chain's official docs; recorded in docs/chains/<chain>.md with URL and date.
2. `finalityDepth`, `getLogsMaxRange`, `blockTimeMs` measured against the chosen providers (not defaults). L2: sequencer-downtime and reorg/finality semantics documented.
3. Token allowlist: each address and decimals verified from the issuer docs fetched directly (not snippets); decimals asserted on-chain by a fork test; blacklist/pause/permit/approve quirks recorded (token-notes.md).
4. Chainlink feeds (if fiat quotes used): address from docs.chain.link, heartbeat, deviation, `maxAgeSeconds` derived from heartbeat, L2 sequencer uptime feed where applicable. Until then `FEEDS` empty and UI fiat option disabled.
5. Contracts deployed from the audited commit; signed deployment manifest verified (deploymentsVerify); testnet smoke test with tx hashes recorded.
6. Fee recipient and owner decisions per FEE_SCHEDULE section 6 resolved.
7. Independent audit findings closed or accepted for this chain.
8. Config tests green (`config.test.ts` invariants: no duplicates, EIP-55, mainnet disabled by default); changelog and ADR updated.
9. Rollback plan: ability to set `enabled: false` and publish a new manifest quickly.
