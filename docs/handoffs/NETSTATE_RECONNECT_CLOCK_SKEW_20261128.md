# Network-state reconnect clock-skew repair — 2026-11-28 UTC

- Base: main `70458ebe3ae4a5502d7c39ae25d37342dbde971b`.
- Ownership commit: `722ed876ee471c8bafb7ae42908db5158c423a8d`.
- Regression-first commit: `fadc52bbc13dcec67d0cee449b5b7a497eea3e85`.
- Fix commit: `763bc8ace72f10f9baef0edf3e056c3410fc2916`.
- Original runtime blob: `18a29c06d6a33d4023759a5236bb07cfe85ffee2`; repaired runtime blob: `992ffecb66c3b6bdfa40c0fbb709aad07cb78f4b`; both match isolated locally executed files.

## Observed defect

The existing `reduceNet` browser-online transition resets reachability to unknown, but retains `clockSkewSec`. The existing `summarize` then returns CLOCK_SKEW from that obsolete observation, contradicting the documented requirement that reconnect invalidates the result so the user rechecks. Positive and negative skew and multiple chains reproduce it. Clear only the clock-skew observation during the existing reset. No new network actions or state, no change to fresh warning thresholds or transaction behavior.

## Evidence

Node 22.16.0 with native TypeScript stripping, synthetic injected events, no network: original 8/12 assertions passed (four failures); repaired 12/12. Strict standalone TypeScript 5.8.3 compilation passed (strict, exactOptionalPropertyTypes, noUncheckedIndexedAccess, ES2022, NodeNext). Controls cover fresh positive/negative warnings, normal recheck, offline, degraded, down, stale, healthy reset and immutability. Regression file added before production fix; repository Vitest not run locally (GitHub DNS resolution failed). Standalone package behavior only; no active Pages call-site or browser failure demonstrated and no new wiring proposed.

## Gates

160 enumerated open PR changed-file inventories checked before edits: no netstate overlap; #772/#773 rechecked after head movement. Main registry reviewed for direct claims. Refresh ownership before any integration. Generation 78 lease observed released, not acquired. Exact-head hosted CI, independent review, any applicable browser qualification and legitimate integration ownership remain mandatory. Keep draft until qualified. All ten owner exclusions preserved; no excluded modules, archive refs, dependencies, wallets, contracts, funds, deployment or release touched.
