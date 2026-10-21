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

Dependencies: `viem` (keccak256), `@ghostpay/chain-adapters` (types), Node built-ins. **Not wired in anywhere. No live network run**: all RPC is faked; W3 is tested against a local `node:http` server only.

```bash
npm run typecheck && npm run lint && npm test   # from this directory
```
