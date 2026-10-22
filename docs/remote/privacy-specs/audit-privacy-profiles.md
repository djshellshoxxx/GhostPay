# Self security review: `@ghostpay/privacy-profiles`

AI self-review by the build agent, not an independent audit. Date 2026-10-21. Scope: `packages/privacy-profiles/src`. Testnet PoC; pure logic, no wallet, RPC, relayer or chain involved.

## Threat model

Asset: the honesty and safety of what the UI tells and lets a user do. Misuse addressed: contradictory options, options needing a service the user lacks, over-claiming, acting on a non-testnet chain. Adversaries: (A1) a buggy or malicious caller that asserts false capabilities (not defended; stated in README), (A2) tampered stored settings (defended by `sanitizeSelection`), (A3) a forked client that ignores verdicts (not defended). The package has no I/O, no secrets, no randomness, no clock.

## Findings

| # | Sev | Finding | Status |
|---|---|---|---|
| 1 | Med | Capabilities are caller assertions; a false `selftest-ok:*` or `test-mode` lifts blocks | By design, documented; method packages keep their own guards. `test-mode` must never be set in production builds (wiring doc) |
| 2 | Med | Stored selection could pre-acknowledge or select operator/stub values | Fixed: `sanitizeSelection` keeps only known acks, selectable options and known values; evaluate also blocks unknown/non-selectable values |
| 3 | Med | Preset could auto-ack or enable weak/experimental/test-only values | Fixed and tested: acks never added by `applyPreset`/`setOption`; policy filter; PP-10..13 property tests |
| 4 | Med | `null` chain id passes the guard in `settings` | Accepted, listed in DEVIATIONS (no transaction is built); all other actions block |
| 5 | Low | `[new]` rules (R-12..R-15, R-18, R-22, R-32, R-41..R-46, C-04/06/07/14/17/34) may over- or under-block | Conflicts default to blocking; listed for owner review |
| 6 | Low | Honest-label vocabulary: banned words only checked by grep over `src` | Test PP-9 passes; app copy must be checked in apps/web |
| 7 | Low | Spec-id cross-check is a substring search; an id mentioned only in prose passes | Accepted |
| 8 | Info | Preset greedy order may hide better combinations | Order documented; `confidential-amount` exists for the CT case |
| 9 | Info | Performance: `applyPreset` about 15 ms (many evaluations); `evaluate` sub-millisecond; PP-19 bench not run | Informational |

## Controls verified (what was run)

176 tests in 5 files; coverage 97.07 / 93.93 / 98.95 / 98.66 (statements/branches/functions/lines) with thresholds 95/90/95/95; `npm run typecheck` and `npm run lint` clean. Tests include every rule R-01..R-46 positive and negative, spec 8.1 matrix cells, fast-check totality/determinism/monotonicity/ack invariance, spec-id cross-check against the spec files, purity and banned-word greps, four preset snapshot contexts, chain rule and step data checks. Manual mutations (delete R-11, R-12, R-29; flip a default) each fail tests.

## Not verified

UI wiring; real capability detection; third-party standards (RFC 2119/8174 unreachable); end-to-end pipeline behaviour (pipeline package); PP-19 benchmark.
