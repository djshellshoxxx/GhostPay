# FUTURE ONLY — Private scanning, RPC and broadcast paths

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Minimize network-origin and query disclosure when scanning or broadcasting without claiming to hide public chain data.

## Proposed user workflow

- User chooses self-run RPC, onion endpoint, Tor Browser, local proxy or direct connection
- App shows actual reachable status and observable disclosures
- Private-required mode fails closed on endpoint outage, with only explicit temporary downgrade

## Future requirements and interfaces

- Reuse existing private RPC/fixed-window proposal and browser limitations
- Centralize every app-owned RPC request behind one policy enforcement layer and restrictive CSP
- No hidden direct RPC fallback; injected wallets may use their own separate endpoints
- Optional aligned/padded log windows and provider cross-check must be measurable

## Privacy boundary and information that remains observable

- Tor transport does not hide transaction fields or queried ranges from RPC servers
- Browser applications cannot independently force an OS Tor circuit
- Relayers, wallet extensions and hosting providers may remain observers

## Future acceptance and security tests

- Browser network capture shows zero direct fallback in private-required mode
- Simulated outage, mixed-content failure, CORS and reorg handled honestly
- UI never says 'verified anonymous' merely because a toggle is selected

## Dependencies and promotion criteria

Existing RPC adapter, private transport proposal, browser CSP and test fixtures.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [05-private-rpc-padded-queries.md](../../specs/ideas/05-private-rpc-padded-queries.md)
- [10-feature5-stage1-private-scanning.md](../../specs/10-feature5-stage1-private-scanning.md)
