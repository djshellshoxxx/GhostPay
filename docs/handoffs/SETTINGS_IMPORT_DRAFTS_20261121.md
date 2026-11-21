# Settings partial-import draft preservation — isolated QA checkpoint

Date: 2026-11-21 UTC. Cycle `20261121T0238Z-root`. **Test-only regression implementation committed; unexecuted in repository, not independently verified, not merged.**

## Source and ownership

- Parent: existing `#307` at `5a745d4b5fba69b66a9779f88aefc63c253a4f27` (stacked draft), whose Settings.tsx blob was `05179dfa993616e1cf59f19717a1263d61f6c31e`. Main at discovery: `aec179910c39081d820396409ff3139ff2264132`.
- Isolated branch: `automation/20261121T0238Z/qa/settings-partial-import-drafts`.
- Ownership committed before test edits: `e2c97b1c49f2c4b2d6a1a43bb3db5db951d17685`, in `docs/ai/ACTIVE_WORK.md`.
- New test `apps/web/src/views/Settings.partialImportDrafts.test.tsx`: initial creation `9254136614494fa2da8bc7f8991fb61eb3757493`; complementary RPC-only import case `ab0ac58032e0a6c389c2bf2f0d2d0c122dcaaa0e`; corrected v2 exchange fixture to include enabled chain IDs `63a08e10775450a8a33057007c5a112ffef4a55a`. Final test blob `5a9e21c68feb7279f233bbf1351d1d719f02a26c`.
- The existing Settings source, previous tests, public API, storage format and deployment configuration are unchanged. No other branch is modified.

## Why this matters

Existing audit #312 (`docs/notes/bugcheck-2026-11-19/details/browser-state.md`, finding GP-BUG-04) reproduced a P2 regression in prior integration: importing selected preferences could erase unrelated unsaved RPC form text because an unrelated saved-settings effect reset the entire form. The reviewed #307 Settings source no longer contains that whole-form resync, but this invariant was not expressly protected by its Settings exchange tests.

Two new actual component regression cases exercise real `renderApp` and the existing settings transfer UI:

1. Apply preferences-only theme import while RPC, secondary RPC, optional relayer, and public signer-pin drafts are unsaved. Check that the imported theme applies, drafts remain visible, none are silently persisted by import, and a subsequent explicit Save commits both.
2. Apply an explicitly approved RPC-only import (including trust confirmation) while theme, relayer and signer drafts are unsaved. Check that the imported RPC is shown and persisted, unrelated drafts remain uncommitted, and explicit Save later keeps them.

The second fixture was corrected to pass supported chain IDs explicitly; without them the v2 exchange helper intentionally omits RPC entries. No new product policy, private data, network request, backend, dependency or contract change.

## Actual verification and blockers

- GitHub connected reads verified the #307 Settings source, existing Settings and Settings.exchange component test styles, export-selection signature, the #312 finding, and changed paths for relevant active PRs #278/#293/#307/#349/#350/#336/#345/#352.
- **Not run:** these two new Vitest cases, TypeScript, lint, coverage, browser, complete build or independent review. Local git checkout failed on `Could not resolve host: github.com`. Do not report source inspection or previously hosted runs as this test's pass.
- #307 exact source already has failed [Core CI run 44836230375](https://github.com/djshellshoxxx/GhostPay/actions/runs/44836230375): its web job `136643807136` reports 1 unrelated `Pay.requestFile.test.tsx` failure among 3,086 tests; existing #344 owns that known request-file test repair. Do not duplicate it or imply #307 is merge-ready.
- #307 exact source had successful Integration, Pages, Beta, CLI, Hosting and Tor workflows, but these results predate this test-only branch and do **not** qualify it.
- No native subordinate worker or fresh independent verifier was available. The single coordinator carried out sequential discovery, audit, authoring and self-check.
- Integration lock at `automation/ghostpay-integration-lock/integration-lock.json` is **held**, generation 11, owner `994a0d214fb9-root-r3`, last inspected in this run; expiration alone never authorizes takeover. No lock write or shared integration attempted.
- This branch intentionally adds only a new test and additive handoff to avoid overwriting #278's Settings source/tests or #307's integration ownership. No claim of exhaustive historical branch analysis.

## Next cycle

1. Fetch this exact branch and test blob; run `npm run test -w @ghostpay/web -- src/views/Settings.partialImportDrafts.test.tsx` and the original Settings exchange suite at this combined source. Fix actual failures without weakening assertions. Ensure the new test file is included by the normal CI test pattern.
2. Run full web typecheck/lint and relevant build; check full and lean browser suites, exact-head hosted CI job conclusions, and no deployment step.
3. Ask a **fresh independent** reviewer to confirm the failure mode on the audited older source, current selected-section semantics, normal storage contract, all assertions, and any code integration.
4. Recheck #278/#307/#344 and other claimed paths and fresh branch ancestry. If qualified, hand to the lock-owning coordinator to incorporate as a test-only contribution. Do not merge until lock ownership, independent verification, required gates and no-deployment policy all permit it.

See AGENTS.md, docs/ai/WORKFLOW.md, SECURITY.md, existing #278/#307 handoffs, #312 original audit and current #307/#344 PRs. The maintained `docs/automation/` suite is not present on the inspected main; do not fabricate or overwrite shared ledgers while a different integration coordinator owns the lock.
