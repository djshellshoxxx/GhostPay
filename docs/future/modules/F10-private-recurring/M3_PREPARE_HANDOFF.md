# F10 M3 — live review to a staged prepared invoice reference

2026-11-21 Pacific. Stacked on M2 PR #391 head `20a353d28e1aac89216ba2e8980000477307bf03`; its upstream dormant consolidation is PR #371.

## Implemented

`RecurringPreparationController` reuses the M1 single-use review controller, and has three methods:

- `preview(snapshot, planId, liveContext)` — registers a live review bound to the profile, session, operation, entire snapshot, abort signal and bounded clock.
- `prepareNext(view, sameSnapshot, sameLiveContext, artifactRef, nextSnapshotRevision)` — consumes a reviewed selection *before* staging an opaque local prepared reference. Only the earliest currently due period is eligible. The prepared reference uses the deterministic plan/period ID, retains the plan revision and advances the saved cursor by one. Full staged-snapshot validation verifies uniqueness, bounds and exact references.
- `cancel()` — revokes pending review before lock, profile change or disposal.

Input snapshots are not mutated. Prior outbox entries and already-recorded plan terms are retained. Calling twice against the same live review is refused. Expiry, rollback, abort, changed session/operation, changed terms/cursor/profile, unsupported or duplicate artifact identifiers, and unavailable due work fail closed.

`prepared` **does not mean the invoice has been signed or authenticated, saved, delivered or paid**. The artifact reference is an opaque local placeholder reserved by the consumer for eventual P04 issuance; the module does not inspect or construct invoice artifacts. Every actual effect requires separate explicit merchant review, the verified P04 provider, and successful durable P05 reservation. There is no wallet/network/notification operation.

## Concurrency and privacy boundaries

This is a pure in-memory transformation, not persistence. Two independent tabs or devices can compute competing prepared snapshots from the same old revision. The future P05 transaction must compare-and-swap the expected encrypted ciphertext/revision, let **one** candidate win, and return a conflict for others. Never sign, export or send before a successful reservation and a renewed live session/fee/asset/identity check.

After a storage failure or ambiguous outcome, reload/decrypt/verify the durable outbox before attempting any further issuance. Do not silently discard a prepared record or derive a new artifact identity for the same period. The original M1 review's single-use property applies only within its live controller.

No automatic re-issue on browser start or when closed. No hosted backend, telemetry, extra SDK or signer permissions are introduced.

## Test-first evidence and qualification

- Test specifications committed in `d332bf20dab99c94eb7989f2f05d228f9c3180c7`, prior to source implementation. This is an ordering checkpoint, not an executed failing-test run.
- Added 11 Vitest cases for single-use review, cursor/historical identity, reload-style replay, duplicated refs, stale terms and revision, abort/session/clock expiry, paused/cancelled/exhausted plans, no ambient network/wallet access, and forged/serialized review nontransferability.
- Local full-repository clone cannot run in this execution environment because the container has no external DNS access. Hosted workflow results and any failures must be checked on the actual final PR SHA before qualification. No independent security reviewer has executed.
- No production route or staging configuration was enabled. Leave the PR draft and stacked; source-only tests do not qualify F10-A04's required browser multi-tab or crash-recovery behavior.

## Next work

P05 encrypted transaction store + restart-safe compare-and-swap + full reference/outbox recovery; P04 typed verified invoice artifacts and explicit reviewed issuance; local reminder export and UI; browser/integration/security testing; ownership handoff and qualified merge. Include multi-tab fault injection with one winning prepared reservation and verify that failed persistence leaves no externally issued invoice.
