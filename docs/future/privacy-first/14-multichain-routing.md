# FUTURE ONLY — Privacy-aware multi-chain routing

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Offer optional chain/asset choice without accidentally correlating identities or silently using unaudited bridge infrastructure.

## Proposed user workflow

- Payer compares validated networks, token support, fees and privacy disclosures
- App prefers direct supported-chain payment when chosen
- Cross-chain swap or bridge is an independent transaction with explicit operator disclosure

## Future requirements and interfaces

- Signed allowlisted chain/token registry with verified deployment and token decimals
- Per-chain cryptographic identity isolation and chain-specific formats where needed
- Never silently route through unqualified contracts, trusted intermediaries or arbitrary liquidity sources
- Separate quote expiry, conversion risk, and original invoice settlement status

## Privacy boundary and information that remains observable

- Bridges and public ledgers often expose source/destination linkability
- Amounts and timing remain public on many networks
- A network choice does not guarantee anonymity or shielded amounts

## Future acceptance and security tests

- Unsupported chains, wrong decimals, forged manifest/codehash and stale quotes refused
- Independent chain verification prevents false invoice 'paid' state
- Routing UI shows observer/disclosure differences by selected route

## Dependencies and promotion criteria

Chain qualification, signed manifests, wallet compatibility, and explicit exchange integration.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [MULTICHAIN_SPEC.md](../../MULTICHAIN_SPEC.md)
- [09-chain-token-deployment-matrix-and-pins.md](../../specs/09-chain-token-deployment-matrix-and-pins.md)
