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
- `runScan` reads the slot once at the start, before its first await, and again before each save. If the slot holds a cursor
  this run neither read nor wrote, the run stops saving for the rest of the run. It keeps scanning and reporting payments.
  Otherwise it saves with `expected` set to what it just read, so its own rollbacks (reorg, claim replay, restart) still apply.
- After its own save the run records what the slot actually holds. A write lost to a full or failing storage is therefore
  retried at the next page, not mistaken for another scan's write.
- Stores that do not round-trip (test doubles that read `undefined`) keep saving as before.

Not changed: what a checkpoint contains, the anchor and reorg checks, `clear`, `Scan.tsx`, and findings F2 to F4.

## Limits

- Web Storage has no cross-tab lock. Each read-compare-write runs in one synchronous step, so two tabs cannot interleave inside
  it in practice, but no browser guarantees this.
- A run that yields keeps the other scan's cursor even when its own observation was newer, for example a payment it saw
  disappear. The other scan's cursor is still anchored to a block hash, so a later reorg is caught at the next resume.

## Evidence

Recorded in the pull request; hosted CI on the exact head is the authority.

## Overlap

#696 (cover lookups) edits other parts of `scanClient.ts`. A trial merge of the two heads conflicts only in
`docs/ai/ACTIVE_WORK.md`; whichever lands second needs a fresh CI run.
