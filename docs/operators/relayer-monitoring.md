# Relayer monitoring

Metrics listener is off unless `METRICS_ENABLED=1`. It binds to `127.0.0.1:9464` by default. Set `METRICS_BIND` to an IP address and `METRICS_PORT` to a port only when a private scrape path requires it. Binding to a non-loopback address exposes these routes to every network peer that can reach the listener; optional bearer authentication does not encrypt HTTP. Keep this listener behind a private network boundary and TLS-terminating proxy when accessed remotely. Set `METRICS_TOKEN` to a 32–256 character token to require bearer authentication.

Scrape `GET /metrics` for Prometheus text. Read `GET /v1/stats` for JSON schema version 1: `{schemaVersion, counters, gauges}`. `counters` maps metric names to totals aggregated across labels. `gauges` contains `{name, labels, value}` samples. Both routes share the metrics listener. Neither route exists on the payment API listener. Metrics aggregate counters and expose only fixed chain, reason, and state gauge labels. They contain no owner, destination, token amount, IP, or transaction hash.

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

The current relayer emits these event names. `rpc_disagree` and `price_stale` remain unavailable: the current runtime has one provider per chain and operator-configured fixed native prices without freshness timestamps. Integrating independently verified providers and feed evidence is a prerequisite; no detector claims those facts from existing inputs.

Log output drops transaction hashes as well as addresses, signatures, IPs, and arbitrary request fields. Recovery continues to use the protected transaction journal; observability must not become a payment index.
