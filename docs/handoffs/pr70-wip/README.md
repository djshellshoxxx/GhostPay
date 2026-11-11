# PR #70 work in progress (not reviewed clean, not pushed to the PR)

Four commits on top of `claude/ar-a5-announcer-budget` at `d9fe8b4`. They are stored here only so the work survives
container restarts. Do **not** consolidate them: A2 review of `0057683` found two open highs (reorg stop paths clear
the recheck/rescan state; a window-end reorg can skip blocks below `rolledBackTo`, which predates #70). See the run log.

Apply with: `git checkout d9fe8b4 && git am docs/handoffs/pr70-wip/*.patch`
