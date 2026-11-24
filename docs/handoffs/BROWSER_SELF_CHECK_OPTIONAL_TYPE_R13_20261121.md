# GhostPay R13 — exact optional provider shape CI repair, stacked on #395

## Scope and source pins
- Parent PR #395 exact head at branch creation: `1edc524e69554e4a45017858c7e3e25c46dae419`; `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Isolated branch: `fix/ghostpay-browser-selfchecks-optionals-r13-20261121`. Claim: `405d282efa38cffb5a428e14c0133c886b7e53bb`; test-first: `739e2bef13be5b751206353e741154ec432e3fdc`; runtime fix: `30d16f50fd9e629c05ea7959297f00fe9a1d4fd3`.
- Owned only: `apps/web/src/lib/browserChecks.ts`, `apps/web/src/lib/browserChecks.test.ts`, append-only `docs/ai/ACTIVE_WORK.md`, this handoff. No payment, wallet authority, custody, release, build workflow, dependency or network modifications.

## Reproduction and correction
- Existing parent #395 Hosting kit [run 44899184722](https://github.com/djshellshoxxx/GhostPay/actions/runs/44899184722), job `136831267457` rejects TypeScript `TS2375` at `browserChecks.ts:36`: explicitly returned `digest: undefined` / `storage: undefined` do not satisfy optional properties with `exactOptionalPropertyTypes: true`.
- Parent Beta acceptance [run 44899184813](https://github.com/djshellshoxxx/GhostPay/actions/runs/44899184813), job `136831267377`: lib and CLI completed, browser Playwright web server failed exit 2. This may share the build failure but causality is **not yet proven**.
- Regression adds a deterministic denied-storage + absent-WebCrypto case, verifies provider properties are truly omitted, and verifies fail-closed secure/digest/storage outcomes. Baseline returns explicit undefined fields and would fail the new property-absence assertions.
- Source fix changes only the environment object construction to include `digest` and `storage` when defined, keeping their existing values and all fail-closed behavior unchanged.

## Verification and next gates
- GitHub exact files and parent head verified before writing; baseline failure is source-derived, **not a locally executed RED run**.
- Local `git ls-remote` attempt failed: container could not resolve github.com. Full repository Vitest, TypeScript, lint, build, browser, Tor and acceptance checks are **NOT RUN** locally. These must be obtained through exact-head hosted CI and inspected before integration.
- Obtain independent review, integrate this child into **#395 only**, then requalify the combined parent head for CI, Hosting kit, Beta acceptance, Pages and browser/device/lean layouts. Do not merge straight to main or deploy.
- Concurrent integration lock: `automation/ghostpay-integration-lock:integration-lock.json` remains **held** by `994a0d214fb9-root-r3`, generation **11**. This worker did not touch it.
