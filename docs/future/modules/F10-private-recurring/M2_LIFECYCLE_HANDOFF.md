# F10 M2 — guarded local recurring-plan lifecycle

Date: 2026-11-21 Pacific. Stacked source: consolidation PR #371 at `1de6e0247e0f76afe6f1615b43e55007ece25d9b`.

## What this milestone implements

The previously preview-only F10 module now has pure, strict snapshot transformations:

- `createRecurringPlan` requires a validated **paused** plan and a fresh snapshot revision. No creation action issues an invoice or grants spending authority.
- `transitionRecurringPlan` supports active → paused, paused → active, and active/paused → cancelled with terminal cancellation and fresh plan/snapshot revisions.
- Resume deterministically **skips every unreserved period whose UTC start is at or before resumption time**. The first future period is eligible on a later explicit review. This avoids involuntary catch-up after a long pause and retains the original UTC month anchor.
- `reviseRecurringPlan` only accepts a paused plan. Amount, asset, template and presentation timezone can change with fresh revisions. Anchor/cadence/plan identity cannot silently change; replacing the schedule requires a distinct plan and separately reviewed migration.
- All actions preserve existing outbox references and monotonic issuance cursors. The output is a detached, immutable, strictly revalidated staged snapshot.
- The caller provides a profile identity, expected prior snapshot revision, next snapshot revision and injected clock. A mismatch fails closed. Mutation-context accessors/unknown keys are refused.

This is a **local planning state machine**, not persistence, recovery, an issuance capability or a user-facing feature. The next provider must atomically compare-and-swap an encrypted snapshot under the expected revision. Serializing the return value to normal localStorage without multi-tab coordination is insufficient. No reminder export, wallet call, network request, scheduled browser-close work or integration/deployment is introduced.

## Tests and acceptance

New `lifecycle.test.ts` has 12 test cases with multiple loops and boundaries covering paused creation, duplicate/limit refusal, historical reference preservation, Jan 31 and leap-year clamping, exact-boundary skip, long-offline terminal index, cancellation, revisions, invalid action, stale profile/revision and accessor refusal.

F10-A06 receives a **pure-transition implementation and regression tests**, not final browser/provider acceptance. No claim is made for F10-A04 cross-tab durable idempotency, F10-A07 provider cancellation, F10-A09 reminder export, P04 signing, P05 encrypted storage or production readiness.

## Execution and qualification boundaries

- Test specifications committed before implementation in `55ef03b82c696199d25939da925d7adfd72d7a10`; that is the test-first source checkpoint, **not an executed red-test receipt**.
- The local container can run Node but cannot resolve github.com to clone the full repository; no local Vitest/typecheck/lint/browser replay is claimed here.
- Hosted CI must qualify the final branch head; inspect its actual per-job results and security scans before calling it verified.
- Only one implementing assistant is present; no independent reviewer or separate QA agent is claimed.
- PR #371 carries an external integration ownership hold; this branch does not take or release the lock and must not be merged to main until the base, CI, owner handoff, and reviews qualify.

## Next milestones

1. P05 encrypted, authenticated profile storage with recoverable transactional prepare/commit and multi-tab compare-and-swap; prove crash/reload and stale writer failures.
2. P04 verified invoice-template/artifact binding and explicit one-period durable reservation before issuance; prove failed export does not create a duplicate invoice.
3. Local opt-in reminder preview/export, disabled-feature isolation, locked-state clearance, mobile/keyboard UI, browser/Tor acceptance and final security review.
4. Once #371 has a qualified integration release and the owner has handed off, rebase/retarget this stacked PR and verify on the exact new main.

Source facts and execution receipts take precedence over this handoff if later commits update its branch.
