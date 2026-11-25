# POS session record bound — BUG ONLY (2026-11-25 UTC)

Base main `f18e8c0c949459f6ecbe8d2c6d71ea208a6d160f` (merged #638 POS lifecycle). Scope: existing static POS session persistence only, no changes to payment acceptance, reducer, storage schema, dependencies, real funds, deployment or release.

## Evidence and root cause

The strict feed parser admits 128-character report IDs; the queue retains up to 64. With synthetic cumulative reports for a valid awaiting sale and a 128-character invoice ID, serializeSession writes 8,552 characters after 63 reports and 8,683 after 64. readRecord rejects anything above 8,192 before JSON parsing. Reload discards the sale and its recorded partial amount (64 minor units becomes zero). This contradicts the documented sessionStorage recovery behavior and loses the in-tab record; no real payment, actual funds loss or native browser reproduction claimed.

The one-constant fix raises the cap to 9,216 code units: room for 64 x (128 + 3 JSON framing) = 8,384 plus bounded invoice ID, amounts, session ID, deadline and field names. Existing structural checks, ID bounds, report count bound, amount validation and bearer-link omission unchanged. Not an unbounded parser.

## Commits and executable evidence

- Ownership claim `680a69142720110da84c76eade45f7888b4616f8`.
- Test-first commit `f2fd7845600b7886dce68856de971bb4446cf5c3`.
- Repair `31610ab98bb9f3b6fd3cbcf10c9772083b520883`.
- Recomputed Git SHA-1 blob hashes match original session `f92ff44e20040141859cb3505502bc8aa50af630`, unchanged reducer `f27ae58949caa2ea3d6e16d0f1f3da8b9c1864b8`, repaired session `bb25e606fbf545b2fcefb5ea63f9bd94001cfca9`, committed regression `e15a504930ff760fbb4a44697260e33defa19bf6`.
- Executed production reducer, feed, serialization and restore functions in V8 with only module import/export removal. Independently replayed actual added test bodies and open fixture with an assertion shim and synthetic URL/TextEncoder shim for the fixed ASCII fixture URL (not a browser or full native Node test). Before: 2/5 pass (1,60), 3 fail (63,64,74) with expected restored/actual discarded. After: 5/5, including replay recognition, exact amount, full retained window and no bearer link. Five neighboring existing test bodies passed: closed/idle storage, expired restore, rollback, unusable clock, malformed/tampered record rejection (including oversized). Actual production reducer-based replay independently confirmed before/after behavior. No native full suite claimed.
- Local Node 22.16.0 available, but git ls-remote fails DNS for github.com; no full checkout, native package/node:test suite, build or browser run here. Hosted CI must execute the actual unchanged session.test.mjs invocation.

## Coordination and gates

Read exact main AGENTS.md, WORKFLOW.md, HANDOFF.md and ACTIVE_WORK.md. All 257 discovered open PR changed-file lists checked in date partitions; no overlapping pos-session.js/session.test.mjs owners at discovery. #638 merged, older POS owners' paths and donor refs unchanged. Rechecked main and latest open-PR inventory before publication. Generation 21 integration lock released at `e6865193bfdd9a0c2dd89bb15d92b8521adce3a8`; not acquired. Leave draft pending exact-head required hosted CI including native POS tests and applicable browser scenarios, independent review (none available here), fresh ownership/dependency checks and legitimate integration lease. Do not merge on isolated test evidence alone.

#390 merged at `377c0216d451f1576f199ec0223aafadd9243002`, original head `b655bc273a6704c9c140287b8adcdf4085b91882`: all five workflows success; Snyk success; 32 jobs successful and 3 skipped. No submitted review found. No changes to its branch.
#637 exact head `02d6a800e99d75e65a8f026523f1d603d341f809` now has CI failure, job 138956020844: 3289 passed, 1 skipped, unhandled ReferenceError window is not defined at WalletAttempts.tsx:104 from WalletAttempts.status.test.tsx, matching existing fixture correction #595. Four other workflows successful. Do not weaken or duplicate the existing fixture owner; retain draft pending dependency and fresh qualification.
