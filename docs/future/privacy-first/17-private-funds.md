# FUTURE ONLY — Privacy-first sweeping and offline fund management

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Make receiving, gas funding, sweeping and withdrawals less prone to linking sensitive payment identities.

## Proposed user workflow

- Watch-only mode reviews incoming funds without spend keys
- Withdrawal shows full signed chain/amount/fee/destination details and linkability preview
- Offline or hardware signer approves bounded intent; local journal monitors result without blind resubmission

## Future requirements and interfaces

- Keep signing keys and sensitive key derivation local or offline; no relayer receives seeds
- Each signing intent has explicit recipient, nonce, chain, asset, expiry and max fee
- Prefer fresh destinations, while clearly showing remaining public-source and timing links
- Reconcile unknown outcomes before re-signing, and distinguish Ethereum from Bitcoin spending flows

## Privacy boundary and information that remains observable

- The payer already knows the one-time received address and can follow public sweeps
- Relayers may see destinations, amounts and timing
- Gas funding and shared exit wallets may link otherwise separate payments

## Future acceptance and security tests

- Signer substitution, wrong network and modified destination rejected
- Partial sweep, insufficient gas, relayer outage, crash and nonce collision recovery tested
- No spend/view keys in logs, browser export or external HTTP requests

## Dependencies and promotion criteria

Transaction reviewer, signing boundary, provider verification and security audit.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [06-watch-only-airgapped-signer.md](../../specs/ideas/06-watch-only-airgapped-signer.md)
- [01-sweep-and-link-hygiene.md](../../specs/ideas/01-sweep-and-link-hygiene.md)
- [sweep-and-gas-privacy.md](../../user/sweep-and-gas-privacy.md)
