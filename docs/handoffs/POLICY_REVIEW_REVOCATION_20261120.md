# GhostPay continuation — GP-BUG-07 review revocation and branch census

Date: 2026-11-20 UTC. Target: browser-only noncustodial Pages beta; this fix itself is confined to the optional, full-profile **experimental PolicyAccount** UI, which is not exposed by the lean Pages build and has no checked-in production deployment pins. No real wallet or network transactions, production contracts, relayer, deployment, release or fee changes.

## Verified input and work product

- Frozen source main: `aec179910c39081d820396409ff3139ff2264132`. Newest merged PRs: [#329](https://github.com/djshellshoxxx/GhostPay/pull/329) at merge `784b445f6bc5c641e8e85d4e28b730e044791f40` (TRON range validation) and [#334](https://github.com/djshellshoxxx/GhostPay/pull/334) at merge `aec179910c39081d820396409ff3139ff2264132` (Bitcoin minimum fee guard).
- Owner: one sequential GitHub-connected engineer; no independent reviewer. Task branch: `automation/20261120/bug/policy-review-revocation-r1`, created at the exact frozen main.
- Claim commit: `32e33f49cc92b5a51c54e9f9a5d5b04dcdbb616a` in `docs/ai/ACTIVE_WORK.md`.
- Test-first commit: `23873ac1d1c76a913aa3cc95258426324e374ce1` adds `PolicyPay.pendingEdit.test.tsx`, adapted from the existing red-case audit fixture in [#312](https://github.com/djshellshoxxx/GhostPay/pull/312) / `docs/notes/bugcheck-2026-11-19/evidence/policy-state.test.tsx.txt`.
- Production correction: `346c9c3e6db53e4d20f66e0b3a8b3e45a07c6d8a`, changing only `PolicyPay.tsx`: a synchronous `useRef` revision invalidates the captured review guard on meta-address, token, amount, re-review and unmount, before a delayed wallet request can proceed. It preserves all existing session/deployment, reviewed-transaction, deadline, allowance, broadcast and duplicate-attempt checks.
- Branch census evidence: `b1ad36353c9e4a1e09474a21aac9178d9ada1b3d` adds `GP_BRANCH_DELTA_411_20261120.json`. The before-work census exhausted GitHub's cursor at 100/100/100/100/11/0; all 411 names were unique, no name missing from the published 392-name baseline. All 19 additions were resolved to exact commit SHAs and compared against frozen main `aec17991`; one is now ancestry-redundant (merged #334), several are evidence/stacked donors, and broad 300-file diffs are explicitly marked truncated. These are path/ancestry classifications, **not** semantic proof of 19 unique features. The present work branch was created after this enumeration.

## Defect and acceptance

Confirmed GP-BUG-07 / MV-02: `PolicyPay` formerly cleared only React's visible review state on user edits, while the async sender retained an older closure whose guard knew nothing of the form revision. A paused `eth_accounts` recheck could resume and submit the old reviewed transaction after the user changed the amount.

The test renders the real experimental Policy view, uses the project's local policy fixture and MockWallet, pauses `eth_accounts` after the send starts, edits the amount from 1000 to 2000, then releases the wallet check. Acceptance: no `eth_sendTransaction` call, with an explicit review-invalidated error. No real chain connection is used.

An operation already *handed to a wallet* cannot be retracted by a browser form edit. The guard is intended to reject before **subsequent** wallet requests, and the existing post-broadcast/approval paths must continue to disclose uncertain or mined outcomes rather than claiming that no action occurred.

## Verification status

**Not qualified.** Source and tests have been committed and inspected, but no repository Vitest, TypeScript, ESLint, browser or hosted CI result was executed/observed at this checkpoint. The local shell could not resolve github.com, so cloning/installing the repository's dependencies and running test commands was unavailable; do not record a passing test from that environment. The earlier auditor's failing reproduction applies to its older source snapshot, not a verified run of this new test on this exact branch.

Next checks: run focused `PolicyPay.pendingEdit.test.tsx` and existing `send.test.ts`, TypeScript, lint and full relevant CI; independently review the exact post-change source; verify native/ERC-20 handoff behavior and no stale approvals or session-restoration bypass.

## Integration and collision constraints

- Broad [#278](https://github.com/djshellshoxxx/GhostPay/pull/278) at `417f7c71daf8645e1432f2ec8f070110879b80bd` also changes `PolicyPay.tsx`, but its inspected head lacks the review-revision guard. Treat as a known overlap, not an automatic merge.
- [#340](https://github.com/djshellshoxxx/GhostPay/pull/340) selected TRON genesis still has failing old-head checks; child [#342](https://github.com/djshellshoxxx/GhostPay/pull/342) at `06fd87c3e90000118ffa94048529db36f0a67d41` passed Pages, Hosting and beta workflows, while full CI remained queued at last inspection. Do not merge the parent or child without full source qualification.
- [#332](https://github.com/djshellshoxxx/GhostPay/pull/332) and stacked [#335](https://github.com/djshellshoxxx/GhostPay/pull/335) overlap in receipt identity. [#344](https://github.com/djshellshoxxx/GhostPay/pull/344) adds a child request-file test correction. Compare incremental patches, not their inherited branch histories.
- [#328](https://github.com/djshellshoxxx/GhostPay/pull/328), [#337](https://github.com/djshellshoxxx/GhostPay/pull/337), [#338](https://github.com/djshellshoxxx/GhostPay/pull/338) and [#339](https://github.com/djshellshoxxx/GhostPay/pull/339) had queued or overlapping CI checks during this inspection. A mergeable boolean or successful supporting workflow does not replace exact-head qualification and independent review.
- Before any integration, refresh main, compare the exact branch/PR source, reconcile active ownership and the repository integration lock, rerun relevant tests, and preserve noncustodial key recovery, privacy consent, static hosting and custody protections.

No main merge or deployment is authorized by this handoff.
