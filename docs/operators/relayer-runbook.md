# Relayer runbook

Audience: someone operating `apps/relayer`, the gas-sponsorship service for `GhostPaySweepRelayer`. Source of truth for behaviour is `apps/relayer/README.md`, `apps/relayer/PRIVACY.md` and `apps/relayer/DEVIATIONS.md`; this runbook adds the operating procedure and flags where behaviour is still changing.

> **Status.** The relayer is pre-audit and has never run against a public network, a real RPC provider or a Docker/systemd deployment (README "Unverified"). Run it on testnets first. Several operational features (metrics endpoint, alert webhook, per-owner/destination abuse caps, breaker half-open fix, client-IP handling) were being added in the working tree when this was written; the sections that depend on them say **in progress**. Re-read `apps/relayer/README.md` after those changes merge and correct this file if they differ.

## 1. What you are operating

A stateless HTTP service. It quotes a fee (`POST /v1/quote`), checks a signed sweep order, simulates it, and broadcasts it from a **hot key** that pays gas. The contract guarantees destination, amount, fee and `feeTo` are exactly what the stealth-address owner signed; you can decline or delay but not redirect. You see owner, destination, token, amount and timing for every request (inherent; see `PRIVACY.md`). You are the party who may face money-transmission, sanctions and data-protection questions (ADR-0006, audit D10): get advice before offering this publicly.

## 2. Prerequisites

- A verified deployment manifest per chain in `DEPLOYMENTS_DIR` ([deployment runbook](deployment-runbook.md)). Without a manifest the relayer refuses the chain. Non-testnet chains also need `ALLOW_MAINNET=1` and an enabled chain entry; do not set it before the [chain-enablement checklist](chain-enablement-checklist.md) is complete.
- A reverse proxy that terminates HTTPS. The service itself speaks plain HTTP.
- Your own RPC endpoint per chain (the RPC provider sees every simulated sweep including owner, destination and signature).
- Operator-measured economics: `gasUnits`, `nativeUsdPrice`, gas caps and daily budget have **no defaults on purpose**. The example file's numbers are placeholders, not measurements.

## 3. Configuration

JSON file (`RELAYER_CONFIG`) plus environment. Validation is strict: unknown keys, wildcard or non-https origins, plain-http or credentialed RPC URLs, non-stable tokens and missing economics stop startup.

Environment variable names (no values here; see also the repository's `.env.example`):

| Name | Purpose |
|---|---|
| `RELAYER_KEY_FILE` or `RELAYER_KEY` | 32-byte hot key (hex). Prefer the file: it must be a regular file with no group/world bits (`chmod 600`) or startup is refused. |
| `QUOTE_SECRET_FILE` or `QUOTE_SECRET` | 32-128 byte HMAC secret (hex), same file rules. Changing it invalidates outstanding quotes. |
| `RELAYER_CONFIG` | Path to the JSON config (default `./relayer.config.json`). |
| `DEPLOYMENTS_DIR` | Directory of `<chainId>.json` manifests (default `../../deployments`). |
| `ALLOW_MAINNET` | `1` allows non-testnet chain ids (still needs a manifest). |
| names given by `rpcUrlEnv` (for example `RPC_URL_84532`) | RPC URL kept out of the config file. |
| names given by `metricsTokenEnv`, `alertWebhookUrlEnv` | Metrics bearer token (enables `/metrics`) and https alert webhook URL. |

Per chain: `rpcUrl` or `rpcUrlEnv`, `sweepRelayer` (must match the manifest if both are given), `feeTo` (default: the hot-key address), `tokens` (stablecoins only in v1, `usdStable: true`), `nativeUsdPrice`, `gasUnits`, `maxGasLimit`, `maxGasPriceWei`, `dailyBudgetWei`, `minBalanceWei`. Global: `listen` (keep `127.0.0.1` behind the proxy), `allowedOrigins` (exact https origins of your web app; no wildcard), `trustedProxies`, `quoteTtlSeconds`, `deadline`, `rateLimit`, `breaker`, `lossBudget`, `queue`, `shutdownGraceSeconds`. An unknown key stops startup with an error that names it.

Fee policy is fixed by FEE_SCHEDULE: `clamp(max(gas x 1.10, 50 bps), cap 300 bps)`. If the cap cannot cover raw gas the quote is refused (`amount_too_small`). The token price is a constant 1.0 and `nativeUsdPrice` is **your number**: update it when the native coin price moves materially, or you will sponsor sweeps at a loss. There is no oracle (audit G-11, G-26).

### `trustedProxies` and the listener

`trustedProxies` lists the addresses or CIDR blocks your reverse proxy connects from, as the relayer sees them. The relayer believes `X-Forwarded-For` only when the TCP peer is listed, walks it from the right past listed hops, and keys rate limits and the loss budget on the first other address; an empty list ignores the header (audit S3-07). Use:

- `["127.0.0.1", "::1"]` with `listen.host` `127.0.0.1` when the proxy runs on the same host (`infra/proxy`, [hosting](hosting.md));
- `["172.30.10.0/24"]` with `listen.host` `0.0.0.0` for the compose recipe in `deploy/`: the backend subnet pinned in `deploy/docker-compose.yml`, which nginx connects from. `deploy/config/relayer.config.example.json` has both; `deploy/selfhost.sh` warns when the list is empty or loopback-only (audit L5-05).

If the listener is reachable without the proxy, clients can choose their own bucket; if the proxy is not listed, every client shares the proxy's single bucket. The proxy must overwrite `X-Forwarded-For` with its own peer (nginx in `deploy/` does, after taking the client address from your TLS terminator's header, believed only from the compose gateways). The old `trustProxyHops` hop count was removed: a config that still sets it is refused at startup with an error naming it. Test with a request carrying a forged `X-Forwarded-For`: it must not change the bucket, and two clients must not share one. The Docker image exposes 8787; do not publish that port directly.

## 4. Hot key handling

- The hot key only pays gas. Keep its balance **low** (a few days of budget). `minBalanceWei` opens the breaker when the balance falls under the floor.
- Generate it on a machine you trust; never reuse a personal wallet key; never commit it, put it in a ticket, or pass it as a command-line argument.
- File: `chmod 600`, owned by the service user, on an encrypted volume; systemd unit loads it via `RELAYER_KEY_FILE` (`deploy/ghostpay-relayer.service` sets `/etc/ghostpay-relayer/hot.key`). `feeTo` can be a different address from the hot key: set it to a cold or multisig address so earned fees are not sitting on the hot key.
- Rotation: generate a new key, fund it, start a new instance or restart with the new file, drain the old key, remove the old file. Outstanding quotes are tied to the quote secret, not the hot key, but state is in memory only, so queued work does not survive a restart.
- Suspected key exposure: stop the service, sweep the remaining balance, rotate. Losses are bounded by the balance, because the contract moves user tokens only as signed by their owners.
- Quote secret: separate file, same rules. Rotate on suspicion; effect is that open quotes become invalid.

## 5. Funding

1. Fund each chain's hot key with native coin for gas. Size it from `dailyBudgetWei` (maximum gas the service will spend per UTC day per chain) plus `minBalanceWei`.
2. Top up from a treasury you control; do not automate unattended top-ups from a large wallet.
3. The balance floor protects you: when balance is under `minBalanceWei` the breaker opens and requests are refused with `breaker_open`.
4. Reverted sweeps cost you gas with no fee (audit S3-06). Expect a small leak; watch it (section 7).

## 6. Deploying

Build and run per `apps/relayer/README.md`:

```bash
npm ci --ignore-scripts
npm run build:libs
npm run build -w @ghostpay/relayer
```

Container: `docker build -f apps/relayer/Dockerfile -t ghostpay-relayer .` from the repository root (distroless, non-root, runs `npm prune --omit=dev`). Systemd: `apps/relayer/deploy/ghostpay-relayer.service` (strict sandboxing; `EnvironmentFile` for RPC URLs). **Neither the image nor the unit has been built or run by the project**; verify both on a test host. The image is not scanned or attested by the release workflow.

`SIGTERM`/`SIGINT` start a graceful shutdown: stop listening, refuse new work, let queued and in-flight transactions settle, force-close after `shutdownGraceSeconds`. In-memory state (rate limits, daily budget counter, breaker window) is lost on restart, so a restart resets the daily budget: do not restart in a loop.

## 7. Monitoring

Always available:

- `GET /healthz`: `status` and, per chain, `breaker` and `minedReverts`. `ok` (every breaker closed, no sustained mined reverts), `degraded` with HTTP 503 (some chain's breaker open or half-open, audit S3-05, or its mined reverts `sustained`, audit L5-02), `shutting_down`. Alert on anything other than `ok`.
- `GET /v1/info`: version, fee policy, per-chain `sweepRelayer`, `feeTo`, token allowlist. Compare with your manifest after every deploy.
- Structured JSON logs on stdout. Fields are limited to `ts, level, event, requestId, route, status, chainId, txHash, errorClass`; no bodies, addresses, signatures, amounts or IPs.

Metrics and alerts (names in `apps/relayer/README.md`, "Abuse controls and operations"): `/metrics` in Prometheus format, enabled only by `metricsTokenEnv` and then requiring that bearer token (the `deploy/` recipe does not route it; scrape it from the backend network), and an alert webhook (`alertWebhookUrlEnv`) for breaker open, low balance, loss and daily budget exhaustion, mined reverts and a sustained mined-revert rate, receipt timeouts, and a refusing global quote budget, de-duplicated per kind and chain for 60 s.

Watch for: breaker open or half-open for more than a few minutes; balance near the floor; budget near the limit before the UTC day ends; spikes of `sweep_reverted`/`send_failed`; `rate_limited_*` surges; `gas_price_too_high` (you are refusing work during a gas spike, which is intended); the gap between `nativeUsdPrice` and the market.

## 8. Breaker states

| State | Meaning | Operator action |
|---|---|---|
| `closed` | Normal. | None. |
| `open` | Recent error ratio at or above `failureRatio` (after `minSamples`), or the balance floor tripped. All sweeps get `503 breaker_open`. | Find the cause (RPC down? out of gas funds? sustained reverts?). It re-tries after `cooldownSeconds`. Fix funding or RPC; do not simply restart to reset it. |
| `half_open` | After the cooldown, one probe request is let through; success closes, failure re-opens. | Wait. **Known issue S3-05:** in the audited commit a probe that ended early with a user-class error left the breaker stuck in `half_open` forever while `healthz` said `ok`. A fix (probe timeout that re-opens the breaker) is in the working tree; until it is released, restart the service if `half_open` persists beyond two cooldowns. |

Griefing note (S3-06): a sweep that reverts after a passing simulation (front-run, owner drained first) is neutral for the breaker and charged to `lossBudget` per destination, client network and globally; a sustained rate of them makes `/healthz` `degraded` and sends `mined_revert_rate` without opening the breaker (L5-02). A receipt that times out does count as a breaker failure (L5-06). Treat an unexplained opening as possible abuse or an RPC problem; check recent `errorClass` values.

## 9. Incident response

| Situation | First steps |
|---|---|
| Hot key suspected compromised | Stop service; move balance to a new key; rotate key and quote secret; review on-chain transactions from the old key for sweeps you did not process; write down times. |
| Gas spike draining budget | Lower `maxGasPriceWei` and `dailyBudgetWei`; the service already refuses above the cap. Reload by restart (resets counters; note the effect). |
| Wrong `nativeUsdPrice` (selling gas too cheaply) | Correct the config and restart; review fees collected vs gas spent. |
| RPC provider outage or lying | Breaker will open on errors. Switch `rpcUrlEnv` target to another provider and restart. A provider that lies consistently cannot be detected by the relayer. |
| Fee-recipient (`feeTo`) problem | `feeTo` is a config value; correct it and restart. Contract-level `FEE_RECIPIENT` on the router is separate and immutable ([deployment runbook](deployment-runbook.md)). |
| Abuse (request floods, reverted-sweep spam) | Tighten `rateLimit`; block at the proxy; lower `queue.maxPending`. Confirm `trustedProxies` is right first (S3-07). |
| A user reports a sweep that did not happen | You cannot see requests after the fact (nothing is persisted); use the `requestId` if they have it, and the on-chain history of the hot key. |
| Court order or data request | You hold almost no stored data (see section 10); what you can provide is limited to logs and proxy logs you chose to keep. Involve counsel. |
| Suspected bug in the contracts | There is no pause. Stop the relayer service for that chain, tell users to use the direct sweep path, and follow the contract migration in the deployment runbook. |

Record every incident with timestamps, and report suspected vulnerabilities privately (see `SECURITY.md`).

## 10. Log retention and privacy

- The relayer persists nothing: rate-limit buckets use a salted hash of the IP (or owner address) in memory and are dropped when the salt rotates (at most every 24 hours, `saltRotationHours`) or the process exits.
- Logs go to stdout. **You** decide retention: keep it short (days, not months) and do not log request bodies at the proxy. Proxy, CDN, WAF and RPC provider logs fall under your own notice (`PRIVACY.md`, "What other parties see").
- Publish a privacy notice for your deployment that adds anything you changed. Collect nothing else. This runbook is not legal advice.

## 11. Compliance hook

`PolicyGate` (`apps/relayer/src/policy.ts`) runs before sending and defaults to allow-all. The project ships **no** sanctions screen. If you operate publicly, decide with counsel whether to screen owner and destination addresses; implement a gate that denies with `policy_denied` (403) or fails with `policy_unavailable` (503). A screening service you call receives chain, token, owner, destination and amount, which you must disclose. The contracts contain no blocklist or admin on purpose (ADR-0006), so any compliance posture lives in what you operate.

## 12. Before you go live (checklist)

- [ ] Verified manifest for every chain; `GET /v1/info` matches it.
- [ ] Numbers measured from your own testnet runs (`gasUnits`, `nativeUsdPrice`, caps, budget).
- [ ] Listener reachable only through the HTTPS proxy; `trustedProxies` lists exactly that proxy and was tested with a forged header.
- [ ] Hot key file mode 600, low balance; `feeTo` is not the hot key.
- [ ] Alerts wired to a person; breaker `half_open` runbook understood.
- [ ] Privacy notice and terms published; legal advice obtained; sanctions decision made.
- [ ] Docker image / systemd unit built and run on a test host (not done by the project).
- [ ] Mainnet only after independent audit and the [chain-enablement checklist](chain-enablement-checklist.md).
