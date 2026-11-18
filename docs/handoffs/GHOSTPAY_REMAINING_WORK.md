# GhostPay remaining work, blockers and owner decisions (2026-11-18)

Still experimental and unaudited. Nothing deployed, enabled for mainnet, or published. Nothing merged to `main`.

## Verification gates NOT run in this environment (container has no `forge`, `anvil`, `slither`, `gitleaks`; no Playwright browsers)
- Foundry build/tests, contract format + NatSpec, Slither, coverage: **not run** (hosted CI only). No `.sol` was edited.
- All Anvil-dependent tests are skipped locally (payer-sponsor 4, pool-relayer 9, apps/relayer 5, plus chain-adapters/pool-circuits skips). The known issue that a test must not silently skip when CI requires Anvil remains unverified here (`REQUIRE_ANVIL=1` not exercisable).
- Playwright E2E, reproducibility (`repro-check`, `qualify-lean`: need two clean clones), signed-release/attestation, secret-scanning with gitleaks: **not run**. The repo's own `scan-secrets`, `check-actions-pinned` (109 SHA-pinned refs) and `check-tx-origin` scripts did pass.
- CodeQL: both new `js/polynomial-redos` alerts on #157 were fixed in source; confirmation needs a CI run on the branch.

## Owner decisions
1. **Lean scope**: the Registry view ships in the lean bundle (static `AppShell` import) though deferred-by-name; decide keep vs gate, then fix the `AppLean.tsx` comment. Decide fate of the 6 `PENDING_OWNER_REVIEW` deps in the lean source closure.
2. **Reverted payment guard** (`fix/remediation-f95457fd-22ecf9`): baseline reverted it without a recorded reason. Decide whether to re-introduce a narrower version (flag only unscoped legacy payment records).
3. **Vendored `viem` tarball** (4 Oct branches): accept or reject importing a repacked dependency binary and the rewritten `normalize-sbom.mjs`.
4. **Agent infrastructure**: independent review of #152 / `automation/*` / `codex/setup-autonomous-agent` was not done; dependabot actions bump needs SHA pins.
5. **AUD24-01** policyHash in router calldata (privacy/design call); S3-01 manifest trust root (`RELEASE_KEY`).
6. **PR #164** was closed without merge on 2026-11-18. The work is on `claude/lucid-meitner-apalzc`; say if you want a new PR.
7. Merging to `main` requires explicit owner authorization.

## Engineering follow-ups
- B-W4/W5/W6 (relayer/sponsor hash trust, unknown-outcome tracking, duplicate-in-flight); paymaster `validAfter<=validUntil` + `WrongChain` NatSpec; Haiku R2 F5/F6; `check-tx-origin` inline-comment gap.
- Read line by line: rest of `Scan.tsx`, `Pay.tsx`, ops-monitor lifecycle; re-run dependency audit; SOLANA-TRON-10..12.
- Dependabot npm updates (regenerate lockfile + full CI). Docs-only branches (8) were not content-reviewed.
- PR inventory is partial (only 30 newest open PRs read; closed PRs not enumerated). Branch inventory is complete.
