# Relayer monitoring

Metrics listener is off unless `METRICS_ENABLED=1`. It binds to `127.0.0.1:9464` by default. Set `METRICS_BIND` to an IP address and `METRICS_PORT` to a port only when a private scrape path requires it. Binding to a non-loopback address exposes these routes to every network peer that can reach the listener; optional bearer authentication does not encrypt HTTP. Keep this listener behind a private network boundary and TLS-terminating proxy when accessed remotely. Set `METRICS_TOKEN` to a 32–256 character token to require bearer authentication.

Scrape `GET /metrics` for Prometheus text. Read `GET /v1/stats` for JSON schema version 1: `{schemaVersion, counters, integerCounters, integerSamples, gauges, histograms}`. `counters` maps metric names to totals aggregated across labels. `gauges` contains `{name, labels, value}` samples. Both routes share the metrics listener. Neither route exists on the payment API listener. Metrics aggregate counters and expose only fixed chain, reason, and state gauge labels. They contain no owner, destination, token amount, IP, or transaction hash.

## Alert configuration

Set `ALERT_WEBHOOK_URL` to an HTTPS endpoint. Set `ALERT_WEBHOOK_ALLOWED_HOSTS` to comma-separated exact DNS hostnames, including the URL host. Set `ALERT_WEBHOOK_SECRET` to a random secret of 32–256 characters. The relayer signs the exact JSON request body with HMAC-SHA256 and sends `X-GP-Signature: sha256=<hex>`. Receivers must verify that signature before processing the payload.

Alert deliveries deduplicate by event and chain for 15 minutes. Each attempt has an absolute 3-second deadline covering DNS, connection establishment, TLS, and response headers. Response bodies are discarded by closing the connection. A transient network failure, HTTP 429, or HTTP 5xx gets one retry after 250 ms using identical signed bytes and `Idempotency-Key`. Receivers should deduplicate that key and reject stale timestamps. Permanent failures and redirects are not retried. Delivery is best-effort: at most four attempts run concurrently and 32 events wait in memory; overflow logs a fixed `capacity` class. Shutdown cancels active and queued deliveries. The 15-minute event dedupe applies even after failed delivery; queues and dedupe do not survive a restart. Redirects are disabled. DNS answers are checked at connection time and private, loopback, link-local, reserved, or malformed addresses are rejected. Delivery failures log only a fixed error class.

## Response steps

| Signal | Threshold source | Operator response |
| --- | --- | --- |
| `low_balance` | Chain `minBalanceWei` configuration | Check wallet balance and funding path. Confirm expected chain and wallet before funding. |
| `breaker_open` | Chain breaker `minSamples`, `failureRatio`, and `cooldownSeconds` | Inspect RPC health, revert and timeout counters, then restore dependencies before waiting for breaker recovery. |
| `daily_budget_exhausted` | Chain `dailyBudgetWei` configuration | Review sweep volume and budget sizing. Wait for the daily window or adjust approved limits. |
| `loss_budget_exhausted` | `lossBudget.globalWei` / `lossBudget.perKeyWei` | Review reverted and griefed sweeps. Keep chain admission closed until losses are understood. |
| `reject_spike` | More than 100 rejected quote/sweep requests in the trailing five minutes | Inspect aggregate rejection reasons and client compatibility. The alert records only threshold crossings, not identities. Invalid or unconfigured chains share one anonymous bucket. |
| `quote_budget_exhausted` | Global quote request rate limit | Check quote traffic and client retry behavior. Adjust limits only after confirming capacity. |
| `receipt_timeout` / `mined_revert` | Queue receipt timeout and chain receipts | Check RPC and chain inclusion state. Reconcile unsettled sends before restarting or resubmitting. |
| `rpc_disagree` | Actual mismatch between configured providers at the same finalized height | Inspect both providers and the chain. Requests fail closed before reservation; do not treat a timeout as proof of a fork. |
| `price_stale` | Configured native/USD feed timestamp exceeds its allowed lifetime | Check feed status and configured maximum age. Feed mode never falls back to fixed pricing. |

The last two signals require explicit source configuration: a distinct `secondaryRpcUrl`/`secondaryRpcUrlEnv`, or
`nativeUsdFeed: { "maxAgeSeconds": 300 }` instead of `nativeUsdPrice`. No new endpoint or feed is selected by default.
The feed address comes from the existing chain-adapters native/USD registry, with runtime round/decimal checks;
missing registry data refuses startup. Distinct URLs do not prove provider independence. The RPC check covers a
common finalized header's number/hash/parent/timestamp, not every contract-state answer. An unavailable source or
tip lag greater than chain finality depth returns `rpc_unavailable` without inventing a disagreement alert.

Log output drops transaction hashes as well as addresses, signatures, IPs, and arbitrary request fields. Recovery continues to use the protected transaction journal; observability must not become a payment index.

## Accounting and latency metrics

- `relayer_quotes_total{chain_id}` counts supported-chain/token quote attempts after resolution, including requests later rejected by pricing or order checks.
- `relayer_gas_spent_wei_total{chain_id}` sums confirmed receipt gas multiplied by the signed legacy gas price. Timeouts and unknown submissions do not spend this metric; later receipt evidence contributes once. This measures the transaction gas component supported by the current receipt model, not additional chain-specific fees absent from that model.
- `relayer_loss_wei_total{chain_id}` counts that gas component for mined reverts. A refusal or timeout is not evidence of loss.
- `relayer_fee_earned_usd_micro_total{chain_id}` counts confirmed successful sweep fees at the configured stablecoins' nominal USD parity. Conversion uses bigint and carries fractions below one micro-USD across sweeps and token decimal scales. It is not an oracle valuation. Restart recovery intentionally lacks token/fee details; `relayer_fee_unknown_total{chain_id}` counts those successes without inventing revenue.
- `/v1/stats` retains numeric aggregate `counters` and adds decimal-string `integerCounters`, plus `integerSamples` with chain labels. Use per-chain samples when native assets differ; adding unlike native units is not a monetary total. Raw Prometheus text emits exact integers, but a downstream Prometheus float64 store can round large values. Exact accounting belongs in the journal, not metrics. Counters and fractional carry reset on process restart.
- `relayer_sweep_latency_seconds{chain_id}` observes admitted in-lane work through the initial receipt result or failure, excluding queue time and any later recovery. `relayer_rpc_latency_seconds{chain_id}` measures actual viem HTTP fetch attempts through response headers, including failed attempts. It excludes body parsing, startup manifest probes, and injected fake clients. No URL, method, or request body becomes a label.
- Histograms use fixed seconds buckets `0.01, 0.1, 0.5, 1, 5, 15, 60, 300, +Inf` and at most 64 series. Ordinary and exact integer counters each allow at most 512 series. `/v1/stats` exposes histogram bucket counts, sample counts, and sums.

`LOG_LEVEL` accepts `info`, `warn`, or `error`; default is `info`. Lower-severity events are omitted before writing JSON. Unsupported values stop startup with a fixed message.

`relayer_price_age_seconds{chain_id}` reports the age of the last observed configured feed timestamp, including its
continued aging after the read. It has no sample for legacy fixed prices or a feed not yet read. It does not imply
that the last price is still valid. `relayer_price_stale_total`, `relayer_rpc_disagreements_total` and
`relayer_rpc_agreement_checks_total` count actual observed outcomes. All labels contain configured chain ids only.
No complete price is cached after a request. RPC and price checks share concurrent in-flight reads per chain, then
discard the result. An absent sample is not a zero-age or provider-agreement claim.
