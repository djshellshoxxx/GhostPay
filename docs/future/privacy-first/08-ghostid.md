# FUTURE ONLY — GhostID: portable independent merchant identities

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Enable verifiable pseudonymous merchant profiles without mandatory legal identity, centralized handles or global account linking.

## Proposed user workflow

- Merchant creates separate signed profiles per project/audience with independently held signing keys
- Customer verifies fingerprint/profile origin and can pin merchant identity
- Merchant rotates or retires profile keys with documented continuity and revocation

## Future requirements and interfaces

- Versioned signed profile; local optional names and public fields; no GhostPay global directory
- Identity keys separate from viewing/spending secrets and scoped to personas
- Support signed rotation, expiry, domain ownership display and local trust-on-first-use pinning
- Do not falsely equate a verified signature with a real-world identity

## Privacy boundary and information that remains observable

- A merchant who publicly reuses a pseudonym is linkable within that persona
- Profile hosts/domains can learn visitors and may impersonate unsigned content
- Names, logos and contact fields are public when intentionally published

## Future acceptance and security tests

- Profile substitution, mismatched fingerprint, forged rotation and stale signature detected
- Independent personas share no identifying bytes unintentionally
- Untrusted remote assets and external profile URLs never auto-load

## Dependencies and promotion criteria

Identity derivation, merchant profile format, address-safety and local contact pinning.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [14-embed-merchant-profile.md](../../specs/14-embed-merchant-profile.md)
- [03-per-client-meta-addresses.md](../../specs/ideas/03-per-client-meta-addresses.md)
