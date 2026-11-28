# Handoff: REV-I5 merged; notes on the open journal follow-ups REV-I6 and QA-I1 (2026-11-27)

- Session: Claude session 01KtKj8kHRL9fZ7vjE4teVQN, branch `nodata/tender-mccarthy-a61kj6`.
- Merged by this session: #723 (P14 F1 scan checkpoint ownership, mitigated) as `3603960c`, and #739 (REV-I5) as
  `bc1e1523`. Both under the integration lock, exact-head CI green, main push CI green afterwards. Evidence is in the PR
  bodies; F1 also has `SCAN_CHECKPOINT_OWNERSHIP_20261126.md`.

## REV-I5 (fixed `bc1e1523`)

`sendViaWallet` (`apps/web/src/lib/wallet.ts`) now keeps the begun attempt inside the journal operation. When the provider
was never invoked (the `invoke` authority check threw, QA-5, or the localStorage mirror write failed after the IndexedDB
commit, REV-I5) the record is removed with `removeUnsentAttempt`, which matches id, `unknown` status and action. A refused
duplicate throws before the attempt is kept. A rollback that cannot commit keeps the record, so a retry stays refused.
Tests: the `REV-I5: …` cases in `apps/web/src/lib/walletJournal.adversarial.test.ts`.

## Open follow-ups (need an owner decision; not started)

- **REV-I6, migration headroom.** `MAX_ATTEMPTS = 128` caps both new attempts (`beginAttempt`) and stored or merged
  journals (`parseRaw`, `mergeRecords`, `write`). Two options, each with a cost:
  1. Refuse new attempts at `128 - H` and keep the stored cap at 128. Older open tabs keep working, but users get `H` fewer
     usable records, and a legacy copy with more than `H` distinct records still overflows.
  2. Raise the stored and merge cap, for example to 256, keeping new attempts at 128. Any single legacy merge then fits,
     but an older build's tab that is still open refuses every journal above 128 (fail-closed), and `MAX_BYTES` (100,000)
     would need a matching review.
- **QA-I1, corrupt mirror reset.** Rebuilding the mirror from the IndexedDB snapshot would discard whatever the
  unreadable mirror held. Since QA-4 the snapshot is a union with the mirror, so mirror-only records (an older build's
  writes) can exist, and dropping them could allow a duplicate request for their invoices. A reset therefore needs an
  explicit, informed user confirmation (wording and placement), which is a product decision. Today it fails closed.

Superseded notes: LATE-L1 is fixed in `f4353c2c` (replays only candidates with verified router evidence, avoiding the A5
pin), and LATE-M1 is being redone by another session after the owner approved a presence marker.
