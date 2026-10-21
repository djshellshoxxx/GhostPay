# Deviations and open points (@ghostpay/ops-monitor)

1. **Anvil end-to-end (W1/W2 against real contracts, `BlacklistToken.sol`) was not done.** Only fake RPC fixtures were used. No live network run either.
2. **Context shape:** `ctx.manifests` (array, one per chain) instead of the spec's single `manifest`; probes needing configuration (W2 tokens, W4 snapshot, W5 baseline, W6 depth) are factories. `ctx.release` is optional (W3 warns without it).
3. **`toWebhook` signature** is `(findings, dedupeWindowMs, state, now)`; dedupe needs memory and a clock. Only `warn`/`page` are sent. The relayer's webhook format was not seen, so the payload (`{version, generatedAt, findings}`) is a guess to be aligned.
4. **W1 assumptions:** `bytecodeHashes` is taken to be keccak256 of deployed runtime code (not creation code); `FEE_RECIPIENT()/FEE_BPS()/ANNOUNCER()` are read from the router, the policy factory's `FEE_RECIPIENT()` is compared with the policy fee recipient. Sweep relayer getters are not checked.
5. **W2** cannot distinguish "token lacks `isBlacklisted`/`paused`" from a failed call once the endpoint answered `eth_blockNumber`; it treats both as not exposed.
6. **W3** reads whole responses then enforces the size cap (the cap does not bound memory). Redirects are errors. `SHA256SUMS` must come from the signed release, not the mirror.
7. **W6** subject is the configured announcer (RpcClient has no printable identity; URLs may hold keys). Findings do not say which provider lied.
8. **W5** uses `eth_getLogs` over a block window (limited to 5000 blocks); the baseline is operator-supplied and untuned. Scheme ids default to 0x47500001 and 0x47500002.
9. Prometheus format retrieved from the spec's reference only by name; not re-fetched in this session. Runbook "Incident response" links per finding id were not written (outside scope).
