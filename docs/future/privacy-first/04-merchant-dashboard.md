# FUTURE ONLY — Private local merchant dashboard

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Provide business-ready invoice, payment and ledger management without server-hosted merchant records.

## Proposed user workflow

- Merchant unlocks local encrypted ledger, searches invoices and sees pending/final/refunded states
- Payment rows show source transaction, confirmation policy, fee and outstanding amount
- User deliberately exports selected records for bookkeeping with a disclosure preview

## Future requirements and interfaces

- Encrypt local state and backup metadata; keep aliases/line items out of analytics, localStorage and network logs
- Only verified chain evidence and bound invoices establish paid/final states; unverified announcements remain distinct
- Handle partial payments, duplicate events, reorgs, unknown broadcasts and rescan recovery
- Local export is explicit, bounded and injection-safe for CSV

## Privacy boundary and information that remains observable

- RPC providers may see block/transaction queries without optional private scanning
- Export recipients learn all disclosed books; cloud backups are not automatic
- On-chain amounts, payer addresses and withdrawals remain visible

## Future acceptance and security tests

- Crash/restart/rescan never mark a false final payment or duplicate records
- Encrypted vault, migration and export round-trip tests
- Browser egress tests show no merchant data uploaded automatically

## Dependencies and promotion criteria

Verified scanner, encrypted local store, evidence state machine and backup.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [local-store.md](../../remote/usability/specs/local-store.md)
- [reconciliation.md](../../remote/usability/specs/reconciliation.md)
- [ledger-export.md](../../remote/usability/specs/ledger-export.md)
