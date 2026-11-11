# Relayer runbook

Audience: someone operating `apps/relayer`, the gas-sponsorship service for `GhostPaySweepRelayer`. Source of truth for behaviour is `apps/relayer/README.md`, `apps/relayer/PRIVACY.md` and `apps/relayer/DEVIATIONS.md`; this runbook adds the operating procedure and flags where behaviour is still changing.

> **Status.** The relayer is pre-audit and has never run against a public network, a real RPC provider or a Docker/systemd deployment (README "Unverified"). Run it on testnets first. Several operational features (metrics endpoint, alert webhook, per-owner/destination abuse caps, breaker half-open fix, client-IP handling) were being added in the working tree when this was written; the sections that depend on them say **in progress**. Re-read `apps/relayer/README.md` after those changes merge and correct this file if they differ.

## 1. What you are operating

An HTTP service with a small durable journal (daily budget and unsettled transactions, section 6a). It quotes a fee (`POST /v1/quote`), checks a signed sweep order, simulates it, and broadcasts it from a **hot key** that pays gas. The contract guarantees destination, amount, fee and `feeTo` are exactly what the stealth-address owner signed; you can decline or delay but not redirect. You see owner, destination, token, amount and timing for every request (inherent; see `PRIVACY.md`). You are the party who may face money-transmission, sanctions and data-protection questions (ADR-0006, audit D10): get advice before offering this publicly.

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

Per chain: `rpcUrl` or `rpcUrlEnv`, `sweepRelayer` (must match the manifest if both are given), `feeTo` (required; it may be the hot-key address only when the top-level `allowFeeToHotKey` is true), `tokens` (stablecoins only in v1, `usdStable: true`), `nativeUsdPrice`, `gasUnits`, `maxGasLimit`, `maxGasPriceWei`, `dailyBudgetWei`, `minBalanceWei`. Global: `listen` (keep `127.0.0.1` behind the proxy), `allowedOrigins` (exact https origins of your web app; no wildcard), `trustedProxies`, `quoteTtlSeconds`, `deadline`, `rateLimit`, `breaker`, `lossBudget`, `queue`, `shutdownGraceSeconds`. An unknown key stops startup with an error that names it.

Fee policy is fixed by FEE_SCHEDULE: `clamp(max(gas x 1.10, 50 bps), cap 300 bps)`. If the cap cannot cover raw gas the quote is refused (`amount_too_small`). The token price is a constant 1.0 and `nativeUsdPrice` is **your number**: update it when the native coin price moves materially, or you will sponsor sweeps at a loss. There is no oracle (audit G-11, G-26).

### `trustedProxies` and the listener

`trustedProxies` lists the addresses or CIDR blocks your reverse proxy connects from, as the relayer sees them. The relayer believes `X-Forwarded-For` only when the TCP peer is listed, walks it from the right past listed hops, and keys rate limits and the loss budget on the first other address; an empty list ignores the header (audit S3-07). Use:

- `["127.0.0.1", "::1"]` with `listen.host` `127.0.0.1` when the proxy runs on the same host (`infra/proxy`, [hosting](hosting.md));
- `["172.30.10.0/24"]` with `listen.host` `0.0.0.0` for the compose recipe in `deploy/`: the backend subnet pinned in `deploy/docker-compose.yml`, which nginx connects from. `deploy/config/relayer.config.example.json` has both; `deploy/selfhost.sh` warns unless an entry of the list contains the whole backend subnet it reads from `deploy/docker-compose.yml` (Docker assigns nginx's address in it, so a single address or a smaller block can miss it; audit L5-05).

If the listener is reachable without the proxy, clients can choose their own bucket; if the proxy is not listed, every client shares the proxy's single bucket. The proxy must overwrite `X-Forwarded-For` with its own peer (nginx in `deploy/` does, after taking the client address from your TLS terminator's header, believed only from the compose gateways). The old `trustProxyHops` hop count was removed: a config that still sets it is refused at startup with an error naming it. Test with a request carrying a forged `X-Forwarded-For`: it must not change the bucket, and two clients must not share one. The Docker image exposes 8787; do not publish that port directly.

## 4. Hot key handling

- The hot key only pays gas. Keep its balance **low** (a few days of budget). `minBalanceWei` opens the breaker when the balance falls under the floor.
- Generate it on a machine you trust; never reuse a personal wallet key; never commit it, put it in a ticket, or pass it as a command-line argument.
- File: `chmod 600`, owned by the service user, on an encrypted volume; systemd unit loads it via `RELAYER_KEY_FILE` (`deploy/ghostpay-relayer.service` sets `/etc/ghostpay-relayer/hot.key`). `feeTo` can be a different address from the hot key: set it to a cold or multisig address so earned fees are not sitting on the hot key.
- Rotation: generate a new key, fund it, start a new instance or restart with the new file, drain the old key, remove the old file. Outstanding quotes are tied to the quote secret, not the hot key, and the state file is tied to the hot key's nonces: rotate only with nothing unsettled (`ops.js state`), then start with a fresh state file for the new key.
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

Container: `docker build -f apps/relayer/Dockerfile -t ghostpay-relayer .` from the repository root (distroless, non-root uid 65532, base images pinned by digest, `npm ci --ignore-scripts`). Run it with `--read-only --cap-drop ALL --security-opt no-new-privileges` and a volume on `/var/lib/ghostpay-relayer`: that directory is the **only** writable path (the journal writes its temporary files beside `state.json`; no tmpfs is needed). The image has a `HEALTHCHECK` (`node dist/ops.js health`; set `RELAYER_HEALTH_URL` if `listen.port` is not 8787). The self-host recipe `deploy/docker-compose.yml` already sets all of this (volume `api-state`, nginx with a 16 KiB body limit, `/metrics` unrouted). Systemd: `apps/relayer/deploy/ghostpay-relayer.service` (`StateDirectory=ghostpay-relayer`, strict sandboxing, `RestartSec=15`, `EnvironmentFile` for RPC URLs); `systemd-analyze verify` accepts it. The container flow was run end to end against a local anvil by `apps/relayer/deploy/smoke-anvil.sh` (healthz, info, ops CLI in the image, HEALTHCHECK, SIGTERM exit 0); **it has not run against a public network or real RPC provider**, and the systemd unit has not been started on a real host. The image is not scanned or attested by the release workflow.

TLS and the proxy: the relayer speaks plain HTTP; terminate TLS in front (Caddy, Cloudflare Tunnel, host nginx) and route only `/healthz`, `/v1/info`, `/v1/quote`, `/v1/sweep`. `deploy/nginx/nginx.conf` limits bodies to 16 KiB (the relayer's own cap), sets short client and proxy timeouts, overwrites `X-Forwarded-For` with the resolved client address and returns 404 for `/api/metrics`; pair it with `trustedProxies` as in section 3. Do not publish port 8787.

`SIGTERM`/`SIGINT` start a graceful shutdown: stop listening, refuse new work, let queued and in-flight transactions settle, force-close after `shutdownGraceSeconds`; the lock is released on exit. Rate limits and the breaker window are in memory and reset on restart. With `state.file` the daily budget and unsettled transactions survive restarts (section 6a); with `state.ephemeral` (development only) they do not, so a restart resets the daily budget.

## 6a. State file, ops commands and upgrades

**State.** `state.file` (config key `state`, required; recommended `/var/lib/ghostpay-relayer/state.json`) holds, per chain, the UTC budget day and wei reserved, plus one record per transaction that may still spend gas (status `reserved` / `signed` / `pending`, hot-key nonce, tx hash once signed, reserved wei). It holds no owner, destination, token, amount or signature (`PRIVACY.md`). The file is mode 0600, written atomically (temp file, fsync, rename), and a file that does not parse stops startup: it is never reset silently, because that would forget spent budget and broadcast transactions.

**Single instance and lock.** Exactly one relayer process may use a hot key and a state file; two would hand out the same nonces and each spend the full budget. The process holds `<state.file>.lock` with a 30 s heartbeat. A second process refuses to start while the heartbeat is fresh; a lock left by a crash is taken over when it names the same host and pid (a restarted container) or after 30 s. So after a crash under systemd (new pid) expect the first restart attempts to be refused for up to 30 s; the unit's `RestartSec=15` covers that. Never delete the lock or run a second copy "to take over"; stop the first. The lock guards one host or one shared volume only: replicas on separate storage with the same hot key are unsupported.

**Ops commands** (`node dist/ops.js <command>`; in the image `docker exec <container> /nodejs/bin/node dist/ops.js <command>`). All are read-only: they never take or touch the lock, never write the state file, never send a transaction, and never print secrets, RPC URLs or provider error text. Exit 0 ok, 1 failure, 2 usage.

| Command | Use |
|---|---|
| `check-config` | Run before every deploy and restart: loads config and secrets exactly as startup does, prints chains, token count, hot-key **address** and state mode. No RPC calls. |
| `state [--file p] [--json]` | Per chain: budget day, spent, limit, remaining today; then each unsettled record (status, nonce, tx hash, reserved wei, age). A `reserved` or `signed` record that stays for much longer than `queue.receiptTimeoutSeconds` needs a look. Default file: `state.file`, else `RELAYER_STATE_FILE`. |
| `health [--url u]` | `GET /healthz` with a 3 s timeout; exit 0 only for HTTP 200 and `ok`. It is the Docker `HEALTHCHECK`. |
| `reconcile-report [--json]` | For each record with a tx hash, asks the chain (configured RPC) for the receipt and the hot key's pending nonce and prints what the relayer will do at next start. |

Reading `reconcile-report`: `settled` = mined; the record is removed and unused budget returned. `pending` = no receipt but the node holds that nonce; the relayer keeps tracking it (do not fund-move the hot key, do not replace the transaction by hand). `unknown` = no receipt and the nonce is free, or the RPC failed; the relayer treats it as never broadcast only after its grace period, then releases the reservation. Re-run when the RPC is healthy before drawing conclusions. `not_broadcast` = reserved but never signed: provably nothing was sent. If the hot key cannot be loaded the report lists receipts only.

**Backup.** Copy `state.json` while the service is stopped, or at any time (writes are atomic, so a copy is a consistent snapshot; add `.lock` only if you need it, you do not). Keep it with the same access as the hot key's host. A backup older than the last restart is stale: restoring it forgets budget spent since.

**Upgrade and rollback (stop, backup, deploy, start).**
1. `ops.js state` and `reconcile-report`; note unsettled records.
2. Stop the service (`systemctl stop` / `docker stop`; wait for the graceful exit and for the lock to disappear).
3. Copy `state.json` to a dated backup.
4. Deploy the new build; run `ops.js check-config` with the new build against the real config and secrets.
5. Start; check `/healthz`, `/v1/info` against your manifest and `ops.js state`.
Rollback: stop, keep the **current** `state.json` (do not restore the backup unless the file is corrupt, since the backup forgets newer spend and records), deploy the old build, start. An older build that does not know the state file's `version` refuses to start: keep the new build until its records settle. **Never delete or reset `state.json` while any record is unsettled**, and never to "clear" a budget: wait for the UTC day roll, or raise `dailyBudgetWei` deliberately and restart. If the file is corrupt, stop, keep it for diagnosis, run `reconcile-report` from a backup copy with `--file`-less env (`RELAYER_STATE_FILE`), check the hot key's on-chain pending/latest nonce and balance by hand, then start from a state with budget set to what you judge spent.

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
| `half_open` | After the cooldown, one probe request is let through; success closes, failure re-opens. A probe that is broadcast is judged by its receipt: mined closes, a receipt timeout re-opens, a mined revert lets the next request probe. A probe not settled within `breaker.probeTimeoutSeconds` (its work up to the broadcast) plus `queue.receiptTimeoutSeconds` (its receipt wait), 180 s by default, re-opens too. | Wait; one probe holds `half_open` for at most that long. **Known issue S3-05:** in the audited commit a probe that ended early with a user-class error left the breaker stuck in `half_open` forever while `healthz` said `ok`. A fix (probe timeout that re-opens the breaker) is in the working tree; until it is released, restart the service if `half_open` persists beyond two cooldowns. |

Griefing note (S3-06): a sweep that reverts after a passing simulation (front-run, owner drained first) is neutral for the breaker and charged to `lossBudget` per destination, client network and globally; a sustained rate of them makes `/healthz` `degraded` and sends `mined_revert_rate` without opening the breaker (L5-02). A receipt that times out does count as a breaker failure, and a sweep counts as a success only once it is mined (L5-06). Treat an unexplained opening as possible abuse or an RPC problem; check recent `errorClass` values.

## 9. Incident response

| Situation | First steps |
|---|---|
| Hot key suspected compromised | Stop service; move balance to a new key; rotate key and quote secret; review on-chain transactions from the old key for sweeps you did not process; write down times. |
| Gas spike draining budget | Lower `maxGasPriceWei` and `dailyBudgetWei`; the service already refuses above the cap. Reload by restart (the journal keeps today's spent amount; check with `ops.js state`). |
| Wrong `nativeUsdPrice` (selling gas too cheaply) | Correct the config and restart; review fees collected vs gas spent. |
| RPC provider outage or lying | Breaker will open on errors. Switch `rpcUrlEnv` target to another provider and restart. A provider that lies consistently cannot be detected by the relayer. |
| Fee-recipient (`feeTo`) problem | `feeTo` is a config value; correct it and restart. Contract-level `FEE_RECIPIENT` on the router is separate and immutable ([deployment runbook](deployment-runbook.md)). |
| Abuse (request floods, reverted-sweep spam) | Tighten `rateLimit`; block at the proxy; lower `queue.maxPending`. Confirm `trustedProxies` is right first (S3-07). |
| A user reports a sweep that did not happen | You cannot see requests after the fact (the journal keeps only in-flight nonce/hash records); use the `requestId` if they have it, and the on-chain history of the hot key. |
| Court order or data request | You hold almost no stored data (see section 10); what you can provide is limited to logs and proxy logs you chose to keep. Involve counsel. |
| Suspected bug in the contracts | There is no pause. Stop the relayer service for that chain, tell users to use the direct sweep path, and follow the contract migration in the deployment runbook. |

Record every incident with timestamps, and report suspected vulnerabilities privately (see `SECURITY.md`).

## 10. Log retention and privacy

- The only thing the relayer persists is the journal described in section 6a (budget numbers and, while a transaction can still cost gas, its nonce, hash and reserved wei; no addresses, amounts or IPs). Rate-limit buckets use a salted hash of the IP (or owner address) in memory and are dropped when the salt rotates (at most every 24 hours, `saltRotationHours`) or the process exits.
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
- [ ] Docker image / systemd unit built and run on a test host (the container flow passed `deploy/smoke-anvil.sh` on a local anvil; the systemd unit has not been started on a host).
- [ ] `state.file` on durable storage, one instance only, backup procedure rehearsed (section 6a); `ops.js check-config` passes.
- [ ] Mainnet only after independent audit and the [chain-enablement checklist](chain-enablement-checklist.md).
