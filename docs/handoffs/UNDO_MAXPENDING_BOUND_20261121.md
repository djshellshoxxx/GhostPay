# GhostPay BUG-ONLY handoff — UndoQueue maxPending bounds (2026-11-21)

## Exact source and ownership
- Repository: `djshellshoxxx/GhostPay`; baseline `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned branch: `automation/20261121/bug/undo-maxpending-bound-r2`. Ownership claim committed first: `afa9e292bb9b16ecf68bec13a47d7d394fe533d4`.
- Owned source: `packages/ux-flow/src/undo.ts`; original Git blob `2e261040b9e2d11c0bd482c2622580d5ff41dbe4`, fixed Git blob `0c0858a1a983e77c664332665ac596965b7b128a`.
- New isolated regression: `packages/ux-flow/src/undo.option-bounds.test.ts`, committed first `481a6c1f3e16486bae6c212e86873f9990831cf3`. Production repair committed second `d2d044656866d1b3a01ed64551ab01ba494ae916`.
- No other production code, workflow, package manifest, dependencies, contracts, wallets, release or deployment edits.

## Observed defect
`UndoQueue` is an existing client-side undo-window queue. `maxPending` is used as a positive count to enforce queue capacity, but the constructor tested only `this.maxPending < 1`. JavaScript evaluates that comparison as false for `NaN`, `Infinity`, and `1.5`, admitting invalid options. For `NaN`, `pending >= this.maxPending` also always evaluates false, eliminating the capacity limit.

Node v22.16.0 *source-equivalent guard reproduction* (not a repository source import or a Vitest run) observed: original guard accepted all three malformed options; the original NaN threshold admitted 1,000 synthetic pending items without reaching `QUEUE_FULL`. Corrected guard rejected all three while preserving positive integer options 1, 2, 256 and `Number.MAX_SAFE_INTEGER`. The model was checked against the exact original source condition, but the repository's compiled TypeScript was not executed.

## Minimal change
Added `!Number.isSafeInteger(this.maxPending) ||` before the existing `this.maxPending < 1` option guard. No queue scheduling/state logic changed. The committed regression requires the existing `BAD_OPTION` error on three malformed capacities. A neighboring case preserves one-element capacity exhaustion, cancellation and reuse, and snapshot length.

## Runtime and qualification
- Source-equivalent RED/GREEN run: `node --version` reported `v22.16.0`; 3 malformed option cases accepted before/rejected after; 4 integer control capacities accepted; original NaN cap comparison failed to stop 1,000 synthetic entries.
- **Not run**: repository Vitest, typecheck, lint, full package suites, native browser, Playwright, live wallet/RPC, CI at the final draft PR head. Source-equivalent checks are not a substitute.
- Regression was **committed before the production fix**, but not executed in an installed repo at the intermediate failing commit because a GitHub checkout was not available locally.
- Must check hosted exact-head CI including the `ux-flow` package regression, neighboring queue tests, lint/typecheck and applicable Pages/browser suites; repair only concrete CI failures in this owned branch.
- No independent reviewer was available in this execution; a separate verifier is required, not merely a second self-review.

## Concurrent work and merge gates
- `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, and the original `docs/ai/ACTIVE_WORK.md` read on current main.
- GitHub API returned 166 open PRs across two pages; each open PR's changed filenames were checked against the owned source, existing `undo.test.ts`, and new regression filename. No direct file overlap found. Broad #278/#372 include package manifest but not these owned files. Recheck claims and heads before integration.
- Draft #390 at head `b655bc273a6704c9c140287b8adcdf4085b91882` was rechecked: browser Pages, beta acceptance, hosting and CLI workflows succeeded; numerous long CI jobs were still queued/running, no failures observed, **zero independent reviews**; leave owner's branch unchanged.
- Draft #404 at head `699c8db24451a5ff6c034b1f247c48e6cc0bdd45`: CI largely queued and zero independent reviews; no ownership overlap.
- Integration lock ref `automation/ghostpay-integration-lock`, commit `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, JSON blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`: status **held**, owner `994a0d214fb9-root-r3`, generation 11. Its elapsed timestamp is not authorization to take it over. Do not merge while lock owner/lease is unqualified.
- Gate state: **DRAFT / UNQUALIFIED**. Requires exact-head all-required CI green, native browser verification where applicable, true independent review, conflict/owner reconciliation and legitimate released or acquired integration ownership. No deployment or release.

## Next task
Recheck published PR head and exact SHA-matched CI; amend only concrete failures without weakening assertions. Obtain independent review before requesting coordinator-controlled merge. Continue with a different, currently unowned existing-runtime defect in a later round.
