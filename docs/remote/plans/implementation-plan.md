# Implementation plan

Branch `claude/remote-extensions-3`, 2026-10-21. Specs: `docs/specs/`. Owners are roles (assign names): CA = chain-adapters, WEB = apps/web, REL = apps/relayer, CON = contracts, BTC = btc-silent-payments, DOC = docs/ADR, OWN = project owner. Estimates are single-engineer days, unverified guesses.

## Phase 0 - Trust and correctness (week 1-2)
| Item | Spec | Owner | Days |
|---|---|---|---|
| Disable fiat option | 03-A | WEB | 0.5 |
| Manifest read-back | 01 | CA, WEB, REL | 5 |
| Scanner robustness + payment verification | 02 | WEB, CA | 6 |
| Permit classifier + fallback | 04 | CA, REL | 3 |
Gate G0: all unit + anvil tests green in CI; Playwright shows Pay blocked on readback failure; fuzz scanner 1M logs no throws; no regressions in router/relayer suites; docs updated (DEPLOYMENT_MANIFEST s3, SPEC_REVIEW C5).

## Phase 1 - Privacy and ops hardening (week 3-5)
06 ERC-6538 (CA S, WEB M), 05 spam/anonymity (WEB, CA, DOC), 07 metrics (REL), 08 archive/rotation (WEB), 09 matrix + ADR-0016 (CA, DOC; needs network access by OWN or operator).
Gate G1: spec acceptance lists for 05-09 ticked; IndexedDB inspection shows ciphertext only; metrics canary test shows no addresses; matrix lint in CI; relayer monitoring runbook merged; independent self-review recorded in `docs/reviews/`.

## Phase 2 - Scanning and Bitcoin (week 6-10)
10 Feature 5 stage 1 (CA, WEB), 03-B feed registry (CA, REL; needs verified feed addresses from OWN), 11 BIP-352 hardening (BTC, then WEB behind flag), 12 light-client modes A/B (BTC).
Gate G2: outgoing-request audit test; official BIP-352 vectors + negative vectors; regtest e2e; fork tests per feed before `verified:true`; ADR for ChainAdapter union types merged before web Bitcoin wiring.

## Phase 3 - Contract-touching and long-lead (after audit slot, week 10+)
13 gas buffer v2 (client first; permit+buffer needs CONTRACTS_SPEC edit + audit), 14 embed profile, ADRs 0017/0018 (DOC, 2 d, can run any time), 16 recovery design ADR then 15 ADR-0019 decision, 17 escrow only after custody/legal decision.
Gate G3: CONTRACTS_SPEC updated before code; fuzz/invariants extended; external audit report on exact commit; manifest version bump; ADR-0014 follow-up signed off.

## Owner-gated (parallel, not blocking Phase 0-2 code)
Testnet deployment and smoke script, release key and fingerprint, hosting (ADR-0015), licence/terms/sanctions, feed and token address verification, external audit booking.

## Cross-cutting verification
Every PR: `forge test` (if contracts), TS unit tests, anvil e2e, Playwright egress, `scan-bundle.mjs`; threat model entry updated; spec acceptance boxes ticked in PR description; UNVERIFIED claims either verified with source+date or left marked. Dependencies: 01 -> 02 -> 05/10; 03 -> 13; 04 -> 07/13/15; 09 -> 06/13; 11 -> 12; 16 -> 15 build.
