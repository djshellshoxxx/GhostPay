# FUTURE ONLY — Selectable privacy modes and truthful disclosures

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Provide Standard, Enhanced and Maximum privacy presets enforced as testable policy, not marketing claims.

## Proposed user workflow

- Standard uses encrypted local records and no analytics; Enhanced adds separate identities and network controls
- Maximum requires an explicitly chosen private path and fails closed on loss of that path
- Mode screen shows residual wallet/RPC/chain/counterparty visibility and requires consent to downgrade

## Future requirements and interfaces

- Versioned declarative policy binds network, identity, signer and local-storage settings
- Unsupported capabilities show degraded/not available rather than implying privacy protection
- Never silently switch from Maximum to Standard; browser/extension network cannot be controlled by the app
- Changes apply prospectively, not retroactively to existing on-chain events

## Privacy boundary and information that remains observable

- No preset provides absolute anonymity on public EVM/Bitcoin chains
- External wallets and fiat counterparties have independent information channels
- Previously disclosed information cannot be erased by raising a privacy preset

## Future acceptance and security tests

- No direct network egress after private-required connection failures
- Settings persist encrypted and unsupported-browser states fail safely
- UI disclosures match instrumented traffic and transaction behavior

## Dependencies and promotion criteria

Private RPC, per-client identity, encrypted vault and monitored app network policy.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [privacy-limits.md](../../user/privacy-limits.md)
- [05-private-rpc-padded-queries.md](../../specs/ideas/05-private-rpc-padded-queries.md)
