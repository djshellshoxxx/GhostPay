# Handoff: scan checkpoint ownership (P14 finding F1), 2026-11-26

- Branch: `nodata/tender-mccarthy-a61kj6`, base main `601f2095`.
- Source finding: F1 in [the privacy evidence matrix](../research/privacy-evidence-matrix-2026-11-10.md), recorded by #658 with two
  `it.fails` regressions in `apps/web/src/lib/scanClient.checkpoint.test.ts`.

## Defect

`runScan` saved every page's checkpoint blindly, and `localCheckpointStore.save` was last-writer-wins. Two scans of the same
keys (two tabs, or an older run that finishes after a newer one) could therefore replace a newer checkpoint with an older one.
The next scan then re-read ranges it had already covered: more RPC reads of the seller's scan position, never a skipped block.

## Change

- `CheckpointStore.save(chainId, keyId, cursor, expected?)`. Without `expected` a save is forward-only. With `expected` (the
  cursor the writer last read or wrote, `null` for none) it is a compare-and-swap. An unparsable stored value counts as empty.
- `runScan` takes its initial ownership from `checkpointSeen`, the checkpoint the caller chose `cursor` against. `Scan.tsx`
  passes the checkpoint its render showed, so a write or clear by another tab during the view's async setup (RPC, manifest
  and vault checks before `runScan` starts) is foreign to the run. Without `checkpointSeen` the run reads the slot at
  entry, before its first await. It reads the slot again before each save. If the slot holds a cursor
  this run neither read nor wrote, or another scan cleared it, the run stops writing the checkpoint for the rest of the run.
  Only the write stops: anchors are still corroborated, every page still reaches `onPageMatches` (the durable invoice
  record) and every match is reported. Otherwise it saves with `expected` set to what it just read, so its own rollbacks
  (reorg, claim replay, restart) still apply.
- After its own save the run keeps ownership of the saved cursor, or of the unchanged one when the write was lost to a full
  or failing storage (retried at the next page). Anything else is another writer's, and the run yields.
- Stores that do not round-trip (test doubles that read `undefined`) keep saving as before.

Not changed: what a checkpoint contains, the anchor and reorg checks, `clear`, and findings F2 to F4. `Scan.tsx` only
passes `checkpointSeen`.

## Limits

- **Not a cross-tab atomic compare-and-swap.** Within one document the read, compare and write run in one synchronous step.
  Across tabs, Web Storage offers no lock, and a write made in another tab can reach this tab's view of localStorage later
  (browsers propagate it asynchronously). A stale run can therefore still read an outdated value, pass the compare and
  overwrite a newer cursor that another tab wrote just before. This residual race is narrower than before but not closed.
  Its effect is the original F1 effect: a later rescan of ranges already covered, never a skipped block.
- The tests model tabs as several stores over one in-memory Storage in one process. They prove the write rules and the
  ownership logic, not cross-tab atomicity. Strong cross-tab exclusion would need a shared serialization mechanism (for
  example an IndexedDB transaction or Web Locks together with a store whose reads see the other tab's write) and real
  concurrent browser qualification. Neither is claimed or done here.
- A run that yields keeps the other scan's cursor even when its own observation was newer, for example a payment it saw
  disappear. The other scan's cursor is still anchored to a block hash, so a later reorg is caught at the next resume.

## Independent review (AI-assisted, not an audit)

A separate subagent reviewed `05f6f06a` and found no skipped-block or liveness defect. Its findings and outcomes:

- Major, fixed in the follow-up commit: a foreign clear was silently overridden. The run now yields to it.
- Raised as minor, treated as a defect after verification (`scanClient.ts` gates `onPageMatches` on the same flag): the yield reused `canSaveCheckpoint`, which also gates `onPageMatches`, so a yielded run
  stopped recording invoice observations. Fixed with a separate flag that gates only the write.
- Minor, fixed: after its own save the run adopted whatever the slot held. It now adopts only the saved or unchanged cursor.
- Minor, documented and not changed: `expected` is optional, so a wrapper that drops it type-checks and turns rewinds into
  refused forward-only saves. Production passes `localCheckpointStore` directly; the interface comment now says wrappers
  must forward it. Making it required would change every store call site and the owner-written F1 regression.
- Nit, accepted: a read failure right after a successful write makes the run yield (safe direction: a later rescan).

A later owner-account consolidation review of `d04036ed` (PR comment) found that `runScan` took ownership from a fresh
read at entry, not from the checkpoint `Scan.tsx` resumed after its async setup, and that the docs overstated cross-tab
atomicity. Both are addressed: `checkpointSeen` (with view-level and run-level regressions) and the Limits above.

## Evidence

Recorded in the pull request; hosted CI on the exact head is the authority.

## Overlap

#696 (cover lookups) edits other parts of `scanClient.ts`. A trial merge of the two heads conflicts only in
`docs/ai/ACTIVE_WORK.md`; whichever lands second needs a fresh CI run.
