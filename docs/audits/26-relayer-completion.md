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

Two AI-assisted reviewers, neither the author, read the diff `364b1f1..` and reproduced findings with throwaway tests:
A (adversarial security), B (correctness and accounting). This is not an independent professional audit.

| # | Severity | Finding | Source | Resolution | Regression test |
|---|---|---|---|---|---|
| 1 | Medium | A failed journal removal kept the record on disk while the next write saved the released budget; after a restart the record was settled again (double release, budget understated) | A4, B1 (confirmed) | Settlement mutations apply in memory, mark the journal dirty and are persisted by the next write or `flush()`; only `addSend` and the pre-broadcast hash stay write-through | `restart.test.ts` "review B1/A4", `stateStore.test.ts` "review B1/A4" |
| 2 | Medium (availability) | Failed removals piled up against the 64-record cap, then every sweep got `state_unavailable` | B2 (confirmed) | Same fix | `stateStore.test.ts` "review B2" |
| 3 | Medium | SIGTERM released the lock before draining; a replacement could take over while queued jobs still wrote; lock loss still drained queued sends | A1 (confirmed) | `main.ts` releases after `server.close()`; journal writes are fenced by the lock token, so a process without the lock cannot start a send | `stateStore.test.ts` "write guard", `runtime.test.ts` lock-loss test |
| 4 | Medium | Same pid and host took over a live lock (two pid-1 containers sharing hostname and volume); acquisition was not exclusive | A2, B4 (confirmed at unit level) | Random per-process token; same-instance takeover only after 15 s without heartbeat; missing lock created with `link()` (exclusive); takeover read back | `stateStore.test.ts` "review A2/B4", "exclusively" |
| 5 | Medium | One far-future clock reading was persisted and pinned the budget (permanent `budget_exhausted`); `ops state` hid it | A3, B5 (confirmed) | Day more than one ahead keeps its spending on today's day (restore and in memory); `ops state` flags a day ahead of the clock and counts its spending | `units.test.ts` "review A3/B5" |
| 6 | Low-medium | `reconcile-report` called a hashless `signed` record "never broadcast" and a free-nonce `pending` record "released" | A5, B3 (confirmed) | Branches on status, mirroring `restore()` | `ops.test.ts` reconcile-report cases |
| 7 | Low | `/healthz` stayed `ok` while the journal could not be written | B6 | `degraded` while the journal is dirty | `restart.test.ts` "review B1/A4" |
| 8 | Low | systemd `@resources` filter without `SystemCallErrorNumber` kills with SIGSYS; startup hid `StateError` messages | A6 (plausible) | `SystemCallErrorNumber=EPERM`; `main.ts` prints `StateError` messages | not testable in sandbox (systemd not run) |
| 9 | Info | Decoder echoed unexpected key names from the file | A7 | Message no longer names the key | `stateStore.test.ts` decoder cases |
| 10 | Test weakness | The post-broadcast write-failure test could pass with finding 1 present; the anvil "no duplicate nonce" check alone holds even without the journal (anvil's mempool supplies the nonce) | B7 | Added the service-level regression for 1; the anvil test's budget assertion is the part that depends on the journal (documented here) | — |

Re-review of the fix commit `b1e350d` (a third AI-assisted reviewer) confirmed items 1-4 and 6 resolved and found:

| # | Severity | Finding | Resolution | Regression test |
|---|---|---|---|---|
| M1 | Medium | Any heartbeat error (also a transient disk error) shut admission down and left the process alive answering 503 forever (no supervisor restart) | `StateLockLost` only for another token; I/O errors retried; 25 s without a beat or a takeover -> drain and exit 1 (`main.ts`) | `runtime.test.ts` "re-review M1", `stateStore.test.ts` "re-review M1" |
| M2 | Medium-low | The far-future clamp let a wall clock flapping by two or more days grant a fresh budget per flap | Day rollover needs both wall and monotonic clocks past midnight (slew tolerance 10 min, re-anchored); the backward-adopt branch removed | `units.test.ts` "re-review M2", step-forward test |
| L1 | Low | `reconcile-report` treated later `signed` records like the first | Mirrors `restore()` | `ops.test.ts` "re-review L1" |
| L2 | Low | A fresh lock without a token (older version still running) was taken over at once | Any fresh `beatMs` blocks | `stateStore.test.ts` "re-review L2" |
| L3 | Low | The fence is check-then-write: a holder paused > 30 s can write once after a takeover | Documented (README, residual) | — |
| L4 | Low | Any `link` failure was reported as "locked by another process" | Only `EEXIST` is busy; others name the hard-link requirement | not reproducible in sandbox |

Accepted, not changed: high-s permit signatures are classified `sig_invalid` although a raw-`ecrecover` token would accept
them (message only; the simulation decides); synchronous fsyncs (about four per sweep) can stall the event loop on a slow
disk (performance; one transaction per chain at a time); a malicious RPC can still fake receipts and nonces (inherent).

## 5. Evidence (sandbox)

- `REQUIRE_ANVIL=1 npm test -w apps/relayer`: 12 files, 422 tests, coverage 97.3 / 93.5 / 96.6 / 98.5 (thresholds
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
