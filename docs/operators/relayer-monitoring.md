# Relayer monitoring

Metrics listener is off unless `METRICS_ENABLED=1`. It binds to `127.0.0.1:9464` by default. Set `METRICS_BIND` to an IP address and `METRICS_PORT` to a port only when a private scrape path requires it. Keep this listener behind a private network boundary. Set `METRICS_TOKEN` to a 32–256 character token to require bearer authentication.

Scrape `GET /metrics` for Prometheus text. Read `GET /v1/stats` for JSON schema version 1: `{schemaVersion, counters, gauges}`. `counters` maps metric names to totals aggregated across labels. `gauges` contains `{name, labels, value}` samples. Both routes share the metrics listener. Neither route exists on the payment API listener. Metrics aggregate counters and expose only fixed chain, reason, and state gauge labels. They contain no owner, destination, token amount, IP, or transaction hash.

## Alert configuration

Set `ALERT_WEBHOOK_URL` to an HTTPS endpoint. Set `ALERT_WEBHOOK_ALLOWED_HOSTS` to comma-separated exact DNS hostnames, including the URL host. Set `ALERT_WEBHOOK_SECRET` to a random secret of 32–256 characters. The relayer signs the exact JSON request body with HMAC-SHA256 and sends `X-GP-Signature: sha256=<hex>`. Receivers must verify that signature before processing the payload.

Alert deliveries deduplicate by event and chain for 15 minutes. Requests time out after 3 seconds. Redirects are disabled. DNS answers are checked at connection time and private, loopback, link-local, reserved, or malformed addresses are rejected. Delivery failures log only a fixed error class.

## Response steps

| Signal | Threshold source | Operator response |
| --- | --- | --- |
| `low_balance` | Chain `minBalanceWei` configuration | Check wallet balance and funding path. Confirm expected chain and wallet before funding. |
| `breaker_open` | Chain breaker `minSamples`, `failureRatio`, and `cooldownSeconds` | Inspect RPC health, revert and timeout counters, then restore dependencies before waiting for breaker recovery. |
| `daily_budget_exhausted` | Chain `dailyBudgetWei` configuration | Review sweep volume and budget sizing. Wait for the daily window or adjust approved limits. |
| `loss_budget_exhausted` | `lossBudget.globalWei` / `lossBudget.perKeyWei` | Review reverted and griefed sweeps. Keep chain admission closed until losses are understood. |
| `quote_budget_exhausted` | Global quote request rate limit | Check quote traffic and client retry behavior. Adjust limits only after confirming capacity. |
| `receipt_timeout` / `mined_revert` | Queue receipt timeout and chain receipts | Check RPC and chain inclusion state. Reconcile unsettled sends before restarting or resubmitting. |

The current relayer emits these event names. `reject_spike`, `rpc_disagree`, and `price_stale` need corresponding detectors before operators can receive those alerts.
