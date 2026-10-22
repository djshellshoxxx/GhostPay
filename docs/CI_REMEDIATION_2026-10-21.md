# GhostPay CI remediation and release gates

## Observed baseline
PR #17 head `6bf5ae0b18404acdca492c8d44dddbc4d5eb3e9e`. GitHub Actions CI run `39704056256` has failures in `ts-check` (`npm run lint`) and `ts-test (web)` (`Unit tests`). The `typescript` aggregate fails because required jobs failed. Other observed jobs including contracts tests, Slither, coverage, relayer tests, E2E and integration passed. Do not merge solely because integration is green.

## Immediate work order
1. Inspect failed job logs and capture exact lint diagnostics and failing web test names; reproduce on the PR head with lockfile-frozen installs.
2. Fix lint defects and failing web tests at their source, not by disabling checks or weakening assertions. Add regression coverage for each functional fix.
3. Run affected tests, full workspace lint/typecheck/unit tests, contract suite, static analysis and E2E; repeat on a clean checkout and verify no generated or secret files are committed.
4. Validate stealth-address derivation and recovery using independent test vectors; check chain IDs, domain separation, key serialization, announcement scanning, payment attribution, replay resistance and incorrect-network rejection.
5. Exercise local Anvil and public testnet scenarios with disposable funded wallets: native/token payments, gas sponsoring, insufficient gas, reorgs, RPC failure, cancellation, duplicate payment, stale quotes and sweeps. Verify contracts and deployment manifests by on-chain readback.
6. Audit fee vault accounting, reentrancy, permissions, upgradeability, rounding, token quirks, transaction simulation, and UI signing boundaries. Record unresolved findings with severity and owners.
7. Verify QR encoding/decoding, privacy of payloads, accessibility, responsive mobile UI, browser matrix, i18n fallbacks, CSP, dependency/SBOM scanning and documentation.
8. Only mark PR ready when all required checks pass and reviewers accept the risk register. Merge then tag a testnet-only prerelease before any production deployment.

## Required evidence
Attach CI links, test reports, reproducible commands, testnet chain IDs and contract addresses, manifest hashes, security findings and mitigations, wallet test receipts without keys, browser/device matrix, and explicit release approval. No real private keys or seed phrases in CI, issues or logs.

## Release blockers
Any failing required CI job; missing real-wallet test evidence; critical/high unresolved security findings; unverified deployed bytecode or chain configuration; missing recovery and incident-response drill.
