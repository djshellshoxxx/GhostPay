# Swarm 7 worker brief (shared)
Package scaffolded at packages/ux-<name> (package.json, tsconfig, vitest.config pinned; DO NOT edit those or lower thresholds 95/90/95/95; do not add deps; no new crypto libs; WebCrypto `globalThis.crypto` allowed).
Rules: strict TS, ESM `.js` import suffixes, pure logic, NO DOM/UI/network/analytics/timers-with-globals (inject clock/rng/rates), TSDoc with @security tags, exact fake test data only (no real addresses/keys), tests with real numbers + negative/adversarial cases + fast-check where useful.
Deliver (touch ONLY these paths, no git commit):
1. docs/remote/usability/specs/<id>.md per feature: requirements + acceptance tests.
2. packages/ux-<name>/src/** (+ tests, update README, export via src/index.ts; index excluded from coverage).
3. docs/remote/usability/wiring/ux-<name>.md: exact UI wiring plan for apps/web (files, components, state, i18n keys, e2e ideas).
4. docs/remote/usability/audit-ux-<name>.md: threat model, findings (severity/evidence), fixes, unverified items.
Verify: in package dir run `npm run typecheck && npm run lint && npm test`. Fix until green. Report <150 words: files, test counts, coverage, unverified. Honest only.
Privacy: no third-party calls, keys local, no custodial. Untrusted input (links, CSV, imports) must be strictly validated.
