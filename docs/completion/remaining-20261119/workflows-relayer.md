# Optional relayer and limiter recovery

Implementation: `e7b148442753121c32f733328bb07bb4f28869d0`.
Regression checkpoint: `ba54af382df5beefb11a5fe2455b59d99a9a1e87`.
Claim: `c5257dc1a344bc6923fd31c2d02d43078b480fdc`; base `d84292a3`.
Source: selective PR #218 delta, `5467c158..b1327d4d`.

## Recovered behavior

The optional relayer now limits open peer connections and reserves per-client lane tickets
before its first asynchronous admission step. A ticket remains held until the job settles.
Trusted proxies keep their existing exemption, and peer tracking uses per-process keyed
hashes instead of logging addresses. Global queue limits remain active.

Canonical signature admission rejects high-S and non-27/28 signatures before chain work.
Malformed HTTP targets return the fixed 400 class. Header and request timeout checks run
every second. A failed logging sink or stdout stream loses its line without taking down the
request handler. Configured fee recipients must match a supplied signed deployment manifest;
the devnet companion uses that manifest recipient too.

Consecutive quote gas-price lookup failures can open the circuit breaker. Successful quote
reads reset that streak; they do not dilute the send/receipt failure window. Quote reads
neither consume a half-open sweep probe nor extend an already-open cooldown.

The shared limiter defaults to bounded per-group overflow buckets, with the global bucket
as last resort. Its eviction search examines at most eight oldest entries. Loss-budget
reservation protects entries already resolved within the same operation from eviction.
New diagnostics contain counts only. The web client recognizes `client_queue_full` as a
pre-broadcast refusal and tests both directions of the public error-code contract.

## Executed evidence

| Check | Actual result at `e7b14844`, except stated baseline |
|---|---|
| Relayer baseline hardening | 23 failed / 7 passed at `ba54af38`; six cleanup socket rejections retained in the raw log. |
| Limiter baseline abuse | 8 failed / 7 passed at `ba54af38`, including actual overflow/eviction/reservation defects. |
| Focused relayer hardening, privacy, config | 154/154 passed, no skips, 12.506 s. |
| Full relayer-guard coverage | 183/183 passed, no skips, 6.675 s. Coverage: 98.92% statements, 94.55% branches, 99.28% functions, 99.53% lines. |
| Exact-source contract artifact build | Forge 1.8.5 / solc 0.8.28, offline build passed, 42.937 s. No contract source change. |
| Full relayer coverage, including Anvil | 518/518 passed across 20 files, no skips, 65.696 s. `REQUIRE_ANVIL=1`; coverage: 96.92% statements, 92.58% branches, 98.13% functions, 98.77% lines. |
| Pool consumer selection | 35/35 passed; service, HTTP and Worker B suites, 7.310 s. This worktree's source only. |
| Web client consumer | 34/34 passed, 5.105 s. |
| Relayer-guard build / full typecheck | Passed, 3.575 s / 4.015 s. |
| Relayer build / full typecheck | Passed, 9.662 s / 22.285 s. |
| Full relayer ESLint | Passed, 53.585 s. |
| Full relayer-guard ESLint | Passed, 15.944 s. |
| Web-only client ESLint | Both affected files passed, 37.450 s. |
| Devnet companion syntax | Node `--check` passed; no claim of executing the full devnet script. |

All coverage thresholds and test budgets are unchanged. Checks used Node 22.23.4 and
Vitest 5.1.0 with a 768 MiB Node cap. Heavy commands held the existing qualification mutex
one command at a time with `flock --close`; separate lint processes avoided combining
TypeScript projects. Dependencies are independent matching-lock copies, not a claimed fresh
successful npm install. Exact commands, exit codes, timestamps, source revisions and raw-log
hashes are in [workflows-relayer.json](workflows-relayer.json).

## Preservation and review

The only three-way conflict was the config top-level allowlist: both `server` and the newer
`privacy` key are retained. Privacy types/parser, zero-log wrapper, body-unpadding helper,
`runtime.ts`, dependency manifests and lockfile are unchanged. Existing privacy/padding
regressions passed with the recovered source. No excluded owner stream was edited.

The coordinator independently reviewed the runtime changes and regressions and reported
PASS on `e7b14844`. An internal-only API caveat remains documented: `LaneTicket.release()`
does not mark the ticket used, so a direct caller could submit after release despite the
comment. The service's actual control flow cannot do this; no HTTP-path defect was shown.

## Remaining acceptance and cost accounting

R07-4 is **open and not implemented by this recovery**. The historical source added only a
record that quote/send checks, reservations and settlement count execution gas. A dedicated
follow-up will inspect whether the existing OP-stack fee helpers and transaction data can
support total-cost accounting. No external blocker is asserted before that investigation.

The obsolete out-of-lane pre-simulation design was not restored: today's serial lane checks
funding and order state before simulation, while the new per-client ticket supplies admission
fairness. Multi-bucket floods can still occupy cheap-read lane work within the existing global
queue, rate and loss bounds. No new hosted relayer or public-chain acceptance is claimed.
The combined candidate's pool changes and hosted gates remain coordinator-owned.
