# security-btcapps (haiku, static read, unverified)

Counts: Critical 0, High 0, Medium 3, Low 4, Info 2. I did not write `docs/remote/audits/security-btcapps.md`, because the environment rules bar report .md files. Findings are below. Nothing was run; this is static reading only.

**Medium**
1. **M1, relayer lane DoS.** `apps/relayer/src/service.ts:285` admits the job to the lane, and `:342` runs `simulateSweep` inside it. Signed sweeps from fresh owner keys hold the single lane for simulation time, so `queue_full` hits all users. Cost is one quote plus one sweep per attempt, both IP-limited (`server.ts:243`), so Sybil IPs scale it. Fix: cheap pre-lane balance/allowance check, or a per-chain sweep rate limit.
2. **M2, fee recipient not pinned in web.** `apps/web/src/lib/sweep.ts:84` and `relayerClient.ts:84` accept any relayer-supplied `feeTo` (only owner/destination excluded). `sweep.ts:116` signs it. `packages/contracts/src/GhostPaySweepRelayer.sol:123-133` pays `s.feeTo` without a fixed recipient. A hostile relayer can route up to the 300 bps cap to any address. Fix: require `quote.feeTo === manifest.feeRecipient` or the relayer's `/v1/info` value.
3. **M3, oracle metadata trusted.** `packages/btc-silent-payments/src/scan/scanner.ts:66-75` attaches oracle `txid`, `vout` and `amountSats` (`scan/blindbit.ts:185-192`) to found outputs, which `spend.ts:271-282` uses. No theft: the sighash commits to amounts. But wallet balances and spend decisions can be wrong. Fix: cross-check against a second source before display or spend.

**Low**
4. **L1, unbounded oracle response.** `scan/blindbit.ts:117-118` calls `res.json()` with no size cap; `:167`/`:184` check entry count only after parsing. No default timeout when `signal` is absent. Fix: cap bytes and add a default timeout.
5. **L2, plain-http oracle allowed.** `blindbit.ts:99-100` accepts `http:` for any host, leaking scanned heights. The relayer restricts RPC http to loopback (`config.ts`). Fix: https unless loopback.
6. **L3, weak fee cap.** `spend.ts:237` (`fee*2n > total && fee > 10_000n`) allows a fee of up to 50% of value when fee is 10,000 sat or less. Example: 1-in/1-out at 10,000 sat/vB, total 2,240,000 sat, fee 1,120,000 sat, passes. Caller-supplied feeRate, so low. Fix: absolute cap plus about 10% ratio.
7. **L4, relayer gas staleness.** Quote fee uses `eth_gasPrice` at quote time (`service.ts:188-198`). The sweep runs up to TTL later and only re-checks the cap (`:312`), not that the fee still covers gas. The relayer underwrites the gap, up to `maxGasPriceWei`. Fix: re-check the fee at send time.

**Info**
8. `spend.ts:91`: `Math.round(feeRate*1000)` gives zero fee for feeRate below 0.0005.
9. `secret.ts:28`: `Symbol.species` returns plain `Uint8Array`, so `slice`/`subarray` on a secret yields an unredacted copy. Not hit in production paths I read.

**Checked, no finding:** btc-silent-payments key handling and zeroization, BIP-352 derivation, Schnorr self-verification, relayer quote HMAC and log allowlist, keystore AEAD. `apps/relayer` and `apps/web` contain no btc-silent-payments imports.

**Not verified:** test suites, PoCs, and noble/scure internals; the contract's Sweep typed-data hashing; BIP-352 conformance beyond the existing vectors. Prior audit 03 already covers S3-01 (manifest root of trust), keystore scrypt cost, and trustProxyHops, so I did not repeat them.
