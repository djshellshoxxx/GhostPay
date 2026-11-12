# FUTURE ONLY — Encrypted offline backup and complete recovery

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Provide reliable independent recovery of keys, merchant history and derived identities without cloud accounts.

## Proposed user workflow

- User exports authenticated encrypted archive with contents/version preview
- User independently verifies decryption and recoverability before trusting backup
- Fresh profile restore validates and atomically applies compatible data without overwriting current vault

## Future requirements and interfaces

- Use reviewed KDF/AEAD parameters and versioned envelopes; no custom cryptography
- Include unresolved transaction journal, child identity index, contacts and receipt history where enabled
- Separate watch-only recovery material from signing material and label scope precisely
- No automatic remote upload or secret-bearing logs/filenames

## Privacy boundary and information that remains observable

- A lost password/seed without recovery material cannot be restored
- Anyone with the archive can attempt offline password guesses; strength and KDF matter
- Manual backup copies may be accessible to storage operators if users upload them

## Future acceptance and security tests

- Corrupt, wrong-secret, downgraded and rollback archives fail without mutation
- Independent reconstruction finds all derived receiving identities and recorded pending funds
- Cross-device restore plus confidential-data leak checks

## Dependencies and promotion criteria

Existing keystore, local store, versioned migrations and child-identity design.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [backup-bundle.md](../../remote/usability/specs/backup-bundle.md)
- [04-encrypted-backup-restore.md](../../specs/ideas/04-encrypted-backup-restore.md)
