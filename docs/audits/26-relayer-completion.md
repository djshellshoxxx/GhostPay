# 26 Relayer completion report (2026-11-11)

Scope: `apps/relayer` and the pieces it uses (`packages/chain-adapters` permit/sweep, `packages/relayer-guard`), web/CLI
integration of relayer error classes, deployment. Branch `claude/wonderful-thompson-ir89i9`, stacked on
`integration/ghostpay-beta-consolidated-20261109` (PR #98) at `364b1f1`; PR #118. Source pins below refer to that branch.

**Classification: implementation complete, externally unqualified.** Nothing here has run against a public testnet,
under load, behind a production proxy/Prometheus/webhook, or been audited professionally. The review in section 4 is
AI-assisted and is not an independent professional audit.

## 1. Starting point

`main` (`bd2652b`) carries none of the relayer work; the most advanced relayer code was on PR #84 / #98 (identical relayer
trees). PR #69 (permit states) is already contained in #98. No other open PR touched relayer files on 2026-11-11.
Already present on the base: serial per-chain lane, EVM-3 outcome-unknown handling with nonce reconciliation, two
simulations next to the send, gas price move check, loss budget, breaker with probe timeout, spec 04 fallback ladder,
per-owner failure counter, HMAC v2 quote tokens with key rotation, strict config, signed manifests, `REQUIRE_ANVIL`
enforcement in `e2e.anvil.test.ts` (the README and CI comment still said otherwise).

## 2. Feature inventory

States: Impl = implemented; Tested = unit/HTTP tests; Integrated = anvil e2e or real container; Ext = externally
verified (testnet/production). "Remaining" is the estimated share of the feature's work still open, for the in-scope
requirement; external qualification is counted separately in section 5.

| Feature | Impl | Tested | Integrated | Ext | Remaining | Open item |
|---|---|---|---|---|---|---|
| Permit preflight classification (`classifyPermit`, `diagnoseSignedPermit`) | yes | yes | relayer failure path via fake chain; front-run on anvil | no | 5 % | DAI-style tokens stay `unsupported`; no anvil test of a bad-signature permit |
| Permit fallback ladder (allowance path, expiry, no silent retry) | yes | yes | anvil (front-run) | no | 0 % | option C event deferred (contract change) |
| Fee and quote integrity (exact integer fee, HMAC binding, TTL <= 60 s, rotation) | yes | yes | anvil | no | 10 % | `griefReserveBps` value unmeasured (default 0) |
| Pre-broadcast checks (balance, allowance, nonce, two simulations, gas move, deadline) | yes | yes | anvil | no | 0 % | |
| Transaction lifecycle / nonce safety (unknown outcome, receipt lookups) | yes | yes | anvil restart test | no | 5 % | no replacement / repricing of stuck transactions (by design: never bump) |
| Restart-safe budget and in-flight sends (state journal) | yes | yes | anvil restart test, container | no | 5 % | multi-replica coordination unsupported |
| Abuse controls (limits, loss budget, breaker, failure counter) | yes | yes | anvil | no | 10 % | reset on restart (bounded by persisted daily budget) |
| RPC resilience (chain id, manifest, hash identity, revert vs transport) | yes | yes | anvil | no | 15 % | no secondary read provider |
| API security and privacy (schemas, limits, XFF, redaction) | yes | yes | container | no | 5 % | |
| Container / systemd / proxy | yes | smoke script | container on local anvil | no | 15 % | systemd unit not started on a host; compose/nginx not run |
| Metrics and alerts | yes | yes | container (`/healthz`) | no | 15 % | no Prometheus scrape or webhook delivery verified |
| Operator tooling (`ops.ts`) | yes | yes | container | no | 5 % | `reconcile-report` only against a mock RPC |
| Web integration of relayer classes | yes | yes | no | no | 10 % | no browser test of the new permit classes |
| CLI parity | n/a | n/a | n/a | n/a | n/a | `packages/cli` has no relayer sweep command; not in scope of the CLI spec today |

## 3. Changes in this branch

| Commit | Change |
|---|---|
| `f61d6da` | `stateStore.ts`: atomic single-file journal, strict decoder, heartbeat lock |
| `7b80424` | Journal wired into `service.ts` (record before signing, hash before broadcast, restore on start); `DailyBudget` restore and forward-only day (fixes budget reset on a clock step back); required `state` config key; new gauges |
| `e55262f` | (worker) `diagnoseSignedPermit`, `ChainClient.readPermitState`, `SendOptions.onSigned`, RPC tx-hash identity checks, web class mapping |
| `e9cd69e` | Permit failure classes in the relayer; `state_unavailable`; restart / journal / lock / config tests |
| `34314fd` | Anvil test: restart with a pending broadcast |
| docs commit | README, PRIVACY, threat model 6.3a/6.3b, spec 04 acceptance, CI `tx.origin` gate, stale `REQUIRE_ANVIL` notes |
| `5d16651` (merged) | (worker) `ops.ts`, Dockerfile digest pins + volume + HEALTHCHECK, systemd hardening, nginx 16k body, compose state volume, container smoke script, runbook |
| `452afba` | `ops state` day display for a chain with no stored state |

Defects fixed: (1) a restart reset the daily budget and forgot unsettled transactions (exposure could exceed
`dailyBudgetWei` per restart); (2) a clock stepped back across midnight reset the daily budget; (3) the RPC's
`eth_sendRawTransaction` answer was trusted as the transaction hash; (4) spec 04 permit states were folded into one class.

## 4. Review

Two AI-assisted reviewers, neither the author: A (adversarial security), B (correctness and accounting). Findings and
their resolution: see the section appended below once complete.

## 5. Evidence (sandbox)

- `REQUIRE_ANVIL=1 npm test -w apps/relayer`: 12 files, 408 tests, coverage 97.4 / 93.8 / 96.2 / 98.6 (thresholds
  95/90/95/95). Baseline before this branch: 9 files, 313 tests, 97.55 / 92.95 / 97.05 / 98.75.
- `typecheck` and `lint`: relayer, chain-adapters, web clean.
- Container smoke (`apps/relayer/deploy/smoke-anvil.sh`, local anvil, read-only rootfs, `--cap-drop ALL`, uid 65532):
  passed, including HEALTHCHECK healthy and SIGTERM exit 0. The sandbox build needed proxy/CA build flags
  (`SMOKE_DOCKERFILE`, `SMOKE_BUILD_FLAGS`); the committed Dockerfile does not.
- Tooling: anvil/forge 1.8.5 (CI pin), solc 0.8.28 from the GitHub release.
- CI on PR #118: see the PR; a green aggregate with skipped jobs is not evidence.

## 6. Remaining external acceptance gates (human or infrastructure)

1. Public testnet run (Base Sepolia or Sepolia) with a funded throwaway hot key: quote, permit sweep, front-run, owner
   drains first, restart with a pending transaction.
2. Measure gas units and loss rates there; set `gasUnits`, `griefReserveBps`, budgets from measurements.
3. Run the compose recipe behind real TLS; verify `X-Forwarded-For` bucketing end to end.
4. Start the systemd unit on a real host; verify `StateDirectory`, restart, and lock takeover timing.
5. Prometheus scrape and alert webhook delivery to a real receiver.
6. Load test (quote flood, sweep queue saturation) against a local or testnet node.
7. Independent professional security review before any mainnet use; `ALLOW_MAINNET=1` needs owner authorization.
