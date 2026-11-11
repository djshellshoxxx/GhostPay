# PR #70 work in progress (not reviewed clean, not pushed to the PR)

Five commits on top of `claude/ar-a5-announcer-budget` at `d9fe8b4`. They are stored here only so the work survives
container restarts. Do **not** consolidate them: A2 review of `0057683` found two open highs (reorg stop paths clear
the recheck/rescan state; a window-end reorg can skip blocks below `rolledBackTo`, which predates #70). See the run log.

Round 5 (`8d54d13`, patch 0005) fixed both highs: reorg stops now save an anchor-less checkpoint instead of
clearing, and stops never move the cursor above the page start. Both isolated reviewers then found one regression
introduced by that save: it can move the stored checkpoint FORWARD past the finality tail an earlier save of the same
run held back, with no anchor (before, `clear()` failed closed). A reviewer-validated fix: track the last persisted
`nextBlock` (`storedNext`, from `p.cursor.nextBlock`, updated on every save) and save the reorg stop at
`min(pageFrom, storedNext)`. Open lows: `countKnown` guard, `res.recheckOverflow` on stop saves, `stored` update after
a normal save, the `carriedRecheck` filter, and stale-anchor and resume-copy wording. Not applied, per the run's
five-round limit; the owner decides.

Apply with: `git checkout d9fe8b4 && git am docs/handoffs/pr70-wip/*.patch`
