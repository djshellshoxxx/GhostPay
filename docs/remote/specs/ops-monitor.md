# Spec: `@ghostpay/ops-monitor` (chain-side anomaly watch and alerting)

Status: **spec only** (2026-10-21). Not implemented. The relayer's own `/metrics` endpoint and alert webhook are separately **in progress** by another contributor (`docs/operators/relayer-runbook.md` section 7); this spec covers the parts nobody has started and is designed to share that webhook format.

## 1. Purpose

Contracts are immutable with no pause (README; ADR-0006), so detection and communication are the only incident levers. A small, read-only watcher, run by the operator (not by users' browsers, no telemetry from clients), that polls the chain through operator-chosen RPCs and raises alerts.

## 2. Checks

| ID | Check | Why (evidence) |
|---|---|---|
| W1 | Manifest drift: for each chain, `eth_getCode` keccak of router/sweep relayer/policy router equals manifest `bytecodeHashes`; `FEE_RECIPIENT()`, `FEE_BPS()`, `ANNOUNCER()` equal manifest; served `deployments/<chainId>.json` at each mirror equals the release copy | S3-01 (High); threat model 6.2 |
| W2 | Fee recipient health: token `isBlacklisted`/`paused` (where the token exposes them) for the fee recipient on every allowlisted token; a periodic `eth_call` of a zero-value native send to the recipient | D5 / contracts M-01 |
| W3 | Release integrity: fetch served `index.html` and entry script from each mirror, compare with `SHA256SUMS` of the current release | S3-04; threat model 6.1 |
| W4 | Relayer hot key: balance vs floor, nonce gap (stuck tx, S3-18f), unreimbursed gas per day (from `LossBudget`, relayer-guard spec) | runbook sections 7-9 |
| W5 | Announcement spam rate: announcements per block to the canonical announcer with GhostPay scheme ids vs baseline; share with router `FeeCollected` | S3-02, L-02 (dust/spoof griefing degrades scanners) |
| W6 | RPC disagreement: same block hash / chain id from two providers | S3-14 |

## 3. Interface (proposed)

```ts
interface Probe { id: 'W1' | ...; run(ctx: { rpcs: RpcClient[]; manifest; release; now }): Promise<Finding[]> }
interface Finding { id; severity: 'info' | 'warn' | 'page'; chainId?; subject: string /* address or URL, never user data */; detail: string }
function runOnce(probes: Probe[], ctx): Promise<Finding[]>;
function toPrometheus(findings: Finding[]): string;   // text exposition format, gauge per check
function toWebhook(findings: Finding[], dedupeWindowMs): WebhookPayload | null;
```

Uses `chain-adapters` `rpc.ts` (chain-id check, size caps) and `deployments.ts`; Node built-ins otherwise.

## 4. Privacy and threat model

- Reads only public chain data and the operator's own public mirrors. Never queries user stealth addresses, never receives data from user browsers. This keeps the "no analytics, no telemetry" rule in `SECURITY.md` intact.
- A compromised watcher can only raise false alarms or stay silent; it holds no keys. Alerts must not be the sole trigger for user-facing kill switches (an attacker who controls the watcher could otherwise force a denial of service).
- RPC providers learn which contracts the operator watches (already public).

## 5. Test plan

Fake RPC fixtures for each check (matching, drifted, unreachable, lying single provider); golden Prometheus output; webhook dedupe within window; W3 against a local static server serving a tampered file; anvil run with the real contracts for W1/W2 (blacklist mock token from `packages/contracts/test/mocks/BlacklistToken.sol`).

## 6. Acceptance criteria

Each check has a page-level alert path tested end to end; runbook section "Incident response" links each finding id to a first step; no user data in any finding (test asserts the subject is a configured address or URL).

## 7. Sources

- Prometheus "Exposition formats", <https://raw.githubusercontent.com/prometheus/docs/main/docs/instrumenting/exposition_formats.md>, retrieved 2026-10-21 (text-based format for `toPrometheus`).
- Repository: README status table; `docs/operators/relayer-runbook.md` sections 7-9; `docs/operators/deployment-runbook.md` (fee-recipient requirements); audit 03 S3-01, S3-02, S3-04, S3-14, S3-18; audit 02 M-01, L-02; audit 04 D5.
