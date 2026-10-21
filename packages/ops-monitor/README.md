# @ghostpay/ops-monitor

Read-only, operator-run chain-side anomaly probes. Spec: [`docs/remote/specs/ops-monitor.md`](../../docs/remote/specs/ops-monitor.md).

- `runOnce(probes, ctx)`: runs probes; a failing or throwing probe becomes a `warn` finding, never a crash.
- `w1Probe` manifest drift (code keccak, `FEE_RECIPIENT()`/`FEE_BPS()`/`ANNOUNCER()`, mirror `deployments/<id>.json`).
- `createW2Probe` fee recipient health (token `isBlacklisted`/`paused`, zero-value native call).
- `w3Probe` release integrity of served files against `SHA256SUMS` (injectable fetch).
- `createW4Probe` hot key balance floor, nonce gap, unreimbursed gas (plain numeric inputs).
- `createW5Probe` announcement rate vs baseline, with `FeeCollected` share.
- `createW6Probe` RPC disagreement (chain id, confirmed block hash).
- `toPrometheus` (text exposition) and `toWebhook` (dedupe window, `null` when nothing new).

Findings carry only configured addresses or mirror URLs as `subject` (tested). Holds no keys.

Dependencies: `viem` (keccak256), `@ghostpay/chain-adapters` (types, RPC client, manifest loader), Node built-ins. **No live network run**: all RPC is faked; W3 is tested against a local `node:http` server only.

## Runner (CLI)

`ghostpay-ops-monitor --config <file> [--dry-run] [--print]` (`dist/bin.js`) builds verified RPC clients from the env vars named in the config (URLs and API keys never appear in the file), loads the release manifests, runs W1 to W6 once and:

- prints one line per finding (`<severity> <check> chain=<id> <subject> <detail>`),
- writes the Prometheus text atomically to `output.prometheusFile` (node_exporter textfile collector),
- posts new `warn`/`page` findings to the https webhook named by `output.webhookUrlEnv`, de-duplicated across runs through `output.stateFile`.

Exit code: 0 healthy, 1 warn, 2 page, 3 the runner failed (bad config, RPC/chain mismatch, unwritable output, webhook failure). `--dry-run` writes and sends nothing. Config: [`ops-monitor.config.example.json`](./ops-monitor.config.example.json) (strict: unknown keys rejected). systemd: [`deploy/ghostpay-ops-monitor.service`](./deploy/ghostpay-ops-monitor.service) (oneshot, hardened) and [`deploy/ghostpay-ops-monitor.timer`](./deploy/ghostpay-ops-monitor.timer) (every 5 minutes). W4's `unreimbursedGasWeiToday` is not measured by the runner (reported as 0); watch `/metrics` of the relayer for loss-budget denials.

```bash
npm run typecheck && npm run lint && npm test   # from this directory
```

## Status and deviations

Library plus the `ghostpay-ops-monitor` CLI runner (section Runner); no live network run; no external audit.
Differences from the spec and open items: [`DEVIATIONS.md`](./DEVIATIONS.md). Scripts (`package.json`): `build`, `typecheck`, `test` (`vitest run --coverage`), `lint`.
