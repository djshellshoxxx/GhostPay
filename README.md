# GhostPay coordinator work claims (atomic registry)

This orphan branch is the shared, atomic ownership record for the concurrent PRIMARY and SECONDARY engineering
coordinators (owner instruction, 2026-11-28). It complements, and does not replace, `docs/ai/ACTIVE_WORK.md` on task
branches and the integration lock `automation/ghostpay-integration-lock`.

## Protocol

1. `git fetch origin automation/ghostpay-work-claims` and read `claims.json`.
2. Before implementing a milestone, add (or update) one entry in `claims.json` and commit on top of the fetched head.
3. Push **without force**: `git push origin HEAD:refs/heads/automation/ghostpay-work-claims`. Git rejects a
   non-fast-forward push, so a concurrent writer's claim is never overwritten (compare-and-swap on the ref). On
   rejection: fetch again, re-read, resolve overlap, and retry. A claim exists only once its push succeeds.
4. Two entries must not hold overlapping `paths` with status `active`. On a simultaneous conflict, PRIMARY has
   precedence; the other coordinator picks independent work.
5. On integration (or abandonment), set the entry's `status` to `released` (or `merged`) with the merge SHA, and push the
   same way. Never delete another coordinator's entry and never take over an entry merely because it looks stalled.
6. Branch prefixes: `primary/` for PRIMARY workers, `secondary/` for SECONDARY workers (where the Git host permits).

`paths` lists the files or hunks the claim may modify. `scope` explains the behaviour owned, so presentation-only
work in the same file (for example tooltips) can coexist with behavioural work when both are declared.
